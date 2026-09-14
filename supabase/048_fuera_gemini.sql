-- ============================================================
-- Prospector · 048 · fuera Gemini
-- Ejecutar DESPUÉS de 047_claves_de_modelo_del_cliente.sql.
--
-- La 041 lo metió en la lista «para tenerlo puesto el día que haga falta», y
-- la 047 lo arrastró a la pantalla del cliente. Ese día no ha llegado:
-- ningún motor de Prospector habla con Gemini, y los tres avisos que había
-- que poner para explicarlo —en el panel, en la pantalla del cliente y en el
-- README— son la señal de que la opción sobraba.
--
-- Un campo que solo sirve para explicar que no sirve es peor que no tenerlo:
-- en la pantalla del cliente, además, invita a pegar una clave que no le va
-- a dar servicio y a quedarse sin IA creyendo que ya está.
--
-- No se borra nada de nadie: comprobado antes de escribir esto, no hay
-- ningún secreto de Gemini en el Vault ni ningún cliente que lo haya
-- elegido. Si algún día vuelve, vuelve con su motor detrás.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La lista blanca, sin él
--
-- Es la que gobierna qué nombres se pueden tocar desde el panel y desde la
-- cuenta del cliente. Quitarlo de aquí lo quita de las dos pantallas, de
-- `guardar_clave_modelo`, de `guardar_clave_modelo_cliente` y de
-- `resolver_clave_modelo`, que validan contra ella.
-- ------------------------------------------------------------
create or replace function proveedores_de_modelo()
returns table (proveedor text, secreto text, etiqueta text, en_uso boolean)
language sql
immutable
as $fn$
  select * from (values
    ('openai',    'openai_api_key',    'OpenAI',    true),
    ('anthropic', 'anthropic_api_key', 'Anthropic', true)
  ) as p(proveedor, secreto, etiqueta, en_uso);
$fn$;

-- ------------------------------------------------------------
-- 2 · El proveedor elegido por cada cliente
--
-- La tabla está vacía —nadie ha elegido nada todavía— así que el check se
-- puede estrechar sin tocar una sola fila.
-- ------------------------------------------------------------
alter table config_modelo drop constraint if exists config_modelo_proveedor_check;
alter table config_modelo add constraint config_modelo_proveedor_check
  check (proveedor in ('anthropic','openai'));

-- ------------------------------------------------------------
-- 3 · Las dos funciones que lo nombraban a mano
-- ------------------------------------------------------------
create or replace function elegir_proveedor_modelo(p_proveedor text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
  v_prov   text := lower(trim(coalesce(p_proveedor, '')));
begin
  if v_tenant is null or not es_propietario() then
    raise exception 'No autorizado';
  end if;
  if v_prov not in ('anthropic','openai') then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  insert into config_modelo (tenant_id, proveedor)
  values (v_tenant, v_prov)
  on conflict (tenant_id) do update
    set proveedor = excluded.proveedor, actualizado_en = now();
end;
$fn$;

-- Guardar la clave de texto ya no tiene alternativa: es Anthropic o nada,
-- que es exactamente lo que hacen los motores.
create or replace function guardar_clave_modelo_cliente(p_proveedor text, p_clave text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_tenant uuid := auth_tenant_id();
  v_prov   text := lower(trim(coalesce(p_proveedor, '')));
  v_clave  text := trim(coalesce(p_clave, ''));
  v_nombre text;
  v_id     uuid;
begin
  if v_tenant is null or not es_propietario() then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from proveedores_de_modelo() p where p.proveedor = v_prov) then
    raise exception 'Proveedor desconocido: %', p_proveedor;
  end if;

  if length(v_clave) < 20 then
    raise exception 'Esa clave es demasiado corta para serlo';
  end if;

  v_nombre := nombre_secreto_modelo(v_tenant, v_prov);
  select id into v_id from vault.secrets where name = v_nombre;

  if v_id is null then
    perform vault.create_secret(
      v_clave, v_nombre,
      format('Clave de %s del cliente %s', v_prov, v_tenant));
  else
    perform vault.update_secret(v_id, v_clave);
  end if;

  if v_prov = 'anthropic' then
    insert into config_modelo (tenant_id, proveedor)
    values (v_tenant, v_prov)
    on conflict (tenant_id) do update
      set proveedor = excluded.proveedor, actualizado_en = now();
  end if;
end;
$fn$;
