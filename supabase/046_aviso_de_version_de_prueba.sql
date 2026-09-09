-- ============================================================
-- Prospector · 046 · cómo se le dice al cliente que está limitado
-- Ejecutar DESPUÉS de 045_modo_demo_por_cliente.sql.
--
-- El aviso que veía el cliente decía «habla con quien te lleva la cuenta».
-- Es coloquial, y encima no dice con quién: deja al cliente sabiendo que
-- está limitado y sin forma de dejar de estarlo.
--
-- DOS NOMBRES PARA LA MISMA COSA, A PROPÓSITO
--
-- Dentro —columnas, panel, este README— se sigue llamando «modo demo»:
-- es el nombre que ya tiene y renombrarlo en veinte sitios no arregla nada.
--
-- Fuera, lo que lee el cliente, es «versión de prueba». Un cliente que paga
-- una cuota no está en una demo; está en una versión limitada de algo que
-- ha contratado, y llamarlo demo suena a que no se le toma en serio.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · A quién se escribe para ampliar los límites
--
-- Sin esto, el aviso solo puede decir «contacta con el administrador del
-- servicio», que es la versión educada de «apáñatelas». Con un correo o una
-- URL configurados, el aviso lleva a algún sitio.
--
-- Es del servicio, no de cada cliente: quien vende es siempre el mismo.
-- ------------------------------------------------------------
alter table ajustes add column if not exists contacto_soporte text;

comment on column ajustes.contacto_soporte is
  'Correo o URL a la que se manda al cliente para ampliar los límites de la versión de prueba. Vacío = el aviso se queda genérico.';

-- ------------------------------------------------------------
-- 2 · Guardar los topes y el contacto a la vez
--
-- La firma cambia, así que la de dos argumentos se va: dejarla viva
-- significaría que una llamada sin contacto sigue valiendo y lo deja como
-- estaba, mientras la pantalla cree haberlo guardado.
-- ------------------------------------------------------------
drop function if exists guardar_topes_demo(int, int);

create or replace function guardar_topes_demo(
  p_max_leads    int,
  p_max_mensajes int,
  p_contacto     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_filas int;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;

  if p_max_leads is null or p_max_leads < 1 or p_max_leads > 100000 then
    raise exception 'El techo de leads tiene que estar entre 1 y 100000';
  end if;
  if p_max_mensajes is null or p_max_mensajes < 1 or p_max_mensajes > 100000 then
    raise exception 'El techo de mensajes tiene que estar entre 1 y 100000';
  end if;

  -- El `where id` no es adorno: sin él PostgREST responde «UPDATE requires
  -- a WHERE clause» y no se guarda nada. Ver la 036.
  update ajustes
     set max_leads_demo    = p_max_leads,
         max_mensajes_demo = p_max_mensajes,
         contacto_soporte  = nullif(trim(coalesce(p_contacto, '')), ''),
         actualizado_en    = now()
   where id;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No existe la fila de ajustes del proyecto';
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 3 · La frase, en un solo sitio
--
-- La usan los dos mensajes de error de abajo y tiene que decir lo mismo que
-- el banner de la aplicación. Escrita tres veces, se despega a la tercera.
-- ------------------------------------------------------------
create or replace function aviso_version_de_prueba()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when a.contacto_soporte is null
             then 'Para ampliar los límites, contacta con el administrador del servicio.'
           else 'Para ampliar los límites, escribe a ' || a.contacto_soporte || '.'
         end
    from ajustes a
   limit 1;
$fn$;

-- ------------------------------------------------------------
-- 4 · Los dos avisos
--
-- Se rehacen enteras porque el texto vive dentro. Del resto del cuerpo no
-- cambia una línea respecto de la 045.
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

create or replace function encolar_redaccion(p_campaign uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant     uuid;
  v_job        uuid;
  v_tareas     int;
  v_tope       int;
  v_candidatos int;
  v_repetidos  int;
  v_evitar     boolean;
  v_detalle    text;
  v_huecos     int;
  v_max_demo   int;
  v_manda_demo boolean;
begin
  select tenant_id, evitar_ya_contactados into v_tenant, v_evitar
    from campaigns where id = p_campaign;

  if v_tenant is null then
    raise exception 'Campaña no encontrada';
  end if;

  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jobs
    where campaign_id = p_campaign and tipo = 'redactar'
      and estado in ('pendiente','en_curso')
  ) then
    raise exception 'Ya hay una redacción en curso para esta campaña';
  end if;

  select max_mensajes_por_campana into v_tope from ajustes;

  if v_tope = 0 then
    raise exception 'La redacción de mensajes está desactivada (tope a 0).';
  end if;

  v_huecos := huecos_de_mensajes(p_campaign);
  if v_huecos = 0 then
    select max_mensajes_demo into v_max_demo from ajustes;
    raise exception
      'Esta cuenta usa la versión de prueba, y la campaña ha alcanzado su límite de % mensajes. %',
      v_max_demo, aviso_version_de_prueba();
  end if;

  v_manda_demo := v_huecos is not null and v_huecos < v_tope;
  if v_manda_demo then
    v_tope := v_huecos;
  end if;

  select count(*),
         count(*) filter (where exists (
           select 1 from v_leads_ya_contactados yc where yc.lead_id = l.id))
    into v_candidatos, v_repetidos
    from leads l
   where l.campaign_id = p_campaign
     and l.email is not null
     and not esta_suprimido(l.email, l.tenant_id)
     and not exists (select 1 from messages m where m.lead_id = l.id);

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'redactar', 'pendiente', 'En cola')
  returning id into v_job;

  insert into job_tareas (job_id, tenant_id, campaign_id, segment_id, lead_id, query)
  select v_job, v_tenant, p_campaign, l.segment_id, l.id, l.nombre
    from leads l
   where l.campaign_id = p_campaign
     and l.email is not null
     and not esta_suprimido(l.email, l.tenant_id)
     and not exists (select 1 from messages m where m.lead_id = l.id)
     and (not v_evitar
          or not exists (select 1 from v_leads_ya_contactados yc where yc.lead_id = l.id))
   order by l.score desc nulls last, l.resenas desc nulls last
   limit v_tope;

  get diagnostics v_tareas = row_count;

  if v_tareas = 0 then
    update jobs
       set estado = 'hecho', progreso = 100,
           detalle = case
             when v_evitar and v_repetidos > 0 and v_repetidos >= v_candidatos then
               format('Los %s leads pendientes ya recibieron un correo en otra campaña', v_repetidos)
             else 'No hay leads con email pendientes de redactar' end,
           actualizado_en = now()
     where id = v_job;
    return v_job;
  end if;

  v_detalle := 'En cola';
  if v_candidatos > v_tareas then
    v_detalle := case
      when v_manda_demo then
        format('En cola · %s de %s leads (versión de prueba: %s mensajes por campaña)',
               v_tareas, v_candidatos, (select max_mensajes_demo from ajustes))
      else
        format('En cola · %s de %s leads (tope de %s por tanda)',
               v_tareas, v_candidatos, v_tope)
    end;
  end if;
  if v_evitar and v_repetidos > 0 then
    v_detalle := v_detalle || format(' · %s saltados por contacto previo', v_repetidos);
  end if;

  update jobs set detalle = v_detalle where id = v_job;

  return v_job;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Permisos
--
-- `aviso_version_de_prueba` la lee también el banner de la aplicación, así
-- que sí se le concede a `authenticated`: lo único que devuelve es una
-- frase que ese usuario va a ver de todas formas.
-- ------------------------------------------------------------
revoke execute on function guardar_topes_demo(int, int, text)    from public, anon;
revoke execute on function aviso_version_de_prueba()             from public, anon;
revoke execute on function encolar_descubrimiento(uuid, boolean) from public, anon;
revoke execute on function encolar_redaccion(uuid)               from public, anon;

grant  execute on function guardar_topes_demo(int, int, text)    to authenticated;
grant  execute on function aviso_version_de_prueba()             to authenticated;
grant  execute on function encolar_descubrimiento(uuid, boolean) to authenticated;
grant  execute on function encolar_redaccion(uuid)               to authenticated;
