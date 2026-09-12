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

## Estado

- `tsc` limpio y build de producción correcto.
- **46 de 50** pruebas de V45 pasan contra los módulos portados. Las cuatro
  que fallan son las adaptaciones de arriba, una por una: la sesión de
  invitado que ya no existe, el adaptador HTTP del proyecto Next, el
  troceado de subida que Storage no necesita, y la clase del tema en el
  shell en vez de en `<html>`. Se ejecutan con `npm run test:studio`.
- **No se ha abierto el studio en un navegador con sesión.** Compila, monta
  y no rompe nada de lo que las pruebas cubren; que el editor se vea bien es
  otra cosa y todavía está sin comprobar.

## Pendiente

- Mirarlo con una cuenta real: abrir una plantilla guardada de antes y
  comprobar que se ve como se veía. El riesgo conocido está en el hero —V45
  cambia el defecto `overlay` de `true` a `false` y estrena composición
  libre—, y las plantillas del V31 no llevan esos campos.
- Que un fisioterapeuta —o quien sea— diseñe un correo entero con esto
  antes de darlo por bueno. Las pruebas dicen que el contrato se respeta;
  no dicen que la pantalla se entienda.
