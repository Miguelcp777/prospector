---
type: task-spec
id: TASK-009
status: in_progress
created: 2026-09-15
modules: [studio]
behavior_preserving: false
---

# Tarea: en modo guiado, plegar la paleta dejaba un hueco vacío

## Petición, alcance y comportamiento actual

Miguel: «en modo guiado, en el paso Elegir plantilla, no tengo opciones para la
elección de plantilla; no aparece ni bloques ni biblioteca».

**Es una regresión de TASK-006, y es mía.** Antes de aquel cambio la clase
`left-collapsed` no se aplicaba nunca —los botones no hacían nada—, así que la
paleta no se podía ocultar. Desde que funcionan, sí; y el modo guiado no lo
sabe.

### Reproducido en producción

Modo guiado, paso `library`, tras pulsar «Bloques y capas»:

| | `className` de `.workspace-grid` | columnas | paleta |
|---|---|---|---|
| normal | `workspace-grid hide-advanced` | `196px 340px 1136px` | `visible` · se ve |
| **plegada** | `… left-collapsed hide-advanced` | `196px 340px 1136px` | **`hidden`** · no se ve |
| repuesta | `workspace-grid hide-advanced` | `196px 340px 1136px` | `visible` |

La columna **sigue midiendo 340 px** en los tres casos. El choque es de
especificidad: `.mode-guided.paso-library .workspace-grid` (0,3,0) gana a
`.workspace-grid.left-collapsed` (0,2,0), así que el ancho lo fija el paso;
pero `.workspace-grid.left-collapsed .palette-panel { visibility: hidden }`
sí se aplica. Queda el hueco reservado y vacío, que es exactamente lo que se
ve: un espacio donde deberían estar «Bloques» y «Biblioteca».

Lo mismo le pasa al inspector con `right-collapsed` en los pasos que lo
reservan.

## Resultado deseado y aceptación

- **TASK-009/REQ-001** · En modo guiado, cada paso enseña los paneles que su
  disposición reserva. No hay huecos vacíos.
- **TASK-009/REQ-002** · No queda ningún botón que no pueda hacer nada.

- **TASK-009/AC-001** · En guiado, con el plegado activado antes de entrar, la
  paleta se ve y las pestañas «Bloques» y «Biblioteca» están en pantalla.
- **TASK-009/AC-002** · En guiado, los botones «Bloques y capas» y
  «Propiedades» no se dibujan.
- **TASK-009/AC-003** · En profesional siguen funcionando como los dejó
  TASK-006.
- **TASK-009/AC-004** · `tsc`, `build` y pruebas sin fallos nuevos.

## Anclas afectadas y justificación del impacto

`modules/studio.spec.md`. Clasificación **contract**: cambia el
comportamiento visible de dos controles según el modo.

## Decisiones

- **DEC-001** · En guiado **no se emiten** las clases de plegado. La
  alternativa —enseñar el panel igualmente con un `visibility: visible` más
  específico— dejaría los botones pulsables y sin efecto: la misma enfermedad
  que TASK-006 y TASK-007 acaban de curar.
- **DEC-002** · Y por eso mismo **los dos botones no se dibujan en guiado**.
  Esconder un control que no puede hacer nada es honesto; dejarlo puesto, no.
  El de «controles avanzados» sí se queda: ahí sí hace algo, y el propio modo
  guiado lo apaga al entrar.
- **DEC-003** · Al entrar en guiado se reponen también **en el estado**
  (`setLeftPanelOpen(true)`, `setRightPanelOpen(true)`), no solo en las clases.
  Si no, al volver a profesional reaparecería un panel plegado que nadie
  recuerda haber plegado.
- **DEC-004** · La disposición del paso **manda sobre la preferencia manual**.
  El modo guiado existe para decidir qué se ve en cada momento; si el paso
  dice «elige una plantilla», el panel de plantillas no es opcional.

## Evidencia

- **EV-001** · Reproducción en producción, tabla de arriba: `left-collapsed`
  con la columna en 340 px y `visibility: hidden`. Medido conmutando el botón
  y volviendo a conmutarlo.
- **EV-002** · `npx tsc -b --force` salida 0, `npm run build` salida 0,
  `node scripts/pruebas-del-studio.mjs` salida 0 · 71/4 · sin fallos nuevos.
- **EV-003** · *(pendiente)* Medición en producción tras desplegar: en guiado
  con el plegado previo, paleta visible y pestañas en pantalla; y los dos
  botones ausentes de la barra.

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | paleta y pestañas en guiado tras plegar antes | **not_run** | EV-003 |
| REQ-002 | AC-002 | ausencia de los dos botones en guiado | **not_run** | EV-003 |
| REQ-001 | AC-003 | los dos botones en profesional | **not_run** | EV-003 |
| REQ-001 | AC-004 | tipos, build y pruebas | **pass** | EV-002 |

## Lo que esta tarea enseña sobre las dos anteriores

Arreglar un control que no hacía nada **no es gratis**: pone en circulación un
estado que antes no existía, y el resto de la pantalla nunca se diseñó
contando con él. El modo guiado llevaba meses funcionando porque la paleta no
se podía ocultar.

La comprobación que faltó en TASK-006 no es «¿el botón hace algo?» sino
«¿dónde más se nota que ahora lo haga?». Aquí eran seis pasos con seis
disposiciones distintas, y ninguno se miró.

## Revisión final

- Cobertura documental: NOT_RUN
- Spec → Código: NOT_VERIFIED
- Código → Spec: NOT_VERIFIED
