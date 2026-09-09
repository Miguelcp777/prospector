-- ============================================================
-- Prospector · 039 · modo demo: un techo de leads por campaña
-- Ejecutar DESPUÉS de 038_alta_dominio_del_cliente.sql.
--
-- De dónde sale: la campaña «Woody tatoo» devolvió 920 leads en 59
-- consultas a Places. Para enseñar el producto sobran 900 de esos leads y
-- sobran 55 de esas consultas — que son las que se pagan.
--
-- POR QUÉ EL TECHO ES DE LEADS Y EL FRENO ES DE CONSULTAS
--
-- Places cobra por consulta, no por lead. Un límite que se limitara a no
-- guardar leads de más ahorraría cero: las 59 consultas ya estarían
-- pagadas. Así que el techo se cuenta en leads —que es lo que se ve— pero
-- lo que hace es **dejar de servir tareas** en cuanto se alcanza. Con 50
-- leads son tres o cuatro consultas, no 59.
--
-- Vive en `ajustes` y no en el código por lo mismo que el tope de mensajes
-- de la 018: quitarlo para un cliente de verdad es un UPDATE, no un
-- despliegue. Y vive en la base y no en el frontend porque un límite de
-- interfaz lo esquiva cualquiera llamando a la RPC con la anon key.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Los dos ajustes
-- ------------------------------------------------------------
alter table ajustes add column if not exists modo_demo boolean not null default false;
alter table ajustes add column if not exists max_leads_demo int not null default 50
  check (max_leads_demo between 1 and 100000);

comment on column ajustes.modo_demo is
  'Con esto puesto, el descubrimiento para al llegar a max_leads_demo leads por campaña. Para enseñar el producto sin pagar una campaña entera.';
comment on column ajustes.max_leads_demo is
  'Cuántos leads como mucho por campaña mientras el modo demo esté puesto.';

-- ------------------------------------------------------------
-- 2 · Cuántos leads caben todavía en esta campaña
--
-- Devuelve NULL cuando no hay límite —modo demo apagado—, y es NULL y no
-- un número enorme a propósito: quien la llama distingue "no hay techo" de
-- "queda muchísimo" sin tener que comparar contra una constante.
--
-- SECURITY DEFINER porque cuenta leads de cualquier tenant: la llama el
-- worker, que no es nadie en concreto. Por eso mismo va revocada de todo lo
-- que tenga sesión de navegador.
-- ------------------------------------------------------------
create or replace function huecos_de_leads(p_campaign uuid)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when not a.modo_demo then null
           else greatest(0, a.max_leads_demo
                            - (select count(*)::int from leads l
                                where l.campaign_id = p_campaign))
         end
    from ajustes a
   limit 1;
$fn$;

-- ------------------------------------------------------------
-- 3 · El worker deja de reclamar tareas al llegar al techo
--
-- Es el cuarto freno de esta función, y encaja donde los otros tres: en el
-- mismo `and` que ya acota el gasto del descubrimiento. `coalesce(..., 1)`
-- traduce "sin límite" a "queda hueco".
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
        -- Los cuatro techos, solo donde hay factura que acotar.
        and (j.tipo <> 'descubrir' or (
              j.consultas < (select c.max_consultas from campaigns c where c.id = j.campaign_id)
              and coalesce((select cp.consultas from consumo_places cp
                             where cp.tenant_id = j.tenant_id
                               and cp.mes = date_trunc('month', current_date)::date), 0)
                  < (select tn.max_consultas_mes from tenants tn where tn.id = j.tenant_id)
              and consultas_del_proyecto()
                  < (select a.max_consultas_mes_proyecto from ajustes a)
              and coalesce(huecos_de_leads(j.campaign_id), 1) > 0
        ))
        and (t2.reclamada_en is null or t2.reclamada_en < now() - interval '90 seconds')
      order by t2.creado_en
      limit p_limite
      for update of t2 skip locked
   )
  returning t.*;
$fn$;

-- ------------------------------------------------------------
-- 4 · Y el job cierra en vez de quedarse colgado
--
-- Esta es la parte que la 008 aprendió a base de una campaña encerrada:
-- si `reclamar_tareas` deja de servir tareas y `cerrar_job_si_completo` no
-- cierra mientras queden pendientes, el job se queda al 60% para siempre y
-- la campaña clavada en 'buscando'. Un techo nuevo sin este otro lado es
-- exactamente ese bloqueo otra vez.
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
  v_por_demo   boolean;
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

  -- Se calcula aquí y no dentro del `if`: la vuelta que cierra el job puede
  -- no tener ya nada pendiente —las omitió una vuelta anterior— y aun así
  -- tiene que saber por qué se paró para decirlo bien.
  v_por_demo := v_tipo = 'descubrir'
                and coalesce(huecos_de_leads(v_campaign), 1) = 0;

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

    if not v_agotado and not v_por_demo then
      return false;      -- Sigue habiendo presupuesto: que trabaje el worker.
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
      return false;      -- Alguna sigue en_curso: cerramos en la próxima vuelta.
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

-- ------------------------------------------------------------
-- 5 · Y se avisa al encolar, no a mitad de camino
--
-- Sin esto, una campaña que ya está en el techo aceptaría el encolado,
-- crearía las tareas, no serviría ninguna y cerraría al 0%. Funciona, pero
-- el usuario ve un job fantasma y no sabe por qué.
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
  v_huecos   int;
  v_max_demo int;
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

  -- El modo demo va antes que los techos de dinero: es el que más veces se
  -- va a encontrar y el más fácil de resolver.
  v_huecos := huecos_de_leads(p_campaign);
  if v_huecos = 0 then
    select max_leads_demo into v_max_demo from ajustes;
    raise exception
      'Modo demo: esta campaña ya tiene sus % leads. Para buscar más, quita el modo demo o sube el techo en el panel (Ajustes).',
      v_max_demo;
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
  values (v_tenant, p_campaign, 'descubrir', 'pendiente',
          case when v_huecos is null then 'En cola'
               else format('En cola · modo demo, %s leads como mucho', v_huecos) end)
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
-- 6 · Ponerlo y quitarlo desde el panel
--
-- Es un ajuste de TODO el servicio, como el remitente de la 034 y la clave
-- de la 026, así que exige es_admin(). `ajustes` no tiene política de
-- escritura: sin esta función no se toca desde ninguna sesión de navegador.
--
-- El `where id` no es decorativo. Sin él PostgREST responde «UPDATE
-- requires a WHERE clause» y el ajuste no se guarda — es exactamente el
-- fallo que arregló la 036, y SECURITY DEFINER no salva de él.
-- ------------------------------------------------------------
create or replace function guardar_modo_demo(p_activo boolean, p_max int)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_filas int;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;

  if p_max is null or p_max < 1 or p_max > 100000 then
    raise exception 'El techo de leads del modo demo tiene que estar entre 1 y 100000';
  end if;

  update ajustes
     set modo_demo      = coalesce(p_activo, false),
         max_leads_demo = p_max,
         actualizado_en = now()
   where id;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No existe la fila de ajustes del proyecto';
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 7 · Permisos
--
-- Las cuatro son SECURITY DEFINER y se saltan la RLS. `huecos_de_leads`
-- cuenta leads de cualquier campaña, así que no se le abre a nadie con
-- sesión de navegador: dentro de las otras funciones se ejecuta con la
-- identidad del dueño y no necesita concesión propia.
-- ------------------------------------------------------------
revoke execute on function huecos_de_leads(uuid)                 from public, anon, authenticated;
revoke execute on function reclamar_tareas(int, text)            from public, anon, authenticated;
revoke execute on function cerrar_job_si_completo(uuid)          from public, anon, authenticated;
revoke execute on function encolar_descubrimiento(uuid, boolean) from public, anon;
revoke execute on function guardar_modo_demo(boolean, int)       from public, anon;

grant  execute on function huecos_de_leads(uuid)                 to service_role;
grant  execute on function reclamar_tareas(int, text)            to service_role;
grant  execute on function cerrar_job_si_completo(uuid)          to service_role;
grant  execute on function encolar_descubrimiento(uuid, boolean) to authenticated;
grant  execute on function guardar_modo_demo(boolean, int)       to authenticated;

-- ------------------------------------------------------------
-- Para quitarlo sin pasar por el panel:
--   update ajustes set modo_demo = false where id;
-- ------------------------------------------------------------
