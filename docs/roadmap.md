# Roadmap

Cada fase deja algo demostrable a un cliente. No se avanza sin validar la anterior.

## Fase 0 — El cerebro (1-2 semanas) · HECHO A MEDIAS

Taxonomía de segmentos para la vertical fisioterapia + prompt de inferencia que,
dado negocio y geografía, devuelve segmentos-objetivo con justificación y query
de búsqueda asociada. Salida JSON estructurado.

**Criterio de validación:** un fisioterapeuta real mira la lista y reconoce ahí
a sus clientes. Si falla esto, no hay pipeline que lo arregle.

**Entregable:** `data/taxonomias/fisioterapia.json` + prompt versionado.

El prompt existe (`supabase/functions/_shared/inferencia.ts`) y la demo
pública ya lo expone en vivo. Lo que sigue pendiente es el criterio de
validación: **ningún fisioterapeuta real ha mirado todavía la lista**. Sin
eso, la fase no está cerrada por mucho código que haya debajo.

## Fase 1 — Descubrimiento (2-3 semanas) · EN CURSO

Google Places API. Búsquedas geolocalizadas por radio y segmento, dedup por
place_id, persistencia en Postgres.

Escrito: la Edge Function `descubrir`, troceada en `job_tareas` y despertada
por `pg_cron`. Paginación encadenada, dedup por `unique (campaign_id,
place_id)` y techo de gasto por campaña.

**Falta:** ejecutarlo. Hasta que una campaña real corra de punta a punta
contra Places, está escrito y sin verificar.

**Entregable:** listados reales por sector y zona.

**Criterio de validación:** una campaña de fisioterapia en Valencia devuelve
entidades que existen, sin duplicados, dentro del radio y sin pasarse del
presupuesto de consultas.

## Fase 2 — Enriquecimiento y scoring (2 semanas)

Web, email corporativo, RRSS, validación MX. Scoring en SQL.

**Entregable:** tabla de leads priorizada.

## Fase 3 — Oferta (2 semanas)

Mensaje personalizado por lead con Claude. Generación de landing por campaña —
el enganche con lo que ya vendemos.

## Fase 4 — Envío y tracking (3 semanas)

Dominio secundario, warmup, SPF/DKIM/DMARC, throttling, aperturas y respuestas.
El módulo de compliance se construye aquí, dentro del producto.

## Fase 5 — RRSS como ads (2 semanas)

Audiencias personalizadas y lookalike en Meta/LinkedIn Ads hacia las landings.
**No** DMs automatizados: van contra ToS y queman las cuentas.

## MVP

Fases 0 + 1 + tabla de leads. Tres pantallas: onboarding, campañas, leads.
Sin envíos. Ya es vendible y valida lo importante.
