# Entrega técnica · Campaign Studio v31

## Contenido

- Aplicación completa Vinext/React para Cloudflare Workers.
- Esquema D1 y migraciones actuales para el modo autónomo.
- Recursos R2 y subida directa/fragmentada.
- Contrato TypeScript `ProspectorIntegrationPort` v1.
- Esquema JSON y validador runtime de `TemplateDocument v1`.
- Adaptador HTTP server-to-server de referencia.
- Migración Supabase aislada con RLS por tenant.
- Manual funcional, matriz QA y guía de integración.
- `.env.example` sin secretos.

## Instalación reproducible

1. Usar Node 22.13 o superior.
2. Instalar con `npm run install:ci`.
3. Configurar las variables exclusivamente en el gestor de secretos.
4. Ejecutar `npm test` y `npm run lint`.
5. Para Sites, conservar `DB` y `BUCKET` en `.openai/hosting.json`.

## Integridad del paquete

El paquete de entrega se genera desde un commit limpio. Excluye `.git`, dependencias, compilados, archivos locales, credenciales y secretos. El manifiesto final registra commit, versión, fecha, listado de archivos y SHA-256 del archivo.

## Integración recomendada

Crear en Prospector una rama `feature/aurevanta-campaign-studio`. Incorporar el módulo bajo una feature flag por tenant. Primero activar editor, persistencia y previsualización; después leads/segmentos; finalmente cumplimiento por destinatario, envío y métricas. No modificar la rama principal hasta superar los criterios de aceptación.

