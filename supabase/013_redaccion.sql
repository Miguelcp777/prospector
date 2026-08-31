-- ============================================================
-- Prospector · 013 · redacción de mensajes (Fase 3)
-- Ejecutar después de 012.
--
-- Un mensaje por lead, escrito por Claude con el contexto de la campaña, el
-- segmento y el propio negocio. Se guarda en 'borrador': esto redacta, no
-- envía. El envío es Fase 4 y todavía no existe.
--
-- Se apoya en dos cosas que ya están: la lista de supresión (012), que evita
-- redactar para quien pidió la baja, y el token de baja por mensaje, que es
-- lo que hace que el enlace de opt-out sea único y rastreable.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Un tipo de job más
-- ------------------------------------------------------------
alter table jobs drop constraint if exists jobs_tipo_check;
alter table jobs add  constraint jobs_tipo_check
  check (tipo in ('descubrir','enriquecer','puntuar','redactar'));

-- Un mensaje por lead: redactar dos veces para el mismo no tiene sentido y
-- duplicaría el gasto en Claude.
create unique index if not exists messages_un_borrador_por_lead
  on messages(lead_id) where estado = 'borrador';

-- ------------------------------------------------------------
-- 2 · Ningún mensaje se envía sin su enlace de baja
--
-- compliance.md pide «mecanismo de baja funcional, gratuito y visible en
-- cada mensaje». Eso no puede quedar en manos de la plantilla que use el
-- módulo de envío el día que se escriba: si el cuerpo no lleva el enlace
-- con SU token, la base no deja marcarlo como enviado.
--
-- Es la misma idea que frenar_envio_a_suprimido, aplicada al otro requisito
-- legal del mismo párrafo.
-- ------------------------------------------------------------
create or replace function frenar_envio_a_suprimido()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text;
begin
  if new.estado <> 'enviado' then
    return new;
  end if;

  v_email := coalesce(new.email_destino, (select l.email from leads l where l.id = new.lead_id));

  if v_email is null then
    raise exception 'No se puede marcar como enviado un mensaje sin dirección de destino';
  end if;

  if esta_suprimido(v_email, new.tenant_id) then
    raise exception 'La dirección % está en la lista de supresión', v_email;
  end if;

  -- El enlace de baja, con el token de ESTE mensaje. Uno copiado de otro
  -- daría de baja a la persona equivocada.
  if position(('/baja?t=' || new.token_baja) in coalesce(new.cuerpo, '')) = 0 then
    raise exception
      'El mensaje no lleva su enlace de baja. Todo envío comercial tiene que incluir uno visible y funcional (ver docs/compliance.md)';
  end if;

  new.email_destino := v_email;
  return new;
end;
$fn$;

-- ------------------------------------------------------------
-- 3 · Encolar la redacción de una campaña
--
-- Solo leads con email, sin mensaje todavía y que no estén suprimidos:
-- escribirle a quien pidió la baja es gastar dinero en algo que la base va
-- a rechazar después.
-- ------------------------------------------------------------
create or replace function encolar_redaccion(p_campaign uuid)
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
      and tipo = 'redactar'
      and estado in ('pendiente','en_curso')
  ) then
    raise exception 'Ya hay una redacción en curso para esta campaña';
  end if;

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'redactar', 'pendiente', 'En cola')
  returning id into v_job;

  insert into job_tareas (job_id, tenant_id, campaign_id, segment_id, lead_id, query)
  select v_job, v_tenant, p_campaign, l.segment_id, l.id, l.nombre
    from leads l
   where l.campaign_id = p_campaign
     and l.email is not null
     and not esta_suprimido(l.email, l.tenant_id)
     and not exists (select 1 from messages m where m.lead_id = l.id);

  get diagnostics v_tareas = row_count;

  if v_tareas = 0 then
    update jobs set estado = 'hecho',
                    progreso = 100,
                    detalle = 'No hay leads con email pendientes de redactar',
                    actualizado_en = now()
    where id = v_job;
  end if;

  return v_job;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · Lo que el worker necesita para escribir
--
-- Una vista en vez de cinco consultas desde la Edge Function: el contexto
-- de un mensaje es el lead, su segmento, la campaña y el negocio que
-- escribe. Todo junto y filtrado por la RLS de las tablas de origen.
-- ------------------------------------------------------------
create or replace view v_contexto_mensaje
with (security_invoker = on) as
select l.id            as lead_id,
       l.tenant_id,
       l.campaign_id,
       l.nombre        as lead_nombre,
       l.zona          as lead_zona,
       l.direccion     as lead_direccion,
       l.web           as lead_web,
       l.resenas       as lead_resenas,
       l.puntuacion_ext as lead_puntuacion,
       s.nombre        as segmento_nombre,
       s.motivo        as segmento_motivo,
       c.nombre        as campana_nombre,
       c.descripcion   as campana_descripcion,
       c.ciudad        as campana_ciudad,
       t.nombre        as negocio_nombre,
       t.vertical      as negocio_vertical,
       t.ciudad        as negocio_ciudad
  from leads l
  join campaigns c on c.id = l.campaign_id
  join tenants   t on t.id = l.tenant_id
  left join segments s on s.id = l.segment_id;

-- ------------------------------------------------------------
-- 5 · Permisos
-- ------------------------------------------------------------
revoke execute on function frenar_envio_a_suprimido() from public, anon, authenticated;
revoke execute on function encolar_redaccion(uuid)    from public, anon;
grant  execute on function encolar_redaccion(uuid)    to authenticated;
