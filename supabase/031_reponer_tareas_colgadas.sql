-- ============================================================
-- Prospector · 031 · devolver a la cola las tareas colgadas
--
-- La decisión 0002 dice, entre las razones para trocear el trabajo:
--
--   «Si una invocación muere a mitad, la tarea vuelve a la cola y no se
--    pierde nada.»
--
-- No era verdad. Nada la devolvía. `reclamar_tareas` marca 'en_curso' y
-- solo vuelve a coger tareas 'pendiente', así que una invocación que se
-- muere —timeout, despliegue a mitad, un 500 del proveedor— deja la tarea
-- fuera del alcance de todo el mundo para siempre.
--
-- Cómo se vio: 38 tareas de enriquecimiento reclamadas entre el 31 de
-- agosto y el 1 de septiembre seguían en 'en_curso' cinco días después, con
-- el cron corriendo cada minuto y sin un solo error. Sus tres jobs
-- llevaban igual de parados, sin poder cerrarse nunca, porque
-- `cerrar_job_si_completo` cuenta 'en_curso' como pendiente.
--
-- Ejecutar DESPUÉS de 030_salud_y_riesgo.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Reponer
--
-- Dos caminos, y el segundo es el que evita el bucle: una tarea que ya se
-- ha intentado bastantes veces no vuelve a la cola, se marca en error. Sin
-- ese techo, una tarea que siempre revienta se repone cada cinco minutos
-- para siempre y se lleva por delante la cuota del proveedor.
--
-- El umbral de tiempo es generoso a propósito. El wall clock de una Edge
-- Function son 150 s en plan free; quince minutos es diez veces eso, así
-- que no repone nada que solo estuviera tardando.
-- ------------------------------------------------------------
create or replace function reponer_tareas_colgadas(
  p_minutos      int default 15,
  p_max_intentos int default 3
)
returns table (repuestas int, rendidas int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_repuestas int;
  v_rendidas  int;
  v_job       uuid;
begin
  -- Las que aún tienen crédito vuelven a la cola tal cual. `intentos` ya lo
  -- subió reclamar_tareas al cogerlas, así que no hay que tocarlo aquí.
  with vueltas as (
    update job_tareas
       set estado = 'pendiente',
           reclamada_en = null,
           detalle = 'Se quedó colgada y volvió a la cola',
           actualizado_en = now()
     where estado = 'en_curso'
       and reclamada_en < now() - make_interval(mins => p_minutos)
       and intentos < p_max_intentos
    returning 1
  )
  select count(*) into v_repuestas from vueltas;

  -- Las que ya han gastado sus intentos se dan por perdidas, con el motivo
  -- escrito. Quedarse en 'en_curso' es peor: no se reintenta, no se cuenta
  -- como fallo y el job no cierra.
  with perdidas as (
    update job_tareas
       set estado = 'error',
           detalle = format('Abandonada tras %s intentos sin terminar', intentos),
           actualizado_en = now()
     where estado = 'en_curso'
       and reclamada_en < now() - make_interval(mins => p_minutos)
       and intentos >= p_max_intentos
    returning 1
  )
  select count(*) into v_rendidas from perdidas;

  -- Y cerrar lo que haya quedado completo. Un job cuya última tarea acaba
  -- de rendirse ya no tiene nada pendiente, y sin esto se queda 'en_curso'
  -- eternamente aunque no quede trabajo.
  for v_job in
    select distinct job_id from job_tareas t
     join jobs j on j.id = t.job_id
    where j.estado in ('pendiente','en_curso')
  loop
    perform cerrar_job_si_completo(v_job);
  end loop;

  return query select v_repuestas, v_rendidas;
end;
$fn$;

-- ------------------------------------------------------------
-- 2 · Que corra sola
--
-- Cada cinco minutos. Más a menudo no sirve —el umbral son quince— y menos
-- deja campañas paradas un rato largo sin motivo.
-- ------------------------------------------------------------
select cron.unschedule('prospector-reponer-colgadas')
 where exists (select 1 from cron.job where jobname = 'prospector-reponer-colgadas');

select cron.schedule(
  'prospector-reponer-colgadas',
  '*/5 * * * *',
  $cron$ select reponer_tareas_colgadas(); $cron$
);

-- ------------------------------------------------------------
-- 3 · Permisos
--
-- SECURITY DEFINER y se salta la RLS: toca tareas de cualquier tenant.
-- Postgres la abre a public por defecto, y ahí cualquiera con la clave del
-- navegador podría reponer —o rendir— tareas ajenas.
--
-- La llama pg_cron, que corre como postgres.
-- ------------------------------------------------------------
revoke execute on function reponer_tareas_colgadas(int, int)
  from public, anon, authenticated;
grant  execute on function reponer_tareas_colgadas(int, int) to postgres;
