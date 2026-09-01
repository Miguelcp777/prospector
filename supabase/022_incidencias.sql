-- ============================================================
-- Prospector · 022 · registro de incidencias
--
-- Hoy un fallo se ve una vez, en rojo, encima de un formulario, y desaparece
-- al recargar. Cuando llega el aviso —"no me deja inferir"— no queda rastro
-- de qué pasó ni de cuándo empezó.
--
-- El caso que motivó esta tabla: la inferencia devolvía 502 con un mensaje
-- genérico. El motivo real era que Anthropic había agotado el saldo, y lo
-- devuelve como `400 invalid_request_error`, que parece una petición mal
-- formada. Averiguarlo exigió mirar los logs del proveedor — que ese día
-- estaban caídos— y desplegar la función dos veces para que dijera lo que
-- ya sabía.
--
-- Ejecutar DESPUÉS de 021_alta_con_google.sql.
-- ============================================================

create table if not exists incidencias (
  id           uuid primary key default gen_random_uuid(),

  -- Nulo a propósito: la demo pública y los fallos anteriores a la sesión
  -- no tienen tenant, y son precisamente los que nadie ve nunca.
  tenant_id    uuid references tenants(id) on delete cascade,

  origen       text not null,          -- 'infer-segments', 'descubrir', 'frontend'…
  operacion    text,                   -- lo que intentaba el usuario, en su idioma

  -- Firma estable del fallo. Es lo que agrupa: sin ella, un bucle de
  -- reintentos escribe mil filas iguales y la pantalla deja de servir.
  codigo       text not null,
  mensaje      text not null,          -- el texto tal cual, para leerlo
  detalle      jsonb not null default '{}'::jsonb,

  estado       text not null default 'abierta'
               check (estado in ('abierta','resuelta','ignorada')),

  veces        int not null default 1,
  primera_en   timestamptz not null default now(),
  ultima_en    timestamptz not null default now()
);

-- Una fila por (quién, dónde, qué), y un contador. El coalesce mete las
-- incidencias sin tenant en un cubo propio en vez de dejarlas sin agrupar.
create unique index if not exists incidencias_firma
  on incidencias (coalesce(tenant_id::text, 'sin-tenant'), origen, codigo);

create index if not exists incidencias_recientes
  on incidencias (tenant_id, ultima_en desc);

alter table incidencias enable row level security;

-- Solo lectura de lo propio. Escribir es cosa de registrar_incidencia, que
-- comprueba el tenant por su cuenta.
drop policy if exists incidencias_lectura on incidencias;
create policy incidencias_lectura on incidencias
  for select using (tenant_id = auth_tenant_id());

-- Y cerrarlas: es la única transición que hace el usuario.
drop policy if exists incidencias_cierre on incidencias;
create policy incidencias_cierre on incidencias
  for update using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

revoke update on incidencias from anon, authenticated;
grant  update (estado) on incidencias to authenticated;
revoke insert, delete, truncate on incidencias from anon, authenticated;

-- ------------------------------------------------------------
-- Registrar una incidencia
--
-- SECURITY DEFINER porque también la llaman las Edge Functions públicas
-- —la demo no tiene sesión— y porque el INSERT está revocado arriba: se
-- entra por aquí o no se entra.
--
-- Se pasa el tenant explícito en vez de deducirlo siempre de la sesión: el
-- worker corre con service_role y no tiene auth.uid(). Cuando quien llama
-- está autenticado, su tenant manda sobre lo que diga el parámetro, para
-- que nadie escriba incidencias en la ficha de otro.
-- ------------------------------------------------------------
create or replace function registrar_incidencia(
  p_origen    text,
  p_codigo    text,
  p_mensaje   text,
  p_operacion text default null,
  p_detalle   jsonb default '{}'::jsonb,
  p_tenant    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  -- Si hay sesión, la sesión manda. Si no, lo que diga quien llama.
  v_tenant := coalesce(auth_tenant_id(), p_tenant);

  if p_origen is null or p_codigo is null or p_mensaje is null then
    raise exception 'Faltan datos de la incidencia';
  end if;

  insert into incidencias (tenant_id, origen, operacion, codigo, mensaje, detalle)
  values (v_tenant, left(p_origen, 60), left(p_operacion, 120),
          left(p_codigo, 80), left(p_mensaje, 2000), coalesce(p_detalle, '{}'::jsonb))
  on conflict (coalesce(tenant_id::text, 'sin-tenant'), origen, codigo)
  do update set
    veces      = incidencias.veces + 1,
    ultima_en  = now(),
    -- El mensaje se refresca: el último es el que describe lo que pasa
    -- ahora, y una incidencia cerrada que vuelve tiene que reabrirse.
    mensaje    = excluded.mensaje,
    detalle    = excluded.detalle,
    estado     = case when incidencias.estado = 'resuelta' then 'abierta'
                      else incidencias.estado end
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke execute on function registrar_incidencia(text,text,text,text,jsonb,uuid)
  from public;
grant  execute on function registrar_incidencia(text,text,text,text,jsonb,uuid)
  to anon, authenticated, service_role;
