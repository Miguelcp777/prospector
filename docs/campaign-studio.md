# Campaign Studio · integración controlada

Campaign Studio se incorpora en `frontend/campaign-studio/` como subaplicación autónoma. Este commit no modifica la aplicación existente, no ejecuta migraciones y no contiene secretos.

## Validación de esta entrega

- Build de producción correcto.
- ESLint sin errores.
- 50/50 pruebas automáticas superadas.
- Contrato `TemplateDocument v1` congelado.
- Ayuda integrada y recorrido guiado comprobados en navegador.

## Integración recomendada

1. Revisar `frontend/campaign-studio/PROSPECTOR_INTEGRATION.md`.
2. Implementar `ProspectorIntegrationPort v1` con el usuario y tenant autenticados.
3. Revisar, adaptar y ejecutar manualmente la migración aislada de `frontend/campaign-studio/integration/prospector/supabase/`.
4. Configurar claves únicamente como secretos de servidor.
5. Activar el módulo mediante una feature flag por tenant.
6. Ejecutar la matriz de `frontend/campaign-studio/docs/QA_V31.md` antes de fusionar.

## Cumplimiento

El constructor prepara contenido, pie legal y handoff. Prospector mantiene la responsabilidad de validar base jurídica, procedencia, oposición y supresiones inmediatamente antes de encolar cada destinatario. El presente commit no habilita el envío masivo.
