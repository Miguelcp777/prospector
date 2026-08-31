-- ============================================================
-- Prospector · 010 · enriquecimiento (Fase 2)
-- Ejecutar después de 009.
--
-- Places no devuelve correos. De 892 leads descubiertos, 0 tienen email y
-- ~88 % tienen web. El email sale de ahí: entrar en el sitio, encontrar el
-- buzón y validar el MX.
--
-- Reusa la maquinaria de `descubrir` — jobs, job_tareas, cron — porque el
-- problema es el mismo: muchas unidades pequeñas que no caben en una sola
-- invocación. `jobs.tipo` ya admitía 'enriquecer' desde el esquema inicial.
--
-- A diferencia del descubrimiento, esto NO cuesta dinero: son peticiones
-- HTTP a webs públicas, sin API de pago. Por eso no toca los contadores de
-- consultas ni los techos de gasto.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La unidad de trabajo del enriquecimiento es un lead
--
-- `query` sigue siendo NOT NULL y ahí va la URL: mantiene la tabla como
-- estaba y el detalle de la tarea sigue diciendo sobre qué trabajó.
-- ------------------------------------------------------------
alter table job_tareas add column if not exists lead_id uuid references leads(id) on delete cascade;

create index if not exists job_tareas_lead on job_tareas(lead_id) where lead_id is not null;

-- ------------------------------------------------------------
-- 2 · De dónde salió el email, para poder responder a una reclamación
--
-- compliance.md pide «registro de origen del dato por lead (fuente y
-- fecha)». Para el nombre y la dirección ya estaba `fuente`; para el email
-- hacía falta esto: de qué URL concreta se sacó y cuándo.
-- ------------------------------------------------------------
alter table leads add column if not exists email_origen text;
alter table leads add column if not exists email_capturado_en timestamptz;

comment on column leads.email_origen is
  'URL exacta de donde se leyó el email. Sin esto no se puede justificar el origen del dato.';

-- ------------------------------------------------------------
-- 3 · Encolar el enriquecimiento de una campaña
--
-- Solo leads con web y sin email: los que ya lo tienen no se vuelven a
-- visitar, y los que no tienen web no hay por dónde cogerlos.
-- ------------------------------------------------------------
create or replace function encolar_enriquecimiento(p_campaign uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_job    uuid;
  v_tareas int;
begin
  select tenant_id into v_tenant from campaigns where id = p_campaign;

  if v_tenant is null then
    raise exception 'Campaña no encontrada';
  end if;

  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jobs
    where campaign_id = p_campaign
      and tipo = 'enriquecer'
      and estado in ('pendiente','en_curso')
  ) then
    raise exception 'Ya hay un enriquecimiento en curso para esta campaña';
  end if;

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'enriquecer', 'pendiente', 'En cola')
  returning id into v_job;

  insert into job_tareas (job_id, tenant_id, campaign_id, segment_id, lead_id, query)
  select v_job, v_tenant, p_campaign, l.segment_id, l.id, l.web
    from leads l
   where l.campaign_id = p_campaign
     and l.web is not null
     and l.email is null;

  get diagnostics v_tareas = row_count;

  if v_tareas = 0 then
    update jobs set estado = 'hecho',
                    progreso = 100,
                    detalle = 'No hay leads con web pendientes de enriquecer',
                    actualizado_en = now()
    where id = v_job;
  end if;

  return v_job;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · Cerrar el job según su tipo
--
-- El cierre era de 'descubrir' y lo daba por supuesto: marcaba la campaña
-- 'lista' y sellaba ultima_busqueda_en. Un enriquecimiento que hiciera eso
-- reiniciaría el enfriado de 30 días sin haber tocado Places, y dejaría al
-- cliente pudiendo repetir el descubrimiento gratis.
--
-- El recálculo de scores sí aplica a los dos: un email nuevo suma 20 puntos.
-- ------------------------------------------------------------
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
   returning campaign_id, tipo into v_campaign, v_tipo;

  if v_pendientes > 0 then
    -- El techo de gasto solo frena al descubrimiento: enriquecer no paga API.
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

    if not v_agotado then
      return false;
    end if;

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
      return false;
    end if;
  end if;

  -- Vale para los dos: un email encontrado suma 20 puntos al score.
  perform recalcular_scores(v_campaign);

  update jobs
     set estado   = case when v_errores > 0 and v_hechas = 0 then 'error' else 'hecho' end,
         progreso = 100,
         detalle  = case
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

  -- Solo el descubrimiento cambia el estado de la campaña y sella la fecha.
  if v_tipo = 'descubrir' then
    update campaigns
       set estado = case when v_hechas = 0 and v_errores > 0 then 'error' else 'lista' end,
           ultima_busqueda_en = case when v_hechas > 0 then now() else ultima_busqueda_en end
     where id = v_campaign;
  end if;

  return true;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Permisos
-- ------------------------------------------------------------
revoke execute on function cerrar_job_si_completo(uuid)     from public, anon, authenticated;
revoke execute on function encolar_enriquecimiento(uuid)    from public, anon;

grant  execute on function cerrar_job_si_completo(uuid)     to service_role;
grant  execute on function encolar_enriquecimiento(uuid)    to authenticated;
