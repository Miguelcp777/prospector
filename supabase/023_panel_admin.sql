-- ============================================================
-- Prospector · 023 · panel de administración
--
-- Un panel de control cruza tenants por definición: hay que ver el gasto de
-- todos para saber cuánto se gasta. Eso va contra lo único que sostiene este
-- proyecto —que el aislamiento vive en la base— así que la forma importa más
-- que el contenido.
--
-- Tres reglas que se siguen aquí:
--
--   1. NO hay políticas de tipo "el admin ve todas las filas de leads". Eso
--      dejaría la lectura entre clientes a un JWT de distancia en todas las
--      tablas, y un fallo en la comprobación lo abre todo de golpe. El cruce
--      ocurre solo dentro de las funciones de abajo.
--
--   2. Las funciones devuelven AGREGADOS, no filas de cliente. Para saber
--      cuánto se gasta hacen falta números, no los leads de nadie. Además
--      somos encargados del tratamiento, no responsables: pasearse por los
--      contactos de un cliente no es solo un riesgo técnico. Ver
--      docs/compliance.md.
--
--   3. La marca de administrador NO vive en `profiles`. Esa tabla tiene
--      concesión de UPDATE para `authenticated` —hoy la frena la RLS, que no
--      tiene política de escritura— y bastaría con que alguien añadiese una
--      política de actualización para que un cliente se hiciera admin solo.
--      Va en tabla propia, sin permisos para nadie.
--
-- Ejecutar DESPUÉS de 022_incidencias.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Quién es administrador
--
-- Sin políticas y sin concesiones: a esta tabla no se llega con la clave
-- del navegador ni para leer. Se da de alta a mano por SQL, que para el
-- número de administradores que va a haber es suficiente y no deja una
-- pantalla de "hazte admin" que mantener y vigilar.
-- ------------------------------------------------------------
create table if not exists administradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nota       text,
  creado_en  timestamptz not null default now()
);

alter table administradores enable row level security;
revoke all on administradores from anon, authenticated;

-- La única puerta. Dice si QUIEN LLAMA es admin, así que exponerla no
-- filtra nada: nadie puede preguntar por otro.
create or replace function es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from administradores where usuario_id = auth.uid())
$fn$;

revoke execute on function es_admin() from public, anon;
grant  execute on function es_admin() to authenticated;

-- ------------------------------------------------------------
-- 2 · Consumo del modelo
--
-- No se estaba midiendo. El gasto de Places sí (consumo_places, desde 007),
-- pero de Anthropic no había ni un número: la primera vez que se agotó el
-- saldo nos enteramos porque la app dejó de funcionar.
--
-- Se agrega por día, tenant, función y modelo. Una fila por llamada crecería
-- sin límite y no responde ninguna pregunta que esta no responda.
-- ------------------------------------------------------------
create table if not exists consumo_modelo (
  id             uuid primary key default gen_random_uuid(),
  dia            date not null default current_date,
  -- Nulo para la demo pública, que no tiene tenant y sí gasta.
  tenant_id      uuid references tenants(id) on delete cascade,
  funcion        text not null,
  modelo         text not null,
  llamadas       int    not null default 0,
  tokens_entrada bigint not null default 0,
  tokens_salida  bigint not null default 0,
  actualizado_en timestamptz not null default now()
);

create unique index if not exists consumo_modelo_firma
  on consumo_modelo (dia, coalesce(tenant_id::text, 'sin-tenant'), funcion, modelo);
create index if not exists consumo_modelo_mes on consumo_modelo (dia desc);

alter table consumo_modelo enable row level security;

-- Cada cliente puede ver lo suyo; el cruce lo hacen las funciones del panel.
drop policy if exists consumo_modelo_propio on consumo_modelo;
create policy consumo_modelo_propio on consumo_modelo
  for select using (tenant_id = auth_tenant_id());

revoke insert, update, delete, truncate on consumo_modelo from anon, authenticated;

-- Lo llaman las Edge Functions con service_role, después de cada respuesta
-- del modelo. Los tokens vienen del propio proveedor, no se estiman.
create or replace function registrar_consumo_modelo(
  p_funcion  text,
  p_modelo   text,
  p_entrada  bigint,
  p_salida   bigint,
  p_tenant   uuid default null
)
returns void
language sql
security definer
set search_path = public
as $fn$
  insert into consumo_modelo (tenant_id, funcion, modelo, llamadas, tokens_entrada, tokens_salida)
  values (p_tenant, left(p_funcion, 60), left(p_modelo, 60), 1,
          greatest(coalesce(p_entrada, 0), 0), greatest(coalesce(p_salida, 0), 0))
  on conflict (dia, coalesce(tenant_id::text, 'sin-tenant'), funcion, modelo)
  do update set
    llamadas       = consumo_modelo.llamadas + 1,
    tokens_entrada = consumo_modelo.tokens_entrada + excluded.tokens_entrada,
    tokens_salida  = consumo_modelo.tokens_salida  + excluded.tokens_salida,
    actualizado_en = now();
$fn$;

revoke execute on function registrar_consumo_modelo(text,text,bigint,bigint,uuid)
  from public, anon, authenticated;
grant  execute on function registrar_consumo_modelo(text,text,bigint,bigint,uuid)
  to service_role;

-- ------------------------------------------------------------
-- 3 · Tarifas
--
-- Configurables y a cero por defecto las del modelo. Un precio inventado en
-- un panel de gasto es peor que ningún precio: se toman decisiones con él.
-- Mientras valgan cero, la pantalla enseña consumo —que está medido— y dice
-- que falta la tarifa, en vez de un importe falso.
--
-- La de Places sí lleva valor porque es pública y estable, pero se revisa
-- igual contra la factura.
-- ------------------------------------------------------------
alter table ajustes add column if not exists moneda text not null default 'USD';
alter table ajustes add column if not exists precio_places_mil numeric(12,4) not null default 35.0;
alter table ajustes add column if not exists precio_tokens_entrada_millon numeric(12,4) not null default 0;
alter table ajustes add column if not exists precio_tokens_salida_millon  numeric(12,4) not null default 0;

-- ------------------------------------------------------------
-- 4 · El panel
--
-- Todas comprueban es_admin() a mano: son SECURITY DEFINER y se saltan la
-- RLS, así que el filtro que la base ya no hace lo hace el código.
-- ------------------------------------------------------------

create or replace function panel_resumen()
returns table (
  tenants int, usuarios int, admins int,
  campanas int, campanas_activas int,
  leads int, leads_con_email int,
  mensajes_borrador int, mensajes_enviados int,
  respondidos int, supresiones int,
  incidencias_abiertas int,
  places_mes int, places_techo int,
  tokens_entrada_mes bigint, tokens_salida_mes bigint,
  llamadas_modelo_mes int,
  demo_usos_hoy int, demo_usos_mes int,
  coste_places numeric, coste_modelo numeric,
  moneda text, tarifa_modelo_configurada boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a record;
  v_mes date := date_trunc('month', current_date)::date;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select * into a from ajustes limit 1;

  return query
  select
    (select count(*)::int from tenants),
    (select count(*)::int from profiles),
    (select count(*)::int from administradores),
    (select count(*)::int from campaigns),
    (select count(*)::int from campaigns where estado in ('inferido','buscando','lista')),
    (select count(*)::int from leads),
    (select count(*)::int from leads where email is not null),
    (select count(*)::int from messages where estado = 'borrador'),
    (select count(*)::int from messages where estado = 'enviado'),
    (select count(*)::int from leads where estado = 'respondido'),
    (select count(*)::int from suppressions),
    (select count(*)::int from incidencias where estado = 'abierta'),
    (select coalesce(sum(consultas), 0)::int from consumo_places where mes = v_mes),
    a.max_consultas_mes_proyecto,
    (select coalesce(sum(tokens_entrada), 0)::bigint from consumo_modelo where dia >= v_mes),
    (select coalesce(sum(tokens_salida),  0)::bigint from consumo_modelo where dia >= v_mes),
    (select coalesce(sum(llamadas), 0)::int from consumo_modelo where dia >= v_mes),
    (select coalesce(sum(usos), 0)::int from demo_usos where dia = current_date),
    (select coalesce(sum(usos), 0)::int from demo_usos where dia >= v_mes),
    round((select coalesce(sum(consultas), 0) from consumo_places where mes = v_mes)
          * a.precio_places_mil / 1000.0, 2),
    round((select coalesce(sum(tokens_entrada), 0) from consumo_modelo where dia >= v_mes)
            * a.precio_tokens_entrada_millon / 1000000.0
        + (select coalesce(sum(tokens_salida), 0) from consumo_modelo where dia >= v_mes)
            * a.precio_tokens_salida_millon / 1000000.0, 2),
    a.moneda,
    (a.precio_tokens_entrada_millon > 0 or a.precio_tokens_salida_millon > 0);
end;
$fn$;

-- Uso por cliente. Números, no contenido: ni un nombre de lead ni un correo.
create or replace function panel_tenants()
returns table (
  tenant_id uuid, nombre text, vertical text, ciudad text, plan text,
  alta timestamptz, usuarios int, campanas int, leads int,
  enviados int, places_mes int, places_techo int,
  tokens_mes bigint, incidencias int, ultimo_uso timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
declare v_mes date := date_trunc('month', current_date)::date;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select t.id, t.nombre, t.vertical, t.ciudad, t.plan, t.creado_en,
         (select count(*)::int from profiles p where p.tenant_id = t.id),
         (select count(*)::int from campaigns c where c.tenant_id = t.id),
         (select count(*)::int from leads l where l.tenant_id = t.id),
         (select count(*)::int from messages m where m.tenant_id = t.id and m.estado='enviado'),
         (select coalesce(sum(cp.consultas),0)::int from consumo_places cp
           where cp.tenant_id = t.id and cp.mes = v_mes),
         t.max_consultas_mes,
         (select coalesce(sum(cm.tokens_entrada + cm.tokens_salida),0)::bigint
            from consumo_modelo cm where cm.tenant_id = t.id and cm.dia >= v_mes),
         (select count(*)::int from incidencias i
           where i.tenant_id = t.id and i.estado='abierta'),
         greatest(
           (select max(c.creado_en) from campaigns c where c.tenant_id = t.id),
           (select max(l.capturado_en) from leads l where l.tenant_id = t.id),
           t.creado_en)
    from tenants t
   order by t.creado_en desc;
end;
$fn$;

-- Serie diaria. Es lo que enseña si algo se disparó y qué día.
create or replace function panel_actividad(p_dias int default 30)
returns table (
  dia date, altas int, campanas int, leads int,
  enviados int, tokens bigint, demo int, incidencias int
)
language plpgsql
security definer
set search_path = public
as $fn$
declare v_desde date := current_date - greatest(least(p_dias, 180), 1);
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select d::date,
    (select count(*)::int from profiles p    where p.creado_en::date = d::date),
    (select count(*)::int from campaigns c   where c.creado_en::date = d::date),
    (select count(*)::int from leads l       where l.capturado_en::date = d::date),
    (select count(*)::int from messages m    where m.enviado_en::date = d::date),
    -- Places no aparece en la serie diaria: consumo_places se agrega por mes
    -- (007) y no hay dato por día. Inventar un reparto sería peor que la
    -- ausencia, así que se enseña solo en el total del mes.
    (select coalesce(sum(cm.tokens_entrada + cm.tokens_salida),0)::bigint
       from consumo_modelo cm where cm.dia = d::date),
    (select coalesce(sum(du.usos),0)::int from demo_usos du where du.dia = d::date),
    (select count(*)::int from incidencias i where i.ultima_en::date = d::date)
  from generate_series(v_desde, current_date, interval '1 day') as d
  order by d;
end;
$fn$;

-- Incidencias de todos los clientes, que es lo que no se ve desde ninguna
-- cuenta. Sin el detalle, que puede llevar rastros de datos del cliente.
create or replace function panel_incidencias(p_limite int default 50)
returns table (
  id uuid, tenant text, origen text, operacion text,
  codigo text, mensaje text, estado text, veces int,
  primera_en timestamptz, ultima_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select i.id, coalesce(t.nombre, '— sin tenant —'), i.origen, i.operacion,
         i.codigo, i.mensaje, i.estado, i.veces, i.primera_en, i.ultima_en
    from incidencias i
    left join tenants t on t.id = i.tenant_id
   order by (i.estado = 'abierta') desc, i.ultima_en desc
   limit greatest(least(p_limite, 200), 1);
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Permisos
--
-- SECURITY DEFINER otra vez: Postgres las abre a public por defecto y estas
-- cruzan tenants. Se cierran a todos y se abren solo a `authenticated`, que
-- es quien puede tener sesión — y dentro, es_admin() decide.
-- ------------------------------------------------------------
revoke execute on function panel_resumen()            from public, anon;
revoke execute on function panel_tenants()            from public, anon;
revoke execute on function panel_actividad(int)       from public, anon;
revoke execute on function panel_incidencias(int)     from public, anon;

grant execute on function panel_resumen()        to authenticated;
grant execute on function panel_tenants()        to authenticated;
grant execute on function panel_actividad(int)   to authenticated;
grant execute on function panel_incidencias(int) to authenticated;
