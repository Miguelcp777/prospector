-- ============================================================
-- Prospector · 024 · coste por campaña
--
-- La pregunta que hay que poder responder antes de poner precio a esto:
-- cuánto cuesta una campaña, y cuánto cuesta cada lead que produce.
--
-- Qué faltaba y qué no:
--
--   · Places YA estaba. `jobs.consultas` cuenta por job desde 002 y cada job
--     pertenece a una campaña. No hace falta tabla nueva.
--   · El modelo NO. `consumo_modelo` (023) se agrega por tenant, y un cliente
--     con cuatro campañas era un único número. Se le añade la campaña.
--   · La tarifa era un par de columnas en `ajustes`, lo que da por supuesto
--     que solo hay un modelo. En cuanto entre GPT o Gemini al lado de Claude,
--     eso deja de sumar bien. Pasa a tabla, con proveedor y fecha de vigencia.
--
-- Ejecutar DESPUÉS de 023_panel_admin.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · A qué campaña se imputa cada consumo
--
-- `on delete set null` y no cascade: si se borra una campaña, su gasto ya
-- se pagó y tiene que seguir sumando en el total del cliente. Lo que se
-- pierde es el desglose de esa campaña, no el dinero.
--
-- Nulo también para lo que no pertenece a ninguna: la demo pública gasta y
-- no tiene campaña.
-- ------------------------------------------------------------
alter table consumo_modelo
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

-- La firma de agrupación cambia: sin la campaña dentro, dos campañas del
-- mismo cliente el mismo día se sumarían en la misma fila.
drop index if exists consumo_modelo_firma;
create unique index if not exists consumo_modelo_firma
  on consumo_modelo (dia, coalesce(tenant_id::text, 'sin-tenant'),
                     coalesce(campaign_id::text, 'sin-campana'), funcion, modelo);
create index if not exists consumo_modelo_campana on consumo_modelo (campaign_id);

-- ------------------------------------------------------------
-- 2 · Tarifas por modelo
--
-- Con proveedor, porque la idea es poder comparar Claude contra GPT o
-- Gemini con números propios y no con los del folleto de nadie.
--
-- Con `desde`, porque los precios cambian y el coste de una campaña de hace
-- tres meses debe calcularse con el precio que había entonces. Sin esto,
-- una bajada de tarifas reescribiría el histórico hacia abajo y la unidad
-- económica sobre la que decides el precio de venta se movería sola.
-- ------------------------------------------------------------
create table if not exists tarifas_modelo (
  proveedor      text not null,
  -- El identificador exacto que manda el código, no el nombre comercial.
  modelo         text not null,
  desde          date not null default current_date,
  entrada_millon numeric(12,4) not null check (entrada_millon >= 0),
  salida_millon  numeric(12,4) not null check (salida_millon  >= 0),
  nota           text,
  primary key (modelo, desde)
);

alter table tarifas_modelo enable row level security;
-- Sin políticas: no es dato de cliente. Lo leen las funciones del panel,
-- que son SECURITY DEFINER.
revoke all on tarifas_modelo from anon, authenticated;

insert into tarifas_modelo (proveedor, modelo, desde, entrada_millon, salida_millon, nota) values
  ('anthropic', 'claude-sonnet-5', '2026-09-01',  2,  10, 'Precio de lista'),
  ('anthropic', 'claude-opus-5',   '2026-09-01',  5,  25, 'Precio de lista'),
  ('anthropic', 'claude-fable-5',  '2026-09-01', 10,  50, 'Precio de lista')
on conflict (modelo, desde) do nothing;

-- ------------------------------------------------------------
-- 3 · Consumo valorado
--
-- Cada fila de consumo con su coste, buscando la tarifa que estaba vigente
-- el día en que se gastó. `con_tarifa` dice si se encontró: un modelo sin
-- tarifa suma cero, y sin esa marca ese cero pasaría por gasto real.
-- ------------------------------------------------------------
create or replace view v_consumo_valorado
with (security_invoker = on) as
  select cm.id, cm.dia, cm.tenant_id, cm.campaign_id, cm.funcion, cm.modelo,
         cm.llamadas, cm.tokens_entrada, cm.tokens_salida,
         round(cm.tokens_entrada / 1000000.0 * coalesce(t.entrada_millon, 0)
             + cm.tokens_salida  / 1000000.0 * coalesce(t.salida_millon,  0), 6) as coste,
         (t.modelo is not null) as con_tarifa
    from consumo_modelo cm
    left join lateral (
      select tm.* from tarifas_modelo tm
       where tm.modelo = cm.modelo and tm.desde <= cm.dia
       order by tm.desde desc limit 1
    ) t on true;

-- ------------------------------------------------------------
-- 4 · Registrar consumo, ahora con campaña
-- ------------------------------------------------------------
create or replace function registrar_consumo_modelo(
  p_funcion  text,
  p_modelo   text,
  p_entrada  bigint,
  p_salida   bigint,
  p_tenant   uuid default null,
  p_campana  uuid default null
)
returns void
language sql
security definer
set search_path = public
as $fn$
  insert into consumo_modelo (tenant_id, campaign_id, funcion, modelo,
                              llamadas, tokens_entrada, tokens_salida)
  values (p_tenant, p_campana, left(p_funcion, 60), left(p_modelo, 60), 1,
          greatest(coalesce(p_entrada, 0), 0), greatest(coalesce(p_salida, 0), 0))
  on conflict (dia, coalesce(tenant_id::text, 'sin-tenant'),
               coalesce(campaign_id::text, 'sin-campana'), funcion, modelo)
  do update set
    llamadas       = consumo_modelo.llamadas + 1,
    tokens_entrada = consumo_modelo.tokens_entrada + excluded.tokens_entrada,
    tokens_salida  = consumo_modelo.tokens_salida  + excluded.tokens_salida,
    actualizado_en = now();
$fn$;

revoke execute on function registrar_consumo_modelo(text,text,bigint,bigint,uuid,uuid)
  from public, anon, authenticated;
grant  execute on function registrar_consumo_modelo(text,text,bigint,bigint,uuid,uuid)
  to service_role;

-- La firma de 023 queda huérfana; se retira para que nadie la llame por
-- error y grabe consumo sin campaña.
drop function if exists registrar_consumo_modelo(text,text,bigint,bigint,uuid);

-- ------------------------------------------------------------
-- 5 · Coste por campaña
--
-- Places sale de `jobs.consultas` —lo que de verdad se pidió, no lo que se
-- guardó— porque Places cobra la consulta aunque vuelva vacía.
-- ------------------------------------------------------------
create or replace function panel_costes_campana(p_limite int default 200)
returns table (
  campaign_id uuid, campana text, cliente text, estado text, creada date,
  leads int, leads_email int, mensajes int, enviados int,
  places_consultas int, coste_places numeric,
  tokens bigint, llamadas_modelo int, coste_modelo numeric,
  coste_total numeric, coste_por_lead numeric,
  coste_por_lead_email numeric, coste_por_mensaje numeric,
  falta_tarifa boolean, moneda text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare a record;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  select * into a from ajustes limit 1;

  return query
  -- Los CTE devuelven la campaña como `cid`: `campaign_id` a secas choca
  -- con la columna de salida de la propia función y Postgres no sabe a cuál
  -- se refiere el join.
  with places as (
    select j.campaign_id as cid, sum(j.consultas)::int as consultas
      from jobs j where j.tipo = 'descubrir' group by j.campaign_id
  ),
  modelo as (
    select v.campaign_id as cid,
           sum(v.tokens_entrada + v.tokens_salida)::bigint as tokens,
           sum(v.llamadas)::int as llamadas,
           sum(v.coste) as coste,
           bool_or(not v.con_tarifa) as falta
      from v_consumo_valorado v where v.campaign_id is not null
     group by v.campaign_id
  )
  select c.id, c.nombre, t.nombre, c.estado, c.creado_en::date,
         (select count(*)::int from leads l where l.campaign_id = c.id),
         (select count(*)::int from leads l where l.campaign_id = c.id and l.email is not null),
         (select count(*)::int from messages m join leads l on l.id = m.lead_id
           where l.campaign_id = c.id),
         (select count(*)::int from messages m join leads l on l.id = m.lead_id
           where l.campaign_id = c.id and m.estado = 'enviado'),
         coalesce(p.consultas, 0),
         round(coalesce(p.consultas, 0) * a.precio_places_mil / 1000.0, 4),
         coalesce(m.tokens, 0),
         coalesce(m.llamadas, 0),
         round(coalesce(m.coste, 0), 4),
         round(coalesce(p.consultas, 0) * a.precio_places_mil / 1000.0
             + coalesce(m.coste, 0), 4),
         -- Los "por unidad" solo tienen sentido si hay unidades. Nulo, no
         -- cero: un cero aquí se lee como "gratis".
         case when (select count(*) from leads l where l.campaign_id = c.id) > 0
              then round((coalesce(p.consultas,0) * a.precio_places_mil / 1000.0
                        + coalesce(m.coste,0))
                        / (select count(*) from leads l where l.campaign_id = c.id), 4) end,
         case when (select count(*) from leads l where l.campaign_id = c.id and l.email is not null) > 0
              then round((coalesce(p.consultas,0) * a.precio_places_mil / 1000.0
                        + coalesce(m.coste,0))
                        / (select count(*) from leads l where l.campaign_id = c.id and l.email is not null), 4) end,
         case when (select count(*) from messages m2 join leads l on l.id = m2.lead_id
                     where l.campaign_id = c.id) > 0
              then round(coalesce(m.coste,0)
                        / (select count(*) from messages m2 join leads l on l.id = m2.lead_id
                            where l.campaign_id = c.id), 4) end,
         coalesce(m.falta, false),
         a.moneda
    from campaigns c
    join tenants t on t.id = c.tenant_id
    left join places p on p.cid = c.id
    left join modelo m on m.cid = c.id
   -- Por posición: la columna de total no tiene alias utilizable aquí.
   order by 15 desc nulls last
   limit greatest(least(p_limite, 500), 1);
end;
$fn$;

-- ------------------------------------------------------------
-- 6 · Unidad económica
--
-- Lo que hace falta para poner precio. Con mediana además de media: cuatro
-- campañas de prueba a cero arrastran la media y hacen parecer barato algo
-- que no lo es.
-- ------------------------------------------------------------
create or replace function panel_economia()
returns table (
  campanas_con_gasto int,
  coste_medio numeric, coste_mediano numeric, coste_maximo numeric,
  leads_medios int, leads_email_medios int,
  coste_por_lead numeric, coste_por_lead_email numeric, coste_por_mensaje numeric,
  gasto_places numeric, gasto_modelo numeric,
  pct_places numeric, moneda text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare a record;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  select * into a from ajustes limit 1;

  return query
  with c as (select * from panel_costes_campana(500) where coste_total > 0),
       tot as (select coalesce(sum(coste_places),0) as pl, coalesce(sum(coste_modelo),0) as mo from c)
  select
    (select count(*)::int from c),
    round((select coalesce(avg(coste_total), 0) from c), 4),
    -- percentile_cont devuelve double precision y round(double, int) no
    -- existe en Postgres: hay que volver a numeric antes de redondear.
    round((select coalesce(percentile_cont(0.5) within group (order by c.coste_total), 0) from c)::numeric, 4),
    round((select coalesce(max(coste_total), 0) from c), 4),
    (select coalesce(avg(leads), 0)::int from c),
    (select coalesce(avg(leads_email), 0)::int from c),
    -- Agregado, no media de medias: una campaña de 3 leads no debe pesar lo
    -- mismo que una de 975 al calcular lo que cuesta un lead.
    case when (select sum(leads) from c) > 0
         then round((select sum(coste_total) from c) / (select sum(leads) from c), 4) end,
    case when (select sum(leads_email) from c) > 0
         then round((select sum(coste_total) from c) / (select sum(leads_email) from c), 4) end,
    case when (select sum(mensajes) from c) > 0
         then round((select sum(coste_modelo) from c) / (select sum(mensajes) from c), 4) end,
    round((select pl from tot), 4),
    round((select mo from tot), 4),
    case when (select pl + mo from tot) > 0
         then round((select pl from tot) * 100 / (select pl + mo from tot), 1) else 0 end,
    a.moneda;
end;
$fn$;

revoke execute on function panel_costes_campana(int) from public, anon;
revoke execute on function panel_economia()         from public, anon;
grant  execute on function panel_costes_campana(int) to authenticated;
grant  execute on function panel_economia()          to authenticated;
