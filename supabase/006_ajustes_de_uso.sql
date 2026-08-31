-- ============================================================
-- Prospector · 006 · tres cosas que solo se vieron usándolo
-- Ejecutar después de 005.
--
-- Los tres salieron de la primera ejecución real del descubrimiento, no de
-- leer el código.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · tenant_id se rellena solo
--
-- La RLS comprueba el valor pero no lo pone, así que un insert sin
-- tenant_id muere con «42501 – new row violates row-level security policy».
-- El frontend tendría que averiguar su propio tenant antes de cada insert,
-- y el día que a alguien se le olvide, el error no dice qué falta.
--
-- El DEFAULT no debilita nada: la política sigue comprobando que coincida
-- con auth_tenant_id(). Solo evita tener que escribirlo a mano.
-- ------------------------------------------------------------
alter table campaigns alter column tenant_id set default auth_tenant_id();
alter table segments  alter column tenant_id set default auth_tenant_id();
alter table leads     alter column tenant_id set default auth_tenant_id();
alter table messages  alter column tenant_id set default auth_tenant_id();

-- ------------------------------------------------------------
-- 2 · Una campaña que no descubrió nada no está «lista»
--
-- cerrar_job_si_completo la marcaba 'lista' pasara lo que pasara. En la
-- primera ejecución real el job acabó con 3 de 3 búsquedas fallidas y 0
-- leads, y la campaña se quedó en 'lista': en la pantalla eso se lee como
-- «terminada, sin resultados» en vez de «falló».
--
-- Distinguimos el fallo total del parcial: con algún lead descubierto la
-- campaña sí sirve, y el detalle del job ya cuenta cuántas búsquedas
-- fallaron.
-- ------------------------------------------------------------
alter table campaigns drop constraint if exists campaigns_estado_check;
alter table campaigns add  constraint campaigns_estado_check
  check (estado in ('borrador','inferido','buscando','lista','error','archivada'));

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
  v_total      int;
  v_campaign   uuid;
begin
  select count(*) filter (where estado in ('pendiente','en_curso')),
         count(*) filter (where estado = 'hecho'),
         count(*) filter (where estado = 'error'),
         count(*)
    into v_pendientes, v_hechas, v_errores, v_total
    from job_tareas where job_id = p_job;

  update jobs
     set progreso = case when v_total = 0 then 0
                         else (v_hechas * 100) / v_total end,
         estado   = case when estado = 'pendiente' then 'en_curso' else estado end,
         actualizado_en = now()
   where id = p_job
   returning campaign_id into v_campaign;

  if v_pendientes > 0 then
    return false;
  end if;

  perform recalcular_scores(v_campaign);

  update jobs
     set estado   = case when v_errores > 0 then 'error' else 'hecho' end,
         progreso = 100,
         detalle  = case
                      when v_errores = 0 then 'Descubrimiento completado'
                      else format('Completado con %s de %s búsquedas fallidas',
                                  v_errores, v_total)
                    end,
         actualizado_en = now()
   where id = p_job;

  -- Ninguna búsqueda salió: no hay campaña que enseñar, hay un fallo.
  update campaigns
     set estado = case when v_hechas = 0 and v_errores > 0 then 'error' else 'lista' end
   where id = v_campaign;

  return true;
end;
$fn$;

-- ------------------------------------------------------------
-- 3 · Los reintentos esperan al siguiente ciclo del cron
--
-- El código da tres intentos porque «Places falla por rachas: rate limit,
-- un 503 suelto». Pero devolverACola deja la tarea pendiente y el bucle de
-- la MISMA invocación la reclama otra vez enseguida: en la ejecución real
-- los nueve intentos cayeron en 2,1 segundos. Contra un rate limit eso
-- quema los tres justo cuando reintentar no puede funcionar.
--
-- devolverACola no toca reclamada_en, así que ese sello sirve de enfriado.
-- 90 s garantiza saltar al menos un ciclo del cron, que va cada minuto.
-- Una tarea nueva tiene reclamada_en null y entra sin esperar.
-- ------------------------------------------------------------
create or replace function reclamar_tareas(p_limite int default 5)
returns setof job_tareas
language sql
security definer
set search_path = public
as $fn$
  update job_tareas t
     set estado = 'en_curso',
         intentos = t.intentos + 1,
         reclamada_en = now(),
         actualizado_en = now()
   where t.id in (
     select t2.id
       from job_tareas t2
       join jobs j on j.id = t2.job_id
      where t2.estado = 'pendiente'
        and j.estado in ('pendiente','en_curso')
        and j.consultas < (select c.max_consultas from campaigns c where c.id = j.campaign_id)
        -- Enfriado del reintento. Sin esto, reintentar es repetir.
        and (t2.reclamada_en is null or t2.reclamada_en < now() - interval '90 seconds')
      order by t2.creado_en
      limit p_limite
      for update of t2 skip locked
   )
  returning t.*;
$fn$;

-- Los GRANT no sobreviven a un CREATE OR REPLACE que cambia la firma, pero
-- sí a este. Se repiten por si acaso: que el worker se quede sin permiso es
-- un fallo silencioso que ya nos costó una vez.
revoke execute on function reclamar_tareas(int)         from public, anon, authenticated;
revoke execute on function cerrar_job_si_completo(uuid) from public, anon, authenticated;
grant  execute on function reclamar_tareas(int)         to service_role;
grant  execute on function cerrar_job_si_completo(uuid) to service_role;
