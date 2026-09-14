---
type: module-spec
module: inteligencia
status: ready
source_paths:
  - supabase/functions/infer-segments/*
  - supabase/functions/demo-inferir/*
  - supabase/functions/redactar/*
  - supabase/functions/componer-campana/*
  - supabase/functions/studio-ia/*
  - supabase/functions/generar-imagen/*
  - supabase/functions/leer-documento/*
  - data/*
last_reviewed: 2026-09-14
---

# Módulo: inteligencia

## Responsabilidad

Todo lo que llama a un modelo. Qué se le pide, qué se le prohíbe, qué se hace
cuando falla y quién paga la llamada.

## Propiedad del código

Siete Edge Functions más la taxonomía curada de `data/taxonomias/`. Los
prompts compartidos viven en `edge-nucleo` (`_shared/inferencia.ts`,
`_shared/redaccion.ts`); un cambio en ellos toca los dos módulos.

## Interfaces públicas

| Función | Quién la llama | Modelo |
|---|---|---|
| `infer-segments` | la app, con JWT | Anthropic |
| `demo-inferir` | internet, con cuota | Anthropic |
| `redactar` | el worker, con secreto | Anthropic |
| `generar-landing` (en `correo`) | la app | Anthropic |
| `studio-ia` | el studio | Anthropic |
| `componer-campana` | el studio | OpenAI |
| `generar-imagen` | el studio | OpenAI `gpt-image-1` |

## Invariantes de dominio

- **INV-INT-001** · Ningún prompt puede inventar clientes, cifras,
  porcentajes, premios, testimonios, certificaciones ni plazos. Un correo
  comercial con un dato inventado es un problema legal, no un texto
  mejorable.
- **INV-INT-002** · Las variables `{{campo.ruta}}` se conservan literales. Una
  variable traducida sale como un hueco sin rellenar en la bandeja de alguien.
- **INV-INT-003** · **El HTML del correo no lo escribe un modelo.** Lo compone
  `email-renderer.ts`. Un modelo devolvería algo distinto cada vez, el correo
  dejaría de ser editable y el pie legal pasaría a depender de que se acuerde.
  Lo que el modelo sí decide es qué bloques lleva y en qué orden.
- **INV-INT-004** · En el modo simple del asistente, si el modelo falla se
  devuelve el error. No se compone una plantilla determinista disfrazada.
- **INV-INT-005** · El redactor y el director de arte van **en paralelo**: no
  dependen uno del otro. Por eso el redactor escribe siempre las ventajas,
  se usen o no.
- **INV-INT-006** · Lo que el modelo propone se **repara**, no se rechaza:
  contraste corregido hasta WCAG AA, tipografía contra lista blanca,
  estructura contra el vocabulario permitido y pie siempre el último.

## Entradas y salidas

`componer-campana` devuelve `{ copy, arte, avisoArte }`. El `imagePrompt` lo
escribe el **director de arte**, no el redactor: es quien conoce la paleta, y
la paleta solo llega a la imagen si va escrita dentro del prompt — el reenvío
a `generar-imagen` descarta todo lo demás.

## Semántica de error

Falta de clave → 503 accionable. Proveedor caído → 502 con el motivo.
Respuesta no parseable → 502 «formato inesperado».

## Rendimiento y operación

- **VERIFIED** · Una generación completa del asistente simple tardó **98 s**:
  44 el texto y la dirección de arte, el resto la imagen (2026-09-14).
- **VERIFIED** · Poner los dos agentes en paralelo bajó el texto de 47 s a
  38-44 s.

## Pruebas y verificación

- `frontend/pruebas-porte/direccion-arte.test.mjs` — 10 pruebas sobre la
  reparación de lo que devuelve el modelo (pertenecen al módulo `studio`).
- Las Edge Functions **no tienen pruebas automáticas**.

## Incertidumbres y deuda conocidas

- **OBSERVED** · La calidad del texto está acotada por lo que el cliente
  escriba en «qué quieres transmitir». Con una línea, el modelo parafrasea esa
  línea: comprobado el 2026-09-14 con Woody Tattoo, cuatro frases que dicen lo
  mismo.
- **UNKNOWN** · Ningún cliente real ha validado la taxonomía de segmentos.
- **OBSERVED** · El coste se estima por tarifa de lista; el caché de prompts
  abarata tokens que aquí se cuentan a precio completo.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| Los dos agentes en paralelo funcionan en producción | VERIFIED | `componer-campana`, sesión real | copy + arte, 38 s |
| La generación completa tarda ~98 s | VERIFIED | asistente simple, 2026-09-14 | 15:42:15 → 15:43:53 |
| La imagen entra en el hero desde bucket público | VERIFIED | HTML del correo generado | sin `token=` |
| El texto se aplana con una descripción de una línea | OBSERVED | correo de Woody Tattoo | 4 frases equivalentes |
