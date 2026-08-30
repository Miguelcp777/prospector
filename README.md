# Prospector IA

Aplicación web multi-tenant de prospección inteligente de clientes.

Dado un negocio (p. ej. una clínica de fisioterapia) y su zona de actuación,
la app infiere qué **segmentos de cliente potencial** tiene (clubes deportivos,
gimnasios, residencias, empresas para wellness corporativo…), descubre entidades
reales de esos segmentos, las enriquece, las puntúa y prepara la oferta.

> Nombre provisional. Cambiar antes de enseñarlo a un cliente.

## Diferencial

El valor no está en listar empresas — eso ya lo hacen Apollo, Lusha o Instantly.
Está en la **inferencia de segmentos-objetivo** y en el enlace directo con los
entregables que ya vendemos (landing pages, agentes, web apps).

## Estructura

```
supabase/            Todo el backend
  schema.sql         Tablas, políticas RLS, vista de resumen, scoring
  002_*.sql          Descubrimiento troceado y cuota de la demo
  003_cron.sql       pg_cron: el despertador del worker
  functions/
    infer-segments/  Inferencia autenticada, persiste en la campaña
    demo-inferir/    Inferencia pública con cuota, para la demo
    descubrir/       El worker: Places, dedup, paginación encadenada
    _shared/         Prompt, taxonomías, CORS
frontend/            React. Onboarding, campañas, tabla de leads, dashboard
demo/                Prototipo navegable de un archivo. Se publica en Netlify
data/taxonomias/     Taxonomías curadas por vertical (ancla anti-alucinación)
docs/                Arquitectura, roadmap, compliance, decisiones
scripts/             Utilidades y carga de datos
```

## Stack

| Capa | Elección |
|---|---|
| Backend | Supabase — Postgres gestionado, Auth y Edge Functions |
| Base de datos | PostgreSQL, región europea |
| Aislamiento multi-tenant | Row Level Security por `tenant_id`, no `WHERE` en la app |
| Inferencia y copy | Claude API, invocada desde Edge Functions |
| Descubrimiento | Google Places API, desde una Edge Function troceada |
| Cola de trabajos | Tablas `jobs` y `job_tareas` + `pg_cron` |
| Frontend | React (`frontend/`). `demo/` es un archivo estático sin build |
| Despliegue | Supabase gestionado · demo en Netlify |

No hay servidor propio, ni contenedor, ni cola aparte. El plan original era
FastAPI sobre Proxmox: el porqué del cambio está en `docs/decisiones/`, y la
0002 explica cómo cabe el descubrimiento en Supabase sin worker externo.

## Puesta en marcha

Esquema, funciones y cron: `supabase/README.md`.
Demo navegable, en local o en Netlify: `demo/README.md`.

## Estado

Fase 1. El esquema con RLS, el cerebro de inferencia y el worker de
descubrimiento están escritos y desplegables. La demo pública ya usa la
inferencia real.

Nada de esto se ha ejecutado todavía contra un proyecto Supabase real: hasta
que corra una campaña de punta a punta, está escrito, no verificado. Ver
`docs/roadmap.md`.

## Antes de escribir código de envío

Leer `docs/compliance.md`. El módulo de envío arrastra la mayor parte del riesgo
legal del producto y se construye con el compliance dentro, no parcheado después.
