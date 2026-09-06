-- ============================================================
-- Prospector · 032 · la salud distingue lo que arde de lo que ardió
--
-- El indicador de tareas fallidas de la 030 miraba siete días, y eso
-- convirtió un incidente cerrado en una alarma permanente: 443 errores de
-- un solo día —el 31 de agosto, saldo de Anthropic agotado y la Places API
-- (New) sin habilitar— pintaban el panel en rojo seis días después, con el
-- servicio funcionando bien.
--
-- Un tablero que enseña en rojo algo ya resuelto enseña a ignorarlo, que es
-- la única forma de que falle un tablero.
--
-- El estado lo decide ahora lo de las últimas 24 horas. Los siete días
-- siguen saliendo, pero como contexto y sin encender nada.
--
-- Ejecutar DESPUÉS de 031_reponer_tareas_colgadas.sql.
-- ============================================================

create or replace function panel_salud()
returns table (orden int, indicador text, valor text, estado text, detalle text)
language plpgsql
security definer
set search_path = public, cron
as $fn$
declare
  v_ultimo timestamptz; v_fallos int; v_atascadas int; v_parados int;
  v_err_dia int; v_tot_dia int; v_err_sem int; v_tot_sem int;
  v_motivo text; v_cuando date; v_incid int;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;

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

  -- Desde la 031 esto debería quedarse en cero solo: hay un cron que las
  -- devuelve a la cola cada cinco minutos. Si sube, es que se repone menos
  -- de lo que se cuelga, y eso ya es otro problema.
  select count(*) into v_atascadas from job_tareas
   where estado = 'en_curso' and reclamada_en < now() - interval '15 minutes';
  return query select 3, 'Tareas atascadas'::text, v_atascadas::text,
    case when v_atascadas = 0 then 'ok' when v_atascadas < 10 then 'aviso' else 'mal' end,
    'Reclamadas hace más de 15 min. Un cron las repone cada 5; si se acumulan, no da abasto.'::text;

  select count(*) into v_parados from jobs
   where estado = 'en_curso' and actualizado_en < now() - interval '30 minutes';
  return query select 4, 'Trabajos parados'::text, v_parados::text,
    case when v_parados = 0 then 'ok' when v_parados < 3 then 'aviso' else 'mal' end,
    'En curso y sin avanzar en media hora. La campaña se queda a medias sin decirlo.'::text;

  -- Lo de hoy es lo que enciende la luz.
  select count(*) filter (where estado = 'error'), count(*)
    into v_err_dia, v_tot_dia
    from job_tareas where creado_en > now() - interval '24 hours';

  return query select 5, 'Tareas fallidas (24 h)'::text,
    case when coalesce(v_tot_dia, 0) = 0 then 'sin trabajo hoy'
         else v_err_dia || ' de ' || v_tot_dia || ' · ' || round(v_err_dia * 100.0 / v_tot_dia) || '%' end,
    case when coalesce(v_tot_dia, 0) = 0 then 'ok'
         when v_err_dia * 100.0 / v_tot_dia < 2  then 'ok'
         when v_err_dia * 100.0 / v_tot_dia < 10 then 'aviso'
         else 'mal' end,
    'Lo que está fallando ahora. Es lo que decide si hay que mirar algo.'::text;

  -- Y lo de la semana, como contexto. Nunca enciende: si algo ardió hace
  -- cinco días y ya está apagado, no es una alarma, es historia.
  select count(*) filter (where estado = 'error'), count(*)
    into v_err_sem, v_tot_sem
    from job_tareas where creado_en > now() - interval '7 days';

  return query select 6, 'Tareas fallidas (7 días)'::text,
    case when coalesce(v_tot_sem, 0) = 0 then 'sin trabajo'
         else v_err_sem || ' de ' || v_tot_sem || ' · ' || round(v_err_sem * 100.0 / v_tot_sem) || '%' end,
    'ok'::text,
    'Contexto, no alarma. Un incidente ya cerrado sigue contando aquí varios días.'::text;

  -- El motivo, con su fecha: sin ella no se distingue "está pasando" de
  -- "pasó la semana pasada", que es justo lo que había que arreglar.
  select left(coalesce(t.detalle, '(sin detalle)'), 90), max(t.creado_en)::date
    into v_motivo, v_cuando
    from job_tareas t
   where t.estado = 'error' and t.creado_en > now() - interval '7 days'
   group by 1 order by count(*) desc limit 1;

  return query select 7, 'Motivo más repetido'::text,
    coalesce(v_motivo, 'ninguno') ||
      coalesce(' · último el ' || to_char(v_cuando, 'DD/MM'), ''),
    case when v_motivo is null then 'ok'
         when v_cuando >= current_date - 1 then 'aviso'
         else 'ok' end,
    'El error que más se repite esta semana, con el día en que se vio por última vez.'::text;

  select count(*) into v_incid from incidencias where estado <> 'resuelta';
  return query select 8, 'Incidencias abiertas'::text, v_incid::text,
    case when v_incid = 0 then 'ok' when v_incid < 5 then 'aviso' else 'mal' end,
    'Fallos que la app registró y nadie ha cerrado.'::text;
end;
$fn$;

revoke execute on function panel_salud() from public, anon;
grant  execute on function panel_salud() to authenticated;
