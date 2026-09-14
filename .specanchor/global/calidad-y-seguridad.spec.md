---
type: global-spec
status: ready
last_reviewed: 2026-09-14
---

# Calidad y seguridad

## Propósito

Lo que hay que poder afirmar de cualquier cambio antes de darlo por cerrado, y
lo que no se puede romper aunque el cambio funcione.

## Comportamiento actual, con estado de evidencia

| Afirmación | Estado | Fuente |
|---|---|---|
| Las pruebas del studio pasan 71 de 75 | VERIFIED | `npm run test:studio` en `98f80dc` |
| Los 4 fallos son anteriores y están explicados | OBSERVED | `docs/decisiones/0005`, sección «Estado» |
| `tsc -b` y `npm run build` salen con 0 | VERIFIED | ejecutados en `98f80dc` |
| **No hay CI**: nada ejecuta las pruebas solo | VERIFIED | no existe `.github/` |
| Fuera del studio no hay ninguna prueba automática | VERIFIED | `frontend/pruebas-porte/` es el único directorio de pruebas |
| Ningún secreto vive en el repositorio | OBSERVED | `.env.example` solo lleva la URL y la clave publicable |
| El MCP de Supabase está en modo escritura a propósito | OBSERVED | `.mcp.json` sin `read_only`; razonado en `supabase/README.md` |

## Comportamiento pretendido

- **INTENT** · Un cambio material no se cierra sin que sus criterios de
  aceptación estén verificados con evidencia real, no declarada.
- **INTENT** · Los 4 fallos de arriba pueden seguir fallando mientras se
  demuestre que no tienen relación con el cambio. Un fallo **nuevo** bloquea.

## Restricciones

- **RESTR-SEG-001** · Las claves de API viven en secretos de Edge Function o
  en el Vault. Nunca en el cliente, nunca en el repositorio. `demo/index.html`
  es código fuente público: una clave ahí es un incidente, no un descuido.
- **RESTR-SEG-002** · Antes de tocar `leads`, `messages` o `suppressions` se
  consulta `docs/compliance.md`. Son las tres tablas de riesgo legal.
- **RESTR-SEG-003** · Nada de scraping de LinkedIn o Meta.
- **RESTR-SEG-004** · No se documentan valores de secretos: se documentan sus
  rutas y nombres.
- **RESTR-SEG-005** · Una migración destructiva o un borrado de datos se
  pregunta antes.

## Invariantes

- **INV-SEG-001** · `leer_clave_modelo` y `resolver_clave_modelo` solo están
  concedidas a `service_role`. Ni un administrador saca una clave en claro.
- **INV-SEG-002** · Un cliente fuera del modo demo **no** usa la clave del
  servicio; si no tiene la suya, la IA se para con un aviso. No hay caída
  silenciosa (047, 049).
- **INV-SEG-003** · Lo que se sirve dentro de un correo va en bucket público;
  lo privado se sirve firmado. Una URL firmada dentro de un correo es una
  imagen rota con retardo (044, 050).
- **INV-SEG-004** · Sin SVG en buckets públicos.

## Convenios de verificación

Cada afirmación de una spec lleva estado: **OBSERVED** (leído),
**VERIFIED** (ejecutado, con comando y resultado), **INFERRED** (interpretación
por confirmar), **UNKNOWN**, **INTENT**. Declarar `VERIFIED` sin haber
ejecutado nada es el fallo más caro de este método, porque hace que el
documento deje de servir.

## Fuera de alcance

La auditoría legal previa a la Fase 4 sigue pendiente (`docs/compliance.md`).

## Incógnitas

- **UNKNOWN** · Nadie ha medido la cobertura real de los caminos críticos
  (RLS, resolución de claves, troceado). Las pruebas que hay son del studio.
- ~~No se ha probado que la RLS aísle de verdad~~ → **VERIFIED** el
  2026-09-14 (TASK-004), con la sesión de un cliente real contra los datos de
  los otros cinco tenants. Queda sin probar el sentido recíproco y el rol
  `miembro`, y sin automatizar.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.
