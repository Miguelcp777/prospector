# Supabase

Todo el backend vive aquí: base de datos, aislamiento, inferencia y el worker
de descubrimiento. No hay servidor propio.

## Puesta en marcha

### 1 · Crear el proyecto

En supabase.com, **región europea** (Frankfurt o Irlanda). Esto no se puede
cambiar después sin migrar. Ver `docs/compliance.md`.

### 2 · Cargar el esquema

SQL Editor, en este orden:

1. `schema.sql` — tablas, RLS, vista de resumen, función de scoring
2. `002_descubrimiento_y_demo.sql` — tareas troceadas, cuota de la demo

El 003 va más tarde: necesita que las funciones estén desplegadas.

### 3 · Secretos

```bash
supabase link --project-ref tpfjeumrvdbciktmaaii

supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GOOGLE_PLACES_API_KEY=...

# Cadenas largas y aleatorias. Genera cada una con:
#   openssl rand -hex 32
supabase secrets set WORKER_SECRETO=...
supabase secrets set SAL_DEMO=...

# El dominio de la demo. Con "*" cualquiera puede incrustar la función
# y pagas tú las llamadas a Claude.
supabase secrets set ORIGENES_PERMITIDOS=https://tu-demo.netlify.app
```

`SUPABASE_SERVICE_ROLE_KEY` no se configura: las Edge Functions ya la reciben.

### 4 · Desplegar las funciones

```bash
supabase functions deploy infer-segments
supabase functions deploy demo-inferir --no-verify-jwt
supabase functions deploy descubrir    --no-verify-jwt
```

Las dos últimas van sin JWT a propósito, y `config.toml` lo deja fijado. Lo
que las protege no es el token:

| Función | Qué la protege |
|---|---|
| `infer-segments` | JWT del usuario. La RLS sigue aplicando |
| `demo-inferir` | Cuota por IP y tope diario. No toca datos de nadie |
| `descubrir` | Cabecera `x-worker-secreto`. La llama el cron |

### 5 · Arrancar el cron

Edita `003_cron.sql` y sustituye `TU_WORKER_SECRETO` por el mismo valor que le
diste al secreto en el paso 3. Ejecútalo en el SQL Editor. A partir de ahí el
worker se despierta solo cada minuto.

### 6 · Crear el primer tenant a mano

Todavía no hay pantalla de alta:

```sql
insert into tenants (nombre, vertical, ciudad)
values ('Clínica de prueba', 'fisioterapia', 'Valencia')
returning id;

-- Después de registrar el usuario desde la app:
insert into profiles (id, tenant_id, email, rol)
values ('UUID_DE_AUTH_USERS', 'UUID_DEL_TENANT', 'tu@email.com', 'propietario');
```

## Probar la inferencia

```bash
curl -X POST https://tpfjeumrvdbciktmaaii.supabase.co/functions/v1/infer-segments \
  -H "Authorization: Bearer TU_TOKEN_DE_USUARIO" \
  -H "Content-Type: application/json" \
  -d '{"descripcion":"Clínica de fisioterapia y readaptación deportiva, cuatro fisios, mucha lesión deportiva","vertical":"fisioterapia","ciudad":"Valencia"}'
```

Sin `campaign_id` devuelve los segmentos sin guardarlos. Con él, los persiste y
marca la campaña como `inferido`.

## Probar el descubrimiento

```sql
-- Como usuario autenticado, sobre una campaña con segmentos aceptados:
select encolar_descubrimiento('UUID_DE_LA_CAMPAÑA');
```

El cron lo recoge en menos de un minuto. Para verlo avanzar:

```sql
select estado, progreso, consultas, detalle from jobs order by creado_en desc limit 5;

select estado, count(*) from job_tareas
where job_id = 'UUID_DEL_JOB' group by estado;
```

Cuando no queda ninguna tarea pendiente, el job pasa a `hecho`, se recalculan
los scores y la campaña queda `lista`.

Para dispararlo a mano sin esperar al cron:

```bash
curl -X POST https://tpfjeumrvdbciktmaaii.supabase.co/functions/v1/descubrir \
  -H "x-worker-secreto: TU_WORKER_SECRETO"
```

## Cómo está troceado el descubrimiento

Una Edge Function no aguanta una campaña entera: el wall clock son 150 s en
plan free. La unidad de trabajo no es la campaña sino **(segmento × query ×
página)**, y vive en `job_tareas`.

Cada invocación reclama unas pocas con `SKIP LOCKED`, las resuelve y se va. Si
Places devuelve `nextPageToken`, la tarea encola su continuación en vez de
seguir el bucle. El razonamiento completo, en
`docs/decisiones/0002-worker-en-supabase.md`.

Consecuencia práctica: **solapar invocaciones es inofensivo**. Dos ejecuciones
a la vez se reparten tareas distintas, no las duplican.

## Entrar con Google

El botón ya está en la app y no funciona hasta que se den estos pasos. Hasta
entonces dice "Google todavía no está activado en este proyecto", que es el
error real de Supabase traducido.

### 1 · Credenciales en Google Cloud

En console.cloud.google.com, con el proyecto que ya tiene Places habilitado:

1. **APIs y servicios → Pantalla de consentimiento OAuth.** Tipo *Externo*.
   Nombre de la app, correo de soporte y de contacto. Mientras esté en
   *Testing* solo entran los correos que añadas como usuarios de prueba;
   para abrirlo a cualquiera hay que publicarlo.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo
   *Aplicación web*.
3. En **URI de redireccionamiento autorizados**, exactamente esto:

   ```
   https://tpfjeumrvdbciktmaaii.supabase.co/auth/v1/callback
   ```

   Es el callback de Supabase, no el de la app. Si aquí se pone el dominio de
   Netlify, Google responde `redirect_uri_mismatch` sin más pista.

Salen un **Client ID** y un **Client Secret**.

### 2 · Darlos de alta en Supabase

Dashboard → Authentication → Sign In / Providers → Google. Son tres cosas y
la tercera se olvida:

1. El interruptor **Enable Sign in with Google**.
2. **Client ID** y **Client Secret**.
3. **Save**. Sin guardar, el interruptor vuelve atrás y la pantalla no avisa.

El secreto va ahí y en ningún sitio más — nunca en `frontend/`, que se
publica entero.

Mientras no esté hecho, pulsar el botón lleva a una página de Supabase con
este JSON:

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

Lo pinta Supabase, no la app: `signInWithOAuth` no valida el proveedor, solo
navega a `/auth/v1/authorize`. Que salga ese error confirma que la petición
llega bien y que solo falta el alta.

### 3 · URLs de retorno

Dashboard → Authentication → URL Configuration:

| Campo | Valor |
|---|---|
| Site URL | `https://prospector-captacion.netlify.app` |
| Redirect URLs | `https://prospector-captacion.netlify.app/**` y `http://localhost:5173/**` |

En esos patrones `.` y `/` son separadores, así que `.../**` exige que la
barra final esté. Por eso `urlDeRetorno()` la añade: `window.location.origin`
no la lleva, y sin ella Supabase descarta el `redirectTo` y devuelve al Site
URL — probando en local acabas en producción sin ningún error que lo explique.

El localhost es solo para desarrollo. **Quítalo cuando dejes de tocar el
código en local**: el token de sesión vuelve en la URL, y cada entrada de esa
lista es un sitio al que se puede hacer que vuelva.

Esto **ya hacía falta** sin Google: mientras el Site URL apunte a localhost,
los enlaces de confirmación de los registros por correo llegan rotos. Con
OAuth pasa a ser bloqueante, porque el botón manda `redirectTo` con el origen
actual y Supabase lo rechaza si no está en la lista.

### Qué pasa con las cuentas que ya existen

Supabase enlaza identidades por correo (*automatic linking*): quien ya tenga
cuenta con contraseña y entre después con Google del mismo correo cae en el
mismo usuario, no en uno nuevo. Sin eso tendría dos tenants y vería la cuenta
vacía.

### El negocio queda a medias, y es a propósito

Google no sabe a qué se dedica quien entra. El trigger de alta crea el tenant
con el nombre que Google dé y `vertical = 'sin_definir'`, que es la marca de
"falta completar". La pantalla de Cuenta lo avisa y deja rellenarlo, y la de
segmentos vuelve a avisar antes de inferir — que es donde de verdad estropea
el resultado, porque esa palabra va literal al prompt.

`tenants` solo acepta escritura en `nombre`, `vertical` y `ciudad` (GRANT por
columna, en 021). `max_consultas_mes` y `plan` se leen pero no se tocan: son
el reparto del presupuesto de Places entre clientes.

## Panel de administración

Uso y gasto de todo el servicio, en la sección **Panel**. Solo aparece —y
solo responde— si quien mira es administrador.

### Dar de alta un administrador

No hay pantalla para esto a propósito: son dos o tres personas en la vida
del proyecto, y una pantalla de "hazte admin" es superficie que mantener y
vigilar a cambio de nada.

```sql
insert into administradores (usuario_id, nota)
select id, 'Nombre · para qué' from auth.users where email = 'quien@ejemplo.com';
```

Para quitarlo, `delete from administradores where usuario_id = '...'`.

### Qué protege el panel

**No** que la sección esté escondida en el menú. La clave publicable viaja en
el bundle y cualquiera puede llamar a las funciones desde la consola del
navegador. Lo que decide es `es_admin()` dentro de cada `panel_*`.
Comprobado: sin ser admin, las cuatro funciones devuelven `No autorizado` y
la tabla `administradores` ni se lee.

La marca de administrador vive en tabla propia, no en `profiles`. Esa tabla
tiene concesión de UPDATE para `authenticated` —hoy la frena la RLS, que no
tiene política de escritura— y bastaría con que alguien añadiera una política
de actualización para que un cliente pudiera hacerse admin solo.

### Qué enseña, y qué no

Agregados. Ni un nombre de lead, ni un correo, ni el cuerpo de un mensaje.
Para controlar uso y gasto hacen falta números; y somos encargados del
tratamiento de datos que son de nuestros clientes, no nuestros. Ver
`docs/compliance.md`.

Por eso **no** hay una política de tipo "el admin ve todas las filas de
leads": eso dejaría la lectura entre clientes a un JWT de distancia en todas
las tablas. El cruce ocurre solo dentro de las cuatro funciones.

### Las tarifas hay que ponerlas

`consumo_modelo` mide tokens de verdad —los devuelve Anthropic en cada
respuesta, no se estiman— pero convertirlos a dinero necesita un precio, y
ese no lo inventamos:

```sql
-- Tarifa de claude-sonnet-5 a 1 de septiembre de 2026, precio de lista.
update ajustes set
  precio_tokens_entrada_millon = 2,    -- USD por millón de tokens de entrada
  precio_tokens_salida_millon  = 10,   -- USD por millón de salida
  precio_places_mil            = 35,   -- USD por 1000 consultas a Places
  moneda = 'USD';
```

Mientras estén a cero, el panel enseña el consumo medido y avisa de que falta
la tarifa, en vez de un importe falso.

**El precio va atado al modelo.** Si cambia `MODELO` en
`functions/_shared/inferencia.ts`, hay que cambiar la tarifa a la vez o el
panel seguirá calculando con la vieja sin decir nada.

**Es una estimación por tarifa de lista.** El caché de prompts y el
procesamiento por lotes abaratan tokens que aquí se cuentan a precio
completo, así que el panel tiende a estimar por encima. Para vigilar
tendencia sirve; para cuadrar la factura al céntimo, no. Los tokens sí son
exactos: los devuelve Anthropic en cada respuesta.

### Lo que no mide

- **Visitas y páginas vistas.** No hay analítica: lo que se cuenta son
  operaciones que cuestan dinero y objetos creados. Si hace falta tráfico
  web, es otra herramienta.
- **Places por día.** `consumo_places` se agrega por mes desde 007. En la
  serie diaria no aparece porque repartirlo entre los días sería inventarlo.
- **El consumo del modelo antes de hoy.** La medición empieza cuando se
  desplegó esto; lo gastado antes no está.

## Coste por campaña

La cifra sobre la que se decide el precio de venta. Está en el Panel, en
«Cuánto cuesta una campaña».

### De dónde sale cada mitad

**Google Places** no necesitó nada nuevo: `jobs.consultas` lo cuenta por job
desde 002, y cada job pertenece a una campaña. Se cuenta por **consulta
pedida**, no por lead obtenido, porque Places cobra igual aunque la búsqueda
vuelva vacía.

**El modelo** sí. `consumo_modelo` se agregaba por tenant, y un cliente con
cuatro campañas era un solo número. Ahora lleva `campaign_id`, que rellenan
las cuatro funciones que llaman a un modelo:

| Función | Campaña |
|---|---|
| `infer-segments` | la que se está infiriendo (nula si se prueba el prompt sin persistir) |
| `redactar` | la de la tarea |
| `generar-landing` | la de la landing — **antes no medía nada** |
| `demo-inferir` | ninguna: la demo gasta y no tiene campaña |

### Varios proveedores

`tarifas_modelo` lleva proveedor, modelo y fecha de vigencia. Añadir GPT o
Gemini es una fila, no una migración:

```sql
insert into tarifas_modelo (proveedor, modelo, desde, entrada_millon, salida_millon)
values ('openai', 'gpt-5', current_date, 1.25, 10);
```

El `modelo` es el identificador exacto que manda el código, no el nombre
comercial: es lo que se guarda en `consumo_modelo.modelo` y por lo que se
cruza.

`desde` existe porque los precios cambian, y el coste de una campaña de hace
tres meses tiene que calcularse con el precio que había entonces. Sin eso,
una bajada de tarifas reescribiría el histórico hacia abajo y la unidad
económica sobre la que decides el precio se movería sola. Para cambiar un
precio se inserta una fila nueva con la fecha; no se actualiza la vieja.

Un modelo sin tarifa suma cero, y el panel lo marca como **falta tarifa** en
esa campaña — un cero sin marca pasaría por gasto real.

### Qué enseña

- Coste **mediano** por campaña además de la media. Cuatro campañas de prueba
  a cero arrastran la media y hacen parecer barato lo que no lo es.
- Coste por lead y por **lead con correo**. El segundo es el que importa: un
  lead sin dirección no se puede contactar.
- Coste por mensaje redactado, solo del modelo.
- Reparto Places / modelo, para saber cuál de los dos hay que vigilar.

Los «por unidad» son agregados, no medias de medias: una campaña de tres
leads no pesa lo mismo que una de novecientos.

### Lo que no cuenta

- **El gasto de modelo anterior al 1 de septiembre de 2026** no tiene
  campaña: se registró antes de que existiera la columna. Aparece en los
  totales del cliente pero no en el desglose por campaña.
- **La demo pública** no se imputa a ninguna campaña, porque no lo es.
- Es una **estimación por tarifa de lista**. El caché de prompts y el
  procesamiento por lotes abaratan tokens que aquí se cuentan a precio
  completo, así que tiende a estimar por encima. Los tokens sí son exactos.

### Por qué el cliente no ve su coste

El desglose vive solo en el panel de administración. Enseñárselo al cliente
en su propia campaña sería enseñarle el margen.

## Incidencias

Cuando algo falla, la app lo guarda, lo diagnostica y prepara el texto para
reenviárselo a quien lo tenga que arreglar. Está en la sección
**Incidencias** del menú.

Antes un fallo se veía una vez, en rojo, encima de un formulario, y
desaparecía al recargar. Cuando llegaba el aviso —"no me deja inferir"— no
quedaba rastro de qué pasó ni de cuándo empezó.

### Por qué el diagnóstico no lo hace el modelo

La tentación es mandarle el error a Claude. El primer fallo que hubo que
diagnosticar enseñó por qué no: la inferencia devolvía 502 porque **se había
agotado el saldo de Anthropic**. Un diagnosticador que llama a Anthropic para
explicar que Anthropic no responde se cae con el mismo error, y encima cobra.

Así que el catálogo manda: firmas conocidas con su causa y su arreglo, en
`frontend/src/lib/diagnostico.ts`. Es instantáneo, gratis y funciona con el
proveedor caído. Añadir un caso nuevo es añadir una entrada a ese array.

### Qué se guarda

`incidencias`, una fila por (tenant, componente, firma) con contador. Sin
agrupar, un bucle de reintentos escribe mil filas iguales y la pantalla deja
de servir.

Se escribe solo por `registrar_incidencia`, que es `SECURITY DEFINER`: el
INSERT directo está revocado. El usuario solo puede leer las suyas y cambiar
el estado.

### El mensaje que se ve

`supabase.functions.invoke` devuelve siempre el mismo texto cuando una Edge
Function responde con error:

```
Edge Function returned a non-2xx status code
```

El motivo real viaja en el cuerpo de la respuesta, colgado del error en
`context`. `frontend/src/lib/edge.ts` lo lee y lo registra; todas las
llamadas a funciones pasan por ahí. Sin eso, la pantalla enseñaba esa frase y
no había forma de distinguir un problema de saldo de un negocio inexistente.

### Fallos frecuentes ya catalogados

| Firma | Causa | Quién lo arregla |
|---|---|---|
| `credit balance is too low` | Sin saldo en Anthropic | Tú, en console.anthropic.com |
| `authentication_error` | Clave de Anthropic revocada | Secreto de la Edge Function |
| `provider is not enabled` | Google OAuth sin activar | Dashboard de Supabase |
| `permission denied for table` | Falta un GRANT | Migración |
| `REQUEST_DENIED` | Places rechaza la clave | Google Cloud |

Ojo con el primero: Anthropic devuelve la falta de saldo como
`400 invalid_request_error`, que parece una petición mal formada. Esa
confusión es la que costó dos despliegues encontrar.

### Lo que todavía no cubre

Los jobs del worker (`descubrir`, `enriquecer`, `redactar`) escriben sus
fallos en `job_tareas.detalle`, no en `incidencias`. Son los que nadie ve,
porque ocurren sin navegador delante. Falta llevarlos aquí.

## Correo de prueba

En Mensajes, con un mensaje abierto: **«Enviar prueba a mi correo»**. Manda
ese mensaje —con su diseño si tiene plantilla aplicada— a tu bandeja, para
ver en un cliente de correo real lo que se va a enviar.

### Esto no es el módulo de envío

La Fase 4 sigue cerrada. La diferencia cabe en una línea de
`functions/enviar-prueba/index.ts`:

```ts
const destino = user.user.email;
```

El destinatario sale del **token**, no del cuerpo de la petición. No hay
manera de pedirle que escriba a un lead, ni equivocándose ni a propósito.

Y **no marca el mensaje como `enviado`**: lo enviado es lo que se mandó a un
cliente, y una prueba a tu propio correo no lo es. Falsearlo estropearía el
embudo y el registro que hay que poder enseñar ante una reclamación.

El asunto sale con `[PRUEBA]` delante y el cuerpo con un aviso arriba
diciendo a quién iba dirigido de verdad. Una prueba indistinguible de un
envío real en la bandeja es una forma estupenda de confundirse dentro de un
mes.

### Por qué se puede hacer esto ya

CLAUDE.md pone una condición: nada de envío hasta que la lista de supresión
y el opt-out funcionen. Comprobado contra la base antes de escribirlo:

| Pieza | Estado |
|---|---|
| Tabla `suppressions` | existe |
| `esta_suprimido()` | existe |
| Trigger `no_enviar_a_suprimidos` sobre `messages` | activo |
| `messages.token_baja` | existe, sin nulos |
| Opt-out | Edge Function `baja` + `baja.html` |

Ojo con el nombre: el trigger se llama `no_enviar_a_suprimidos` y la función
`frenar_envio_a_suprimido`. Buscarlo por el nombre de la función hace pensar
que no existe.

La prueba aplica **la misma comprobación del enlace de baja** que el trigger
haría al enviar de verdad. Si el mensaje no lo lleva, no sale ni de prueba:
lo contrario sería probar algo distinto de lo que se va a mandar.

### Puesta en marcha

Sale por **Resend**. Es una llamada HTTP, sin SDK ni firmas, y él se encarga
de DKIM. No cierra nada: la Fase 4 puede ir por otro sitio.

1. En resend.com, **verifica tu dominio** pegando los DNS que te dé. Sin eso
   rechaza el envío, y ese es el primer error que sale siempre.
2. Saca una API key.
3. Los dos secretos:

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set REMITENTE_PRUEBA="Prospector <pruebas@tu-dominio.com>"
```

4. `supabase functions deploy enviar-prueba`

Sin los secretos la función responde **503 diciendo cuál falta**, con su
nombre dentro. «Falta configuración» obliga a adivinar.

## Alta del dominio de un cliente

La pieza que la decisión 0004 dejaba pendiente. `config_correo` (028) ya
guardaba qué dominio quiere usar cada cliente, pero `registros_dns` nacía
en `[]` y `estado_dominio` en `sin_verificar`, y **nada los movía nunca**.

Los mueve la Edge Function `dominio-correo`:

```bash
supabase functions deploy dominio-correo
```

Va con JWT: la lanza el cliente desde **Cuenta → Correo saliente**, en la
tarjeta *Registros DNS*. Dos botones:

| Acción | Qué hace |
|---|---|
| `alta` | Crea el dominio en Resend (región `eu-west-1`) y guarda los registros que devuelve |
| `comprobar` | Pide la verificación y actualiza `estado_dominio` |

No necesita secretos propios: usa la **clave del servicio**, la misma del
Vault que ya lee `enviar-prueba`. El cliente no abre cuenta en ningún
sitio, que es justo la fricción que la 0004 quería evitar.

### Qué escribe, y por qué tiene que ser el servidor

`estado_dominio`, `registros_dns` y `proveedor_dominio_id` están **fuera**
del GRANT por columna que la 028 concede a `authenticated`. Eso obliga a
pasar por la función, y no es burocracia:

- Si el cliente pudiera escribir `estado_dominio`, se marcaría
  `verificado` y empezaría a enviar sin haber puesto un solo registro.
- Si pudiera escribir `proveedor_dominio_id`, podría apuntarlo al dominio
  ya verificado de **otro tenant** y heredar su verificación.

### Detalles que cuestan tiempo si no se saben

- **Si el cliente cambia el dominio** después del alta, el id guardado
  apunta al anterior. La función lo detecta comparando el nombre y vuelve
  a dar de alta. Sin eso se verificaría un dominio que ya no usa y la
  pantalla diría que todo está bien.
- **`temporary_failure` no es `fallo`.** Se mapea a `pendiente_dns`:
  marcarlo como error haría que el cliente rehiciera un DNS que ya estaba
  bien puesto.
- **Un estado desconocido del proveedor nunca cae en `verificado`.** Por
  defecto va a `pendiente_dns`, porque lo contrario deja enviar desde un
  dominio sin comprobar.
- **Modo `propio`** (opción A de la 0004) no pasa por aquí: ese cliente
  trae su propio proveedor y el alta la hace allí.

### Lo que no está probado

Escrito y desplegado; **ninguna campaña ha dado de alta un dominio real
todavía**. El camino que sí está verificado es el manual —el mismo que se
siguió con `envios.i-automate.es`—, que es de lo que esto es la versión
automática.

## Quién firma los correos

En **Campaña → Cómo se escriben los correos**, campo *Empresa que escribe*.
Vacío = el nombre de la cuenta, que es el comportamiento de siempre.

### El fallo que lo trajo

Los diez mensajes de la campaña «Woody tatoo» se presentaban como
**i-automate**. No lo inventó el modelo: `v_contexto_mensaje` sacaba
`negocio_nombre` de `tenants.nombre`, y el pie legal —el que identifica al
remitente ante la LSSI-CE— también.

Aparece en cuanto alguien usa esto como agencia: una cuenta, varias
campañas, cada campaña de una empresa distinta. El tenant es la cuenta; la
empresa que escribe, no siempre.

### Por qué no vale `campaigns.nombre`

Es lo primero que se piensa y sale mal. `campaigns.nombre` es una etiqueta
para encontrar la campaña en una lista. En esta base ya hay campañas
llamadas «ASESORIAS Y DESPACHOS DE ABOGADOS» y «Piloto Valencia»: eso es a
quién se busca, o una nota de trabajo. Un correo firmado «ASESORIAS Y
DESPACHOS DE ABOGADOS» dirigido a un despacho de abogados es justo el
ridículo que hay que evitar.

### El sector y la ciudad se apagan con nombre propio

Cuando la campaña declara empresa propia, `negocio_vertical` y
`negocio_ciudad` salen nulos del contexto. Describen al **tenant**, y
atribuírselos a otra empresa es inventarle la presentación: «Woody Tatoo,
automatización con IA» es peor que no decir el sector.

Lo que sí describe al negocio de la campaña es `campaigns.descripcion`, que
el prompt ya usa —«A qué se dedica»— y que se rellena en el paso 1.

### Los dos sitios tienen que decir lo mismo

El nombre lo usan dos caminos distintos y ambos aplican el mismo criterio:

| Camino | Dónde |
|---|---|
| El texto que escribe el modelo, y el pie en texto plano | `v_contexto_mensaje` → `redaccion.ts` |
| El diseño, al vestir con una plantilla | `frontend/src/lib/aplicar-plantilla.ts` |

Si se cambia uno hay que cambiar el otro: un correo cuyo texto firma una
empresa y cuyo pie firma otra es peor que el fallo original.

### Lo que no arregla

**Los mensajes ya redactados no cambian.** Siguen diciendo lo que decían
cuando se escribieron. Para rehacerlos hay que borrar los borradores desde
Mensajes y volver a pulsar «Escribir mensajes», y eso es una llamada al
modelo por cabeza.

## Modo demo

Dos techos por campaña, para enseñar el producto sin pagar una campaña
entera. Se ponen y se quitan en el **Panel → Ajustes → Uso del servicio**, y
afectan a todos los clientes a la vez.

De dónde salió: «Woody tatoo» devolvió **920 leads en 59 consultas** a
Places, y otra campaña se dejó **516 llamadas al modelo** redactando
correos. Para una demostración sobran los tres números.

### Son dos facturas, y por eso son dos techos

| Techo | Qué acota | Quién cobra, y por qué |
|---|---|---|
| `max_leads_demo` (50) | el descubrimiento | Places, **por consulta** |
| `max_mensajes_demo` (20) | la redacción | el modelo, **por correo escrito** |

Un solo número no sirve. Con el techo de leads en 50, si todos tuvieran
correo serían 50 llamadas al modelo: el gasto de Places queda acotado y el
del modelo no.

### El techo se cuenta en leads y el freno es de consultas

Places cobra por consulta, no por lead. Un límite que se limitara a guardar
menos leads ahorraría **cero**: las 59 consultas ya estarían pagadas.

Así que lo que hace el modo demo es que `reclamar_tareas` **deje de servir
tareas** en cuanto la campaña llega al techo. Con 50 leads son tres o cuatro
consultas. El recorte de la última página —la que ya está pagada y podría
dejar 68 donde la pantalla prometía 50— lo hace el worker, y es lo de menos.

### El de mensajes es TOTAL, no por tanda

Aquí hay una confusión fácil que conviene dejar clara, porque los dos
ajustes se parecen y hacen cosas distintas:

| Ajuste | Alcance | Para qué está |
|---|---|---|
| `max_mensajes_por_campana` (018) | **por tanda** | trocear una campaña grande: «Escribir los que faltan» |
| `max_mensajes_demo` (042) | **por campaña, total** | frenar el gasto del modelo en una demostración |

El de la 018 **no acota nada**, solo reparte: pulsando cinco veces se
escriben cinco tandas. El del modo demo se aplica encima y gana el más
pequeño de los dos; cuando la campaña llega a su techo, el botón deja de
escribir y dice por qué.

No hizo falta tocar el worker de redacción: a diferencia del
descubrimiento, no encadena tareas nuevas sobre la marcha. Todo el trabajo
lo crea `encolar_redaccion`, así que acotarlo ahí lo acota del todo.

### Qué pasa con lo que ya existe

- **No se borra nada.** Una campaña con 920 leads o con 460 mensajes los
  conserva. El límite frena el trabajo nuevo.
- Un «Buscar más» o un «Escribir los que faltan» sobre una campaña que ya
  pasa del techo se rechaza **con el motivo escrito**, en vez de encolar un
  trabajo que no haría nada.
- El job de descubrimiento se **cierra** al llegar al techo, no se queda
  colgado. Es la lección de la 008: un freno nuevo sin quien cierre el job
  deja la campaña clavada en `buscando` para siempre.

### Sin pasar por el panel

```sql
update ajustes set modo_demo = true, max_leads_demo = 50, max_mensajes_demo = 20
 where id;
```

El `where id` no es adorno: sin él, PostgREST responde «UPDATE requires a
WHERE clause». Ver la 036.

### `ajustes` ya no se escribe desde el navegador

Encontrado al montar la 042: `anon` y `authenticated` tenían concesión de
INSERT y UPDATE sobre **todas** las columnas de `ajustes`. No pasaba nada
porque la RLS está activa y la tabla solo tiene política de SELECT, así que
toda escritura se denegaba.

Es la misma trampa que este README ya señala en `administradores`. El día
que alguien añadiera una política de escritura «para poder guardar los
precios desde el panel», cualquiera con la clave publicable —que viaja en el
bundle— podría apagar el modo demo, subir el techo de Places del proyecto
entero o cambiar el remitente del servicio.

La 042 quita esa concesión. No rompe nada: quien escribe aquí son funciones
`SECURITY DEFINER`, que corren con la identidad del dueño y no con la de
quien llama.

## Cancelar una búsqueda en curso

Botón **«Cancelar la búsqueda»** dentro del paso 3 de la campaña, mientras
la barra de progreso está viva. Antes no había forma de parar: una vez
encolado, el descubrimiento seguía gastando Places hasta el techo aunque el
usuario ya hubiera visto que la búsqueda no era la que quería.

Los leads encontrados hasta ese momento **se quedan**. Están en `leads`
desde que se guardaron, así que no hay nada que rescatar: `cancelar_job`
cierra el trabajo y devuelve la campaña a `lista` para que la pantalla los
enseñe.

### Cancelar no es fallar, y por eso hay estado nuevo

`jobs.estado` admite ahora `cancelado`. Las otras dos opciones mentían:

| Si se cerrara como… | Qué diría de más |
|---|---|
| `hecho` | que el descubrimiento terminó, y el panel contaría una campaña completada |
| `error` | que algo se rompió — el panel de salud lo pinta en rojo y marca al cliente como en riesgo |

Las **tareas** no necesitaron estado nuevo: la 008 ya creó `omitida` para
exactamente esto, «no se hizo pero tampoco falló».

### Detalles que cuestan tiempo si no se saben

- **La tarea que está en vuelo termina.** Su consulta a Places ya está
  pagada; tirarla sería perder leads por los que se ha pagado. Al acabar
  llamará a `cerrar_job_si_completo`, que respeta el job cancelado y no lo
  resucita a `hecho`.
- **No se sella `ultima_busqueda_en`.** Sellarla metería la campaña en la
  pausa de 30 días, y quien acaba de cancelar suele querer relanzar la
  búsqueda ahora mismo, corregida.
- **Sin ningún lead**, la campaña vuelve a `inferido` en vez de a `lista`:
  no hay nada que enseñar en el paso siguiente.
- `cancelar_job` vale para los tres tipos de trabajo. Hoy solo hay botón en
  la búsqueda, que es la que cuesta por consulta.

## Claves de los proveedores de modelo

**Panel → Ajustes → Proveedores.** Tres proveedores, el mismo molde que la
026 estrenó con OpenAI: se **escriben** desde el navegador y **no se pueden
leer** desde ahí. `leer_clave_modelo` está concedida solo a `service_role`,
que corre dentro de la Edge Function — ni siquiera un administrador la saca.

| Proveedor | Quién la usa hoy |
|---|---|
| `anthropic` | inferencia, redacción, landings y `studio-ia` |
| `openai` | las imágenes del studio (`generar-imagen`) |
| `gemini` | **nadie todavía**. Se guarda, no se llama |

Lo de Gemini está dicho así en la pantalla a propósito. Una clave guardada
que nadie lee parece configuración hecha, y es de las cosas que se descubren
el día que hacen falta.

### El secreto de entorno sigue valiendo

`_shared/claves.ts` mira primero el Vault y, si ahí no hay nada, usa
`ANTHROPIC_API_KEY` como siempre. **El Vault gana**: es lo que hace que pegar
una clave en el panel sirva de algo aunque quede un secreto viejo puesto.

Consecuencia práctica: **rotar la clave de Anthropic ya no es un
despliegue**. Se pega en el panel y surte efecto en cinco minutos como
mucho, que es lo que dura la caché por isolate.

### La lista blanca no es decoración

Estas funciones escriben en `vault.secrets` **por nombre**. Sin acotar qué
nombres se aceptan, un administrador podría pisar `correo_api_key` —la clave
del proveedor de correo, que es de otro sitio— pasando ese nombre por
parámetro. `proveedores_de_modelo()` es la lista de lo que se puede tocar
desde aquí, y nada más.

### Estado de esto hoy

Comprobado ejecutándolo: el mapeo de nombres, que un proveedor desconocido
devuelve `null` en vez de tocar otro secreto, y que la inferencia sigue
respondiendo con el camino nuevo (llamada real a `demo-inferir`, segmentos
de vuelta). **El Vault está vacío de claves de modelo**: hoy todo tira del
secreto de entorno de Anthropic, y la clave de OpenAI no se ha puesto nunca
—así que generar imágenes en el studio no funciona todavía—.

## Las dos claves de Supabase

| Clave | Dónde | Qué puede |
|---|---|---|
| `anon` | Frontend | Solo lo que permitan las políticas RLS |
| `service_role` | Servidor, nunca fuera | Todo. Se salta la RLS por completo |

Si `service_role` acaba en el navegador, cualquiera puede leer los leads de
todos los clientes. Es el único error de este proyecto que no tiene arreglo
discreto.

Lo mismo vale para las funciones `SECURITY DEFINER` de 002: se saltan la RLS,
y por eso el archivo termina con un bloque de `revoke execute` sobre `anon` y
`authenticated`. Postgres las abre a `public` por defecto. Si añades una
función nueva de ese tipo, revócala en la misma migración.

## Comprobar que la RLS funciona

Crea dos tenants con un usuario cada uno, inserta una campaña en cada uno y
consulta con el token del primero. Si ves las dos campañas, la RLS no está
activa — revisa que `auth_tenant_id()` devuelve valor y que el usuario tiene
fila en `profiles`.

## Controlar el gasto

| Palanca | Dónde | Por defecto |
|---|---|---|
| Consultas a Places por campaña | `campaigns.max_consultas` | 120 |
| Mensajes redactados por tanda | `ajustes.max_mensajes_por_campana` | 10 |
| Leads por campaña en modo demo | `ajustes.modo_demo` · `ajustes.max_leads_demo` | apagado · 50 |
| Mensajes por campaña en modo demo | `ajustes.modo_demo` · `ajustes.max_mensajes_demo` | apagado · 20 |
| Inferencias de demo por IP y día | `DEMO_MAX_POR_IP` | 5 |
| Inferencias de demo por día | `DEMO_MAX_POR_DIA` | 300 |
| Tareas por invocación del worker | `TAREAS_POR_TANDA` | 5 |

Y cuando ninguna palanca llega a tiempo, está el botón: **Cancelar la
búsqueda**, en el paso 3 de la campaña.

`reclamar_tareas` deja de servir tareas cuando el job alcanza el techo de su
campaña, así que el límite se aplica solo, sin vigilarlo.

## Conectar Supabase a Claude Code (MCP)

`.mcp.json` en la raíz del repo declara el servidor MCP alojado de Supabase,
acotado a este proyecto con `project_ref`.

Autenticación por OAuth: no hay ningún token en el archivo, y por eso se
puede commitear.

```json
{ "mcpServers": { "supabase": {
    "type": "http",
    "url": "https://mcp.supabase.com/mcp?project_ref=tpfjeumrvdbciktmaaii"
} } }
```

Son **dos pasos, y el primero se olvida siempre**:

1. **Aprobar el `.mcp.json`.** Un servidor de ámbito proyecto no se carga
   hasta que lo apruebas una vez. Abre `claude` en esta carpeta y acepta.
   ```bash
   claude mcp get supabase   # ⏸ Pending approval → falta este paso
   ```
2. **Autenticar** (necesita Claude Code 2.1.186 o superior):
   ```bash
   claude mcp login supabase
   ```

Comprobar: `claude mcp get supabase` debe decir `Project config` **y**
`✓ Connected`.

Si en algún momento rechazaste el servidor, `claude mcp reset-project-choices`
borra esa decisión y vuelve a preguntar.

> Versiones anteriores a la 2.1.186 no tienen `claude mcp login` y muestran el
> estado "pendiente de aprobación" como "needs authentication", lo que hace
> perder un buen rato buscando un problema de credenciales que no existe.

### Está en modo escritura, a propósito y con fecha de caducidad

La URL no lleva `read_only=true`. Estuvo puesto unas horas el 5 de septiembre
de 2026 y se quitó el mismo día, para poder aplicar las migraciones del
traslado del Campaign Studio (025 en adelante) sin ir al SQL Editor en cada
iteración. Es una decisión de velocidad tomada a sabiendas, no un descuido.

**Lo que se acepta al dejarlo así.** Supabase recomienda no conectar este MCP
a producción con escritura. El riesgo que citan es inyección de prompt:
contenido que el modelo lee y que puede llevar instrucciones dentro. Este
proyecto es un caso de libro — mete en prompts nombres de negocios traídos de
Google Places, texto extraído de webs ajenas y mensajes de error. Con permiso
de escritura, unas instrucciones metidas ahí alcanzan una base que ya tiene
datos de seis clientes.

**Cuándo volver a lectura.** La condición original era «al terminar el
traslado del studio», y **ya se cumplió**: la última migración es la 027, del
5 de septiembre de 2026, y desde entonces ninguna función nueva ha necesitado
DDL —el archivado de plantillas salió con una columna que ya existía—.

Miguel lo aplazó a propósito el 6 de septiembre de 2026: se cambia **al dar
el proyecto por terminado**, no antes. Queda escrito aquí para que nadie lea
la condición de arriba, la vea cumplida y piense que se olvidó.

Es añadir el parámetro:

```
https://mcp.supabase.com/mcp?project_ref=tpfjeumrvdbciktmaaii&read_only=true
```

El cambio no surte efecto hasta reiniciar Claude Code en la carpeta.

Las dos reglas mientras esté en escritura:

- Toda migración sale de un archivo de `supabase/` numerado, nunca de SQL
  escrito sobre la marcha. Es lo que impide que la base y el repo diverjan.
- Nada de escrituras sobre datos de clientes. Esquema sí; sus leads, sus
  campañas y sus mensajes, no.

Y la de siempre:

- El repo es la fuente de verdad del esquema. Todo lo que se ejecute contra la
  base sale de un archivo de `supabase/`, nunca de SQL improvisado en el
  editor. En cuanto se escribe algo a mano que no está en un archivo, la base
  y el repo divergen y ya nadie sabe cuál manda.

## Estado

Escrito y desplegable; **no ejecutado todavía** contra un proyecto real. Hasta
que una campaña corra de punta a punta, esto está sin verificar.

## Pendiente

- Edge Function de generación de mensajes (Fase 3).
- Enriquecimiento: web, email corporativo, validación MX (Fase 2). Encaja como
  un `tipo` nuevo en `jobs`, reusando el mismo troceado.
- Trigger de alta que cree tenant y perfil automáticamente al registrarse.
