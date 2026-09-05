-- Aurevanta Campaign Studio · contrato Supabase v1
-- Aditiva y aislada: no modifica tablas existentes de Prospector.

create schema if not exists campaign_studio;

create or replace function campaign_studio.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid
$$;

create table if not exists campaign_studio.templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  created_by uuid not null,
  name text not null,
  category text not null default 'custom',
  status text not null default 'draft' check (status in ('draft','active','archived')),
  subject text not null default '',
  preheader text not null default '',
  document jsonb not null,
  html_cache text not null default '',
  text_cache text not null default '',
  thumbnail_url text,
  source_type text not null default 'studio',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint template_document_v1 check ((document ->> 'schemaVersion')::integer = 1)
);

create index if not exists campaign_studio_templates_tenant_updated
  on campaign_studio.templates (tenant_id, updated_at desc);

create table if not exists campaign_studio.template_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null references campaign_studio.templates(id) on delete cascade,
  version integer not null check (version > 0),
  subject text not null default '',
  preheader text not null default '',
  document jsonb not null,
  html text not null,
  plain_text text not null,
  content_hash text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (template_id, version),
  constraint template_version_document_v1 check ((document ->> 'schemaVersion')::integer = 1)
);

create index if not exists campaign_studio_versions_tenant_template
  on campaign_studio.template_versions (tenant_id, template_id, version desc);

create table if not exists campaign_studio.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  created_by uuid not null,
  storage_key text not null,
  filename text not null,
  content_type text not null check (content_type in ('image/png','image/jpeg','image/webp')),
  size_bytes bigint not null check (size_bytes >= 0),
  width integer,
  height integer,
  source text not null default 'upload' check (source in ('upload','ai','catalog')),
  prompt text,
  alt_text text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_id, storage_key)
);

create table if not exists campaign_studio.brand_kits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique,
  updated_by uuid not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_studio.reusable_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  created_by uuid not null,
  name text not null,
  category text not null default 'Personalizado',
  tags jsonb not null default '[]'::jsonb,
  blocks jsonb not null,
  synchronized boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_studio.checkpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null references campaign_studio.templates(id) on delete cascade,
  created_by uuid not null,
  name text not null,
  document jsonb not null,
  subject text not null default '',
  preheader text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists campaign_studio.comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null references campaign_studio.templates(id) on delete cascade,
  block_id text,
  author_id uuid not null,
  body text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);

create table if not exists campaign_studio.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null references campaign_studio.templates(id) on delete cascade,
  reviewer_id uuid not null,
  status text not null check (status in ('pending','approved','changes_requested')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists campaign_studio.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  kind text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  resolution text,
  estimated_cost_micros bigint not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create or replace function campaign_studio.reject_version_mutation()
returns trigger
language plpgsql
as $$ begin
  raise exception 'campaign_studio.template_versions is immutable';
end $$;

drop trigger if exists campaign_studio_template_versions_immutable on campaign_studio.template_versions;
create trigger campaign_studio_template_versions_immutable
before update or delete on campaign_studio.template_versions
for each row execute function campaign_studio.reject_version_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array['templates','template_versions','assets','brand_kits','reusable_modules','checkpoints','comments','approvals','ai_usage_events']
  loop
    execute format('alter table campaign_studio.%I enable row level security', table_name);
    execute format('drop policy if exists tenant_isolation on campaign_studio.%I', table_name);
    execute format(
      'create policy tenant_isolation on campaign_studio.%I for all using (tenant_id = campaign_studio.current_tenant_id()) with check (tenant_id = campaign_studio.current_tenant_id())',
      table_name
    );
  end loop;
end $$;

grant usage on schema campaign_studio to authenticated, service_role;
grant select, insert, update, delete on all tables in schema campaign_studio to authenticated, service_role;
revoke update, delete on campaign_studio.template_versions from authenticated;
