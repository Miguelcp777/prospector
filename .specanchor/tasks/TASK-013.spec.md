---
type: task-spec
id: TASK-013
status: verified
created: 2026-09-16
modules: [app-web]
behavior_preserving: false
---

# Tarea: los cuatro defectos de las pantallas de listas

## Petición

Miguel: «arregla los cuatro defectos de listas». Son los que aparecieron al
**abrir en el navegador** las tres pantallas de TASK-010 — que hasta entonces
solo se sabía que tipaban, compilaban y que el build las partía bien.

Los tres primeros son el mismo error mío repetido en cinco sitios. El cuarto
es de la detección y tiene coste real.

## 1 · `.rotulo` no es un contenedor de cabecera

`.rotulo` es la **etiqueta pequeña en versalitas cian** —el «PROSPECCIÓN» que
va encima de «Tus campañas»—, y se usó como si fuera el `<div>` que envuelve
título y botón. Resultado: el nombre de la lista salía como una etiqueta
diminuta con el botón metido dentro, en las cinco cabeceras de las tres
pantallas.

El patrón real está en nueve pantallas, por ejemplo `Campanas.tsx:73`:

```tsx
<div className="cabecera">
  <div className="cabecera-texto">
    <span className="rotulo">Prospección</span>
    <h1>Tus <span className="destacado">campañas</span></h1>
    <p className="sutil">…</p>
  </div>
  <button className="primario">…</button>
</div>
```

Las tres pantallas pasan a ese patrón, y el párrafo descriptivo entra dentro
de `.cabecera-texto` en vez de quedar suelto debajo. Los tres pasos del
asistente aprovechan el rótulo para lo que sirve: decir **por dónde vas**
—«Paso 2 de 3 · las columnas»—, que antes no lo decía nadie.

## 2 · La declaración legal salía en versalitas de 11 px

Estaba dentro del `<span>` de un `.campo`, y `estilos.css:342` pinta ese
`<span>` como rótulo de campo: 0.6875 rem, mayúsculas, `letter-spacing` y
`--texto-3`. Correcto para etiquetar «NOMBRE DE LA LISTA». Lo peor posible
para **la frase que sostiene el marco legal de toda la función**, que además
era el texto menos legible de la pantalla.

## 3 · La casilla ocupaba todo el ancho

`input { width: 100% }` de `estilos.css:348` alcanza también a los
`type="checkbox"`. El resto de la aplicación lo sortea a mano
(`Configuracion.tsx:185`); aquí no se hizo, y salía una barra azul de lado a
lado con una marquita en medio.

**Los dos se arreglan con la misma pieza, que ya existía:** `.toggle`, el
patrón del proyecto para «una casilla con su explicación al lado». Acota el
`input` a 17 px con `flex-shrink: 0`, da `<strong>` y `<small>` con color de
texto normal, y resalta el borde al marcarla. Se añade un solo modificador,
`.toggle.declaracion`, que sube la frase a tamaño de texto: una declaración de
origen no es la etiqueta de un ajuste.

## 4 · «Persona de contacto» no se detectaba como nombre

El que cuesta dinero. `CONTIENE.nombre` solo llevaba `["nombre", "name"]`, y
«contacto» y «persona» estaban únicamente en `EXACTOS` —o sea, solo valían si
la cabecera era **exactamente** esa palabra—. «Persona de contacto» es de las
cabeceras más comunes de un export español y no la cogía nadie.

`nombre` no tiene firma de contenido: «Clínica Dental Ruiz» y «María Ruiz» son
texto libre indistinguible, y por eso el rol se decide **solo por cabecera**.
Si la cabecera falla, no hay segunda oportunidad. En la lista de prueba real
los 23 contactos se guardaron con nombre vacío, y el respaldo
`nombre → empresa → parte local del correo` acaba escribiendo a la gente por
el nombre de su empresa.

Se añaden `contacto`, `persona` y `titular` a `CONTIENE.nombre`.

**Por qué no arrastra a los otros roles:** los roles se reparten en orden
—email, luego teléfono y web, luego empresa y nombre— y cada columna se marca
como usada. Para cuando le toca a `nombre`, «Correo de contacto» y «Teléfono
de contacto» ya están cogidas. No es un razonamiento que haya que creerse: hay
dos pruebas que lo fijan.

## Aceptación

- **TASK-013/AC-001** · En las cinco cabeceras el título es un `<h1>` y el
  rótulo es una etiqueta aparte.
- **TASK-013/AC-002** · La declaración se lee en texto normal, no en
  versalitas.
- **TASK-013/AC-003** · La casilla mide lo que mide una casilla.
- **TASK-013/AC-004** · «Persona de contacto» se propone como nombre, y
  «Correo de contacto» y «Teléfono de contacto» siguen yendo a su rol.

## Anclas afectadas

`modules/app-web.spec.md`. Clasificación **contract**: nace `INV-WEB-013` con
las dos clases que se confundieron, porque el error se repitió en cinco sitios
seguidos y lo que falla no es el criterio sino el nombre de la clase.

## Evidencia

- **EV-001** · `npx tsc -b --force` → 0. `npm run build` → correcto, principal
  643,08 kB. `node scripts/pruebas-del-studio.mjs` → sin fallos nuevos.
- **EV-002** · `npm run test:importacion` → **34 de 34**, `# fail 0`. Tres
  pruebas nuevas: «Persona de contacto» como nombre, y las dos que fijan que
  «Correo de contacto» y «Teléfono de contacto» no se las lleva `nombre`.
- **EV-003** · **Las tres pantallas abiertas en producción**, con el paquete
  servido comprobado antes (`index-CExVcMph.js` y `index-CGzkfnuW.css`, los
  mismos hashes del build local) para no medir sobre la versión anterior:

  | | |
  |---|---|
  | Listas | «PROSPECCIÓN» de etiqueta y «Tus **listas**» de título |
  | Una lista | «LISTA DE CONTACTOS» y el nombre en grande, «Volver» a la derecha |
  | Asistente | «PASO 1 DE 3 · EL ARCHIVO», «PASO 2 DE 3 · LAS COLUMNAS», «PASO 3 DE 3 · LA REVISIÓN» |

  Y la declaración, medida sobre el elemento vivo:

  | | antes | ahora |
  |---|---|---|
  | casilla | ancho del panel | **17 × 17 px** |
  | tamaño | 11 px | **14 px** |
  | `text-transform` | `uppercase` | **`none`** |
  | `letter-spacing` | 0.1 em | **`normal`** |
  | color | `--texto-3` | `rgb(244,242,251)`, el texto pleno |

  El cuarto, con el CSV de muestra subido de verdad: **Nombre → «Persona de
  contacto»**, y la previsualización trae «Ana Muñoz», «Jordi Ferrer», «Río
  Sánchez» donde antes había rayas.

- **EV-004** · Y un efecto secundario del propio arreglo, medido en las tres
  cabeceras: `.cabecera` reparte el ancho entre el texto y el botón, y el
  texto lo pide **por su contenido**. Con un párrafo de cuatro líneas se
  llevaba los 960 px enteros y **tiraba el botón a la fila de abajo**.

  ```
  paso 1 de 3  · ancho del texto 960 de 960 · se baja: SÍ
  paso 2 de 3  ·                            · se baja: no
  paso 3 de 3  ·                            · se baja: no
  ```

  Pasaba en Listas y en el paso 1, los dos que tenían el párrafo largo. Se
  arregla dejando una línea en la cabecera y el resto debajo, que es lo que
  hacen las otras nueve pantallas — `Campanas.tsx` cabe en una frase.

## Trazabilidad

| Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|
| AC-004 | Tres pruebas automáticas, incluidas las dos de no-regresión | **pass** | EV-002 |
| AC-001, AC-002, AC-003 | Tipos, build y pruebas del studio | **pass** · OBSERVED | EV-001 |

| AC-001, AC-002, AC-003 | Las tres pantallas abiertas en producción, con medición del elemento vivo | **pass** · VERIFIED | EV-003, EV-004 |

Los tres de aspecto **no se dieron por buenos hasta abrir la pantalla**, y
menos mal: abrirla destapó el efecto secundario de EV-004, que ninguna de las
otras comprobaciones podía ver.

## Revisión final

- Cobertura documental: **PASS**.
- Spec → Código: **ALIGNED** — `INV-WEB-013` nombra las dos clases que se
  confundieron, que es lo que puede evitar la próxima vez.
- Código → Spec: **ALIGNED**.
