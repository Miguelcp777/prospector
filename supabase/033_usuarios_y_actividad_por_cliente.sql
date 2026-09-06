-- ============================================================
-- Prospector · 033 · usuarios, y actividad de un cliente día a día
--
-- Para el panel: la lista de todos los usuarios con permisos, módulos y
-- fechas, y al abrir uno, la serie diaria de su cliente y sus registros.
--
-- LO QUE NO SE PUEDE MEDIR, dicho aquí para que no se prometa arriba:
--
--   · Tráfico de datos. No se cuentan bytes en ninguna parte. Lo más
--     parecido que sí existe son las operaciones que cuestan dinero
--     —tokens del modelo, consultas a Places— y los objetos creados.
--   · Histórico de conexiones. `auth.audit_log_entries` está vacío en este
--     proyecto, así que lo único disponible es `auth.users.last_sign_in_at`
--     y las filas de `auth.sessions`, que Supabase va limpiando. Es
--     "cuándo se ha conectado últimamente", no un histórico.
--
-- Se cruzan tenants aquí dentro y solo aquí, como el resto de panel_*: no
-- hay ninguna política que abra las tablas al administrador.
--
-- Ejecutar DESPUÉS de 032_salud_distingue_hoy_de_ayer.sql.
-- ============================================================

create or replace function panel_usuarios()
returns table (
  usuario_id uuid, email text, rol text, es_admin boolean,
  tenant_id uuid, cliente text, vertical text, plan text,
  modulo_prospeccion boolean, modulo_email boolean,
  alta timestamptz, ultima_conexion timestamptz, correo_confirmado boolean,
  dias_sin_entrar int, sesiones_abiertas bigint)
language plpgsql security definer set search_path = public, auth as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  return query
  select p.id, p.email, p.rol,
         exists (select 1 from administradores a where a.usuario_id = p.id),
         t.id, t.nombre, t.vertical, t.plan,
         t.modulo_prospeccion, t.modulo_email,
         p.creado_en, u.last_sign_in_at, u.email_confirmed_at is not null,
         case when u.last_sign_in_at is null then null
              else extract(day from now() - u.last_sign_in_at)::int end,
         (select count(*) from auth.sessions s where s.user_id = p.id)
    from profiles p
    join tenants t on t.id = p.tenant_id
    left join auth.users u on u.id = p.id
   order by u.last_sign_in_at desc nulls last;
end;
$fn$;

-- Mismas columnas que panel_actividad para poder reusar el componente de
-- barras del panel en vez de escribir un segundo gráfico.
create or replace function panel_actividad_cliente(p_tenant uuid, p_dias int default 30)
returns table (
  dia date, campanas bigint, leads bigint, mensajes bigint,
  enviados bigint, tokens bigint, incidencias bigint, conexiones bigint)
language plpgsql security definer set search_path = public, auth as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  return query
  with d as (
    select generate_series(current_date - (p_dias - 1), current_date, '1 day')::date as dia
  )
  select d.dia,
    (select count(*) from campaigns c where c.tenant_id = p_tenant and c.creado_en::date = d.dia),
    (select count(*) from leads l     where l.tenant_id = p_tenant and l.capturado_en::date = d.dia),
    (select count(*) from messages m  where m.tenant_id = p_tenant and m.creado_en::date = d.dia),
    (select count(*) from messages m  where m.tenant_id = p_tenant and m.enviado_en::date = d.dia),
    (select coalesce(sum(cm.tokens_entrada + cm.tokens_salida), 0)::bigint
       from consumo_modelo cm where cm.tenant_id = p_tenant and cm.dia = d.dia),
    (select count(*) from incidencias i where i.tenant_id = p_tenant and i.creado_en::date = d.dia),
    (select count(distinct s.user_id) from auth.sessions s
       join profiles p on p.id = s.user_id
      where p.tenant_id = p_tenant and s.updated_at::date = d.dia)
  from d order by d.dia;
end;
$fn$;

-- Los registros de un cliente, de las dos fuentes que existen: lo que la
-- app registró en `incidencias` y lo que reventó en el worker, que hasta
-- ahora solo estaba en job_tareas.detalle y no se veía desde ningún sitio.
create or replace function panel_logs_cliente(p_tenant uuid, p_limite int default 40)
returns table (cuando timestamptz, origen text, componente text, mensaje text, veces int)
language plpgsql security definer set search_path = public as $fn$
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  return query
  (select i.actualizado_en, 'incidencia'::text, i.componente,
          left(i.mensaje, 200), i.veces
     from incidencias i where i.tenant_id = p_tenant)
  union all
  (select t.actualizado_en, 'tarea'::text, j.tipo,
          left(coalesce(t.detalle, '(sin detalle)'), 200), 1
     from job_tareas t join jobs j on j.id = t.job_id
    where t.tenant_id = p_tenant and t.estado = 'error')
  order by 1 desc limit p_limite;
end;
$fn$;

-- SECURITY DEFINER y cruzan tenants. Postgres las abre a public por
-- defecto: sin esto, cualquiera con la clave del navegador tendría la lista
-- de correos de todos los usuarios del servicio.
revoke execute on function panel_usuarios()                   from public, anon;
revoke execute on function panel_actividad_cliente(uuid, int) from public, anon;
revoke execute on function panel_logs_cliente(uuid, int)      from public, anon;

grant execute on function panel_usuarios()                   to authenticated;
grant execute on function panel_actividad_cliente(uuid, int) to authenticated;
grant execute on function panel_logs_cliente(uuid, int)      to authenticated;
