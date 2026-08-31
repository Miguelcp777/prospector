-- ============================================================
-- Prospector · 014 · techo de consultas del proyecto
-- Ejecutar después de 013.
--
-- Verificado en la documentación de Google (agosto 2026):
--
--   El crédito de 200 $/mes desapareció el 1 de marzo de 2025. Lo sustituyen
--   cupos gratuitos por SKU: Essentials 10.000, Pro 5.000, Enterprise 1.000
--   llamadas al mes. Se factura «at the highest SKU applicable to your
--   request».
--
--   `descubrir` pide websiteUri, nationalPhoneNumber, rating y
--   userRatingCount — los cuatro son Enterprise. Así que cada búsqueda
--   nuestra es Text Search Enterprise: 1.000 gratis al mes, y 35 $ por
--   cada 1.000 después.
--
--   No se puede bajar de nivel: websiteUri es Enterprise y es de donde el
--   enriquecimiento saca los emails.
--
-- EL PROBLEMA: ese cupo es del PROYECTO de Google, no de cada cliente.
-- max_consultas_mes acota a un tenant; con el defecto de 500, dos clientes
-- al tope agotan el cupo exacto y el tercero ya factura. No había nada que
-- lo viese.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Ajustes del proyecto: una sola fila
--
-- El `check (id)` sobre una columna boolean con default true es el truco
-- para que la tabla no pueda tener más de una fila: dos intentos chocan
-- contra la clave primaria.
-- ------------------------------------------------------------
create table if not exists ajustes (
  id                         boolean primary key default true check (id),
  max_consultas_mes_proyecto int not null default 1000
                             check (max_consultas_mes_proyecto between 0 and 1000000),
  actualizado_en             timestamptz not null default now()
);

insert into ajustes (id) values (true) on conflict (id) do nothing;

comment on column ajustes.max_consultas_mes_proyecto is
  'Techo de consultas a Places de TODO el proyecto. Por defecto 1000, que es justo el cupo gratuito de Text Search Enterprise: así no se paga nada sin haberlo decidido.';

alter table ajustes enable row level security;

-- Lectura para todos: no es dato de nadie, y la pantalla de campañas lo
-- enseña. Escribir es cosa de quien administre el proyecto, por SQL.
drop policy if exists ajustes_lectura on ajustes;
create policy ajustes_lectura on ajustes for select using (true);

-- ------------------------------------------------------------
-- 2 · Cuánto lleva gastado el proyecto entero este mes
-- ------------------------------------------------------------
create or replace function consultas_del_proyecto()
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(consultas), 0)::int
    from consumo_places
   where mes = date_trunc('month', current_date)::date;
$fn$;

-- ------------------------------------------------------------
-- 3 · El worker se para también con el techo del proyecto
-- ------------------------------------------------------------
create or replace function reclamar_tareas(
  p_limite int  default 5,
  p_tipo   text default 'descubrir'
)
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
        and j.tipo = p_tipo
        and j.estado in ('pendiente','en_curso')
        -- Los tres techos, solo donde hay factura que acotar.
        and (j.tipo <> 'descubrir' or (
              j.consultas < (select c.max_consultas from campaigns c where c.id = j.campaign_id)
              and coalesce((select cp.consultas from consumo_places cp
                             where cp.tenant_id = j.tenant_id
                               and cp.mes = date_trunc('month', current_date)::date), 0)
                  < (select tn.max_consultas_mes from tenants tn where tn.id = j.tenant_id)
              and consultas_del_proyecto()
                  < (select a.max_consultas_mes_proyecto from ajustes a)
        ))
        and (t2.reclamada_en is null or t2.reclamada_en < now() - interval '90 seconds')
      order by t2.creado_en
      limit p_limite
      for update of t2 skip locked
   )
  returning t.*;
$fn$;

-- ------------------------------------------------------------
-- 4 · Y se avisa al encolar, no a mitad de camino
-- ------------------------------------------------------------
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
  v_tenant   uuid;
  v_job      uuid;
  v_tareas   int;
  v_ultima   timestamptz;
  v_dias     int;
  v_gastado  int;
  v_techo    int;
  v_proyecto int;
  v_techo_p  int;
begin
  select tenant_id, ultima_busqueda_en into v_tenant, v_ultima
    from campaigns where id = p_campaign;

  if v_tenant is null then
    raise exception 'Campaña no encontrada';
  end if;

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

  if not p_forzar and v_ultima is not null and v_ultima > now() - interval '30 days' then
    v_dias := ceil(extract(epoch from (v_ultima + interval '30 days' - now())) / 86400);
    raise exception
      'Esta campaña se buscó hace % días. Places devolverá prácticamente lo mismo, así que la búsqueda está en pausa % días más. Puedes forzarla si crees que ha cambiado algo.',
      floor(extract(epoch from (now() - v_ultima)) / 86400), v_dias;
  end if;

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

  v_proyecto := consultas_del_proyecto();
  select max_consultas_mes_proyecto into v_techo_p from ajustes;

  if v_proyecto >= v_techo_p then
    raise exception
      'El servicio ha alcanzado su techo mensual de consultas a Places (% de %). Se reinicia el día 1.',
      v_proyecto, v_techo_p;
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
-- 5 · Y que un solo cliente no se coma el cupo de todos
--
-- Con el techo del proyecto en 1.000, un defecto de 500 significa que dos
-- clientes lo agotan. 250 deja sitio para cuatro sin pagar. El defecto solo
-- afecta a los tenants nuevos: los que ya existen conservan el suyo.
-- ------------------------------------------------------------
alter table tenants alter column max_consultas_mes set default 250;

-- ------------------------------------------------------------
-- 6 · Permisos
-- ------------------------------------------------------------
revoke execute on function reclamar_tareas(int, text)              from public, anon, authenticated;
revoke execute on function encolar_descubrimiento(uuid, boolean)   from public, anon;

grant  execute on function reclamar_tareas(int, text)              to service_role;
grant  execute on function encolar_descubrimiento(uuid, boolean)   to authenticated;
grant  execute on function consultas_del_proyecto()                to authenticated, service_role;
