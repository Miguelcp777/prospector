-- ============================================================
-- Prospector · 042 · el modo demo también acota los mensajes
-- Ejecutar DESPUÉS de 041_claves_de_modelo.sql.
--
-- La 039 acotó los leads y con eso el gasto de Google Places. Falta la otra
-- mitad de la factura: **cada mensaje personalizado es una llamada al
-- modelo**. Una campaña de 920 leads con 500 correos son 500 llamadas, y
-- mientras se enseña el producto eso es gasto sin nada a cambio.
--
-- POR QUÉ NO VALÍA EL TOPE QUE YA HABÍA
--
-- La 018 puso `max_mensajes_por_campana`, y su nombre engaña: es un tope
-- **por tanda**, no por campaña. Está pensado para que una campaña grande
-- se redacte a trozos, y el propio botón dice «Escribir los que faltan».
-- Pulsándolo cinco veces se escriben cinco tandas. Como freno de gasto para
-- una demostración no sirve: no acota nada, solo reparte.
--
-- El del modo demo es un techo **total por campaña**: cuando la campaña
-- llega a sus mensajes, no hay más, se pulse lo que se pulse.
--
-- Los dos conviven y se aplican a la vez. Gana el más pequeño de los dos.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El ajuste
-- ------------------------------------------------------------
alter table ajustes add column if not exists max_mensajes_demo int not null default 20
  check (max_mensajes_demo between 1 and 100000);

comment on column ajustes.max_mensajes_demo is
  'Mensajes como mucho por campaña, en total, mientras el modo demo esté puesto. Cada mensaje es una llamada al modelo.';

-- ------------------------------------------------------------
-- 2 · Cuántos mensajes caben todavía en esta campaña
--
-- Hermana de `huecos_de_leads` (039) y con el mismo trato del NULL: sin
-- modo demo no hay techo, y eso se dice con NULL y no con un número grande.
--
-- Cuenta TODOS los mensajes de la campaña, borradores incluidos. Un
-- borrador ya se pagó al escribirlo; no contarlo sería contar la mitad de
-- la factura.
-- ------------------------------------------------------------
create or replace function huecos_de_mensajes(p_campaign uuid)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when not a.modo_demo then null
           else greatest(0, a.max_mensajes_demo - (
                  select count(*)::int
                    from messages m
                    join leads l on l.id = m.lead_id
                   where l.campaign_id = p_campaign))
         end
    from ajustes a
   limit 1;
$fn$;

-- ------------------------------------------------------------
-- 3 · Encolar redacción, ahora con los dos topes
--
-- Es la de la 020 —que se salta a los ya contactados en otra campaña— con
-- el techo del modo demo encima. No hace falta tocar el worker: a
-- diferencia del descubrimiento, la redacción no encadena tareas nuevas
-- sobre la marcha. Todo el trabajo se crea aquí, así que acotarlo aquí lo
-- acota del todo.
-- ------------------------------------------------------------
create or replace function encolar_redaccion(p_campaign uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant     uuid;
  v_job        uuid;
  v_tareas     int;
  v_tope       int;
  v_candidatos int;
  v_repetidos  int;
  v_evitar     boolean;
  v_detalle    text;
  v_huecos     int;
  v_max_demo   int;
  v_manda_demo boolean;
begin
  select tenant_id, evitar_ya_contactados into v_tenant, v_evitar
    from campaigns where id = p_campaign;

  if v_tenant is null then
    raise exception 'Campaña no encontrada';
  end if;

  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jobs
    where campaign_id = p_campaign and tipo = 'redactar'
      and estado in ('pendiente','en_curso')
  ) then
    raise exception 'Ya hay una redacción en curso para esta campaña';
  end if;

  select max_mensajes_por_campana into v_tope from ajustes;

  if v_tope = 0 then
    raise exception 'La redacción de mensajes está desactivada (tope a 0).';
  end if;

  -- El techo del modo demo. Se avisa aquí y no a mitad: encolar un trabajo
  -- que no va a escribir nada deja un job fantasma y ninguna explicación.
  v_huecos := huecos_de_mensajes(p_campaign);
  if v_huecos = 0 then
    select max_mensajes_demo into v_max_demo from ajustes;
    raise exception
      'Modo demo: esta campaña ya tiene sus % mensajes escritos. Cada uno es una llamada al modelo, y ahí está el tope. Para escribir más, quita el modo demo o súbelo en el panel (Ajustes).',
      v_max_demo;
  end if;

  -- Gana el más pequeño de los dos. `v_manda_demo` se guarda para poder
  -- decir cuál de los dos frenó, que es lo que ahorra el rato de mirar por
  -- qué salieron menos mensajes de los esperados.
  v_manda_demo := v_huecos is not null and v_huecos < v_tope;
  if v_manda_demo then
    v_tope := v_huecos;
  end if;

  select count(*),
         count(*) filter (where exists (
           select 1 from v_leads_ya_contactados yc where yc.lead_id = l.id))
    into v_candidatos, v_repetidos
    from leads l
   where l.campaign_id = p_campaign
     and l.email is not null
     and not esta_suprimido(l.email, l.tenant_id)
     and not exists (select 1 from messages m where m.lead_id = l.id);

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'redactar', 'pendiente', 'En cola')
  returning id into v_job;

  -- Por score descendente: si solo caben 20, que sean los 20 mejores. Sin
  -- este orden el tope repartiría al azar y desperdiciaría las llamadas.
  insert into job_tareas (job_id, tenant_id, campaign_id, segment_id, lead_id, query)
  select v_job, v_tenant, p_campaign, l.segment_id, l.id, l.nombre
    from leads l
   where l.campaign_id = p_campaign
     and l.email is not null
     and not esta_suprimido(l.email, l.tenant_id)
     and not exists (select 1 from messages m where m.lead_id = l.id)
     and (not v_evitar
          or not exists (select 1 from v_leads_ya_contactados yc where yc.lead_id = l.id))
   order by l.score desc nulls last, l.resenas desc nulls last
   limit v_tope;

  get diagnostics v_tareas = row_count;

  if v_tareas = 0 then
    update jobs
       set estado = 'hecho', progreso = 100,
           detalle = case
             when v_evitar and v_repetidos > 0 and v_repetidos >= v_candidatos then
               format('Los %s leads pendientes ya recibieron un correo en otra campaña', v_repetidos)
             else 'No hay leads con email pendientes de redactar' end,
           actualizado_en = now()
     where id = v_job;
    return v_job;
  end if;

  v_detalle := 'En cola';
  if v_candidatos > v_tareas then
    v_detalle := case
      when v_manda_demo then
        format('En cola · %s de %s leads (modo demo: %s mensajes por campaña)',
               v_tareas, v_candidatos, (select max_mensajes_demo from ajustes))
      else
        format('En cola · %s de %s leads (tope de %s por tanda)',
               v_tareas, v_candidatos, v_tope)
    end;
  end if;
  if v_evitar and v_repetidos > 0 then
    v_detalle := v_detalle || format(' · %s saltados por contacto previo', v_repetidos);
  end if;

  update jobs set detalle = v_detalle where id = v_job;

  return v_job;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · El interruptor del panel guarda ahora los dos techos
--
-- Se sustituye la firma de dos argumentos de la 039 en vez de dejar las dos
-- vivas. Una función `guardar_modo_demo(boolean, int)` que sigue existiendo
-- y que se traga los mensajes sin decir nada es una trampa: guardaría el
-- techo de leads, no el de mensajes, y la pantalla no daría ningún error.
-- ------------------------------------------------------------
drop function if exists guardar_modo_demo(boolean, int);

create or replace function guardar_modo_demo(
  p_activo    boolean,
  p_max_leads int,
  p_max_mensajes int
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_filas int;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;

  if p_max_leads is null or p_max_leads < 1 or p_max_leads > 100000 then
    raise exception 'El techo de leads del modo demo tiene que estar entre 1 y 100000';
  end if;

  if p_max_mensajes is null or p_max_mensajes < 1 or p_max_mensajes > 100000 then
    raise exception 'El techo de mensajes del modo demo tiene que estar entre 1 y 100000';
  end if;

  update ajustes
     set modo_demo         = coalesce(p_activo, false),
         max_leads_demo    = p_max_leads,
         max_mensajes_demo = p_max_mensajes,
         actualizado_en    = now()
   where id;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No existe la fila de ajustes del proyecto';
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Y de paso, cerrar `ajustes` a la escritura desde el navegador
--
-- Encontrado al montar esto: `anon` y `authenticated` tienen concesión de
-- INSERT y UPDATE sobre TODAS las columnas de `ajustes`. Hoy no pasa nada
-- porque la RLS está activa y la tabla solo tiene política de SELECT, así
-- que toda escritura se deniega.
--
-- Pero es la misma trampa que el README ya señala en `administradores`: el
-- día que alguien añada una política de escritura «para poder guardar los
-- precios desde el panel», cualquiera con la clave publicable —que viaja en
-- el bundle— podría apagar el modo demo, subir el techo de Places del
-- proyecto entero o cambiar el remitente del servicio.
--
-- Quitar la concesión no rompe nada: quien escribe aquí son funciones
-- SECURITY DEFINER, que se ejecutan con la identidad del dueño de la
-- función y no con la de quien llama. Comprobado: ninguna pantalla hace un
-- UPDATE directo sobre `ajustes`, solo SELECT.
-- ------------------------------------------------------------
revoke insert, update on table ajustes from anon, authenticated;

-- ------------------------------------------------------------
-- 6 · Permisos
--
-- `huecos_de_mensajes` cuenta mensajes de cualquier campaña, así que no se
-- abre a nadie con sesión de navegador: dentro de `encolar_redaccion` se
-- ejecuta con la identidad del dueño y no necesita concesión propia.
-- ------------------------------------------------------------
revoke execute on function huecos_de_mensajes(uuid)             from public, anon, authenticated;
revoke execute on function encolar_redaccion(uuid)              from public, anon;
revoke execute on function guardar_modo_demo(boolean, int, int) from public, anon;

grant  execute on function huecos_de_mensajes(uuid)             to service_role;
grant  execute on function encolar_redaccion(uuid)              to authenticated;
grant  execute on function guardar_modo_demo(boolean, int, int) to authenticated;

-- ------------------------------------------------------------
-- Para quitar solo el techo de mensajes sin pasar por el panel:
--   update ajustes set max_mensajes_demo = 100000 where id;
-- ------------------------------------------------------------
