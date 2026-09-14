-- ============================================================
-- Prospector · 050 · las imágenes del studio, en un bucket público
--
-- EL FALLO
--
-- El studio guardaba sus imágenes —las subidas y las que genera el modelo—
-- en `recursos`, que es privado, y metía en el documento la **URL firmada**.
-- Esa firma caduca a las 8 horas (`createSignedUrl(ruta, 60*60*8)`).
--
-- Consecuencia: una plantilla diseñada por la mañana tiene el hero roto por
-- la tarde. En la plantilla guardada, en la vista previa y en cualquier
-- correo enviado con ella. Y es el peor fallo posible, porque **mientras se
-- prueba se ve bien**: quien lo diseña no lo ve nunca.
--
-- Es exactamente lo que la 044 arregló para los logos. Las imágenes del
-- studio se quedaron fuera de aquella migración porque entonces eran
-- opcionales; desde que «Crear con IA» genera una portada siempre, están en
-- el camino por defecto.
--
-- EL REPARTO, YA CON TRES
--
--   logos            · público. Solo imágenes de marca, 2 MB
--   imagenes-correo  · público. Lo que se dibuja dentro de un correo
--   recursos         · privado. Documentos y todo lo demás
--
-- La frontera no es «imagen o no»: es **si la va a pedir un cliente de
-- correo horas después**. Una oferta comercial en PDF se sirve firmada y
-- caduca; una foto de portada no puede.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El bucket
--
-- Sin SVG, por lo mismo que la 044: un SVG es un documento con scripts
-- dentro y la URL es pública, así que se puede abrir en una pestaña.
--
-- 10 MB, el mismo techo que `recursos`. El studio ya rechaza en el
-- navegador lo que pase de 8 MB, y una imagen generada en 4K ronda los 5.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes-correo', 'imagenes-correo', true, 10485760,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 2 · Quién escribe ahí
--
-- Que se lea en abierto no significa que se escriba en abierto. Mismo
-- aislamiento que 017 y 044: la ruta empieza por el uuid del tenant y la
-- política lo compara con `auth_tenant_id()`. Nadie sube ni borra en la
-- carpeta de otro aunque adivine el nombre.
-- ------------------------------------------------------------
drop policy if exists imagenes_correo_lectura   on storage.objects;
drop policy if exists imagenes_correo_escritura on storage.objects;
drop policy if exists imagenes_correo_borrado   on storage.objects;

-- La lectura por la URL pública no pasa por aquí. Esta política es para la
-- app, que lista la galería de imágenes del studio.
create policy imagenes_correo_lectura on storage.objects
  for select using (bucket_id = 'imagenes-correo');

create policy imagenes_correo_escritura on storage.objects
  for insert with check (
    bucket_id = 'imagenes-correo'
    and (storage.foldername(name))[1] = auth_tenant_id()::text
  );

create policy imagenes_correo_borrado on storage.objects
  for delete using (
    bucket_id = 'imagenes-correo'
    and (storage.foldername(name))[1] = auth_tenant_id()::text
  );

-- ------------------------------------------------------------
-- 3 · El catálogo tiene que poder nombrarlo
--
-- `recursos.bucket` lo creó la 044 con dos valores. Sin ampliar el CHECK,
-- la fila de una imagen nueva se rechazaría y el archivo quedaría huérfano.
--
-- El valor por defecto sigue siendo 'recursos': las filas que ya existen
-- apuntan donde están de verdad, y ahí se quedan.
-- ------------------------------------------------------------
alter table recursos drop constraint if exists recursos_bucket_check;
alter table recursos add constraint recursos_bucket_check
  check (bucket in ('recursos','logos','imagenes-correo'));

comment on column recursos.bucket is
  'En qué bucket está el archivo. `logos` e `imagenes-correo` son públicos, porque su contenido se dibuja dentro de un correo que se abre horas o semanas después y una URL firmada ya habría caducado. `recursos` es privado: documentos y todo lo demás.';
