---
type: module-spec
module: app-web
status: ready
source_paths:
  - frontend/src/pages/*
  - frontend/src/lib/*
  - frontend/src/components/*
  - frontend/src/App.tsx
  - frontend/src/main.tsx
  - frontend/src/estilos.css
  - frontend/src/estilos-acceso.css
  - frontend/index.html
  - frontend/public/*
  - frontend/package.json
  - frontend/tsconfig.json
  - frontend/vite.config.ts
  - frontend/netlify.toml
last_reviewed: 2026-09-14
---

# Módulo: app-web

## Responsabilidad

Las pantallas que usa el cliente: acceso, bienvenida, campañas, leads,
mensajes, historial, supresiones, incidencias, cuenta y panel. Más la sesión,
la navegación y los dos temas.

## Propiedad del código

`frontend/src/pages` (29 archivos), `frontend/src/lib` (10),
`frontend/src/components` (2), `App.tsx`, `main.tsx` y las dos hojas de estilo
de la aplicación. `estilos-studio.css` **no** es de este módulo aunque viva en
`src/`: pertenece a `studio`.

Dos archivos de `lib/` pertenecen además a `correo` —`aplicar-plantilla.ts` y
`plantilla-por-defecto.ts`—: un cambio en ellos exige las dos specs.

## Interfaces públicas

No hay router: la vista se elige con estado en `App.tsx`. Las secciones se
declaran en `GRUPOS` y `SUELTAS`, y el menú se filtra por los módulos
contratados del tenant (`modulo_prospeccion`, `modulo_email`).

## Invariantes de dominio

- **INV-WEB-001** · Esconder una sección del menú **no la desactiva**. La
  clave publicable viaja en el bundle y las funciones se pueden llamar desde
  la consola. Lo que apaga un módulo son los triggers de la 029.
- **INV-WEB-002** · El panel de administración se protege con `es_admin()`
  dentro de cada `panel_*`, no por estar escondido.
- **INV-WEB-003** · Una cuenta sin `configurado_en` ve la bienvenida antes que
  nada. Los cuatro esenciales bloquean; el resto no.
- **INV-WEB-004** · El estado del recorrido se deduce de los datos. Un
  `paso_actual` persistido se desincroniza el primer día que alguien haga algo
  por otra vía.
- **INV-WEB-005** · El recorrido lateral **no** aparece dentro de la campaña:
  ahí los seis pasos ya son la pantalla.
- **INV-WEB-006** · Un `<button>` sin clase de botón se queda con la cara gris
  del navegador, que no es de ninguno de los dos temas. `.sutil` es una clase
  de texto y no vale para un botón.
- **INV-WEB-007** · Los textos se apagan con **color**, no con `opacity`: la
  opacidad mezcla el texto con el fondo antes de que llegue al ojo y hunde el
  contraste sin que el color declarado lo delate.

## Datos y persistencia

Solo lectura y escritura vía PostgREST con la clave publicable. La RLS filtra.
`localStorage` guarda el tema y qué grupos del menú están plegados.

## Seguridad y permisos

- **RESTR-WEB-001** · En `frontend/` solo entra la clave publicable. Nunca
  `service_role`.
- El `redirectTo` de OAuth exige la barra final; sin ella Supabase descarta el
  destino y devuelve al Site URL.

## Rendimiento y operación

El bundle principal ronda los 615 kB (172 kB comprimido). El studio va en un
chunk aparte, cargado bajo demanda.

## Accesibilidad

- **INV-WEB-008** · Ningún texto por debajo de WCAG AA en ninguno de los dos
  temas. VERIFIED 2026-09-14 en las nueve secciones a 375, 960 y 1440 px.
- **INV-WEB-009** · Por debajo de 860 px el armazón gira a columna y necesita
  `align-items: stretch`; sin él `main` se ajusta a su contenido y una tabla
  ancha arrastra la página entera.

## Pruebas y verificación

**Desde TASK-010 ya no son cero.** `frontend/pruebas/` trae **29 pruebas** de
los dos módulos puros de la importación —el lector de tablas y la detección de
columnas—, que viven en `lib/` y no dentro de un componente precisamente para
poder probarse sin montar React.

```bash
cd frontend && npm run test:importacion    # 29 · node --experimental-strip-types
```

Corren en el CI, en su propio paso y **llamadas a pelo**: son nuevas, no
arrastran ningún fallo conocido, y el día que una falle tiene que romper sin
excepciones que mantener.

Una de ellas encontró un fallo real el día que se escribió: el criterio de
ambigüedad estaba mal planteado —miraba si empataban los puntos en vez de si
había otra columna también llena de correos—.

Lo que sigue sin prueba automática: **las pantallas**. Son React y no hay
banco para montarlas.

## Incertidumbres y deuda conocidas

- **UNKNOWN** · Sin pruebas, cualquier cambio en `pages/` se verifica a ojo.
- **OBSERVED** · El tema `light` del studio no hace nada distinto del oscuro:
  los dos siguen a la aplicación (`docs/decisiones/0005`, «Pendiente»).

## Historial de cambios

- 2026-09-16 · TASK-010: sección **Listas**. Tres pantallas —índice, detalle y
  asistente de importación—, tres módulos puros en `lib/`, y las primeras
  pruebas automáticas del módulo. La detección de la columna de correo va por
  **contenido y no por cabecera**, y **propone**: la pantalla enseña por qué,
  previsualiza las filas *tal como van a quedar guardadas* y deja cambiarlo.
  Dependencia nueva: `read-excel-file` con versión exacta e import dinámico —
  no SheetJS, cuyo paquete de npm lleva congelado desde que el proyecto se
  mudó a su CDN y arrastra CVE.

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| Sin `align-items: stretch` la página desborda en compacto | VERIFIED | Leads a 375 px | `scrollWidth` 992 vs 375 |
| Cero textos bajo el mínimo, ambos temas | VERIFIED | barrido 2026-09-14 | 0 en 9 secciones × 2 temas |
| «Quitarlo» con `.sutil` quedaba en 2.05:1 | VERIFIED | Cuenta, tema oscuro | corregido a `.fantasma` |
| El paso 6 quedaba en 1.88:1 por opacidad | VERIFIED | campaña abierta | corregido con color |
| No hay pruebas de este módulo | VERIFIED | inventario | 0 archivos |
