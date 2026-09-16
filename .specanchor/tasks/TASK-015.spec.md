---
type: task-lite
id: TASK-015
status: in_progress
created: 2026-09-16
modules: [app-web]
behavior_preserving: false
---

# Tarea: las cabeceras del lateral pesan más que sus hijos

## Petición

Miguel: «remarca la palabra "Prospector" y "EMAIL MARKETING" para que se
diferencien mejor de las secciones del submenú».

## Lo que estaba pasando, medido

La jerarquía estaba **invertida**. Medido sobre la pantalla:

| | tamaño | peso | color |
|---|---|---|---|
| `PROSPECTOR` · la marca | 16 px | 800 | `rgb(244,242,251)` · pleno |
| **`PROSPECCIÓN` · cabecera de grupo** | **11 px** | 700 | **`rgb(162,157,186)` · apagado** |
| `Campañas`, `Listas`… · sus hijos | 15 px | 500 | `rgb(162,157,186)` |

La cabecera que **organiza** el bloque iba más pequeña que lo que hay dentro y
**del mismo color exacto** que las entradas en reposo. Lo único que la
distinguía era el tamaño, y el tamaño la hacía parecer menos importante, no
más.

Esto se notaba poco mientras los hijos iban sangrados. Desde TASK-014, que los
puso a todos en la misma columna, **no quedaba nada más que lo distinguiera**
— así que es una consecuencia directa de lo de ayer, no un defecto viejo.

## Qué cambia

**La cabecera de grupo** pasa a `--texto`, a tope de brillo. Sigue en 11 px y
versalitas, que es lo que le da el papel de etiqueta: 11 px en caja alta
contra 15 en caja baja no se confunden aunque compartan color.

**Un filete y aire entre grupos**, el mismo recurso que ya separa las entradas
sueltas de abajo. Con 8 px y nada más, «EMAIL MARKETING» quedaba pegado a
«Leads» y se leía como una entrada más de Prospección.

**La marca** sube a 17 px y triplica el espaciado entre letras. Tiene que
seguir ganando a dos cabeceras que ahora también van en versalitas y a tope de
brillo.

## Dos reglas que había que tocar, y no son evidentes

- `.nav-grupo.abierto .nav-grupo-cabeza { color: var(--texto-2) }` **se
  borra**. Existía para SUBIR el brillo de un grupo desplegado desde
  `--texto-3`. Con la cabecera ya en `--texto`, esa regla —que gana por
  especificidad— haría justo lo contrario: **apagar los grupos abiertos**.
  Abierto y cerrado los distingue la flecha, que dice `⌄`, `›` o `•` según el
  caso, y sobre todo que los hijos estén o no estén.

- **El reinicio móvil necesita nombrar `.nav-grupo + .nav-grupo` aparte.** El
  bloque de 860 px aplana los grupos con `.nav-grupo, .nav-grupo-hijos,
  .nav-sueltas { margin: 0; padding: 0; border: 0 }`, pero eso es **una** clase
  y el filete nuevo va en un selector de **dos**. La especificidad gana al
  orden, así que el filete y el relleno se colarían en la barra horizontal.

  Es el mismo choque que `INV-WEB-012` **por el otro lado**: allí la regla
  móvil perdía por ir antes en el archivo; aquí perdería por pesar menos.

## Aceptación

- **TASK-015/AC-001** · La cabecera de grupo se lee más que sus hijos en
  reposo.
- **TASK-015/AC-002** · Un grupo desplegado no se apaga.
- **TASK-015/AC-003** · En la barra horizontal de móvil no aparece el filete
  entre grupos.

## Evidencia

- **EV-001** · Ensayo en caliente sobre la producción real antes de escribir
  nada, y mirado en pantalla: las dos cabeceras en blanco, el filete entre
  ellas, y los tres bloques leyéndose como bloques.
- **EV-002** · El orden y el peso en el CSS ya construido, que es donde se ve
  si el reinicio móvil gana:

  ```
  15705  .nav-grupo+.nav-grupo{margin-top…;padding-top…;border-top…}
  16615  .nav-grupo,.nav-grupo-hijos,.nav-sueltas,.nav-grupo+.nav-grupo{border:0;…}
  ```

  Misma especificidad y después: el reinicio gana.
- **EV-003** · `tsc -b --force` → 0. `npm run build` → correcto. Pruebas del
  studio sin fallos nuevos. `test:importacion` **34 de 34**.
- **EV-004** · _(pendiente: la pantalla, después del despliegue)_

## Trazabilidad

| Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|
| AC-001 | Ensayo en caliente sobre producción, mirado | **pass** | EV-001 |
| AC-003 | Orden y especificidad en el CSS construido | **pass** | EV-002 |

## Revisión final

_(pendiente de EV-004)_
