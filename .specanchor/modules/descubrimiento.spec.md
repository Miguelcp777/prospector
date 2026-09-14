---
type: module-spec
module: descubrimiento
status: ready
source_paths:
  - supabase/functions/descubrir/*
  - supabase/functions/enriquecer/*
last_reviewed: 2026-09-14
---

# Módulo: descubrimiento

## Responsabilidad

Encontrar negocios reales con Google Places y después buscarles un buzón de
contacto. Es el único paso del producto que se paga por unidad, y por eso todo
aquí gira alrededor de no gastar de más.

## Propiedad del código

`supabase/functions/descubrir/index.ts` y
`supabase/functions/enriquecer/index.ts`. La cola y los techos viven en
`datos`; aquí solo está el consumidor.

## Interfaces públicas

Ninguna para el navegador. Las dos funciones se despiertan por cabecera
`x-worker-secreto`, desde `pg_cron` cada minuto y desde el trigger
`arrancar_al_encolar` (052).

## Invariantes de dominio

- **INV-DES-001** · La unidad de trabajo es **(segmento × query × página)**,
  no la campaña. Una Edge Function no aguanta una campaña entera: 150 s de
  wall clock en plan free.
- **INV-DES-002** · Cada invocación reclama unas pocas tareas con `SKIP
  LOCKED` y se va. Solapar invocaciones es inofensivo: se reparten tareas
  distintas en vez de duplicar consultas de pago.
- **INV-DES-003** · La paginación se encadena sola: si Places devuelve
  `nextPageToken`, la tarea encola su continuación en vez de seguir el bucle.
- **INV-DES-004** · Una consulta se cuenta **por página pedida**, no por lead
  obtenido. Places cobra aunque la búsqueda vuelva vacía.
- **INV-DES-005** · Una tarea que agota su plazo vuelve a la cola, no se queda
  en `en_curso`. Que esto fuera falso durante meses es la lección de la 031.
- **INV-DES-006** · La tarea en vuelo al cancelar **termina**: su consulta ya
  está pagada, y tirarla sería perder leads pagados (040).

## Dependencias

`datos` (`reclamar_tareas`, `sumar_consulta`, `cerrar_job_si_completo`,
`huecos_de_leads`), `edge-nucleo` (HTTP y secreto).

## Integraciones externas

Google Places API (New). Falla por rachas —límite de tasa, cuota, un 503
suelto—; tres intentos antes de dar una tarea por perdida.

## Rendimiento y operación

- `TAREAS_POR_TANDA = 5`. **INFERRED** · es una estimación, no una medición
  (`docs/decisiones/0002`, «Pendiente»).
- Desde la 052 el trabajo arranca al encolarlo. Antes esperaba hasta 60
  segundos al cron, y con el techo del modo demo el trabajo real duraba siete:
  la barra de progreso iba de 0 a 100 sin pasar por en medio. VERIFIED · job
  `3296f746`, encolado 11:07:21, terminado 11:08:07, 39 s sin actividad.

## Pruebas y verificación

**No hay pruebas automáticas.** Se verifica mirando `jobs` y `job_tareas`
después de una campaña real.

## Incertidumbres y deuda conocidas

- **OBSERVED** · Los fallos de estas funciones se escriben en
  `job_tareas.detalle`, no en `incidencias`. Son los que nadie ve, porque
  ocurren sin navegador delante.
- **UNKNOWN** · No se ha medido cuánto tarda una campaña completa.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| El worker se despierta al encolar | VERIFIED | `select despertar_worker('descubrir')` | 200 en `net._http_response` |
| El troceado y el techo funcionan | VERIFIED | job `3296f746` | 5 hechas, 19 omitidas por modo demo |
| Una campaña real dio 920 leads en 59 consultas | OBSERVED | `supabase/README.md`, modo demo | — |
