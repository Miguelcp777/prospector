-- ============================================================
-- Prospector · 021 · alta con Google
--
-- Entrar con Google no pasa por el formulario de registro, así que el
-- trigger de alta se queda sin los datos del negocio. No falla —005 ya
-- llevaba valores de reserva— pero deja el tenant a medias, y eso importa
-- más de lo que parece: `Segmentos.tsx` le pasa `tenants.vertical` al
-- prompt de inferencia. Con 'sin_definir' dentro, el modelo propone
-- segmentos de nada.
--
-- Aquí van las dos piezas de base que eso necesita. La pantalla de cuenta
-- pasa a ser editable, y el aviso de negocio incompleto, en el frontend.
--
-- Ejecutar DESPUÉS de 020_evitar_repetidos_y_respuesta.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Un nombre de tenant menos feo cuando llega por Google
--
-- Google manda `full_name` y `name` en la metadata; nuestro formulario
-- manda `negocio`. Sin esto el tenant se llamaba como el trozo del email
-- delante de la arroba, que es lo primero que ve el cliente al entrar.
--
-- Ninguno de los dos es el nombre del negocio de verdad —Google sabe cómo
-- se llama la persona, no su clínica— así que esto es un marcador de
-- posición mejor, no una solución. La solución es que lo edite, y para eso
-- está el punto 2.
--
-- La vertical se queda en 'sin_definir' a propósito: es la señal de que
-- falta completar el alta, y el frontend la usa para avisar.
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
  v_nombre   := coalesce(
                  nullif(trim(new.raw_user_meta_data ->> 'negocio'),   ''),
                  nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(trim(new.raw_user_meta_data ->> 'name'),      '')
                );
  v_vertical := nullif(trim(new.raw_user_meta_data ->> 'vertical'), '');
  v_ciudad   := nullif(trim(new.raw_user_meta_data ->> 'ciudad'),   '');

  insert into tenants (nombre, vertical, ciudad)
  values (
    coalesce(v_nombre, split_part(new.email, '@', 1)),
    coalesce(v_vertical, 'sin_definir'),
    v_ciudad
  )
  returning id into v_tenant;

  insert into profiles (id, tenant_id, email, rol)
  values (new.id, v_tenant, new.email, 'propietario')
  on conflict (id) do nothing;

  return new;
end;
$fn$;

-- ------------------------------------------------------------
-- 2 · La cuenta se edita, pero solo por donde debe
--
-- La política `tenant_propio_actualiza` de 005 acota las FILAS: cada uno
-- toca la suya. No acota las COLUMNAS, y en esta tabla vive
-- `max_consultas_mes`, que es el reparto del presupuesto de Places entre
-- clientes. Con la pantalla de cuenta en solo lectura eso no se notaba;
-- en cuanto se puede escribir, cualquiera se sube su propio techo desde la
-- consola del navegador con la clave anon, que es pública.
--
-- El techo del proyecto (`ajustes.max_consultas_mes_proyecto`) seguiría
-- frenando la factura —`reclamar_tareas` comprueba los tres a la vez— así
-- que esto no era una fuga de dinero. Era un cliente capaz de comerse el
-- presupuesto de los demás.
--
-- Permiso por columna: RLS decide qué filas, el GRANT decide qué campos.
-- ------------------------------------------------------------
revoke update on tenants from anon, authenticated;
grant  update (nombre, vertical, ciudad) on tenants to authenticated;

-- Y de paso, lo que nunca hizo falta. Las filas de `tenants` las crea el
-- trigger de alta, que es SECURITY DEFINER y corre como su dueño: quitarle
-- el INSERT a authenticated no rompe ningún registro. Borrar un tenant no
-- lo hace nadie desde la app.
revoke insert, delete, truncate on tenants from anon, authenticated;
