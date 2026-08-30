# Arquitectura

## Principios

1. **Multi-tenant desde el día uno.** Cada tabla lleva `tenant_id` y su política
   RLS. Migrarlo después de tener clientes es doloroso y caro.
2. **El aislamiento vive en la base, no en la aplicación.** RLS sobre
   `auth_tenant_id()`, no un `WHERE tenant_id = ...` que alguien puede olvidar.
3. **La cola es una tabla, no un orquestador visual.** El descubrimiento no cabe
   en una Edge Function: cientos de consultas a Places y varios minutos frente a
   un timeout corto. Por eso existe la tabla `jobs` y un worker externo en
   Python. El scoring y el enriquecimiento se testean y se versionan como código.
4. **Solo datos públicos y buzones corporativos.** Ver `compliance.md`.
5. **La taxonomía ancla al LLM.** La inferencia no parte de cero: se apoya en
   taxonomías curadas por vertical para reducir alucinación y ser reproducible.

## Componentes

| Componente | Dónde corre | Responsabilidad |
|---|---|---|
| Postgres + RLS | Supabase | Datos y aislamiento entre tenants |
| Auth | Supabase | Usuarios, roles, invitaciones |
| Edge Functions | Supabase (Deno) | Lo que necesita clave secreta: inferencia, copy |
| Worker | Contenedor externo | Descubrimiento y enriquecimiento. Usa `service_role` |
| Frontend | Estático | Onboarding, campañas, leads. Solo `anon key` |

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

Inferencia y oferta son Edge Functions. Descubrimiento y enriquecimiento son
jobs que el worker toma de la tabla `jobs`. El scoring es una función SQL
(`recalcular_scores`).

## Modelo de datos

Fuente de verdad: `supabase/schema.sql`.

- `tenants` — nuestros clientes (la clínica de fisio)
- `profiles` — usuarios de cada tenant, con rol. Enlaza `auth.users` con `tenants`
- `campaigns` — campaña de prospección: zona, radio, estado
- `segments` — segmentos-objetivo inferidos y aceptados por campaña
- `leads` — entidad descubierta: place_id, nombre, dirección, web, contacto, score
- `messages` — plantilla generada y variante enviada por lead
- `suppressions` — bajas y exclusiones, con motivo y fecha
- `jobs` — cola de trabajo del worker, con estado y progreso

## Decisiones abiertas

- Coste de Google Places: se paga por consulta y escala con nº de segmentos.
  Definir presupuesto por campaña y cachear resultados por zona.
- Dónde corre el worker: Proxmox o contenedor gestionado.
- ESP para el envío: montar sobre SES o contratar Smartlead/Instantly.

La cola de jobs ya no es una decisión abierta: se resolvió con la tabla `jobs`
en `docs/decisiones/0001-supabase.md`.
