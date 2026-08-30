# Arquitectura

## Principios

1. **Multi-tenant desde el día uno.** Cada tabla lleva `tenant_id` y su política
   RLS. Migrarlo después de tener clientes es doloroso y caro.
2. **El aislamiento vive en la base, no en la aplicación.** RLS sobre
   `auth_tenant_id()`, no un `WHERE tenant_id = ...` que alguien puede olvidar.
3. **La cola es una tabla, no un orquestador visual.** El trabajo pesado vive en
   `jobs` y `job_tareas`, y lo consume una Edge Function que se come una tanda
   pequeña por invocación. El estado del recorrido está en la base: si una
   invocación muere a mitad, la tarea vuelve a la cola y no se pierde nada.
4. **Solo datos públicos y buzones corporativos.** Ver `compliance.md`.
5. **La taxonomía ancla al LLM.** La inferencia no parte de cero: se apoya en
   taxonomías curadas por vertical para reducir alucinación y ser reproducible.

## Componentes

| Componente | Dónde corre | Responsabilidad |
|---|---|---|
| Postgres + RLS | Supabase | Datos y aislamiento entre tenants |
| Auth | Supabase | Usuarios, roles, invitaciones |
| `infer-segments` | Supabase (Deno) | Inferencia autenticada. Escribe en la campaña |
| `demo-inferir` | Supabase (Deno) | Escaparate público con cuota. No toca datos |
| `descubrir` | Supabase (Deno) | El worker. Places y dedup. Usa `service_role` |
| `pg_cron` | Supabase (Postgres) | Despierta al worker cada minuto |
| Frontend | Estático | Onboarding, campañas, leads. Solo `anon key` |
| Demo | Netlify | Un archivo. Solo llama a `demo-inferir` |

No hay servidor propio. Ver `decisiones/0002-worker-en-supabase.md`.

## Flujo

```
Onboarding          → el cliente describe negocio + zona
   ↓
Inferencia          → Claude propone segmentos-objetivo (JSON estructurado)
   ↓                  el cliente acepta / edita / descarta
Descubrimiento      → Google Places por segmento × geografía, dedup por place_id
   ↓
Enriquecimiento     → web, email corporativo, handles RRSS, validación MX
   ↓
Scoring             → SQL: proximidad, tamaño estimado, reseñas, completitud
   ↓
Oferta              → mensaje personalizado + landing dedicada por campaña
   ↓
Envío               → ESP con warmup, SPF/DKIM/DMARC, throttling, supresión
   ↓
Dashboard           → embudo, apertura, respuesta, leads por segmento
```

Inferencia y oferta son Edge Functions síncronas. Descubrimiento y
enriquecimiento son jobs troceados en `job_tareas` que la función `descubrir`
consume por tandas. El scoring es una función SQL (`recalcular_scores`) que se
dispara sola al cerrarse el job.

## Modelo de datos

Fuente de verdad: `supabase/schema.sql`.

- `tenants` — nuestros clientes (la clínica de fisio)
- `profiles` — usuarios de cada tenant, con rol. Enlaza `auth.users` con `tenants`
- `campaigns` — campaña de prospección: zona, radio, estado
- `segments` — segmentos-objetivo inferidos y aceptados por campaña
- `leads` — entidad descubierta: place_id, nombre, dirección, web, contacto, score
- `messages` — plantilla generada y variante enviada por lead
- `suppressions` — bajas y exclusiones, con motivo y fecha
- `jobs` — cola de trabajo, con estado, progreso y consultas gastadas
- `job_tareas` — la unidad troceada: segmento × query × página
- `demo_usos` — contador de la demo pública, por hash de IP

## Decisiones abiertas

- ESP para el envío: montar sobre SES o contratar Smartlead/Instantly.
- Cachear resultados de Places por zona, para no pagar dos veces la misma
  búsqueda en campañas distintas del mismo cliente.
- Techo por defecto de `max_consultas`: hoy son 120 por campaña, elegidos a
  ojo. Falta medirlo con coste real.

Resueltas: dónde corre el worker y el presupuesto por campaña, ambas en
`decisiones/0002-worker-en-supabase.md`.
