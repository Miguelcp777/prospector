-- ============================================================
-- Prospector · 018 · tope de mensajes por tanda
-- Ejecutar después de 017.
--
-- Cada mensaje es una llamada al modelo. Una campaña de 700 leads son 700
-- llamadas, y mientras se prueba eso es gasto sin nada a cambio.
--
-- Vive en `ajustes` y no en el código por lo mismo que los techos de
-- Places: liberarlo en producción es un UPDATE, no un despliegue. Y vive en
-- la base y no en el frontend porque un límite de interfaz lo esquiva
-- cualquiera llamando a la RPC con la anon key.
-- ============================================================

alter table ajustes add column if not exists max_mensajes_por_campana int not null default 10
  check (max_mensajes_por_campana between 0 and 100000);

comment on column ajustes.max_mensajes_por_campana is
  'Cuántos mensajes se redactan como mucho por encolado. 10 mientras se prueba; subirlo es un update.';

create or replace function encolar_redaccion(p_campaign uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant     uuid;
  v_job        uuid;
  v_tareas     int;
  v_tope       int;
  v_candidatos int;
begin
  select tenant_id into v_tenant from campaigns where id = p_campaign;

  if v_tenant is null then
    raise exception 'Campaña no encontrada';
  end if;

  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jobs
    where campaign_id = p_campaign
      and tipo = 'redactar'
      and estado in ('pendiente','en_curso')
  ) then
    raise exception 'Ya hay una redacción en curso para esta campaña';
  end if;

  select max_mensajes_por_campana into v_tope from ajustes;

  -- Cuántos podrían escribirse si no hubiera tope: para poder decir cuántos
  -- se quedan fuera en vez de que el usuario lo descubra contando.
  select count(*) into v_candidatos
    from leads l
   where l.campaign_id = p_campaign
     and l.email is not null
     and not esta_suprimido(l.email, l.tenant_id)
     and not exists (select 1 from messages m where m.lead_id = l.id);

  if v_tope = 0 then
    raise exception 'La redacción de mensajes está desactivada (tope a 0).';
  end if;

  insert into jobs (tenant_id, campaign_id, tipo, estado, detalle)
  values (v_tenant, p_campaign, 'redactar', 'pendiente', 'En cola')
  returning id into v_job;

  -- Por score descendente: si solo caben 10, que sean los 10 mejores. Sin
  -- este orden el tope repartiría al azar y desperdiciaría las llamadas.
  insert into job_tareas (job_id, tenant_id, campaign_id, segment_id, lead_id, query)
  select v_job, v_tenant, p_campaign, l.segment_id, l.id, l.nombre
    from leads l
   where l.campaign_id = p_campaign
     and l.email is not null
     and not esta_suprimido(l.email, l.tenant_id)
     and not exists (select 1 from messages m where m.lead_id = l.id)
   order by l.score desc nulls last, l.resenas desc nulls last
   limit v_tope;

  get diagnostics v_tareas = row_count;

  if v_tareas = 0 then
    update jobs set estado = 'hecho',
                    progreso = 100,
                    detalle = 'No hay leads con email pendientes de redactar',
                    actualizado_en = now()
    where id = v_job;
    return v_job;
  end if;

  if v_candidatos > v_tareas then
    update jobs
       set detalle = format('En cola · %s de %s leads (tope de %s por tanda)',
                            v_tareas, v_candidatos, v_tope)
     where id = v_job;
  end if;

  return v_job;
end;
$fn$;

revoke execute on function encolar_redaccion(uuid) from public, anon;
grant  execute on function encolar_redaccion(uuid) to authenticated;

-- ------------------------------------------------------------
-- Para liberarlo en producción:
--   update ajustes set max_mensajes_por_campana = 100000;
-- ------------------------------------------------------------
