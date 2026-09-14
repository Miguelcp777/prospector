---
type: global-spec
status: ready
last_reviewed: 2026-09-14
---

# Arquitectura

## Propósito

Fijar las decisiones estructurales que ningún cambio puede romper sin una
decisión explícita. No repite `docs/arquitectura.md`: aquella describe, esta
obliga.

## Relación con la documentación que ya existía

`docs/arquitectura.md` y `docs/decisiones/` son **anteriores a esta adopción y
siguen siendo la fuente**. Los ADR viven en `docs/decisiones/` y ahí se
quedan: la skill manda respetar las rutas establecidas en vez de duplicarlas.
Un ADR nuevo se numera continuando esa serie (`0006-…`).

## Comportamiento actual, con estado de evidencia

| Afirmación | Estado | Fuente |
|---|---|---|
| No hay servidor propio: todo corre en Supabase y Netlify | OBSERVED | `docs/decisiones/0001`, `0002`; no existe `backend/` |
| El aislamiento entre clientes vive en la base (RLS), no en la aplicación | OBSERVED | `supabase/schema.sql`, políticas `*_del_tenant` |
| La pertenencia se resuelve por tabla (`auth_tenant_id()` lee `profiles`), no por claim JWT | OBSERVED | `schema.sql`; contrastado en `docs/decisiones/0003` |
| El trabajo pesado se trocea en `job_tareas` y lo consume una Edge Function por tandas | OBSERVED | `supabase/002_descubrimiento_y_demo.sql` |
| `reclamar_tareas` usa `SKIP LOCKED`, así que solapar invocaciones es inofensivo | OBSERVED | `002`, función `reclamar_tareas` |
| El worker arranca al encolar (trigger) **y** por cron cada minuto | VERIFIED | `052`; probado con un insert en transacción revertida |
| El HTML del correo lo compone código propio, nunca un modelo | OBSERVED | `frontend/src/studio/lib/email-renderer.ts` |

## Comportamiento pretendido

Lo de arriba es también lo pretendido. Los cambios que lo alteren necesitan ADR
en `docs/decisiones/`.

## Restricciones

- **RESTR-ARQ-001** · La clave `service_role` no sale del servidor. Si aparece
  en `frontend/` o en `demo/`, el cambio se rechaza.
- **RESTR-ARQ-002** · Toda tabla nueva lleva `tenant_id` y su política RLS en
  la misma migración.
- **RESTR-ARQ-003** · Toda función `SECURITY DEFINER` lleva su
  `revoke execute` de `anon` y `authenticated` en la misma migración, y su
  `grant` explícito a quien la necesite.
- **RESTR-ARQ-004** · Las migraciones salen de archivos numerados de
  `supabase/`, nunca de SQL escrito sobre la marcha. El repositorio es la
  fuente de verdad del esquema.
- **RESTR-ARQ-005** · No se escribe en datos de clientes (`leads`,
  `campaigns`, `messages`) desde herramientas de desarrollo. Esquema sí.

## Invariantes

- **INV-ARQ-001** · Un usuario solo ve filas de su propio tenant.
- **INV-ARQ-002** · Un trabajo encolado termina en `hecho`, `error` o
  `cancelado`; no se queda vivo indefinidamente. Lo sostienen
  `cerrar_job_si_completo` y `reponer_tareas_colgadas` (031).
- **INV-ARQ-003** · Todo correo vestido lleva enlace de baja. Lo impone el
  trigger `no_enviar_a_suprimidos` sobre `messages`.

## Convenios

Un módulo nuevo se declara en `.specanchor/module-map.json` **con su spec**, y
el guard falla si un archivo material no pertenece a ninguno.

## Fuera de alcance

Elegir ESP, pools de IP y warmup: pendientes en
`docs/decisiones/0004-quien-es-el-remitente.md`.

## Incógnitas

- **UNKNOWN** · No se ha medido cuánto tarda de verdad una campaña completa;
  `TAREAS_POR_TANDA = 5` es una estimación, no una medición (0002, «Pendiente»).
- **UNKNOWN** · Ninguna campaña ha dado de alta un dominio real con
  `dominio-correo`; el camino verificado es el manual.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.
