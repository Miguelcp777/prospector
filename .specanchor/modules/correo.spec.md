---
type: module-spec
module: correo
status: ready
source_paths:
  - supabase/functions/enviar-prueba/*
  - supabase/functions/dominio-correo/*
  - supabase/functions/correo-webhook/*
  - supabase/functions/baja/*
  - supabase/functions/landing/*
  - supabase/functions/generar-landing/*
  - frontend/public/baja.html
  - frontend/public/landing.html
  - frontend/src/lib/aplicar-plantilla.ts
  - frontend/src/lib/plantilla-por-defecto.ts
last_reviewed: 2026-09-14
---

# Módulo: correo

## Responsabilidad

Quién firma un correo, cómo se viste un mensaje con una plantilla, cómo se da
de baja alguien y qué landing ve. Es el módulo con riesgo legal: aquí se
cumple —o no— la LSSI-CE.

## Propiedad del código

Seis Edge Functions, las dos páginas públicas del frontend y las dos piezas
de `frontend/src/lib` que visten un mensaje. `aplicar-plantilla.ts` vive en el
frontend pero su contrato es de este módulo: es donde se decide qué datos
reales entran en el correo.

## Interfaces públicas

- `enviar-prueba` — manda **a la dirección del token**, nunca a un lead.
- `dominio-correo` — alta y comprobación del dominio del cliente en Resend.
- `baja` — opt-out por token, sin sesión.
- `landing` / `generar-landing` — la landing por campaña.
- `correo-webhook` — rebotes y quejas del proveedor.

## Invariantes de dominio

- **INV-COR-001** · Un mensaje sin enlace de baja no sale, ni de prueba. Lo
  impone el trigger `no_enviar_a_suprimidos` y lo repite `enviar-prueba`.
- **INV-COR-002** · `enviar-prueba` **no** marca el mensaje como `enviado`.
  Lo enviado es lo que se mandó a un cliente; falsearlo estropea el embudo y
  el registro que hay que poder enseñar ante una reclamación.
- **INV-COR-003** · Un enlace del pie se dibuja solo si tiene **texto y
  destino**. `undefined` cae en el valor por defecto; `""` lo quita.
- **INV-COR-004** · **No se ofrece un centro de preferencias.** No existe, y
  `system.preferences_url` se rellena con la URL de baja. Las plantillas que
  genera la IA vacían esa etiqueta (visto en un correo real el 2026-09-14).
- **INV-COR-005** · El nombre que firma sale de `config_correo.nombre_remitente`
  y, si no, del negocio; la campaña puede declarar otro (043). El texto y el
  diseño tienen que decir lo mismo: un correo cuyo cuerpo firma una empresa y
  cuyo pie firma otra es peor que el fallo original.
- **INV-COR-006** · Lo que va dentro de un correo se sirve desde bucket
  público. Una URL firmada es una imagen rota con retardo — el peor fallo,
  porque en la prueba se ve bien (044, 050).
- **INV-COR-007** · Un tenant sin dominio verificado no envía. Nada de caer a
  un dominio nuestro «mientras tanto»: eso es la opción B de la 0004 por la
  puerta de atrás.

## Datos y persistencia

`config_correo` (modo, remitente, buzón, dominio, domicilio postal, privacidad,
estado y registros DNS), `suppressions`, `messages.token_baja`.

`estado_dominio`, `registros_dns` y `proveedor_dominio_id` están **fuera** del
GRANT por columna: si el cliente pudiera escribirlos se marcaría
`verificado` sin poner un registro, o heredaría la verificación de otro tenant.

## Integraciones externas

Resend (envío y alta de dominio). `RESEND_API_KEY` y `REMITENTE_PRUEBA` son
secretos de Edge Function.

## Pruebas y verificación

`frontend/pruebas-porte/composicion-simple.test.mjs` comprueba que el pie
conserva las variables de cumplimiento y que no aparece «Gestionar
preferencias». Las Edge Functions no tienen pruebas.

## Incertidumbres y deuda conocidas

- **UNKNOWN** · `dominio-correo` está escrito y desplegado pero **ninguna
  campaña ha dado de alta un dominio real**. El camino verificado es el
  manual.
- **OBSERVED** · La Fase 4 sigue cerrada: falta la ingesta automática de
  rebotes y quejas. `suppressions` se rellena a mano.
- **OBSERVED** · Los mensajes ya redactados no cambian cuando cambia quién
  firma; hay que borrarlos y reescribirlos.

## Historial de cambios

- 2026-09-14 · Redactada durante la adopción de SDD. Sin cambio de código.

## Evidencia de las afirmaciones

| Afirmación | Estado | Fuente / revisión | Resultado |
|---|---|---|---|
| El pie firma con los datos del cliente | VERIFIED | correo generado 2026-09-14 | «Woody Tattoo · Calle Mayor numero 7» |
| «Gestionar preferencias» apuntaba a la baja | VERIFIED | `aplicar-plantilla.ts:314` + HTML generado | enlace presente, corregido |
| El logo llega al correo desde bucket público | VERIFIED | HTML del correo generado | `object/public/logos/…` |
| Ningún correo llevaba logo antes de la 051 | VERIFIED | consulta a `recursos` | 0 filas con `campaign_id is null` |
