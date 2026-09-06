-- ============================================================
-- Prospector · 029 · módulos por cliente y gobierno desde el panel
--
-- Dos cosas:
--   1. La app se vende por módulos: Prospección, Email marketing, o los dos.
--   2. El administrador puede ver y editar la configuración de cualquier
--      cliente sin salir de la app.
--
-- EL LÍMITE, que conviene dejar escrito antes que el código: "todas las
-- opciones de todos los usuarios" son sus AJUSTES —plan, módulos, topes,
-- datos del negocio, remitente—, no sus datos. El panel sigue sin enseñar
-- un lead, un correo ni el cuerpo de un mensaje. Somos encargados del
-- tratamiento de datos que son de nuestros clientes, no nuestros. Ver
-- docs/compliance.md y la sección "Qué enseña, y qué no" del README.
--
-- Ejecutar DESPUÉS de 028_correo_del_cliente.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Los módulos
--
-- Van en `tenants`, donde ya están el plan y los topes. Y por defecto
-- activos: quien ya es cliente lo es de todo, y una migración no debe
-- quitarle nada a nadie mientras duerme.
--
-- No hace falta revocar nada: la 021 dejó el UPDATE de `tenants` concedido
-- solo sobre nombre, vertical y ciudad, así que una columna nueva nace ya
-- fuera del alcance del cliente. Se comprueba al final del archivo.
-- ------------------------------------------------------------
alter table tenants add column if not exists modulo_prospeccion boolean not null default true;
alter table tenants add column if not exists modulo_email       boolean not null default true;

comment on column tenants.modulo_prospeccion is
  'Campañas y leads. Lo apaga el administrador desde el panel.';
comment on column tenants.modulo_email is
  'Plantillas, mensajes, historial y supresiones.';

-- ------------------------------------------------------------
-- 2 · La guarda, en la base y no en el menú
--
-- Esconder una sección del menú no desactiva nada: la clave publicable va
-- en el bundle de todo el mundo y las funciones se llaman desde la consola
-- del navegador. Si el módulo apagado solo apaga el menú, no está vendido,
-- está disimulado.
--
-- El control va sobre `jobs`, que es por donde pasan las tres funciones de
-- encolado —descubrir, enriquecer y redactar— en vez de dentro de cada una.
-- Un sitio en lugar de tres, y las tres siguen intactas.
-- ------------------------------------------------------------
create or replace function frenar_job_sin_modulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_prospeccion boolean;
  v_email       boolean;
begin
  select modulo_prospeccion, modulo_email
    into v_prospeccion, v_email
    from tenants where id = new.tenant_id;

  if new.tipo in ('descubrir','enriquecer','puntuar') and not coalesce(v_prospeccion, true) then
    raise exception
      'El módulo de Prospección no está activo en esta cuenta. Lo activa quien lleva el servicio.';
  end if;

  if new.tipo = 'redactar' and not coalesce(v_email, true) then
    raise exception
      'El módulo de Email marketing no está activo en esta cuenta. Lo activa quien lleva el servicio.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists jobs_exigen_modulo on jobs;
create trigger jobs_exigen_modulo
  before insert on jobs
  for each row execute function frenar_job_sin_modulo();

-- Las plantillas no pasan por `jobs`: se crean desde el studio.
create or replace function frenar_plantilla_sin_modulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not coalesce((select modulo_email from tenants where id = new.tenant_id), true) then
    raise exception
      'El módulo de Email marketing no está activo en esta cuenta. Lo activa quien lleva el servicio.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists plantillas_exigen_modulo on plantillas;
create trigger plantillas_exigen_modulo
  before insert on plantillas
  for each row execute function frenar_plantilla_sin_modulo();

-- ------------------------------------------------------------
-- 3 · Ver un cliente entero, desde el panel
--
-- Sus ajustes, y las cifras que ya se enseñaban agregadas. Ni un lead ni un
-- correo: el cruce entre tenants ocurre solo aquí dentro, y por eso NO hay
-- una política de tipo "el admin ve todas las filas de leads", que dejaría
-- la lectura entre clientes a un JWT de distancia en todas las tablas.
-- ------------------------------------------------------------
create or replace function panel_cliente(p_tenant uuid)
returns table (
  id uuid, nombre text, vertical text, ciudad text, plan text,
  creado_en timestamptz,
  modulo_prospeccion boolean, modulo_email boolean,
  max_consultas_mes int, dias_cache_places int,
  usuarios bigint, campanas bigint, leads bigint, plantillas bigint,
  mensajes bigint, enviados bigint,
  correo_remitente text, correo_estado text, correo_modo text
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
  select t.id, t.nombre, t.vertical, t.ciudad, t.plan, t.creado_en,
         t.modulo_prospeccion, t.modulo_email,
         t.max_consultas_mes, t.dias_cache_places,
         (select count(*) from profiles p  where p.tenant_id = t.id),
         (select count(*) from campaigns c where c.tenant_id = t.id),
         (select count(*) from leads l     where l.tenant_id = t.id),
         (select count(*) from plantillas pl where pl.tenant_id = t.id),
         (select count(*) from messages m  where m.tenant_id = t.id),
         (select count(*) from messages m  where m.tenant_id = t.id and m.estado = 'enviado'),
         (select case when cc.buzon is not null and cc.dominio is not null
                      then cc.buzon || '@' || cc.dominio end
            from config_correo cc where cc.tenant_id = t.id),
         (select cc.estado_dominio from config_correo cc where cc.tenant_id = t.id),
         (select cc.modo from config_correo cc where cc.tenant_id = t.id)
    from tenants t
   where t.id = p_tenant;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · Editar los ajustes de un cliente
--
-- Un parámetro por cosa y todos opcionales: pasar null deja el valor como
-- estaba. Así la pantalla puede guardar solo lo que ha tocado sin arrastrar
-- el resto y sin pisar lo que otro haya cambiado entretanto.
--
-- Deja fuera a propósito el nombre, la vertical y la ciudad: eso lo edita
-- el cliente en su Cuenta, y que dos sitios escriban lo mismo es cómo se
-- pierden los cambios de alguien.
-- ------------------------------------------------------------
create or replace function panel_guardar_cliente(
  p_tenant             uuid,
  p_plan               text default null,
  p_modulo_prospeccion boolean default null,
  p_modulo_email       boolean default null,
  p_max_consultas_mes  int default null,
  p_dias_cache_places  int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  -- Un cliente sin ningún módulo no puede hacer nada y no tiene nombre en
  -- la lista de precios. Casi siempre es un clic mal dado.
  if coalesce(p_modulo_prospeccion,
              (select modulo_prospeccion from tenants where id = p_tenant)) = false
     and coalesce(p_modulo_email,
              (select modulo_email from tenants where id = p_tenant)) = false then
    raise exception
      'No se puede dejar a un cliente sin ningún módulo. Si es una baja, cámbiale el plan.';
  end if;

  update tenants set
    plan               = coalesce(p_plan, plan),
    modulo_prospeccion = coalesce(p_modulo_prospeccion, modulo_prospeccion),
    modulo_email       = coalesce(p_modulo_email, modulo_email),
    max_consultas_mes  = coalesce(p_max_consultas_mes, max_consultas_mes),
    dias_cache_places  = coalesce(p_dias_cache_places, dias_cache_places)
  where id = p_tenant;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Permisos
--
-- Las cuatro son SECURITY DEFINER y se saltan la RLS. Postgres las abre a
-- public por defecto; dejarlas así significa que cualquiera con la clave
-- del navegador se activa módulos o lee los ajustes de otro cliente.
--
-- Las dos de trigger no se conceden a nadie: las llama Postgres.
-- ------------------------------------------------------------
revoke execute on function panel_cliente(uuid) from public, anon;
revoke execute on function panel_guardar_cliente(uuid, text, boolean, boolean, int, int)
  from public, anon;
revoke execute on function frenar_job_sin_modulo()       from public, anon, authenticated;
revoke execute on function frenar_plantilla_sin_modulo() from public, anon, authenticated;

-- Se conceden a authenticated porque es_admin() decide dentro. Que la
-- sección esté escondida en el menú no protege nada.
grant execute on function panel_cliente(uuid) to authenticated;
grant execute on function panel_guardar_cliente(uuid, text, boolean, boolean, int, int)
  to authenticated;
