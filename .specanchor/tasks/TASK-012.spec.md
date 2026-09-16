---
type: task-lite
id: TASK-012
status: verified
created: 2026-09-16
modules: [app-web]
behavior_preserving: false
---

# Tarea: la sesión sube a la cabecera del lateral

## Petición

Miguel, con una captura del lateral: «quiero que el nombre de usuario, el
saludo, el nombre de la empresa y demás información salga arriba del todo,
debajo del logo, queda mal aquí visualmente».

## Comportamiento actual

La tarjeta de sesión —punto verde, «Conectado», la insignia de administrador,
el saludo, el nombre y la empresa— vivía al final del lateral, entre el menú y
los dos botones de servicio: «Modo claro» y «Salir».

Ahí se lee como uno más de esos dos, y no lo es: no es una acción, es la
respuesta a «¿con qué cuenta estoy?». Esa pregunta se hace al llegar, no al
irse. Con tres campañas de dos empresas distintas en la misma cuenta, además,
es lo primero que hay que poder mirar.

## Qué cambia

`Conectado` pasa a ir justo debajo de `.marca`. `.sesion` pierde su
`margin-top: auto` —era lo que lo empujaba al fondo— y gana separación por
abajo respecto al menú. `.marca` baja su relleno inferior de 32 a 16 px: esos
32 separaban el logotipo del menú, pero ahora lo que va debajo es la tarjeta
de sesión, que es de la misma cabecera, y con 32 se despegaba del logotipo y
parecía la primera entrada del menú.

Los dos botones de servicio se envuelven en `.lateral-pie`, que se queda con
el `margin-top: auto`. **Es la parte que no es evidente:** el hueco lo tiene
que empujar el par entero. Con el `auto` en uno solo de los dos, el otro se
queda flotando en mitad de la barra; con el `auto` en los dos, el hueco libre
se reparte entre ambos y salen dos espacios donde tiene que haber uno. Eso
segundo es exactamente lo que pasaba antes entre `.sesion` y `.nav-fin`, y por
eso existía la regla `.sesion ~ .nav-fin { margin-top: 0 }`, que esto
sustituye por algo que dice lo que quiere decir.

## Y un fallo que apareció al medir, anterior a esto

`.lateral` es `height: 100vh` con `overflow-y: visible`, y su contenido mide
**934 px**. En una ventana más baja que eso —un portátil de 768, o cualquiera
con barras— pasan dos cosas seguidas: primero los botones se aplastan por
`flex-shrink`, y cuando ya no pueden más, **«Salir» y el logotipo del pie se
salen de la pantalla sin nada que permita alcanzarlos**.

No lo causa este cambio; este cambio lo destapó, porque obligó a mirar cómo se
reparte la altura. Se arregla con `overflow-y: auto` en la misma regla que ya
había que tocar. Entra aquí y no en un hallazgo aparte porque es la misma
propiedad, del mismo elemento, en el mismo cambio: anotarlo para después
habría sido dejar «Salir» inalcanzable a sabiendas.

## Aceptación

- **TASK-012/AC-001** · La tarjeta de sesión se dibuja entre el logotipo y la
  primera entrada del menú.
- **TASK-012/AC-002** · «Modo claro» y «Salir» siguen juntos y al fondo, sin
  hueco entre ellos.
- **TASK-012/AC-003** · Con la ventana más baja que el contenido del lateral,
  «Salir» se puede alcanzar.

## Evidencia

- **EV-001** · Ensayo sobre la página real en producción antes de escribir
  nada: mover el nodo, envolver el par y aplicar el CSS en caliente, y mirar.
  La tarjeta queda bajo el logotipo y el menú empieza justo debajo. Es
  inspección, no implementación: una recarga lo deshace.
- **EV-002** · Medido en la producción **sin** el cambio, neutralizando los
  márgenes automáticos con `height: auto`:

  ```
  alto intrínseco del lateral: 934 px · overflow-y: visible
  ```

  Con la ventana a 744 px, `Salir` caía en 828: **84 px por debajo del corte**,
  sin barra de desplazamiento.
- **EV-003** · Con el cambio y la altura forzada a 700 px para simular un
  portátil bajo: `contenido 931 · visible 700 · puede scrollear: true ·
  Salir alcanzable: true`. Comprobado también en la captura, con el pie y el
  logotipo de Aurevanta a la vista tras bajar.
- **EV-004** · `npx tsc -b --force` → 0. `npm run build` → correcto.
  Pruebas del studio sin fallos nuevos; importación 31 de 31.

## Trazabilidad

| Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|
| AC-001 | Ensayo en caliente sobre producción, mirado en pantalla | **pass** | EV-001 |
| AC-002 | `.lateral-pie` con el `auto`, el par medido junto al fondo | **pass** | EV-001, EV-003 |
| AC-003 | Altura forzada a 700 px: scroll y `Salir` alcanzable | **pass** | EV-002, EV-003 |

## Revisión final

- Cobertura documental: **PASS**.
- Spec → Código: **ALIGNED** — nace `INV-WEB-011` con el fallo del alto fija.
- Código → Spec: **ALIGNED**.

## La corrección: las reglas móviles no ganaban

Encontrado al mirar el CSS ya empaquetado después de desplegar, y era **un
fallo mío de esta misma tarea**.

Las adaptaciones de `.lateral-pie` y `.sesion` se escribieron dentro del
bloque `@media (max-width: 860px)` de la línea 238, que está **muy por encima**
de sus reglas base —`.sesion` en la 767 y `.lateral-pie` en la 821—. Una media
query **no añade especificidad**: a igual selector gana la que aparece más
tarde en el archivo. Así que por debajo de 860 px las reglas base pisaban a
las móviles y el pie salía en columna, y empujado hacia abajo, dentro de una
barra horizontal.

Es la misma familia de error que el ADR 0005 ya documenta —«el CSS no se porta
línea a línea»— y no lo ve el build, ni `tsc`, ni una prueba de contrato. Se
ve **leyendo el paquete**, que es donde se encontró:

```
antes:    .lateral-pie{flex-direction:row…}      @ 4494    ← móvil, y pierde
          .lateral-pie{flex-direction:column…}   @ 18438   ← base, y gana

después:  .lateral-pie{flex-direction:column…}   @ 18352   ← base
          .lateral-pie{flex-direction:row…}      @ 18481   ← móvil, y gana
          .sesion{margin-bottom:0}               @ 18543
```

Las dos reglas se mudan a su propio `@media` al final, junto a las bases que
corrigen. `.nav-fin` se queda arriba porque **su** base está en la línea 224,
antes del bloque, y ahí el orden ya era el bueno.

- **EV-005** · El orden en el paquete, comprobado sobre el CSS construido y
  citado arriba. Es lo que estaba roto y es lo que queda demostrado.

## Lo que queda por mirar

La barra horizontal **vista en pantalla** por debajo de 860 px. El orden de
las reglas está demostrado; que el resultado se vea bien, no. Hace falta una
ventana estrecha con sesión, y el navegador donde la hay no se puede
redimensionar desde aquí.
