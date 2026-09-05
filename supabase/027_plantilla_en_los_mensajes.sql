-- ============================================================
-- Prospector · 027 · la plantilla del studio, aplicada a los mensajes
--
-- Hasta ahora el studio diseñaba correos y la campaña redactaba textos, y
-- las dos cosas no se tocaban. Esto las une: el texto que Claude escribió
-- para cada lead se pinta dentro del diseño elegido.
--
-- La parte delicada no es guardar el HTML: es que el enlace de baja siga
-- garantizado. Ver más abajo.
--
-- Ejecutar DESPUÉS de 026_clave_openai_y_coste_de_imagen.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Qué se guarda
--
-- `cuerpo` sigue siendo el texto plano y NO se toca: es la versión que se
-- manda como alternativa en todo correo HTML, y la que se lee cuando el
-- cliente de correo no pinta HTML o el destinatario lo tiene desactivado.
--
-- `plantilla_version` guarda con qué versión se compuso. La plantilla se
-- puede seguir editando después; lo que se envió, no cambia.
-- ------------------------------------------------------------
alter table messages add column if not exists html text;
alter table messages add column if not exists plantilla_id uuid
  references plantillas(id) on delete set null;
alter table messages add column if not exists plantilla_version int;

create index if not exists messages_plantilla on messages (plantilla_id);

-- ------------------------------------------------------------
-- 2 · El enlace de baja, ahora también en el HTML
--
-- El trigger de 013 comprobaba que el token estuviera en `cuerpo`. Con
-- HTML de por medio esa comprobación se queda corta de la peor manera: el
-- texto plano llevaría su enlace, el trigger daría el visto bueno, y lo que
-- de verdad abre el destinatario —el HTML— podría no llevarlo.
--
-- Sería un agujero de compliance abierto por una mejora de diseño. Así que
-- si hay HTML, el token tiene que estar en los dos.
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

  if position(('t=' || new.token_baja) in coalesce(new.cuerpo, '')) = 0 then
    raise exception
      'El mensaje no lleva su enlace de baja. Todo envío comercial tiene que incluir uno visible y funcional (ver docs/compliance.md)';
  end if;

  -- Lo nuevo: si se compuso con plantilla, el HTML es lo que se abre.
  if coalesce(new.html, '') <> ''
     and position(('t=' || new.token_baja) in new.html) = 0 then
    raise exception
      'La versión HTML del mensaje no lleva su enlace de baja. Es la que ve el destinatario, así que no basta con que lo lleve el texto plano';
  end if;

  new.email_destino := v_email;
  return new;
end;
$fn$;

-- ------------------------------------------------------------
-- 3 · Qué plantilla lleva cada campaña
--
-- Para que la pantalla pueda decir "estos 40 mensajes van con esta
-- plantilla" sin recorrerlos uno a uno.
-- ------------------------------------------------------------
create or replace view v_plantilla_por_campana
with (security_invoker = on) as
  select c.id            as campaign_id,
         c.nombre        as campana,
         count(m.id)                                          as mensajes,
         count(m.id) filter (where m.html is not null)         as con_diseno,
         count(m.id) filter (where m.estado = 'enviado')       as enviados,
         (array_agg(p.nombre) filter (where p.nombre is not null))[1] as plantilla,
         (array_agg(m.plantilla_id) filter (where m.plantilla_id is not null))[1] as plantilla_id,
         count(distinct m.plantilla_id)                        as plantillas_distintas
    from campaigns c
    join leads l    on l.campaign_id = c.id
    join messages m on m.lead_id = l.id
    left join plantillas p on p.id = m.plantilla_id
   group by c.id, c.nombre;
