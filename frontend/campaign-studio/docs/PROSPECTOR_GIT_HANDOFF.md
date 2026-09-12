# Entrega Git para Prospector

## Rama propuesta

`feature/campaign-studio`

La rama se crea desde `main` sin modificar ni forzar el historial principal. El módulo permanece autónomo en `frontend/campaign-studio/` y debe integrarse detrás de una feature flag por tenant hasta superar `docs/UX_V2_REGRESSION_MATRIX.md` y la validación funcional aplicable de `docs/QA_V31.md`.

## Contenido de la actualización V45

- aplicación Campaign Studio completa;
- contrato `ProspectorIntegrationPort v1`;
- esquema portable y validación runtime de `TemplateDocument v1`;
- adaptador HTTP de referencia;
- migración Supabase aislada con RLS;
- documentación de entorno, entrega, usuario y QA;
- pruebas automáticas reproducibles.

## Secuencia recomendada

1. Crear la rama sin alterar la rama principal.
2. Incorporar el módulo en un directorio acordado con el desarrollador.
3. Conectar autenticación y contexto de tenant mediante el adaptador.
4. No ejecutar la migración hasta adaptar `current_tenant_id()` a `auth_tenant_id()`, consolidar el consumo de IA, añadir la FK de tenant, eliminar la sesión de invitado y decidir el despliegue.
5. Configurar secretos exclusivamente en servidor.
6. Ejecutar `npm run lint`, `npm test` y los tres escenarios de extremo a extremo.
7. Abrir una pull request para revisión; no fusionar ni habilitar envío real hasta resolver los criterios pendientes de seguridad, tenant y compliance.

## Condición previa

Antes de escribir en GitHub se comprobarán el repositorio exacto, la rama base y los permisos de escritura. Si la cuenta conectada no permite crear ramas o subir commits, se entregará el commit preparado para que el desarrollador lo aplique sin reconstruir el trabajo.
