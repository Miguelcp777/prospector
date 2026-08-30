# 0001 · Supabase como backend

**Fecha:** agosto 2026 · **Estado:** aceptada, parcialmente superada

> La conclusión de que el descubrimiento necesita un worker externo quedó
> superada por `0002-worker-en-supabase.md`. El resto sigue vigente.

## Contexto

El plan original era FastAPI sobre Proxmox. Para la fase de validación eso
implica montar auth, multi-tenancy, API y despliegue antes de poder enseñar
nada que funcione.

## Decisión

Supabase como backend: Postgres gestionado, auth incluida, API sobre las tablas
y Edge Functions para lo que necesita clave secreta.

No es un cambio de arquitectura — la base ya era Postgres — sino un atajo para
llegar antes a producto demostrable.

## Consecuencias

**A favor**

- El aislamiento entre clientes pasa a ser RLS en la base, no un `WHERE` que
  alguien puede olvidar en un endpoint.
- Auth con roles, invitaciones y recuperación de contraseña, sin escribirla.
- Las claves de Anthropic y Places viven en Edge Functions, fuera del navegador.
- Realtime sobre la tabla `jobs`: la pantalla de progreso deja de ser una
  animación falsa.

**En contra**

- ~~El descubrimiento no cabe en una Edge Function: cientos de consultas a Places
  y varios minutos frente a un timeout corto. Por eso existe la tabla `jobs` y
  un worker externo.~~ **Superado por la 0002:** sí cabe, troceando el trabajo.
  La tabla `jobs` se queda; el worker externo, no.
- Dependencia de proveedor. Mitigada porque el núcleo es Postgres estándar y el
  esquema es portable.

## Restricciones que se derivan

- **Región europea** (Frankfurt o Irlanda) al crear el proyecto. Con datos de
  contacto de empresas y el módulo de envío de Fase 4, la residencia del dato es
  argumento en `compliance.md`. Cambiarla después obliga a migrar.
- `anon key` en el frontend, siempre. `service_role` solo en servidor: se salta
  todas las políticas RLS.
- El worker de descubrimiento usa `service_role` y por tanto asume la
  responsabilidad de filtrar por tenant en su propio código.

## Pendiente

- ~~Decidir dónde corre el worker: Proxmox o contenedor gestionado.~~
  Resuelto en la 0002: corre en Supabase.
- ~~Rate limiting y presupuesto por campaña para Google Places.~~
  Resuelto en la 0002: `campaigns.max_consultas`.
