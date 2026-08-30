-- ============================================================
-- Prospector · esquema inicial
-- Ejecutar en el SQL Editor de Supabase, o como primera migración.
-- Región del proyecto: europea (Frankfurt o Irlanda). Ver docs/compliance.md.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tenants: nuestros clientes (la clínica de fisio, la asesoría…)
-- ------------------------------------------------------------
create table tenants (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  vertical     text not null,
  ciudad       text,
  plan         text not null default 'trial',
  creado_en    timestamptz not null default now()
);

-- Perfil de usuario ligado a auth.users. Es la pieza que sostiene toda la RLS.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  email        text not null,
  rol          text not null default 'miembro' check (rol in ('propietario','miembro')),
  creado_en    timestamptz not null default now()
);
create index on profiles(tenant_id);

-- Devuelve el tenant del usuario autenticado.
-- SECURITY DEFINER para poder leer profiles sin caer en recursión de políticas.
create or replace function auth_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- Campañas
-- ------------------------------------------------------------
create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  nombre        text not null,
  descripcion   text,               -- lo que el cliente escribe sobre su negocio
  ciudad        text not null,
  radio_km      int  not null default 25 check (radio_km between 1 and 200),
  estado        text not null default 'borrador'
                check (estado in ('borrador','inferido','buscando','lista','archivada')),
  creado_en     timestamptz not null default now()
);
create index on campaigns(tenant_id, creado_en desc);

-- ------------------------------------------------------------
-- Segmentos inferidos, ya revisados por el cliente
-- ------------------------------------------------------------
create table segments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  slug          text not null,
  nombre        text not null,
  motivo        text,               -- por qué el modelo cree que encaja
  prioridad     text not null default 'media' check (prioridad in ('alta','media','baja')),
  queries       text[] not null default '{}',
  aceptado      boolean not null default true,
  creado_en     timestamptz not null default now(),
  unique (campaign_id, slug)
);
create index on segments(tenant_id);
create index on segments(campaign_id) where aceptado;

-- ------------------------------------------------------------
-- Leads
-- ------------------------------------------------------------
create table leads (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  segment_id     uuid references segments(id) on delete set null,

  place_id       text,              -- identificador de la fuente, para deduplicar
  nombre         text not null,
  direccion      text,
  zona           text,
  lat            double precision,
  lng            double precision,

  web            text,
  email          text,              -- solo buzones corporativos. Ver compliance.
  telefono       text,
  redes          jsonb not null default '{}'::jsonb,

  resenas        int,
  puntuacion_ext numeric(2,1),
  score          int check (score between 0 and 100),

  estado         text not null default 'nuevo'
                 check (estado in ('nuevo','contactado','respondido','descartado')),
  fuente         text not null default 'places',
  capturado_en   timestamptz not null default now(),

  unique (campaign_id, place_id)
);
create index on leads(tenant_id);
create index on leads(campaign_id, score desc);
create index on leads(campaign_id, estado);

-- ------------------------------------------------------------
-- Mensajes generados
-- ------------------------------------------------------------
create table messages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  lead_id       uuid not null references leads(id) on delete cascade,
  canal         text not null default 'email' check (canal in ('email','otro')),
  asunto        text,
  cuerpo        text not null,
  estado        text not null default 'borrador'
                check (estado in ('borrador','enviado','abierto','respondido','rebotado')),
  enviado_en    timestamptz,
  creado_en     timestamptz not null default now()
);
create index on messages(tenant_id);
create index on messages(lead_id);

-- ------------------------------------------------------------
-- Supresiones: bajas y exclusiones. Se respetan en TODAS las campañas.
-- ------------------------------------------------------------
create table suppressions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade,  -- null = global
  email         text not null,
  motivo        text not null check (motivo in ('baja','rebote','queja','manual')),
  creado_en     timestamptz not null default now()
);
create unique index on suppressions(coalesce(tenant_id::text,'global'), lower(email));

-- ------------------------------------------------------------
-- Cola de trabajos: el descubrimiento no cabe en una Edge Function
-- ------------------------------------------------------------
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  tipo          text not null check (tipo in ('descubrir','enriquecer','puntuar')),
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','en_curso','hecho','error')),
  progreso      int not null default 0 check (progreso between 0 and 100),
  detalle       text,
  intentos      int not null default 0,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on jobs(estado, creado_en) where estado = 'pendiente';
create index on jobs(tenant_id);

-- ============================================================
-- RLS · el aislamiento vive aquí, no en el código de la app
-- ============================================================
alter table tenants      enable row level security;
alter table profiles     enable row level security;
alter table campaigns    enable row level security;
alter table segments     enable row level security;
alter table leads        enable row level security;
alter table messages     enable row level security;
alter table suppressions enable row level security;
alter table jobs         enable row level security;

create policy tenant_propio on tenants
  for select using (id = auth_tenant_id());

create policy perfil_propio on profiles
  for select using (id = auth.uid() or tenant_id = auth_tenant_id());

-- Mismo patrón para todo lo que cuelga del tenant.
create policy campanas_del_tenant on campaigns
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

create policy segmentos_del_tenant on segments
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

create policy leads_del_tenant on leads
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

create policy mensajes_del_tenant on messages
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- Las supresiones globales las ve todo el mundo, pero solo se escriben las propias.
create policy supresiones_lectura on suppressions
  for select using (tenant_id = auth_tenant_id() or tenant_id is null);
create policy supresiones_escritura on suppressions
  for insert with check (tenant_id = auth_tenant_id());

create policy jobs_lectura on jobs
  for select using (tenant_id = auth_tenant_id());

-- Los jobs los escribe el worker con service_role, que se salta RLS.
-- Por eso esa clave NUNCA sale del servidor.

-- ============================================================
-- Vistas de apoyo
-- ============================================================
create view v_resumen_campana as
select
  c.id  as campaign_id,
  c.tenant_id,
  c.nombre,
  c.estado,
  count(l.id)                                    as leads,
  count(l.id) filter (where l.email is not null) as con_email,
  count(l.id) filter (where l.score >= 75)       as score_alto,
  count(distinct l.segment_id)                   as segmentos
from campaigns c
left join leads l on l.campaign_id = c.id
group by c.id;

-- La vista consulta como quien la llama, no como su dueño. Sin security_invoker
-- se ejecuta con los privilegios de postgres, que tiene BYPASSRLS: cualquiera
-- con la anon key leería el resumen de campañas de todos los tenants.
alter view v_resumen_campana set (security_invoker = on);

-- ============================================================
-- Scoring · SQL puro, recalculable en cualquier momento
-- ============================================================
create or replace function recalcular_scores(p_campaign uuid)
returns void
language sql
set search_path = public
as $$
  update leads l set score = least(100, greatest(0, (
      case s.prioridad when 'alta' then 45 when 'media' then 30 else 15 end
    + case when l.email is not null then 20 else 0 end
    + case when l.web   is not null then 10 else 0 end
    + least(20, coalesce(l.resenas,0) / 10)
    + coalesce(round(l.puntuacion_ext * 1.0), 0)::int
  )))
  from segments s
  where l.segment_id = s.id and l.campaign_id = p_campaign;
$$;
