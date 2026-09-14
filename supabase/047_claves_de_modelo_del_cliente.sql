-- ============================================================
-- Prospector · 047 · cada cliente paga su propio modelo
-- Ejecutar DESPUÉS de 046_aviso_de_version_de_prueba.sql.
--
-- La 041 puso las claves de los proveedores en el Vault, escribibles desde
-- el panel y legibles solo por `service_role`. Pero son UNA por proveedor
-- para todo el servicio: la inferencia de los seis clientes, sus mensajes,
-- sus landings y la demo pública salen todas de la misma cuenta de
-- Anthropic. La factura es de quien la pegó.
--
-- Eso vale mientras se prueba y deja de valer en cuanto alguien produce.
--
-- LA REGLA
--
--   Cliente en versión de prueba (`tenants.modo_demo`) → clave del servicio
--   Demo pública (sin tenant)                          → clave del servicio
--   Cliente sin modo demo                              → SU clave, o nada
--
-- «O nada» es literal: las funciones de IA fallan con un aviso que dice qué
-- falta y dónde se pone. No hay caída de vuelta a la clave del servicio,
-- porque una caída silenciosa es justo cómo acabas pagando el consumo de
-- otro sin enterarte.
--
-- QUÉ PROVEEDOR MUEVE QUÉ, HOY
--
--   anthropic · inferencia, redacción, landings y studio-ia. Es la que hace
--               falta para que un cliente sin modo demo funcione
--   openai    · las imágenes del studio (`generar-imagen`)
--   gemini    · SE GUARDA, PERO NINGUNA FUNCIÓN LA LLAMA TODAVÍA
--
-- Lo de Gemini se repite aquí porque es lo mismo que en el panel del
-- servicio y por el mismo motivo: una clave guardada que nadie lee parece
-- configuración hecha.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Dónde vive la clave de cada cliente
--
-- El nombre codifica tenant y proveedor, como la 028 hace con la credencial
-- de correo. Sin tabla de claves: el Vault ya es el almacén, y una tabla
-- que las duplicara sería otro sitio del que puedan escaparse.
-- ------------------------------------------------------------
create or replace function nombre_secreto_modelo(p_tenant uuid, p_proveedor text)
returns text
language sql
immutable
as $fn$
  select case
           when p_tenant is null then null
           else 'modelo_' || lower(trim(p_proveedor)) || '_'
                || replace(p_tenant::text, '-', '')
         end
$fn$;

-- ------------------------------------------------------------
-- 2 · Qué proveedor usa cada cliente para el texto
--
-- Hace falta porque puede pegar las tres y hay que saber con cuál hablar.
-- Tabla propia con `tenant_id` y su RLS, como toda tabla de este esquema.
-- ------------------------------------------------------------
create table if not exists config_modelo (
  tenant_id      uuid primary key references tenants(id) on delete cascade,
  proveedor      text not null default 'anthropic'
                 check (proveedor in ('anthropic','openai','gemini')),
  actualizado_en timestamptz not null default now()
);

alter table config_modelo enable row level security;

drop policy if exists config_modelo_del_tenant on config_modelo;
create policy config_modelo_del_tenant on config_modelo
  for select using (tenant_id = auth_tenant_id());

-- La escritura pasa por las funciones de abajo, que comprueban el rol.
revoke insert, update, delete on config_modelo from authenticated, anon;

comment on table config_modelo is
  'Con qué proveedor de modelo habla cada cliente. La clave está en el Vault, '
  'nunca aquí. Ver 047.';

-- ------------------------------------------------------------
-- 3 · Quién puede tocar la clave de un cliente
--
-- El propietario de la cuenta. Es una credencial que cuesta dinero cada vez
-- que se usa, y un miembro invitado no debería poder cambiarla ni borrarla.
-- ------------------------------------------------------------
create or replace function es_propietario()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from profiles
     where id = auth.uid() and rol = 'propietario'
  )
$fn$;

-- ------------------------------------------------------------
-- 4 · Guardar
-- ------------------------------------------------------------
create or replace function guardar_clave_modelo_cliente(p_proveedor text, p_clave text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
  v_prov   text := lower(trim(coalesce(p_proveedor, '')));
  v_clave  text := trim(coalesce(p_clave, ''));
  v_nombre text;
  v_id     uuid;
begin
  if v_tenant is null or not es_propietario() then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from proveedores_de_modelo() p where p.proveedor = v_prov) then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  -- La misma comprobación de forma que la 041: que un pegado a medias no
  -- sustituya una clave buena por basura.
  if length(v_clave) < 20 then
    raise exception 'Esa clave es demasiado corta para serlo';
  end if;

  v_nombre := nombre_secreto_modelo(v_tenant, v_prov);
  select id into v_id from vault.secrets where name = v_nombre;

  if v_id is null then
    perform vault.create_secret(
      v_clave, v_nombre,
      format('Clave de %s del cliente %s', v_prov, v_tenant));
  else
    perform vault.update_secret(v_id, v_clave);
  end if;

  -- Si es la primera clave de texto que pega, pasa a ser su proveedor.
  if v_prov in ('anthropic','gemini') then
    insert into config_modelo (tenant_id, proveedor)
    values (v_tenant, v_prov)
    on conflict (tenant_id) do update
      set proveedor = excluded.proveedor, actualizado_en = now();
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Ver el estado, sin ver la clave
--
-- Devuelve fila por proveedor conocido, con los cuatro últimos caracteres:
-- lo justo para saber si la que hay es la que crees. Mismo criterio que
-- `estado_claves_modelo` del panel.
-- ------------------------------------------------------------
create or replace function estado_claves_modelo_cliente()
returns table (
  proveedor      text,
  etiqueta       text,
  en_uso         boolean,
  configurada    boolean,
  actualizada_en timestamptz,
  pista          text,
  preferido      boolean
)
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

  return query
  select p.proveedor,
         p.etiqueta,
         p.en_uso,
         (s.id is not null),
         s.updated_at,
         case when d.decrypted_secret is null then null
              else '…' || right(d.decrypted_secret, 4) end,
         (p.proveedor = coalesce(c.proveedor, 'anthropic'))
    from proveedores_de_modelo() p
    left join vault.secrets s
           on s.name = nombre_secreto_modelo(v_tenant, p.proveedor)
    left join vault.decrypted_secrets d on d.id = s.id
    left join config_modelo c on c.tenant_id = v_tenant
   order by p.proveedor;
end;
$fn$;

-- ------------------------------------------------------------
-- 6 · Borrar
--
-- Para cuando la clave se revoca, caduca o simplemente deja de funcionar.
-- Borrar la del proveedor preferido no deja al cliente sin proveedor: la
-- preferencia se queda, y la pantalla dirá que falta la clave.
-- ------------------------------------------------------------
create or replace function borrar_clave_modelo_cliente(p_proveedor text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
  v_prov   text := lower(trim(coalesce(p_proveedor, '')));
  v_nombre text;
begin
  if v_tenant is null or not es_propietario() then
    raise exception 'No autorizado';
  end if;

  v_nombre := nombre_secreto_modelo(v_tenant, v_prov);
  if v_nombre is null then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  delete from vault.secrets where name = v_nombre;
end;
$fn$;

-- ------------------------------------------------------------
-- 7 · Elegir proveedor sin cambiar la clave
-- ------------------------------------------------------------
create or replace function elegir_proveedor_modelo(p_proveedor text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
  v_prov   text := lower(trim(coalesce(p_proveedor, '')));
begin
  if v_tenant is null or not es_propietario() then
    raise exception 'No autorizado';
  end if;
  if v_prov not in ('anthropic','openai','gemini') then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  insert into config_modelo (tenant_id, proveedor)
  values (v_tenant, v_prov)
  on conflict (tenant_id) do update
    set proveedor = excluded.proveedor, actualizado_en = now();
end;
$fn$;

-- ------------------------------------------------------------
-- 8 · La que resuelve todo, y la única que ve claves
--
-- La llama la Edge Function con `service_role`. Devuelve de dónde sale la
-- clave además de la clave, porque el motivo importa: el aviso que ve el
-- cliente cuando no hay ninguna depende de si le tocaba poner la suya.
--
--   origen 'cliente'  → la suya
--   origen 'servicio' → la del servicio (demo pública o versión de prueba)
--   origen 'falta'    → no hay, y no le corresponde la del servicio
-- ------------------------------------------------------------
create or replace function resolver_clave_modelo(p_tenant uuid, p_proveedor text)
returns table (origen text, clave text, proveedor text)
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_prov      text := lower(trim(coalesce(p_proveedor, '')));
  v_clave     text;
  v_demo      boolean;
begin
  if not exists (select 1 from proveedores_de_modelo() p where p.proveedor = v_prov) then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  -- 1 · La del cliente, si la tiene.
  if p_tenant is not null then
    select d.decrypted_secret into v_clave
      from vault.decrypted_secrets d
     where d.name = nombre_secreto_modelo(p_tenant, v_prov);

    if v_clave is not null then
      return query select 'cliente', v_clave, v_prov;
      return;
    end if;
  end if;

  -- 2 · La del servicio, solo para la demo pública y para quien está en
  --     versión de prueba. Un tenant desconocido no cuenta como demo.
  if p_tenant is null then
    v_demo := true;
  else
    select t.modo_demo into v_demo from tenants t where t.id = p_tenant;
    v_demo := coalesce(v_demo, false);
  end if;

  if v_demo then
    select d.decrypted_secret into v_clave
      from vault.decrypted_secrets d
     where d.name = secreto_del_proveedor(v_prov);

    if v_clave is not null then
      return query select 'servicio', v_clave, v_prov;
      return;
    end if;
  end if;

  -- 3 · Ni la suya ni le toca la nuestra.
  return query select 'falta', null::text, v_prov;
end;
$fn$;

-- ------------------------------------------------------------
-- 9 · Permisos
--
-- `resolver_clave_modelo` devuelve claves en claro: solo `service_role`,
-- que vive dentro de las Edge Functions. Que se pueda escribir desde el
-- navegador y no leer es toda la diferencia entre guardar una clave y
-- regalarla — igual que en la 041.
-- ------------------------------------------------------------
revoke execute on function resolver_clave_modelo(uuid, text)            from public, anon, authenticated;
grant  execute on function resolver_clave_modelo(uuid, text)            to service_role;

revoke execute on function guardar_clave_modelo_cliente(text, text)     from public, anon;
revoke execute on function estado_claves_modelo_cliente()               from public, anon;
revoke execute on function borrar_clave_modelo_cliente(text)            from public, anon;
revoke execute on function elegir_proveedor_modelo(text)                from public, anon;
revoke execute on function es_propietario()                             from public, anon;
revoke execute on function nombre_secreto_modelo(uuid, text)            from public, anon;

grant  execute on function guardar_clave_modelo_cliente(text, text)     to authenticated;
grant  execute on function estado_claves_modelo_cliente()               to authenticated;
grant  execute on function borrar_clave_modelo_cliente(text)            to authenticated;
grant  execute on function elegir_proveedor_modelo(text)                to authenticated;
grant  execute on function es_propietario()                             to authenticated, service_role;
grant  execute on function nombre_secreto_modelo(uuid, text)            to authenticated, service_role;

-- ------------------------------------------------------------
-- 10 · Los seis clientes de hoy
--
-- Todos están en versión de prueba (la 045 la dejó puesta en toda cuenta),
-- así que nadie se queda sin IA al aplicar esto: siguen con la clave del
-- servicio hasta que se les quite el modo demo. Ese día, la pantalla de
-- Cuenta les pedirá la suya.
-- ------------------------------------------------------------
