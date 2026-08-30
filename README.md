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
supabase/            Backend: esquema, RLS y Edge Functions
  schema.sql         Tablas, políticas RLS, vista de resumen, función de scoring
  functions/         Edge Functions en Deno/TypeScript (inferencia de segmentos)
backend/             Worker de descubrimiento en Python. Consume la tabla `jobs`
  app/services/      Places, deduplicación, enriquecimiento, scoring
  app/workers/       Bucle de consumo de jobs
  app/core/          Configuración y cliente de Supabase
frontend/            React. Onboarding, campañas, tabla de leads, dashboard
demo/                Prototipo estático navegable. Datos simulados, sin backend
data/taxonomias/     Taxonomías curadas por vertical (ancla anti-alucinación)
docs/                Arquitectura, roadmap, compliance, decisiones
infra/               Empaquetado y despliegue del worker
scripts/             Utilidades y carga de datos
```

## Stack

| Capa | Elección |
|---|---|
| Backend | Supabase — Postgres gestionado, Auth y Edge Functions |
| Base de datos | PostgreSQL, región europea |
| Aislamiento multi-tenant | Row Level Security por `tenant_id`, no `WHERE` en la app |
| Inferencia y copy | Claude API, invocada desde Edge Functions |
| Descubrimiento | Google Places API, invocada desde el worker |
| Cola de trabajos | Tabla `jobs` en Postgres + worker externo en Python |
| Frontend | React (`frontend/`). `demo/` es un prototipo estático sin build |
| Despliegue | Supabase gestionado + worker en contenedor |

El plan original era FastAPI sobre Proxmox. El porqué del cambio y sus
consecuencias están en `docs/decisiones/0001-supabase.md`.

## Puesta en marcha

Backend, esquema y despliegue de la Edge Function: `supabase/README.md`.
Prototipo navegable sin instalar nada: abrir `demo/index.html`.

## Estado

Fase 0-1. El cerebro de inferencia existe como Edge Function y el esquema con
RLS está escrito. Falta el worker de descubrimiento, que es lo que cierra el
ciclo de punta a punta. Ver `docs/roadmap.md`.

## Antes de escribir código de envío

Leer `docs/compliance.md`. El módulo de envío arrastra la mayor parte del riesgo
legal del producto y se construye con el compliance dentro, no parcheado después.
