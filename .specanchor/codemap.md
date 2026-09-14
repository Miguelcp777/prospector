# Mapa del código · Prospector

Revisión de referencia: `98f80dcf6bb3fd245c065fe7904e5593abf07110` (main).
Inventario: 361 archivos materiales, 0 sin mapear (`evidence/baseline.json`).

## Pila y tiempo de ejecución

| Pieza | Tecnología | Estado |
|---|---|---|
| Base de datos | Postgres en Supabase, con RLS | OBSERVED · `supabase/schema.sql` |
| Trabajo en segundo plano | Edge Functions en Deno + `pg_cron` + `pg_net` | VERIFIED · `cron.job` tiene 6 entradas activas |
| Frontend | React + Vite, TypeScript, sin router | OBSERVED · `frontend/package.json`, `frontend/src/App.tsx` |
| Publicación | Netlify desde Git | VERIFIED · despliegues observados en esta revisión |
| Modelos | Anthropic (segmentos, mensajes, landings, studio) y OpenAI (texto e imagen del asistente) | OBSERVED · `_shared/inferencia.ts`, `componer-campana`, `generar-imagen` |

**No hay servidor propio, ni contenedor, ni Python en ejecución.** Decidido en
`docs/decisiones/0001-supabase.md` y `0002-worker-en-supabase.md`.

## Puntos de entrada

| Entrada | Archivo | Quién la llama |
|---|---|---|
| Aplicación web | `frontend/src/main.tsx` → `App.tsx` | el cliente, con sesión |
| Demo pública | `demo/index.html` | cualquiera, sin sesión |
| Trabajadores | `supabase/functions/{descubrir,enriquecer,redactar}` | `pg_cron` cada minuto y el trigger `arrancar_al_encolar` (052) |
| Funciones con JWT | `infer-segments`, `componer-campana`, `generar-imagen`, `studio-ia`, `enviar-prueba`, `dominio-correo`, `leer-documento`, `generar-landing` | el navegador con la sesión del usuario |
| Funciones públicas | `demo-inferir`, `baja`, `landing`, `correo-webhook` | internet abierto; las protege cuota, token o secreto, no el JWT |

## Módulos

| Módulo | Responsabilidad | Rutas principales | Depende de |
|---|---|---|---|
| `datos` | Esquema, RLS, funciones SQL y migraciones | `supabase/*.sql` | — |
| `edge-nucleo` | Claves por tenant, CORS, contabilidad de consumo | `supabase/functions/_shared/*` | `datos` |
| `descubrimiento` | Places, troceado en tareas, enriquecimiento | `supabase/functions/{descubrir,enriquecer}/*` | `datos`, `edge-nucleo` |
| `inteligencia` | Todo lo que llama a un modelo | `supabase/functions/{infer-segments,demo-inferir,redactar,componer-campana,studio-ia,generar-imagen,leer-documento}/*`, `data/*` | `datos`, `edge-nucleo` |
| `correo` | Envío de prueba, dominio, baja, landing, vestido de mensajes | `supabase/functions/{enviar-prueba,dominio-correo,correo-webhook,baja,landing,generar-landing}/*`, `frontend/src/lib/aplicar-plantilla.ts` | `datos`, `studio` |
| `app-web` | Pantallas, sesión, navegación, temas | `frontend/src/{pages,lib,components}/*`, `App.tsx` | `datos` |
| `studio` | Editor de correo y su contrato de documento | `frontend/src/studio/*`, `frontend/pruebas-porte/*` | `datos`, `inteligencia` |
| `demo-publica` | Escaparate sin sesión | `demo/*` | `inteligencia` |
| `campaign-studio-aparcado` | Subaplicación Next sin conectar | `frontend/campaign-studio/*` | — (no entra en el build) |

## Almacenes de datos

- **Postgres**: `tenants`, `profiles`, `campaigns`, `segments`, `leads`,
  `messages`, `suppressions`, `jobs`, `job_tareas`, `plantillas`, `recursos`,
  `incidencias`, `config_correo`, `config_modelo`, `ajustes`, `consumo_modelo`,
  `consumo_places`, `demo_usos`, `administradores`, `kits_marca`. OBSERVED ·
  `supabase/schema.sql` y migraciones 002-053.
- **Supabase Storage**, tres buckets: `recursos` (privado), `logos` (público),
  `imagenes-correo` (público, migración 050). VERIFIED · consultado en
  `storage.buckets`.
- **Vault**: secretos del worker, la URL del proyecto y las claves de modelo
  por tenant. OBSERVED · migraciones 003, 041, 047.

## Integraciones externas

Google Places, Anthropic, OpenAI, Resend. Ninguna clave vive en el repositorio:
van a secretos de Edge Function o al Vault. VERIFIED · `.env.example` no
contiene ningún secreto y `frontend/` solo recibe la clave publicable.

## Autenticación y autorización

Supabase Auth (correo y Google). La pertenencia se resuelve **por tabla**, no
por claim: `auth_tenant_id()` lee `profiles`. La RLS de cada tabla compara
contra esa función. La administración es tabla aparte (`administradores`) y la
comprueba `es_admin()` dentro de cada `panel_*`. OBSERVED · `schema.sql`, 023.

## Construir, probar y desplegar

| Acción | Comando | Resultado en la revisión de referencia |
|---|---|---|
| Tipos | `cd frontend && npx tsc -b --force` | VERIFIED · sale 0 |
| Build | `cd frontend && npm run build` | VERIFIED · sale 0 |
| Pruebas | `cd frontend && npm run test:studio` | VERIFIED · 75 pruebas, 71 pasan, **4 fallan** |
| Migraciones | archivos numerados de `supabase/`, aplicados por MCP o SQL Editor | OBSERVED · `supabase/README.md` |
| Funciones | `npx supabase functions deploy <nombre>` | OBSERVED |
| Frontend | Netlify, automático al empujar a `main` | VERIFIED |

Los 4 fallos son **anteriores a esta adopción** y están explicados en
`docs/decisiones/0005-v45-al-studio-de-la-app.md`: son las adaptaciones del
porte del studio (sesión de invitado, adaptador HTTP de Next, troceado de
subida, clase del tema en el shell).

## Asuntos transversales

- **Aislamiento multi-tenant.** Toda tabla lleva `tenant_id` y su política.
- **Cumplimiento.** `leads`, `messages` y `suppressions` son las de riesgo
  legal; ver `docs/compliance.md`.
- **Control de gasto.** Techos por campaña, por tenant y por proyecto, más el
  modo demo por cliente.
- **Idioma.** Código, identificadores y documentación en español.

## Zonas sin anclar o inciertas

- **No hay CI.** No existe `.github/`; nada ejecuta las pruebas salvo a mano.
- `frontend/campaign-studio/` son 169 archivos que no entran en el build. Su
  spec lo declara aparcado; no se documentan sus contratos internos.
- `scripts/` está vacío (solo `.gitkeep`, excluido). Un script real que
  aparezca ahí saldrá como no mapeado y obligará a decidir su módulo.
- La **cobertura de pruebas fuera del studio es nula**: no hay ninguna prueba
  de `frontend/src/pages`, `frontend/src/lib`, las Edge Functions ni el SQL.
