---
type: task-lite
id: TASK-018
status: in_progress
created: 2026-09-16
modules: [datos, app-web]
behavior_preserving: false
---

# Tarea: borrar una lista la borra entera, siempre

## Petición

Miguel: «que se borre todo siempre».

Es la respuesta a la regla que TASK-016 había adoptado y que TASK-017 le puso
por escrito delante: una lista **ya volcada** a una campaña no desaparecía;
perdía los contactos y dejaba su ficha como lápida —archivo, fecha, mapeo,
declaración y cifras— para no romper el registro de origen de los leads que
salieron de ella.

**La decisión está tomada con el motivo a la vista, no por descuido**, y eso
es la mitad de lo que hay que dejar escrito aquí.

## Qué cambia

`borrar_lista` pierde la rama de la lápida. Una sola salida: se borra la
lista, y la cascada se lleva contactos e histórico de volcados.

## Qué se pierde exactamente

Al borrar una lista que ya se volcó, sus leads **siguen vivos** —eso no
cambia, es el `on delete set null` de la 054— y conservan:

| Sobrevive en el lead | |
|---|---|
| `fuente` | `lista` · salió de una lista, no de Places |
| `email_origen` | `lista:<uuid>#fila-N` |
| `email_capturado_en` | la fecha de la lista |

Y se pierde, sin vuelta atrás: `archivo_nombre`, `mapeo`,
`consentimiento_texto`, `consentimiento_en`, `subido_por` y las filas de
`volcados_de_lista`.

O sea: el lead sigue diciendo que vino de una lista y con qué fila, pero **ese
uuid ya no resuelve a nada**. `docs/compliance.md` pide «registro de origen
del dato por lead (fuente y fecha)»: la fuente y la fecha se conservan; el
respaldo documental, no.

## La salida, si algún día hace falta

Copiar la declaración y el nombre del archivo **al lead en el momento del
volcado**, en vez de dejarlos colgando de una fila que se puede borrar. Es el
patrón de `messages.email_destino` y sobreviviría a esto. No se hace hoy
porque no se ha pedido y porque cambia `volcar_lista_en_campana` y `leads`.

## Aceptación

- **TASK-018/AC-001** · Borrar una lista **ya volcada** no deja ficha, ni
  contactos, ni histórico.
- **TASK-018/AC-002** · Sus leads siguen vivos, con `contacto_id` a nulo y
  conservando `fuente`, `email_origen` y `email_capturado_en`.
- **TASK-018/AC-003** · El aviso previo dice que la lista desaparece entera y
  que los leads dejarán de poder decir de qué archivo salieron.

## Evidencia

- **EV-001** · El caso que antes disparaba la lápida —una lista con un volcado
  insertado a propósito—, en transacción deshecha:
  `ficha_que_queda 0 · contactos 0 · historico 0 · huerfanos 0`.
- **EV-002** · El mismo caso con un lead colgando de un contacto:
  `lead_vivo 1 · contacto_a_nulo true · fuente lista ·
  origen lista:ensayo#fila-9 · fecha conservada · ficha 0`.
- **EV-003** · `tsc -b --force` → 0. `npm run build` → correcto, principal
  646,46 kB — **baja** respecto a los 647,47 de antes: se va código. Pruebas
  del studio sin fallos nuevos. `test:importacion` **34 de 34**.
- **EV-004** · _(pendiente: la pantalla, después del despliegue)_

## Trazabilidad

| Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|
| AC-001 | El caso de la lápida contra la base, deshecho | **pass** | EV-001 |
| AC-002 | El mismo caso con un lead colgando | **pass** | EV-002 |
| AC-003 | Tipos, build y pruebas | **pass** · OBSERVED | EV-003 |

## La columna de la lápida se queda

`listas_de_contactos.contactos_borrados_en` no se borra: borrar es destructivo
y no lo pide nadie. Nadie la escribe y nadie la lee, y eso está dicho **en el
comentario de la propia columna**, que es el criterio que la 045 ya usó con
`ajustes.modo_demo`.

## Revisión final

_(pendiente de EV-004)_
