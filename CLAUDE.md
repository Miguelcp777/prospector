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

## Cómo se trabaja aquí: desarrollo dirigido por especificación

Este proyecto está anclado. Para **cualquier cambio material** se aplica el
protocolo de `.specanchor/README.md`:

1. Antes de tocar código, escribe la tarea en `.specanchor/tasks/`. Ligera si
   el cambio es localizado y no toca API, datos, permisos, integraciones ni
   arquitectura; completa si toca algo de eso.
2. Carga los contratos afectados: la spec del módulo en
   `.specanchor/modules/`, las globales de `.specanchor/global/` y el ADR
   correspondiente de `docs/decisiones/` si lo hay.
3. Si el cambio altera un contrato, **actualiza la spec antes o a la vez**.
   Nunca después para justificar lo que salió.
4. Verifica los criterios de aceptación afectados con evidencia real y revisa
   el diff en las dos direcciones: código → spec y spec → código.
5. Informa **por separado** la cobertura documental (`PASS/FAIL/NOT_RUN`) y la
   alineación funcional (`ALIGNED/PARTIAL/DRIFT/NOT_VERIFIED`). El guard no
   puede dar un veredicto semántico, y decir que sí lo da es lo que
   convertiría esto en burocracia.

`.specanchor/spec-index.md` dice qué módulo cubre cada ruta. Un archivo
material que no pertenezca a ninguno hace fallar el guard: eso es a propósito.

Las pruebas del studio dan **71 de 75**. Los cuatro fallos son adaptaciones
deliberadas del porte (`docs/decisiones/0005`). Un fallo distinto de esos
cuatro bloquea el cierre.

## Navegación
- Contratos y protocolo de cambios: @.specanchor/README.md
- Arquitectura y modelo de datos: @docs/arquitectura.md
- Fases y criterios de validación: @docs/roadmap.md
- Riesgo legal y decisiones de producto derivadas: @docs/compliance.md
- Decisiones técnicas: @docs/decisiones/
- Campaign Studio, por qué está sin conectar: @docs/decisiones/0003-campaign-studio-aparcado.md
- La V45 del studio, qué entró en la app y qué no: @docs/decisiones/0005-v45-al-studio-de-la-app.md
- De quién sale el correo y qué falta antes de enviar: @docs/decisiones/0004-quien-es-el-remitente.md
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
