# Aurevanta Campaign Studio

Producto independiente para diseñar, personalizar, revisar, versionar y exportar campañas de email marketing, preparado para integrarse en Prospector mediante un puerto estable.

## Centro de campaña v0.3.1 · Sites v31

- Revisión previa al envío: enlaces públicos, variables, textos alternativos, contraste, densidad, baja, riesgo de spam y ajustes móviles.
- Previsualización con perfiles de lead y simulación diferenciada de Gmail, Outlook y Apple Mail en oscuro, independiente del tema de la aplicación.
- Autoguardado, recuperación local inmediata y puntos de restauración persistentes en D1.
- Asuntos, preheaders, traducción contextual, contenido desde URL, kit de marca y director creativo mediante una única `OPENAI_API_KEY` de servidor.
- Comparador A/B/C, combinador de secciones, planes de experimento, seis direcciones para reimaginar y mapa dinámico de atención.
- Reglas condicionales y personalización independiente por bloque para móvil, aplicada también al HTML exportado.
- Biblioteca de 200 secciones, módulos reutilizables con propagación de revisiones y galería semántica.
- Adaptación multicanal, preparación de pruebas `.eml`, comentarios, decisiones y enlace público de revisión.
- Ayuda guiada de nueve pasos para primera entrada, adaptable a móvil y disponible de nuevo desde la cabecera o `Ctrl+K`.
- Centro de ayuda integrado por tareas para IA, bloques, imágenes, variables, revisión y exportación.
- Contrato `TemplateDocument v1` congelado con validación runtime y JSON Schema interoperable.

## Integración con Prospector

`lib/prospector-contract.ts` define el límite estable de integración: contexto multiempresa, contactos, segmentos, supresiones, versión inmutable, envío de prueba, activación y métricas. `/api/integration-readiness` expone las capacidades disponibles sin revelar secretos. Véase `PROSPECTOR_INTEGRATION.md`.

La entrega incorpora además `integration/prospector/http-adapter.ts`, la migración Supabase aislada en `integration/prospector/supabase/`, el esquema portable en `contracts/` y la estrategia de rama descrita en `docs/PROSPECTOR_GIT_HANDOFF.md`.

## Capacidades

- Editor visual por bloques con undo/redo.
- Biblioteca de plantillas, duplicado, archivado y versiones optimistas.
- Variables de lead, campaña, remitente y sistema.
- Preview de escritorio/móvil, HTML compatible y texto plano.
- Kit de marca y biblioteca de recursos en R2.
- Importación de HTML sanitizada.
- Generación de copy e imagen mediante adaptadores server-side.
- Recursos visuales 4K y derivados WebP ligeros.
- Impact Score explicable y controles previos al envío.

En modo autónomo prepara un `.eml` estándar que se puede abrir y enviar con un cliente de correo. El envío masivo, la selección real de leads y el tracking se activan al conectar el transporte y el adaptador de Prospector; la interfaz no simula esas operaciones.

## Desarrollo

```bash
npm run install:ci
npm run db:generate
npm run dev
```

## Verificación

```bash
npm run lint
npm test
```

`npm test` realiza un build de producción y valida renderer, fondos/recursos exportados, responsive móvil, merge tags, sanitización, catálogo, perfiles oscuros, mezcla de variantes, atención, costes y ranking de galería.

## Persistencia

- D1: plantillas, versiones, kits de marca, assets y ejecuciones de generación.
- R2: archivos subidos y recursos generados.
- Los endpoints derivan el propietario de cabeceras autenticadas de Sites; nunca aceptan un owner arbitrario del cliente.

Las migraciones se generan en `drizzle/` desde `db/schema.ts`.

## IA

La aplicación funciona sin credencial mediante un motor guiado y recursos 4K de demostración claramente identificados. Si `OPENAI_API_KEY` se configura como secreto de servidor, activa generación estructurada de copy y `gpt-image-2`. Ninguna clave debe introducirse en el navegador, el repositorio o los archivos del proyecto.

## Integración futura

La fuente de verdad es `TemplateDocument`; HTML y texto son derivados. Al integrar en Prospector se sustituirá el repositorio D1 por Supabase, se aplicará `tenant_id` + RLS y las campañas fijarán una versión inmutable mediante `template_version_id`.
