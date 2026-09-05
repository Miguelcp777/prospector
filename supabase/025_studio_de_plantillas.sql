-- ============================================================
-- Prospector · 025 · studio de plantillas
--
-- La base para traer el Campaign Studio dentro de Prospector como una
-- sección más, en vez de un producto aparte. Ver decisiones/0003.
--
-- Esto NO es el `001_campaign_studio.sql` que traía la rama. Aquel era el
-- contrato de un producto autónomo y aquí no encaja por tres motivos:
--
--   1. Resolvía la pertenencia leyendo el claim JWT `tenant_id`, que los
--      tokens de este proyecto no llevan. Habría negado todo en silencio.
--   2. Vivía en un esquema propio, `campaign_studio`, que PostgREST no
--      expone sin tocar los ajustes del proyecto. Aquí todo vive en
--      `public` y se llega con la clave publicable.
--   3. Duplicaba dos cosas que ya existen. Ver más abajo.
--
-- Identificadores en español, como el resto del esquema. El cliente del
-- studio no depende de estos nombres: habla con una única función,
-- `apiFetch`, y es esa la que se reescribe.
--
-- Ejecutar DESPUÉS de 024_coste_por_campana.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Lo que NO se crea, y por qué
--
-- `assets`  → se extiende `recursos` (017). Las dos son "un archivo de un
--             tenant en Supabase Storage". Crear una segunda tabla de
--             archivos es exactamente lo que se le reprochó a la rama con
--             `ai_usage_events`; no vamos a hacerlo nosotros.
--
-- `ai_usage_events` → ya está `consumo_modelo` (023/024), que es de donde
--             sale el coste por campaña del panel. Dos contadores de gasto
--             significan que el panel miente sobre la mitad.
-- ------------------------------------------------------------

-- Imágenes del editor: pueden no pertenecer a ninguna campaña (una imagen
-- de marca se reutiliza), y campaign_id ya era opcional.
alter table recursos drop constraint if exists recursos_tipo_check;
alter table recursos add constraint recursos_tipo_check
  check (tipo in ('logo', 'documento', 'imagen'));

alter table recursos add column if not exists ancho int;
alter table recursos add column if not exists alto  int;
-- De dónde salió: subida del usuario, generada por el modelo, o del
-- catálogo que trae el studio. Importa para el coste y para los derechos.
alter table recursos add column if not exists origen text not null default 'subida'
  check (origen in ('subida', 'ia', 'catalogo'));
-- El prompt que la generó, cuando la generó un modelo. Sin esto no hay
-- forma de reproducir ni de explicar de dónde salió una imagen.
alter table recursos add column if not exists prompt text;
alter table recursos add column if not exists texto_alt text not null default '';

-- ------------------------------------------------------------
-- 1 · Plantillas
--
-- `documento` es el árbol editable; `html` y `texto` son derivados y se
-- guardan porque el envío no puede depender de volver a renderizar.
-- ------------------------------------------------------------
create table if not exists plantillas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default auth_tenant_id()
                references tenants(id) on delete cascade,
  creado_por    uuid default auth.uid() references auth.users(id) on delete set null,

  nombre        text not null,
  categoria     text not null default 'personalizada',
  estado        text not null default 'borrador'
                check (estado in ('borrador', 'activa', 'archivada')),

  asunto        text not null default '',
  preencabezado text not null default '',
  documento     jsonb not null,
  html          text not null default '',
  texto         text not null default '',
  miniatura     text,

  origen        text not null default 'studio',
  version       int  not null default 1 check (version > 0),

  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- El documento tiene versión de esquema propia. Sin esta comprobación,
  -- un formato futuro entraría en la tabla y reventaría al renderizarlo.
  constraint documento_v1 check ((documento ->> 'schemaVersion')::int = 1)
);

create index if not exists plantillas_tenant on plantillas (tenant_id, actualizado_en desc);

-- ------------------------------------------------------------
-- 2 · Versiones, inmutables
--
-- Un correo enviado tiene que conservar exactamente lo que se envió. Si la
-- plantilla se edita después, lo enviado no puede cambiar con ella — ni por
-- honestidad ni por poder responder a una reclamación.
-- ------------------------------------------------------------
create table if not exists plantilla_versiones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default auth_tenant_id()
                references tenants(id) on delete cascade,
  plantilla_id  uuid not null references plantillas(id) on delete cascade,
  version       int  not null check (version > 0),

  asunto        text not null default '',
  preencabezado text not null default '',
  documento     jsonb not null,
  html          text not null,
  texto         text not null,
  hash          text not null,

  creado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  creado_en     timestamptz not null default now(),

  unique (plantilla_id, version),
  constraint version_documento_v1 check ((documento ->> 'schemaVersion')::int = 1)
);

create index if not exists plantilla_versiones_tenant
  on plantilla_versiones (tenant_id, plantilla_id, version desc);

-- La inmutabilidad no es una convención: es un trigger. Una convención se
-- salta sin querer.
create or replace function rechazar_cambio_de_version()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  raise exception 'Las versiones de plantilla no se modifican ni se borran';
end;
$fn$;

drop trigger if exists plantilla_versiones_inmutables on plantilla_versiones;
create trigger plantilla_versiones_inmutables
  before update or delete on plantilla_versiones
  for each row execute function rechazar_cambio_de_version();

-- ------------------------------------------------------------
-- 3 · Marca, módulos y revisión
-- ------------------------------------------------------------
create table if not exists kits_marca (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null unique default auth_tenant_id()
                references tenants(id) on delete cascade,
  datos         jsonb not null default '{}'::jsonb,
  actualizado_por uuid default auth.uid() references auth.users(id) on delete set null,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists plantilla_modulos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default auth_tenant_id()
                references tenants(id) on delete cascade,
  creado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  nombre        text not null,
  categoria     text not null default 'Personalizado',
  etiquetas     jsonb not null default '[]'::jsonb,
  bloques       jsonb not null,
  sincronizado  boolean not null default false,
  revision      int not null default 1 check (revision > 0),
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists plantilla_modulos_tenant on plantilla_modulos (tenant_id);

-- Puntos de guardado: deshacer con nombre, dentro de una sesión de edición.
create table if not exists plantilla_puntos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default auth_tenant_id()
                references tenants(id) on delete cascade,
  plantilla_id  uuid not null references plantillas(id) on delete cascade,
  creado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  nombre        text not null,
  documento     jsonb not null,
  asunto        text not null default '',
  preencabezado text not null default '',
  creado_en     timestamptz not null default now()
);
create index if not exists plantilla_puntos_plantilla on plantilla_puntos (plantilla_id, creado_en desc);

create table if not exists plantilla_comentarios (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default auth_tenant_id()
                references tenants(id) on delete cascade,
  plantilla_id  uuid not null references plantillas(id) on delete cascade,
  bloque_id     text,
  autor_id      uuid default auth.uid() references auth.users(id) on delete set null,
  cuerpo        text not null,
  estado        text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  creado_en     timestamptz not null default now()
);
create index if not exists plantilla_comentarios_plantilla on plantilla_comentarios (plantilla_id, creado_en);

create table if not exists plantilla_aprobaciones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default auth_tenant_id()
                references tenants(id) on delete cascade,
  plantilla_id  uuid not null references plantillas(id) on delete cascade,
  revisor_id    uuid default auth.uid() references auth.users(id) on delete set null,
  estado        text not null check (estado in ('pendiente', 'aprobada', 'cambios_pedidos')),
  nota          text not null default '',
  creado_en     timestamptz not null default now()
);
create index if not exists plantilla_aprobaciones_plantilla on plantilla_aprobaciones (plantilla_id, creado_en desc);

-- ------------------------------------------------------------
-- 4 · Aislamiento
--
-- El mismo patrón que el resto del esquema: `auth_tenant_id()`, que lee
-- `profiles`. No hay claim `tenant_id` en los tokens de este proyecto, y
-- ese era el fallo silencioso de la migración que traía la rama.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['plantillas','plantilla_versiones','kits_marca',
                           'plantilla_modulos','plantilla_puntos',
                           'plantilla_comentarios','plantilla_aprobaciones']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_del_tenant', t);
    execute format(
      'create policy %I on %I for all using (tenant_id = auth_tenant_id())
       with check (tenant_id = auth_tenant_id())', t || '_del_tenant', t);
  end loop;
end $$;

-- El trigger de inmutabilidad ya frena UPDATE y DELETE, pero quitar además
-- la concesión evita que un cambio de política los reabra sin querer.
revoke update, delete on plantilla_versiones from anon, authenticated;

-- ------------------------------------------------------------
-- 5 · Cerrar una versión
--
-- Congela el estado actual de la plantilla en una versión inmutable y
-- devuelve su número. Es lo que hay que llamar antes de enviar: lo enviado
-- no puede depender de una plantilla que se sigue editando.
--
-- SECURITY DEFINER porque escribe en una tabla con UPDATE revocado, y
-- comprueba el tenant a mano porque se salta la RLS.
-- ------------------------------------------------------------
create or replace function cerrar_version_plantilla(p_plantilla uuid)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_p      plantillas%rowtype;
  v_nueva  int;
begin
  select * into v_p from plantillas where id = p_plantilla;
  if v_p.id is null then
    raise exception 'Plantilla no encontrada';
  end if;
  if v_p.tenant_id is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;
  if coalesce(v_p.html, '') = '' then
    raise exception 'La plantilla no tiene HTML: hay que renderizarla antes de cerrarla';
  end if;

  select coalesce(max(version), 0) + 1 into v_nueva
    from plantilla_versiones where plantilla_id = p_plantilla;

  insert into plantilla_versiones (tenant_id, plantilla_id, version, asunto,
                                   preencabezado, documento, html, texto, hash)
  values (v_p.tenant_id, p_plantilla, v_nueva, v_p.asunto, v_p.preencabezado,
          v_p.documento, v_p.html, v_p.texto,
          -- sha256() nativo, no digest(): pgcrypto vive en el esquema
          -- `extensions` y esta función fija search_path a public, así que
          -- digest() no resolvería.
          encode(sha256(convert_to(v_p.html || v_p.texto || v_p.asunto, 'UTF8')), 'hex'));

  update plantillas set version = v_nueva, actualizado_en = now()
   where id = p_plantilla;

  return v_nueva;
end;
$fn$;

revoke execute on function cerrar_version_plantilla(uuid) from public, anon;
grant  execute on function cerrar_version_plantilla(uuid) to authenticated;
