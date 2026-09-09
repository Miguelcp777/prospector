-- ============================================================
-- Prospector · 041 · las claves de los proveedores de modelo
-- Ejecutar DESPUÉS de 040_cancelar_busqueda.sql.
--
-- La 026 abrió el camino con una sola clave: la de OpenAI, escribible desde
-- el panel y legible únicamente por `service_role`. La de Anthropic —que es
-- la que mueve casi todo el producto: inferencia, redacción, landings y el
-- studio— seguía siendo un secreto de las Edge Functions, así que rotarla
-- exigía `supabase secrets set` y un despliegue.
--
-- Esta migración generaliza el molde de la 026 a varios proveedores en vez
-- de copiarlo tres veces.
--
-- LA LISTA BLANCA NO ES DECORACIÓN
--
-- Estas funciones escriben en `vault.secrets` por nombre. Sin acotar qué
-- nombres se aceptan, un administrador podría pisar `correo_api_key` —la
-- clave del proveedor de correo, que es de otro sitio— pasando ese nombre
-- por parámetro. `proveedores_de_modelo` es la lista de lo que se puede
-- tocar desde aquí, y nada más.
--
-- QUÉ SE USA Y QUÉ NO, HOY
--
--   openai     · la generan las imágenes del studio (`generar-imagen`)
--   anthropic  · inferencia, redacción, landings y studio-ia
--   gemini     · SE GUARDA, PERO NINGUNA FUNCIÓN LA LLAMA TODAVÍA
--
-- Lo de Gemini está dicho así a propósito, y también en la pantalla: una
-- clave guardada que nadie lee parece configuración hecha, y es el tipo de
-- cosa que se descubre el día que se necesita.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Qué proveedores hay, y bajo qué nombre vive cada clave
--
-- OpenAI conserva el nombre que le puso la 026 —`openai_api_key`— para no
-- mover un secreto que ya existe y que `leer_clave_openai` sigue leyendo
-- desde `generar-imagen`. Renombrarlo sería dejar de generar imágenes sin
-- que nada lo dijera.
-- ------------------------------------------------------------
create or replace function proveedores_de_modelo()
returns table (proveedor text, secreto text, etiqueta text, en_uso boolean)
language sql
immutable
as $fn$
  select * from (values
    ('openai',    'openai_api_key',    'OpenAI',    true),
    ('anthropic', 'anthropic_api_key', 'Anthropic', true),
    ('gemini',    'gemini_api_key',    'Gemini',    false)
  ) as p(proveedor, secreto, etiqueta, en_uso);
$fn$;

create or replace function secreto_del_proveedor(p_proveedor text)
returns text
language sql
stable
as $fn$
  select p.secreto from proveedores_de_modelo() p
   where p.proveedor = lower(trim(coalesce(p_proveedor, '')));
$fn$;

-- ------------------------------------------------------------
-- 2 · Guardar
-- ------------------------------------------------------------
create or replace function guardar_clave_modelo(p_proveedor text, p_clave text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_id      uuid;
  v_secreto text := secreto_del_proveedor(p_proveedor);
  v_clave   text := trim(coalesce(p_clave, ''));
begin
  if not es_admin() then raise exception 'No autorizado'; end if;

  if v_secreto is null then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  -- Una comprobación mínima de forma, para que un pegado a medias no
  -- sustituya una clave buena por basura.
  if length(v_clave) < 20 then
    raise exception 'Esa clave es demasiado corta para serlo';
  end if;

  select id into v_id from vault.secrets where name = v_secreto;

  if v_id is null then
    perform vault.create_secret(
      v_clave, v_secreto,
      format('Clave de %s, puesta desde el panel de Prospector', p_proveedor));
  else
    perform vault.update_secret(v_id, v_clave);
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 3 · Ver el estado de las tres de una vez
--
-- Devuelve fila por proveedor conocido, esté configurado o no: así la
-- pantalla se dibuja entera con una sola llamada y no hace falta saber de
-- antemano cuáles hay.
--
-- NO devuelve la clave. Solo los cuatro últimos caracteres, que es lo justo
-- para saber si la que hay es la que crees.
-- ------------------------------------------------------------
create or replace function estado_claves_modelo()
returns table (
  proveedor      text,
  etiqueta       text,
  en_uso         boolean,
  configurada    boolean,
  actualizada_en timestamptz,
  pista          text
)
language plpgsql
security definer
set search_path = public, vault
as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;

  return query
  select p.proveedor,
         p.etiqueta,
         p.en_uso,
         (s.id is not null),
         s.updated_at,
         case when d.decrypted_secret is null then null
              else '…' || right(d.decrypted_secret, 4) end
    from proveedores_de_modelo() p
    left join vault.secrets s on s.name = p.secreto
    left join vault.decrypted_secrets d on d.id = s.id
   order by p.proveedor;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · Borrar, para cuando se rote o se deje de usar el proveedor
-- ------------------------------------------------------------
create or replace function borrar_clave_modelo(p_proveedor text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_secreto text := secreto_del_proveedor(p_proveedor);
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  if v_secreto is null then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;
  delete from vault.secrets where name = v_secreto;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · La lectura de verdad
--
-- Solo para las Edge Functions. Nadie con sesión de navegador puede
-- ejecutarla, ni siquiera un administrador — que es justo lo que separa
-- «se puede poner desde el panel» de «se puede sacar desde el panel».
-- ------------------------------------------------------------
create or replace function leer_clave_modelo(p_proveedor text)
returns text
language sql
security definer
set search_path = public, vault
as $fn$
  select d.decrypted_secret
    from vault.decrypted_secrets d
   where d.name = secreto_del_proveedor(p_proveedor)
$fn$;

-- ------------------------------------------------------------
-- 6 · Permisos
-- ------------------------------------------------------------
revoke execute on function guardar_clave_modelo(text, text) from public, anon;
revoke execute on function estado_claves_modelo()           from public, anon;
revoke execute on function borrar_clave_modelo(text)        from public, anon;
revoke execute on function leer_clave_modelo(text)          from public, anon, authenticated;

grant  execute on function guardar_clave_modelo(text, text) to authenticated;
grant  execute on function estado_claves_modelo()           to authenticated;
grant  execute on function borrar_clave_modelo(text)        to authenticated;
grant  execute on function leer_clave_modelo(text)          to service_role;

-- `proveedores_de_modelo` y `secreto_del_proveedor` no son SECURITY DEFINER
-- y no leen nada sensible: son la lista de nombres. Las de arriba las usan
-- por dentro, así que no necesitan concesión propia para nadie más.
revoke execute on function proveedores_de_modelo()    from public, anon;
revoke execute on function secreto_del_proveedor(text) from public, anon;
grant  execute on function proveedores_de_modelo()    to authenticated, service_role;
grant  execute on function secreto_del_proveedor(text) to authenticated, service_role;
