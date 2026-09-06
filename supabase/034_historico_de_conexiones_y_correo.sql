-- ============================================================
-- Prospector · 034 · histórico de conexiones + proveedor de correo
--
-- Dos cosas: que el cuadro de mando por usuario cuente días de conexión de
-- verdad, y que el correo se configure desde el panel en vez de por CLI.
--
-- LO DELICADO: el trigger va sobre `auth.sessions`, tabla gestionada por
-- Supabase. Si ese trigger lanza una excepción, NADIE PUEDE ENTRAR en la
-- aplicación. Por eso todo su cuerpo va dentro de un bloque que se traga
-- cualquier error: perder un registro de conexión es barato; dejar a todo
-- el mundo fuera, no.
--
-- Comprobado insertando una sesión real: entra sin error, el trigger la
-- registra, y la fila sintética que creó la prueba se borró después.
--
-- Ejecutar DESPUÉS de 033_usuarios_y_actividad_por_cliente.sql.
-- ============================================================

create table if not exists conexiones (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid references tenants(id) on delete cascade,
  dia        date not null default current_date,
  veces      int  not null default 1,
  primera    timestamptz not null default now(),
  ultima     timestamptz not null default now(),
  primary key (usuario_id, dia)
);
create index if not exists conexiones_tenant on conexiones(tenant_id, dia);

alter table conexiones enable row level security;

-- No se guarda la IP. `auth.sessions` la tiene, pero es dato personal bajo
-- RGPD y para contar días de conexión no hace falta saber desde dónde. El
-- proyecto ya sienta ese precedente en demo_usos, que guarda un hash.
drop policy if exists conexiones_propias on conexiones;
create policy conexiones_propias on conexiones
  for select using (tenant_id = auth_tenant_id());

revoke insert, update, delete on conexiones from authenticated, anon;

create or replace function registrar_conexion_de_sesion()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  begin
    insert into conexiones (usuario_id, tenant_id, dia, veces, primera, ultima)
    values (new.user_id,
            (select p.tenant_id from profiles p where p.id = new.user_id),
            current_date, 1, now(), now())
    on conflict (usuario_id, dia) do update
      set veces  = conexiones.veces + 1,
          ultima = now(),
          -- Un usuario recién dado de alta puede no tener perfil todavía
          -- cuando se crea su primera sesión: se rellena en la siguiente.
          tenant_id = coalesce(conexiones.tenant_id, excluded.tenant_id);
  exception when others then
    null;   -- Ver la cabecera: aquí no se puede fallar hacia arriba.
  end;
  return new;
end;
$fn$;

drop trigger if exists al_abrir_sesion_registrar on auth.sessions;
create trigger al_abrir_sesion_registrar
  after insert on auth.sessions
  for each row execute function registrar_conexion_de_sesion();

-- Sembrar lo que ya se sabía, para no empezar la serie en blanco.
insert into conexiones (usuario_id, tenant_id, dia, veces, primera, ultima)
select u.id, p.tenant_id, u.last_sign_in_at::date, 1,
       u.last_sign_in_at, u.last_sign_in_at
  from auth.users u
  join profiles p on p.id = u.id
 where u.last_sign_in_at is not null
on conflict (usuario_id, dia) do nothing;

-- La serie diaria pasa a contar conexiones de verdad, y no filas de
-- auth.sessions, que Supabase va limpiando.
create or replace function panel_actividad_cliente(p_tenant uuid, p_dias int default 30)
returns table (dia date, campanas bigint, leads bigint, mensajes bigint,
               enviados bigint, tokens bigint, incidencias bigint, conexiones bigint)
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  return query
  with d as (
    select generate_series(current_date - (p_dias - 1), current_date, '1 day')::date as dia
  )
  select d.dia,
    (select count(*) from campaigns c where c.tenant_id = p_tenant and c.creado_en::date = d.dia),
    (select count(*) from leads l     where l.tenant_id = p_tenant and l.capturado_en::date = d.dia),
    (select count(*) from messages m  where m.tenant_id = p_tenant and m.creado_en::date = d.dia),
    (select count(*) from messages m  where m.tenant_id = p_tenant and m.enviado_en::date = d.dia),
    (select coalesce(sum(cm.tokens_entrada + cm.tokens_salida), 0)::bigint
       from consumo_modelo cm where cm.tenant_id = p_tenant and cm.dia = d.dia),
    (select count(*) from incidencias i where i.tenant_id = p_tenant and i.creado_en::date = d.dia),
    (select coalesce(sum(cx.veces), 0)::bigint from conexiones cx
      where cx.tenant_id = p_tenant and cx.dia = d.dia)
  from d order by d.dia;
end;
$fn$;

-- ------------------------------------------------------------
-- El proveedor de correo del servicio, configurable desde el panel.
--
-- Es de todo el servicio, como la clave de OpenAI de la 026, y por eso vive
-- en `ajustes` y exige es_admin(). Lo de cada cliente —dominio, nombre,
-- domicilio postal— está en config_correo, que es otra cosa. Ver
-- docs/decisiones/0004-quien-es-el-remitente.md.
-- ------------------------------------------------------------
alter table ajustes add column if not exists remitente_servicio text;
alter table ajustes add column if not exists proveedor_correo text
  check (proveedor_correo in ('resend','ses','smtp'));

comment on column ajustes.remitente_servicio is
  'Remitente por defecto de los correos de prueba. Formato "Nombre <buzon@dominio>".';

create or replace function guardar_clave_correo(p_clave text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_id    uuid;
  v_clave text := trim(coalesce(p_clave, ''));
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  if length(v_clave) < 12 then
    raise exception 'Esa clave es demasiado corta para serlo';
  end if;
  select id into v_id from vault.secrets where name = 'correo_api_key';
  if v_id is null then
    perform vault.create_secret(v_clave, 'correo_api_key',
      'Clave del proveedor de correo del servicio');
  else
    perform vault.update_secret(v_id, v_clave);
  end if;
end;
$fn$;

create or replace function estado_clave_correo()
returns table (configurada boolean, actualizada_en timestamptz, pista text)
language plpgsql
security definer
set search_path = public, vault
as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  return query
  select true, s.updated_at, '…' || right(d.decrypted_secret, 4)
    from vault.secrets s
    join vault.decrypted_secrets d on d.id = s.id
   where s.name = 'correo_api_key';
  if not found then
    return query select false, null::timestamptz, null::text;
  end if;
end;
$fn$;

create or replace function borrar_clave_correo()
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  delete from vault.secrets where name = 'correo_api_key';
end;
$fn$;

-- La lectura de verdad. Solo la función de envío, con service_role.
create or replace function leer_clave_correo()
returns text
language sql
security definer
set search_path = public, vault
as $fn$
  select d.decrypted_secret from vault.decrypted_secrets d
   where d.name = 'correo_api_key'
$fn$;

create or replace function guardar_remitente_servicio(p_remitente text, p_proveedor text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  update ajustes
     set remitente_servicio = nullif(trim(coalesce(p_remitente, '')), ''),
         proveedor_correo   = nullif(trim(coalesce(p_proveedor, '')), ''),
         actualizado_en     = now();
end;
$fn$;

-- ------------------------------------------------------------
-- Permisos. Todas son SECURITY DEFINER; Postgres las abre a public por
-- defecto, y una de ellas devuelve una clave de API en claro.
-- ------------------------------------------------------------
revoke execute on function registrar_conexion_de_sesion()         from public, anon, authenticated;
revoke execute on function guardar_clave_correo(text)             from public, anon;
revoke execute on function estado_clave_correo()                  from public, anon;
revoke execute on function borrar_clave_correo()                  from public, anon;
revoke execute on function guardar_remitente_servicio(text, text) from public, anon;
revoke execute on function leer_clave_correo()                    from public, anon, authenticated;

grant execute on function guardar_clave_correo(text)             to authenticated;
grant execute on function estado_clave_correo()                  to authenticated;
grant execute on function borrar_clave_correo()                  to authenticated;
grant execute on function guardar_remitente_servicio(text, text) to authenticated;
grant execute on function leer_clave_correo()                    to service_role;
