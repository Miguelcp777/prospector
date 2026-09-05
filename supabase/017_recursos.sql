-- ============================================================
-- Prospector · 017 · recursos de campaña (logo y documentos)
-- Ejecutar después de 016.
--
-- Un logo y los documentos de oferta que el cliente quiera adjuntar. Se
-- usan en la landing y, cuando exista el envío, en los correos.
--
-- EL BUCKET ES PRIVADO. Uno público sería más simple, pero significaría que
-- los documentos comerciales de un cliente son legibles por cualquiera que
-- adivine la ruta. La landing pública los sirve con URLs firmadas que
-- caducan, generadas en el servidor.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El bucket
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recursos', 'recursos', false,
  10485760,   -- 10 MB. Un logo y un PDF de oferta caben de sobra.
  array[
    'image/png','image/jpeg','image/webp','image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 2 · Aislamiento por tenant, en la ruta
--
-- Toda ruta empieza por el uuid del tenant: `<tenant_id>/<campaign_id>/...`.
-- La política compara ese primer tramo con auth_tenant_id(), así que un
-- cliente no puede leer ni escribir en la carpeta de otro aunque adivine
-- el nombre del archivo.
-- ------------------------------------------------------------
drop policy if exists recursos_lectura    on storage.objects;
drop policy if exists recursos_escritura  on storage.objects;
drop policy if exists recursos_borrado    on storage.objects;

create policy recursos_lectura on storage.objects
  for select using (
    bucket_id = 'recursos'
    and (storage.foldername(name))[1] = auth_tenant_id()::text
  );

create policy recursos_escritura on storage.objects
  for insert with check (
    bucket_id = 'recursos'
    and (storage.foldername(name))[1] = auth_tenant_id()::text
  );

create policy recursos_borrado on storage.objects
  for delete using (
    bucket_id = 'recursos'
    and (storage.foldername(name))[1] = auth_tenant_id()::text
  );

-- ------------------------------------------------------------
-- 3 · El catálogo
--
-- El bucket sabe qué archivos hay; no sabe cuál es el logo, a qué campaña
-- pertenece cada uno ni cómo se llamaba antes de que le pusiéramos un uuid
-- delante. Eso vive aquí.
-- ------------------------------------------------------------
create table if not exists recursos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id)   on delete cascade
               default auth_tenant_id(),
  -- Null = recurso del negocio, no de una campaña concreta. El logo suele
  -- ser así: el mismo para todas.
  campaign_id  uuid references campaigns(id) on delete cascade,
  tipo         text not null check (tipo in ('logo','documento')),
  nombre       text not null,
  ruta         text not null unique,
  mime         text,
  tamano       int,
  creado_en    timestamptz not null default now()
);

create index if not exists recursos_tenant   on recursos(tenant_id);
create index if not exists recursos_campana  on recursos(campaign_id);

-- Un solo logo por campaña (y uno del negocio, con campaign_id null).
create unique index if not exists recursos_un_logo
  on recursos(tenant_id, coalesce(campaign_id::text, 'negocio'))
  where tipo = 'logo';

alter table recursos enable row level security;

drop policy if exists recursos_del_tenant on recursos;
create policy recursos_del_tenant on recursos
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- ------------------------------------------------------------
-- 4 · Lo que la landing pública necesita
--
-- Devuelve rutas, no URLs: firmarlas es cosa de la Edge Function, que es
-- quien tiene service_role. Aquí solo se decide QUÉ es público — lo de una
-- landing publicada, y nada más.
--
-- El logo cae de vuelta al del negocio si la campaña no tiene uno propio.
-- ------------------------------------------------------------
create or replace function recursos_de_landing(p_slug text)
returns table (tipo text, nombre text, ruta text)
language sql
stable
security definer
set search_path = public
as $fn$
  select r.tipo, r.nombre, r.ruta
    from landings l
    join recursos r on r.tenant_id = l.tenant_id
   where l.slug = p_slug
     and l.publicada
     and (r.campaign_id = l.campaign_id
          or (r.campaign_id is null and r.tipo = 'logo'))
   order by
     -- El logo de la campaña gana al del negocio si existen los dos.
     (r.tipo = 'logo' and r.campaign_id is not null) desc,
     r.tipo,
     r.creado_en;
$fn$;

revoke execute on function recursos_de_landing(text) from public, anon, authenticated;
grant  execute on function recursos_de_landing(text) to service_role;
