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
- Las claves de API viven en los secretos de las Edge Functions, jamás en el
  cliente. `demo/index.html` es código fuente público: si te ves poniendo una
  clave ahí, el diseño está mal, no el archivo.
- Toda función `SECURITY DEFINER` lleva su `revoke execute` de `anon` y
  `authenticated` en la misma migración. Postgres las abre a `public` por
  defecto, y esas funciones se saltan la RLS.
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
- Descubrimiento troceado y cuota de la demo: @supabase/002_descubrimiento_y_demo.sql
- Puesta en marcha del backend: @supabase/README.md
- Demo pública y sus dos modos: @demo/README.md

## Stack
- Supabase para todo: Postgres + Auth + Edge Functions en Deno/TypeScript.
  No hay servidor propio, ni contenedor, ni Python.
- El descubrimiento también corre en Supabase, troceado en `job_tareas` y
  despertado por `pg_cron`. Ver @docs/decisiones/0002-worker-en-supabase.md
- Frontend: `demo/index.html` es un archivo estático sin build que se publica
  en Netlify; la app real irá en `frontend/`
- Google Places para descubrimiento, Claude API para inferencia y copy

## Estado
Fase 1. Esquema con RLS, inferencia y worker de descubrimiento escritos y
desplegables. La demo pública ya usa la inferencia real.

Nada se ha ejecutado contra un proyecto Supabase real. Hasta que una campaña
corra de punta a punta, todo esto está escrito, no verificado — y al hablar
de ello conviene decirlo así.
