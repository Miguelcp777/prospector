-- ============================================================
-- Prospector · 020 · no escribir dos veces, y anotar quién responde
--
-- Dos huecos del embudo que quedaron abiertos en 019:
--
--   1. Nada impedía redactar a un buzón al que ya se escribió desde otra
--      campaña. El mismo negocio descubierto en dos campañas son dos filas
--      de `leads` pero un solo buzón, y quien lo recibe no ve campañas: ve
--      dos correos en frío del mismo remitente. Eso es lo que convierte una
--      prospección en spam y lo que acaba en queja.
--
--   2. El embudo tenía un estado final ('respondido') que ningún sitio de la
--      app sabía poner. Sin eso no hay forma de medir si la campaña funciona.
--
-- Ejecutar DESPUÉS de 019_configuracion_e_historial.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El freno, por campaña
--
-- Por defecto activado: repetir contacto es el error caro. Pero se
-- desactiva, porque en una campaña de seguimiento o reactivación volver a
-- escribir a quien ya conoces es justo el objetivo.
-- ------------------------------------------------------------
alter table campaigns add column if not exists evitar_ya_contactados
  boolean not null default true;

-- ------------------------------------------------------------
-- 2 · Quién ya recibió un correo, mirado por buzón
--
-- El cruce es por EMAIL, no por lead_id, y ahí está todo el asunto: el
-- mismo negocio en dos campañas son dos leads distintos con el mismo
-- buzón. Cruzar por id no detectaría nada.
--
-- Se compara contra `messages.email_destino` —la dirección a la que se
-- escribió de verdad— y no contra el email actual del lead: si el lead
-- cambió de correo después, el que recibió el correo sigue siendo el otro.
--
-- El `is distinct from` deja fuera la propia campaña: dentro de una campaña
-- ya hay un mensaje por lead y no hace falta este freno.
--
-- No cruza tenants. El historial de contacto de un cliente es suyo; la
-- lista que sí es global es la de supresión, y esa vive en `suppressions`.
-- ------------------------------------------------------------
create or replace view v_leads_ya_contactados
with (security_invoker = on) as
  select l.id         as lead_id,
         l.campaign_id,
         l.tenant_id,
         l.email,
         max(m.enviado_en)                                     as ultimo_envio,
         count(*)                                              as envios,
         (array_agg(c2.nombre order by m.enviado_en desc))[1]  as ultima_campana
    from leads l
    join messages m on lower(coalesce(m.email_destino, '')) = lower(l.email)
                   and m.tenant_id = l.tenant_id
                   and m.estado = 'enviado'
    join leads l2     on l2.id = m.lead_id
    join campaigns c2 on c2.id = l2.campaign_id
   where l.email is not null
     and l2.campaign_id is distinct from l.campaign_id
   group by l.id, l.campaign_id, l.tenant_id, l.email;

-- ------------------------------------------------------------
-- 3 · Encolar redacción saltándose los ya contactados
--
-- Además de excluirlos, los cuenta y lo dice en el detalle del job. Un
-- filtro silencioso que deja una campaña con menos mensajes de los
-- esperados parece un fallo; decir cuántos se saltaron y por qué, no.
-- ------------------------------------------------------------
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

  -- Cuántos hay sin mensaje, y de esos cuántos ya recibieron algo antes.
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

  -- Por score descendente: si solo caben 10, que sean los 10 mejores.
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
    v_detalle := format('En cola · %s de %s leads (tope de %s por tanda)',
                        v_tareas, v_candidatos, v_tope);
  end if;
  if v_evitar and v_repetidos > 0 then
    v_detalle := v_detalle || format(' · %s saltados por contacto previo', v_repetidos);
  end if;

  update jobs set detalle = v_detalle where id = v_job;

  return v_job;
end;
$fn$;

-- SECURITY DEFINER: se salta la RLS, así que se cierra a todos y se abre
-- solo a quien la necesita. Comprueba el tenant por su cuenta.
revoke execute on function encolar_redaccion(uuid) from public, anon;
grant  execute on function encolar_redaccion(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4 · El historial enseña en qué estado quedó el lead
--
-- `leads.estado` ya existía desde el esquema inicial con 'respondido' y
-- 'descartado' dentro, pero ninguna pantalla lo escribía. Exponerlo aquí
-- es lo que cierra el embudo: el historial es donde se mira quién ha
-- contestado, así que es donde tiene sentido anotarlo.
--
-- El estado vive en el lead y no en el mensaje a propósito: alguien
-- responde al negocio, no a un correo concreto.
--
-- drop primero: `create or replace view` no deja insertar una columna en
-- medio de la lista, y estado_lead va detrás de las que ya lee el front.
-- ------------------------------------------------------------
drop view if exists v_historial_contacto;

create view v_historial_contacto
with (security_invoker = on) as
  select m.id           as mensaje_id,
         m.tenant_id,
         l.id           as lead_id,
         l.nombre       as lead,
         l.email        as email_actual,
         m.email_destino,
         c.id           as campaign_id,
         c.nombre       as campana,
         c.tipo         as tipo_campana,
         m.asunto,
         m.estado,
         m.enviado_en,
         m.creado_en,
         l.estado       as estado_lead
    from messages m
    join leads l     on l.id = m.lead_id
    join campaigns c on c.id = l.campaign_id;
