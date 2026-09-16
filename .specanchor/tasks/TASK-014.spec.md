---
type: task-lite
id: TASK-014
status: verified
created: 2026-09-16
modules: [app-web]
behavior_preserving: false
---

# Tarea: una sola columna de iconos en el lateral

## Petición

Miguel, con una captura del lateral entero: «alinea esta columna, está
desalineada».

## Lo que estaba pasando, medido

El lateral tenía **dos columnas de iconos**, no una. Medido sobre la pantalla,
el borde izquierdo de cada icono:

| Bloque | Icono en |
|---|---|
| Logotipo | 24 |
| Punto de la sesión | 25 |
| Cabeceras de grupo · `PROSPECCIÓN`, `EMAIL MARKETING` | 24 |
| **Hijos de un grupo** · Campañas, Listas, Leads, Plantillas… | **55** |
| Sueltas · Incidencias, Cuenta, Panel, Modo claro, Salir | 24 |

**31 px de diferencia entre destinos que hacen exactamente lo mismo**: pulsar
y navegar. Y lo que salta a la vista no es la jerarquía, es que el bloque de
abajo empieza en otro sitio que el de en medio.

Lo pone `.nav-grupo-hijos`: `margin-left: calc(12px + 9px)`, `padding-left:
9px` y un `border-left` de guía. 21 + 9 + 1 = 31.

## El CSS ya se contradecía consigo mismo

Las dos intenciones estaban escritas, una al lado de la otra, y solo se
cumplía una:

- `.nav-grupo-icono`, línea 706: *«Misma columna que los iconos de las
  entradas: el lateral entero se lee como una sola rejilla»*.
- `.nav-grupo-hijos`, línea 713: *«Los hijos se sangran y llevan una guía»*.

La sangría gana, así que la rejilla única nunca existió. Esta tarea resuelve
el empate a favor de la primera, que es la que Miguel ha pedido mirando la
pantalla.

## Qué se pierde, y por qué se acepta

La guía servía para que **plegar un grupo se leyera como jerarquía** y no como
que aparecen y desaparecen cosas. Es un argumento bueno y se pierde.

Lo siguen diciendo la cabecera del grupo —versalitas, apagada, claramente una
etiqueta y no un destino— y su flecha de plegado. Y no se pueden tener las dos
cosas: la guía **ocupa sitio**, y el sitio que ocupa es justo el que rompe la
columna. Dibujarla sin ocupar sitio la dejaría a 10 px del icono, pegada al
borde del lateral, que es peor que no tenerla.

## Aceptación

- **TASK-014/AC-001** · Todos los iconos del lateral —cabeceras de grupo,
  hijos y sueltas— comparten una única columna.

## Evidencia

- **EV-001** · Ensayo en caliente sobre la producción real antes de tocar
  nada, quitando margen, relleno y borde y recontando las columnas:

  ```
  antes:   columnas de iconos [24, 55]  · 2
  después: columnas de iconos [24]      · 1
  ```

- **EV-002** · `npx tsc -b --force` → 0. `npm run build` → correcto. Pruebas
  del studio sin fallos nuevos. `test:importacion` **34 de 34**.
- **EV-003** · **En producción**, con la hoja servida comprobada antes
  (`index-UY_FJqqE.css`, el mismo hash del build local):

  ```
  entradas del lateral: 14 · columnas distintas: [24] · 1
  ```

  Las catorce —dos cabeceras de grupo, siete hijos y cinco sueltas— en el
  mismo borde izquierdo.

## Trazabilidad

| Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|
| AC-001 | Recuento de columnas distintas sobre la pantalla real | **pass** | EV-001 |
| AC-001 | Lo mismo ya desplegado, sobre las 14 entradas | **pass** · VERIFIED | EV-003 |

## Lo que queda fuera, y se dice

El **texto** del logotipo empieza en 66 y el de las entradas en 54, porque el
isotipo mide 30 px y los iconos 18. No se toca: es un título, no una fila de
navegación, y su icono sí está en la columna. Bajarlo a 18 px encogería la
marca; sacar el logotipo a 12 lo descolocaría a él. Queda medido por si algún
día molesta.

## Revisión final

- Cobertura documental: **PASS**.
- Spec → Código: **ALIGNED** — `INV-WEB-014` dice lo que la pantalla hace, y
  dice también qué se sacrificó para conseguirlo.
- Código → Spec: **ALIGNED**. El comentario de `.nav-grupo-hijos` ya no
  promete una sangría que no existe, y el de `.nav-grupo-icono` ya no promete
  una rejilla única que no se cumplía.
