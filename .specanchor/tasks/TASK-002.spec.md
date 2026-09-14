---
type: task-spec
id: TASK-002
status: verified
created: 2026-09-14
modules: [studio]
behavior_preserving: true
---

# Tarea: en la Biblioteca, un nombre largo se sale de la ventana

## Petición, alcance y comportamiento actual

Reportado con captura: en el panel **Biblioteca** del studio, las plantillas
con nombre largo pintan el título fuera de su tarjeta. Se lee cortado por los
dos lados y tapa el icono y la flecha de la fila.

Medido en producción a 1440 px, revisión `ec28a9c`:

| Fila | Columna central | Título | Dentro de su botón |
|---|---|---|---|
| «Ciberseguridad» | 167 px | 303 → 470 | sí |
| «Woody Tattoo · conseguir reuniones cualificadas» | **310 px** | **231 → 542** | **no** |

El botón mide 255 → 499. El título se sale 24 px por la izquierda y 43 por la
derecha, y el panel entero acaba en 521.

**Causa.** La fila es una rejilla `grid-template-columns: 31px 1fr 12px`. En
CSS Grid, `1fr` equivale a `minmax(auto, 1fr)`, y ese `auto` como mínimo es el
**contenido mínimo**: con un texto `nowrap`, el ancho entero del texto. La
columna no encoge, así que el `text-overflow: ellipsis` que ya está puesto en
el título no llega a actuar nunca — no hay nada que recortar porque el hueco
siempre es lo bastante grande.

Alcance: dos reglas de `frontend/src/estilos-studio.css`. La misma forma está
en `.saved-list > button` (plantillas guardadas) y en
`.saved-list.archivadas > div` (archivadas), así que las dos tienen el fallo
aunque solo se haya reportado la primera.

**Fuera de alcance:** acortar los nombres que genera el asistente, y el
desborde de las pestañas «Bloques / Biblioteca», que es otro problema.

## Resultado deseado y aceptación

- **TASK-002/REQ-001** · Un nombre de cualquier longitud se queda dentro de su
  fila y se recorta con puntos suspensivos.
- **TASK-002/REQ-002** · Las filas de nombre corto no cambian de aspecto.
- **TASK-002/REQ-003** · La lista de archivadas se arregla a la vez, por tener
  la misma causa.

- **TASK-002/AC-001** · Con «Woody Tattoo · conseguir reuniones cualificadas»,
  el rectángulo del título queda dentro del rectángulo de su botón, medido en
  el DOM.
- **TASK-002/AC-002** · La columna central de esa fila mide lo mismo que la de
  una fila corta (167 px a 1440 px de ventana).
- **TASK-002/AC-003** · `npm run test:studio` sigue dando 71 de 75, con los
  mismos cuatro fallos conocidos.

## Anclas afectadas y justificación del impacto

`modules/studio.spec.md`. Clasificación: **behavior_preserving**. No cambia
ningún contrato: la intención de la fila siempre fue recortar el título —el
`text-overflow: ellipsis` ya estaba escrito— y lo que se arregla es que esa
intención no llegaba a aplicarse. No se añade ni se retira ninguna promesa.

## Evidencia de verificación

| Requisito | Aceptación | Verificación | Resultado real | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | medir en el DOM el título contra su botón | 303→470 dentro de 255→499 | EV-001 |
| REQ-001 | AC-002 | leer `gridTemplateColumns` de la fila larga | 310 px → **167 px** | EV-001 |
| REQ-002, REQ-003 | AC-003 | `cd frontend && npm run test:studio` | 75 · 71 ✓ · 4 ✗, los mismos | EV-002 |

- **EV-001** · Arreglo inyectado en producción antes de escribirlo en el
  archivo: antes `310.031px` y título 231→542 (se sale); después `167px` y
  título 303→470 (dentro).
- **EV-002** · Pruebas del studio tras el cambio.

## Revisión final

- Cobertura documental: PASS
- Spec → Código: ALIGNED
- Código → Spec: ALIGNED
