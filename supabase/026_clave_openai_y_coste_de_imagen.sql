-- ============================================================
-- Prospector · 026 · clave de OpenAI y coste por imagen
--
-- Generar imágenes necesita un proveedor que las cree, y el modelo que usa
-- Prospector no las genera. Esta migración da dos cosas: dónde guardar esa
-- clave sin que se vea, y cómo contar lo que cuestan las imágenes.
--
-- Ejecutar DESPUÉS de 025_studio_de_plantillas.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La clave, en el Vault
--
-- La regla del proyecto es que las claves de API viven en los secretos de
-- las Edge Functions y jamás en el cliente. Aquí hay una tensión: se pide
-- poder pegarla desde el panel, y el panel es el navegador.
--
-- Se resuelve haciéndola de UNA SOLA DIRECCIÓN. Se puede escribir desde el
-- panel; no se puede leer desde ahí. La lectura está concedida solo a
-- `service_role`, que es quien corre dentro de la Edge Function.
--
-- El Vault la guarda cifrada, así que tampoco aparece en claro en un volcado
-- de la base ni en una copia de seguridad.
-- ------------------------------------------------------------

create or replace function guardar_clave_openai(p_clave text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
declare
  v_id    uuid;
  v_clave text := trim(coalesce(p_clave, ''));
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  -- Una comprobación mínima de forma, para que un pegado a medias no
  -- sustituya una clave buena por basura.
  if length(v_clave) < 20 then
    raise exception 'Esa clave es demasiado corta para serlo';
  end if;

  select id into v_id from vault.secrets where name = 'openai_api_key';

  if v_id is null then
    perform vault.create_secret(
      v_clave, 'openai_api_key',
      'Clave de OpenAI para generar imágenes en el studio de plantillas');
  else
    perform vault.update_secret(v_id, v_clave);
  end if;
end;
$fn$;

-- Si hay clave y cuándo se puso. NO la devuelve: solo los cuatro últimos
-- caracteres, que es lo justo para saber si la que hay es la que crees.
create or replace function estado_clave_openai()
returns table (configurada boolean, actualizada_en timestamptz, pista text)
language plpgsql
security definer
set search_path = public, vault
as $fn$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select true,
         s.updated_at,
         '…' || right(d.decrypted_secret, 4)
    from vault.secrets s
    join vault.decrypted_secrets d on d.id = s.id
   where s.name = 'openai_api_key';

  if not found then
    return query select false, null::timestamptz, null::text;
  end if;
end;
$fn$;

-- Borrarla, para cuando se rote o se deje de usar el proveedor.
create or replace function borrar_clave_openai()
returns void
language plpgsql
security definer
set search_path = public, vault
as $fn$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  delete from vault.secrets where name = 'openai_api_key';
end;
$fn$;

-- La lectura de verdad. Solo para el worker: nadie con sesión de navegador
-- puede ejecutarla, ni siquiera un administrador.
create or replace function leer_clave_openai()
returns text
language sql
security definer
set search_path = public, vault
as $fn$
  select d.decrypted_secret
    from vault.decrypted_secrets d
   where d.name = 'openai_api_key'
$fn$;

revoke execute on function guardar_clave_openai(text) from public, anon;
revoke execute on function estado_clave_openai()      from public, anon;
revoke execute on function borrar_clave_openai()      from public, anon;
revoke execute on function leer_clave_openai()        from public, anon, authenticated;

grant execute on function guardar_clave_openai(text) to authenticated;
grant execute on function estado_clave_openai()      to authenticated;
grant execute on function borrar_clave_openai()      to authenticated;
grant execute on function leer_clave_openai()        to service_role;

-- ------------------------------------------------------------
-- 2 · Las imágenes no se pagan por token
--
-- `consumo_modelo` cuenta tokens porque hasta ahora todo lo que se gastaba
-- era texto. Una imagen se paga por unidad y por tamaño, así que contarla en
-- tokens daría cero y el panel diría que las imágenes son gratis.
-- ------------------------------------------------------------

alter table consumo_modelo add column if not exists imagenes int not null default 0;
alter table tarifas_modelo add column if not exists por_imagen numeric(12,4) not null default 0;

insert into tarifas_modelo (proveedor, modelo, desde, entrada_millon, salida_millon, por_imagen, nota)
values ('openai', 'gpt-image-1', '2026-09-05', 0, 0, 0,
        'Imágenes. La tarifa por imagen hay que ponerla: depende del tamaño y la calidad')
on conflict (modelo, desde) do nothing;

-- Registrar una imagen generada. Igual que el consumo de texto, pero
-- contando unidades.
create or replace function registrar_imagen_generada(
  p_funcion text,
  p_modelo  text,
  p_tenant  uuid default null,
  p_campana uuid default null
)
returns void
language sql
security definer
set search_path = public
as $fn$
  insert into consumo_modelo (tenant_id, campaign_id, funcion, modelo,
                              llamadas, imagenes, tokens_entrada, tokens_salida)
  values (p_tenant, p_campana, left(p_funcion, 60), left(p_modelo, 60), 1, 1, 0, 0)
  on conflict (dia, coalesce(tenant_id::text, 'sin-tenant'),
               coalesce(campaign_id::text, 'sin-campana'), funcion, modelo)
  do update set
    llamadas = consumo_modelo.llamadas + 1,
    imagenes = consumo_modelo.imagenes + 1,
    actualizado_en = now();
$fn$;

revoke execute on function registrar_imagen_generada(text,text,uuid,uuid)
  from public, anon, authenticated;
grant  execute on function registrar_imagen_generada(text,text,uuid,uuid)
  to service_role;

-- El consumo valorado suma ahora las dos cosas: tokens y unidades.
--
-- drop primero: `create or replace view` no deja insertar una columna en
-- medio de la lista, y `imagenes` va antes de `coste`. Las funciones del
-- panel que la usan no son dependencias que Postgres siga, así que se
-- recrean solas al volver a consultarlas.
drop view if exists v_consumo_valorado;

create view v_consumo_valorado
with (security_invoker = on) as
  select cm.id, cm.dia, cm.tenant_id, cm.campaign_id, cm.funcion, cm.modelo,
         cm.llamadas, cm.tokens_entrada, cm.tokens_salida, cm.imagenes,
         round(cm.tokens_entrada / 1000000.0 * coalesce(t.entrada_millon, 0)
             + cm.tokens_salida  / 1000000.0 * coalesce(t.salida_millon,  0)
             + cm.imagenes       * coalesce(t.por_imagen, 0), 6) as coste,
         (t.modelo is not null) as con_tarifa
    from consumo_modelo cm
    left join lateral (
      select tm.* from tarifas_modelo tm
       where tm.modelo = cm.modelo and tm.desde <= cm.dia
       order by tm.desde desc limit 1
    ) t on true;
