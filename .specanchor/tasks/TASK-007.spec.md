---
type: task-spec
id: TASK-007
status: in_progress
created: 2026-09-15
modules: [studio]
behavior_preserving: false
---

# Tarea: «controles avanzados» funcionaba y aun así no se notaba

## Petición, alcance y comportamiento actual

Miguel, después de TASK-006: «el botón Ocultar / Mostrar controles avanzados
sigue sin hacer nada».

Tenía razón, y TASK-006 no lo vio por un fallo **de verificación**, no de
código: se midió con los dos paneles plegados, así que se comprobó que la
clase se aplica y que esos elementos pasan a `display: none` — dentro de un
panel que ya estaba oculto. Se probó el mecanismo, no lo que ve una persona.

### Lo que pasa de verdad, medido con los paneles abiertos

El interruptor **funciona**:

| | `.global-layer-controls` | `.hero-free-controls` | contenido del inspector |
|---|---|---|---|
| visible | `grid` · 322×503 | `grid` · 322×823 | **4194 px** |
| oculto | `none` · 0×0 | `none` · 0×0 | **2869 px** |

Un tercio menos de panel. Pero:

| Elemento | Posición | ¿En pantalla? |
|---|---|---|
| `.hero-free-controls` | `y = 1191` | **no** |
| `.global-layer-controls` | `y = 2014` | **no** |

Con una ventana de **911 px** de alto, los dos están a más de mil píxeles de
scroll por debajo del pliegue, dentro del área desplazable del inspector. Se
pulsa el botón y no cambia nada de lo que se está mirando.

**Un control cuyo efecto no se percibe es, para quien lo usa, un control que no
hace nada.** Que el DOM diga lo contrario no es un argumento: es justo el tipo
de razonamiento que RESTR-STU-003 existe para frenar.

## Resultado deseado y aceptación

- **TASK-007/REQ-001** · Al pulsarlo, se percibe qué ha pasado sin tener que
  buscarlo.

- **TASK-007/AC-001** · Al **encender**, la vista se desplaza hasta el primer
  grupo avanzado, que queda dentro de la ventana.
- **TASK-007/AC-002** · En los dos sentidos aparece un aviso que dice qué ha
  cambiado.
- **TASK-007/AC-003** · El comportamiento de TASK-006 no se toca: la clase
  sigue alternando y el contenido del inspector sigue encogiendo.
- **TASK-007/AC-004** · `tsc`, `build` y pruebas sin fallos nuevos.

## Anclas afectadas y justificación del impacto

`modules/studio.spec.md`. Clasificación **contract** sobre `StudioClient.tsx`:
cambia el comportamiento visible de un control. No toca el documento de
plantilla ni el renderizador.

## Decisiones

- **DEC-001** · Avisar **y** desplazar, no solo una de las dos. El aviso
  explica lo que ha pasado; el desplazamiento enseña lo que se acaba de
  descubrir, que si no hay que ir a buscarlo a mil píxeles de scroll. Al
  apagar no hay a dónde desplazarse, así que solo queda el aviso.
- **DEC-002** · `globalThis.document`, no `document`: dentro del componente
  `document` es el `TemplateDocument` que se está editando. Lo cazó `tsc`
  —«Property 'querySelector' does not exist on type 'TemplateDocument'»— y
  queda escrito porque es una trampa que volverá a aparecer.
- **DEC-005** · `behavior: "auto"` y no `"smooth"`. **El motivo que se dio era
  falso** —ver EV-010—, pero el `auto` se queda: funciona en todos los casos en
  los que funciona el suave y en algunos más, y volver a desplegar para
  recuperar una animación es gastar un despliegue en estética mientras queda
  algo sin verificar.
- **DEC-004** · Se espera al **fotograma**, no al reloj:
  `requestAnimationFrame` con reintentos y comprobando `offsetParent !== null`
  antes de desplazar. Un `setTimeout` con un número elegido a ojo es una
  carrera que se gana o se pierde según la máquina, y cuando se pierde no da
  ningún error: simplemente no pasa nada. Que es, otra vez, el fallo del que
  viene esta tarea.
- **DEC-003** · No se reordena el inspector para subir los grupos avanzados.
  Sería un cambio de disposición mucho mayor, afecta a pantallas que nadie ha
  pedido tocar, y la pregunta de si esos cuatro grupos están en el sitio
  correcto merece decidirse sola, no de rebote en un arreglo.

## Evidencia

- **EV-001** · Con los paneles abiertos, en producción, revisión `92b6686`:
  `.global-layer-controls` 322×503 → `none` 0×0 y `.hero-free-controls`
  322×823 → `none` 0×0 al pulsar, y de vuelta al volver a pulsar. El
  interruptor de TASK-006 funciona.
- **EV-002** · El contenedor desplazable del inspector pasa de **4194 px** a
  **2869 px** de contenido y vuelve. Un 32 % menos de panel.
- **EV-003** · Posición de los dos grupos: `y = 1191` y `y = 2014`, con
  `innerHeight = 911`. `dentroDelViewport: false` en ambos. Ninguno de los dos
  está en pantalla cuando se pulsa el botón. Los otros dos —
  `.global-look-controls` y `.button-depth-grid`— ni siquiera estaban montados:
  dependen de qué haya seleccionado.
- **EV-004** · `npx tsc -b --force` salida 0, `npm run build` salida 0,
  `node scripts/pruebas-del-studio.mjs` salida 0 · 71/4 · sin fallos nuevos.
- **EV-005** · Medición tras el primer despliegue. **Los avisos, bien; el
  desplazamiento, no.** Al encender, el grupo seguía en `y = 1191`,
  `dentroDeLaVentana: false`. AC-002 pass, AC-001 **fail**.
- **EV-006** · Diagnóstico del fallo, en la misma pantalla: el mismo
  `scrollIntoView`, llamado sobre el elemento **ya visible**, lo lleva de
  `y = 1191` a `y = 134` y el contenedor de `scrollTop` 0 a 930. O sea que la
  llamada es correcta y el problema era **cuándo**: a los 80 ms React todavía
  no había pintado, el grupo seguía en `display: none`, y un elemento oculto no
  se deja desplazar — `scrollIntoView` se lo traga sin decir nada.
- **EV-007** · Con la espera al fotograma, **seguía sin desplazarse**:
  `grupoY = 1191`, fuera de la ventana. Los avisos, bien.
- **EV-008** · La causa, aislada en producción sobre ese mismo contenedor:

  | Llamada | `scrollTop` | `y` del grupo |
  |---|---|---|
  | `scrollIntoView({ behavior: "smooth" })` | **0** | 1191 |
  | `scrollIntoView({ behavior: "auto" })` | **930** | **134** |

  ⚠️ **Esta conclusión era falsa, y la medición también.** Ver EV-010.
- **EV-009** · Con `behavior: "auto"`, **tampoco**: `scrollTop` se quedó en 0
  durante 2,5 s completos, muestreado a 50, 120, 250, 500, 900, 1500 y 2500 ms,
  con `offsetParent` ya válido a los 50 ms.

- **EV-010** · **El fallo estaba en el instrumento, no en el código.** La
  pestaña desde la que se medía estaba en segundo plano:

  ```
  document.visibilityState : "hidden"
  document.hasFocus()      : false
  requestAnimationFrame    : NO se ejecutó en 1200 ms
  ```

  Chrome **suspende `requestAnimationFrame` y el desplazamiento suave en las
  pestañas ocultas**. Eso invalida dos conclusiones anteriores de esta misma
  tarea:

  | Lo que se concluyó | Qué pasaba en realidad |
  |---|---|
  | «`smooth` se ignora en ese contenedor» (EV-008) | Se medía con la pestaña oculta, donde el scroll suave tampoco corre |
  | «con la espera al fotograma sigue sin desplazarse» (EV-007, EV-009) | El `requestAnimationFrame` del propio código **nunca llegó a ejecutarse** |

  Cuando quien pulsa el botón es una persona, su pestaña está en primer plano
  y el `rAF` sí corre. **AC-001 queda UNKNOWN**: no se ha demostrado ni que
  funcione ni que no.

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | posición del primer grupo respecto a la ventana tras encender | **not_run** · **no medible desde aquí**: la pestaña de medición está oculta y ahí no corre `requestAnimationFrame` | EV-010 |
| REQ-001 | AC-002 | presencia del aviso en los dos sentidos | **pass** | EV-005 |
| REQ-001 | AC-003 | clase y alto del contenido del inspector | **pass** | EV-001, EV-002 |
| REQ-001 | AC-004 | tipos, build y pruebas | **pass** | EV-004 |

## La leccion cara de esta tarea

**Un instrumento que no se comprueba miente igual que un código que no se
prueba.** Tres veces se midió «no pasa nada» y se sacó una conclusión sobre el
código; la tercera vez lo que no pasaba nada era en el navegador de medición,
por estar en segundo plano.

Antes de concluir que algo **no** ocurre, hay que comprobar que el entorno de
medición puede observar que ocurra: `document.visibilityState`,
`document.hasFocus()` y, si se depende de él, que `requestAnimationFrame`
dispare. Un negativo sin esa comprobación no es un resultado.

## Lo que esta tarea deja dicho para la próxima

La lección no es «faltaba un toast». Es que **medir el DOM no es medir lo que
ve una persona**: un elemento puede estar en `display: none` y otro en `grid`
sin que ninguno de los dos esté en pantalla. Cuando lo que se verifica es un
control de interfaz, la comprobación tiene que incluir **dónde cae en la
ventana**, no solo qué dice `getComputedStyle`.

## Revisión final

- Cobertura documental: NOT_RUN
- Spec → Código: NOT_VERIFIED
- Código → Spec: NOT_VERIFIED
