---
type: task-spec
id: TASK-003
status: in_progress
created: 2026-09-14
modules: [studio]
behavior_preserving: false
---

# Tarea: aplicar una plantilla del catálogo trae su imagen

## 1. Cambio solicitado

Las plantillas del catálogo se ven vacías al aplicarlas. Decidido con Miguel
el 2026-09-14: **generar la imagen al aplicar la plantilla**, con el prompt
que cada receta ya trae escrito para su sector.

## 2. Comportamiento actual

VERIFIED (revisión `c7f0248`, medido construyendo las 100 plantillas y
renderizando su HTML):

```
CATÁLOGO: 100 de 100 se renderizan SIN NINGUNA IMAGEN · 0 con imagen
```

Las 100 recetas de imagen nacen con `thumbnail: ""`
(`production-catalog.ts:600`), y ese valor vacío llega al hero y al bloque de
imagen de cada plantilla (líneas 825 y 885). El renderizador pinta entonces el
degradado de respaldo y usa el nombre de la escena como texto alternativo de
una imagen que no existe.

**El generador ya existe y funciona.** `preparePresetImage(preset)` aplica la
plantilla y genera su visual con el prompt de la receta. Lo que falla es que
está **detrás de un segundo botón** —«Generar visual»— que hay que saber
pulsar después: las tres opciones del menú «Aplicar plantilla» aplican texto y
diseño, y ninguna trae imagen.

O sea: no falta la capacidad, falta conectarla al gesto natural.

## 3. Comportamiento deseado

Aplicar una plantilla del catálogo deja el correo **con su imagen**, generada
para el sector de esa plantilla. Sin pulsar nada más.

Quien no quiera gastar una generación tiene una opción explícita para aplicar
sin imagen.

## 4. Alcance

`frontend/src/studio/StudioClient.tsx`: el menú de «Aplicar plantilla» y la
reutilización del visual ya generado.

## 5. Fuera de alcance

- Rellenar `thumbnail` con imágenes fijas. Se descartó: solo hay 8 imágenes
  para 100 sectores y muchas no pegarían.
- «Aplicar solo estilo» y «Aplicar solo estructura»: no sustituyen el
  contenido, así que una imagen no les corresponde.
- El asistente de IA del modo simple, que ya genera su imagen siempre.

## 6. Anclas afectadas

`modules/studio.spec.md`. **Cambia comportamiento visible**, así que la spec
del módulo se actualiza en esta misma tarea.

## 7. Requisitos

- **TASK-003/REQ-001** · Aplicar una plantilla del catálogo deja el hero con
  una imagen generada para esa receta.
- **TASK-003/REQ-002** · Existe una opción explícita para aplicar sin generar
  imagen.
- **TASK-003/REQ-003** · Un visual ya generado se reutiliza dentro de la
  sesión: mirar tres plantillas y volver a la primera no cuesta tres
  imágenes.
- **TASK-003/REQ-004** · Si la generación falla —sin clave, proveedor caído—
  la plantilla se aplica igual, con su texto, y se dice qué ha pasado.

## 8. Criterios de aceptación

- **TASK-003/AC-001** · Tras aplicar una plantilla, el bloque hero tiene
  `imageUrl` con una URL del bucket `imagenes-correo`, y no cadena vacía.
- **TASK-003/AC-002** · El menú ofrece «aplicar sin imagen» y esa opción deja
  `imageUrl` vacío sin llamar al proveedor.
- **TASK-003/AC-003** · Aplicar dos veces la misma plantilla hace **una sola**
  llamada a `generar-imagen`.
- **TASK-003/AC-004** · `npm run test:studio` sigue en 71 de 75, con los
  mismos cuatro fallos conocidos.

## 9. Enfoque

No se escribe un generador nuevo: se conecta el que ya hay al gesto de
aplicar, y se le añade una caché por receta para la sesión.

## 10. Impacto de coste

Cada aplicación con imagen es una llamada de pago al proveedor y unos 30
segundos. Por eso la caché por receta (REQ-003) y la salida explícita sin
imagen (REQ-002) forman parte del cambio y no de una mejora posterior:
navegar por la biblioteca no puede costar una imagen por clic.

## 13. Riesgos y vuelta atrás

Riesgo: que alguien aplique plantillas en serie y gaste sin querer. Se acota
con la caché y con la opción sin imagen. Vuelta atrás: revertir el commit; no
hay migración ni dato persistido nuevo.

## 14. Lista de comprobación

- [ ] Spec del módulo actualizada
- [ ] Implementación completa
- [ ] Verificación
- [ ] Revisión inversa
- [ ] Guard

## 15. Registro de decisiones

- **DEC-001** · La caché va por `imageRecipeId`, no por plantilla: el prompt
  pertenece a la receta, y dos plantillas que comparten receta comparten
  visual.
- **DEC-002** · La caché es de sesión, en memoria. No se persiste: una imagen
  guardada por plantilla sería una decisión de datos y no está pedida.
- **DEC-003** · Un fallo de generación **no** cancela la aplicación. El texto
  y el diseño son útiles sin imagen; dejar al usuario sin nada porque el
  proveedor no responde sería peor que el problema original.

## 16. Registro de evidencia

- **EV-001** · 100 de 100 plantillas sin imagen, antes del cambio.
- **EV-002** · Comprobación tras el cambio.
- **EV-003** · Pruebas del studio.

## 18. Alineación final

- Spec → Código: NOT_VERIFIED
- Código → Spec: NOT_VERIFIED

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | aplicar y leer `imageUrl` del hero | pendiente | EV-002 |
| REQ-002 | AC-002 | usar la opción sin imagen y leer `imageUrl` | pendiente | EV-002 |
| REQ-003 | AC-003 | aplicar dos veces y contar llamadas | pendiente | EV-002 |
| REQ-004 | AC-004 | `npm run test:studio` | pendiente | EV-003 |

## Cobertura documental

NOT_RUN
