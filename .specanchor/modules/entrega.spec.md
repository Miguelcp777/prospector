---
type: module-spec
module: entrega
status: ready
source_paths:
  - .github/*
  - scripts/*
last_reviewed: 2026-09-14
---

# Módulo: entrega

## Responsabilidad

Lo que se ejecuta solo cuando alguien empuja código: la integración continua y
los comprobadores que invoca. No despliega nada —de eso se encarga Netlify por
su cuenta— y no toca la base de datos.

Es el módulo más joven del proyecto y el único que no existía en la adopción de
SDD: hasta el 2026-09-14 la casilla «no hay CI» estaba escrita en dos specs
globales como el mayor riesgo operativo.

## Propiedad del código

- `.github/workflows/ci.yml` — las tres comprobaciones y cuándo corre cada una.
- `scripts/pruebas-del-studio.mjs` — ejecuta las pruebas del studio y decide si
  el resultado es aceptable.
- `scripts/fallos-conocidos.json` — la lista de fallos tolerados, con su motivo.
- `scripts/sellar-revision.mjs` — sella la revisión del informe de impacto.

## Interfaces públicas

Ninguna hacia el producto. Sus consumidores son GitHub Actions y quien quiera
ejecutar lo mismo en local:

```
node scripts/pruebas-del-studio.mjs
node scripts/sellar-revision.mjs .specanchor/evidence/impact-review.json /tmp/ir.json
```

## Qué se ejecuta y cuándo

| Trabajo | Se dispara en | Qué hace |
|---|---|---|
| `frontend` | pull request **y** empujón a `main` | `npm ci`, `tsc -b --force`, `npm run build`, pruebas del studio |
| `contratos` | solo pull request | sella la revisión y ejecuta el guard con `--base origin/<rama destino>` |
| `inventario` | solo empujón a `main` | guard con `--baseline`: ningún archivo material sin módulo |

El reparto no es simetría mal hecha. El guard con `--base` compara
`merge-base(destino, HEAD) → HEAD`; en un empujón a `main` esa comparación es
vacía y no validaría nada. El inventario sí dice algo en ese momento.

## Invariantes de dominio

- **INV-ENT-001** · El CI **informa, no frena**. Exigir que estas
  comprobaciones pasen antes de fusionar es una protección de rama: un ajuste
  del repositorio en GitHub, no un archivo de este repositorio, y necesita
  autorización aparte. **No se ha tocado desde aquí** —OBSERVED: no hay en el
  árbol nada que pueda tocarla—. En qué estado está hoy es **UNKNOWN**: no se
  ha consultado, porque `gh` no está instalado en esta máquina.
- **INV-ENT-002** · Ningún comprobador marca una prueba como pasada por su
  cuenta. `sellar-revision.mjs` toca **solo** el campo `revision`; `result`,
  `evidence` y las clasificaciones se copian tal cual. Un informe que la
  tubería pudiera rellenar sola dejaría de ser evidencia.
- **INV-ENT-003** · La rama de destino sale de `github.base_ref`, nunca de
  `main` escrito a mano. Una pull request contra una rama de trabajo se
  compararía contra el sitio equivocado y el guard diría que no hay cambios
  relevantes —que es como este guard dice «todo bien» cuando no ha mirado
  nada—.
- **INV-ENT-004** · La lista de fallos tolerados se poda sola o rompe: el
  comprobador falla también si una prueba de la lista **empieza a pasar**, o si
  desaparece del banco. Una lista de excepciones que nadie revisa acaba tapando
  una prueba que volvió a romperse.
- **INV-ENT-005** · No hay secretos en este módulo. El CI no necesita
  credenciales: no despliega, no llama a Supabase y no toca proveedores de
  pago. `permissions: contents: read` lo deja por escrito.

## Por qué las pruebas no se ejecutan a pelo

`npm run test:studio` sale **siempre** con código 1. Son 75 pruebas, pasan 71 y
fallan 4 desde el porte de la V45; las cuatro están explicadas una por una en
`docs/decisiones/0005-v45-al-studio-de-la-app.md`, sección «Estado», y ninguna
se arregla sin decidir antes si merece la pena.

Un CI que ejecutara el comando directamente estaría en rojo desde el primer
día, y un rojo permanente no lo mira nadie: es peor que no tener CI, porque
además da la sensación de tenerlo.

De ahí `scripts/fallos-conocidos.json`. Tolera esas cuatro **por nombre** y
rompe con cualquier otra. El comprobador contrasta además su propio recuento
con el resumen de `node --test`: si el parseo de TAP se desalineara, lo que
dijera después sería una lectura inventada, y prefiere no decir nada.

## Lo que el sellado de revisión cuesta

El guard exige que `revision` en el informe de impacto sea igual a HEAD. Un
informe se escribe **antes** del commit que lo lleva dentro, así que no puede
contener el hash de ese commit. En local se vuelve a sellar a mano; en la
tubería no hay nadie, y además GitHub no revisa el commit del autor sino un
commit de fusión sintético que no existe en ninguna máquina.

Se sella en la tubería, sobre una copia. **Y eso afloja la atadura**: un
informe viejo también pasaría ese control concreto. Lo que sigue protegiendo es
el resto del guard, que exige una fila por cada archivo cambiado — un informe
rancio se cae en cuanto el cambio toca un archivo que no figura en él.

Dicho sin adornos: el CI comprueba que el informe **cubre** el cambio, no que
se escribiera para él. Eso último no lo puede comprobar una máquina.

- **INV-ENT-006** · La copia sellada se escribe **dentro del árbol**, en
  `.specanchor/evidence/impact-review.sellado.json`, ignorada por git. El guard
  rechaza con `Path outside repository` cualquier ruta de fuera, así que el
  temporal del ejecutor no sirve. `sellar-revision.mjs` comprueba el destino y
  lo explica antes de escribir nada. VERIFIED 2026-09-14 · TASK-005 EV-004.

## Pruebas y verificación

No tiene pruebas automáticas propias —sería un CI que se comprueba a sí
mismo—. Lo que sí está medido, ejecutándolo:

| Afirmación | Estado | Evidencia |
|---|---|---|
| Con el árbol limpio, el comprobador sale 0 y lee 71 pasan / 4 fallan | VERIFIED | TASK-005 EV-001 |
| Un fallo nuevo lo rechaza | VERIFIED | TASK-005 EV-002 |
| Una prueba de la lista que pasa lo rechaza | VERIFIED | TASK-005 EV-002 |
| Una prueba de la lista que ya no existe lo rechaza | VERIFIED | TASK-005 EV-002 |
| El sellado cambia `revision` y nada más | VERIFIED | TASK-005 EV-003 |
| El guard con `--base` acepta el cambio ya commiteado | VERIFIED | TASK-005 EV-004 |
| `npm ci` concuerda con el `package-lock.json` | VERIFIED | TASK-005 EV-005 |
| El YAML del workflow es válido y declara tres trabajos | VERIFIED | TASK-005 EV-006 |
| En GitHub, `frontend` pasa y lee 71/4 **en Linux** | VERIFIED | TASK-005 EV-009 |
| En GitHub, `contratos` sella el commit de fusión y da PASS | VERIFIED | TASK-005 EV-009 |
| En GitHub, `inventario` se salta la pull request, como se diseñó | VERIFIED | TASK-005 EV-009 |

## Incertidumbres y deuda conocidas

- ~~Los tres trabajos no se han ejecutado nunca en GitHub~~ → **VERIFIED**
  2026-09-14, ejecución **#1** (PR #3), 51 s, `Success`. Ver la tabla de
  abajo. Las tres incógnitas que quedaban —`ubuntu-latest`, el commit de
  fusión sintético y la caché de npm— están resueltas.
- **UNKNOWN** · No se ha mirado si `main` tiene protecciones de rama, y no
  se han tocado. Si no las tiene, un rojo del CI no impide fusionar nada:
  avisa. Activarlas es una decisión de Miguel en los ajustes del repositorio.
- **UNKNOWN** · Nada comprueba las Edge Functions ni las migraciones. El CI
  cubre el frontend y los contratos; `supabase/` sigue sin una sola prueba
  automática.
- **OBSERVED** · No hay entorno de pruebas. El CI mide lo que se va a
  desplegar, pero no lo despliega en ningún sitio donde se pueda mirar antes
  de que lo vea un cliente.

## Historial de cambios

- 2026-09-14 · Creado con TASK-005. Primer CI del proyecto.
- 2026-09-14 · Ejecutado por primera vez en GitHub (PR #3, ejecución #1): los
  tres trabajos se comportaron como dice esta spec. Y las acciones suben a
  **v7**: con `checkout@v4`, `setup-node@v4` y `setup-python@v5` la ejecución
  avisó de que apuntan a Node 20, ya obsoleto, y GitHub las estaba forzando a
  Node 24. Un aviso hoy es una rotura dentro de unos meses. Comprobado en la
  ejecución **#2**: verde en 42 s y sin una sola anotación.
