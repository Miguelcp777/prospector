-- ============================================================
-- Prospector · 019 · configuración de campaña e historial de contacto
-- Ejecutar después de 018.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Cómo se escriben los correos de esta campaña
--
-- Todo esto acaba en el prompt del redactor. Antes el modelo decidía por su
-- cuenta el tono, qué pedir y quién firma; ahora lo decide el cliente, que
-- es quien pone su nombre en el correo.
-- ------------------------------------------------------------
alter table campaigns add column if not exists tipo text not null default 'prospeccion'
  check (tipo in ('prospeccion','seguimiento','reactivacion','colaboracion'));

alter table campaigns add column if not exists tono text not null default 'cercano'
  check (tono in ('formal','cercano','directo'));

alter table campaigns add column if not exists idioma text not null default 'es'
  check (idioma in ('es','ca','en'));

-- Quién firma. Sin esto el pie solo lleva el nombre del negocio, que
-- identifica al remitente pero no dice con quién habla el que responde.
alter table campaigns add column if not exists firma text;

-- Qué se pide al final. Es la única frase del correo que decide si hay
-- respuesta, y dejársela al modelo era desaprovecharla.
alter table campaigns add column if not exists llamada_accion text;

comment on column campaigns.tipo is
  'Para qué es la campaña. Se guarda en el historial: saber que a este lead se le escribió en una reactivación y no en una prospección cambia qué se le manda después.';

-- Las columnas nuevas van en medio, y CREATE OR REPLACE VIEW no deja
-- insertarlas: hay que tirar la vista.
drop view if exists v_contexto_mensaje;

create view v_contexto_mensaje
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
       c.tipo          as campana_tipo,
       c.tono          as campana_tono,
       c.idioma        as campana_idioma,
       c.firma         as campana_firma,
       c.llamada_accion as campana_llamada,
       t.nombre        as negocio_nombre,
       t.vertical      as negocio_vertical,
       t.ciudad        as negocio_ciudad,
       oferta_de_campana(c.id) as oferta
  from leads l
  join campaigns c on c.id = l.campaign_id
  join tenants   t on t.id = l.tenant_id
  left join segments s on s.id = l.segment_id;

-- ------------------------------------------------------------
-- 2 · Al marcar un mensaje como enviado, el lead pasa a contactado
--
-- Con un trigger y no desde la aplicación: el estado del lead y el del
-- mensaje no pueden discrepar, y si el envío lo hace un día un worker, ese
-- worker no tiene por qué acordarse.
-- ------------------------------------------------------------
create or replace function marcar_lead_contactado()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.estado = 'enviado' and (old.estado is distinct from 'enviado') then
    -- Solo desde 'nuevo': si ya respondió o se descartó, escribirle otra vez
    -- no lo devuelve al principio del embudo.
    update leads set estado = 'contactado'
     where id = new.lead_id and estado = 'nuevo';
  end if;
  return new;
end;
$fn$;

drop trigger if exists al_enviar_marcar_lead on messages;
create trigger al_enviar_marcar_lead
  after update on messages
  for each row execute function marcar_lead_contactado();

revoke execute on function marcar_lead_contactado() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · Historial de contacto
--
-- A qué lead se le escribió, cuándo, en qué campaña, de qué tipo y a qué
-- dirección. Es lo que hay que poder responder ante una reclamación, y
-- también lo que evita escribir dos veces a la misma puerta.
--
-- email_destino y no el email actual del lead: si el lead cambia de correo
-- después, la reclamación va sobre la dirección que se usó.
-- ------------------------------------------------------------
create or replace view v_historial_contacto
with (security_invoker = on) as
select m.id             as mensaje_id,
       m.tenant_id,
       l.id             as lead_id,
       l.nombre         as lead,
       l.email          as email_actual,
       m.email_destino,
       c.id             as campaign_id,
       c.nombre         as campana,
       c.tipo           as tipo_campana,
       m.asunto,
       m.estado,
       m.enviado_en,
       m.creado_en
  from messages m
  join leads l     on l.id = m.lead_id
  join campaigns c on c.id = l.campaign_id;
