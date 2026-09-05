# Entrega Git para Prospector

## Rama propuesta

`feature/aurevanta-campaign-studio`

La rama debe crearse desde la referencia que indique el desarrollador de Prospector. No se modifica `main` ni se fuerza el historial. El módulo se integra detrás de una feature flag por tenant hasta superar la matriz de aceptación de `docs/QA_V31.md`.

## Contenido del primer commit

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
4. Ejecutar la migración en un entorno de desarrollo de Supabase.
5. Configurar secretos exclusivamente en servidor.
6. Ejecutar `npm run lint`, `npm test` y los tres escenarios de extremo a extremo.
7. Abrir una pull request para revisión; no fusionar hasta resolver los criterios pendientes.

## Condición previa

Antes de escribir en GitHub se comprobarán el repositorio exacto, la rama base y los permisos de escritura. Si la cuenta conectada no permite crear ramas o subir commits, se entregará el commit preparado para que el desarrollador lo aplique sin reconstruir el trabajo.
