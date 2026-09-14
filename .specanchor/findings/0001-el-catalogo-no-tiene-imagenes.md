---
type: finding
status: open
created: 2026-09-14
visibility: cross-task
---

# Hallazgo: ninguna de las 100 plantillas del catálogo tiene imagen

## Observación

Al aplicar una plantilla Premium desde la Biblioteca, la vista previa sale
casi vacía: sin foto, con un rectángulo de degradado flotando y el titular
cortado.

No es un fallo de esa plantilla. **Son las cien.**

## Evidencia

Medido fuera del navegador, construyendo cada plantilla del catálogo y
renderizando su HTML (revisión `c7f0248`):

```
CATÁLOGO: 100 de 100 plantillas se renderizan SIN NINGUNA IMAGEN · 0 con imagen
```

La causa está en una sola línea, `production-catalog.ts:600`:

```ts
thumbnail: "",
```

Las 100 recetas de imagen nacen con la miniatura vacía — **VERIFIED**:
`IMAGE_RECIPES_100.filter(i => !i.thumbnail).length` devuelve `100`.

Y de ahí sale a los bloques, en las líneas 825 y 885:

```ts
if (type === "hero")  Object.assign(block.props, { imageUrl: image.thumbnail, … });
if (type === "image") Object.assign(block.props, { imageUrl: image.thumbnail, … });
```

Así que el hero de cualquier plantilla del catálogo llega con `imageUrl: ""`.
El renderizador hace lo único que puede: pinta el degradado de respaldo
(`fallbackStart` / `fallbackEnd`) y usa el nombre de la escena —«Retrato
editorial»— como texto alternativo de una imagen que no existe. Eso es el
rectángulo de color de la captura.

Lo que sí hay es **texto**: «TECNOLOGÍA · AGENCIA DE IA · NUEVA OPORTUNIDAD ·
Una idea diseñada para hacer avanzar tu negocio · Hola María, hemos
identificado una oportunidad específica para Empresa Ejemplo…». O sea que el
contenido de demostración existe; lo que falla es que sin imagen la
composición se lee como rota.

La única plantilla con imagen es el showcase hecho a mano, «Aurevanta AI
Command Center», que trae dos fondos de verdad.

## Por qué importa

La Biblioteca es la primera pantalla del recorrido —paso 01, «Elegir
plantilla»— y el catálogo es lo que la llena. Cien plantillas que se ven
rotas al aplicarlas convierten el punto de entrada del producto en el peor
momento de la experiencia.

También explica por qué el asistente de IA se construyó como se construyó: en
el modo simple no se usa el catálogo y la imagen se genera siempre.

## Contexto que condiciona la solución

- **Solo existen 8 imágenes** en `frontend/public/imagenes/`: cuatro escenas
  en dos resoluciones. Para 100 plantillas de sectores distintos.
- **El studio ya sabe generar imágenes.** Cada tarjeta de la Biblioteca tiene
  un botón «Generar visual», y `generar-imagen` funciona y guarda en bucket
  público desde la 050.
- Cada receta trae un `prompt` escrito y específico de su sector, pensado
  justo para eso.

## Disposición sugerida

- [ ] Promover a spec global o de módulo
- [x] **Crear tarea de cambio** — pero la dirección es una decisión de
      producto, no mecánica, y hay al menos tres caminos con resultados muy
      distintos. Pendiente de decidir con Miguel.
- [ ] Crear ADR
- [ ] Descartar

## Decisión de revisión

Pendiente. Registrado el 2026-09-14 durante la revisión de la Biblioteca.
