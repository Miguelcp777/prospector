---
type: module-spec
module: campaign-studio-aparcado
status: parked
source_paths:
  - frontend/campaign-studio/*
last_reviewed: 2026-09-14
---

# Módulo: campaign-studio-aparcado

## Estado: APARCADO, no conectado

169 archivos que **no entran en el build**. Netlify compila `frontend/` con
Vite, que solo empaqueta `src/`. VERIFIED · ningún artefacto del build sale de
aquí.

Este documento no especifica sus contratos internos a propósito: sería
documentar algo que no se ejecuta. Lo que especifica es **por qué sigue en el
repositorio y qué hace falta antes de tocarlo**.

## Responsabilidad

Ninguna en producción. Es la subaplicación Next autónoma de la que salió el
studio vivo, conservada como referencia para los portes.

## Por qué está aquí

`docs/decisiones/0003-campaign-studio-aparcado.md` lo decide: se fusiona sin
conectar. El precio son 43.000 líneas versionadas que no se ejecutan; la
alternativa era perderlas en otro sitio.

## Invariantes de dominio

- **INV-APA-001** · `integration/prospector/supabase/001_campaign_studio.sql`
  **no se ejecuta**. Ejecutarlo hoy crearía nueve tablas vacías que nada
  escribiría.
- **INV-APA-002** · Su `current_tenant_id()` lee el claim JWT `tenant_id`, que
  los tokens de Prospector **no llevan**. Tal cual, devolvería NULL para todo
  el mundo y el studio se vería vacío **sin un solo mensaje de error**. Es el
  fallo más caro de diagnosticar de los cinco que lista la 0003, porque no
  parece un fallo.
- **INV-APA-003** · Su sesión de invitado acepta como usuario cualquier cadena
  de 20 a 80 caracteres en una cabecera. Razonable en una demo autónoma; no
  con datos de clientes delante.

## Qué hace falta antes de conectarlo

Las cinco condiciones de la 0003, ninguna resuelta: la función de tenant, el
gasto de IA contado por duplicado, `tenant_id` sin clave foránea, la sesión de
invitado y dónde se despliega.

## Cómo se usa hoy

Como base de comparación en el merge de tres vías del módulo `studio`. Sus
pruebas (`tests/`) **no** las ejecuta `npm run test:studio`, que apunta a
`pruebas-porte/`.

## Pruebas y verificación

No se ejecutan. No entran en ninguna orden del `package.json` raíz.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| No entra en el build | OBSERVED | `frontend/vite.config.ts`, artefactos de `dist/` | — |
| Sus pruebas no se ejecutan | VERIFIED | `package.json`, script `test:studio` | apunta a `pruebas-porte/*` |
| Las cinco condiciones siguen abiertas | OBSERVED | `docs/decisiones/0003` | — |
