---
type: module-spec
module: studio
status: ready
source_paths:
  - frontend/src/studio/*
  - frontend/src/estilos-studio.css
  - frontend/pruebas-porte/*
last_reviewed: 2026-09-14
---

# Módulo: studio

## Responsabilidad

El editor de correo: el documento, sus bloques, el renderizador a HTML de
email y el asistente que lo genera con IA. Es el módulo con más código
heredado y el único con pruebas.

## Propiedad del código

`frontend/src/studio/` (30 archivos), su hoja de estilo `estilos-studio.css`
—vive en `src/` por el build, pero es suya— y las 9 pruebas de
`frontend/pruebas-porte/`.

## Origen y forma de trabajar

Viene de una aplicación Next autónoma (V31, después V45). Se trasladó con las
migraciones 025-027 y se porta por **merge de tres vías por archivo**: base el
V31 original, «mío» el traslado, «suyo» la versión nueva. Eso es posible
porque `lib/api.ts` se hace pasar por `fetch` en vez de tocar las dieciséis
llamadas del editor.

- **RESTR-STU-001** · El código interno se mantiene **en inglés**. Traducirlo
  convertiría el próximo porte en irreconciliable.
- **RESTR-STU-002** · El CSS **no se porta línea a línea**: se aplica como
  parche. Reconstruirlo saca reglas de su `@media` y ninguna prueba lo detecta
  (`docs/decisiones/0005`).
- **RESTR-STU-003** · Un control portado **no está portado hasta que se
  comprueba que hace algo**. Compilar, montar y aparecer en la barra no es
  funcionar. El porte ya perdió así las paletas de los temas (0005) y la clase
  `mobile-open` de la paleta móvil, y lo volvió a hacer con las clases de
  estado de `.workspace-grid` (TASK-006): tres botones que durante meses
  cambiaban su propio icono y nada más. El patrón es siempre el mismo —el CSS
  se porta entero y quien le pone la clase se queda por el camino—, así que la
  comprobación es medir en el DOM, no leer el diff.

## Interfaces públicas

- `apiFetch(ruta, init)` — el adaptador que se hace pasar por `fetch`.
- `TemplateDocument v1` — el contrato del documento, validado por un esquema
  zod **`.strict()`**: no admite campos nuevos.
- `renderEmailHtml(doc, asunto, preencabezado, mergeData)` — el único sitio
  donde se compone el HTML del correo.

## Invariantes de dominio

- **INV-STU-001** · El documento cumple `TemplateDocument v1`. Un campo nuevo
  no cabe: la dirección de arte aterriza en `settings`, `creative` y props de
  bloque.
- **INV-STU-002** · `freeMode = props.heroComposition === "free"`. V45 lo traía
  en `true` fijo, y eso habría cambiado el aspecto de las 33 plantillas
  guardadas y del catálogo entero sin que nadie lo pidiera. Lo protege
  `pruebas-porte/hero-heredado.test.mjs`.
- **INV-STU-003** · Nada migra lo ya guardado. Reescribir documentos de
  clientes sin pedirlo es el error documentado en la 0005.
- **INV-STU-004** · El HTML guardado se calcula aquí, no lo manda el editor:
  lo que se envía no puede depender de volver a renderizar algo que entretanto
  ha cambiado.
- **INV-STU-005** · El correo se firma con los datos reales del cliente. Las
  `lead.*` se quedan de ejemplo —el destinatario de una vista previa no existe
  todavía—; lo que no puede mentir es la firma.
- **INV-STU-006** · El logo viaja como `{{brand.logo_url}}`, no como URL
  pegada: así una plantilla guardada sigue al logo de la cuenta.
- **INV-STU-007** · En el modo simple no hay catálogo. Los bloques salen de
  `createBlock` y solo se tocan las props que se nombran.
- **INV-STU-008** · Un hueco que el redactor deja se queda sin bloque, no con
  relleno determinista.
- **INV-STU-009** · Aplicar una plantilla del catálogo **trae su imagen**,
  generada con el prompt que esa receta ya lleva escrito para su sector. Las
  100 recetas nacen con `thumbnail: ""`, así que sin generarla el catálogo
  entero se ve vacío (TASK-003).
- **INV-STU-010** · Un visual generado se reutiliza dentro de la sesión,
  indexado por receta. Navegar por la biblioteca no puede costar una imagen de
  pago por clic, y hay una opción explícita para aplicar sin generar.
- **INV-STU-011** · Un fallo al generar la imagen **no** cancela la
  aplicación de la plantilla: el texto y el diseño sirven sin imagen.

## Dependencias

`datos` (plantillas, recursos, kits de marca), `inteligencia`
(`componer-campana`, `generar-imagen`, `studio-ia`), `app-web` (sesión y
variables de tema).

## Pruebas y verificación

`cd frontend && npm run test:studio`

**VERIFIED en `98f80dc`: 75 pruebas, 71 pasan, 4 fallan.**

Los 4 fallos son **de contrato con el proyecto de origen** y están explicados
uno por uno en `docs/decisiones/0005`:

| Prueba | Por qué falla |
|---|---|
| `accepts isolated anonymous browser sessions` | aquí no hay sesión de invitado |
| `keeps upload chunks safely below the request limit` | Storage no necesita el troceado de subida |
| `reference HTTP adapter keeps authorization server-side` | el adaptador es del proyecto Next |
| `all application themes reach portalled dialogs` | la clase del tema va en el shell, no en `<html>` |

Son deliberados. Un fallo **distinto de estos cuatro** bloquea.

## Rendimiento y operación

Desde V45 el correo exporta **dos maquetaciones** con `display:none` cruzados.
Medido: de 5.678 a 14.331 caracteres en una plantilla mínima. La más pesada de
las guardadas son 33,9 KB, lejos de los 102 KB a los que Gmail recorta.

## Incertidumbres y deuda conocidas

- **OBSERVED** · El camino avanzado del asistente sigue usando el catálogo y
  conserva sus defectos: mayúsculas, antetítulo heredado y etiqueta de
  categoría. Arreglarlo es un trabajo aparte.
  El cuarto —el hueco sin imagen— lo resuelve TASK-003 **solo al aplicar
  desde la Biblioteca**; el asistente avanzado depende de su propio
  interruptor «generar visual».
- **OBSERVED** · Seis textos de la aplicación quedan por debajo de 4.5:1
  dentro del studio, medidos en `docs/decisiones/0005`; son colores de la
  aplicación y afectan a más pantallas.
- **UNKNOWN** · Nadie ha diseñado un correo entero de principio a fin y lo ha
  enviado a una bandeja real.
- **UNKNOWN** · TASK-006 arregló los tres botones que no hacían nada, pero
  **nadie ha repasado los demás controles de la barra y del inspector** con la
  misma pregunta: ¿hace algo? Tres de tres estaban rotos en el único sitio
  donde se miró, lo que no invita a suponer que el resto esté bien.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.
- 2026-09-14 · TASK-003: aplicar una plantilla del catálogo trae su imagen.
  Invariantes 009 a 011.
- 2026-09-15 · TASK-006: «Bloques y capas», «Propiedades» y «Mostrar controles
  avanzados» vuelven a hacer algo. Se repone la expresión de clases de
  `.workspace-grid` que el porte de la V45 perdió. Nace RESTR-STU-003.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| 71 de 75 pruebas pasan | VERIFIED | `npm run test:studio`, `98f80dc` | 4 fallos conocidos |
| Los 4 fallos son los del porte | OBSERVED | `docs/decisiones/0005` | — |
| El lienzo desaparecía entre 901 y 1240 px | VERIFIED | medición a 960 px | canvas 0 px, corregido |
| Ninguna plantilla guardada pasa a composición libre | VERIFIED | 29 plantillas del tenant | 0 con `heroComposition` |
| Las 100 del catálogo se renderizaban sin imagen | VERIFIED | construidas y renderizadas, `c7f0248` | 100 de 100 sin imagen |
