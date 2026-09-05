-- ============================================================
-- Prospector · 015 · landing por campaña (Fase 3, segunda mitad)
-- Ejecutar después de 014.
--
-- roadmap.md: «Generación de landing por campaña — el enganche con lo que
-- ya vendemos».
--
-- Se sirve desde una Edge Function, como la página de baja, en vez de
-- publicarse en un sitio estático. Así no hace falta decidir hoy dominio ni
-- alojamiento: cuando lo decidáis, se apunta un CNAME y el contenido ya
-- está. La alternativa —generar archivos y desplegarlos— ataría el producto
-- a un proveedor antes de saber cuál.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La landing
--
-- El contenido va en jsonb y no en columnas: la estructura de una landing
-- cambia (más bloques, menos bloques) y no quiero una migración por cada
-- idea de diseño. Lo que sí son columnas es lo que se consulta o se filtra.
-- ------------------------------------------------------------
create table if not exists landings (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id)   on delete cascade
               default auth_tenant_id(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  slug         text not null unique,
  titulo       text not null,
  subtitulo    text,
  contenido    jsonb not null default '{}'::jsonb,
  publicada    boolean not null default false,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (campaign_id)
);

create index if not exists landings_tenant on landings(tenant_id);

alter table landings enable row level security;

drop policy if exists landings_del_tenant on landings;
create policy landings_del_tenant on landings
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

comment on column landings.publicada is
  'Una landing sin publicar no se sirve. El texto lo escribe un modelo: nadie debería poder enseñarla sin haberla leído antes.';

-- ------------------------------------------------------------
-- 2 · Quien rellena el formulario
--
-- Ojo con la diferencia: esto NO es prospección. Es alguien que entra por
-- su cuenta y decide escribir. Da su dato voluntariamente, así que la base
-- legal es otra — pero sigue siendo dato personal y por eso hay
-- `consentimiento` explícito y `origen`, no una fila suelta.
-- ------------------------------------------------------------
create table if not exists landing_contactos (
  id             uuid primary key default gen_random_uuid(),
  landing_id     uuid not null references landings(id) on delete cascade,
  tenant_id      uuid not null references tenants(id)  on delete cascade,
  nombre         text,
  email          text not null,
  telefono       text,
  mensaje        text,
  consentimiento boolean not null default false,
  ip_hash        text,
  creado_en      timestamptz not null default now()
);

create index if not exists landing_contactos_tenant on landing_contactos(tenant_id, creado_en desc);

alter table landing_contactos enable row level security;

-- El cliente lee los suyos. Escribir es cosa de la función pública, que va
-- con service_role: si esta tabla aceptase inserts con la anon key,
-- cualquiera podría llenarla de basura sin pasar por el formulario.
drop policy if exists contactos_del_tenant on landing_contactos;
create policy contactos_del_tenant on landing_contactos
  for select using (tenant_id = auth_tenant_id());

-- ------------------------------------------------------------
-- 3 · Servir una landing publicada
--
-- Solo lo público: ni tenant_id ni ids internos. Lo que devuelve esta
-- función acaba en una página abierta a internet.
-- ------------------------------------------------------------
create or replace function landing_publica(p_slug text)
returns table (
  landing_id uuid,
  titulo     text,
  subtitulo  text,
  contenido  jsonb,
  negocio    text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select l.id, l.titulo, l.subtitulo, l.contenido, t.nombre
    from landings l
    join tenants t on t.id = l.tenant_id
   where l.slug = p_slug and l.publicada;
$fn$;

-- ------------------------------------------------------------
-- 4 · Registrar un contacto del formulario
--
-- Sin consentimiento no se guarda: es la casilla que la persona marca. Un
-- formulario que guarda igualmente convierte un dato dado a propósito en
-- uno recogido a escondidas.
-- ------------------------------------------------------------
create or replace function registrar_contacto_landing(
  p_slug     text,
  p_email    text,
  p_nombre   text,
  p_telefono text,
  p_mensaje  text,
  p_ip_hash  text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_landing uuid;
  v_tenant  uuid;
begin
  select l.id, l.tenant_id into v_landing, v_tenant
    from landings l where l.slug = p_slug and l.publicada;

  if v_landing is null then
    return false;
  end if;

  insert into landing_contactos
    (landing_id, tenant_id, nombre, email, telefono, mensaje, consentimiento, ip_hash)
  values
    (v_landing, v_tenant, nullif(trim(p_nombre), ''), lower(trim(p_email)),
     nullif(trim(p_telefono), ''), nullif(trim(p_mensaje), ''), true, p_ip_hash);

  return true;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Permisos
-- ------------------------------------------------------------
revoke execute on function landing_publica(text)                              from public, anon, authenticated;
revoke execute on function registrar_contacto_landing(text,text,text,text,text,text) from public, anon, authenticated;

grant  execute on function landing_publica(text)                              to service_role;
grant  execute on function registrar_contacto_landing(text,text,text,text,text,text) to service_role;
