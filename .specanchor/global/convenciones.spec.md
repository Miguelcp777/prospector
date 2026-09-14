---
type: global-spec
status: ready
last_reviewed: 2026-09-14
---

# Convenciones

## Propósito

Las reglas de escritura que ya sigue el repositorio. Están aquí para que un
cambio nuevo no las rompa por desconocimiento, no para inventarlas.

## Comportamiento actual, con estado de evidencia

| Afirmación | Estado | Fuente |
|---|---|---|
| El código, los identificadores y la documentación están en español | OBSERVED | todo el repositorio; `CLAUDE.md` lo exige |
| Las migraciones van numeradas y con nombre descriptivo en español | OBSERVED | `supabase/002_…` a `053_…` |
| Los ADR van numerados en `docs/decisiones/` | OBSERVED | `0001`-`0005` |
| Las pruebas del studio viven en `frontend/pruebas-porte/` | OBSERVED | `package.json`, script `test:studio` |
| Los comentarios explican **por qué**, no qué | OBSERVED | cabeceras de `composicion-simple.ts`, `052_…sql` y otros |

## Comportamiento pretendido

- **INTENT-CONV-001** · Un comentario que solo repite lo que hace la línea
  siguiente sobra. El valor está en el motivo, y el motivo es lo único que no
  se puede reconstruir leyendo el código.
- **INTENT-CONV-002** · Cuando un arreglo nace de una medición, el número va
  escrito al lado. «Se quedaba en 4.45:1» vale; «mejora el contraste», no.
- **INTENT-CONV-003** · El mensaje de commit cuenta el problema antes que la
  solución.

## Restricciones

- **RESTR-CONV-001** · No se mezcla inglés y español en identificadores
  nuevos. El esquema ya está en español y mezclar lo vuelve ilegible. La
  excepción viva es el studio, que llegó de fuera en inglés: dentro de
  `frontend/src/studio/` se respeta su idioma para que los portes futuros
  sigan siendo reconciliables (ver `docs/decisiones/0005`).
- **RESTR-CONV-002** · No se inventan nombres de tabla, campo ni endpoint. El
  esquema es la fuente de verdad; si falta el dato, se pregunta.
- **RESTR-CONV-003** · El CSS del studio no se porta línea a línea. Se aplica
  como parche, porque reconstruirlo saca reglas de su `@media` sin que lo note
  ninguna prueba (`docs/decisiones/0005`).

## Invariantes

- **INV-CONV-001** · Un archivo material pertenece a exactamente un módulo, o
  a varios a sabiendas. El guard falla si no pertenece a ninguno.
- **INV-CONV-002** · Una afirmación de una spec sin estado de evidencia está
  incompleta.

## Fuera de alcance

Formato automático y linters: no hay ninguno configurado en `frontend/`
(OBSERVED · `package.json` no declara `lint`). Añadirlos es una decisión
propia, no parte de esta adopción.

## Incógnitas

- **UNKNOWN** · No hay criterio escrito sobre cuándo una función del studio
  debe traducirse al español. Hasta ahora se ha decidido caso por caso.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.
