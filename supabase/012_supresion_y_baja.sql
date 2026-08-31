-- ============================================================
-- Prospector · 012 · lista de supresión y baja
-- Ejecutar después de 011.
--
-- CLAUDE.md: «No escribas el módulo de envío de email (Fase 4) hasta que
-- exista la lista de supresión y el opt-out funcionando. El orden importa.»
-- Esto es esa pieza, y va antes que cualquier ESP a propósito.
--
-- El principio de diseño: la supresión NO puede depender de que el código
-- de envío se acuerde de consultarla. Un `if` que alguien olvida un martes
-- es una reclamación. Aquí lo impide un trigger: la base se niega a
-- registrar un envío a una dirección suprimida.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Cada mensaje lleva su propio enlace de baja
--
-- Token por mensaje, no por lead: así una queja se puede rastrear hasta la
-- campaña y el mensaje concretos que la provocaron, que es lo que pide
-- compliance.md sobre registro de origen.
-- ------------------------------------------------------------
alter table messages add column if not exists token_baja text
  not null default encode(gen_random_bytes(24), 'hex');

create unique index if not exists messages_token_baja on messages(token_baja);

-- La dirección realmente usada, congelada en el momento del envío. El email
-- del lead puede cambiar después; el de la reclamación es este.
alter table messages add column if not exists email_destino text;

comment on column messages.token_baja is
  'Secreto del enlace de baja. 24 bytes: no se adivina, y sin él nadie puede dar de baja a un tercero.';

-- ------------------------------------------------------------
-- 2 · ¿Está suprimida esta dirección?
--
-- Global (tenant_id null) o del propio tenant. Una baja global la respetan
-- todas las campañas de todos los clientes: alguien que pidió no volver a
-- saber de nosotros no debe recibir de otro tenant nuestro.
-- ------------------------------------------------------------
create or replace function esta_suprimido(p_email text, p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from suppressions s
     where lower(s.email) = lower(trim(p_email))
       and (s.tenant_id is null or s.tenant_id = p_tenant)
  );
$fn$;

-- ------------------------------------------------------------
-- 3 · La base se niega a registrar un envío a una dirección suprimida
--
-- Esto es lo que hace que la lista no sea decorativa. Da igual qué código
-- escriba el envío mañana, o quién lo escriba: si la dirección está en la
-- lista, el UPDATE falla.
-- ------------------------------------------------------------
create or replace function frenar_envio_a_suprimido()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text;
begin
  if new.estado <> 'enviado' then
    return new;
  end if;

  -- El destino congelado si ya está; si no, el del lead en este momento.
  v_email := coalesce(new.email_destino, (select l.email from leads l where l.id = new.lead_id));

  if v_email is null then
    raise exception 'No se puede marcar como enviado un mensaje sin dirección de destino';
  end if;

  if esta_suprimido(v_email, new.tenant_id) then
    raise exception 'La dirección % está en la lista de supresión', v_email;
  end if;

  new.email_destino := v_email;
  return new;
end;
$fn$;

drop trigger if exists no_enviar_a_suprimidos on messages;
create trigger no_enviar_a_suprimidos
  before insert or update on messages
  for each row execute function frenar_envio_a_suprimido();

-- ------------------------------------------------------------
-- 4 · Dar de baja desde el enlace del correo
--
-- La llama la Edge Function `baja` con service_role. El destinatario no es
-- usuario de nada, así que lo único que le identifica es el token — y por
-- eso el token es lo único que hace falta y no se acepta un email suelto:
-- si se aceptara, cualquiera podría dar de baja a cualquiera.
--
-- Idempotente: pulsar dos veces el enlace no es un error, es una persona
-- que quiere asegurarse.
-- ------------------------------------------------------------
create or replace function registrar_baja(p_token text)
returns table (ok boolean, email text, ya_estaba boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant  uuid;
  v_email   text;
  v_existia boolean;
begin
  select m.tenant_id, coalesce(m.email_destino, l.email)
    into v_tenant, v_email
    from messages m
    left join leads l on l.id = m.lead_id
   where m.token_baja = p_token;

  if v_email is null then
    return query select false, null::text, false;
    return;
  end if;

  v_existia := esta_suprimido(v_email, v_tenant);

  insert into suppressions (tenant_id, email, motivo)
  values (v_tenant, lower(trim(v_email)), 'baja')
  on conflict do nothing;

  return query select true, v_email, v_existia;
end;
$fn$;

-- ------------------------------------------------------------
-- 5 · Qué leads se pueden contactar
--
-- La pantalla de leads necesita distinguir "sin email" de "con email pero
-- dado de baja". Enseñar un correo que no se puede usar es peor que no
-- enseñarlo: invita a copiarlo y escribir a mano.
-- ------------------------------------------------------------
create or replace view v_leads_contactables
with (security_invoker = on) as
select l.id,
       l.campaign_id,
       l.tenant_id,
       l.email,
       esta_suprimido(l.email, l.tenant_id) as suprimido
  from leads l
 where l.email is not null;

-- ------------------------------------------------------------
-- 6 · Permisos
--
-- Ojo con lo que NO hay: `suppressions` no tiene política de DELETE, y es
-- deliberado. Quitar a alguien de la lista de bajas es exactamente lo que
-- no debe poder hacerse desde la aplicación.
-- ------------------------------------------------------------
revoke execute on function registrar_baja(text)            from public, anon, authenticated;
revoke execute on function frenar_envio_a_suprimido()      from public, anon, authenticated;

grant  execute on function registrar_baja(text)            to service_role;
-- esta_suprimido la usan la vista y las políticas: la necesita el usuario.
grant  execute on function esta_suprimido(text, uuid)      to authenticated, service_role;
