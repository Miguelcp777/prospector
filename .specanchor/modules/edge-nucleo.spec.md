---
type: module-spec
module: edge-nucleo
status: ready
source_paths:
  - supabase/functions/_shared/*
  - supabase/config.toml
last_reviewed: 2026-09-14
---

# Módulo: edge-nucleo

## Responsabilidad

Lo que comparten todas las Edge Functions: de quién es la clave del modelo,
qué orígenes se aceptan, cómo se contabiliza el consumo y cómo se construye
una respuesta. Un cambio aquí toca a todas las funciones a la vez.

## Propiedad del código

`_shared/claves.ts`, `http.ts`, `consumo.ts`, `inferencia.ts`,
`redaccion.ts`, `landing.ts`, más `supabase/config.toml`, que declara qué
funciones van sin JWT.

## Interfaces públicas

- `claveDelModelo(proveedor, tenant?)` — resuelve la clave llamando a
  `resolver_clave_modelo` y cae al secreto de entorno **solo** cuando el
  origen no es `falta_cliente`.
- `ErrorSinClave(proveedor, "cliente" | "servicio")` — el error que las
  funciones tienen que capturar y traducir a un 503 con mensaje accionable.
- `json(req, cuerpo, estado)` y `preflight(req)` — respuesta y CORS.
- `anotarConsumo(funcion, modelo, uso, tenant, campaña)` — un apunte por
  operación.

## Invariantes de dominio

- **INV-NUC-001** · Un cliente fuera del modo demo que no tenga clave propia
  **no** usa la del servicio. La ausencia de caída es el punto entero: una
  caída silenciosa es cómo se acaba pagando el consumo de otro (047).
- **INV-NUC-002** · El mensaje de falta de clave distingue a quién le toca
  ponerla. `falta_cliente` manda a Cuenta → Proveedor de modelo;
  `falta_servicio`, al panel de administración (049).
- **INV-NUC-003** · `ErrorSinClave` se captura en cada función y se traduce.
  Sin capturarlo sale un 500 «Error inesperado» que no dice nada — ocurrió y
  se arregló en inferencia, redacción y landing.
- **INV-NUC-004** · La caché de claves se indexa por `${proveedor}::${tenant}`.
  Indexarla solo por proveedor serviría la clave de un cliente a otro.

## Dependencias

`datos` (funciones `resolver_clave_modelo`, `registrar_consumo_modelo`).

## Seguridad y permisos

`config.toml` fija qué funciones van con `verify_jwt = false`. Lo que las
protege no es el token:

| Función | Qué la protege |
|---|---|
| `descubrir`, `enriquecer`, `redactar` | cabecera `x-worker-secreto` |
| `demo-inferir` | cuota por IP y tope diario |
| `baja`, `landing` | token del mensaje / id público de la landing |
| `correo-webhook` | firma del proveedor |

## Semántica de error

Falta de clave → **503** con el sitio donde se pone. Proveedor caído → **502**
con el motivo real. Nunca un 500 genérico para un caso conocido.

## Pruebas y verificación

**No hay pruebas automáticas.** La verificación es por ejecución: llamada real
a la función y comprobación del código de estado.

Comprobación obligatoria tras desplegar: `curl -X OPTIONS` o una llamada
mínima. Un **503 con BOOT_ERROR** significa que el módulo no carga, y se
confunde con un fallo de red.

## Incertidumbres y deuda conocidas

- **OBSERVED** · La caché por isolate hace que una clave rotada tarde hasta
  cinco minutos en surtir efecto.
- **UNKNOWN** · No se ha probado el camino `falta_servicio` con un tenant en
  modo demo y el Vault vacío desde que se desplegó la 049.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| `resolver_clave_modelo` solo la puede llamar `service_role` | OBSERVED | `047_…sql`, bloque de grants | — |
| La resolución por tenant funciona en producción | VERIFIED | `componer-campana` con sesión real | copy y arte devueltos |
| Un BOOT_ERROR responde 503 | VERIFIED | `generar-imagen` con variable duplicada | 503, corregido |
| `redactar` carga tras desplegar | VERIFIED | POST con clave publicable, `98f80dc` | 401 propio de la función, no 503 |
