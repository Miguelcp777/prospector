-- ============================================================
-- Prospector · 004 · devolver la cuota de una demo fallida
-- Ejecutar en el SQL Editor. No depende de 003.
--
-- registrar_uso_demo cobra antes de inferir, y así tiene que ser: cobrar
-- después dejaría la llamada a Claude fuera del techo de gasto, que es
-- exactamente lo que la cuota existe para impedir.
--
-- El efecto secundario es que un fallo nuestro le gasta el intento al
-- visitante. Con cinco al día, cinco errores seguidos lo dejan fuera sin
-- haber visto nada — y sin entender por qué. Esta función deshace el cargo
-- cuando la culpa no es suya.
-- ============================================================

create or replace function devolver_uso_demo(p_ip_hash text)
returns int
language sql
security definer
set search_path = public
as $fn$
  update demo_usos
     set usos = greatest(0, usos - 1),
         actualizado_en = now()
   where ip_hash = p_ip_hash
     and dia = current_date
  returning usos;
$fn$;

-- ------------------------------------------------------------
-- Permisos
--
-- SECURITY DEFINER: se salta la RLS de demo_usos, que no tiene políticas.
-- Abierta a anon sería literalmente un botón de "devuélveme el intento":
-- cualquiera alternaría inferir y devolver, y la cuota dejaría de acotar
-- nada. La llama el worker con service_role, nadie más.
-- ------------------------------------------------------------
revoke execute on function devolver_uso_demo(text) from public, anon, authenticated;
grant  execute on function devolver_uso_demo(text) to service_role;
