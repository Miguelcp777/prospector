-- ============================================================
-- Prospector · 003 · despertador del worker
--
-- Ejecutar DESPUÉS de 002 y DESPUÉS de desplegar la función `descubrir`.
--
-- ANTES DE EJECUTAR, sustituye los tres valores de abajo. No dejes el
-- secreto del worker en un archivo del repo: escríbelo aquí solo mientras
-- lo pegas en el SQL Editor.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- Credenciales en Vault, no en el cuerpo del cron.
-- cron.job es legible por cualquiera con acceso a la base: un secreto
-- escrito en el `command` queda a la vista de todo el que la mire.
-- ------------------------------------------------------------
-- Borrar antes de crear: vault.create_secret falla si el nombre ya existe,
-- y este archivo se re-ejecuta cada vez que se rota el secreto del worker.
delete from vault.secrets where name in ('url_proyecto', 'worker_secreto');

select vault.create_secret('https://tpfjeumrvdbciktmaaii.supabase.co', 'url_proyecto');
select vault.create_secret('TU_WORKER_SECRETO',                        'worker_secreto');

-- ------------------------------------------------------------
-- Cada minuto: despierta al worker.
--
-- Solaparse no es problema: reclamar_tareas usa SKIP LOCKED, así que dos
-- invocaciones a la vez se reparten tareas distintas en vez de duplicar
-- consultas a Places. Si no hay nada en cola, la función sale enseguida.
-- ------------------------------------------------------------
select cron.schedule(
  'prospector-descubrir',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'url_proyecto')
           || '/functions/v1/descubrir',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secreto',
      (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secreto')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

-- ------------------------------------------------------------
-- Cada noche: limpia el contador de la demo.
-- ------------------------------------------------------------
select cron.schedule(
  'prospector-limpiar-demo',
  '0 4 * * *',
  $cron$ select limpiar_demo_usos(); $cron$
);

-- ------------------------------------------------------------
-- Comprobaciones
-- ------------------------------------------------------------
-- Qué hay programado:
--   select jobname, schedule, active from cron.job;
--
-- Si algo falla, el error está aquí (no en los logs de la función):
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 20;
--
-- Para pararlo:
--   select cron.unschedule('prospector-descubrir');
