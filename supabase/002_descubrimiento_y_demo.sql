-- ============================================================
-- Prospector · 002 · descubrimiento troceado y demo pública
-- Ejecutar DESPUÉS de schema.sql, en el SQL Editor de Supabase.
--
-- Dos cosas:
--   1. Trocear el descubrimiento en tareas pequeñas, para que quepa en
--      Edge Functions. Ver docs/decisiones/0002-worker-en-supabase.md.
--   2. Contador de uso de la demo pública, para que nadie vacíe la cuenta
--      de Anthropic llamando a la inferencia en bucle.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Campañas: dónde buscar y cuánto gastar
-- ------------------------------------------------------------

-- Places necesita un centro en coordenadas, no un nombre de ciudad.
-- Lo geocodifica el worker en la primera tarea y lo cachea aquí.
alter table campaigns add column if not exists lat double precision;
alter table campaigns add column if not exists lng double precision;

-- Techo de consultas a Places por campaña. Places se paga por consulta y
-- escala con nº de segmentos × queries × páginas: sin techo, una campaña
-- mal configurada se lleva el presupuesto del mes.
alter table campaigns add column if not exists max_consultas int not null default 120
  check (max_consultas between 1 and 2000);

-- ------------------------------------------------------------
-- 2 · Jobs: cuánto se ha gastado ya
-- ------------------------------------------------------------
alter table jobs add column if not exists consultas int not null default 0;

-- ------------------------------------------------------------
-- 3 · Tareas: la unidad de trabajo que sí cabe en una Edge Function
--
-- Un job de descubrimiento se descompone en (segmento × query × página).
-- Cada invocación de la función se come unas pocas y se va. El estado del
-- recorrido vive aquí, no en memoria de un proceso.
-- ------------------------------------------------------------
create table if not exists job_tareas (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references jobs(id)      on delete cascade,
  tenant_id      uuid not null references tenants(id)   on delete cascade,
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  segment_id     uuid references segments(id) on delete cascade,

  query          text not null,
  pagina         int  not null default 1,
  page_token     text,                -- nextPageToken de Places para esta página

  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','en_curso','hecho','error')),
  intentos       int  not null default 0,
  detalle        text,
  reclamada_en   timestamptz,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists job_tareas_pendientes
  on job_tareas(job_id, creado_en) where estado = 'pendiente';
create index if not exists job_tareas_tenant on job_tareas(tenant_id);

alter table job_tareas enable row level security;

-- El cliente solo mira progreso. Escribir es cosa del worker (service_role).
drop policy if exists tareas_lectura on job_tareas;
create policy tareas_lectura on job_tareas
  for select using (tenant_id = auth_tenant_id());

-- ------------------------------------------------------------
-- 4 · Encolar un descubrimiento
--
-- La llama el usuario autenticado desde el frontend. SECURITY DEFINER para
-- poder escribir en jobs y job_tareas, pero comprueba el tenant a mano:
-- saltarse la RLS obliga a filtrar en el propio código.
-- ------------------------------------------------------------
create or replace function encolar_descubrimiento(p_campaign uuid)
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

  -- El filtro por tenant que la RLS ya no está haciendo por nosotros.
  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  -- Un descubrimiento vivo por campaña: evita duplicar gasto en Places.
  if exists (
    select 1 from jobs
    where campaign_id = p_campaign
      and tipo = 'descubrir'
      and estado in ('pendiente','en_curso')
  ) then
    raise exception 'Ya hay un descubrimiento en curso para esta campaña';
  end if;

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'descubrir', 'pendiente', 'En cola')
  returning id into v_job;

  -- Una tarea por cada query de cada segmento aceptado. La paginación se
  -- encadena sola: cada página crea la siguiente si Places devuelve token.
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
-- 5 · Reclamar tareas
--
-- SKIP LOCKED: si dos invocaciones de la función coinciden, cada una se
-- lleva tareas distintas en vez de pisarse. Sin esto, dos ejecuciones
-- solapadas del cron duplican consultas a Places y las pagamos dos veces.
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
        -- Respeta el techo de gasto de la campaña.
        and j.consultas < (select c.max_consultas from campaigns c where c.id = j.campaign_id)
      order by t2.creado_en
      limit p_limite
      -- OF t2: bloquea solo la tarea, no la fila del job. Si bloqueásemos
      -- el job, una segunda invocación saltaría todas sus tareas.
      for update of t2 skip locked
   )
  returning t.*;
$fn$;

-- ------------------------------------------------------------
-- 6 · Contar una consulta facturable a Places
--
-- Se cuenta por página pedida, no por lead obtenido: Places cobra la
-- consulta aunque vuelva vacía. Es lo que frena reclamar_tareas cuando la
-- campaña llega a su techo.
-- ------------------------------------------------------------
create or replace function sumar_consulta(p_job uuid)
returns int
language sql
security definer
set search_path = public
as $fn$
  update jobs
     set consultas = consultas + 1, actualizado_en = now()
   where id = p_job
  returning consultas;
$fn$;

-- ------------------------------------------------------------
-- 7 · Cerrar el job cuando ya no queda nada pendiente
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

  -- El job pasa a 'en_curso' en cuanto hay trabajo hecho: la pantalla de
  -- progreso necesita distinguir "en cola" de "avanzando".
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

  -- El scoring es SQL y se recalcula entero: barato y siempre coherente.
  perform recalcular_scores(v_campaign);

  -- Un job con tareas caídas no es un job completado. Decirlo aquí evita que
  -- una campaña a medias parezca terminada en la pantalla de progreso.
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

  update campaigns set estado = 'lista' where id = v_campaign;

  return true;
end;
$fn$;

-- ------------------------------------------------------------
-- 8 · Demo pública: contador de uso
--
-- La función de inferencia de la demo no lleva auth — es un escaparate.
-- Sin contador, cualquiera la llama en bucle y el coste es nuestro.
-- Guardamos un hash de la IP, no la IP: es dato personal bajo RGPD y para
-- contar no hace falta saber cuál era.
-- ------------------------------------------------------------
create table if not exists demo_usos (
  ip_hash        text not null,
  dia            date not null default current_date,
  usos           int  not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (ip_hash, dia)
);

-- Sin políticas: nadie llega aquí con anon key. Solo la función de abajo,
-- que es SECURITY DEFINER.
alter table demo_usos enable row level security;

create or replace function registrar_uso_demo(
  p_ip_hash text,
  p_max_ip  int default 5,
  p_max_dia int default 300
)
returns table (permitido boolean, restantes_ip int, restantes_dia int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_dia_total int;
  v_usos_ip   int;
begin
  select coalesce(sum(usos), 0) into v_dia_total
    from demo_usos where dia = current_date;

  -- Techo global del día: protege la factura aunque cambien de IP.
  if v_dia_total >= p_max_dia then
    return query select false, 0, 0;
    return;
  end if;

  insert into demo_usos (ip_hash, dia, usos)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, dia)
    do update set usos = demo_usos.usos + 1, actualizado_en = now()
  returning usos into v_usos_ip;

  if v_usos_ip > p_max_ip then
    return query select false, 0, greatest(0, p_max_dia - v_dia_total);
    return;
  end if;

  return query select true,
                      greatest(0, p_max_ip - v_usos_ip),
                      greatest(0, p_max_dia - v_dia_total - 1);
end;
$fn$;

-- Higiene: la tabla solo sirve para contar hoy. Borra lo viejo.
create or replace function limpiar_demo_usos()
returns void
language sql
security definer
set search_path = public
as $fn$
  delete from demo_usos where dia < current_date - 7;
$fn$;

-- ============================================================
-- 9 · Permisos de ejecución
--
-- Postgres concede EXECUTE a public por defecto en las funciones nuevas.
-- Estas son SECURITY DEFINER: se saltan la RLS. Dejarlas abiertas a la
-- anon key significa que cualquiera con la clave del navegador puede
-- reclamar tareas ajenas o inflar el contador de la demo hasta tumbarla.
--
-- Solo encolar_descubrimiento es para el usuario: comprueba el tenant.
-- ============================================================
revoke execute on function reclamar_tareas(int)              from public, anon, authenticated;
revoke execute on function cerrar_job_si_completo(uuid)      from public, anon, authenticated;
revoke execute on function sumar_consulta(uuid)              from public, anon, authenticated;
revoke execute on function registrar_uso_demo(text,int,int)  from public, anon, authenticated;
revoke execute on function limpiar_demo_usos()               from public, anon, authenticated;

grant execute on function encolar_descubrimiento(uuid) to authenticated;
