-- ============================================================
-- Prospector · 008 · cerrar el job cuando se agota el presupuesto
-- Ejecutar después de 007.
--
-- Bloqueo mutuo, anterior a 007 y descubierto en cuanto una campaña real
-- alcanzó su techo por primera vez:
--
--   reclamar_tareas       deja de servir tareas al llegar a max_consultas
--   cerrar_job_si_completo no cierra el job mientras queden pendientes
--
-- Resultado: 25 tareas pendientes que nadie va a reclamar nunca, job en
-- 'en_curso' al 66% para siempre, campaña clavada en 'buscando' — y
-- encolar_descubrimiento rechazando cualquier intento nuevo porque "ya hay
-- un descubrimiento en curso". El usuario queda encerrado en su campaña.
--
-- Alcanzar el techo no es un fallo: es el sistema haciendo su trabajo. Lo
-- que faltaba era decirlo y cerrar.
-- ============================================================

-- Estado nuevo: no se hizo, pero tampoco falló.
alter table job_tareas drop constraint if exists job_tareas_estado_check;
alter table job_tareas add  constraint job_tareas_estado_check
  check (estado in ('pendiente','en_curso','hecho','error','omitida'));

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
  v_agotado    boolean;
begin
  select count(*) filter (where estado in ('pendiente','en_curso')),
         count(*) filter (where estado = 'hecho'),
         count(*) filter (where estado = 'error'),
         count(*) filter (where estado = 'omitida'),
         count(*)
    into v_pendientes, v_hechas, v_errores, v_omitidas, v_total
    from job_tareas where job_id = p_job;

  update jobs
     set progreso = case when v_total = 0 then 0
                         else ((v_hechas + v_omitidas) * 100) / v_total end,
         estado   = case when estado = 'pendiente' then 'en_curso' else estado end,
         actualizado_en = now()
   where id = p_job
   returning campaign_id into v_campaign;

  if v_pendientes > 0 then
    -- ¿Quedan pendientes porque falta trabajo, o porque ya no hay dinero?
    select j.consultas >= c.max_consultas
        or coalesce((select cp.consultas from consumo_places cp
                      where cp.tenant_id = j.tenant_id
                        and cp.mes = date_trunc('month', current_date)::date), 0)
           >= (select tn.max_consultas_mes from tenants tn where tn.id = j.tenant_id)
      into v_agotado
      from jobs j join campaigns c on c.id = j.campaign_id
     where j.id = p_job;

    if not v_agotado then
      return false;      -- Sigue habiendo presupuesto: que trabaje el worker.
    end if;

    -- Sin presupuesto nadie las va a reclamar. Cerrarlas es decir la verdad.
    -- Solo las pendientes: una 'en_curso' la está resolviendo alguien ahora.
    update job_tareas
       set estado = 'omitida',
           detalle = 'No ejecutada: techo de consultas alcanzado',
           actualizado_en = now()
     where job_id = p_job and estado = 'pendiente';

    select count(*) filter (where estado in ('pendiente','en_curso')),
           count(*) filter (where estado = 'omitida')
      into v_pendientes, v_omitidas
      from job_tareas where job_id = p_job;

    if v_pendientes > 0 then
      return false;      -- Alguna sigue en_curso: cerramos en la próxima vuelta.
    end if;
  end if;

  perform recalcular_scores(v_campaign);

  update jobs
     set estado   = case when v_errores > 0 then 'error' else 'hecho' end,
         progreso = 100,
         detalle  = case
                      when v_omitidas > 0 then
                        format('Parado al llegar al techo de consultas: %s de %s búsquedas hechas, %s sin ejecutar',
                               v_hechas, v_total, v_omitidas)
                      when v_errores > 0 then
                        format('Completado con %s de %s búsquedas fallidas', v_errores, v_total)
                      else 'Descubrimiento completado'
                    end,
         actualizado_en = now()
   where id = p_job;

  update campaigns
     set estado = case when v_hechas = 0 and v_errores > 0 then 'error' else 'lista' end,
         ultima_busqueda_en = case when v_hechas > 0 then now() else ultima_busqueda_en end
   where id = v_campaign;

  return true;
end;
$fn$;

revoke execute on function cerrar_job_si_completo(uuid) from public, anon, authenticated;
grant  execute on function cerrar_job_si_completo(uuid) to service_role;
