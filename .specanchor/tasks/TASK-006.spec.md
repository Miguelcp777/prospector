---
type: task-spec
id: TASK-006
status: in_progress
created: 2026-09-15
modules: [studio]
behavior_preserving: false
---

# Tarea: los tres botones de la barra del editor no hacían nada

## Petición, alcance y comportamiento actual

Miguel, sobre la sección Plantillas: «los botones siguientes no hacen nada —
Bloques y Capas, Propiedades, Mostrar controles avanzados».

Tiene razón, y el fallo es exacto. Los tres estados existen, los tres
`onClick` los cambian, y **nadie más los lee**:

| Botón | Estado | Quién lo consume hoy |
|---|---|---|
| Bloques y capas | `leftPanelOpen` | solo el icono del propio botón |
| Propiedades | `rightPanelOpen` | solo el icono del propio botón |
| Mostrar controles avanzados | `advancedControlsOpen` | solo el texto del propio botón |

VERIFIED · `grep` completo de `StudioClient.tsx`: cada uno aparece dos veces,
en su `useState` y en su botón. En ninguna otra línea.

### Es una regresión del porte, y el original está a mano

La V45 aparcada (`frontend/campaign-studio/app/studio-client.tsx:4024`) lo
tiene cableado:

```tsx
<section className={`workspace-grid ... ${leftPanelOpen ? "" : "left-collapsed"} ${rightPanelOpen ? "" : "right-collapsed"} ${advancedControlsOpen || experienceMode === "professional" ? "show-advanced" : "hide-advanced"}`}>
```

El studio vivo tiene `<section className="workspace-grid">`. **La expresión de
clases se perdió al portar.** El CSS que la escucha sí se portó entero y lleva
meses esperando una clase que nadie le pone:
`estilos-studio.css:554-555` (`.left-collapsed`, `.right-collapsed`) y `:557`
(`.hide-advanced`).

Es el mismo fallo que la 0005 documenta con el selector de temas: *«una pieza
de interfaz no está portada hasta que se comprueba que hace algo»*. Compilar,
montar y aparecer en la barra no es funcionar.

### Medido en producción antes de tocar nada

Con la sesión real, 1920 px, pulsando los tres botones:

| | `className` de `.workspace-grid` | columnas | paleta | inspector |
|---|---|---|---|---|
| antes | `workspace-grid` | `290px 1022px 360px` | visible 290px | visible 360px |
| tras «Bloques y capas» | `workspace-grid` | `290px 1022px 360px` | visible 290px | visible 360px |
| tras «Propiedades» | `workspace-grid` | `290px 1022px 360px` | visible 290px | visible 360px |
| tras «avanzados» | `workspace-grid` | `290px 1022px 360px` | visible 290px | visible 360px |

Y `.global-layer-controls` / `.hero-free-controls` en `display: grid` antes y
después. Ni una sola cosa cambia.

## Resultado deseado y aceptación

- **TASK-006/REQ-001** · Los tres botones cambian lo que su etiqueta promete.
- **TASK-006/REQ-002** · Nada que hoy se vea desaparece sin que se pida.

- **TASK-006/AC-001** · Con las clases puestas, la paleta y el inspector se
  pliegan a 0 px y el lienzo se queda el hueco; `hide-advanced` oculta los
  cuatro grupos avanzados.
- **TASK-006/AC-002** · Pulsando los botones en la aplicación desplegada,
  `.workspace-grid` gana y pierde las clases, y los anchos medidos cambian en
  consecuencia.
- **TASK-006/AC-003** · Al abrir el editor, los controles avanzados se ven
  igual que antes de este cambio.
- **TASK-006/AC-004** · `tsc`, `build` y las pruebas del studio sin fallos
  nuevos.

## Anclas afectadas y justificación del impacto

`modules/studio.spec.md`. Clasificación: **contract** sobre
`StudioClient.tsx` — el comportamiento visible de tres controles cambia de
«nada» a «lo que dicen». No toca el documento de plantilla, ni el
renderizador, ni una sola llamada a la base: es CSS gobernado por estado que
ya existía.

## Decisiones

- **DEC-001** · `advancedControlsOpen` arranca en **`true`**, no en `false`
  como la V45. Hasta hoy el botón no hacía nada, así que esos controles
  estaban **siempre** a la vista; cablearlo con `false` los habría hecho
  desaparecer de golpe a quien lleva semanas usándolos, sin que nadie lo
  pidiera. Es la lección de la 0005 con el `freeMode = true`: un cambio de
  aspecto que nadie ha pedido es un fallo, por mucho que el código nuevo sea
  el correcto. El botón funciona en los dos sentidos y la pantalla se ve igual
  que ayer.
- **DEC-003** · La clase de avanzados **no mira `experienceMode`**, y la V45 sí
  lo miraba. Se cae el `|| experienceMode === "professional"`: con él, en modo
  profesional el botón no puede hacer nada nunca. El modo decide cómo
  **empieza** el editor; el clic decide cómo se **queda**. Un botón que no
  puede hacer nada es peor que un valor por defecto que se puede cambiar, y
  esta vez el original no sirve de guía porque el original es el que está mal.
  Consecuencia asumida: cambiar de modo guiado a profesional ya no vuelve a
  enseñar los avanzados si el usuario los había ocultado. Su decisión manda.
- **DEC-002** · El `workspace-hidden` de la V45 **no se porta**. Depende de
  `mainSpace`, que aquí está declarado como `const [, setMainSpace]` —se
  escribe y no se lee— porque el espacio de inicio lo resuelve `start-hub`.
  Portarlo sería traer una clase que nada activaría: exactamente el fallo que
  esta tarea arregla.

## Evidencia

- **EV-001** · Inventario de usos en `StudioClient.tsx`: `leftPanelOpen` en
  las líneas 1578 y 4180, `rightPanelOpen` en 1579 y 4187,
  `advancedControlsOpen` en 1581 y 4194. Ninguna otra.
- **EV-002** · Medición en producción con la sesión real, **antes** del
  cambio: los tres botones dejan `.workspace-grid` intacto y las columnas en
  `290px 1022px 360px`. Tabla completa arriba.
- **EV-003** · Con las clases inyectadas a mano en esa misma pantalla, el CSS
  responde entero: `left-collapsed` → paleta `hidden / 0px` y lienzo 1022 →
  **1312 px**; `right-collapsed` → inspector `hidden / 0px` y lienzo **1382
  px**; las dos → lienzo **1672 px**; `hide-advanced` →
  `.global-layer-controls` y `.hero-free-controls` de `grid` a **`none`**;
  y al quitarlas, todo vuelve. El CSS estaba sano; faltaba quien le pusiera
  la clase.
- **EV-004** · `npx tsc -b --force` salida 0, `npm run build` salida 0,
  `node scripts/pruebas-del-studio.mjs` salida 0 · `Pasan 71 · fallan 4 ·
  conocidos 4 · Sin fallos nuevos`.
- **EV-005** · Medición en la aplicación desplegada después del primer arreglo,
  mismo guion que EV-002. **Dos de tres botones, arreglados**:

  | Acción | `className` | columnas | paleta | inspector |
  |---|---|---|---|---|
  | al abrir | `workspace-grid show-advanced` | `290px 1022px 360px` | visible 290px | visible 360px |
  | «Bloques y capas» | `… left-collapsed …` | `0px 1312px 360px` | **hidden 0px** | visible 360px |
  | «Propiedades» | `… left-collapsed right-collapsed …` | `0px 1672px 0px` | hidden 0px | **hidden 0px** |
  | volver a pulsar los dos | `workspace-grid show-advanced` | `290px 1022px 360px` | visible 290px | visible 360px |

  Y los controles avanzados a la vista al abrir, como antes del cambio: AC-003
  **pass**.

- **EV-006** · **El de avanzados seguía sin hacer nada, y solo se vio midiendo
  en vivo.** Al pulsarlo, la etiqueta cambiaba a «Mostrar controles avanzados»
  pero la clase se quedaba en `show-advanced` y `.global-layer-controls`
  seguía en `display: grid`.

  La causa: el shell decía `mode-professional`, y la expresión de la V45 es
  `advancedControlsOpen || experienceMode === "professional"`. En modo
  profesional esa condición es **siempre verdadera**, así que el botón es
  inerte por diseño — mientras sigue dibujándose y cambiando su propia
  etiqueta. Es exactamente el fallo del que venía la petición, escrito en el
  original.

- **EV-007** · *(pendiente)* Medición del botón de avanzados tras el segundo
  despliegue.

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | clases inyectadas en el DOM de producción | **pass** | EV-003 |
| REQ-001 | AC-002 | pulsar los tres botones tras desplegar | **not_run** · dos de tres medidos | EV-005, EV-006, EV-007 |
| REQ-002 | AC-003 | estado inicial de los controles avanzados | **pass** | EV-005 |
| REQ-001 | AC-004 | tipos, build y pruebas | **pass** | EV-004 |

## Lo que enseñó el primer despliegue

Que el guard tuviera razón. Se cerró la tarea con dos criterios en `not_run`,
el CI lo puso en rojo, y al medir en vivo apareció que **uno de los tres
botones seguía roto por un motivo distinto** — uno que no se ve leyendo el
diff, porque depende de en qué modo tenga el editor quien lo usa.

Si esto se hubiera dado por bueno con el código compilando y las pruebas en
verde, Miguel habría vuelto a decir que el botón no hace nada. Es el mismo
argumento de RESTR-STU-003, cobrándose su primera pieza el mismo día que se
escribió.

## Por qué esta tarea se queda abierta

AC-002 y AC-003 solo se pueden medir **con una sesión de cliente en la
aplicación desplegada**: el preview local redirige a la pantalla de entrada y
no hay forma de entrar sin una contraseña, que no es mía. Así que se despliega
y se mide después, que es lo que este proyecto lleva haciendo desde el primer
README por no tener entorno de pruebas.

Mientras tanto la trazabilidad dice `not_run`, no `pass`. Eso hará que el
trabajo `contratos` del CI salga **en rojo** en la pull request, y está bien
que salga: el guard se está negando a certificar algo que todavía no se ha
comprobado. Se cierra con la medición, no antes.

## Revisión final

- Cobertura documental: NOT_RUN
- Spec → Código: NOT_VERIFIED
- Código → Spec: NOT_VERIFIED
