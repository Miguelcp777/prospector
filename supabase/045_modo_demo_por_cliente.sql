-- ============================================================
-- Prospector · 045 · el modo demo es de cada cliente, y viene puesto
-- Ejecutar DESPUÉS de 044_logo_en_el_correo.sql.
--
-- La 039 y la 042 hicieron el modo demo GLOBAL: un interruptor en `ajustes`
-- que ponía a todo el servicio a 50 leads y 20 mensajes. Sirve para una
-- demostración y no sirve para vender: en cuanto hay un cliente de pago y
-- otro de prueba a la vez, el interruptor está mal para uno de los dos.
--
-- Ahora el modo demo vive en el cliente, **empieza puesto**, y lo quita un
-- administrador desde el panel. Es el orden correcto: nadie gasta Places ni
-- llamadas al modelo sin que alguien lo haya decidido a propósito.
--
-- OJO CON LO QUE HACE ESTA MIGRACIÓN AL APLICARSE
--
-- `default true` sobre una columna nueva la pone a true también en las
-- filas que ya existen. Es decir: **todos los clientes actuales entran en
-- modo demo**, incluido el tuyo. Es la lectura literal de «activado por
-- defecto», y se quita cliente a cliente en Panel → Clientes con un clic.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El interruptor, en el cliente
-- ------------------------------------------------------------
alter table tenants add column if not exists modo_demo boolean not null default true;

comment on column tenants.modo_demo is
  'Con esto puesto, sus campañas paran en ajustes.max_leads_demo leads y ajustes.max_mensajes_demo mensajes. Viene puesto en los clientes nuevos; lo quita un administrador desde el panel.';

-- `tenants` tiene concesiones POR COLUMNA (021), no de tabla: una columna
-- nueva no se lee sola. Sin este grant, el banner del cliente no puede
-- saber si está en modo demo y la pantalla no enseñaría nada.
--
-- Solo SELECT. La escritura es cosa del panel, y pasa por una función que
-- comprueba es_admin(): si el cliente pudiera escribirla, se quitaría el
-- límite él mismo y el modo demo no limitaría nada.
grant select (modo_demo) on tenants to authenticated;

-- ------------------------------------------------------------
-- 2 · El de `ajustes` deja de mandar
--
-- No se borra la columna: borrar es destructivo y esto no lo pide nadie
-- todavía. Pero desde aquí no la lee nada, y una columna viva que nadie lee
-- es exactamente la trampa que hace perder una tarde. Queda dicho aquí y en
-- el propio comentario de la columna.
--
-- Los TOPES —cuántos leads y cuántos mensajes— siguen siendo del servicio:
-- son la misma cifra para todos los que estén en demo, y no hay motivo para
-- afinarlos cliente a cliente.
-- ------------------------------------------------------------
comment on column ajustes.modo_demo is
  'OBSOLETA desde la 045: el modo demo es de cada cliente (tenants.modo_demo). Nada lee esta columna. Se conserva para no borrar datos sin decidirlo.';

-- ------------------------------------------------------------
-- 3 · Los dos huecos miran ahora al dueño de la campaña
-- ------------------------------------------------------------
create or replace function huecos_de_leads(p_campaign uuid)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when not t.modo_demo then null
           else greatest(0, a.max_leads_demo
                            - (select count(*)::int from leads l
                                where l.campaign_id = p_campaign))
         end
    from campaigns c
    join tenants t on t.id = c.tenant_id
    cross join ajustes a
   where c.id = p_campaign;
$fn$;

create or replace function huecos_de_mensajes(p_campaign uuid)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when not t.modo_demo then null
           else greatest(0, a.max_mensajes_demo - (
                  select count(*)::int
                    from messages m
                    join leads l on l.id = m.lead_id
                   where l.campaign_id = p_campaign))
         end
    from campaigns c
    join tenants t on t.id = c.tenant_id
    cross join ajustes a
   where c.id = p_campaign;
$fn$;

-- ------------------------------------------------------------
-- 4 · Los topes del servicio, sin interruptor
--
-- `guardar_modo_demo` se sustituye en vez de dejarla viva: seguiría
-- aceptando un booleano que ya no significa nada y lo guardaría en la
-- columna obsoleta, dando por hecho que ha hecho algo.
-- ------------------------------------------------------------
drop function if exists guardar_modo_demo(boolean, int, int);

create or replace function guardar_topes_demo(p_max_leads int, p_max_mensajes int)
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
         actualizado_en    = now()
   where id;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No existe la fila de ajustes del proyecto';
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · El panel: verlo en la lista y quitarlo en la ficha
--
-- En la lista también, y no solo en la ficha: una lista de clientes donde
-- no se ve quién está limitado obliga a abrirlos uno a uno para encontrar
-- al que lleva dos semanas sin poder buscar leads.
--
-- Hay que tirar las funciones en vez de reemplazarlas: añadir una columna a
-- un `returns table` no se puede con CREATE OR REPLACE.
-- ------------------------------------------------------------
drop function if exists panel_tenants();

create or replace function panel_tenants()
returns table (
  tenant_id uuid, nombre text, vertical text, ciudad text, plan text,
  alta timestamptz, usuarios int, campanas int, leads int,
  enviados int, places_mes int, places_techo int,
  tokens_mes bigint, incidencias int, ultimo_uso timestamptz,
  modo_demo boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare v_mes date := date_trunc('month', current_date)::date;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select t.id, t.nombre, t.vertical, t.ciudad, t.plan, t.creado_en,
         (select count(*)::int from profiles p where p.tenant_id = t.id),
         (select count(*)::int from campaigns c where c.tenant_id = t.id),
         (select count(*)::int from leads l where l.tenant_id = t.id),
         (select count(*)::int from messages m where m.tenant_id = t.id and m.estado='enviado'),
         (select coalesce(sum(cp.consultas),0)::int from consumo_places cp
           where cp.tenant_id = t.id and cp.mes = v_mes),
         t.max_consultas_mes,
         (select coalesce(sum(cm.tokens_entrada + cm.tokens_salida),0)::bigint
            from consumo_modelo cm where cm.tenant_id = t.id and cm.dia >= v_mes),
         (select count(*)::int from incidencias i
           where i.tenant_id = t.id and i.estado='abierta'),
         greatest(
           (select max(c.creado_en) from campaigns c where c.tenant_id = t.id),
           (select max(l.capturado_en) from leads l where l.tenant_id = t.id),
           t.creado_en),
         t.modo_demo
    from tenants t
   order by t.creado_en desc;
end;
$fn$;

drop function if exists panel_cliente(uuid);

create or replace function panel_cliente(p_tenant uuid)
returns table (
  id uuid, nombre text, vertical text, ciudad text, plan text,
  creado_en timestamptz,
  modulo_prospeccion boolean, modulo_email boolean,
  max_consultas_mes int, dias_cache_places int,
  usuarios bigint, campanas bigint, leads bigint, plantillas bigint,
  mensajes bigint, enviados bigint,
  correo_remitente text, correo_estado text, correo_modo text,
  modo_demo boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select t.id, t.nombre, t.vertical, t.ciudad, t.plan, t.creado_en,
         t.modulo_prospeccion, t.modulo_email,
         t.max_consultas_mes, t.dias_cache_places,
         (select count(*) from profiles p  where p.tenant_id = t.id),
         (select count(*) from campaigns c where c.tenant_id = t.id),
         (select count(*) from leads l     where l.tenant_id = t.id),
         (select count(*) from plantillas pl where pl.tenant_id = t.id),
         (select count(*) from messages m  where m.tenant_id = t.id),
         (select count(*) from messages m  where m.tenant_id = t.id and m.estado = 'enviado'),
         (select case when cc.buzon is not null and cc.dominio is not null
                      then cc.buzon || '@' || cc.dominio end
            from config_correo cc where cc.tenant_id = t.id),
         (select cc.estado_dominio from config_correo cc where cc.tenant_id = t.id),
         (select cc.modo from config_correo cc where cc.tenant_id = t.id),
         t.modo_demo
    from tenants t
   where t.id = p_tenant;
end;
$fn$;

-- La firma cambia, así que la vieja se va. Dejarla viva significaría que
-- una llamada sin `p_modo_demo` sigue valiendo y no toca el campo: la
-- pantalla creería haberlo guardado.
drop function if exists panel_guardar_cliente(uuid, text, boolean, boolean, int, int);

create or replace function panel_guardar_cliente(
  p_tenant             uuid,
  p_plan               text default null,
  p_modulo_prospeccion boolean default null,
  p_modulo_email       boolean default null,
  p_max_consultas_mes  int default null,
  p_dias_cache_places  int default null,
  p_modo_demo          boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  if coalesce(p_modulo_prospeccion,
              (select modulo_prospeccion from tenants where id = p_tenant)) = false
     and coalesce(p_modulo_email,
              (select modulo_email from tenants where id = p_tenant)) = false then
    raise exception
      'No se puede dejar a un cliente sin ningún módulo. Si es una baja, cámbiale el plan.';
  end if;

  update tenants set
    plan               = coalesce(p_plan, plan),
    modulo_prospeccion = coalesce(p_modulo_prospeccion, modulo_prospeccion),
    modulo_email       = coalesce(p_modulo_email, modulo_email),
    max_consultas_mes  = coalesce(p_max_consultas_mes, max_consultas_mes),
    dias_cache_places  = coalesce(p_dias_cache_places, dias_cache_places),
    modo_demo          = coalesce(p_modo_demo, modo_demo)
  where id = p_tenant;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 6 · Los avisos, dirigidos a quien los lee
--
-- Antes decían «quita el modo demo o súbelo en el panel (Ajustes)». Eso lo
-- lee el CLIENTE, que ahora no puede hacer ni una cosa ni la otra: el
-- interruptor es del administrador. Un mensaje de error que manda a una
-- pantalla que no existe para quien lo lee es peor que no explicar nada.
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
      'Tu cuenta está en modo demo y esta campaña ya tiene sus % leads. Para buscar más hace falta que se te levante el límite: habla con quien te lleva la cuenta.',
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
      'Tu cuenta está en modo demo y esta campaña ya tiene sus % mensajes escritos. Cada uno es una llamada al modelo, y ahí está el tope. Para escribir más hace falta que se te levante el límite: habla con quien te lleva la cuenta.',
      v_max_demo;
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
        format('En cola · %s de %s leads (modo demo: %s mensajes por campaña)',
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
-- 7 · Permisos
--
-- Los DROP se llevan por delante las concesiones, así que hay que volver a
-- darlas todas o el panel deja de funcionar sin decir por qué.
-- ------------------------------------------------------------
revoke execute on function huecos_de_leads(uuid)                 from public, anon, authenticated;
revoke execute on function huecos_de_mensajes(uuid)              from public, anon, authenticated;
revoke execute on function guardar_topes_demo(int, int)          from public, anon;
revoke execute on function panel_tenants()                       from public, anon;
revoke execute on function panel_cliente(uuid)                   from public, anon;
revoke execute on function panel_guardar_cliente(uuid, text, boolean, boolean, int, int, boolean)
  from public, anon;
revoke execute on function encolar_descubrimiento(uuid, boolean) from public, anon;
revoke execute on function encolar_redaccion(uuid)               from public, anon;

grant  execute on function huecos_de_leads(uuid)                 to service_role;
grant  execute on function huecos_de_mensajes(uuid)              to service_role;
grant  execute on function guardar_topes_demo(int, int)          to authenticated;
grant  execute on function panel_tenants()                       to authenticated;
grant  execute on function panel_cliente(uuid)                   to authenticated;
grant  execute on function panel_guardar_cliente(uuid, text, boolean, boolean, int, int, boolean)
  to authenticated;
grant  execute on function encolar_descubrimiento(uuid, boolean) to authenticated;
grant  execute on function encolar_redaccion(uuid)               to authenticated;

-- ------------------------------------------------------------
-- Para sacar a un cliente del modo demo sin pasar por el panel:
--   update tenants set modo_demo = false where nombre = 'Quien sea';
-- ------------------------------------------------------------
