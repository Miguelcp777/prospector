---
type: task-spec
id: TASK-004
status: verified
created: 2026-09-14
modules: [datos]
behavior_preserving: true
---

# Tarea: comprobar que el aislamiento entre clientes funciona de verdad

## Petición, alcance y comportamiento actual

El aislamiento multi-tenant es la promesa central del producto y el único
fallo que `CLAUDE.md` describe como «sin arreglo discreto». Está declarado en
tres sitios —`INV-ARQ-001`, `INV-DAT-001`, `arquitectura.md`— y en los tres
como **OBSERVED**: leído en el código, nunca ejecutado.

`supabase/README.md` trae el procedimiento escrito desde el principio y **no
consta que se haya ejecutado nunca**.

Esta tarea no cambia código. Convierte una suposición en un hecho, o
encuentra el agujero.

**Sin crear datos de prueba.** No hace falta: la base ya tiene seis tenants
con datos reales, y hay una sesión de un usuario cuyo tenant es
`5ff7187e…` (Woody Tattoo). Comprobar que **esa** sesión no alcanza lo de los
demás es la misma prueba, sin ensuciar una base de producción.

### La verdad del servidor, saltándose la RLS

Consultado con acceso administrativo (revisión `cfa8f47`):

| Tabla | Filas totales | De su tenant | Debería ver |
|---|---|---|---|
| `campaigns` | 13 | 3 | 3 |
| `leads` | 3111 | 1687 | 1687 |
| `messages` | 619 | 480 | 480 |
| `segments` | 73 | 23 | 23 |
| `plantillas` | 55 | 50 | 50 |
| `jobs` | 28 | 10 | 10 |
| `incidencias` | 4 | **0** | **0** |

`incidencias` es el caso más limpio: hay cuatro, ninguna suya. Si viera
alguna, el aislamiento está roto sin margen de interpretación.

## Resultado deseado y aceptación

- **TASK-004/REQ-001** · Una sesión de cliente solo alcanza filas de su
  tenant.
- **TASK-004/REQ-002** · Pedir por identificador una fila de otro tenant no
  la devuelve.
- **TASK-004/REQ-003** · Escribir sobre una fila de otro tenant se rechaza.

- **TASK-004/AC-001** · Los recuentos con el token del cliente coinciden
  exactamente con la columna «debería ver» de la tabla de arriba.
- **TASK-004/AC-002** · Una consulta por el id de una campaña, un lead, un
  mensaje y una plantilla ajenos devuelve **0 filas** en los cuatro casos.
- **TASK-004/AC-003** · Un intento de modificar una campaña ajena no cambia
  ninguna fila.

## Anclas afectadas y justificación del impacto

`modules/datos.spec.md` y `global/arquitectura.spec.md`. Clasificación:
**clarification** — no se altera ningún contrato, se sustituye el estado de
evidencia de sus invariantes.

## Evidencia de verificación

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | recuento por tabla con el token del cliente | **pass** · 7 de 7 exactos | EV-001 |
| REQ-002 | AC-002 | lectura por id de seis filas ajenas | **pass** · 0 filas en las seis | EV-002 |
| REQ-003 | AC-003 | escritura sobre filas ajenas e inserción en otro tenant | **pass** · 0 modificadas · 403·42501 | EV-003 |

- **EV-001** · Recuentos con el token del cliente, por cabecera
  `count=exact`: `campaigns` 3 de 13 · `leads` **1687 de 3111** · `messages`
  **480 de 619** · `segments` 23 de 73 · `plantillas` 50 de 55 · `jobs` 10 de
  28 · `incidencias` **0 de 4**. Los siete coinciden con lo esperado.
- **EV-002** · Petición por identificador de una campaña, un lead, un mensaje,
  una plantilla, un segmento y una incidencia **de otros tenants**: HTTP 200
  con **cero filas** en los seis casos. Nótese que devuelve 200 y lista vacía,
  no 403: para quien pregunta, la fila sencillamente no existe.
- **EV-003** · `PATCH` sobre una campaña, un lead y una plantilla ajenos:
  **0 filas modificadas** en los tres. `POST` de una campaña con el
  `tenant_id` de otro cliente: **403 · 42501, «new row violates row-level
  security policy»**.
- **EV-004** · Comprobado después desde el servidor que las filas atacadas
  siguen intactas: la campaña se sigue llamando «TATOO», la plantilla conserva
  su nombre, el lead sigue en `nuevo` y no existe ninguna fila «INTRUSA».

## Nota sobre el método de prueba

El orden importó. Primero se comprobó la **lectura** (AC-002) y solo después
se intentó **escribir** (AC-003): si el aislamiento hubiera estado roto, el
primer paso lo habría revelado sin tocar un dato ajeno. Intentar la escritura
antes habría sido apostar los datos de un cliente a que la prueba sale bien.

No se crearon tenants ni usuarios de prueba. No hacía falta, y habría dejado
basura en una base de producción.

## Lo que esta prueba NO cubre

- **Un solo sentido.** Se comprobó que el tenant `5ff7187e…` no alcanza lo
  ajeno. No se comprobó lo recíproco, porque exigiría la sesión de otro
  cliente.
- **Un solo rol.** El usuario probado es `propietario` y además
  administrador. No se ha probado un `miembro`.
- **Las funciones `SECURITY DEFINER`** se saltan la RLS por diseño; su
  aislamiento depende de sus propios `revoke`/`grant` y no de esta prueba.
- **No queda automatizada.** Es una verificación manual con fecha: vale para
  hoy y para esta revisión, no para siempre. Automatizarla necesita dos
  sesiones de prueba y un sitio donde guardar credenciales, o sea CI.

## Revisión final

- Documentary coverage: PASS
- Spec → Código: **ALIGNED** — `INV-ARQ-001` e `INV-DAT-001` pasan de
  OBSERVED a VERIFIED.
- Código → Spec: **ALIGNED** — no se cambió código; el comportamiento medido
  es el que los invariantes describían.
