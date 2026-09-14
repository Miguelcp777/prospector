# Spec Anchor de Prospector

Este proyecto trabaja con **desarrollo dirigido por especificación**. Los
contratos viven aquí; el código tiene que poder justificarse contra ellos.

## Qué hay y para qué

| Ruta | Qué es |
|---|---|
| `global/*.spec.md` | Contratos que valen para todo el proyecto |
| `modules/*.spec.md` | Un contrato por módulo, con su evidencia |
| `tasks/` | Una tarea por cambio material, con su trazabilidad |
| `findings/` | Hallazgos fuera de alcance, para no perderlos ni colarlos |
| `evidence/` | Línea base e informes de impacto |
| `codemap.md` | El mapa del código, con estado de evidencia |
| `anchor.yaml` | Qué archivos son materiales y cuáles no |
| `module-map.json` | Qué ruta pertenece a qué módulo |

**Los ADR no están aquí.** Viven donde ya vivían: `docs/decisiones/`, numerados
del `0001` al `0005`. Uno nuevo continúa esa serie. Duplicarlos habría creado
dos sitios donde mirar y uno de los dos se habría quedado atrás.

## Cómo se trabaja un cambio

1. **Elegir el alcance.** Cambio localizado sin tocar API, datos, permisos,
   integraciones ni arquitectura → tarea ligera. Lo demás → tarea completa.
2. **Escribir la tarea antes de tocar código**: comportamiento actual,
   comportamiento deseado, alcance y criterios de aceptación medibles.
3. Si cambia un contrato, **la spec se actualiza antes o a la vez**, nunca
   después para legitimar lo que salió.
4. Implementar y verificar. Los identificadores van con espacio de nombres:
   `TASK-001/REQ-001`, `TASK-001/AC-001`.
5. **Revisar el diff en las dos direcciones**: código → spec y spec → código.
6. Registrar el informe de impacto y pasar el guard.
7. Cerrar solo cuando los criterios afectados pasan **con evidencia real**.

## Comandos

Cambios locales —preparados, sin preparar y sin seguimiento—:

```bash
python .specanchor/scripts/check-spec-sync.py \
  --config .specanchor/anchor.yaml \
  --review .specanchor/evidence/impact-review.json
```

Comparando contra la rama de destino:

```bash
python .specanchor/scripts/check-spec-sync.py \
  --config .specanchor/anchor.yaml \
  --base origin/main \
  --review .specanchor/evidence/impact-review.json
```

Inventario de archivos materiales y huérfanos:

```bash
python .specanchor/scripts/check-spec-sync.py \
  --config .specanchor/anchor.yaml --baseline
```

Pruebas del proyecto, que son un control aparte:

```bash
cd frontend && npm run test:studio     # 71 de 75 · 4 fallos conocidos
cd frontend && npx tsc -b --force
cd frontend && npm run build
```

## Lo que el guard NO hace

Comprueba **cobertura documental**: que un archivo material no cambie sin que
su contrato se haya mirado y clasificado. No comprueba que lo que dice la spec
sea verdad, ni que las pruebas se hayan ejecutado, ni que la justificación sea
honesta. Un cambio de espacios en una spec con una justificación engañosa pasa
igual.

La alineación semántica la establecen **las pruebas ejecutadas y la revisión
del diff**, y se informa por separado. Nunca se mezclan las dos cosas en el
mismo veredicto.

## Los cuatro fallos que se quedan

`npm run test:studio` da 71 de 75. Los cuatro fallos son adaptaciones
deliberadas del porte del studio, explicadas en `docs/decisiones/0005` y
listadas en `modules/studio.spec.md`. Pueden seguir fallando; **un fallo
distinto de esos cuatro bloquea**.

## El CI

Desde TASK-005 esto se ejecuta solo. Tres trabajos en
`.github/workflows/ci.yml`, y el contrato completo en
`modules/entrega.spec.md`:

| Trabajo | Cuándo | Qué |
|---|---|---|
| `frontend` | pull request y empujón a `main` | `npm ci`, tipos, build, pruebas del studio |
| `contratos` | solo pull request | el guard con `--base origin/<rama destino>` |
| `inventario` | solo empujón a `main` | el guard con `--baseline` |

Dos cosas que conviene saber antes de tocarlo:

- **Las pruebas no se llaman a pelo.** `npm run test:studio` sale siempre con
  código 1 por los cuatro fallos de arriba. `scripts/pruebas-del-studio.mjs`
  los tolera por nombre y rompe con cualquier otro — y también si uno de los
  cuatro empieza a pasar, para que la lista no envejezca sola.
- **El informe de impacto se sella** contra el HEAD de la tubería, porque no
  puede contener el hash del commit que lo lleva dentro. Eso afloja la
  atadura de la revisión: lo que sigue protegiendo es la exigencia de una
  fila por archivo cambiado. Está razonado en la spec del módulo.

## Lo que falta

- **El CI no se ha ejecutado nunca en GitHub.** Cada pieza está medida en
  local; `ubuntu-latest`, el commit de fusión sintético de las pull requests
  y la caché de npm, no.
- **El CI no toca `supabase/`.** Ni Edge Functions ni migraciones tienen
  comprobación automática.
- Las protecciones de rama son un ajuste externo y necesitan autorización
  aparte. No se han tocado, y sin ellas un rojo avisa pero no impide fusionar.
