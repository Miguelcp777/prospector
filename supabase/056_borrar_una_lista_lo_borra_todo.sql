-- ============================================================
-- Prospector · 056 · borrar una lista la borra entera, siempre
--
-- QUIÉN LO DECIDE
--
-- Miguel, el 16 de septiembre de 2026, después de que la 055 le pusiera
-- delante la regla de las dos ramas y el motivo: «que se borre todo
-- siempre». Es su decisión y está tomada con el motivo a la vista, no por
-- descuido. Queda aquí para que dentro de tres meses nadie la lea como un
-- olvido y la «arregle».
--
-- QUÉ CAMBIA
--
-- `borrar_lista` tenía dos ramas: una lista nunca volcada desaparecía
-- entera, y una ya volcada dejaba su ficha como lápida —archivo, fecha,
-- mapeo, declaración y cifras— para no romper el registro de origen de los
-- leads que salieron de ella. La segunda rama se va: ahora se borra todo
-- en los dos casos.
--
-- QUÉ SE PIERDE EXACTAMENTE, Y ESTO ES LO QUE NO PUEDE QUEDAR IMPLÍCITO
--
-- Al borrar una lista que YA se volcó a una campaña, sus leads siguen vivos
-- —eso no cambia, es el `on delete set null` de la 054— y conservan:
--
--   fuente ............... 'lista'      · salió de una lista, no de Places
--   email_origen ......... 'lista:<uuid>#fila-N'
--   email_capturado_en ... la fecha de la lista
--
-- Y se pierde, sin vuelta atrás:
--
--   archivo_nombre ....... de qué archivo salió
--   mapeo ................ qué columna era cada cosa
--   consentimiento_texto . la frase que el cliente afirmó
--   consentimiento_en .... cuándo la afirmó
--   subido_por ........... quién la subió
--   volcados_de_lista .... a qué campañas fue y con qué cifras (cascada)
--
-- O sea: el lead sigue diciendo que vino de una lista y con qué número de
-- fila, pero ese uuid ya no resuelve a nada. `docs/compliance.md` pide
-- «registro de origen del dato por lead (fuente y fecha)» — la fuente y la
-- fecha se conservan; el respaldo documental, no.
--
-- LA SALIDA, SI ALGÚN DÍA HACE FALTA
--
-- Copiar la declaración y el nombre del archivo AL LEAD en el momento del
-- volcado, en vez de dejarlos colgando de una fila que se puede borrar. Eso
-- sí sobreviviría a esto, y es el patrón que ya usa `messages.email_destino`.
-- No se hace hoy porque no se ha pedido y porque cambia
-- `volcar_lista_en_campana` y la tabla `leads`.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La función, sin la rama de la lápida
--
-- Se conserva la forma de la salida —`borrada` ahora es siempre cierto—
-- para no tener que borrar y recrear la función, y para que la pantalla que
-- ya la llama siga funcionando sin cambios en ese punto.
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

  -- Los leads que salieron de esta lista. Se cuentan para poder decirlo, y
  -- NO se tocan: un lead al que ya se ha escrito no desaparece porque
  -- alguien ordene su hoja de cálculo. `leads.contacto_id` queda a nulo por
  -- el `on delete set null` de la 054.
  select count(*) into v_leads
    from leads d join contactos_de_lista c on c.id = d.contacto_id
   where c.lista_id = p_lista;

  -- Una sola rama. La cascada se lleva los contactos y el histórico de
  -- volcados; los leads no cuelgan de aquí y se quedan.
  delete from listas_de_contactos where id = p_lista;

  return query select true, v_contactos, v_leads;
end;
$fn$;

comment on function borrar_lista(uuid) is
  'Borra una lista entera: sus contactos y su histórico de volcados. Los leads que salieron de ella NO se borran, pero pierden el respaldo documental de su origen. Decisión de Miguel, 16-09-2026, ver la cabecera de la 056.';

-- ------------------------------------------------------------
-- 2 · La columna de la lápida se queda, y nada la lee
--
-- Mismo criterio que con `ajustes.modo_demo` en la 045: borrar es
-- destructivo y no lo pide nadie. Lo que sí hace falta es que no haga
-- perder una tarde a quien la encuentre, y eso se arregla en el comentario.
-- ------------------------------------------------------------
comment on column listas_de_contactos.contactos_borrados_en is
  'OBSOLETA desde la 056. Marcaba la lápida de una lista volcada cuyos contactos se habían borrado. Desde que borrar una lista la borra entera, nadie la escribe y nadie la lee. No se borra la columna porque borrar es destructivo y no lo pide nadie; esto está aquí para que no haga perder el tiempo.';
