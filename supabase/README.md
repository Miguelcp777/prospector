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

## Configuración, recursos y plantillas: qué hace cada cosa

Tres pantallas tocan el mismo correo y hasta la 044 no encajaban. Este es el
reparto, ya coherente:

| Pieza | Dónde se pone | A dónde va de verdad |
|---|---|---|
| Tipo, tono, idioma, firma, llamada a la acción | Campaña → Cómo se escriben los correos | al **prompt** del redactor |
| Empresa que escribe | ídem | al prompt **y al pie legal** (043) |
| **Documentos** | Campaña → Recursos | su **texto** al prompt («LO QUE SE OFRECE»). **No se adjuntan** |
| **Logo** | Campaña → Recursos | la cabecera del **correo** y la **landing** |
| Plantilla del studio | Plantillas | el **diseño** donde entra el texto |

### Lo que estaba roto

- **El logo no salía en ningún correo.** Ni con plantilla: no había ninguna
  variable de logo que rellenar. Ahora es `{{brand.logo_url}}`.
- **La pantalla prometía adjuntos.** Decía literalmente «los documentos como
  adjunto», y nunca se adjuntó ninguno. Ahora dice lo que hacen de verdad.
- **Un correo sin plantilla salía en texto plano.** Vestirlo obligaba a
  entrar en el studio, diseñar algo y volver: tres pasos para el caso más
  normal.

### La plantilla por defecto

«Correo simple», preseleccionada en Mensajes → Aplicar un diseño. Marca
arriba, el texto del lead, botón a la landing si está publicada, y el pie
legal. Sin copy de catálogo, así que no hay nada que revisar antes de
aplicarla ni interruptor de «respetar el diseño» que tocar.

Vive en `frontend/src/lib/plantilla-por-defecto.ts` y **no en la base**. Una
plantilla del sistema en `plantillas` necesitaría filas sin tenant y una
política de RLS que las deje leer a todo el mundo: abrir esa tabla a
lecturas de fuera del tenant para guardar una constante. Aquí no hay nada
que aislar. Si algún día se quiere editable, entonces sí es una fila.

Al aplicarla, `messages.plantilla_id` queda **nulo**: no es una plantilla de
la base y apuntar a una que no existe sería mentir en el registro.

### Por qué el logo tiene bucket propio

`recursos` es privado a propósito (017): ahí viven las ofertas comerciales.
La landing las sirve con URLs firmadas que caducan en una hora, y eso vale
porque la landing se pide en el momento.

Un correo no. Se abre horas o semanas después, y muchas veces a través del
proxy de imágenes de Gmail. Una URL firmada sería **una imagen rota con
retardo** — el peor fallo posible, porque en la prueba se ve bien.

De ahí el reparto de la 044:

| Bucket | Acceso | Qué guarda |
|---|---|---|
| `logos` | **público** | solo PNG, JPG y WEBP de marca, hasta 2 MB |
| `recursos` | privado | documentos y todo lo demás |

Escribir sigue siendo privado en los dos: la ruta empieza por el uuid del
tenant y la política lo compara con `auth_tenant_id()`.

**Sin SVG en el bucket público**, y no es un descuido: un SVG es un
documento con scripts dentro. En un correo no se ejecutan, pero la URL es
pública y se puede abrir en una pestaña.

**Los logos subidos antes de la 044 siguen en el bucket privado.** Salen en
la landing y no en los correos. La pantalla de Recursos lo avisa y se
arregla volviéndolos a subir, que es un clic; moverlos desde una migración
significaría tocar los archivos de un cliente.

### Las imágenes del studio también tenían que ser públicas (050)

La 044 mandó los **logos** a un bucket público y dejó fuera las imágenes que
el studio sube y genera. Entonces eran opcionales; desde que «Crear con IA»
genera una portada siempre, están en el camino por defecto — y se guardaban
en `recursos`, privado, con la **URL firmada metida dentro del documento**.

Esa firma dura ocho horas. Una plantilla diseñada por la mañana tiene el
hero roto por la tarde: en la plantilla guardada, en la vista previa y en
cualquier correo enviado con ella. Es el peor fallo posible porque
**mientras se prueba se ve bien**, así que quien lo diseña no lo ve nunca.

El reparto queda en tres:

| Bucket | Acceso | Qué guarda |
|---|---|---|
| `logos` | **público** | imágenes de marca, hasta 2 MB |
| `imagenes-correo` | **público** | lo que se dibuja dentro de un correo, hasta 10 MB |
| `recursos` | privado | documentos y todo lo demás |

La frontera no es «imagen o no»: es **si la va a pedir un cliente de correo
horas después**. Una oferta comercial en PDF se sirve firmada y caduca; una
foto de portada no puede.

Escribir sigue siendo privado, con el mismo aislamiento de 017 y 044: la
ruta empieza por el uuid del tenant y la política lo compara con
`auth_tenant_id()`. Sin SVG en el bucket público, por lo de siempre.

**Las imágenes subidas o generadas antes de la 050 siguen en el privado.**
No se mueven: son archivos de clientes y moverlos desde una migración es
tocar lo suyo sin que lo hayan pedido. La galería del studio las marca con
**«· caduca»** y lo explica al pasar el ratón; se arregla volviéndolas a
subir, o generando una nueva. Lo mismo que se hizo con los logos.

### El pie tenía dos enlaces que no debían estar

Encontrado al montar la plantilla por defecto, y venía de antes: el
renderizador construía los tres enlaces del pie con `props.x || "valor por
defecto"`. Vaciar una etiqueta a `""` —que es como el resto del código pedía
quitar un enlace— es *falsy*, así que volvía la etiqueta por defecto.

Resultado, en todos los correos vestidos:

- **«Gestionar preferencias»**, que no existe, apuntando a la URL de baja.
- **«Política de privacidad» con `href="#"`** cuando el cliente no tenía
  ninguna configurada. Un enlace legal muerto es peor que no ofrecerlo:
  promete un derecho que no se puede ejercer.

Ahora un enlace del pie se dibuja solo si tiene **texto y destino**.
`undefined` sigue cayendo en el valor por defecto, así que una plantilla que
no toca esas props se comporta igual que siempre.

### Lo que sigue pendiente

`{{campaign.offer}}` existe como variable y **siempre se rellena con cadena
vacía**. Una plantilla del catálogo con bloque de oferta lo pinta en blanco
y nadie avisa. Es de las que hay que decidir: o se rellena con algo, o se
quita del catálogo.

## El perfil del negocio y la bienvenida (051)

Una cuenta nueva pasa por una **pantalla de bienvenida** antes de entrar. Tres
pasos: el negocio, cómo te encuentran y el logo.

### Por qué

Hasta la 051 una cuenta podía trabajar sabiendo de sí misma un nombre y poco
más. Por Google ni eso: el alta no pregunta nada y el tenant nace con
`vertical = 'sin_definir'`. Y cada campaña volvía a pedir «tu negocio, en una
frase» como si no se hubiera dicho nunca — con la mitad vacías, la inferencia
proponía cualquier cosa y el redactor escribía genérico, sin que nadie
supiera por qué.

### Qué bloquea

Solo cuatro campos: **nombre, actividad, descripción y ciudad**. Son
exactamente los que leen la inferencia y el redactor. El contacto, el
domicilio postal y el logo se pueden dejar para luego; la pantalla dice qué
falta en vez de retener a nadie.

La comprobación es de pantalla, no de base. Lo peor que puede hacer alguien
saltándosela es dejar su propia cuenta a medias, que es su decisión y no un
problema de aislamiento.

### Dónde vive cada dato, y por qué no está todo junto

| Dato | Tabla |
|---|---|
| nombre, actividad, ciudad, descripción, teléfono, email, web, horario, redes | `tenants` |
| **domicilio postal** | `config_correo.direccion_postal` |
| **logo** | `recursos` con `tipo='logo'` y `campaign_id` nulo |

El domicilio postal **no** se duplica en `tenants`. Ya estaba en
`config_correo` y es de ahí de donde lo lee el pie legal; tenerlo en dos
sitios es garantizar que un día digan cosas distintas, y el que se quedaría
obsoleto sería justo el que identifica al remitente ante la LSSI-CE. La
pantalla los enseña juntos; la base los guarda donde cada uno se lee.

### El logo ya estaba previsto y nadie lo escribía

`logo_de_campana()` (044) busca «el de la campaña, y si no el del negocio
(`campaign_id` nulo)». Esa segunda rama **no se había usado nunca**, porque
la pantalla de Recursos siempre graba con campaña. Comprobado antes de
tocar nada: ni una fila de logo con `campaign_id is null`, y el único logo
de la base en el bucket **privado** de antes de la 044, que esa función
descarta. Conclusión incómoda: **ningún correo llevaba logo**.

Ahora lo escribe la bienvenida, y `logo_del_negocio()` lo lee sin pasar por
una campaña — que es lo que necesitan Cuenta y el studio. Sigue mandando el
de la campaña cuando lo haya.

En el correo va como variable `{{brand.logo_url}}`, no como URL pegada en el
documento: así una plantilla guardada sigue al logo de la cuenta el día que
se cambie, en vez de quedarse con el de entonces.

### Lo que hereda de aquí en adelante

- **Una campaña nueva** nace con el nombre, la ciudad y la descripción del
  negocio puestos. Son valores iniciales, no ataduras: una agencia con varias
  empresas escribe encima, y para eso está «Empresa que escribe» (043).
- **El asistente de IA del studio** arranca con la empresa, la actividad y la
  descripción escritas, y con la web como destino del botón.
- **El redactor de mensajes** recibe teléfono, email, web y horario en el
  contexto, para poder cerrar un correo con datos que existen en vez de
  dejar el hueco o inventarlos.

Los tres respetan la regla de la 043: **si la campaña declara empresa propia,
los datos del tenant no se le atribuyen**. `v_contexto_mensaje` los anula,
igual que ya hacía con el sector y la ciudad.

### Las cuentas que ya existían no la ven

La migración sella `configurado_en = creado_en` en las filas que ya estaban.
Es la lección de la 045: allí un `default true` sobre una columna nueva metió
en modo demo a todos los clientes el mismo día. Quien quiera completar sus
datos entra por **Cuenta**, que es el mismo formulario de corrido.

### Las columnas nuevas de una vista van al final

`create or replace view` solo sabe añadir columnas por la derecha. Meter una
en medio le parece renombrar las siguientes y falla con «cannot change name
of view column "oferta" to "negocio_telefono"». Por eso los cuatro campos
nuevos de `v_contexto_mensaje` están detrás de `oferta` y no agrupados con
las otras `negocio_*`: ordenarlos bien costaría un `drop view`, y de esa
vista cuelga la redacción de mensajes.

## Modo demo

Un freno de gasto **por cliente**, que **viene puesto** en toda cuenta
nueva. Mientras está puesto, cada campaña de ese cliente para en un techo de
leads y otro de mensajes; lo demás funciona igual.

Se quita en **Panel → Clientes**, y es lo que se hace el día que alguien
empieza a pagar. Está en la columna **Versión de prueba** de la tabla, un
clic por fila; la ficha de abajo también lo lleva, pero ahí hay que elegir
antes al cliente en un desplegable y eso convierte «quítale el límite a
este» en tres pasos.

### Quién decide qué

| Cosa | Dónde | Quién |
|---|---|---|
| Si un cliente está en demo | `tenants.modo_demo` · Panel → Clientes | un administrador |
| Cuántos leads y cuántos mensajes | `ajustes.max_leads_demo` y `max_mensajes_demo` · Panel → Ajustes | un administrador |
| Nada | `ajustes.modo_demo` | **obsoleta desde la 045** |

El interruptor era global hasta la 045 y no valía: en cuanto hay un cliente
de pago y otro de prueba a la vez, un único interruptor está mal para uno de
los dos. Los **topes** sí siguen siendo del servicio — son la misma cifra
razonable para todos los que estén en demo, y afinarlos cliente a cliente
sería una palanca más que mantener sin ganar nada.

`ajustes.modo_demo` no se borró: borrar es destructivo y no lo pide nadie
todavía. Pero **nada la lee**, y eso está dicho en el comentario de la
propia columna para que no haga perder una tarde.

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
menos leads ahorraría **cero**: las consultas ya estarían pagadas.

Lo que hace el modo demo es que `reclamar_tareas` **deje de servir tareas**
en cuanto la campaña llega al techo. Una campaña real dio 920 leads en 59
consultas; con el techo en 50 son tres o cuatro. El recorte de la última
página —la que ya está pagada— lo hace el worker, y es lo de menos.

### El de mensajes es TOTAL, no por tanda

Dos ajustes se parecen y hacen cosas distintas:

| Ajuste | Alcance | Para qué está |
|---|---|---|
| `max_mensajes_por_campana` (018) | **por tanda** | trocear una campaña grande: «Escribir los que faltan» |
| `max_mensajes_demo` (042) | **por campaña, total** | frenar el gasto del modelo |

El de la 018 **no acota nada**, solo reparte: pulsando cinco veces se
escriben cinco tandas. El del modo demo se aplica encima y gana el más
pequeño.

### Dos nombres para lo mismo, a propósito

Dentro —columnas, panel, este README— se llama **modo demo**: es el nombre
que ya tiene y renombrarlo en veinte sitios no arregla nada.

Fuera, lo que lee el cliente, es **versión de prueba**. Un cliente que paga
una cuota no está en una demo; está en una versión limitada de algo que ha
contratado, y llamarlo demo suena a que no se le toma en serio.

### El banner

Quien está limitado lo ve arriba, en todas las secciones:

> **Versión de prueba** — Las campañas de esta cuenta están limitadas a 50
> leads y 20 mensajes. El resto de funciones está disponible sin
> restricciones. Para ampliar los límites, escribe a *(el contacto)*.

**No se puede cerrar**, y es a propósito: no es un aviso puntual sino el
estado de la cuenta. Esconderlo llevaría a alguien a pasarse la tarde
preguntándose por qué su campaña se para en 50 leads.

El contacto sale de `ajustes.contacto_soporte` y se pone en Panel → Ajustes.
Si es un correo o una URL, el banner lo pinta como enlace. Sin él, la frase
se queda en «contacta con el administrador del servicio», que es la forma
educada de no decir nada — por eso conviene rellenarlo.

La pantalla del panel enseña **el aviso tal y como lo verá el cliente**,
debajo de los campos. Redactar un aviso a ciegas y verlo por primera vez en
la cuenta de alguien es cómo se cuela una frase que no se quería.

Los mensajes de error dicen lo mismo, y la frase vive en un solo sitio
—`aviso_version_de_prueba()`— para que no se despeguen. Antes decían «quita
el modo demo en el panel», que es justo lo que quien los lee no puede hacer.

### Qué pasa con lo que ya existe

- **No se borra nada.** Una campaña con 920 leads o con 460 mensajes los
  conserva. El límite frena el trabajo nuevo.
- Un «Buscar más» o un «Escribir los que faltan» sobre una campaña que ya
  pasa del techo se rechaza **con el motivo escrito**.
- El job de descubrimiento se **cierra** al llegar al techo, no se queda
  colgado. Es la lección de la 008: un freno nuevo sin quien cierre el job
  deja la campaña clavada en `buscando` para siempre.

### Al aplicar la 045, todos los clientes entraron en demo

`default true` sobre una columna nueva la pone a true también en las filas
que ya existen. Es la lectura literal de «activado por defecto» y hay que
saberlo: **el día de la migración, todas las cuentas —incluida la tuya—
quedaron limitadas**. Se saca a cada una en Panel → Clientes con un clic.

### Sin pasar por el panel

```sql
-- Sacar a un cliente del modo demo
update tenants set modo_demo = false where nombre = 'Quien sea';

-- Cambiar los topes del servicio
update ajustes set max_leads_demo = 50, max_mensajes_demo = 20 where id;
```

El `where id` del segundo no es adorno: sin él, PostgREST responde «UPDATE
requires a WHERE clause». Ver la 036.

### `ajustes` ya no se escribe desde el navegador

Encontrado al montar la 042: `anon` y `authenticated` tenían concesión de
INSERT y UPDATE sobre **todas** las columnas de `ajustes`. No pasaba nada
porque la RLS está activa y la tabla solo tiene política de SELECT, así que
toda escritura se denegaba.

Es la misma trampa que este README ya señala en `administradores`. El día
que alguien añadiera una política de escritura «para poder guardar los
precios desde el panel», cualquiera con la clave publicable —que viaja en el
bundle— podría subir el techo de Places del proyecto entero o cambiar el
remitente del servicio.

La 042 quita esa concesión. No rompe nada: quien escribe aquí son funciones
`SECURITY DEFINER`, que corren con la identidad del dueño y no con la de
quien llama.

**`tenants.modo_demo` nace ya con ese cuidado**: se concede solo `SELECT` a
`authenticated`. Si el cliente pudiera escribirla, se quitaría el límite él
mismo y el modo demo no limitaría nada.

## La barra de progreso que no se movía (052)

«Estaba a cero y de repente había 50 leads.» La barra no estaba rota:
estaba esperando, y no lo decía.

Medido sobre el job real, el descubrimiento `3296f746`:

| Hora | Qué pasó |
|---|---|
| 11:07:21 | encolado · `pendiente`, progreso 0 |
| 11:08:07 | terminado · 5 búsquedas hechas, 19 omitidas por modo demo |

Cuarenta y seis segundos, de los cuales **treinta y nueve no pasó nada**:
`encolar_descubrimiento` crea el job y las tareas y ahí se queda hasta que
`pg_cron` despierta al worker en el siguiente minuto redondo. El trabajo de
verdad duró siete segundos, y en siete segundos con el techo del modo demo
no hay barra que enseñar.

### El arreglo

Un trigger `arrancar_al_encolar` sobre `jobs`: al insertarse un job
`pendiente`, `despertar_worker()` llama a su Edge Function por `pg_net`, con
el mismo secreto del Vault que usa el cron.

**El cron sigue haciendo falta** y no se toca. Es quien recoge lo que quede a
medias, lo que reponga `reponer_tareas_colgadas` y las tandas siguientes de
un trabajo que no cabe en una invocación. Esto solo le quita la primera
espera, que es la única que alguien está mirando.

### Por qué un trigger y no una línea en cada `encolar_*`

Son tres funciones —descubrimiento, enriquecimiento y redacción—, cada una
con sus comprobaciones de techo, de pausa y de modo demo. Repetir la llamada
al final de las tres es garantizar que la cuarta se olvide.

Y hay un detalle que lo hace seguro: `net.http_post` **no manda nada en el
momento**, encola la petición en una tabla y la envía un proceso de fondo
después del commit. Si la transacción se deshace, la llamada se deshace con
ella y no se despierta a nadie para un trabajo que no existe.

### Dos cosas más de la misma tanda

- **El progreso cuenta también las tareas caídas.** Sumaba «hechas +
  omitidas» y dejaba fuera las de estado `error`. Una tarea que ha gastado
  sus tres intentos no va a volver, así que contarla como pendiente dejaba la
  barra corta hasta el salto final.
- **En cola, la barra es indeterminada.** Mientras el job está `pendiente` no
  hay nada que medir, y un «0 %» quieto se lee como una campaña atascada. Una
  barra que se mueve sola dice «estoy en ello»; un cero dice «no avanza».

### Comprobado antes de darlo por bueno

`select despertar_worker('descubrir')` dejó un `200` en `net._http_response`
fuera del minuto del cron — o sea, la URL y el secreto son los buenos. Y el
trigger se probó con un `insert` dentro de un bloque que revienta a
propósito: encoló la petición en `net.http_request_queue`, y al deshacerse la
transacción no quedó ni el job ni la llamada. Un trigger roto aquí impediría
encolar nada a nadie, así que conviene verlo antes que después.

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

Gemini estuvo en esta lista desde la 041 «para tenerlo puesto el día que
haga falta». Ese día no llegó, y la **048 lo quita**: un campo que solo sirve
para explicar que no sirve es peor que no tenerlo, y en la pantalla del
cliente invitaba a pegar una clave que no le iba a dar servicio. Si algún
día vuelve, vuelve con su motor detrás.

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

## «Crear con IA» del studio, que no usaba IA

Hasta la Edge Function `componer-campana`, el botón «Crear con IA» del
studio **no llamaba a ningún modelo**. El navegador componía el correo con
`guidedCopy`, una plantilla determinista, y tomaba la primera receta del
catálogo —que es de tecnología—. Un estudio de tatuajes recibía un correo
con la etiqueta TECNOLOGÍA, una foto de oficina y el pie de los datos de
ejemplo del renderizador. Lo único suyo era la oferta, que la plantilla
insertaba literal.

Ahora el texto lo escribe **OpenAI** —el mismo proveedor que ya generaba las
imágenes, para que el correo entero salga de un sitio— y devuelve asunto,
preencabezado, antetítulo, titular, cuerpo, sección, llamada a la acción y
**la descripción de la imagen**, que es la que se le pasa después a
`generar-imagen`.

El resto del producto sigue con Anthropic: segmentos, mensajes y landings.
Aquí el proveedor lo eligió quien paga.

### Lo que el prompt prohíbe

No inventar clientes, cifras, premios, testimonios, certificaciones ni
plazos, y conservar literalmente las variables `{{campo.ruta}}`. Lo primero
porque un correo comercial con un dato inventado es un problema legal, no un
texto mejorable; lo segundo porque una variable traducida sale como un hueco
sin rellenar en la bandeja de alguien.

### Si el modelo falla, se compone igual — y se dice

Sin clave o con el proveedor caído, el correo se monta con la plantilla de
siempre y la pantalla avisa de que **ese texto no lo ha escrito el modelo**.
Dejar el editor en blanco sería peor, y hacer pasar una plantilla por un
texto escrito para ese negocio, también.

### Lo que cuesta y lo que tarda

Medido en la primera campaña real: **934 tokens de entrada y 6.658 de
salida** en dos llamadas, y unos **47 segundos** por campaña. Es lento para
una pantalla: el asistente enseña «Creando estrategia, textos y estructura…»
todo ese rato. Si molesta, se acorta acotando la longitud de la respuesta,
con el riesgo de que el JSON salga truncado.

### El sector ya no es siempre tecnología

`elegirReceta` puntúa lo que se ha escrito contra el nombre, la categoría y
el objetivo de cada receta del catálogo, igual que el buscador. Si nada
encaja, se queda la que hubiera: inventar un sector es peor que no acertar.

## Y la clave de cada cliente (047)

Las de arriba son **del servicio**: una por proveedor, y con ellas se paga la
inferencia de todo el mundo. Eso vale mientras se prueba y deja de valer en
cuanto alguien produce. Desde la 047 la regla es esta:

| Quién llama | Con qué clave |
|---|---|
| La demo pública, que no tiene tenant | la del servicio |
| Un cliente en **versión de prueba** (`tenants.modo_demo`) | la del servicio |
| Un cliente **fuera** de la versión de prueba | la suya, o ninguna |

«O ninguna» es literal: las funciones de IA responden con un aviso que dice
qué falta y dónde se pone. **No hay caída de vuelta a la clave del
servicio**, y esa ausencia es el punto entero: una caída silenciosa es cómo
acabas pagando el consumo de otro sin enterarte.

Por eso el respaldo por variable de entorno —`ANTHROPIC_API_KEY`, que la 041
dejó como red de seguridad— tampoco se aplica a un cliente al que le tocaba
poner la suya. Es del servicio, y solo sirve para quien tiene derecho a ella.

### Dónde la pega el cliente

**Cuenta → Proveedor de modelo.** Mismo molde que el panel: se escribe, no se
lee, y solo se ven los cuatro últimos caracteres. Lo tocan solo los usuarios
con rol `propietario` —es una credencial que cuesta dinero cada vez que se
usa— y se puede **borrar**, que es lo que hace falta el día que una clave se
revoca o deja de funcionar.

La pantalla dice antes que nada en qué estado está la cuenta: en versión de
prueba avisa de que ahora mismo no hace falta poner nada, y fuera de ella
avisa en rojo de que la IA está parada hasta que haya clave.

### Quién resuelve qué

`resolver_clave_modelo(tenant, proveedor)` es la única que ve claves en
claro, y está concedida solo a `service_role`. Devuelve también **de dónde
sale**, porque el motivo importa: el aviso que ve un cliente no puede
mandarle a un panel de administración que no verá nunca.

| `origen` | Significa |
|---|---|
| `cliente` | la suya |
| `servicio` | la del servicio, porque es demo o está en versión de prueba |
| `falta` | no hay, y no le corresponde la nuestra |

Comprobado ejecutándolo, los cuatro casos, antes de desplegar nada.

### Qué proveedor mueve qué, hoy

Esto no cambia con la 047 y conviene no confundirlo:

- **anthropic** — los segmentos, los mensajes, las landings y el studio. Es
  la que un cliente necesita de verdad para funcionar sin modo demo.
- **openai** — solo las imágenes del studio.
Que el cliente pueda **elegir** proveedor —`config_modelo`,
`elegir_proveedor_modelo`— está preparado en la base, pero los motores solo
saben hablar con Anthropic. Así que hoy un cliente que salga de la versión
de prueba **necesita una clave de Anthropic**: la de OpenAI le dará las
imágenes del studio y nada más.

Gemini estaba aquí y lo quita la **048**. Ver la nota de arriba.

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
| Quién está en modo demo | `tenants.modo_demo` | **puesto** en toda cuenta nueva |
| Leads por campaña en modo demo | `ajustes.max_leads_demo` | 50 |
| Mensajes por campaña en modo demo | `ajustes.max_mensajes_demo` | 20 |
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
