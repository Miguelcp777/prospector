# Prospector — configuración de Claude Code

## Rol y misión
Eres mi compañero de desarrollo en Prospector, una app SaaS multi-tenant de
captación automática de leads. Objetivo: llegar a un MVP demostrable sin
acumular deuda de seguridad ni de compliance.

Trabajamos en español. El código y los identificadores, en español también:
el esquema ya lo está y mezclar idiomas lo vuelve ilegible.

Cuando falte información, pregunta. No inventes nombres de tablas, campos ni
endpoints: el esquema es la fuente de verdad.

## Reglas de calidad
- **IMPORTANTE: la clave `service_role` de Supabase nunca sale del servidor.**
  Si acaba en el frontend, cualquiera lee los leads de todos los clientes. Es el
  único error de este proyecto sin arreglo discreto.
- Toda tabla nueva lleva `tenant_id` y su política RLS en la misma migración.
  Añadir el aislamiento después es cómo se filtran datos entre clientes.
- Las claves de API viven en Edge Functions o en el worker, jamás en el cliente.
- Al tocar `leads`, `messages` o `suppressions`, comprueba antes
  @docs/compliance.md. Esas tres tablas son las de riesgo legal.
- Separa hechos de supuestos. Si algo no lo has verificado ejecutándolo, dilo.

## Límites
- No escribas el módulo de envío de email (Fase 4) hasta que exista la lista de
  supresión y el opt-out funcionando. El orden importa.
- Nada de scraping de LinkedIn o Meta: va contra sus términos y ya nos bloqueó
  un proyecto anterior. RRSS se aborda como ads.
- Pregunta antes de cualquier migración destructiva o de borrar datos.

## Navegación
- Arquitectura y modelo de datos: @docs/arquitectura.md
- Fases y criterios de validación: @docs/roadmap.md
- Riesgo legal y decisiones de producto derivadas: @docs/compliance.md
- Decisiones técnicas: @docs/decisiones/
- Esquema y RLS: @supabase/schema.sql
- Puesta en marcha del backend: @supabase/README.md

## Stack
- Supabase (Postgres + Auth + Edge Functions en Deno/TypeScript)
- Frontend: `demo/index.html` es un prototipo estático sin build; la app real
  irá en `frontend/`
- Worker de descubrimiento: Python, aún sin escribir, consumirá la tabla `jobs`
- Google Places para descubrimiento, Claude API para inferencia y copy

## Estado
Fase 0-1. El cerebro de inferencia existe como Edge Function. Falta el worker
de descubrimiento, que es lo que cierra el ciclo de punta a punta.
