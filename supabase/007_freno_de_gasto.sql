-- ============================================================
-- Prospector · 007 · freno de gasto en Places
-- Ejecutar después de 006.
--
-- Dos agujeros que se ven al usar la app, no al leerla:
--
-- 1. Nada impedía repetir el descubrimiento de una campaña al día
--    siguiente. Places devuelve prácticamente lo mismo y se paga otra vez.
--    Comprobado: la segunda pasada del piloto gastó 9 consultas y trajo 0
--    leads nuevos.
--
-- 2. max_consultas es el techo POR JOB, no por campaña ni por periodo.
--    jobs.consultas nace a 0 en cada job, así que diez clics en "Buscar
--    leads" son diez veces el techo. Con los 120 por defecto, eso son unos
--    36 € en una tarde sin salirse de ningún límite.
--
-- El freno vive aquí y no en el frontend: con la anon key, cualquiera puede
-- llamar a la RPC directamente.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Cuándo se buscó por última vez
-- ------------------------------------------------------------
alter table campaigns add column if not exists ultima_busqueda_en timestamptz;

comment on column campaigns.ultima_busqueda_en is
  'Fin del último descubrimiento que trajo algo. Null = nunca buscada.';

-- ------------------------------------------------------------
-- 2 · Techo de consultas por tenant y mes
--
-- max_consultas acota una campaña; esto acota la factura. Son cosas
-- distintas y hacían falta las dos.
-- ------------------------------------------------------------
alter table tenants add column if not exists max_consultas_mes int not null default 500
  check (max_consultas_mes between 0 and 100000);

create table if not exists consumo_places (
  tenant_id      uuid not null references tenants(id) on delete cascade,
  mes            date not null,               -- primer día del mes
  consultas      int  not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (tenant_id, mes)
);

alter table consumo_places enable row level security;

-- El cliente mira su gasto. Escribirlo es cosa del worker.
drop policy if exists consumo_del_tenant on consumo_places;
create policy consumo_del_tenant on consumo_places
  for select using (tenant_id = auth_tenant_id());

-- ------------------------------------------------------------
-- 3 · Contar la consulta en los dos sitios
--
-- Misma firma que antes, así que los GRANT existentes siguen valiendo.
-- ------------------------------------------------------------
create or replace function sumar_consulta(p_job uuid)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_total  int;
begin
  update jobs
     set consultas = consultas + 1, actualizado_en = now()
   where id = p_job
  returning tenant_id, consultas into v_tenant, v_total;

  insert into consumo_places (tenant_id, mes, consultas)
  values (v_tenant, date_trunc('month', current_date)::date, 1)
  on conflict (tenant_id, mes)
    do update set consultas = consumo_places.consultas + 1,
                  actualizado_en = now();

  return v_total;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · El worker deja de servir tareas al alcanzar cualquiera de los dos topes
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
        -- Techo de la campaña.
        and j.consultas < (select c.max_consultas from campaigns c where c.id = j.campaign_id)
        -- Techo mensual del tenant. Este es el que acota la factura.
        and coalesce((select cp.consultas from consumo_places cp
                       where cp.tenant_id = j.tenant_id
                         and cp.mes = date_trunc('month', current_date)::date), 0)
            < (select tn.max_consultas_mes from tenants tn where tn.id = j.tenant_id)
        -- Enfriado del reintento: sin esto, reintentar es repetir.
        and (t2.reclamada_en is null or t2.reclamada_en < now() - interval '90 seconds')
      order by t2.creado_en
      limit p_limite
      for update of t2 skip locked
   )
  returning t.*;
$fn$;

-- ------------------------------------------------------------
-- 5 · Marcar la fecha al cerrar un descubrimiento que trajo algo
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

  -- Solo cuenta como "buscada" si alguna búsqueda salió: si fallaron todas,
  -- el enfriado bloquearía un reintento legítimo por un fallo nuestro.
  update campaigns
     set estado = case when v_hechas = 0 and v_errores > 0 then 'error' else 'lista' end,
         ultima_busqueda_en = case when v_hechas > 0 then now() else ultima_busqueda_en end
   where id = v_campaign;

  return true;
end;
$fn$;

-- ------------------------------------------------------------
-- 6 · Encolar, ahora con los dos frenos
--
-- La firma cambia, así que hay que tirar la anterior: con las dos vivas,
-- una llamada de un solo argumento sería ambigua y PostgREST fallaría.
-- ------------------------------------------------------------
drop function if exists encolar_descubrimiento(uuid);

create or replace function encolar_descubrimiento(
  p_campaign uuid,
  p_forzar   boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant  uuid;
  v_job     uuid;
  v_tareas  int;
  v_ultima  timestamptz;
  v_dias    int;
  v_gastado int;
  v_techo   int;
begin
  select tenant_id, ultima_busqueda_en into v_tenant, v_ultima
    from campaigns where id = p_campaign;

  if v_tenant is null then
    raise exception 'Campaña no encontrada';
  end if;

  -- El filtro por tenant que la RLS ya no está haciendo por nosotros.
  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jobs
    where campaign_id = p_campaign
      and tipo = 'descubrir'
      and estado in ('pendiente','en_curso')
  ) then
    raise exception 'Ya hay un descubrimiento en curso para esta campaña';
  end if;

  -- Freno 1: repetir pronto es pagar dos veces por lo mismo. Places apenas
  -- cambia en semanas. A los meses sí compensa, y para eso está p_forzar.
  if not p_forzar and v_ultima is not null and v_ultima > now() - interval '30 days' then
    v_dias := ceil(extract(epoch from (v_ultima + interval '30 days' - now())) / 86400);
    raise exception
      'Esta campaña se buscó hace % días. Places devolverá prácticamente lo mismo, así que la búsqueda está en pausa % días más. Puedes forzarla si crees que ha cambiado algo.',
      floor(extract(epoch from (now() - v_ultima)) / 86400), v_dias;
  end if;

  -- Freno 2: el techo mensual del tenant. Este no se fuerza.
  select coalesce(cp.consultas, 0), tn.max_consultas_mes
    into v_gastado, v_techo
    from tenants tn
    left join consumo_places cp
      on cp.tenant_id = tn.id and cp.mes = date_trunc('month', current_date)::date
   where tn.id = v_tenant;

  if v_gastado >= v_techo then
    raise exception
      'Has gastado % de las % consultas de Places de este mes. El contador se reinicia el día 1.',
      v_gastado, v_techo;
  end if;

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'descubrir', 'pendiente', 'En cola')
  returning id into v_job;

  insert into job_tareas (job_id, tenant_id, campaign_id, segment_id, query)
  select v_job, v_tenant, p_campaign, s.id, q
  from segments s, unnest(s.queries) as q
  where s.campaign_id = p_campaign and s.aceptado;

  get diagnostics v_tareas = row_count;

  if v_tareas = 0 then
    update jobs set estado = 'error',
                    detalle = 'La campaña no tiene segmentos aceptados con queries',
                    actualizado_en = now()
    where id = v_job;
    return v_job;
  end if;

  update campaigns set estado = 'buscando' where id = p_campaign;

  return v_job;
end;
$fn$;

-- ------------------------------------------------------------
-- 7 · Permisos
-- ------------------------------------------------------------
revoke execute on function reclamar_tareas(int)                    from public, anon, authenticated;
revoke execute on function cerrar_job_si_completo(uuid)            from public, anon, authenticated;
revoke execute on function sumar_consulta(uuid)                    from public, anon, authenticated;
revoke execute on function encolar_descubrimiento(uuid, boolean)   from public, anon;

grant execute on function reclamar_tareas(int)                     to service_role;
grant execute on function cerrar_job_si_completo(uuid)             to service_role;
grant execute on function sumar_consulta(uuid)                     to service_role;
grant execute on function encolar_descubrimiento(uuid, boolean)    to authenticated;
