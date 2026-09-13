# 0005 · La V45 entra al studio de la app, no al módulo aparcado

**Fecha:** septiembre 2026 · **Estado:** aceptada
**Continúa:** `0003-campaign-studio-aparcado.md`

## Contexto

La rama `feature/campaign-studio` trae la V45 UX V2 del constructor: un solo
commit, 29 archivos, todos dentro de `frontend/campaign-studio/`.

Esa carpeta es la subaplicación Next autónoma que la 0003 dejó aparcada, y
**no entra en el build**: Netlify compila `frontend/` con Vite, que solo
empaqueta `src/`. Fusionar la rama, por tanto, no cambia una sola pantalla
de lo que ve un cliente.

El studio que la aplicación usa de verdad es otro: `frontend/src/studio/`,
el traslado del V31 que se hizo con las migraciones 025-027, con Supabase,
RLS y la sesión real en vez de la de invitado. Nadie lo tocaba desde
entonces.

De ahí que «integrar la V45» sean dos trabajos y no uno. Este documento es
el segundo.

## Decisión

Las mejoras de V45 se portan al studio vivo. El módulo aparcado se queda
donde está, actualizado y sin conectar, con las cinco condiciones de la 0003
igual de pendientes que ayer.

El porte se hizo como **merge de tres vías por archivo** —base el V31
original, «mío» el traslado con sus adaptaciones, «suyo» V45—, que es lo que
convierte las 30 costuras del traslado en algo que se reaplica solo. Fue
posible porque `lib/api.ts` se hizo pasar por `fetch` en su día en vez de
tocar las dieciséis llamadas del editor. Esa decisión se paga hoy: los
módulos de `lib/` venían casi sin divergencia y quedaron 12 conflictos en
9.400 líneas, no doscientos.

## Lo que se queda fuera de V45, y por qué

**El lateral de navegación y la miga de pan.** V45 los reintroduce con su
propia marca y sus cinco espacios. Prospector ya tiene su menú, y meter otro
dentro deja un menú dentro de un menú y el logo de otro producto dentro de
una sección. Es exactamente lo que el traslado quitó; volver a meterlo sería
deshacerlo sin haberlo decidido.

Lo que sí entra de esa navegación es lo que no duplica nada: la paleta de
comandos, el flujo guiado y el paso de **adaptación móvil**, que se añade al
carril de pasos del traslado.

**El tema sobre `<html>` y `<body>`.** V45 estampa ahí la clase
`theme-*`. Fuera del studio está el resto de Prospector, así que eso habría
repintado Campañas, Leads y Mensajes desde una sección. La clase la pone el
shell del studio, y el CSS de los cinco temas cuelga de ahí.

**El selector de cinco temas sí entra.** Está acotado al studio, que es
donde se diseña, y no se escapa.

## Lo que se conserva del traslado contra V45

**El arreglo del pie legal** (044): un enlace del pie se dibuja solo si
tiene texto **y** destino. V45 reescribe 311 líneas de `email-renderer.ts`
y ese arreglo no está en su versión; sin conservarlo volverían «Gestionar
preferencias» apuntando a la baja y una «Política de privacidad» con
`href="#"`. Un enlace legal muerto promete un derecho que no se puede
ejercer, y eso es peor que no ofrecerlo.

**El ajuste de imagen del hero.** El traslado y V45 arreglan el mismo
problema con props distintas: `imageFit` allí, `heroImageFit` aquí. Se
quedan las dos, porque las plantillas ya guardadas de clientes usan la
primera y perderla les cambiaría el aspecto sin avisar. La de V45 pasó a
llamarse `heroLayerFit`: gobierna la capa del hero de composición libre,
que es otra cosa.

**El archivo de plantillas.** V45 lo resuelve con un filtro sobre
`/api/templates?view=all`. Aquí siguen siendo dos listas, porque el archivo
tiene su propia pantalla —restaurar y borrado definitivo— que V45 no trae y
que existe por `compliance.md`: una plantilla que compuso un correo enviado
no se borra.

## El `freeMode = true` de V45

Lo más caro que traía la rama, y no se ve leyendo el diff.

`email-renderer.ts` de V45 tiene `const freeMode = true`: pinta **todo**
hero con capas colocadas a mano, que es la novedad de la versión. Pero eso
no distingue entre un hero nuevo y uno que ya existe, y en la base hay **33
plantillas con hero, ninguna con `heroComposition`** —se guardaron antes de
que esa prop existiera—. Tal cual venía, las 33 cambiaban de aspecto al
abrirlas, sin que nadie lo hubiera pedido.

Se queda condicionado: `freeMode = props.heroComposition === "free"`. Esa
prop no es una conjetura, es la señal que el propio editor escribe cuando el
usuario arrastra una capa o aplica un preset. La composición libre es una
decisión suya, y hasta que la toma el hero se pinta como siempre.

Comprobado después en produccion: **el catalogo Premium tampoco usa la
composicion libre**. No define una sola prop de capas —ni `titleX`, ni
`heroImageX`, ni `freeX`— y V45 no lo toco. Sus plantillas se disenaron con
`overlay` y el texto en su franja, asi que aquel `true` no solo habria
descolocado las 33 guardadas: habria descolocado tambien las mas de cien del
catalogo que la propia V45 presume.

Para que la novedad no quede escondida, el documento en blanco nace ya con
ella: `createBlankDocument` declara `heroComposition: "free"`. V45 era
incoherente en esto —su documento en blanco decía `overlay: true` y el
renderizador lo ignoraba—, y aquí las dos cosas dicen lo mismo.

Lo protege `pruebas-porte/hero-heredado.test.mjs`, que es lo que impide que
ese `true` vuelva en el próximo porte.

## Lo que cambia igualmente en los correos

**V45 exporta dos maquetaciones**, una de escritorio y otra de móvil, y el
correo pasa a llevar las dos con `display:none` cruzados. Medido sobre una
plantilla mínima: de 5.678 a 14.331 caracteres, dos veces y media. Para una
plantilla real conviene mirarlo, porque Gmail recorta lo que pasa de 102 KB
y enseña «[Mensaje recortado]». No se ha medido todavía con una de las que
hay guardadas.

## Estado

- `tsc` limpio y build de producción correcto.
- **49 de 53** pruebas pasan (las 50 de V45 más tres propias del hero
  heredado). Las cuatro que fallan son las adaptaciones de arriba, una por
  una: la sesión de invitado que ya no existe, el adaptador HTTP del
  proyecto Next, el troceado de subida que Storage no necesita, y la clase
  del tema en el shell en vez de en `<html>`. Se ejecutan con
  `npm run test:studio`.
- **Abierto en el navegador con una cuenta real.** El editor monta, el
  carril guiado recorre los seis pasos —el quinto es el de adaptación móvil
  que trae V45—, el tema se queda en el shell y no toca `<html>`, y no hay
  desbordes horizontales.
- **Las 29 plantillas del tenant se renderizan con el código nuevo sin una
  sola excepción, y ninguna pasa a composición libre.** La más pesada son
  33,9 KB con las dos maquetaciones dentro, lejos de los 102 KB a los que
  Gmail recorta. Los dos riesgos que quedaban abiertos están medidos sobre
  datos reales, no sobre un documento de ejemplo.

## El CSS no se porta línea a línea

Quede escrito, porque costó un rato encontrarlo. El primer intento
reconstruyó `estilos-studio.css` insertando las líneas nuevas de V45 una a
una, y eso **sacó de su `@media(max-width:900px)` las reglas del editor
compacto**. Resultado: en un escritorio de 1.280 px la paleta y el inspector
salían con `display:none!important`, el lienzo dejaba de ser una rejilla y
la barra inferior de móvil se quedaba fija sobre el editor.

No lo detectó ninguna prueba —son de contrato, no de estilos— ni el build.
Se vio abriendo la pantalla y preguntándole al DOM qué reglas ganaban.

La forma correcta es aplicar el cambio **como parche**, que conserva los
bloques: `diff -u v31.css v45.css | patch cuerpo.css`, con el bloque de
integración separado antes y añadido después, porque tiene que ser el
último en ganar.

## El scroll horizontal: dos hojas que no se conocian

Encontrado al revisar el studio ya desplegado, y anterior al porte. El
studio esconde sus `input type=file` detras de un boton con la utilidad
`.sr-only`, que deberia dejarlos en 1 px. No lo hacia: salian al 100 % del
panel y, en `position: absolute` sin anclaje, se iban fuera de la pantalla.
El studio arrastraba scroll horizontal por un campo que nadie ve.

El motivo no es la especificidad, es la cascada de capas:

| Regla | Donde vive | Gana |
|---|---|---|
| `input, textarea, select { width: 100% }` de `estilos.css` | fuera de capas | si |
| `.sr-only { width: 1px }` de Tailwind | capa `utilities` | no |

Una declaracion fuera de capas le gana a cualquiera dentro de una, por poca
especificidad que tenga. Es la clase de choque que solo aparece cuando se
mete un proyecto entero dentro de otro, y no lo ve ni el build ni una prueba
de contrato: hay que abrir la pantalla y preguntarle al navegador que regla
manda.

Se arregla redeclarando la utilidad en el bloque de integracion, que tambien
esta fuera de capas, acotada con `.studio` para que no sea un parche global.
Comprobado en produccion antes de subirlo: el ancho computado pasa de
`100%` a `1px`.

## Pendiente

- Diseñar un correo entero con esto delante, de principio a fin. Lo que está
  comprobado es que monta, que respeta lo guardado y que las reglas caen
  donde deben; no que la pantalla se entienda.
- Que un fisioterapeuta —o quien sea— diseñe un correo entero con esto
  antes de darlo por bueno. Las pruebas dicen que el contrato se respeta;
  no dicen que la pantalla se entienda.
