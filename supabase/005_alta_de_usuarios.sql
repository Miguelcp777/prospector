-- ============================================================
-- Prospector · 005 · alta de usuarios
-- Ejecutar en el SQL Editor. No depende de 003 ni de 004.
--
-- No hay tabla de usuarios ni de contraseñas, y no debe haberla: `auth.users`
-- ya guarda el hash, la confirmación por email y las sesiones. Lo que falta
-- es enganchar ese registro con el modelo del producto — un usuario sin fila
-- en `profiles` no tiene tenant, y `auth_tenant_id()` le devuelve null, con
-- lo que la RLS le oculta absolutamente todo.
--
-- Este era el pendiente que arrastraba supabase/README.md.
-- ============================================================

-- ------------------------------------------------------------
-- Al registrarse: un tenant nuevo y su perfil de propietario
--
-- Los datos del negocio llegan como metadata del signUp (options.data).
-- Van con valores de respaldo a propósito: si este trigger lanza una
-- excepción, Postgres aborta el INSERT en auth.users y el registro falla
-- entero. Un tenant con el nombre a medias se arregla en el onboarding;
-- un registro que revienta, no.
-- ------------------------------------------------------------
create or replace function crear_tenant_y_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant   uuid;
  v_nombre   text;
  v_vertical text;
  v_ciudad   text;
begin
  -- nullif(trim(...)) para que una cadena vacía cuente como ausente:
  -- un formulario enviado en blanco manda "", no null.
  v_nombre   := nullif(trim(new.raw_user_meta_data ->> 'negocio'),  '');
  v_vertical := nullif(trim(new.raw_user_meta_data ->> 'vertical'), '');
  v_ciudad   := nullif(trim(new.raw_user_meta_data ->> 'ciudad'),   '');

  insert into tenants (nombre, vertical, ciudad)
  values (
    coalesce(v_nombre, split_part(new.email, '@', 1)),
    coalesce(v_vertical, 'sin_definir'),
    v_ciudad
  )
  returning id into v_tenant;

  -- El primero que entra es el propietario. Las invitaciones vendrán después
  -- y crearán perfiles 'miembro' contra un tenant que ya existe.
  insert into profiles (id, tenant_id, email, rol)
  values (new.id, v_tenant, new.email, 'propietario')
  on conflict (id) do nothing;

  return new;
end;
$fn$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_tenant_y_perfil();

-- ------------------------------------------------------------
-- Permisos
--
-- SECURITY DEFINER: escribe en tenants y profiles saltándose la RLS, que es
-- justo lo que hace falta (el usuario aún no tiene tenant cuando se ejecuta).
-- La dispara Postgres, no la llama nadie: revocarla no le quita nada al
-- trigger y sí cierra la puerta a que alguien la invoque por su cuenta.
-- ------------------------------------------------------------
revoke execute on function crear_tenant_y_perfil() from public, anon, authenticated;

-- ------------------------------------------------------------
-- El onboarding necesita corregir lo que el alta dejó a medias
--
-- `tenants` solo tenía política de SELECT, así que el propietario podía ver
-- su negocio pero no cambiarle el nombre ni la vertical. Sin esto, el tenant
-- se queda para siempre con lo que se escribió en el registro.
-- ------------------------------------------------------------
drop policy if exists tenant_propio_actualiza on tenants;
create policy tenant_propio_actualiza on tenants
  for update using (id = auth_tenant_id())
  with check (id = auth_tenant_id());
