# Roadmap

Cada fase deja algo demostrable a un cliente. No se avanza sin validar la anterior.

## Fase 0 — El cerebro (1-2 semanas) · EN CURSO

Taxonomía de segmentos para la vertical fisioterapia + prompt de inferencia que,
dado negocio y geografía, devuelve segmentos-objetivo con justificación y query
de búsqueda asociada. Salida JSON estructurado.

**Criterio de validación:** un fisioterapeuta real mira la lista y reconoce ahí
a sus clientes. Si falla esto, no hay pipeline que lo arregle.

**Entregable:** `data/taxonomias/fisioterapia.json` + prompt versionado.

## Fase 1 — Descubrimiento (2-3 semanas)

Google Places API. Búsquedas geolocalizadas por radio y segmento, dedup por
place_id, persistencia en Postgres.

**Entregable:** listados reales por sector y zona.

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
