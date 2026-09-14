---
type: global-spec
status: ready
last_reviewed: 2026-09-14
---

# Puesta en marcha y operación

## Propósito

Cómo se construye, se prueba y se despliega esto, y qué hay que ejecutar para
poder decir que un cambio está verificado.

## Comandos reales, con su resultado en la revisión de referencia

Revisión `98f80dcf6bb3fd245c065fe7904e5593abf07110`.

| Acción | Comando | Resultado | Estado |
|---|---|---|---|
| Tipos | `cd frontend && npx tsc -b --force` | salida 0, sin errores | VERIFIED |
| Build | `cd frontend && npm run build` | salida 0, 4 artefactos | VERIFIED |
| Pruebas | `cd frontend && npm run test:studio` | 75 pruebas · 71 pasan · 4 fallan | VERIFIED |
| Cobertura documental | `python .specanchor/scripts/check-spec-sync.py --config .specanchor/anchor.yaml --review .specanchor/evidence/impact-review.json` | — | — |
| Inventario | `python .specanchor/scripts/check-spec-sync.py --config .specanchor/anchor.yaml --baseline` | 361 materiales, 0 sin mapear | VERIFIED |

Para comparar contra la rama de destino, `--base origin/main`. La comparación
es `merge-base(destino, HEAD) → HEAD`. **Sin `--base`, un árbol limpio dice
que no hay cambios relevantes, y eso no valida lo ya commiteado.**

## Despliegue

| Pieza | Cómo | Estado |
|---|---|---|
| Frontend | Netlify, automático al empujar a `main` | VERIFIED |
| Edge Functions | `npx supabase functions deploy <nombre>` | OBSERVED |
| Migraciones | archivo numerado de `supabase/`, aplicado por MCP o SQL Editor | OBSERVED |

- **RESTR-OPS-001** · Después de desplegar una Edge Function se comprueba que
  arranca. Un `BOOT_ERROR` responde **503** y no se distingue de un fallo de
  red hasta que se mira. Ocurrió con `generar-imagen` por una variable
  duplicada.
- **RESTR-OPS-002** · El repositorio es la fuente de verdad del esquema.
  Nada de SQL improvisado en el editor.

## Integración continua

Desde TASK-005 existe `.github/workflows/ci.yml`. Su contrato vive en
`modules/entrega.spec.md`; aquí solo lo que hay que saber para operar:

| Trabajo | Se dispara en | Qué ejecuta |
|---|---|---|
| `frontend` | pull request y empujón a `main` | `npm ci`, tipos, build, pruebas del studio |
| `contratos` | solo pull request | guard con `--base origin/<rama destino>` y el informe sellado |
| `inventario` | solo empujón a `main` | guard con `--baseline` |

- Las pruebas no se llaman a pelo: `node scripts/pruebas-del-studio.mjs` tolera
  los cuatro fallos conocidos **por nombre** y rompe con cualquier otro.
- El informe de impacto se sella contra el HEAD de la tubería
  (`scripts/sellar-revision.mjs`). Lo que eso afloja está escrito en la spec
  del módulo, y no es menor.
- VERIFIED 2026-09-14 · cada pieza, ejecutada en local. **UNKNOWN** · ninguna
  se ha ejecutado todavía en GitHub.

## Lo que sigue sin existir

- **VERIFIED** · No hay entorno de pruebas: `main` despliega a producción y la
  base es la de los clientes reales. Es hoy el mayor riesgo operativo del
  proyecto, y está escrito aquí para que no haga falta descubrirlo.
- **VERIFIED** · El CI no toca `supabase/`: ni Edge Functions ni migraciones
  tienen comprobación automática.
- **UNKNOWN** · No se ha consultado si `main` tiene protecciones de rama, y no
  se han tocado. Sin ellas, un rojo del CI avisa pero no impide fusionar.
  Activarlas es un ajuste del repositorio en GitHub y necesita autorización
  aparte.

## Incógnitas

- ~~No consta que el procedimiento de comprobación de RLS se haya ejecutado~~
  → ejecutado el 2026-09-14 (TASK-004), en una variante que no crea datos de
  prueba: se usa la sesión de un cliente real contra los datos de los demás.
  Sigue **sin automatizar**, que es lo que lo dejaría verificado siempre y no
  solo ese día.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.
- 2026-09-14 · TASK-005: el CI existe. «No hay CI» era VERIFIED y deja de
  serlo; el INTENT de integrarlo se sustituye por lo que hace de verdad.
