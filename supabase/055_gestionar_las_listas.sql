-- ============================================================
-- Prospector · 055 · borrar y renombrar una lista
--
-- EL PROBLEMA
--
-- La 054 dejó las listas sin puerta de salida. Se suben y ya está: no hay
-- forma de borrarlas, ni de corregirles el nombre, ni de quitar un contacto
-- que no debería estar ahí.
--
-- Los PERMISOS ya lo permitían todo —`listas_del_tenant` es `for all`, y
-- `contactos_de_lista` tiene sus políticas de update y delete—, así que lo
-- único que faltaba era la pantalla. Esta migración no abre nada nuevo:
-- **cierra** el borrado detrás de una función, por lo de abajo.
--
-- LO QUE PASA HOY AL BORRAR, MEDIDO
--
-- Comprobado contra la base en una transacción deshecha, con un lead
-- colgando de un contacto de la lista:
--
--   leads vivos tras el borrado ....... 1   (no se van: `on delete set null`)
--   con contacto_id a nulo ............ 1
--   contactos de la lista ............. 0   (cascada)
--   email_origen del lead ............. 'lista:<uuid>#fila-1'
--
-- Es decir: **el lead sobrevive y sigue diciendo de qué lista salió, pero
-- esa lista ya no existe.** El registro de origen se queda apuntando al
-- vacío, y `docs/compliance.md` lo pide expresamente: «Registro de origen
-- del dato por lead (fuente y fecha), para poder responder a cualquier
-- reclamación».
--
-- LA REGLA QUE SE ADOPTA, Y POR QUÉ SON DOS CASOS
--
--   Lista que NUNCA se volcó  → se borra entera, fila incluida.
--                               No hay nada a lo que responder.
--   Lista ya volcada          → se borran los CONTACTOS —que son los datos
--                               personales— y la ficha se queda como lápida:
--                               nombre, archivo, fecha, mapeo, declaración y
--                               cifras. Con su histórico de volcados.
--
-- Eso da las dos cosas a la vez: el cliente ejerce su derecho a borrar las
-- direcciones, y queda de dónde salió cada lead. Es el mismo principio que
-- ya sostiene `messages.email_destino`: la dirección de la reclamación es la
-- de entonces.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La marca de lápida
-- ------------------------------------------------------------
alter table listas_de_contactos
  add column if not exists contactos_borrados_en timestamptz;

comment on column listas_de_contactos.contactos_borrados_en is
  'Cuándo se borraron los contactos dejando la ficha. Nulo = la lista está entera. No nulo = lápida: quedan el registro de origen y las cifras, no las direcciones.';

-- ------------------------------------------------------------
-- 2 · Borrar
--
-- SECURITY DEFINER y comprueba el tenant a mano, como las dos de la 054.
-- Va por función y no por un DELETE suelto desde el navegador porque la
-- decisión —lápida o borrado entero— depende de si la lista se volcó, y esa
-- cuenta no se puede dejar en manos de quien llama.
-- ------------------------------------------------------------
create or replace function borrar_lista(p_lista uuid)
returns table (borrada boolean, contactos int, leads_afectados int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant    uuid;
  v_contactos int;
  v_leads     int;
begin
  select tenant_id into v_tenant from listas_de_contactos where id = p_lista;

  if v_tenant is null then
    raise exception 'La lista no existe';
  end if;

  -- El filtro por tenant que la RLS ya no está haciendo por nosotros.
  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  select count(*) into v_contactos from contactos_de_lista where lista_id = p_lista;

  -- Leads vivos que salieron de esta lista. No se tocan ni en un caso ni en
  -- el otro: un lead al que ya se ha escrito no desaparece porque alguien
  -- ordene su hoja de cálculo.
  select count(*) into v_leads
    from leads d join contactos_de_lista c on c.id = d.contacto_id
   where c.lista_id = p_lista;

  delete from contactos_de_lista where lista_id = p_lista;

  if exists (select 1 from volcados_de_lista where lista_id = p_lista) then
    -- Lápida: la ficha se queda, sin direcciones dentro.
    update listas_de_contactos
       set contactos_borrados_en = now()
     where id = p_lista;
    return query select false, v_contactos, v_leads;
  else
    -- Nunca salió de aquí: no hay nada que registrar.
    delete from listas_de_contactos where id = p_lista;
    return query select true, v_contactos, v_leads;
  end if;
end;
$fn$;

comment on function borrar_lista(uuid) is
  'Borra los contactos de una lista. Si la lista se volcó alguna vez, la ficha se queda como lápida para no romper el registro de origen de los leads que salieron de ella.';

-- ------------------------------------------------------------
-- 3 · Permisos
--
-- Postgres la abre a public por defecto y esta se salta la RLS.
-- ------------------------------------------------------------
revoke execute on function borrar_lista(uuid) from public, anon;
grant  execute on function borrar_lista(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4 · Lo que NO se toca, y conviene que quede dicho
--
-- Renombrar una lista y corregir un contacto se quedan como UPDATE directo
-- por PostgREST: la RLS ya los acota al tenant y no hay ninguna decisión que
-- tomar por debajo. Meterlos en una función sería ceremonia.
--
-- PERO hay un agujero heredado de la 054 que esta migración cierra, porque
-- lo ha destapado ponerse a editar: `authenticated` tiene UPDATE sobre las
-- VEINTE columnas de `listas_de_contactos`, y ahí dentro están
-- `consentimiento_texto` y `consentimiento_en` —la declaración con su fecha—
-- y las cifras de filas. Un cliente podía reescribir a posteriori la frase
-- que afirmó al subir la lista, que es justo lo que convertía un supuesto en
-- un acto registrado con autor. Se concede UPDATE solo donde tiene sentido.
-- ------------------------------------------------------------
revoke update on listas_de_contactos from authenticated;
grant  update (nombre) on listas_de_contactos to authenticated;

-- El histórico de volcados no se edita ni se borra a mano: es el registro de
-- qué se mandó a qué campaña y cuándo.
revoke insert, update, delete on volcados_de_lista from authenticated;
