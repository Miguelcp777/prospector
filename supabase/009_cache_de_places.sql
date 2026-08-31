-- ============================================================
-- Prospector · 009 · caché de búsquedas de Places
-- Ejecutar después de 008.
--
-- Cierra la decisión abierta de docs/arquitectura.md: «cachear resultados
-- de Places por zona, para no pagar dos veces la misma búsqueda en campañas
-- distintas del mismo cliente».
--
-- El enfriado de 007 evita repetir LA MISMA campaña. Esto evita pagar dos
-- veces por «gimnasios en Valencia» cuando el cliente lanza una segunda
-- campaña en la misma ciudad. Un acierto de caché no llama a Places y, por
-- tanto, tampoco cuenta consulta.
--
-- ------------------------------------------------------------
-- PENDIENTE DE VERIFICAR — términos de uso de Places
--
-- Google restringe el cacheo de contenido de Places. El `place_id` está
-- pensado para guardarse a largo plazo; el resto del contenido tiene
-- límites que NO se han verificado al escribir esto.
--
-- Por eso la caducidad es por tenant y configurable (`dias_cache_places`):
-- si los términos exigen otra ventana, es cambiar un número. Con 0 la caché
-- queda desactivada de hecho, sin tocar código.
--
-- La conclusión, cuando se verifique, va a docs/compliance.md.
-- ------------------------------------------------------------
-- ============================================================

alter table tenants add column if not exists dias_cache_places int not null default 30
  check (dias_cache_places between 0 and 365);

comment on column tenants.dias_cache_places is
  'Días que se reutiliza una búsqueda de Places. 0 desactiva la caché.';

-- ------------------------------------------------------------
-- La caché
--
-- Por tenant, no global. Compartirla entre clientes significaría que la
-- búsqueda que paga uno se la queda otro, y mezclaría datos entre tenants
-- justo en el proyecto cuyo principio número uno es que eso no pase.
--
-- La clave es (query, centro, radio, página) normalizada, no el pageToken:
-- los tokens de Places caducan, así que una caché indexada por token no se
-- puede reproducir. Por número de página sí.
-- ------------------------------------------------------------
create table if not exists places_cache (
  tenant_id     uuid not null references tenants(id) on delete cascade,
  clave         text not null,
  respuesta     jsonb not null,
  hay_siguiente boolean not null default false,
  capturado_en  timestamptz not null default now(),
  primary key (tenant_id, clave)
);

create index if not exists places_cache_edad on places_cache(capturado_en);

-- RLS sin políticas: nadie llega aquí con la anon key. Solo el worker, por
-- las dos funciones de abajo. Es contenido de Places con restricciones de
-- uso; cuanta menos superficie, mejor.
alter table places_cache enable row level security;

-- ------------------------------------------------------------
-- Leer: devuelve la fila solo si sigue fresca según el tenant
--
-- La caducidad se decide aquí y no en el worker para que haya un único
-- sitio donde cambiarla si los términos lo exigen.
-- ------------------------------------------------------------
create or replace function leer_cache_places(p_tenant uuid, p_clave text)
returns table (respuesta jsonb, hay_siguiente boolean)
language sql
security definer
set search_path = public
as $fn$
  select pc.respuesta, pc.hay_siguiente
    from places_cache pc
    join tenants t on t.id = pc.tenant_id
   where pc.tenant_id = p_tenant
     and pc.clave = p_clave
     and t.dias_cache_places > 0
     and pc.capturado_en > now() - make_interval(days => t.dias_cache_places);
$fn$;

-- ------------------------------------------------------------
-- Escribir
-- ------------------------------------------------------------
create or replace function guardar_cache_places(
  p_tenant        uuid,
  p_clave         text,
  p_respuesta     jsonb,
  p_hay_siguiente boolean
)
returns void
language sql
security definer
set search_path = public
as $fn$
  insert into places_cache (tenant_id, clave, respuesta, hay_siguiente, capturado_en)
  select p_tenant, p_clave, p_respuesta, p_hay_siguiente, now()
   where (select dias_cache_places from tenants where id = p_tenant) > 0
  on conflict (tenant_id, clave)
    do update set respuesta = excluded.respuesta,
                  hay_siguiente = excluded.hay_siguiente,
                  capturado_en = now();
$fn$;

-- ------------------------------------------------------------
-- Higiene: borrar lo caducado
--
-- No es solo limpieza. Mientras no se verifiquen los términos, cuanto menos
-- tiempo viva el contenido de Places en la base, mejor.
-- ------------------------------------------------------------
create or replace function limpiar_places_cache()
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_borradas int;
begin
  delete from places_cache pc
   using tenants t
   where t.id = pc.tenant_id
     and (t.dias_cache_places = 0
          or pc.capturado_en < now() - make_interval(days => t.dias_cache_places));
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$fn$;

-- ------------------------------------------------------------
-- Permisos · las tres se saltan la RLS
-- ------------------------------------------------------------
revoke execute on function leer_cache_places(uuid, text)                from public, anon, authenticated;
revoke execute on function guardar_cache_places(uuid, text, jsonb, bool) from public, anon, authenticated;
revoke execute on function limpiar_places_cache()                       from public, anon, authenticated;

grant execute on function leer_cache_places(uuid, text)                 to service_role;
grant execute on function guardar_cache_places(uuid, text, jsonb, bool) to service_role;
grant execute on function limpiar_places_cache()                        to postgres, service_role;

-- ------------------------------------------------------------
-- Purga nocturna. Ejecutar solo si pg_cron ya está instalado (003).
-- ------------------------------------------------------------
-- select cron.schedule('prospector-limpiar-cache', '30 4 * * *',
--                      $cron$ select limpiar_places_cache(); $cron$);
