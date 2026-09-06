-- ============================================================
-- Prospector · 036 · el remitente del servicio no se podía guardar
--
-- `guardar_remitente_servicio` (034) hacía el UPDATE sin WHERE:
--
--     update ajustes set remitente_servicio = ..., proveedor_correo = ...;
--
-- Postgres lo acepta. Supabase no: las conexiones de PostgREST corren con
-- `sql_safe_updates`, que aborta cualquier UPDATE o DELETE sin filtro. Y
-- SECURITY DEFINER no salva de esto — cambia el usuario con el que se
-- ejecuta, no los ajustes de la sesión, que siguen siendo los de quien
-- llama.
--
-- Efecto visible: la pantalla Ajustes → Correo del servicio guardaba la
-- clave (esa va por otra función) pero devolvía "UPDATE requires a WHERE
-- clause" al guardar el remitente. Y sin remitente, `enviar-prueba`
-- responde 503 aunque el dominio esté verificado en el proveedor.
--
-- `ajustes` es una tabla de una sola fila: `id boolean primary key
-- default true check (id)`, en 014. El filtro que le falta es `where id`.
-- ============================================================

create or replace function guardar_remitente_servicio(p_remitente text, p_proveedor text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_filas int;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;

  update ajustes
     set remitente_servicio = nullif(trim(coalesce(p_remitente, '')), ''),
         proveedor_correo   = nullif(trim(coalesce(p_proveedor, '')), ''),
         actualizado_en     = now()
   where id;

  -- La fila la crea 014 y no se borra nunca, pero si algún día no está,
  -- el UPDATE tocaría cero filas sin error y la pantalla diría "guardado"
  -- encima de un ajuste que no existe. Es el mismo fallo invisible que
  -- acabamos de arreglar, con otro disfraz.
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No existe la fila de ajustes del proyecto';
  end if;
end;
$fn$;

-- El REVOKE/GRANT de 034 sigue valiendo: CREATE OR REPLACE conserva los
-- permisos de la función. Se repiten por si esto se ejecuta en una base
-- que nunca tuvo la 034.
revoke execute on function guardar_remitente_servicio(text, text) from public, anon;
grant  execute on function guardar_remitente_servicio(text, text) to authenticated;
