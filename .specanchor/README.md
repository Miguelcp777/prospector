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

## Lo que falta

- **No hay CI.** Nada ejecuta el guard ni las pruebas solo. Integrarlo es el
  siguiente paso y está propuesto en `global/puesta-en-marcha.spec.md`.
- Las protecciones de rama son un ajuste externo y necesitan autorización
  aparte.
