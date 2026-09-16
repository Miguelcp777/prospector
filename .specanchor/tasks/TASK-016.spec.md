---
type: task-spec
id: TASK-016
status: verified
created: 2026-09-16
modules: [datos, app-web]
behavior_preserving: false
---

# Tarea: gestionar las listas — borrar, renombrar, corregir

## Petición

Miguel, en dos mensajes seguidos: «tengo que tener la opción de borrar mis
listas» y «y editarlas, cambiar nombre, actualizarlas etc».

## Comportamiento actual

TASK-010 dejó las listas **sin puerta de salida**. Se suben y ahí se quedan:
no hay forma de borrarlas, ni de corregirles el nombre, ni de quitar un
contacto que no debería estar.

Lo llamativo es que **los permisos ya lo permitían todo**, comprobado contra
el catálogo: `listas_del_tenant` es `for all`, `contactos_de_lista` tiene sus
políticas de `update` y `delete`, y `authenticated` tiene DELETE en las tres
tablas. Lo único que faltaba era la pantalla.

## Lo que se midió antes de decidir nada

Con un lead colgando de un contacto de la lista, en una transacción deshecha:

| | |
|---|---|
| leads vivos tras borrar la lista | **1** — no se van |
| con `contacto_id` a nulo | 1 — el `on delete set null` de la 054 |
| contactos de la lista | 0 — cascada |
| `email_origen` del lead | `lista:<uuid>#fila-1` |

O sea: **el lead sobrevive y sigue diciendo de qué lista salió, pero esa lista
ya no existe.** El registro de origen queda apuntando al vacío, y
`docs/compliance.md` lo pide expresamente: «Registro de origen del dato por
lead (fuente y fecha), para poder responder a cualquier reclamación».

## La regla que se adopta, y por qué son dos casos

| | Qué pasa |
|---|---|
| Lista que **nunca se volcó** | Desaparece entera, ficha incluida. No hay nada a lo que responder |
| Lista **ya volcada** | Se borran los contactos y la ficha se queda como lápida: archivo, fecha, mapeo, declaración y cifras, con su histórico |

Da las dos cosas a la vez: el cliente ejerce su derecho a borrar las
direcciones —que es lo que pide—, y queda de dónde salió cada lead. Es el
mismo principio que ya sostiene `messages.email_destino`: la dirección de la
reclamación es la de entonces.

## Un agujero heredado que ha destapado ponerse a editar

`authenticated` tenía UPDATE sobre las **veinte** columnas de
`listas_de_contactos`, y ahí dentro están `consentimiento_texto` y
`consentimiento_en`. Un cliente podía **reescribir a posteriori la declaración
que afirmó al subir la lista** — justo lo que convertía un supuesto en un acto
registrado con autor. La 055 lo acota a `nombre`, y quita del todo la
escritura sobre `volcados_de_lista`.

No lo pedía nadie y no es esta tarea; entra porque se encontró abriendo esta
puerta y dejarlo anotado para luego habría sido dejarlo abierto a sabiendas.

## Resultado deseado y aceptación

- **TASK-016/REQ-001** · Una lista se puede borrar, y borrarla no se lleva por
  delante los leads que salieron de ella.
- **TASK-016/REQ-002** · Una lista se puede renombrar; el resto de su ficha,
  no.
- **TASK-016/REQ-003** · Un contacto se puede corregir o quitar.

- **TASK-016/AC-001** · Borrar una lista nunca volcada la borra entera.
- **TASK-016/AC-002** · Borrar una lista ya volcada deja la ficha marcada, sin
  contactos, y conserva declaración, archivo e histórico.
- **TASK-016/AC-003** · `borrar_lista` sobre la lista de otro tenant responde
  `No autorizado`.
- **TASK-016/AC-004** · `authenticated` solo puede escribir `nombre` en
  `listas_de_contactos`, y nada en `volcados_de_lista`.
- **TASK-016/AC-005** · La pantalla avisa de cuántas direcciones se borran y
  de que los leads se quedan, **antes** de borrar, y pide confirmación.

## Evidencia

- **EV-001** · El arrastre del borrado, medido en transacción deshecha: la
  tabla de arriba.
- **EV-002** · **Caso A**, lista nunca volcada: `borrada = true` y quedan
  **0 filas** de la ficha.
- **EV-003** · **Caso B**, lista con un volcado: `borrada = false`,
  `contactos = 23`, y después `ficha_que_queda = 1`, `es_lapida = true`,
  `contactos_que_quedan = 0`, `historico_que_queda = 1`,
  `declaracion_conservada = true`, `archivo_conservado = clientes-demo.csv`.

  Ojo con cómo se mide: leer el resultado **en la misma sentencia** que llama
  a la función devuelve la foto de antes —la instantánea MVCC es la del
  comienzo de la sentencia— y parece que no ha hecho nada. Hay que separar la
  llamada de la comprobación, y a mí me engañó una vez.
- **EV-004** · **Aislamiento**, por los dos caminos: desde otro tenant la RLS
  ni deja ver la lista —`La lista no existe`— y pasándole el uuid a pelo la
  comprobación interna responde **`No autorizado`**, con los 23 contactos
  intactos.
- **EV-005** · Permisos tras la 055, leídos del catálogo:
  `borrar_lista` → `postgres=X authenticated=X service_role=X`, **sin `anon`
  ni `public`**; UPDATE de `authenticated` sobre `listas_de_contactos` →
  **solo `nombre`**; escritura sobre `volcados_de_lista` → **0 privilegios**.
  Comprobado además de rebote: un INSERT en `volcados_de_lista` como
  `authenticated` falla con `42501 permission denied`.
- **EV-006** · `tsc -b --force` → 0. `npm run build` → correcto, principal
  647,68 kB. Pruebas del studio sin fallos nuevos. `test:importacion`
  **34 de 34**.
- **EV-007** · **Las cuatro acciones, de punta a punta en producción**, con el
  paquete servido comprobado antes (`index-BPgW-gJE.js`):

  | Acción | Cómo se comprobó | Resultado |
  |---|---|---|
  | Renombrar | «cambiar el nombre» → guardar | la lista pasa a `zzz-prueba RENOMBRADA` **en la base** |
  | Corregir un contacto | «editar» en la fila 1, poner el nombre | `nombre = 'Ana Muñoz'` **en la base** |
  | Confirmación de borrado | pulsar «Borrar la lista» | «Se van a borrar **23 direcciones**, y no se pueden recuperar» |
  | Borrar | «Sí, borrarla» | vuelve al índice; queda solo la otra lista |

  Después, contra la base: **0** fichas `zzz-prueba`, **0 contactos
  huérfanos**, y los leads de fuente `lista` intactos.

  Detalle que vale la pena: la fila que se corrigió tenía el **nombre vacío**,
  porque esa lista se importó antes del arreglo de «Persona de contacto» de
  TASK-013. O sea que la primera vez que hizo falta corregir un contacto a
  mano fue por un fallo anterior — que es exactamente para lo que sirve.

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | Caso A contra la base, en transacción deshecha | **pass** | EV-002 |
| REQ-001 | AC-002 | Caso B contra la base, separando llamada y lectura | **pass** | EV-003 |
| REQ-001 | AC-003 | Los dos caminos del aislamiento | **pass** | EV-004 |
| REQ-002 | AC-004 | Catálogo de permisos tras aplicar la 055 | **pass** | EV-005 |
| REQ-003 | — | Tipos, build y pruebas | **pass** · OBSERVED | EV-006 |

| REQ-003 | AC-005 | Las cuatro acciones en producción, contrastadas contra la base | **pass** · VERIFIED | EV-007 |

## Lo que NO entra, y es la mitad de «actualizarlas»

**Añadir un archivo nuevo a una lista que ya existe no se hace aquí**, y no es
pereza: el registro de origen de una lista es de **valor único**.
`archivo_nombre`, `codificacion` y `mapeo` son una columna cada uno. Pegar un
segundo archivo dentro de la misma lista convertiría esas tres columnas en
mentira — la lista vendría de dos sitios y diría uno—, que es exactamente lo
que `INV-DAT-011` acaba de proteger.

Hay dos salidas razonables y hay que elegir una a sabiendas:

1. **Una lista por archivo**, y varias listas se vuelcan a la misma campaña.
   Es lo que el diseño de hoy ya soporta, sin tocar nada.
2. **Listas con varios orígenes**: el registro de origen se muda a una tabla
   hija, una fila por archivo, y el contacto apunta a la suya. Es una
   migración de verdad y cambia `guardar_lista`.

Hoy se puede hacer lo primero. Lo segundo se decide cuando alguien tenga el
problema, no antes.

## Revisión final

- Cobertura documental: **PASS**.
- Spec → Código: **ALIGNED** — `INV-DAT-011`, `INV-DAT-012` e `INV-WEB-016`.
- Código → Spec: **ALIGNED**.

**Lo que no se ha podido medir con datos reales:** la rama de la lápida en
pantalla. Hoy ninguna lista se ha volcado a una campaña, así que la única
lista borrada desapareció entera. La rama está verificada **contra la base**
(EV-003); lo que falta es verla en la pantalla, y para eso hace falta una
lista volcada, que hoy no existe.
