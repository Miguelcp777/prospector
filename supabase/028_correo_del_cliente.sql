-- ============================================================
-- Prospector · 028 · configuración de correo, una por cliente
--
-- Implementa lo decidido en docs/decisiones/0004-quien-es-el-remitente.md:
-- enviamos nosotros desde el dominio autenticado del cliente (modo
-- 'gestionado'), y quien ya tenga su ESP puede traerlo (modo 'propio').
--
-- Ojo con la diferencia respecto a la 026: aquella guarda UNA clave de
-- OpenAI para todo el servicio, y por eso sus funciones exigen es_admin().
-- Esto es al revés: una fila por tenant, y cada cliente edita la suya. El
-- aislamiento lo hace la RLS, no una comprobación de rol.
--
-- Ejecutar DESPUÉS de 027_plantilla_en_los_mensajes.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La identidad del remitente
--
-- Casi todo esto no es preferencia, es obligación. `docs/compliance.md`
-- exige identificación clara e inequívoca del remitente en cada envío, y
-- hoy el pie de las plantillas se rellena con cadenas vacías porque no hay
-- de dónde sacarlo. Aquí es de donde saldrá.
-- ------------------------------------------------------------
create table if not exists config_correo (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null unique references tenants(id) on delete cascade
                 default auth_tenant_id(),

  modo           text not null default 'gestionado'
                 check (modo in ('gestionado','propio')),

  -- Quién firma. `buzon` es la parte de delante de la arroba y `dominio` la
  -- de detrás, separados porque el dominio es lo que hay que verificar y el
  -- buzón se cambia sin volver a tocar el DNS.
  nombre_remitente text,
  buzon            text,
  dominio          text,
  responder_a      text,

  -- Las dos que pide la ley y hoy van en blanco en el pie del correo.
  direccion_postal text,
  url_privacidad   text,

  -- Solo con modo 'propio'. La credencial NO va aquí: va al Vault.
  proveedor      text check (proveedor in ('resend','ses','smtp')),

  estado_dominio text not null default 'sin_verificar'
                 check (estado_dominio in ('sin_verificar','pendiente_dns','verificado','fallo')),
  -- Los registros que el ESP dice que hay que poner. Los rellena él cuando
  -- se dé de alta el dominio; hasta entonces, vacío.
  registros_dns  jsonb not null default '[]'::jsonb,
  detalle        text,
  verificado_en  timestamptz,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists config_correo_tenant on config_correo(tenant_id);

alter table config_correo enable row level security;

drop policy if exists config_correo_del_tenant on config_correo;
create policy config_correo_del_tenant on config_correo
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- El estado del dominio no lo decide el cliente: lo decide el ESP cuando
-- comprueba los DNS. Dejarlo escribible sería dejar que alguien se marcara
-- como verificado y empezara a enviar sin haber puesto nada.
revoke update on config_correo from authenticated, anon;
grant  update (modo, nombre_remitente, buzon, dominio, responder_a,
               direccion_postal, url_privacidad, proveedor)
  on config_correo to authenticated;

-- ------------------------------------------------------------
-- 2 · Qué falta para poder enviar
--
-- El orden de docs/decisiones/0004, en SQL, para que la pantalla no tenga
-- que reimplementarlo y para que no se pueda "casi" enviar.
--
-- security_invoker: sin él la vista corre como su dueño, que tiene
-- BYPASSRLS, y cualquiera con la anon key vería la configuración de todos.
-- ------------------------------------------------------------
create or replace view v_preparado_para_enviar
with (security_invoker = on) as
  select c.tenant_id,
         c.modo,
         c.estado_dominio,
         -- La identidad completa es lo que hace legal el pie del correo.
         (coalesce(nullif(trim(c.nombre_remitente), ''), null) is not null
          and coalesce(nullif(trim(c.buzon), ''), null)  is not null
          and coalesce(nullif(trim(c.dominio), ''), null) is not null
          and coalesce(nullif(trim(c.direccion_postal), ''), null) is not null)
                                              as identidad_completa,
         (c.estado_dominio = 'verificado')    as dominio_verificado,
         case when c.buzon is not null and c.dominio is not null
              then c.buzon || '@' || c.dominio end as direccion
    from config_correo c;

-- ------------------------------------------------------------
-- 3 · La credencial del modo 'propio'
--
-- Mismo trato que la clave de OpenAI en la 026: entra desde el navegador y
-- no vuelve a salir. La diferencia es que aquí hay una por tenant, así que
-- el nombre del secreto lleva el tenant dentro.
--
-- Quien la lee es la Edge Function de envío con `service_role`. Ni el
-- cliente ni un administrador pueden recuperarla.
-- ------------------------------------------------------------
create or replace function nombre_secreto_correo(p_tenant uuid)
returns text
language sql
immutable
as $fn$
  select 'correo_' || replace(p_tenant::text, '-', '')
$fn$;

create or replace function guardar_credencial_correo(p_secreto text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
  v_nombre text;
  v_id     uuid;
  v_valor  text := trim(coalesce(p_secreto, ''));
begin
  if v_tenant is null then
    raise exception 'No autorizado';
  end if;

  -- Una forma mínima, para que un pegado a medias no sustituya una
  -- credencial buena por basura.
  if length(v_valor) < 12 then
    raise exception 'Esa credencial es demasiado corta para serlo';
  end if;

  v_nombre := nombre_secreto_correo(v_tenant);
  select id into v_id from vault.secrets where name = v_nombre;

  if v_id is null then
    perform vault.create_secret(
      v_valor, v_nombre,
      'Credencial del proveedor de correo propio del tenant ' || v_tenant);
  else
    perform vault.update_secret(v_id, v_valor);
  end if;

  update config_correo
     set modo = 'propio', actualizado_en = now()
   where tenant_id = v_tenant;
end;
$fn$;

-- Si hay credencial y cuándo se puso. NO la devuelve.
create or replace function estado_credencial_correo()
returns table (configurada boolean, actualizada_en timestamptz, pista text)
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_nombre text;
begin
  if auth_tenant_id() is null then
    raise exception 'No autorizado';
  end if;
  v_nombre := nombre_secreto_correo(auth_tenant_id());

  return query
  select true, s.updated_at, '…' || right(d.decrypted_secret, 4)
    from vault.secrets s
    join vault.decrypted_secrets d on d.id = s.id
   where s.name = v_nombre;

  if not found then
    return query select false, null::timestamptz, null::text;
  end if;
end;
$fn$;

create or replace function borrar_credencial_correo()
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
begin
  if v_tenant is null then
    raise exception 'No autorizado';
  end if;
  delete from vault.secrets where name = nombre_secreto_correo(v_tenant);
  update config_correo
     set modo = 'gestionado', proveedor = null, actualizado_en = now()
   where tenant_id = v_tenant;
end;
$fn$;

-- La lectura de verdad. Solo la función de envío, con service_role.
create or replace function leer_credencial_correo(p_tenant uuid)
returns text
language sql
security definer
set search_path = public, vault
as $fn$
  select d.decrypted_secret
    from vault.decrypted_secrets d
   where d.name = nombre_secreto_correo(p_tenant)
$fn$;

-- ------------------------------------------------------------
-- 4 · Crear la fila al vuelo
--
-- Sin esto, la pantalla tendría que distinguir "no tiene configuración" de
-- "no la puedo leer", y el frontend acabaría haciendo un upsert que es
-- justo donde se cuela un tenant_id equivocado.
-- ------------------------------------------------------------
create or replace function mi_config_correo()
returns config_correo
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
  v_fila   config_correo;
begin
  if v_tenant is null then
    raise exception 'No autorizado';
  end if;

  select * into v_fila from config_correo where tenant_id = v_tenant;
  if found then
    return v_fila;
  end if;

  insert into config_correo (tenant_id) values (v_tenant)
  on conflict (tenant_id) do nothing;

  select * into v_fila from config_correo where tenant_id = v_tenant;
  return v_fila;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Permisos
--
-- Postgres abre las funciones nuevas a public por defecto, y estas cuatro
-- son SECURITY DEFINER: se saltan la RLS. Dejarlas abiertas a la anon key
-- significa que cualquiera con la clave del navegador toca el Vault.
-- ------------------------------------------------------------
revoke execute on function guardar_credencial_correo(text) from public, anon;
revoke execute on function estado_credencial_correo()      from public, anon;
revoke execute on function borrar_credencial_correo()      from public, anon;
revoke execute on function mi_config_correo()              from public, anon;
revoke execute on function leer_credencial_correo(uuid)    from public, anon, authenticated;

-- Y devolvérselo a quien sí las necesita. Las cuatro primeras comprueban
-- auth_tenant_id() por su cuenta, que es el filtro que la RLS ya no hace.
grant execute on function guardar_credencial_correo(text) to authenticated;
grant execute on function estado_credencial_correo()      to authenticated;
grant execute on function borrar_credencial_correo()      to authenticated;
grant execute on function mi_config_correo()              to authenticated;

-- La lectura del secreto, solo para la función de envío.
grant execute on function leer_credencial_correo(uuid) to service_role;
