-- ============================================================
-- Prospector · 043 · quién escribe: la empresa de la campaña
-- Ejecutar DESPUÉS de 042_modo_demo_tambien_los_mensajes.sql.
--
-- EL FALLO
--
-- Los diez mensajes de la campaña «Woody tatoo» se presentan como
-- «i-automate». No es un fallo del modelo: `v_contexto_mensaje` sacaba
-- `negocio_nombre` de `tenants.nombre`, y el pie legal —el que identifica
-- al remitente— también. El tenant es la cuenta; la empresa que escribe,
-- no siempre.
--
-- Es lo que pasa en cuanto alguien usa esto como agencia: una cuenta,
-- varias campañas, y cada campaña es de una empresa distinta.
--
-- POR QUÉ NO SE USA `campaigns.nombre`
--
-- Es lo primero que se piensa y sale mal. `campaigns.nombre` es una
-- etiqueta para encontrar la campaña en una lista, y en esta base ya hay
-- campañas que se llaman «ASESORIAS Y DESPACHOS DE ABOGADOS» o «Piloto
-- Valencia»: eso es a QUIÉN se busca, o una nota de trabajo, no quién
-- firma. Un correo firmado «ASESORIAS Y DESPACHOS DE ABOGADOS» dirigido a
-- un despacho de abogados es exactamente el ridículo que hay que evitar.
--
-- Así que campo propio, y vacío por defecto: sin rellenar sigue mandando el
-- nombre del tenant, que es el comportamiento de siempre.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El campo
-- ------------------------------------------------------------
alter table campaigns add column if not exists negocio_nombre text;

comment on column campaigns.negocio_nombre is
  'La empresa que firma los correos de ESTA campaña. Vacío = el nombre del tenant. Va al prompt y al pie legal, así que identifica al remitente ante la LSSI-CE.';

-- ------------------------------------------------------------
-- 2 · El contexto del redactor
--
-- El sector y la ciudad se apagan cuando la campaña pone nombre propio, y
-- esto merece explicación porque parece una pérdida.
--
-- `negocio_vertical` y `negocio_ciudad` describen al TENANT. Si la campaña
-- declara que quien escribe es otra empresa, el sector del tenant deja de
-- ser verdad sobre quien firma: «Woody Tatoo, automatización con IA» es
-- peor que no decir el sector. Lo que sí describe al negocio de la campaña
-- es `campaigns.descripcion`, que el prompt ya usa —«A qué se dedica»— y
-- que el cliente escribe en el paso 1.
--
-- Mentir sobre el sector de quien firma no es un detalle de estilo: el
-- correo va a otra empresa y esa frase es una presentación.
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
       c.tipo          as campana_tipo,
       c.tono          as campana_tono,
       c.idioma        as campana_idioma,
       c.firma         as campana_firma,
       c.llamada_accion as campana_llamada,
       coalesce(nullif(trim(c.negocio_nombre), ''), t.nombre) as negocio_nombre,
       case when nullif(trim(c.negocio_nombre), '') is null
            then t.vertical end as negocio_vertical,
       case when nullif(trim(c.negocio_nombre), '') is null
            then t.ciudad end   as negocio_ciudad,
       oferta_de_campana(c.id) as oferta
  from leads l
  join campaigns c on c.id = l.campaign_id
  join tenants   t on t.id = l.tenant_id
  left join segments s on s.id = l.segment_id;

-- ------------------------------------------------------------
-- 3 · Lo que NO hace esta migración
--
-- No reescribe los mensajes ya redactados. Los diez de «Woody tatoo»
-- seguirán diciendo «i-automate» hasta que se borren y se vuelvan a
-- escribir, que es una llamada al modelo por cabeza.
--
-- Y no se tocan desde aquí a propósito: son datos de un cliente, y
-- reescribir a mano el cuerpo de un correo ya redactado deja un registro
-- que no cuadra con lo que el modelo escribió. Si hay que rehacerlos, se
-- borran los borradores desde la pantalla de Mensajes y se vuelve a pulsar
-- «Escribir mensajes».
-- ------------------------------------------------------------
