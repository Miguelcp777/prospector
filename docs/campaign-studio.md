# Campaign Studio V45 · integración controlada

Campaign Studio se mantiene en `frontend/campaign-studio/` como subaplicación autónoma. Esta rama actualiza V31 a V45 UX V2; no modifica la aplicación principal, no ejecuta migraciones, no habilita envíos y no contiene secretos.

## Validación de esta entrega

- Build de producción correcto.
- ESLint sin errores.
- 72/72 pruebas automáticas superadas.
- Contrato `TemplateDocument v1` conservado como fuente canónica; HTML y texto siguen siendo derivados.
- UX V2 con cinco espacios, modo guiado, edición móvil y biblioteca Premium validada.

## Lo que sí está en la aplicación

El studio que usan los clientes no es esta carpeta, sino `frontend/src/studio/`.
Las mejoras de V45 —hero de composición libre, biblioteca Premium, adaptación
móvil, paleta de comandos y los cinco temas— están portadas ahí. Lo que se
quedó fuera, y por qué, en `docs/decisiones/0005-v45-al-studio-de-la-app.md`.

Esta carpeta sigue sin conectarse a nada, con las cinco condiciones de la
0003 pendientes.

## Integración recomendada

1. Revisar `frontend/campaign-studio/PROSPECTOR_INTEGRATION.md` y `frontend/campaign-studio/docs/PROSPECTOR_GIT_HANDOFF.md`.
2. Mantener el módulo detrás de una feature flag por tenant.
3. Implementar `ProspectorIntegrationPort v1` usando el usuario y tenant autenticados en servidor.
4. No ejecutar `frontend/campaign-studio/integration/prospector/supabase/001_campaign_studio.sql` todavía.
5. Antes de adaptar la migración: sustituir `current_tenant_id()` por el patrón `auth_tenant_id()` de Prospector, añadir FK hacia `tenants`, unificar el consumo de IA con `consumo_modelo`, retirar la sesión de invitado y decidir el despliegue.
6. Configurar claves únicamente como secretos de servidor.
7. Ejecutar `npm run lint`, `npm test` y `docs/UX_V2_REGRESSION_MATRIX.md` antes de fusionar.

## Cumplimiento

El constructor prepara contenido, pie legal y handoff, pero no envía campañas. Prospector conserva la responsabilidad de validar procedencia, base jurídica, oposición y supresiones inmediatamente antes de encolar cada destinatario. No debe conectarse el envío real antes de que la lista de supresión y el opt-out estén operativos.
