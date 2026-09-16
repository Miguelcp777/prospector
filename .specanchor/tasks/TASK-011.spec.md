---
type: task-spec
id: TASK-011
status: in_progress
created: 2026-09-16
modules: [app-web]
behavior_preserving: false
---

# Tarea: elegir a quién se escribe en Mensajes

## Petición

Miguel, con la pantalla delante: «en la sección de mensajes quiero poder
elegir si envío mensajes a leads conseguidos en la prospección, si lo envío a
mis propias listas de clientes o a ambos».

Viene de dos preguntas anteriores del mismo hilo —«dónde puedo activar o
desactivar el envío a unos u otros»— cuya respuesta honesta fue *en ningún
sitio, todavía no existe*. Esta tarea construye la parte que **sí puede
existir hoy**, y deja escrito por qué no es la otra.

## Comportamiento actual

Desde TASK-010 un lead lleva su procedencia en `leads.fuente`: `places` si lo
encontró el descubrimiento, `lista` si lo aportó el cliente en un Excel. La
columna existe, se rellena y **nadie la mira**.

`Mensajes.tsx` filtra por campaña (`leads.campaign_id`) y por texto. Desde el
volcado, **una campaña puede tener las dos procedencias mezcladas**, así que
el filtro de campaña ya no separa lo que el cliente necesita separar: son dos
grupos con marco legal distinto —correo en frío frente a cartera aportada por
el cliente— y hoy se leen y se mandan revueltos.

## Resultado deseado y aceptación

- **TASK-011/REQ-001** · En Mensajes se puede acotar la lista de borradores a
  los de prospección, a los de listas propias, o a los dos.
- **TASK-011/REQ-002** · Cada borrador dice a cuál de los dos grupos
  pertenece, sin tener que abrirlo.
- **TASK-011/REQ-003** · La pantalla no da a entender que esto autorice o
  frene ningún envío.

- **TASK-011/AC-001** · Con «Solo mis listas» no aparece ningún mensaje cuyo
  lead tenga `fuente <> 'lista'`.
- **TASK-011/AC-002** · Con «Solo prospección» no aparece ninguno con
  `fuente = 'lista'`.
- **TASK-011/AC-003** · Las dos cifras parciales suman la del filtro «ambos»,
  sobre el mismo conjunto de campañas.
- **TASK-011/AC-004** · El filtro se combina con el de campaña y con el
  buscador sin pisarlos.
- **TASK-011/AC-005** · El contador y el estado vacío dicen la verdad con el
  filtro puesto: «no hay de este grupo» no es «no hay mensajes».

## Alcance

Un solo archivo de código: `frontend/src/pages/Mensajes.tsx`. Sin migración,
sin RPC, sin permisos nuevos — `leads.fuente` ya es legible por su dueño a
través de la RLS de `leads`, y el filtro viaja como un `eq`/`neq` sobre la
relación que la consulta ya incrusta.

## Lo que esto NO es, y es la mitad de la tarea

**No es el interruptor de autorización.** Ese es otro, no existe, y cuando
exista no vivirá aquí:

| | Esto | Lo que falta |
|---|---|---|
| Qué hace | acota lo que ves y sobre lo que actúas | decide si el envío masivo sale |
| Dónde | Mensajes, en el navegador | `tenants.envio_en_frio_autorizado` y `campaigns.enviar_a_descubiertos` |
| Quién manda | quien mira la pantalla | el administrador, y luego el cliente |
| Dónde se aplica | en ningún sitio: es una consulta | en `encolar_envio` **y** al reclamar la tarea |

Hoy el envío es manual —se manda desde el buzón propio y se marca «Ya lo he
enviado»—, así que acotar la lista **es** la forma de elegir a quién se
escribe. Eso lo hace un control conectado a algo, y no otro botón muerto como
los tres de TASK-006 y TASK-007.

Lo que no puede hacer, por `INV-WEB-001`: esconder mensajes de una pantalla no
impide nada. Cualquiera con la clave publicable los lista desde la consola.
Por eso la pantalla no promete seguridad, y el día que exista el envío
automático la comprobación irá en la base, no aquí.

## Anclas afectadas y justificación del impacto

`modules/app-web.spec.md`. Clasificación **contract**: es comportamiento nuevo
y visible de la pantalla, y sobre todo necesita que quede escrita la frontera
entre este filtro y los interruptores que vendrán, porque confundirlos es el
error caro. Entra como `INV-WEB-010`.

`global/producto.spec.md` **no** se toca en esta tarea. `RESTR-PROD-003`
—«el correo se dirige a buzones corporativos, no a personas»— ya quedó
desfasada con TASK-010 y su corrección va con la migración de envío, donde el
producto cambia de significado de verdad. Anotarlo aquí a medias sería peor
que dejarlo pendiente a la vista.

## Verificación prevista

Contra la base real, con la sesión del tenant: contar los borradores de cada
grupo con una consulta equivalente y comprobar que la pantalla enseña esas
mismas cifras y que suman el total. Y abrir la pantalla: tipar y compilar no
es funcionar, que es exactamente lo que acaba de costar cuatro defectos en las
pantallas de TASK-010.

## Evidencia

- **EV-001** · La partición, medida sobre las **619** filas de `messages` de la
  base real:

  | | |
  |---|---|
  | todos | 619 |
  | `fuente = 'lista'` | 0 |
  | `fuente <> 'lista'` | 619 |
  | `fuente is null` | **0** |
  | en los dos filtros a la vez | **0** |

  Los dos predicados son **disjuntos y exhaustivos**, y no hay agujero de
  lógica ternaria: `leads.fuente` es `not null` desde `schema.sql:105`, así que
  `<> 'lista'` no se traga ninguna fila en silencio. Esto es lo que sostiene
  AC-003 como propiedad, no como una suma que salió bien un día.

- **EV-002** · **La mitad interesante no se puede medir todavía**, y conviene
  decirlo antes que esconderlo: **cero** de los 619 mensajes vienen de una
  lista, porque nadie ha volcado una lista en una campaña y generado sus
  mensajes. Así que hoy «Solo mis listas» enseña el estado vacío y «Solo
  prospección» enseña lo mismo que «ambas».

  No se puede fabricar el caso sin tocar la cuenta de un cliente: el tenant
  está en versión de prueba y sus tres campañas tienen 920, 717 y 50 leads,
  todas en el techo de 50 — comprobado, el volcado se rechaza en las tres.
  Sacarlo del modo demo para poder probar esto es una decisión de Miguel, no
  mía. **AC-003 queda medido en el caso degenerado y NOT_VERIFIED en el
  distintivo.**

- **EV-003** · `npx tsc -b --force` → 0. `npm run build` → correcto, principal
  642,24 kB (179,65 kB comprimido), sin chunk nuevo: el filtro no arrastra
  código.
- **EV-004** · `node scripts/pruebas-del-studio.mjs` → **sin fallos nuevos**,
  los cuatro conocidos de siempre. `npm run test:importacion` → **31 de 31**,
  `# fail 0`.
- **EV-005** · Revisión del diff en las dos direcciones. Lo que la pantalla
  afirma sobre sí misma, literal: «Acota lo que ves y sobre lo que actúas. No
  autoriza ni frena ningún envío: hoy los correos salen de tu buzón, uno a
  uno.» Y el estado vacío se ramifica por el filtro, así que «no hay mensajes»
  ya no se dice cuando lo que no hay es de un grupo. Es evidencia OBSERVED del
  código, no de la pantalla en marcha.
- **EV-006** · _(pendiente: la pantalla abierta, después del despliegue)_

## Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-003 | Partición disjunta y exhaustiva sobre las 619 filas | **pass** | EV-001 |
| REQ-001 | AC-001 | `= 'lista'` sobre la base: 0 filas, ninguna con otra fuente | **pass** (degenerado) | EV-001, EV-002 |
| REQ-001 | AC-002 | `<> 'lista'` sobre la base: 619, ninguna de lista | **pass** | EV-001 |
| REQ-002 | AC-002 | La procedencia viaja en la consulta y se pinta por tarjeta | **pass** · tipos y build | EV-003 |
| REQ-003 | AC-005 | Revisión del diff: qué afirma la pantalla y cómo se ramifica el estado vacío | **pass** · OBSERVED, no en marcha | EV-005 |

**Lo que falta por medir, y no se da por bueno:** AC-004 (combinar con campaña
y buscador) y la comprobación **en pantalla** de AC-005 —que el contador y el
estado vacío digan la verdad con el filtro puesto— necesitan la pantalla
abierta con una sesión. El preview local redirige a la entrada y
no hay forma legítima de entrar desde aquí, así que se comprueban **después de
fusionar**, contra producción — igual que se hizo con TASK-010, y con la misma
advertencia: tipar y compilar no es funcionar. Eso costó cuatro defectos en
las tres pantallas de la importación.

## Revisión final

- Cobertura documental: _(pendiente del guard)_
- Spec → Código: _(pendiente de EV-005)_
- Código → Spec: _(pendiente de EV-005)_
