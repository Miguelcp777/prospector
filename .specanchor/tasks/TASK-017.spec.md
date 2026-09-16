---
type: task-lite
id: TASK-017
status: in_progress
created: 2026-09-16
modules: [app-web]
behavior_preserving: true
---

# Tarea: borrar la lista, donde se busca

## Petición

Miguel, con TASK-016 ya desplegada: «quiero poder eliminar la lista entera».

## Qué pasaba, medido

La acción **existía** desde TASK-016 y funcionaba —comprobada de punta a punta
en producción—, pero estaba donde no se busca:

| | |
|---|---|
| Alto de la pantalla de una lista | **3.841 px** |
| Ventana | 911 px |
| «Borrar la lista» estaba en | **y = 3.747** |
| Botones dentro de la tabla de contactos | **46** |

Cuatro pantallas hacia abajo, detrás de la tabla. Y por el camino se ven 46
botones de «editar» y «quitar» que operan sobre **un** contacto. Lo que la
pantalla venía a decir es que se pueden quitar contactos uno a uno y la lista
entera no — que es literalmente lo que se ha preguntado.

**Una acción que no se encuentra no existe.** No es un defecto de la función:
es de dónde se puso el botón, y lo puse yo.

## Qué cambia

«Borrar la lista» sube a la **cabecera**, junto al nombre y a «Volver a las
listas», que es donde están las acciones sobre *la lista* y no sobre sus
filas. La confirmación sale ahí mismo, donde se ha pulsado, en vez de obligar
a volver a buscarla abajo.

Los dos tiempos se mantienen —pulsar no borra— y el aviso sigue diciendo
cuántas direcciones se van y, si la lista ya se usó en una campaña, que los
leads que salieron de ella **no se tocan**.

No cambia nada de la base: `borrar_lista` y sus dos ramas se quedan como
están. Por eso la tarea es `behavior_preserving`.

## Aceptación

- **TASK-017/AC-001** · «Borrar la lista» se ve sin desplazarse al abrir una
  lista.
- **TASK-017/AC-002** · Sigue pidiendo confirmación, y el aviso sigue diciendo
  cuántas direcciones se borran.

## Evidencia

- **EV-001** · La medición de arriba, tomada sobre la pantalla en producción
  antes de tocar nada.
- **EV-002** · `tsc -b --force` → 0. `npm run build` → correcto, principal
  647,47 kB. Pruebas del studio sin fallos nuevos. `test:importacion`
  **34 de 34**.
- **EV-003** · _(pendiente: la pantalla, después del despliegue)_

## Trazabilidad

| Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|
| AC-001 | Posición del botón medida sobre la pantalla | **pass** · el diagnóstico | EV-001 |
| AC-002 | Tipos, build y pruebas | **pass** · OBSERVED | EV-002 |

## Lo que NO cambia, y conviene no confundirlo

Si «entera» quisiera decir **que no quede ni la ficha** cuando la lista ya se
ha usado en una campaña, eso es otra cosa y no se hace aquí: es la regla de
`INV-DAT-011`, y borrar la ficha de una lista ya volcada deja el
`email_origen` de sus leads apuntando al vacío. Hoy ninguna lista se ha
volcado, así que **el borrado ya es completo en todos los casos reales**.

## Revisión final

_(pendiente de EV-003)_
