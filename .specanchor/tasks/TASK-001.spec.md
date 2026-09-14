---
type: task-spec
id: TASK-001
status: verified
created: 2026-09-14
modules: [datos, edge-nucleo, descubrimiento, inteligencia, correo, app-web, studio, demo-publica, campaign-studio-aparcado]
behavior_preserving: true
---

# Tarea: adoptar SDD en Prospector sin tocar el software

## 1. Cambio solicitado

Instalar la skill `sdd-spec-anchor` y convertir Prospector a ese marco de
trabajo. Requisito explícito del solicitante, en mayúsculas: **el software no
se puede estropear en el proceso.**

## 2. Comportamiento actual

El proyecto se venía construyendo por conversación. Existían `CLAUDE.md`,
`AGENTS.md`, `docs/arquitectura.md`, `docs/roadmap.md`, `docs/compliance.md` y
cinco ADR en `docs/decisiones/`, pero **ningún contrato por módulo**, ninguna
trazabilidad entre lo pedido y lo verificado, y ninguna comprobación de que un
archivo cambie con su contrato delante.

## 3. Comportamiento deseado

Contratos anclados por módulo y globales, con el estado de evidencia de cada
afirmación; un protocolo escrito para los cambios materiales; un guard de
cobertura documental configurado; y la línea base registrada.

## 4. Alcance

Solo documentación y configuración: `.specanchor/**`, más la activación en
`CLAUDE.md` y `AGENTS.md`.

## 5. Fuera de alcance

- Refactorizar, renombrar o mover código en ejecución.
- Añadir pruebas.
- Montar CI o tocar protecciones de rama (ajuste externo, requiere
  autorización aparte).
- Arreglar los 4 fallos de prueba conocidos.

## 6. Anclas afectadas

Las nueve specs de módulo y las cinco globales: todas nacen en esta tarea.

## 7. Requisitos

- **TASK-001/REQ-001** · Los artefactos que se despliegan no cambian.
- **TASK-001/REQ-002** · El resultado de las pruebas no cambia.
- **TASK-001/REQ-003** · Todo archivo material pertenece a un módulo con spec.
- **TASK-001/REQ-004** · El protocolo queda activado para las dos herramientas
  de agente que usa el proyecto.
- **TASK-001/REQ-005** · Las rutas de documentación que ya existían se
  reutilizan, no se duplican.

## 8. Criterios de aceptación

- **TASK-001/AC-001** · Los cuatro artefactos de `npm run build` tienen el
  mismo nombre con hash antes y después.
- **TASK-001/AC-002** · `npm run test:studio` da 75 / 71 / 4 antes y después,
  y los cuatro fallos son los mismos.
- **TASK-001/AC-003** · `--baseline` devuelve 0 archivos sin mapear y sale con
  código 0.
- **TASK-001/AC-004** · `git status` no lista ningún archivo de software
  modificado.

## 9. Enfoque

Bootstrap documental siguiendo `reference/migration-playbook.md`. Medir antes,
documentar, medir después con los mismos comandos y comparar.

## 11. Migración y compatibilidad

No aplica: no hay cambio de comportamiento que migrar.

## 13. Riesgos y vuelta atrás

Riesgo principal: que documentar arrastre a «arreglar de paso». Se evita
declarando el refactor fuera de alcance y comprobándolo con el hash de los
artefactos. Vuelta atrás: borrar `.specanchor/` y revertir el bloque añadido a
los dos archivos de agente.

## 14. Lista de comprobación

- [x] Specs persistentes redactadas
- [x] Implementación completa (documental)
- [x] Pruebas: sin cambios, comprobado
- [x] Revisión inversa completa
- [x] Guard ejecutado

## 15. Registro de decisiones

- **DEC-001** · Los ADR se quedan en `docs/decisiones/`. La skill manda
  respetar las rutas establecidas; duplicarlos habría dejado dos sitios donde
  mirar y uno se habría quedado atrás.
- **DEC-002** · `docs/*` queda fuera de rutas materiales: es documentación, no
  código que se ejecute.
- **DEC-003** · `campaign-studio-aparcado` se documenta como aparcado sin
  especificar sus contratos internos. Son 169 archivos que no entran en el
  build.
- **DEC-004** · Cuatro archivos se declaran en dos módulos a la vez. No es un
  descuido del mapa: es la costura real entre la aplicación y el correo.
- **DEC-005** · El código interno del studio sigue en inglés. Traducirlo
  rompería la reconciliación de los portes futuros.

## 16. Registro de evidencia

- **EV-001** · `npx tsc -b --force` en `98f80dc`, antes y después: salida 0.
- **EV-002** · `npm run build` antes y después: `index-B4-NYByt.css`,
  `Studio-BTkJqtpm.css`, `Studio-CsSjkjdk.js`, `index-BxRDyer5.js`. Los cuatro
  hashes idénticos.
- **EV-003** · `npm run test:studio` antes y después: 75 pruebas, 71 pasan, 4
  fallan; los mismos cuatro nombres.
- **EV-004** · `--baseline`: 361 archivos materiales, `unmapped: []`, salida 0.
- **EV-005** · `git status --porcelain` sin archivos de software modificados.
- **EV-006** · Las 18 pruebas de regresión de la skill, ejecutadas en esta
  máquina antes de instalarla: 18 correctas.

## 18. Alineación final

- Spec → Código: **ALIGNED**. Las specs describen el comportamiento observado
  y verificado en `98f80dc`; las afirmaciones sin confirmar están marcadas
  `INFERRED` o `UNKNOWN` en vez de afirmadas.
- Código → Spec: **ALIGNED**. El código no ha cambiado, así que no puede
  haberse separado de lo escrito. EV-002 y EV-005 lo sostienen.

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado real | Evidencia |
|---|---|---|---|---|
| TASK-001/REQ-001 | TASK-001/AC-001 | `npm run build`, comparar los cuatro nombres con hash | idénticos | EV-002 |
| TASK-001/REQ-002 | TASK-001/AC-002 | `npm run test:studio` | 75/71/4, mismos fallos | EV-003 |
| TASK-001/REQ-003 | TASK-001/AC-003 | `check-spec-sync.py --baseline` | 0 sin mapear, salida 0 | EV-004 |
| TASK-001/REQ-001 | TASK-001/AC-004 | `git status --porcelain` | 0 archivos de software | EV-005 |

## Cobertura documental

PASS — ver `.specanchor/evidence/impact-review.json`.

## Nota sobre la revisión y el commit

El informe de impacto lleva dentro la revisión contra la que se validó
(`98f80dc`). Al commitear, `HEAD` cambia y ese informe queda **obsoleto a
propósito**: un documento no puede contener su propio hash. Es la razón por la
que el guard, en CI, genera la revisión en tiempo de ejecución.
