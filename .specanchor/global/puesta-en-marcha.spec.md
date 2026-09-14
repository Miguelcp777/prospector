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

## Lo que no existe

- **VERIFIED** · No hay CI. No existe `.github/`. Ninguna de las
  comprobaciones de arriba se ejecuta sola.
- **VERIFIED** · No hay entorno de pruebas: `main` despliega a producción y la
  base es la de los clientes reales.

Las dos cosas son el mayor riesgo operativo de este proyecto y están escritas
aquí para que no haga falta descubrirlas.

## Próximos pasos propuestos (no ejecutados)

- **INTENT** · Integrar el guard y `npm run test:studio` en un workflow de
  GitHub Actions con `--base` apuntando a la rama de destino real de la
  tubería, no a `main` por costumbre.
- **INTENT** · Las protecciones de rama son un ajuste externo y necesitan
  autorización aparte. No se han tocado.

## Incógnitas

- ~~No consta que el procedimiento de comprobación de RLS se haya ejecutado~~
  → ejecutado el 2026-09-14 (TASK-004), en una variante que no crea datos de
  prueba: se usa la sesión de un cliente real contra los datos de los demás.
  Sigue **sin automatizar**, que es lo que lo dejaría verificado siempre y no
  solo ese día.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.
