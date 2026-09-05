-- ============================================================
-- Prospector · 016 · las páginas públicas dejan de servirse desde Supabase
-- Ejecutar después de 015.
--
-- ERROR DE ARQUITECTURA, corregido. Las Edge Functions NO pueden servir
-- HTML. La documentación de Supabase es explícita:
--
--   «HTML content is not supported. GET requests that return text/html
--    will be rewritten to text/plain. Edge Functions are designed for APIs
--    and data processing, not serving web pages.»
--
-- La página de baja llevaba desde la 012 devolviendo su HTML como
-- text/plain: funcionaba —el POST daba de baja— pero a un destinatario le
-- salía el código fuente en pantalla. Se dio por verificada probándola con
-- curl y mirando los <h1>, sin abrirla nunca en un navegador.
--
-- Ahora las funciones devuelven JSON y las páginas se sirven desde Netlify,
-- que además es el dominio del cliente y no uno de infraestructura.
-- ============================================================

-- ------------------------------------------------------------
-- La comprobación del enlace deja de depender de la ruta
--
-- Antes buscaba literalmente '/baja?t=<token>'. Con la página en Netlify la
-- URL pasa a ser '/baja.html?t=<token>' y la comprobación fallaría — no
-- porque falte el enlace, sino porque cambió el host.
--
-- Lo que de verdad importa es que el cuerpo lleve EL TOKEN DE ESTE MENSAJE:
-- son 48 caracteres hexadecimales únicos, así que su presencia no es
-- casualidad, y el dominio puede cambiar sin romper la garantía.
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

  new.email_destino := v_email;
  return new;
end;
$fn$;

revoke execute on function frenar_envio_a_suprimido() from public, anon, authenticated;
