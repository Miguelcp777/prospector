-- ============================================================
-- Prospector · 052 · el trabajo arranca al encolarlo, no al minuto
--
-- EL SÍNTOMA
--
-- «La barra de progreso estaba a cero y de repente había 50 leads.»
--
-- LA CAUSA, MEDIDA SOBRE EL JOB REAL
--
-- El descubrimiento 3296f746 de la campaña de tatuajes:
--
--   11:07:21  encolado      · estado pendiente, progreso 0
--   11:08:07  terminado     · 5 búsquedas hechas, 19 omitidas por modo demo
--
-- Cuarenta y seis segundos en total, de los cuales **treinta y nueve no pasó
-- nada**: `encolar_descubrimiento` crea el job y las tareas, y ahí se queda
-- hasta que `pg_cron` despierta al worker en el siguiente minuto redondo. El
-- trabajo de verdad duró siete segundos, y en siete segundos con el techo
-- del modo demo no hay barra que enseñar.
--
-- O sea: la barra no estaba rota. Estaba esperando, y no lo decía.
--
-- Que el reloj del cron decida cuándo empieza algo que el usuario acaba de
-- pulsar es lo que convierte «buscar clientes» en «no ha pasado nada».
--
-- EL ARREGLO
--
-- Al insertar un job, se llama a su worker inmediatamente. El cron sigue
-- puesto y sigue haciendo falta: es quien recoge lo que quede a medias, lo
-- que se reponga por `reponer_tareas_colgadas` y las tandas siguientes de un
-- trabajo que no cabe en una invocación. Esto solo le quita la primera
-- espera, que es la única que alguien está mirando.
--
-- POR QUÉ UN TRIGGER Y NO UNA LÍNEA EN CADA `encolar_*`
--
-- Son tres funciones —descubrimiento, enriquecimiento y redacción— y cada
-- una tiene ya sus comprobaciones de techo, de pausa y de modo demo. Añadir
-- la misma llamada al final de las tres es garantizar que la cuarta se
-- olvide. En el trigger está escrito una vez y cubre a cualquiera que inserte
-- un job, ahora y después.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Llamar a un worker
--
-- Mismo mecanismo que el cron de la 003: `pg_net` y el secreto del Vault, que
-- es lo que `descubrir` compara contra su propio `WORKER_SECRETO`. El secreto
-- no aparece escrito en ningún sitio legible: `cron.job` sí lo estaría, y por
-- eso la 003 ya lo sacó de ahí.
--
-- `net.http_post` **no bloquea**: encola la petición en una tabla y la manda
-- un proceso de fondo después del commit. Eso importa por dos motivos. El
-- primero, que quien pulsa el botón no espera a que arranque el worker. El
-- segundo, que si la transacción se deshace —una comprobación de techo que
-- salta después— la llamada se deshace con ella, y no se despierta a nadie
-- para un trabajo que no existe.
-- ------------------------------------------------------------
create or replace function despertar_worker(p_funcion text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_url     text;
  v_secreto text;
begin
  -- Lista blanca. Esta función compone una URL y le pone el secreto del
  -- worker dentro: sin acotar el nombre, quien pudiera llamarla apuntaría esa
  -- cabecera a cualquier función del proyecto.
  if p_funcion not in ('descubrir', 'enriquecer', 'redactar') then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'url_proyecto';
  select decrypted_secret into v_secreto
    from vault.decrypted_secrets where name = 'worker_secreto';

  -- Sin secretos no se inventa nada: el cron lo recogerá al minuto, que es
  -- exactamente el comportamiento de antes de esta migración.
  if v_url is null or v_secreto is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/' || p_funcion,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-worker-secreto', v_secreto),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$fn$;

-- SECURITY DEFINER y lee el Vault: se cierra y se abre a mano. No la llama
-- nadie desde fuera —la dispara el trigger de abajo— así que no se concede a
-- `authenticated`.
revoke execute on function despertar_worker(text) from public, anon, authenticated;
grant  execute on function despertar_worker(text) to postgres, service_role;

-- ------------------------------------------------------------
-- 2 · Al encolar, despertar
--
-- `puntuar` no tiene worker propio: el scoring es SQL y lo dispara
-- `cerrar_job_si_completo`. Cae en la lista blanca de arriba y no pasa nada.
-- ------------------------------------------------------------
create or replace function despertar_al_encolar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Un job que nace ya en error —«la campaña no tiene segmentos aceptados»—
  -- no tiene a quién despertar.
  if new.estado = 'pendiente' then
    perform despertar_worker(new.tipo);
  end if;
  return new;
end;
$fn$;

revoke execute on function despertar_al_encolar() from public, anon, authenticated;

drop trigger if exists arrancar_al_encolar on jobs;
create trigger arrancar_al_encolar
  after insert on jobs
  for each row execute function despertar_al_encolar();

-- ------------------------------------------------------------
-- 3 · El progreso cuenta también lo que falló
--
-- `cerrar_job_si_completo` sumaba «hechas + omitidas» y dejaba fuera las de
-- estado `error`. Una tarea que ha agotado sus tres intentos no va a volver a
-- ejecutarse, así que contarla como pendiente deja la barra corta para
-- siempre: un job con dos búsquedas caídas se quedaba en el 90 % hasta que
-- el cierre lo forzaba de golpe al 100.
-- ------------------------------------------------------------
-- Es el mismo cuerpo de la 040 con una línea cambiada: la del `progreso`.
-- Se reescribe entero porque `create or replace` no sabe parchear, y queda
-- aquí para que el repo siga siendo la fuente de verdad.
create or replace function cerrar_job_si_completo(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pendientes int;
  v_hechas     int;
  v_errores    int;
  v_omitidas   int;
  v_total      int;
  v_campaign   uuid;
  v_tipo       text;
  v_agotado    boolean;
  v_por_demo   boolean;
  v_estado     text;
begin
  select estado into v_estado from jobs where id = p_job;

  -- Cancelar no es fallar (040): un job cancelado no se resucita a 'hecho'
  -- porque la tarea que estaba en vuelo termine después.
  if v_estado = 'cancelado' then
    return true;
  end if;

  select count(*) filter (where estado in ('pendiente','en_curso')),
         count(*) filter (where estado = 'hecho'),
         count(*) filter (where estado = 'error'),
         count(*) filter (where estado = 'omitida'),
         count(*)
    into v_pendientes, v_hechas, v_errores, v_omitidas, v_total
    from job_tareas where job_id = p_job;

  update jobs
     set progreso = case when v_total = 0 then 0
                         -- Aquí está el cambio de la 052: las caídas también
                         -- cuentan. Una tarea con sus tres intentos gastados
                         -- no va a volver, y contarla como pendiente dejaba
                         -- la barra corta hasta el salto final.
                         else ((v_hechas + v_omitidas + v_errores) * 100) / v_total end,
         estado   = case when estado = 'pendiente' then 'en_curso' else estado end,
         actualizado_en = now()
   where id = p_job
   returning campaign_id, tipo into v_campaign, v_tipo;

  v_por_demo := v_tipo = 'descubrir'
                and coalesce(huecos_de_leads(v_campaign), 1) = 0;

  if v_pendientes > 0 then
    if v_tipo <> 'descubrir' then
      return false;
    end if;

    select j.consultas >= c.max_consultas
        or coalesce((select cp.consultas from consumo_places cp
                      where cp.tenant_id = j.tenant_id
                        and cp.mes = date_trunc('month', current_date)::date), 0)
           >= (select tn.max_consultas_mes from tenants tn where tn.id = j.tenant_id)
      into v_agotado
      from jobs j join campaigns c on c.id = j.campaign_id
     where j.id = p_job;

    if not v_agotado and not v_por_demo then
      return false;
    end if;

    update job_tareas
       set estado = 'omitida',
           detalle = case when v_por_demo and not v_agotado
                          then 'No ejecutada: modo demo, techo de leads alcanzado'
                          else 'No ejecutada: techo de consultas alcanzado' end,
           actualizado_en = now()
     where job_id = p_job and estado = 'pendiente';

    select count(*) filter (where estado in ('pendiente','en_curso')),
           count(*) filter (where estado = 'omitida')
      into v_pendientes, v_omitidas
      from job_tareas where job_id = p_job;

    if v_pendientes > 0 then
      return false;
    end if;
  end if;

  perform recalcular_scores(v_campaign);

  update jobs
     set estado   = case when v_errores > 0 and v_hechas = 0 then 'error' else 'hecho' end,
         progreso = 100,
         detalle  = case
                      when v_omitidas > 0 and v_por_demo then
                        format('Parado por el modo demo: %s de %s búsquedas hechas, %s sin ejecutar',
                               v_hechas, v_total, v_omitidas)
                      when v_omitidas > 0 then
                        format('Parado al llegar al techo de consultas: %s de %s hechas, %s sin ejecutar',
                               v_hechas, v_total, v_omitidas)
                      when v_errores > 0 then
                        format('Completado con %s de %s fallidas', v_errores, v_total)
                      when v_tipo = 'enriquecer' then 'Enriquecimiento completado'
                      else 'Descubrimiento completado'
                    end,
         actualizado_en = now()
   where id = p_job;

  if v_tipo = 'descubrir' then
    update campaigns
       set estado = case when v_hechas = 0 and v_errores > 0 then 'error' else 'lista' end,
           ultima_busqueda_en = case when v_hechas > 0 then now() else ultima_busqueda_en end
     where id = v_campaign;
  end if;

  return true;
end;
$fn$;

-- Se saltaba la RLS ya antes; el `create or replace` conserva los permisos,
-- pero se dejan escritos para que la migración se pueda leer sola.
revoke execute on function cerrar_job_si_completo(uuid) from public, anon, authenticated;
grant  execute on function cerrar_job_si_completo(uuid) to service_role;
