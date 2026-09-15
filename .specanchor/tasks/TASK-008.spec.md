---
type: task-spec
id: TASK-008
status: verified
created: 2026-09-15
modules: [entrega]
behavior_preserving: true
---

# Tarea: `main` queda protegida de verdad

## Petición, alcance y comportamiento actual

Miguel: «he convertido el repositorio a público». Eso desbloquea lo único que
faltaba: GitHub **no aplica** protección de rama en repositorios privados de
cuenta personal, y por eso TASK-005 dejó `INV-ENT-001` diciendo que el CI
**informa y no frena**.

Esta tarea no toca código. Cambia un ajuste externo del repositorio y corrige
la spec que ya no dice la verdad.

## Resultado deseado y aceptación

- **TASK-008/REQ-001** · `main` solo se modifica por pull request con las dos
  comprobaciones del CI en verde, y eso vale también para el dueño.

- **TASK-008/AC-001** · Un empuje directo a `main` se rechaza.
- **TASK-008/AC-002** · Un `--force` a `main` se rechaza.
- **TASK-008/AC-003** · La regla exige las dos comprobaciones que corren en
  una pull request.

## Anclas afectadas y justificación del impacto

`modules/entrega.spec.md`. Clasificación **requirement**: `INV-ENT-001`
afirmaba lo contrario de lo que ocurre ahora, y el UNKNOWN sobre el estado de
las protecciones se sustituye por una medición.

## Configuración, tal cual quedó

| Ajuste | Valor | Por qué |
|---|---|---|
| Patrón | `main` | |
| Require a pull request | sí | |
| Require approvals | **no** | Trabaja solo: con aprobaciones obligatorias no podría fusionar sus propias PR y la regla sería un candado sin llave |
| Require status checks | `Tipos, build y pruebas del studio` + `Cobertura documental del cambio` | Las dos que corren en una pull request. `Inventario` no: ahí se salta a propósito |
| **Do not allow bypassing** (`enforce_all_for_admins`) | **sí** | Sin esto la regla no frena a nadie en un repositorio de un solo administrador |
| Allow force pushes / deletions | no | |

## Evidencia

- **EV-001** · Con la regla creada pero **sin** `enforce_all_for_admins`, un
  empuje directo a `main` **pasó**, con este aviso del servidor:

  ```
  remote: Bypassed rule violations for refs/heads/main:
  remote: - Changes must be made through a pull request.
  remote: - 2 of 2 required status checks are expected.
  ```

  Detecta las dos violaciones y deja pasar igualmente. En un repositorio donde
  el único que empuja es el administrador, eso **no protege nada**. Es el dato
  que justifica la casilla, y no se habría visto sin intentarlo.
- **EV-002** · Con `enforce_all_for_admins` activo, el mismo empuje:
  `GH006: Protected branch update failed` · `protected branch hook declined`,
  salida 1. **Rechazado.**
- **EV-003** · `git push --force-with-lease` a `main`:
  `GH006 · Cannot force-push to this branch`, salida 1. Esto ya funcionaba
  **antes** de la casilla: el bloque «Rules applied to everyone including
  administrators» es literal.
- **EV-004** · La casilla costó cuatro intentos. Los tres primeros la dejaban
  en `false` después de guardar, y el motivo no era GitHub: el formulario se
  desplazaba entre la lectura de coordenadas y el clic, así que el ratón caía
  en otro sitio. Se resolvió leyendo `input[name="enforce_all_for_admins"]`
  antes y después de cada intento, en vez de fiarse de la pantalla.

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | `git push origin main` con un commit vacío | **pass** · GH006 | EV-002 |
| REQ-001 | AC-002 | `git push --force-with-lease origin main` | **pass** · GH006 | EV-003 |
| REQ-001 | AC-003 | lectura del formulario ya guardado | **pass** | EV-004 |

## Lo que esto deja en el historial, y por qué se queda

Dos commits vacíos en `main` —«Prueba: este commit NO debe poder entrar
directo en main» y el segundo— que entraron mientras la regla todavía dejaba
pasar al administrador. **No se borran**: quitarlos exige un force-push, que es
justo lo que la protección impide bien, y desactivarla para limpiar dos
commits vacíos sería aflojar lo que acaba de comprobarse para un asunto
estético. Quedan como lo que son: el registro del experimento.

## Consecuencias que conviene saber

- **Ya no se puede empujar a `main`.** Todo cambio va por rama y pull request.
- **Una pull request con `contratos` en rojo no se puede fusionar.** Eso afecta
  ahora mismo a TASK-007, que sigue abierta con AC-001 sin medir: hasta que se
  compruebe, su cierre no entra. El freno funciona en el primer caso real.
- Si algún día hace falta saltárselo, se desmarca la casilla, se empuja y se
  vuelve a marcar. Es reversible en diez segundos y queda a la vista.

## Fuera de alcance

Lo que la apertura del repositorio implica más allá de esto —qué queda visible
para cualquiera— no es una decisión técnica y no se decide aquí. Comprobado sí:
**no hay secretos en el historial**, 179 commits revisados.

## Revisión final

- Cobertura documental: PASS
- Spec → Código: **ALIGNED** — no hay código; la spec del módulo pasa a decir
  lo que el servidor hace, comprobado contra el servidor.
- Código → Spec: **ALIGNED**.
