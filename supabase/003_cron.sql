-- ============================================================
-- Prospector · 003 · despertador del worker
--
-- Ejecutar DESPUÉS de 002 y DESPUÉS de desplegar la función `descubrir`.
--
-- Este archivo ya NO tiene huecos que rellenar. El secreto del worker lo
-- genera Postgres y se queda en Vault: así no hay ningún momento en que
-- esté escrito en un archivo del repo, que es de donde nunca se va del
-- todo una vez commiteado.
--
-- Después de ejecutarlo hay UN paso manual, abajo del todo: copiar ese
-- secreto a los secretos de las Edge Functions, porque `descubrir` compara
-- contra su propia copia.
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

-- 32 bytes aleatorios en hexadecimal — lo mismo que `openssl rand -hex 32`,
-- pero generado dentro de la base y sin pasar por el portapapeles de nadie.
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'worker_secreto');

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

-- ============================================================
-- EL PASO MANUAL
--
-- `descubrir` compara la cabecera contra su propio WORKER_SECRETO, que vive
-- en los secretos de las Edge Functions y no puede leer Vault. Hay que
-- copiarlo. Lee el valor:
--
--   select decrypted_secret from vault.decrypted_secrets
--    where name = 'worker_secreto';
--
-- Y fíjalo en las funciones:
--
--   supabase secrets set WORKER_SECRETO=<lo que salga arriba>
--
-- Hasta que los dos coincidan, el cron despierta al worker cada minuto y
-- se lleva un 401. No rompe nada, pero tampoco descubre nada.
-- ============================================================

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
