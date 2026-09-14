-- ============================================================
-- Prospector · 051 · el perfil del negocio, una vez y para todo
--
-- EL PROBLEMA
--
-- Los datos del negocio estaban repartidos y medio vacíos. `tenants` sabía
-- el nombre, la vertical y la ciudad; `config_correo` el domicilio postal;
-- y todo lo demás —a qué se dedica en una frase, el teléfono, la web— se
-- volvía a escribir **en cada campaña**, en el campo «Tu negocio, en una
-- frase». Con Google es peor: el alta no pregunta nada y el tenant nace
-- con `vertical = 'sin_definir'`.
--
-- Y el logo: `logo_de_campana()` (044) busca «el de la campaña, y si no el
-- del negocio (`campaign_id` nulo)». Esa segunda rama **nunca se ha usado**,
-- porque la pantalla de Recursos siempre graba con campaña. Comprobado: no
-- hay una sola fila de logo con `campaign_id is null`, y el único logo que
-- existe está en el bucket privado de antes de la 044, que esa función
-- descarta. O sea: hoy **ningún correo lleva logo**.
--
-- LO QUE HACE ESTA MIGRACIÓN
--
-- Poner el perfil del negocio donde ya vive el negocio, que es `tenants`, y
-- una marca de cuándo se completó para poder enseñar la bienvenida una vez.
--
-- DÓNDE **NO** SE PONE EL DOMICILIO POSTAL
--
-- Aquí no. Ya está en `config_correo.direccion_postal`, que es de donde lo
-- saca el pie legal. Tenerlo en dos sitios es garantizar que un día digan
-- cosas distintas, y el que se quedaría obsoleto sería justo el que
-- identifica al remitente ante la LSSI-CE. La pantalla los enseña juntos;
-- la base los guarda donde cada uno se lee.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Lo que faltaba del negocio
-- ------------------------------------------------------------
alter table tenants add column if not exists descripcion    text;
alter table tenants add column if not exists telefono       text;
alter table tenants add column if not exists email_contacto text;
alter table tenants add column if not exists web            text;
alter table tenants add column if not exists horario        text;
alter table tenants add column if not exists redes          jsonb not null default '{}'::jsonb;

comment on column tenants.descripcion is
  'A qué se dedica el negocio, en una o dos frases. Es el valor por defecto de campaigns.descripcion y el punto de partida del asistente de IA del studio.';
comment on column tenants.redes is
  'Perfiles públicos del negocio: {"instagram": "...", "facebook": "...", "linkedin": "...", "tiktok": "..."}. Objeto libre a propósito: una red nueva no debe costar una migración.';

-- ------------------------------------------------------------
-- 2 · Cuándo se completó la bienvenida
--
-- Una marca de tiempo y no un booleano: «cuándo» responde también a «si», y
-- el día que haya que saber cuántas altas terminan el alta, el dato está.
--
-- **Las cuentas que ya existen se marcan como configuradas.** Es la lección
-- de la 045: allí un `default true` sobre una columna nueva metió en modo
-- demo a todos los clientes que ya trabajaban, el mismo día. Aquí un nulo
-- por defecto les plantaría una pantalla de bienvenida delante sin que
-- nadie la hubiera pedido. Quien quiera repasar sus datos entra por Cuenta.
-- ------------------------------------------------------------
alter table tenants add column if not exists configurado_en timestamptz;

comment on column tenants.configurado_en is
  'Cuándo se completó la pantalla de bienvenida. Nulo = no se ha pasado por ella, y la app la enseña antes que nada. Las cuentas anteriores a la 051 se sellaron con su fecha de alta para no encontrársela de golpe.';

update tenants set configurado_en = creado_en where configurado_en is null;

-- ------------------------------------------------------------
-- 3 · Quién puede escribir qué
--
-- `tenants` no tiene GRANT de tabla: la 021 los da **por columna**, y por
-- eso `plan` y `max_consultas_mes` se leen y no se tocan desde el navegador
-- aunque la RLS deje pasar la fila. Una columna nueva sin su GRANT es una
-- columna de solo lectura, así que esto no es burocracia: sin ello la
-- pantalla de bienvenida guardaría sin error aparente y sin guardar nada.
--
-- `configurado_en` también se concede. Es el cliente quien cierra su propia
-- bienvenida, y lo peor que puede hacer con ella es saltársela — que es su
-- decisión, no un agujero de aislamiento.
-- ------------------------------------------------------------
grant update (descripcion, telefono, email_contacto, web, horario, redes,
              configurado_en)
  on tenants to authenticated;

-- ------------------------------------------------------------
-- 4 · El logo del negocio, el que vale para todo
--
-- No hace falta tabla nueva: `recursos` con `tipo = 'logo'` y `campaign_id`
-- nulo ya es exactamente eso, y `logo_de_campana()` ya lo prefiere después
-- del de la campaña. Lo que faltaba era quien lo escribiera.
--
-- Esta función es la otra mitad: leer el logo del negocio sin pasar por una
-- campaña, que es lo que necesitan la pantalla de Cuenta y el studio.
-- Devuelve solo los del bucket público, por lo mismo que la 044: un logo en
-- el privado no se puede enseñar dentro de un correo.
-- ------------------------------------------------------------
create or replace function logo_del_negocio()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select r.ruta
    from recursos r
   where r.tipo = 'logo'
     and r.bucket = 'logos'
     and r.campaign_id is null
     and r.tenant_id = auth_tenant_id()
   order by r.creado_en desc
   limit 1;
$fn$;

-- SECURITY DEFINER se salta la RLS, así que se cierra y se abre a mano. No
-- acepta parámetros y filtra por `auth_tenant_id()`: sin sesión devuelve
-- nulo, no el logo de otro.
revoke execute on function logo_del_negocio() from public, anon;
grant  execute on function logo_del_negocio() to authenticated, service_role;

-- ------------------------------------------------------------
-- 5 · El contexto del mensaje hereda el perfil
--
-- Con la misma regla que la 043 puso para el sector y la ciudad: **si la
-- campaña declara empresa propia, los datos del tenant no se le atribuyen**.
-- Son de otra empresa, y colar el teléfono de la agencia en el correo que
-- firma su cliente es inventarle la ficha.
--
-- Las cuatro columnas nuevas van **al final**, detrás de `oferta`, y no
-- agrupadas con las otras `negocio_*` como pedirían los ojos.
-- `create or replace view` solo sabe añadir columnas por la derecha: meter
-- una en medio le parece renombrar las siguientes y falla con
-- «cannot change name of view column "oferta" to "negocio_telefono"».
-- Ordenarlas bien costaría un `drop view`, y de esta vista cuelga la
-- redacción de mensajes.
-- ------------------------------------------------------------
create or replace view v_contexto_mensaje as
select
  l.id            as lead_id,
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
  case when nullif(trim(c.negocio_nombre), '') is null then t.vertical       end as negocio_vertical,
  case when nullif(trim(c.negocio_nombre), '') is null then t.ciudad         end as negocio_ciudad,
  oferta_de_campana(c.id) as oferta,
  case when nullif(trim(c.negocio_nombre), '') is null then t.telefono       end as negocio_telefono,
  case when nullif(trim(c.negocio_nombre), '') is null then t.email_contacto end as negocio_email,
  case when nullif(trim(c.negocio_nombre), '') is null then t.web            end as negocio_web,
  case when nullif(trim(c.negocio_nombre), '') is null then t.horario        end as negocio_horario
from leads l
  join campaigns c on c.id = l.campaign_id
  join tenants   t on t.id = l.tenant_id
  left join segments s on s.id = l.segment_id;

-- La vista consulta como quien la llama. Sin esto correría con los
-- privilegios de su dueño, que tiene BYPASSRLS, y cualquiera con la clave
-- publicable leería el contexto de los mensajes de todos los tenants.
alter view v_contexto_mensaje set (security_invoker = on);
