-- ============================================================
-- Prospector · 053 · los mensajes del cliente no hablan de dinero
--
-- La aplicación iba explicándole al cliente qué le costaba dinero a quien
-- la opera: «es el único paso que cuesta dinero», «esto no cuesta nada»,
-- «cada búsqueda en Google Places se paga a partir del cupo gratuito», «has
-- gastado 250 de las 250 consultas de este mes».
--
-- Son frases escritas mirando la factura del servicio, no la pantalla de
-- quien la usa. A un cliente no le sirven para nada y le cuentan cosas que
-- no son suyas — el peor de todos enseñaba el consumo **de todo el
-- servicio**, que es el margen puesto en un contador.
--
-- Esto ya estaba decidido para el panel: `supabase/README.md` dice que el
-- desglose de coste vive solo en administración porque «enseñárselo al
-- cliente en su propia campaña sería enseñarle el margen». El resto de la
-- aplicación no seguía esa regla.
--
-- LO QUE NO CAMBIA
--
-- Los límites siguen ahí y se siguen diciendo. Un cliente tiene que saber
-- por qué su búsqueda no arranca; lo que no tiene que saber es a cuánto
-- sale la consulta. Cada mensaje de aquí conserva el número y el motivo, y
-- pierde la palabra.
--
-- El panel de administración se queda como está: ahí los números de gasto
-- son el producto.
-- ============================================================

create or replace function encolar_descubrimiento(p_campaign uuid, p_forzar boolean default false)
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
  v_usadas   int;
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

  v_huecos := huecos_de_leads(p_campaign);
  if v_huecos = 0 then
    select max_leads_demo into v_max_demo from ajustes;
    raise exception
      'Esta cuenta usa la versión de prueba, y la campaña ha alcanzado su límite de % leads. %',
      v_max_demo, aviso_version_de_prueba();
  end if;

  if not p_forzar and v_ultima is not null and v_ultima > now() - interval '30 days' then
    v_dias := ceil(extract(epoch from (v_ultima + interval '30 days' - now())) / 86400);
    raise exception
      'Esta campaña se buscó hace % días. Places devolverá prácticamente lo mismo, así que la búsqueda está en pausa % días más. Puedes forzarla si crees que ha cambiado algo.',
      floor(extract(epoch from (now() - v_ultima)) / 86400), v_dias;
  end if;

  select coalesce(cp.consultas, 0), tn.max_consultas_mes
    into v_usadas, v_techo
    from tenants tn
    left join consumo_places cp
      on cp.tenant_id = tn.id and cp.mes = date_trunc('month', current_date)::date
   where tn.id = v_tenant;

  -- Antes: «Has gastado % de las % consultas de Places de este mes».
  if v_usadas >= v_techo then
    raise exception
      'Esta cuenta ha llegado a su límite de % búsquedas este mes. El contador se reinicia el día 1.',
      v_techo;
  end if;

  v_proyecto := consultas_del_proyecto();
  select max_consultas_mes_proyecto into v_techo_p from ajustes;

  -- Antes decía la cifra del servicio entero —«% de %»—, que es consumo de
  -- todos los clientes junto y no es asunto de ninguno. El motivo sí es
  -- suyo: su búsqueda no va a arrancar hoy.
  if v_proyecto >= v_techo_p then
    raise exception
      'El servicio ha llegado a su límite mensual de búsquedas. Se reinicia el día 1.';
  end if;

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'descubrir', 'pendiente',
          case when v_huecos is null then 'En cola'
               else format('En cola · versión de prueba, %s leads como mucho', v_huecos) end)
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

revoke execute on function encolar_descubrimiento(uuid, boolean) from public, anon;
grant  execute on function encolar_descubrimiento(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- El detalle que se queda escrito en el job
--
-- Sale en la pantalla de la campaña —«Última búsqueda: …»— así que es un
-- mensaje al cliente como cualquier otro. «Techo de consultas» era la
-- factura de Places con otro nombre.
--
-- Mismo cuerpo de la 052 con esa frase cambiada.
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
  v_estado     text;
begin
  select estado into v_estado from jobs where id = p_job;

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
                          then 'No ejecutada: versión de prueba, límite de leads alcanzado'
                          else 'No ejecutada: límite de búsquedas alcanzado' end,
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
                        format('Parada por la versión de prueba: %s de %s búsquedas hechas, %s sin ejecutar',
                               v_hechas, v_total, v_omitidas)
                      when v_omitidas > 0 then
                        format('Parada al llegar al límite de búsquedas: %s de %s hechas, %s sin ejecutar',
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

revoke execute on function cerrar_job_si_completo(uuid) from public, anon, authenticated;
grant  execute on function cerrar_job_si_completo(uuid) to service_role;
