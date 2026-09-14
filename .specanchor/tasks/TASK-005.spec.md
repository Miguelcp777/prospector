---
type: task-spec
id: TASK-005
status: verified
created: 2026-09-14
modules: [entrega]
behavior_preserving: true
---

# Tarea: montar el CI

## 1. Petición

«Monta el CI.» Dicho después de que dos specs globales dejaran escrito, con
estado VERIFIED, que no había ninguno y que eso era el mayor riesgo operativo
del proyecto.

## 2. Comportamiento actual

- **VERIFIED** · No existe `.github/`. Nada se ejecuta solo.
- **VERIFIED** · Las tres comprobaciones que existen —`npx tsc -b --force`,
  `npm run build`, `npm run test:studio`— se lanzan a mano y solo si alguien se
  acuerda.
- **VERIFIED** · `npm run test:studio` sale **siempre** con código 1: 75
  pruebas, 71 pasan, 4 fallan desde el porte de la V45.
- **VERIFIED** · `main` despliega a producción en Netlify sin intermediarios, y
  la base de datos es la de seis clientes reales.
- **OBSERVED** · `scripts/` existe con un solo `.gitkeep`, y estaba excluido en
  `anchor.yaml` precisamente por eso.

## 3. Comportamiento pretendido

Las mismas tres comprobaciones, ejecutadas solas en cada cambio, más la
cobertura documental del guard en las pull requests. Sin credenciales, sin
desplegar nada y sin tocar ajustes del repositorio.

## 4. Alcance

`.github/workflows/ci.yml`, tres archivos nuevos en `scripts/`, un módulo
`entrega` en el mapa con su spec, y la actualización de las dos specs globales
que afirmaban que no había CI.

## 5. Fuera de alcance

- **Las protecciones de rama.** Son un ajuste del repositorio en GitHub, no un
  archivo, y necesitan autorización de Miguel. Hasta que se activen, el CI
  **avisa y no frena**.
- Probar Edge Functions o migraciones. `supabase/` sigue sin una sola prueba
  automática, y montarlas es un trabajo con su propia decisión detrás.
- Un entorno de pruebas. Sigue sin haberlo.
- Arreglar los cuatro fallos conocidos. Se toleran por nombre; arreglarlos es
  otra tarea.

## 6. Anclas afectadas

| Ancla | Clasificación | Por qué |
|---|---|---|
| `modules/entrega.spec.md` | **requirement** | No existía. Es el contrato del módulo nuevo |
| `global/puesta-en-marcha.spec.md` | correction | Decía «No hay CI» con estado VERIFIED. Deja de ser cierto |
| `global/calidad-y-seguridad.spec.md` | correction | Lo mismo, y la tolerancia a los 4 fallos pasa de INTENT a regla ejecutable |
| `module-map.json`, `anchor.yaml` | contract | Declaran el módulo nuevo y sacan `scripts/` de las exclusiones |

## 7. Requisitos

- **TASK-005/REQ-001** · Tipos, build y pruebas del studio se ejecutan solos en
  cada pull request y en cada empujón a `main`.
- **TASK-005/REQ-002** · Las pruebas dan verde con exactamente los cuatro
  fallos conocidos y rojo con cualquier otro resultado, incluida una lista
  rancia.
- **TASK-005/REQ-003** · La cobertura documental del guard se comprueba en las
  pull requests, contra la rama de destino real de la tubería.
- **TASK-005/REQ-004** · Ningún archivo material queda sin módulo, y eso se
  comprueba solo.
- **TASK-005/REQ-005** · Ningún paso de la tubería declara resultados por su
  cuenta ni toca ajustes del repositorio.

## 8. Criterios de aceptación

- **TASK-005/AC-001** · Con el árbol como está, `node
  scripts/pruebas-del-studio.mjs` sale **0** y lee 71 que pasan y 4 que fallan.
- **TASK-005/AC-002** · Sale **1**, nombrando el motivo, en los tres casos: un
  fallo nuevo, una prueba de la lista que ha empezado a pasar, y una prueba de
  la lista que ya no se ejecuta.
- **TASK-005/AC-003** · `sellar-revision.mjs` produce una copia que difiere del
  original en **una sola línea**, la de `revision`.
- **TASK-005/AC-004** · Sobre el cambio ya commiteado en una rama, el guard con
  `--base` y el informe sellado dice `Documentary coverage: PASS` y sale 0.
- **TASK-005/AC-005** · El inventario devuelve **0 archivos sin mapear** con
  los cinco archivos nuevos dentro.
- **TASK-005/AC-006** · El workflow es YAML válido y declara los tres trabajos
  con la condición de disparo que dice su documentación.
- **TASK-005/AC-007** · `npm ci` concuerda con el lock, y `tsc -b --force` y
  `npm run build` salen 0.

## 9. Enfoque

Tres trabajos, no uno, porque tienen disparadores distintos y conviene que el
que falle se vea en su nombre.

**`frontend`** hace lo de siempre. La única pieza que no es obvia es la
última: no llama a `npm run test:studio`, llama a un comprobador que lo
ejecuta y decide. El motivo está en la spec del módulo: el comando sale 1
siempre, y un CI en rojo permanente es peor que no tener CI, porque además
parece que lo tienes.

**`contratos`** solo corre en pull requests. El guard compara
`merge-base(destino, HEAD) → HEAD`; en un empujón a `main` esa comparación es
vacía. La rama de destino sale de `github.base_ref` y no de `main` escrito a
mano: una pull request contra una rama de trabajo se compararía contra el sitio
equivocado, y este guard dice «no hay cambios relevantes» exactamente igual
cuando todo está bien y cuando no ha mirado nada.

**`inventario`** solo corre al empujar a `main`, que es donde la otra
comprobación no diría nada. Falla si algún archivo se quedó sin módulo.

### La decisión incómoda: sellar la revisión

El guard exige `revision == HEAD`. Un informe se escribe antes del commit que
lo contiene, así que no puede llevar ese hash dentro; y GitHub no revisa el
commit del autor, sino un commit de fusión sintético que no existe en ninguna
máquina. Sin sellar, el trabajo `contratos` fallaría siempre.

Se sella en la tubería, sobre una copia, y **eso afloja la atadura**: un
informe viejo pasaría ese control concreto. Lo que sigue protegiendo es el
resto del guard —una fila por archivo cambiado—, que tumba cualquier informe
que no cubra el cambio actual. Queda escrito aquí y en la spec del módulo
porque es una rebaja real, no un detalle de implementación.

## 10. Impacto en datos, API o interfaz

Ninguno. No se toca una línea de producto: el frontend, las Edge Functions y el
esquema quedan byte por byte como estaban.

## 11. Compatibilidad

`anchor.yaml` pierde la exclusión de `scripts/.gitkeep`, que existía solo
porque la carpeta estaba vacía. Ahora `scripts/*` pertenece a `entrega`, y el
`.gitkeep` se queda: quitarlo no arregla nada y sería un borrado más que
justificar.

## 12. Plan de prueba

Cada criterio se ejecuta, y los de rechazo se ejecutan **provocando el
rechazo**: un comprobador de excepciones que nunca ha rechazado nada no está
verificado, está estrenado.

## 13. Riesgos

- **Los tres trabajos no se han ejecutado nunca en GitHub.** Lo medido es cada
  pieza en local, con los mismos comandos, en Windows. Falta ver
  `ubuntu-latest`, el commit de fusión sintético y la caché de npm. Es el
  riesgo principal de esta tarea y no se puede cerrar sin empujar.
- **Sin protecciones de rama, un rojo no impide nada.** El CI informa.
- **La lista de fallos conocidos puede envejecer.** Mitigado: el comprobador
  falla también si una de las cuatro empieza a pasar o desaparece.
- **Vuelta atrás**: borrar `.github/` deja el proyecto exactamente como estaba.
  Nada del producto depende de esto.

## 14. Lista de ejecución

- [x] Specs persistentes revisadas y actualizadas
- [x] Implementación completa
- [x] Verificación completa (en local)
- [x] Revisión en los dos sentidos
- [x] Guard de cobertura documental

## 15. Registro de decisiones

- **DEC-001** · Tolerar los cuatro fallos por **nombre**, no por número. Un
  umbral de «no más de 4 fallos» dejaría pasar un fallo nuevo el día que se
  arreglara uno viejo.
- **DEC-002** · Fallar también cuando un fallo tolerado se arregla. Molesta una
  vez; una lista sin podar tapa una prueba rota para siempre.
- **DEC-003** · Contrastar el parseo de TAP con el resumen de `node --test`. Si
  no cuadran, el comprobador prefiere fallar a informar de una lectura
  inventada.
- **DEC-004** · Sellar la revisión en la tubería, con el coste escrito. La
  alternativa —quitar esa comprobación del guard— tocaría una herramienta que
  no es nuestra.
- **DEC-005** · No declarar `engines` en `package.json`. La versión de Node se
  fija en el workflow; meterla también en el manifiesto es un sitio más que
  mantener sincronizado a cambio de nada hoy.
- **DEC-006** · No tocar protecciones de rama. Es un ajuste externo del
  repositorio y necesita autorización aparte.
- **DEC-007** · La copia sellada vive **dentro** del árbol
  (`.specanchor/evidence/impact-review.sellado.json`, ignorada por git), no en
  el temporal del ejecutor: el guard no acepta rutas de fuera. Y
  `sellar-revision.mjs` comprueba el destino y lo explica antes de escribir,
  para que el siguiente no lo descubra en un registro de GitHub.

## 16. Evidencia

- **EV-001** · `node scripts/pruebas-del-studio.mjs` con el árbol limpio:
  salida **0**, `Pasan 71 · fallan 4 · conocidos 4`, y las cuatro listadas con
  su motivo.
- **EV-002** · Mismo comprobador con tres averías inyectadas a la vez —un
  archivo de prueba que falla a propósito, una entrada de la lista quitada, y
  dos entradas falsas (una que pasa y otra inexistente)—: salida **1** y cuatro
  errores, uno por avería:
  `Fallo NUEVO: keeps upload chunks safely below the request limit` ·
  `Fallo NUEVO: prueba de humo del CI, que falla a proposito` ·
  `Ya no falla y sigue en la lista: la marca es la empresa del cliente, no una categoría` ·
  `En la lista pero no se ha ejecutado: una prueba que no existe`.
  El árbol se restauró después y `git status` volvió a quedar sin rastro.
- **EV-003** · `diff` entre el informe original y la copia sellada: **una sola
  línea**, la de `"revision"`. `result`, `evidence` y las clasificaciones
  intactas.
- **EV-004** · Guard con
  `--base main --review .specanchor/evidence/impact-review.sellado.json` sobre
  el cambio ya commiteado en la rama `monta-el-ci`:
  `Documentary coverage: PASS`, salida **0**.
  El primer intento **falló**, y merece quedar escrito: la copia sellada estaba
  en `$RUNNER_TEMP` y el guard respondió
  `CONFIG/INPUT ERROR: Path outside repository`, salida 2. Su función `safe()`
  rechaza cualquier ruta fuera del árbol. Con la copia en el temporal del
  ejecutor, el trabajo `contratos` habría fallado en la primera pull request
  sin que nadie entendiera por qué.
- **EV-005** · `npm ci --dry-run` en `frontend/`: sale 0, «added 46 packages».
  El lock concuerda con el manifiesto.
- **EV-006** · El YAML parsea con `yaml.safe_load` y declara tres trabajos
  —`frontend`, `contratos`, `inventario`— con sus pasos.
- **EV-007** · `npx tsc -b --force` salida **0** y `npm run build` salida
  **0**, 614,62 kB de bundle.
- **EV-008** · Inventario con los cinco archivos nuevos: **366 materiales, 0
  sin mapear**, y los cinco dentro de `entrega`.
- **EV-009** · **Ejecutado en GitHub**, PR #3, ejecución **#1**
  (https://github.com/Miguelcp777/prospector/actions/runs/34871837762), 51 s, estado `Success`:
  - `frontend` ✅ 47 s. El registro dice `# tests 75 / # pass 71 / # fail 4` y
    después `Pasan 71 · fallan 4 · conocidos 4` con las cuatro nombradas y
    `Sin fallos nuevos.` Mismo resultado que en Windows: la lista por nombre
    funciona en Linux.
  - `contratos` ✅ 9 s. `revision escrita: e4f0a966…` →
    `revision sellada: b8ae5d8c…`, que **no es el commit de la rama**
    (`3f31a75`) sino el commit de fusión sintético de la pull request. Es la
    demostración de que el sellado hacía falta: sin él este trabajo habría
    fallado siempre. Después, `Documentary coverage: PASS`.
  - `inventario` ⏭ saltado, que es su condición en una pull request.
  - **Un aviso**: las acciones apuntaban a Node 20, obsoleto, y GitHub las
    forzaba a Node 24. Se suben a `checkout@v7`, `setup-node@v7` y
    `setup-python@v7`.

## 17. Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-006, AC-007 | YAML válido con los tres trabajos; tipos y build | **pass** | EV-006, EV-007, EV-005 |
| REQ-002 | AC-001, AC-002 | comprobador con árbol limpio y con tres averías | **pass** | EV-001, EV-002 |
| REQ-003 | AC-004 | guard con `--base` sobre el commit de la rama | **pass** | EV-004 |
| REQ-004 | AC-005 | inventario con los archivos nuevos | **pass** | EV-008 |
| REQ-005 | AC-003 | diff del sellado; y no se tocó ningún ajuste externo | **pass** | EV-003 |

## 18. Lo que esta tarea NO deja verificado

- ~~Que el CI funcione en GitHub~~ → **VERIFIED**: ejecución #1, los tres
  trabajos como se habían diseñado (EV-009). Deja de ser un CI escrito.
- ~~Que siga funcionando con las acciones en v7~~ → **VERIFIED**: ejecución
  **#2** de la misma rama, 42 s, `Success`, y **sin una sola anotación**. El
  aviso de Node 20 desapareció, que era el motivo de subirlas.
- **En qué estado están las protecciones de rama.** No se ha consultado: `gh`
  no está instalado en esta máquina. No se han tocado.

## 19. Revisión final

- Cobertura documental: **PASS**
- Spec → Código: **ALIGNED** — el workflow ejecuta lo que la spec del módulo
  dice que ejecuta, con los disparadores que dice.
- Código → Spec: **ALIGNED** — no hay nada en el cambio que las specs no
  recojan; las dos afirmaciones globales de «no hay CI» se han corregido en vez
  de dejarlas envejecer.
