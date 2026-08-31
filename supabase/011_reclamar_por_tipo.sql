-- ============================================================
-- Prospector · 011 · reclamar tareas por tipo de job
-- Ejecutar después de 010.
--
-- `reclamar_tareas` servía cualquier tarea pendiente sin mirar de qué job
-- venía. Con un solo worker daba igual; con dos, `descubrir` se llevaría
-- tareas de enriquecimiento e intentaría buscarlas en Places.
--
-- De paso: los techos de gasto solo tienen sentido para 'descubrir'.
-- Enriquecer no paga API, y aplicarle el techo mensual dejaría al cliente
-- sin poder buscar emails por haber gastado su cupo de Places.
-- ============================================================

-- La firma cambia, así que hay que tirar la anterior: con las dos vivas, una
-- llamada de un solo argumento sería ambigua.
drop function if exists reclamar_tareas(int);

create or replace function reclamar_tareas(
  p_limite int  default 5,
  p_tipo   text default 'descubrir'
)
returns setof job_tareas
language sql
security definer
set search_path = public
as $fn$
  update job_tareas t
     set estado = 'en_curso',
         intentos = t.intentos + 1,
         reclamada_en = now(),
         actualizado_en = now()
   where t.id in (
     select t2.id
       from job_tareas t2
       join jobs j on j.id = t2.job_id
      where t2.estado = 'pendiente'
        and j.tipo = p_tipo
        and j.estado in ('pendiente','en_curso')
        -- Los dos techos, solo donde hay factura que acotar.
        and (j.tipo <> 'descubrir' or (
              j.consultas < (select c.max_consultas from campaigns c where c.id = j.campaign_id)
              and coalesce((select cp.consultas from consumo_places cp
                             where cp.tenant_id = j.tenant_id
                               and cp.mes = date_trunc('month', current_date)::date), 0)
                  < (select tn.max_consultas_mes from tenants tn where tn.id = j.tenant_id)
        ))
        -- Enfriado del reintento: sin esto, reintentar es repetir.
        and (t2.reclamada_en is null or t2.reclamada_en < now() - interval '90 seconds')
      order by t2.creado_en
      limit p_limite
      for update of t2 skip locked
   )
  returning t.*;
$fn$;

revoke execute on function reclamar_tareas(int, text) from public, anon, authenticated;
grant  execute on function reclamar_tareas(int, text) to service_role;
