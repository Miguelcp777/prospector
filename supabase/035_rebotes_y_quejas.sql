-- ============================================================
-- Prospector · 035 · ingesta de rebotes y quejas
--
-- Es lo que `docs/decisiones/0004-quien-es-el-remitente.md` señala como lo
-- único que de verdad falta antes de poder enviar:
--
--   «Lo que falta antes del envío no es la pantalla de configuración. Es la
--    ingesta de rebotes y quejas. Sin webhooks del ESP volcándolos solos, la
--    lista no se mantiene, se sigue escribiendo a direcciones muertas y la
--    reputación se hunde por su propio peso en semanas.»
--
-- El esquema ya aguantaba: `suppressions` distingue supresión por tenant de
-- global desde el principio. Lo que faltaba era quien la rellenara.
--
-- La parte de red está en `functions/correo-webhook`, que verifica la firma
-- del proveedor antes de llamar aquí. Sin esa firma, esto sería un botón
-- público para suprimir la dirección de cualquiera.
--
-- Ejecutar DESPUÉS de 034_historico_de_conexiones_y_correo.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El identificador del proveedor
--
-- Al aceptar un envío, el ESP devuelve su propio id. Sin guardarlo, un
-- evento de rebote llega con ese id y no hay forma de atarlo al mensaje que
-- lo provocó: se sabría que una dirección rebotó, pero no de qué campaña.
-- ------------------------------------------------------------
alter table messages add column if not exists proveedor_id text;
create index if not exists messages_proveedor on messages (proveedor_id)
  where proveedor_id is not null;

-- ------------------------------------------------------------
-- 2 · El registro crudo
--
-- Se guarda lo que dice el proveedor tal cual, además de la consecuencia.
-- Cuando dentro de tres meses alguien pregunte por qué una dirección está
-- suprimida, la respuesta tiene que ser el evento que lo causó y no una
-- deducción.
--
-- `unique (proveedor, evento_id)` es lo que hace idempotente el reintento:
-- los proveedores reenvían hasta recibir un 2xx, así que el mismo rebote
-- llega varias veces.
-- ------------------------------------------------------------
create table if not exists eventos_correo (
  id          uuid primary key default gen_random_uuid(),
  proveedor   text not null,
  evento_id   text not null,
  tipo        text not null,
  email       text,
  proveedor_mensaje_id text,
  message_id  uuid references messages(id) on delete set null,
  tenant_id   uuid references tenants(id) on delete cascade,
  carga       jsonb not null default '{}'::jsonb,
  recibido_en timestamptz not null default now(),
  unique (proveedor, evento_id)
);
create index if not exists eventos_correo_tenant on eventos_correo(tenant_id, recibido_en desc);
create index if not exists eventos_correo_tipo   on eventos_correo(tipo, recibido_en desc);

alter table eventos_correo enable row level security;

drop policy if exists eventos_correo_del_tenant on eventos_correo;
create policy eventos_correo_del_tenant on eventos_correo
  for select using (tenant_id = auth_tenant_id());

-- Escribe solo el webhook, con service_role.
revoke insert, update, delete on eventos_correo from authenticated, anon;

-- ------------------------------------------------------------
-- 3 · Registrar un evento y aplicar su consecuencia
--
-- Devuelve si el evento era nuevo, para que el webhook pueda responder 2xx
-- a un reintento sin volver a hacer nada.
-- ------------------------------------------------------------
create or replace function registrar_evento_correo(
  p_proveedor  text,
  p_evento_id  text,
  p_tipo       text,
  p_email      text,
  p_mensaje_id text default null,
  p_carga      jsonb default '{}'::jsonb
)
returns table (nuevo boolean, suprimido boolean, motivo text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_msg    uuid;
  v_tenant uuid;
  v_motivo text;
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_ins    uuid;
begin
  -- Primero por el id del proveedor, que es exacto. Si no cuadra —un envío
  -- anterior a esta migración, u otro proveedor— se cae al correo, que es
  -- aproximado pero suficiente para saber de quién era.
  select m.id, m.tenant_id into v_msg, v_tenant
    from messages m where m.proveedor_id = p_mensaje_id limit 1;

  if v_tenant is null and v_email <> '' then
    select m.tenant_id into v_tenant from messages m
     where lower(m.email_destino) = v_email
     order by m.enviado_en desc nulls last limit 1;
  end if;

  insert into eventos_correo (proveedor, evento_id, tipo, email,
                              proveedor_mensaje_id, message_id, tenant_id, carga)
  values (p_proveedor, p_evento_id, p_tipo, nullif(v_email, ''),
          p_mensaje_id, v_msg, v_tenant, coalesce(p_carga, '{}'::jsonb))
  on conflict (proveedor, evento_id) do nothing
  returning id into v_ins;

  -- Ya lo habíamos visto: nada que hacer, pero el webhook debe responder
  -- 2xx igualmente o el proveedor seguirá reintentando para siempre.
  if v_ins is null then
    return query select false, false, null::text;
    return;
  end if;

  v_motivo := case
    when p_tipo in ('bounced','bounce','hard_bounce','email.bounced')      then 'rebote'
    when p_tipo in ('complained','complaint','spam','email.complained')    then 'queja'
    when p_tipo in ('unsubscribed','email.unsubscribed')                   then 'baja'
  end;

  if p_tipo in ('delivered','email.delivered') and v_msg is not null then
    update messages set estado = 'enviado' where id = v_msg and estado = 'borrador';
  end if;

  if p_tipo in ('opened','email.opened') and v_msg is not null then
    update messages set estado = 'abierto' where id = v_msg and estado in ('enviado');
  end if;

  if v_motivo is null or v_email = '' then
    return query select true, false, null::text;
    return;
  end if;

  -- GLOBAL, no por tenant. Una dirección que rebota está muerta para todo
  -- el mundo, y una queja respetada solo en un cliente vuelve a llegar
  -- desde otro — que es exactamente lo que denuncia quien se queja.
  insert into suppressions (tenant_id, email, motivo)
  values (null, v_email, v_motivo)
  on conflict (coalesce(tenant_id::text, 'global'), lower(email)) do nothing;

  if v_msg is not null and v_motivo = 'rebote' then
    update messages set estado = 'rebotado' where id = v_msg;
  end if;

  return query select true, true, v_motivo;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · Qué está pasando con el correo, para el panel
-- ------------------------------------------------------------
create or replace function panel_correo_eventos(p_dias int default 30)
returns table (tipo text, veces bigint, ultimo timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  return query
  select e.tipo, count(*), max(e.recibido_en)
    from eventos_correo e
   where e.recibido_en > now() - make_interval(days => p_dias)
   group by e.tipo order by 2 desc;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Permisos
--
-- `registrar_evento_correo` escribe supresiones y cambia estados de
-- mensajes de cualquier tenant. Concederla a `authenticated` sería dar a
-- cualquiera con la clave del navegador la capacidad de suprimir las
-- direcciones de otro cliente, o de marcar como entregado lo que no salió.
-- ------------------------------------------------------------
revoke execute on function registrar_evento_correo(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function registrar_evento_correo(text, text, text, text, text, jsonb)
  to service_role;

revoke execute on function panel_correo_eventos(int) from public, anon;
grant  execute on function panel_correo_eventos(int) to authenticated;
