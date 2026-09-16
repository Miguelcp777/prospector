---
type: task-spec
id: TASK-010
status: verified
created: 2026-09-16
modules: [datos, app-web]
behavior_preserving: false
---

# Tarea: importar listas de contactos del cliente

## 1. Petición

Miguel: «quiero que el usuario pueda subir sus propios clientes, con sus emails, y
poder mandarles los mensajes que ha creado en las plantillas. Cada cliente lo tendrá
en un Excel distinto — ¿cómo detectamos qué columna lleva el email?».

## 2. Comportamiento actual

- **VERIFIED** · La única forma de que exista un destinatario es el descubrimiento de
  Google Places. `supabase/functions/descubrir/index.ts:262-300` es el **único**
  punto de inserción en `leads` de todo el repositorio.
- **VERIFIED** · No hay ningún parser de CSV ni Excel. `frontend/package.json` no
  tiene papaparse, xlsx ni equivalente; la única librería de parseo del proyecto es
  `npm:unpdf` dentro de `supabase/functions/leer-documento/`.
- **VERIFIED** · Ningún `<input type="file">` de la aplicación acepta `.csv` ni
  `.xlsx`. Los cinco que hay aceptan imágenes o PDF/Word.
- **VERIFIED** · `leads.campaign_id` es `not null` y `messages.lead_id` es
  `not null references leads(id)`: todo el camino mensaje → plantilla → supresión →
  historial cuelga de `leads`.
- **VERIFIED** · `leads.fuente` tiene `default 'places'` y **no tiene `check`**. Una
  inserción directa quedaría etiquetada como si viniera de Places.
- **VERIFIED** · No existe envío masivo. `jobs.tipo` admite
  `('descubrir','enriquecer','puntuar','redactar')` desde `013:17-19`; no hay
  `encolar_envio` ni worker de envío.

## 3. Comportamiento pretendido

El cliente sube un CSV, un `.xlsx` o pega celdas; la aplicación **propone** qué
columna es cada cosa mirando el contenido; él confirma; la lista se guarda una vez y
se puede volcar en las campañas que quiera.

## 4. Alcance

`supabase/054_listas_de_contactos.sql`, tres módulos puros en `frontend/src/lib/`,
tres pantallas en `frontend/src/pages/`, los enganches de `App.tsx` y `Campana.tsx`, y
las primeras pruebas automáticas de `app-web`.

## 5. Fuera de alcance

- **El envío masivo.** Sigue sin existir y esta tarea no lo construye. Lo que falta
  está enumerado en el plan; el primer paso es desplegar `correo-webhook`.
- **Los dos interruptores de envío en frío** (`tenants.envio_en_frio_autorizado` y
  `campaigns.enviar_a_descubiertos`). Van con la migración de envío, **no aquí**:
  hoy no habría nada que gobernar, y poner un control que no puede hacer nada es
  exactamente lo que `RESTR-STU-003` existe para frenar y lo que TASK-006 y TASK-007
  acaban de costar cuatro despliegues en curar. Lo que sí entra ahora es su cimiento:
  `leads.fuente = 'lista'`, la columna sobre la que van a discriminar.
- **Nada en `supabase/functions/`.** Una Edge Function nueva no está en
  `module-map.json` y rompería el job `inventario` del CI. Y no hace falta: el parseo
  cabe en el navegador y la escritura va por RPC.
- El DPA y la consulta legal. Son de Miguel, no son código, y no bloquean esto.

## 6. El marco legal cambia, y hay que decirlo

`docs/compliance.md:13-15` apunta a **buzones genéricos de empresa** porque toda su
estrategia de riesgo está pensada para **correo en frío**: escribir a quien no te ha
dado su dirección. Una lista que el cliente aporta de su propia cartera es otra cosa:
él es responsable del tratamiento, Prospector encargado, y la base legal la pone él.

Lo que **no** cambia y sigue siendo obligatorio en los dos caminos: enlace de baja por
mensaje, lista de supresión global, y registro de origen del dato por lead.

Consecuencia: `RESTR-PROD-003` de `global/producto.spec.md` («el correo se dirige a
buzones corporativos, no a personas») deja de valer para todo el producto y pasa a
valer para el camino de descubrimiento. **Se corrige cuando existan los interruptores
de envío**, que es cuando la distinción tiene efecto; anotado aquí para que no se
pierda.

## 7. Requisitos

- **TASK-010/REQ-001** · Un CSV, un `.xlsx` o un pegado se convierten en una lista de
  contactos sin que el cliente tenga que preparar el archivo.
- **TASK-010/REQ-002** · La columna del email se propone automáticamente y la
  propuesta se puede corregir. Nunca se importa sin confirmación.
- **TASK-010/REQ-003** · Una lista se puede volcar en varias campañas, y volcarla dos
  veces no duplica nada.
- **TASK-010/REQ-004** · Queda registrado de dónde salió cada dirección, con detalle
  suficiente para responder a una reclamación.
- **TASK-010/REQ-005** · Los contactos de un tenant no son alcanzables por otro.
- **TASK-010/REQ-006** · Los topes existentes —modo demo incluido— siguen
  aplicándose. Importar no es la puerta de atrás del techo.

## 8. Criterios de aceptación

- **TASK-010/AC-001** · Sobre seis archivos de muestra (UTF-8 con coma, UTF-8-BOM con
  `;`, Windows-1252 con acentos, comillas con comas y saltos dentro, `.xlsx`, TSV
  pegado), el parseo devuelve las filas y las celdas correctas, y los acentos son los
  del archivo.
- **TASK-010/AC-002** · La detección propone la columna de email correcta en los seis;
  y en un archivo sin ninguna columna de correos no propone nada y no deja continuar.
- **TASK-010/AC-003** · `guardar_lista` rechaza una lista sin declaración de origen,
  sin nombre, y una que pase de `ajustes.max_contactos_por_lista`.
- **TASK-010/AC-004** · Un CSV de 8 filas construido para fallar produce los estados
  esperados (válido, normalizado, repetido, sin email, inválido) y el volcado devuelve
  las cinco cifras correctas.
- **TASK-010/AC-005** · Volcar dos veces la misma lista devuelve `insertados = 0` la
  segunda vez.
- **TASK-010/AC-006** · Con la sesión de otro tenant, la lista no se ve y
  `volcar_lista_en_campana` sobre ella responde `No autorizado`.
- **TASK-010/AC-007** · Las tres tablas tienen RLS activa y la vista tiene
  `security_invoker=on`.
- **TASK-010/AC-008** · En modo demo, una campaña con 45 leads y una lista de 20
  inserta 5 y devuelve `fuera_por_demo = 15`.
- **TASK-010/AC-009** · Cada lead importado lleva `fuente='lista'`,
  `email_origen = 'lista:<uuid>#fila-N'` y `email_capturado_en` con la fecha de la
  lista, no la del volcado.
- **TASK-010/AC-010** · `tsc -b --force`, `npm run build` y las pruebas del studio sin
  fallos nuevos (71/75), más las pruebas nuevas en verde.

## 9. Anclas afectadas

| Ancla | Clasificación | Por qué |
|---|---|---|
| `modules/datos.spec.md` | **requirement** | Tres tablas nuevas, dos funciones, una vista, y un invariante nuevo: los contactos solo entran por `guardar_lista` |
| `modules/app-web.spec.md` | **requirement** | Tres pantallas, una sección de menú, una dependencia nueva, y las primeras pruebas automáticas del módulo |

## 10. Decisiones

- **DEC-001** · **El archivo original no se guarda.** El registro de origen se
  satisface con nombre, fecha, quién, filas y mapeo, y las filas están guardadas una a
  una con su número de fila. Guardar además el `.xlsx` duplicaría la superficie de
  datos personales sin añadir información. Consecuencia asumida: tienes las filas, no
  el archivo.
- **DEC-002** · **`contactos_de_lista` no concede `INSERT` a nadie.** La única puerta
  es `guardar_lista`, que es donde vive el tope. Una política `for all` dejaría meter
  200.000 filas con la clave publicable, igual que un límite puesto solo en el
  navegador.
- **DEC-003** · **`place_id` sintético `'email:' || email`.** Reutiliza el
  `unique (campaign_id, place_id)` que ya existe para garantizar «una dirección, un
  lead por campaña». Es un uso de esa columna fuera de su sentido original —era el
  identificador de Places— y por eso queda en un `comment on column`. A cambio, el
  revolcado es idempotente incluso con doble clic o dos pestañas, que el `not exists`
  solo no cubre.
- **DEC-004** · **`score = 80` fijo** a los importados. Sin él quedarían los últimos
  en el `order by l.score desc nulls last` de `encolar_redaccion` y se caerían del
  tope por tanda en una campaña mixta. Un contacto de la cartera del cliente no es
  peor candidato que un negocio sacado de un mapa.
- **DEC-005** · **El lead es una copia congelada; la lista es un catálogo.** Nada se
  propaga hacia atrás. Mismo principio que `messages.email_destino` (012): la
  dirección de la reclamación es la de entonces.
- **DEC-006** · **`read-excel-file` y no `xlsx`.** El `xlsx` de npm está sin mantener
  desde que SheetJS se movió a su CDN y arrastra CVE publicados; con el repositorio ya
  público y sin entorno de pruebas, no toca. Versión exacta sin `^`, import dinámico,
  y toda la superficie aislada en un archivo de doce líneas.
- **DEC-007** · **Sin paginación.** No existe ningún paginador en la aplicación.
  Inventar aquí el primero es traerse una decisión de diseño que no toca ahora.

## 11. Plan de prueba

En `§9` del plan aprobado. Lo esencial: la migración se aplica dentro de
`begin; … rollback;` antes que en serio, las tres comprobaciones de la base se hacen
leyendo `pg_class` y `pg_proc` —no suponiendo—, el aislamiento se mide con dos
sesiones reales, y el volcado se prueba con un archivo **construido para fallar**.

## 12. Evidencia

- **EV-001** · **Estructura aplicada y comprobada leyendo el catálogo**, no
  suponiéndola: RLS activa en las tres tablas (`pg_class.relrowsecurity` = 3
  de 3), `reloptions` de la vista = `security_invoker=on`,
  `pg_policies` sobre `contactos_de_lista` = **3 políticas y 0 de INSERT**, y
  `proacl` de las dos funciones = `authenticated` y `service_role`, sin `anon`
  y sin `PUBLIC`.
- **EV-002** · **Un fallo real que solo apareció ejecutando la función.** El
  primer intento del volcado murió con
  `42P10: there is no unique or exclusion constraint matching the ON CONFLICT
  specification`: `contactos_email_unico` es un índice **parcial**
  (`where email is not null`) y Postgres no lo infiere si el `ON CONFLICT` no
  repite su predicado. El ensayo estructural no lo vio porque crear una
  función no ejecuta su cuerpo.
- **EV-003** · **Prueba funcional con un CSV de ocho filas construido para
  fallar**, dentro de una transacción deshecha y con la sesión de un cliente
  real simulada (`request.jwt.claims`):

  | | Esperado | Medido |
  |---|---|---|
  | Filas leídas / guardadas | 8 / 7 | **8 / 7** |
  | Estados | la 3 ausente, 4 sin correo, 5 inválido | `1:valido 2:valido 4:sin_email 5:email_invalido 6:valido 7:valido 8:valido` |
  | Primer volcado | 3 ins · 1 dup · 1 sup · 2 sin | **3 / 1 / 1 / 2 / 0** |
  | Segundo volcado | **0 insertados** | **0 / 4 / 1 / 2 / 0** |

  Y los tres leads creados: `  BEA@EJEMPLO.ES  ` normalizado a
  `bea@ejemplo.es`; la fila sin nombre con `nombre = "soloemail"`, el respaldo
  a la parte local; los tres con `fuente='lista'`,
  `email_origen = 'lista:<uuid>#fila-N'` y `email_capturado_en` **igual a la
  fecha de la lista**, no a la del volcado.
- **EV-004** · Rechazos, aislamiento y modo demo, también en transacción
  deshecha:

  | Caso | Resultado |
  |---|---|
  | Sin declaración de origen | «Una lista no se guarda sin la declaración de origen de los datos» |
  | Sin nombre · origen desconocido · cero filas | rechazados, cada uno con su motivo |
  | Pasa del tope | «admite como mucho 3 contactos, y esta trae 4» |
  | **Volcar en campaña de otro tenant** | **`No autorizado`** |
  | **Modo demo, 45 leads + lista de 20** | **insertados = 5, fuera_por_demo = 15** |
  | Listas y contactos que ve el otro tenant | **0 y 0** |

- **EV-005** · **31 pruebas automáticas**, las primeras de `app-web`:
  `npm run test:importacion` → 31 de 31. Cubren codificación (UTF-8, BOM,
  UTF-16, Windows-1252), delimitador (`;` contra coma decimal, comillas),
  tokenizado (comillas escapadas, saltos dentro de celda, `` suelto, última
  línea sin salto, líneas en blanco que **no** consumen número de fila),
  detección (sin cabecera, en inglés, columna casi vacía, dos columnas de
  correos, ninguna, basura al final) y un `.xlsx` real.
- **EV-006** · **Dos fallos míos los encontraron las pruebas, no yo:**
  1. El criterio de ambigüedad estaba mal planteado. Con «Email» y «Email 2»
     los puntos se separan 0,1 y no saltaba el aviso. Lo ambiguo no es que
     empaten los puntos: es que **haya otra columna también llena de correos**.
  2. La guarda de «menos de cinco celdas no se arriesga» vetaba una columna
     titulada literalmente «Correo electrónico» en una hoja de tres filas —
     justo el caso de «tengo doce clientes». Esa guarda existe para no
     adivinar por contenido, no para ignorar una cabecera exacta.
- **EV-007** · `npx tsc -b --force` salida 0 · `npm run build` salida 0 ·
  `node scripts/pruebas-del-studio.mjs` salida 0 (71/4, sin fallos nuevos) ·
  inventario **378 materiales, 0 sin mapear**.
- **EV-008** · El trozo de Excel se separa como se diseñó:
  `excel-8UdyMTSc.js` 0,36 kB + `browser-C0B-jtZt.js` **52,3 kB**, que solo
  viajan si alguien suelta un `.xlsx`. El bundle principal pasa de 614,6 a
  641,1 kB por las tres pantallas.

## 13. Trazabilidad

| Requisito | Aceptación | Verificación | Resultado | Evidencia |
|---|---|---|---|---|
| REQ-001 | AC-001 | 31 pruebas sobre CSV, TSV, pegado y un `.xlsx` real | **pass** | EV-005 |
| REQ-002 | AC-002 | pruebas de detección, incluido el caso sin columna | **pass** | EV-005, EV-006 |
| REQ-003 | AC-005 | doble volcado contra la base | **pass** | EV-003 |
| REQ-004 | AC-009 | lectura de `leads` tras el volcado | **pass** | EV-003 |
| REQ-005 | AC-006, AC-007 | dos sesiones simuladas + `pg_class` | **pass** | EV-001, EV-004 |
| REQ-006 | AC-003, AC-008 | topes y modo demo | **pass** | EV-004 |
| — | AC-004 | CSV de ocho filas hecho para fallar | **pass** | EV-003 |
| — | AC-010 | tipos, build y pruebas | **pass** | EV-007 |

## 14. Revisión final

- Cobertura documental: **PASS**
- Spec → Código: **ALIGNED** — las tablas, las dos funciones y sus permisos
  son los que las specs describen, comprobado contra el catálogo de Postgres
  y no contra el archivo.
- Código → Spec: **ALIGNED** — los cuatro invariantes nuevos de `datos` salen
  de lo que se midió, no al revés.

## 15. Lo que esta tarea NO deja verificado

- **Las tres pantallas no se han abierto en un navegador con sesión.** Tipan,
  compilan y el build las parte bien, pero eso no es haberlas usado. La
  lección de TASK-006 y TASK-007 vale igual aquí: compilar no es funcionar, y
  el preview local redirige a la pantalla de entrada.
- **El camino de Excel está probado con la entrada `/node`**, no con la
  `/browser` que usa `excel.ts`. Lo verificado es el parser y la forma de la
  API v9 —que es donde ya hubo una sorpresa—, no el envoltorio de doce líneas.
- **La migración ya está aplicada a producción** y la PR va después. Es el
  orden que el plan pedía, pero conviene que esté dicho: si la revisión cambia
  el SQL, la base y el repositorio divergen hasta que se vuelva a aplicar.
- **Ningún cliente ha importado una lista de verdad.** Los 2.000 contactos son
  un tope, no una medición: lo más grande que ha pasado por aquí son ocho
  filas y una lista generada de veinte.
