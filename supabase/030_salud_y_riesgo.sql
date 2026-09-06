-- ============================================================
-- Prospector · 030 · salud del servicio y clientes en riesgo
--
-- Las dos cosas que el panel no contaba y que se notan cuando ya es tarde:
-- que el trabajo se está cayendo, y que un cliente se está yendo.
--
-- Los umbrales no son redondos por gusto: salen de mirar la base al
-- escribir esto. Había 38 tareas en 'en_curso' y las 38 llevaban más de
-- quince minutos ahí, con el cron corriendo cada minuto y sin fallos en 24
-- horas. O sea: el worker estaba vivo y las tareas se morían igual, y no
-- había ninguna pantalla donde eso se viera.
--
-- Ejecutar DESPUÉS de 029_modulos_y_gobierno.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Salud del servicio
--
-- Una fila por indicador, con su estado ya decidido aquí. La pantalla no
-- debe reimplementar los umbrales: si los decide el SQL, cambiarlos es una
-- migración y no una cacería por el frontend.
--
-- `orden` existe para que la lista salga siempre igual. Un tablero cuyas
-- filas bailan no se puede leer de un vistazo, que es para lo único que
-- sirve un tablero.
-- ------------------------------------------------------------
create or replace function panel_salud()
returns table (
  orden      int,
  indicador  text,
  valor      text,
  estado     text,   -- 'ok' | 'aviso' | 'mal'
  detalle    text
)
language plpgsql
security definer
set search_path = public, cron
as $fn$
declare
  v_ultimo    timestamptz;
  v_fallos    int;
  v_atascadas int;
  v_parados   int;
  v_err       int;
  v_tot       int;
  v_motivo    text;
  v_incid     int;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  -- 1 · ¿Está vivo el cron? Es lo primero: si esto está mal, lo demás se
  -- explica solo y no hay que mirarlo.
  select max(start_time) into v_ultimo from cron.job_run_details;
  select count(*) into v_fallos from cron.job_run_details
   where status <> 'succeeded' and start_time > now() - interval '24 hours';

  return query select 1, 'Worker'::text,
    case when v_ultimo is null then 'nunca ha corrido'
         else 'hace ' || greatest(0, extract(epoch from now() - v_ultimo)::int / 60) || ' min' end,
    case when v_ultimo is null then 'mal'
         when v_ultimo < now() - interval '10 minutes' then 'mal'
         when v_ultimo < now() - interval '3 minutes'  then 'aviso'
         else 'ok' end,
    'El cron lo despierta cada minuto. Si pasan diez, no está corriendo.'::text;

  return query select 2, 'Fallos del cron (24 h)'::text, v_fallos::text,
    case when v_fallos = 0 then 'ok' when v_fallos < 5 then 'aviso' else 'mal' end,
    'Ejecuciones que el propio pg_cron dio por fallidas.'::text;

  -- 2 · Tareas que alguien reclamó y nadie terminó. Una invocación que se
  -- muere a mitad deja la tarea en 'en_curso' para siempre: no vuelve a la
  -- cola sola, así que el job no avanza y tampoco se cierra.
  select count(*) into v_atascadas from job_tareas
   where estado = 'en_curso' and reclamada_en < now() - interval '15 minutes';

  return query select 3, 'Tareas atascadas'::text, v_atascadas::text,
    case when v_atascadas = 0 then 'ok' when v_atascadas < 10 then 'aviso' else 'mal' end,
    'Reclamadas hace más de 15 minutos y sin terminar. No vuelven a la cola solas.'::text;

  select count(*) into v_parados from jobs
   where estado = 'en_curso' and actualizado_en < now() - interval '30 minutes';

  return query select 4, 'Trabajos parados'::text, v_parados::text,
    case when v_parados = 0 then 'ok' when v_parados < 3 then 'aviso' else 'mal' end,
    'En curso y sin avanzar en media hora. La campaña se queda a medias sin decirlo.'::text;

  -- 3 · Cuánto del trabajo se cae. En proporción, que en bruto no dice si
  -- son muchos o es que se ha trabajado mucho.
  select count(*) filter (where estado = 'error'), count(*)
    into v_err, v_tot
    from job_tareas where creado_en > now() - interval '7 days';

  return query select 5, 'Tareas fallidas (7 días)'::text,
    case when coalesce(v_tot, 0) = 0 then 'sin trabajo'
         else v_err || ' de ' || v_tot || ' · ' || round(v_err * 100.0 / v_tot) || '%' end,
    case when coalesce(v_tot, 0) = 0 then 'ok'
         when v_err * 100.0 / v_tot < 2  then 'ok'
         when v_err * 100.0 / v_tot < 10 then 'aviso'
         else 'mal' end,
    'Búsquedas y redacciones que terminaron en error.'::text;

  -- 4 · Y por qué. Sin esto, el porcentaje de arriba obliga a ir a buscar
  -- a mano en job_tareas.detalle, que es donde nadie mira.
  select left(coalesce(detalle, '(sin detalle)'), 90) into v_motivo
    from job_tareas
   where estado = 'error' and creado_en > now() - interval '7 days'
   group by 1 order by count(*) desc limit 1;

  return query select 6, 'Motivo más repetido'::text,
    coalesce(v_motivo, 'ninguno'),
    case when v_motivo is null then 'ok' else 'aviso' end,
    'El error que más veces se repite esta semana.'::text;

  select count(*) into v_incid from incidencias where estado <> 'resuelta';

  return query select 7, 'Incidencias abiertas'::text, v_incid::text,
    case when v_incid = 0 then 'ok' when v_incid < 5 then 'aviso' else 'mal' end,
    'Fallos que la app registró y nadie ha cerrado.'::text;
end;
$fn$;

-- ------------------------------------------------------------
-- 2 · Clientes en riesgo
--
-- Una fila por cliente con algo que mirar, y el motivo escrito. No es una
-- lista de malos clientes: es la lista de a quién llamar esta semana.
--
-- Se ordena por gravedad y no alfabéticamente: el primero de la lista
-- tiene que ser el que más urge.
-- ------------------------------------------------------------
create or replace function panel_clientes_riesgo()
returns table (
  tenant_id  uuid,
  nombre     text,
  dias_alta  int,
  gravedad   int,     -- 1 alto · 2 medio · 3 bajo
  motivo     text,
  que_hacer  text
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  with t as (
    select te.id, te.nombre,
           extract(day from now() - te.creado_en)::int as dias,
           (select count(*) from campaigns c where c.tenant_id = te.id)              as campanas,
           (select count(*) from leads l     where l.tenant_id = te.id)              as leads,
           (select count(*) from leads l     where l.tenant_id = te.id
                                               and l.email is not null)              as con_correo,
           (select count(*) from jobs j      where j.tenant_id = te.id
                                               and j.estado = 'error')               as jobs_error,
           (select max(greatest(c.creado_en, coalesce(te.creado_en, c.creado_en)))
              from campaigns c where c.tenant_id = te.id)                            as ultima
      from tenants te
  )
  select t.id, t.nombre, t.dias,
         case
           when t.campanas = 0 and t.dias >= 7  then 1
           when t.leads = 0 and t.campanas > 0  then 1
           when t.jobs_error > 0                then 2
           when t.con_correo = 0 and t.leads > 0 then 2
           else 3
         end,
         case
           when t.campanas = 0 and t.dias >= 7 then
             'Se dio de alta hace ' || t.dias || ' días y no ha creado ninguna campaña'
           when t.leads = 0 and t.campanas > 0 then
             'Tiene ' || t.campanas || ' campaña(s) y ningún lead'
           when t.jobs_error > 0 then
             t.jobs_error || ' trabajo(s) suyos terminaron en error'
           when t.con_correo = 0 and t.leads > 0 then
             'Tiene ' || t.leads || ' leads y ninguno con correo'
           else 'Sin actividad reciente'
         end,
         case
           when t.campanas = 0 and t.dias >= 7 then
             'Llamar. Un alta que no crea campaña en una semana casi nunca vuelve sola.'
           when t.leads = 0 and t.campanas > 0 then
             'Mirar si el descubrimiento llegó a correr, o si los segmentos no tenían queries.'
           when t.jobs_error > 0 then
             'Ver Salud del servicio: suele ser el mismo motivo para todos.'
           when t.con_correo = 0 and t.leads > 0 then
             'Sin correo no hay a quién escribir. Revisar el enriquecimiento.'
           else 'Nada urgente.'
         end
    from t
   where (t.campanas = 0 and t.dias >= 7)
      or (t.leads = 0 and t.campanas > 0)
      or t.jobs_error > 0
      or (t.con_correo = 0 and t.leads > 0)
   order by 4, t.dias desc;
end;
$fn$;

-- ------------------------------------------------------------
-- 3 · Permisos
--
-- Las dos son SECURITY DEFINER y cruzan tenants. Postgres las abre a public
-- por defecto: sin esto, cualquiera con la clave del navegador sabría
-- cuántos clientes hay, cómo se llaman y cuáles están a punto de irse.
-- ------------------------------------------------------------
revoke execute on function panel_salud()            from public, anon;
revoke execute on function panel_clientes_riesgo()  from public, anon;

grant execute on function panel_salud()           to authenticated;
grant execute on function panel_clientes_riesgo() to authenticated;
