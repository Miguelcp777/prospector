-- ============================================================
-- Prospector · 040 · cancelar una búsqueda en curso
-- Ejecutar DESPUÉS de 039_modo_demo.sql.
--
-- Hasta ahora, una vez encolado el descubrimiento no había forma de
-- pararlo: ni botón, ni RPC. Se seguía pagando Places hasta el techo de la
-- campaña aunque el usuario ya hubiera visto que la búsqueda no era la que
-- quería.
--
-- CANCELAR NO ES FALLAR, Y POR ESO HAY ESTADO NUEVO
--
-- Cerrar el job como 'hecho' diría que el descubrimiento terminó, y el
-- panel contaría una campaña completada que no lo está. Cerrarlo como
-- 'error' diría que algo se rompió, y el panel de salud lo pintaría en rojo
-- y marcaría al cliente como en riesgo (ver 030). Ninguna de las dos es
-- verdad: lo que pasó es que alguien dijo basta.
--
-- Los leads ya capturados se quedan. Están en `leads` desde el momento en
-- que se guardaron, así que no hay nada que rescatar: basta con cerrar el
-- job y devolver la campaña a 'lista' para que la pantalla los enseñe.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El estado nuevo
--
-- Las tareas no lo necesitan: la 008 ya creó 'omitida' para exactamente
-- esto —«no se hizo, pero tampoco falló»— cuando el techo de consultas
-- dejaba trabajo sin ejecutar. Una tarea cancelada es el mismo caso.
-- ------------------------------------------------------------
alter table jobs drop constraint if exists jobs_estado_check;
alter table jobs add  constraint jobs_estado_check
  check (estado in ('pendiente','en_curso','hecho','error','cancelado'));

-- ------------------------------------------------------------
-- 2 · Cancelar
--
-- Vale para los tres tipos de job. Hoy solo hay botón en la búsqueda, que
-- es la que cuesta dinero por consulta, pero el mecanismo no tiene nada
-- específico del descubrimiento y ramificarlo por tipo sería inventar una
-- diferencia que no existe.
--
-- Lo que NO hace: tocar `ultima_busqueda_en`. Sellarla metería la campaña
-- en la pausa de 30 días de `encolar_descubrimiento`, y quien acaba de
-- cancelar suele querer volver a lanzar la búsqueda ahora mismo, corregida.
-- ------------------------------------------------------------
create or replace function cancelar_job(
  p_campaign uuid,
  p_tipo     text default 'descubrir'
)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant   uuid;
  v_job      uuid;
  v_paradas  int;
  v_hechas   int;
  v_total    int;
  v_leads    int;
begin
  if p_tipo not in ('descubrir','enriquecer','redactar') then
    raise exception 'Tipo de trabajo desconocido: %', p_tipo;
  end if;

  select tenant_id into v_tenant from campaigns where id = p_campaign;

  if v_tenant is null then
    raise exception 'Campaña no encontrada';
  end if;

  -- El filtro por tenant que la RLS ya no está haciendo por nosotros.
  if v_tenant is distinct from auth_tenant_id() then
    raise exception 'No autorizado';
  end if;

  select id into v_job
    from jobs
   where campaign_id = p_campaign
     and tipo = p_tipo
     and estado in ('pendiente','en_curso')
   order by creado_en desc
   limit 1;

  if v_job is null then
    raise exception 'No hay ninguna búsqueda en curso que cancelar';
  end if;

  -- Solo las pendientes. Una 'en_curso' la está resolviendo el worker en
  -- este instante: su consulta a Places ya está pagada, así que dejarla
  -- terminar guarda leads que si no se tirarían. Al acabar llamará a
  -- `cerrar_job_si_completo`, que respeta el job cancelado (abajo).
  update job_tareas
     set estado = 'omitida',
         detalle = 'Cancelada por el usuario',
         actualizado_en = now()
   where job_id = v_job and estado = 'pendiente';

  get diagnostics v_paradas = row_count;

  select count(*) filter (where estado = 'hecho'), count(*)
    into v_hechas, v_total
    from job_tareas where job_id = v_job;

  update jobs
     set estado   = 'cancelado',
         progreso = case when v_total = 0 then 0 else (v_hechas * 100) / v_total end,
         detalle  = format('Cancelado: %s de %s hechas, %s sin ejecutar',
                           v_hechas, v_total, v_paradas),
         actualizado_en = now()
   where id = v_job;

  -- Los leads que hubiera hasta aquí valen: se puntúan como los de una
  -- búsqueda completa, o quedarían con score nulo y al final de la lista.
  perform recalcular_scores(p_campaign);

  if p_tipo = 'descubrir' then
    select count(*) into v_leads from leads where campaign_id = p_campaign;
    -- Con leads, la campaña está lista para el paso siguiente aunque la
    -- búsqueda no acabara. Sin ninguno, no hay nada que enseñar: vuelve a
    -- donde estaba antes de buscar.
    update campaigns
       set estado = case when v_leads > 0 then 'lista' else 'inferido' end
     where id = p_campaign;
  end if;

  return v_paradas;
end;
$fn$;

-- ------------------------------------------------------------
-- 3 · Que nada resucite un job cancelado
--
-- `cerrar_job_si_completo` termina poniendo el job en 'hecho' o 'error'. Si
-- una tarea que estaba en vuelo cuando se canceló acaba después —y acaba,
-- porque la dejamos terminar a propósito—, llamaría aquí y borraría la
-- cancelación. La campaña volvería a decir que la búsqueda terminó bien.
--
-- Por lo demás es la misma función de la 039, con el techo del modo demo.
-- ------------------------------------------------------------
create or replace function cerrar_job_si_completo(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pendientes int;
  v_hechas     int;
  v_errores    int;
  v_omitidas   int;
  v_total      int;
  v_campaign   uuid;
  v_tipo       text;
  v_agotado    boolean;
  v_por_demo   boolean;
  v_estado     text;
begin
  select estado into v_estado from jobs where id = p_job;

  -- Cancelado es un estado final. Ya cerró quien lo canceló.
  if v_estado = 'cancelado' then
    return true;
  end if;

  select count(*) filter (where estado in ('pendiente','en_curso')),
         count(*) filter (where estado = 'hecho'),
         count(*) filter (where estado = 'error'),
         count(*) filter (where estado = 'omitida'),
         count(*)
    into v_pendientes, v_hechas, v_errores, v_omitidas, v_total
    from job_tareas where job_id = p_job;

  update jobs
     set progreso = case when v_total = 0 then 0
                         else ((v_hechas + v_omitidas) * 100) / v_total end,
         estado   = case when estado = 'pendiente' then 'en_curso' else estado end,
         actualizado_en = now()
   where id = p_job
   returning campaign_id, tipo into v_campaign, v_tipo;

  v_por_demo := v_tipo = 'descubrir'
                and coalesce(huecos_de_leads(v_campaign), 1) = 0;

  if v_pendientes > 0 then
    if v_tipo <> 'descubrir' then
      return false;
    end if;

    select j.consultas >= c.max_consultas
        or coalesce((select cp.consultas from consumo_places cp
                      where cp.tenant_id = j.tenant_id
                        and cp.mes = date_trunc('month', current_date)::date), 0)
           >= (select tn.max_consultas_mes from tenants tn where tn.id = j.tenant_id)
      into v_agotado
      from jobs j join campaigns c on c.id = j.campaign_id
     where j.id = p_job;

    if not v_agotado and not v_por_demo then
      return false;
    end if;

    update job_tareas
       set estado = 'omitida',
           detalle = case when v_por_demo and not v_agotado
                          then 'No ejecutada: modo demo, techo de leads alcanzado'
                          else 'No ejecutada: techo de consultas alcanzado' end,
           actualizado_en = now()
     where job_id = p_job and estado = 'pendiente';

    select count(*) filter (where estado in ('pendiente','en_curso')),
           count(*) filter (where estado = 'omitida')
      into v_pendientes, v_omitidas
      from job_tareas where job_id = p_job;

    if v_pendientes > 0 then
      return false;
    end if;
  end if;

  perform recalcular_scores(v_campaign);

  update jobs
     set estado   = case when v_errores > 0 and v_hechas = 0 then 'error' else 'hecho' end,
         progreso = 100,
         detalle  = case
                      when v_omitidas > 0 and v_por_demo then
                        format('Parado por el modo demo: %s de %s búsquedas hechas, %s sin ejecutar',
                               v_hechas, v_total, v_omitidas)
                      when v_omitidas > 0 then
                        format('Parado al llegar al techo de consultas: %s de %s hechas, %s sin ejecutar',
                               v_hechas, v_total, v_omitidas)
                      when v_errores > 0 then
                        format('Completado con %s de %s fallidas', v_errores, v_total)
                      when v_tipo = 'enriquecer' then 'Enriquecimiento completado'
                      else 'Descubrimiento completado'
                    end,
         actualizado_en = now()
   where id = p_job;

  if v_tipo = 'descubrir' then
    update campaigns
       set estado = case when v_hechas = 0 and v_errores > 0 then 'error' else 'lista' end,
           ultima_busqueda_en = case when v_hechas > 0 then now() else ultima_busqueda_en end
     where id = v_campaign;
  end if;

  return true;
end;
$fn$;

-- ------------------------------------------------------------
-- 4 · Permisos
--
-- `cancelar_job` la llama el usuario desde su campaña y comprueba el tenant
-- por su cuenta, igual que `encolar_descubrimiento`. Eso ya frena a `anon`,
-- pero no hay motivo para dejársela expuesta.
-- ------------------------------------------------------------
revoke execute on function cancelar_job(uuid, text)     from public, anon;
revoke execute on function cerrar_job_si_completo(uuid) from public, anon, authenticated;

grant  execute on function cancelar_job(uuid, text)     to authenticated;
grant  execute on function cerrar_job_si_completo(uuid) to service_role;
