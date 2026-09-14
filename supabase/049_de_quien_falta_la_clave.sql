-- ============================================================
-- Prospector · 049 · de quién falta la clave
-- Ejecutar DESPUÉS de 048_fuera_gemini.sql.
--
-- La 047 devolvía un solo `falta` para dos situaciones que no se parecen:
--
--   · un cliente fuera de la versión de prueba que no ha puesto la suya
--   · un cliente EN versión de prueba, al que le toca la del servicio,
--     cuando esa clave no existe
--
-- El aviso salía igual en los dos casos: «falta la clave de tu cuenta, se
-- pega en Cuenta → Proveedor de modelo». Al segundo eso le manda a hacer
-- algo que no le corresponde —y que no arregla nada, porque quien tiene que
-- poner esa clave es quien lleva el servicio—.
--
-- Se vio con la generación de imágenes: no hay clave de OpenAI del servicio
-- y la cuenta estaba en modo demo, así que el mensaje pedía una clave propia
-- a quien no tenía por qué ponerla.
-- ============================================================

create or replace function resolver_clave_modelo(p_tenant uuid, p_proveedor text)
returns table (origen text, clave text, proveedor text)
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_prov  text := lower(trim(coalesce(p_proveedor, '')));
  v_clave text;
  v_demo  boolean;
begin
  if not exists (select 1 from proveedores_de_modelo() p where p.proveedor = v_prov) then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  -- 1 · La del cliente, si la tiene.
  if p_tenant is not null then
    select d.decrypted_secret into v_clave
      from vault.decrypted_secrets d
     where d.name = nombre_secreto_modelo(p_tenant, v_prov);

    if v_clave is not null then
      return query select 'cliente', v_clave, v_prov;
      return;
    end if;
  end if;

  -- 2 · ¿Le toca la del servicio? Demo pública o versión de prueba.
  if p_tenant is null then
    v_demo := true;
  else
    select t.modo_demo into v_demo from tenants t where t.id = p_tenant;
    v_demo := coalesce(v_demo, false);
  end if;

  if v_demo then
    select d.decrypted_secret into v_clave
      from vault.decrypted_secrets d
     where d.name = secreto_del_proveedor(v_prov);

    if v_clave is not null then
      return query select 'servicio', v_clave, v_prov;
    else
      -- Le tocaba la del servicio y no está. No es cosa suya.
      return query select 'falta_servicio', null::text, v_prov;
    end if;
    return;
  end if;

  -- 3 · No le toca la nuestra y no tiene la suya. Aquí sí es cosa suya.
  return query select 'falta_cliente', null::text, v_prov;
end;
$fn$;

revoke execute on function resolver_clave_modelo(uuid, text) from public, anon, authenticated;
grant  execute on function resolver_clave_modelo(uuid, text) to service_role;
