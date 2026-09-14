---
type: module-spec
module: datos
status: ready
source_paths:
  - supabase/*.sql
  - supabase/README.md
  - .mcp.json
last_reviewed: 2026-09-14
---

# Módulo: datos

## Responsabilidad

El esquema, el aislamiento entre clientes y toda la lógica que vive en SQL.
Es el módulo del que cuelgan los demás: si aquí se rompe el aislamiento, no
hay nada en la aplicación que lo arregle.

## Propiedad del código

`supabase/schema.sql` más 53 migraciones numeradas (`002`–`053`).
`supabase/README.md` es la documentación operativa y forma parte del módulo.
`.mcp.json` se mapea aquí porque es el canal por el que un agente escribe en
esta base.

## Interfaces públicas

Lo que consume el resto del sistema:

- **Tablas con RLS** — `tenants`, `profiles`, `campaigns`, `segments`,
  `leads`, `messages`, `suppressions`, `jobs`, `job_tareas`, `plantillas`,
  `recursos`, `incidencias`, `config_correo`, `config_modelo`, `kits_marca`,
  `ajustes`, `administradores`, `consumo_modelo`, `consumo_places`,
  `demo_usos`.
- **Funciones para el navegador** (`authenticated`): `encolar_descubrimiento`,
  `encolar_enriquecimiento`, `encolar_redaccion`, `cancelar_job`,
  `logo_de_campana`, `logo_del_negocio`, `registrar_incidencia`, `es_admin`,
  `panel_*`.
- **Funciones solo para el servidor** (`service_role`): `reclamar_tareas`,
  `cerrar_job_si_completo`, `sumar_consulta`, `leer_clave_modelo`,
  `resolver_clave_modelo`, `despertar_worker`.
- **Vistas**: `v_resumen_campana`, `v_contexto_mensaje`, ambas con
  `security_invoker = on`.

## Invariantes de dominio

- **INV-DAT-001** · Toda tabla de negocio lleva `tenant_id` con `references
  tenants(id) on delete cascade` y una política que compara con
  `auth_tenant_id()`. **VERIFIED** 2026-09-14 (TASK-004) · `schema.sql` más
  medición con la sesión de un cliente real.
- **INV-DAT-002** · Toda función `SECURITY DEFINER` tiene `revoke execute` de
  `public`/`anon`/`authenticated` y `grant` explícito. Postgres las abre a
  `public` por defecto y esas funciones se saltan la RLS. OBSERVED · bloque
  final de `002`, y el mismo patrón en 041, 047, 050, 051, 052.
- **INV-DAT-003** · Las vistas llevan `security_invoker = on`. Sin él corren
  con los privilegios del dueño, que tiene `BYPASSRLS`. OBSERVED ·
  `schema.sql`, `051`.
- **INV-DAT-004** · `tenants` se escribe **por columna**, no por tabla.
  `authenticated` puede actualizar `nombre`, `vertical`, `ciudad`,
  `descripcion`, `telefono`, `email_contacto`, `web`, `horario`, `redes`,
  `configurado_en`; **no** `plan`, `max_consultas_mes` ni `modo_demo`.
  VERIFIED 2026-09-14 · escritura de `telefono` devuelve 200, de `plan`
  devuelve `403 · 42501`.
- **INV-DAT-005** · `ajustes` no se escribe desde el navegador (042).
- **INV-DAT-006** · Un job alcanza siempre un estado terminal. Lo sostienen
  `cerrar_job_si_completo` y el cron `reponer_tareas_colgadas` (031).

## Datos y persistencia

Tres buckets de Storage, y la frontera **no es «imagen o no»**, es si el
archivo lo va a pedir un cliente de correo horas después:

| Bucket | Acceso | Contenido |
|---|---|---|
| `recursos` | privado | documentos de la oferta |
| `logos` | público | marca, hasta 2 MB, sin SVG (044) |
| `imagenes-correo` | público | lo que se dibuja dentro de un correo, hasta 10 MB (050) |

VERIFIED 2026-09-14 · consultado en `storage.buckets`; una URL pública
responde 200 sin sesión y una subida a la carpeta de otro tenant devuelve
`403 · new row violates row-level security policy`.

## Semántica de error

Las funciones de encolado lanzan `raise exception` con mensajes pensados para
el cliente. Desde la 053 esos mensajes **no hablan de dinero**: dicen el
límite y el motivo, no el coste.

## Seguridad y permisos

- La clave `service_role` no sale del servidor.
- El MCP de Supabase está en **modo escritura a propósito**, con la condición
  escrita en `supabase/README.md`: se vuelve a lectura al dar el proyecto por
  terminado. Aplazado deliberadamente el 2026-09-06.

## Pruebas y verificación

**No hay ninguna prueba automática de este módulo.** VERIFIED · no existe
ningún archivo de test que ejecute SQL.

El aislamiento sí está verificado a mano y con fecha: TASK-004, 2026-09-14.
Sigue sin automatizar, así que vale para esa revisión y no para siempre —
automatizarlo necesita dos sesiones de prueba y dónde guardar credenciales,
o sea CI.

## Incertidumbres y deuda conocidas

- ~~El aislamiento nunca se ha probado~~ → **VERIFIED** el 2026-09-14
  (TASK-004). Queda pendiente el sentido recíproco —con la sesión de otro
  cliente— y un rol `miembro`, que no se han probado.
- **OBSERVED** · `ajustes.modo_demo` es obsoleta desde la 045 y nadie la lee;
  no se borró porque borrar es destructivo.
- **OBSERVED** · `{{campaign.offer}}` existe como variable y siempre se
  rellena con cadena vacía.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de esquema.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| GRANT por columna en `tenants` acota lo escribible | VERIFIED | sesión del navegador, `98f80dc` | 200 / 403·42501 |
| `imagenes-correo` es público y estable | VERIFIED | `curl` sin credenciales | 200 `image/png` |
| El aislamiento de escritura en Storage aguanta | VERIFIED | subida a carpeta ajena | 403 RLS |
| El trigger `arrancar_al_encolar` encola la llamada y se deshace con la transacción | VERIFIED | `DO` con excepción, `052` | job no persistido |
| No hay pruebas automáticas de SQL | VERIFIED | inventario del repositorio | 0 archivos |
| Un cliente no alcanza filas de otro tenant | VERIFIED | TASK-004, `cfa8f47` | 7 tablas exactas · 6 lecturas ajenas a 0 · 4 escrituras rechazadas |
