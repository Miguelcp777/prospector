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

### Está en modo escritura

La URL no lleva `read_only=true`, así que Claude puede aplicar migraciones y
modificar datos. Es lo útil ahora, con el esquema sin ejecutar y sin un solo
lead dentro. Deja de serlo en cuanto haya datos de clientes:

```
https://mcp.supabase.com/mcp?project_ref=tpfjeumrvdbciktmaaii&read_only=true
```

Supabase recomienda no conectar este MCP a producción. El riesgo que citan es
inyección de prompt: contenido que el modelo lee — el nombre de un negocio
traído de Places, por ejemplo — y que puede contener instrucciones. Con
permiso de escritura, esas instrucciones alcanzan a la base.

Dos reglas mientras esté en escritura:

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
