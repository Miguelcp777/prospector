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

## Claves

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
| Inferencias de demo por IP y día | `DEMO_MAX_POR_IP` | 5 |
| Inferencias de demo por día | `DEMO_MAX_POR_DIA` | 300 |
| Tareas por invocación del worker | `TAREAS_POR_TANDA` | 5 |

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

### Está en modo lectura

La URL lleva `read_only=true` desde el 5 de septiembre de 2026, que es cuando
entraron los primeros clientes reales. Antes no lo llevaba, y era lo
razonable: con el esquema sin ejecutar y ningún lead dentro, poder aplicar
migraciones desde aquí ahorraba mucho. Con datos de otros dentro deja de
compensar.

Supabase recomienda no conectar este MCP a producción con escritura. El
riesgo que citan es inyección de prompt: contenido que el modelo lee — el
nombre de un negocio traído de Places, por ejemplo — y que puede llevar
instrucciones dentro. Con permiso de escritura, esas instrucciones alcanzan a
la base.

**Consecuencia práctica: las migraciones ya no se aplican por MCP.** Van al
SQL Editor, pegando el archivo de `supabase/` — que es como estaba
documentado desde el principio. El repo era ya la fuente de verdad del
esquema; ahora además es el único camino, que es una forma cómoda de que no
puedan divergir.

Si algún día hiciera falta volver a escritura, se quita el parámetro. Pero
entonces vuelve el riesgo de arriba, y ya hay datos que no son tuyos.

Dos reglas que siguen valiendo:

- El repo es la fuente de verdad del esquema. Si aplicas una migración por
  MCP, que salga de un archivo de `supabase/`, no de SQL improvisado. Si no,
  la base y el repo divergen y nadie sabe cuál manda.
- Antes de tener clientes, cambia a `read_only=true`. Es editar un parámetro.

## Estado

Escrito y desplegable; **no ejecutado todavía** contra un proyecto real. Hasta
que una campaña corra de punta a punta, esto está sin verificar.

## Pendiente

- Edge Function de generación de mensajes (Fase 3).
- Enriquecimiento: web, email corporativo, validación MX (Fase 2). Encaja como
  un `tipo` nuevo en `jobs`, reusando el mismo troceado.
- Trigger de alta que cree tenant y perfil automáticamente al registrarse.
