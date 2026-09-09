-- ============================================================
-- Prospector · 044 · el logo, servible desde un correo
-- Ejecutar DESPUÉS de 043_quien_firma_la_campana.sql.
--
-- El logo de una campaña solo se veía en la landing. En los correos no
-- aparecía nunca, ni con plantilla: `aplicar-plantilla` no tenía ninguna
-- variable de logo que rellenar.
--
-- POR QUÉ NO BASTABA CON EL BUCKET QUE YA HABÍA
--
-- `recursos` es privado a propósito (017): ahí viven las ofertas
-- comerciales de los clientes. La landing las sirve con URLs firmadas que
-- caducan, y eso funciona porque la landing se pide en el momento.
--
-- Un correo no. Se abre horas o semanas después, y muchas veces por un
-- proxy de imágenes (Gmail las cachea en googleusercontent). Una URL
-- firmada que caduca es, en un correo, una imagen rota con retardo — el
-- peor fallo posible, porque en la prueba se ve bien.
--
-- EL REPARTO
--
--   logos      · público. Solo imágenes de marca
--   recursos   · privado, como estaba. Documentos y todo lo demás
--
-- Un logo ya está publicado en la web del cliente: no hay nada que
-- proteger. Una oferta comercial sí.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El bucket público
--
-- Sin SVG, y no es un descuido. Un SVG es un documento con scripts dentro;
-- servido en abierto y abierto en una pestaña, se ejecuta en el dominio de
-- Supabase. En un correo no corre —las imágenes de un correo no ejecutan
-- nada—, pero la URL es pública y se puede visitar directamente.
--
-- 2 MB: un logo que pese más de eso está mal exportado, y el peso del
-- correo importa.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 2 · Quién puede escribir ahí
--
-- Que se lea en abierto no significa que se escriba en abierto. El
-- aislamiento es el mismo de 017: la ruta empieza por el uuid del tenant y
-- la política lo compara con auth_tenant_id(), así que nadie sube ni borra
-- en la carpeta de otro aunque adivine el nombre.
-- ------------------------------------------------------------
drop policy if exists logos_lectura   on storage.objects;
drop policy if exists logos_escritura on storage.objects;
drop policy if exists logos_borrado   on storage.objects;

-- La lectura por la URL pública no pasa por aquí. Esta política es para la
-- app, que lista los logos del cliente desde su pantalla de Recursos.
create policy logos_lectura on storage.objects
  for select using (bucket_id = 'logos');

create policy logos_escritura on storage.objects
  for insert with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth_tenant_id()::text
  );

create policy logos_borrado on storage.objects
  for delete using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth_tenant_id()::text
  );

-- ------------------------------------------------------------
-- 3 · Dónde vive cada archivo
--
-- El catálogo tenía la ruta pero no el bucket, porque solo había uno. Con
-- dos hace falta decirlo: sin esto, la landing pediría una URL firmada de
-- un archivo que ya no está en `recursos` y devolvería el logo vacío.
--
-- Por defecto 'recursos': las filas que ya existen siguen apuntando donde
-- están, y se quedan ahí hasta que alguien vuelva a subir el logo.
-- ------------------------------------------------------------
alter table recursos add column if not exists bucket text not null default 'recursos'
  check (bucket in ('recursos','logos'));

comment on column recursos.bucket is
  'En qué bucket está el archivo. Los logos nuevos van a `logos`, que es público para que se puedan ver dentro de un correo; el resto sigue en `recursos`, que es privado.';

-- ------------------------------------------------------------
-- 4 · El logo de una campaña, en una consulta
--
-- Lo necesitan dos sitios —la landing y el vestido de los mensajes— y hoy
-- cada uno lo buscaba a su manera. Con la regla escrita una sola vez, «el
-- de la campaña, y si no el del negocio» no puede divergir.
--
-- Devuelve solo los del bucket público: un logo que siga en el privado no
-- se puede enseñar en un correo, y devolverlo daría una imagen rota.
-- ------------------------------------------------------------
create or replace function logo_de_campana(p_campaign uuid)
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
     and r.tenant_id = (select c.tenant_id from campaigns c where c.id = p_campaign)
     and (r.campaign_id = p_campaign or r.campaign_id is null)
   -- El de la campaña gana al del negocio; a igualdad, el más reciente.
   order by (r.campaign_id is null), r.creado_en desc
   limit 1;
$fn$;

revoke execute on function logo_de_campana(uuid) from public, anon;
grant  execute on function logo_de_campana(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- Los logos que ya estaban subidos siguen en el bucket privado y seguirán
-- saliendo en la landing, pero NO en los correos. Para que salgan hay que
-- volver a subirlos desde Campaña → Recursos, que es un clic; moverlos
-- desde aquí significaría tocar los archivos de un cliente.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 5 · La landing también tiene que saber en qué bucket mirar
--
-- `recursos_de_landing` devolvía la ruta pero no el bucket, porque solo
-- había uno. Con el logo mudado al público, firmar su ruta contra
-- `recursos` devuelve nulo y la landing se queda sin logo, sin error.
--
-- Hay que tirar la función en vez de reemplazarla: cambiar las columnas de
-- un `returns table` no se puede hacer con CREATE OR REPLACE.
-- ------------------------------------------------------------
drop function if exists recursos_de_landing(text);

create or replace function recursos_de_landing(p_slug text)
returns table (tipo text, nombre text, ruta text, bucket text)
language sql
stable
security definer
set search_path = public
as $fn$
  select r.tipo, r.nombre, r.ruta, r.bucket
    from landings l
    join recursos r on r.tenant_id = l.tenant_id
   where l.slug = p_slug
     and l.publicada
     and (r.campaign_id = l.campaign_id
          or (r.campaign_id is null and r.tipo = 'logo'))
   order by
     (r.tipo = 'logo' and r.campaign_id is not null) desc,
     r.tipo,
     r.creado_en;
$fn$;

-- El DROP se lleva por delante las concesiones: hay que volver a darlas o
-- la landing pública deja de servir recursos y no dice por qué.
revoke execute on function recursos_de_landing(text) from public, anon, authenticated;
grant  execute on function recursos_de_landing(text) to service_role;
