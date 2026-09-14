---
type: global-spec
status: ready
last_reviewed: 2026-09-14
---

# Comportamiento de producto

## Propósito

Qué promete Prospector a quien lo usa, y qué no. Es el contrato que hace que
un cambio técnico correcto pueda ser, aun así, incorrecto.

## Comportamiento actual, con estado de evidencia

| Afirmación | Estado | Fuente |
|---|---|---|
| El recorrido es de seis pasos, y el orden lo imponen los datos | OBSERVED | `frontend/src/lib/recorrido.tsx`, `pages/Campana.tsx` |
| El estado del recorrido se deduce, no se guarda | OBSERVED | `Campana.tsx`, comentario de cabecera |
| Una cuenta nueva pasa por una bienvenida antes de entrar | VERIFIED | probado en producción tras la 051 |
| Los esenciales son nombre, actividad, descripción y ciudad | OBSERVED | `frontend/src/lib/perfil-negocio.ts`, `ESENCIALES` |
| El sexto paso, el envío, **no existe todavía** | OBSERVED | `Campana.tsx`, paso 6 |
| El modo demo limita leads y mensajes por campaña, por cliente | OBSERVED | 039, 042, 045 |
| Los leads de la demo pública son siempre simulados | OBSERVED | `demo/README.md` |

## Comportamiento pretendido

- **INTENT-PROD-001** · La aplicación **no le cuenta al cliente lo que cuesta
  operarla**. Los límites se dicen —hace falta saber por qué una búsqueda no
  arranca— pero no el precio, ni el consumo del servicio, ni la palabra
  «gasto». El desglose de coste vive solo en el panel de administración.
  Decidido y aplicado en la 053.
- **INTENT-PROD-002** · La interfaz del cliente no enseña rutas del
  repositorio, nombres de tabla ni tareas internas pendientes.
- **INTENT-PROD-003** · En el asistente de IA, modo simple: si el modelo
  falla, se devuelve el error. No se compone un correo de plantilla
  disfrazado de generado.
- **INTENT-PROD-004** · Lo que el cliente configura una vez —su negocio— llega
  puesto a la campaña, al asistente y al redactor. No se vuelve a pedir.

## Restricciones

- **RESTR-PROD-001** · No se envía a nadie hasta que exista la ingesta de
  rebotes y quejas (`docs/decisiones/0004`, sección final). `enviar-prueba`
  manda solo a la dirección del propio usuario, sacada del token.
- **RESTR-PROD-002** · Un mensaje sin enlace de baja no sale, ni de prueba.
- **RESTR-PROD-003** · El correo se dirige a buzones corporativos, no a
  personas (`docs/compliance.md`).

## Invariantes

- **INV-PROD-001** · Quien firma el correo es el negocio del cliente, o la
  empresa que la campaña declare. Nunca el nombre del producto ni el de la
  cuenta cuando la campaña dice otro (043).
- **INV-PROD-002** · Si la campaña declara empresa propia, los datos del
  tenant —sector, ciudad, teléfono, web, horario— **no** se le atribuyen
  (043, 051).
- **INV-PROD-003** · Un enlace del pie legal se dibuja solo si tiene texto y
  destino. Un enlace legal muerto promete un derecho que no se puede ejercer.

## Accesibilidad

- **INV-PROD-004** · Ningún texto de la interfaz baja del mínimo WCAG AA
  (4.5:1 normal, 3:1 grande) en ninguno de los dos temas. VERIFIED el
  2026-09-14 sobre las nueve secciones, la campaña abierta y el studio, a 375,
  960 y 1440 px.
- La medición tiene que componer fondos translúcidos, entender
  `color(srgb …)` y **contar la opacidad heredada**. Los tres se han dado.

## Fuera de alcance

Analítica de tráfico. Lo que se mide son operaciones que cuestan dinero y
objetos creados.

## Incógnitas

- **UNKNOWN** · Ningún fisioterapeuta —ni ningún cliente real— ha validado la
  lista de segmentos. La Fase 0 sigue sin cerrar por eso (`docs/roadmap.md`).
- **UNKNOWN** · Nadie ha diseñado un correo entero con el studio de principio
  a fin y lo ha enviado a una bandeja real.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.
