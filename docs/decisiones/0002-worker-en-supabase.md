# 0002 · El worker corre en Supabase, troceado

**Fecha:** agosto 2026 · **Estado:** aceptada
**Supera:** la parte de `0001-supabase.md` que daba por necesario un worker externo

## Contexto

La decisión 0001 cerró en falso: eligió Supabase para todo y a la vez dejó
fuera el descubrimiento, con este argumento —

> El descubrimiento no cabe en una Edge Function: cientos de consultas a
> Places y varios minutos frente a un timeout corto. Por eso existe la tabla
> `jobs` y un worker externo.

El razonamiento es correcto para un worker que recorre la campaña entera de
una sentada. Lo que no es correcto es dar por supuesto que ese es el único
worker posible.

Además tenía un coste que no se contabilizó: un contenedor en Proxmox
significa mantener, vigilar y desplegar una segunda pieza de infraestructura
para llegar a un MVP que todavía no tiene un cliente.

## Límites reales

Comprobados en la documentación de Supabase (agosto 2026), no de memoria:

| Límite | Valor |
|---|---|
| CPU por petición | 2 s — **no** cuenta la espera de red |
| Wall clock | 150 s plan free · 400 s de pago |
| Timeout de respuesta | 150 s |
| Memoria | 256 MB |

El dato que cambia la conclusión es el primero. El descubrimiento es casi
todo espera de red: se pide a Places, se espera, se guarda. El límite de CPU
de 2 s no es el que aprieta. El que aprieta es el wall clock, y ese se
esquiva no haciendo el trabajo entero de una vez.

## Decisión

El descubrimiento corre en Supabase, como Edge Function, troceado.

En vez de un proceso largo que recorre la campaña, la unidad de trabajo pasa
a ser **(segmento × query × página)** y vive en la tabla `job_tareas`. Cada
invocación reclama unas pocas tareas, las resuelve y se va. `pg_cron` la
despierta cada minuto.

La paginación se encadena sola: si Places devuelve `nextPageToken`, la tarea
crea su continuación en vez de seguir el bucle.

```
pg_cron (cada minuto)
   ↓  net.http_post con secreto compartido
Edge Function `descubrir`
   ↓  reclamar_tareas(5)   ← SKIP LOCKED
   por cada tarea: Places → upsert leads → ¿hay siguiente página? → encolarla
   ↓
cerrar_job_si_completo → recalcular_scores → campaña 'lista'
```

## Consecuencias

**A favor**

- Una sola pieza de infraestructura. No hay contenedor que mantener, ni
  despliegue aparte, ni una segunda cosa que se cae de madrugada.
- El estado del recorrido está en la base, no en la memoria de un proceso.
  Si una invocación muere a mitad, la tarea vuelve a la cola y no se pierde
  nada. Un worker largo que se cae a los cuatro minutos pierde los cuatro.

  > **Esto fue falso durante meses.** `reclamar_tareas` marcaba 'en_curso' y
  > solo volvía a coger tareas 'pendiente': nada devolvía a la cola una
  > tarea abandonada, así que quedaba fuera del alcance de todos para
  > siempre y su job no podía cerrarse nunca.
  >
  > Se vio el 6 de septiembre de 2026, al construir el panel de salud: 38
  > tareas de enriquecimiento reclamadas entre el 31 de agosto y el 1 de
  > septiembre seguían ahí cinco días después, con el cron corriendo cada
  > minuto y sin un solo error que lo delatara.
  >
  > Lo arregla `031_reponer_tareas_colgadas.sql`: un cron cada cinco
  > minutos las devuelve a la cola, y las que ya han gastado sus intentos se
  > marcan en error en vez de reponerse en bucle. La ventaja que este
  > documento daba por hecha ahora existe de verdad.
- `SKIP LOCKED` hace que solapar invocaciones sea inofensivo, así que el
  cron puede ser agresivo sin duplicar consultas de pago.
- El progreso real sale de contar tareas hechas, no de una estimación.

**En contra**

- Más fontanería de estado: una tabla y tres funciones SQL que antes eran un
  bucle `for` en Python.
- El rendimiento depende de la frecuencia del cron. Una campaña grande tarda
  más en minutos de reloj que un worker dedicado. Para el MVP no importa;
  si algún día importa, se sube el tamaño de tanda o se acorta el cron.
- Seguimos atados al proveedor, ahora también para la ejecución y no solo
  para los datos. El SQL es portable; `pg_cron` y las Edge Functions no.

## Restricciones que se derivan

- La función `descubrir` va sin JWT: la despierta el cron, no una persona.
  Lo único que la separa de un botón público de "gasta mi saldo de Places"
  es la cabecera `x-worker-secreto`. Si ese secreto se filtra, se rota.
- Las funciones `SECURITY DEFINER` que se saltan la RLS llevan `revoke
  execute` de `anon` y `authenticated`. Postgres las abre a `public` por
  defecto, y una de ellas reclama tareas de cualquier tenant.
- Toda campaña tiene techo de gasto (`campaigns.max_consultas`).
  `reclamar_tareas` deja de servir tareas al alcanzarlo. Sin techo, una
  campaña mal configurada se lleva el presupuesto del mes.

## Qué pasa con `backend/`

Se elimina. Era el andamio de la API FastAPI que ya descartó la 0001, y su
último motivo para existir era alojar este worker. Si la Fase 2 necesita
Python para el enriquecimiento, se decidirá entonces y con un motivo propio.

## Pendiente

- Medir cuánto tarda de verdad una campaña completa. El tamaño de tanda
  (`TAREAS_POR_TANDA = 5`) es una estimación, no una medición.
- Definir el techo por defecto de `max_consultas` con datos de coste reales.
