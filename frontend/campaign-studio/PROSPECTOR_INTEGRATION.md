# Integración final con Prospector

**Contrato congelado:** `ProspectorIntegrationPort v1` + `TemplateDocument v1`.

Campaign Studio funciona como producto autónomo. La integración no debe importar componentes internos de Prospector ni acceder directamente a sus tablas: Prospector implementará `ProspectorIntegrationPort` en `lib/prospector-contract.ts` y proporcionará el contexto autenticado.

## Responsabilidades

| Campaign Studio | Adaptador Prospector |
| --- | --- |
| Documento editable, HTML y texto derivados | `tenantId`, `userId` y autorización RLS |
| Plantillas, versiones y checkpoints | Leads y campos personalizados |
| Recursos, marca e IA | Segmentos y estimación de audiencia |
| Revisión, identidad legal, privacidad y variantes A/B | Base aplicable, procedencia, oposición y supresiones |
| Plan de experimento y regla ganadora | Cola, idempotencia, programación y transporte |
| Comentarios, aprobación y exportación | Eventos de entrega, clic, conversión y rebote |

## Secuencia de integración

1. Sustituir la sesión de invitado por el usuario autenticado y construir `ProspectorCampaignContext`.
2. Implementar `listLeads`, `listSegments` y `validateSuppression` contra Supabase con RLS.
3. Implementar `saveCampaign` fijando `templateId` y `templateVersion`; adjuntar el resultado de `buildComplianceHandoff(document)`. El HTML enviado nunca debe depender de una plantilla mutable.
4. Conectar `sendTest` y `activate` al servicio de envío, con clave sólo en servidor, dominio verificado e idempotencia.
5. Transformar webhooks del proveedor a `CampaignMetricEvent` y llamar a `ingestMetrics`.
6. Ejecutar `validateRecipientCompliance` inmediatamente antes de encolar: excluir base desconocida, evidencia ausente, oposición o supresión.
7. Resolver la baja mediante `resolveUnsubscribe` y añadir el lead a la lista de supresión antes de cualquier nuevo envío.
8. Mapear las variables según `PROSPECTOR_MERGE_MAP`; ampliar campos personalizados sin cambiar el renderer.

## Entregables de integración

- `contracts/template-document-v1.schema.json`: validación independiente del lenguaje.
- `lib/template-document-schema.ts`: validación runtime en Campaign Studio.
- `integration/prospector/http-adapter.ts`: adaptador server-to-server de referencia.
- `integration/prospector/supabase/001_campaign_studio.sql`: persistencia aislada y RLS por tenant.
- `docs/QA_V31.md`: escenarios y puertas de aceptación.

La migración utiliza el claim JWT `tenant_id`. Si Prospector resuelve pertenencia mediante una tabla de membresías, se sustituye solamente `campaign_studio.current_tenant_id()` por la función autorizadora del proyecto; el resto del esquema y del contrato permanece estable.

## Contrato de cumplimiento

El constructor entrega la campaña con razón social, dirección postal, explicación del motivo, política de privacidad, centro de preferencias y baja. El estado correcto del constructor es **«Estructura legal completa; pendiente de validar destinatarios en Prospector»**. No equivale a autorizar el envío.

Prospector debe resolver por destinatario `campaign.legal_reason`, `system.unsubscribe_url` y `system.preferences_url`, conservar evidencia de la base aplicable y bloquear cualquier comunicación comercial cuya situación no sea verificable. El pie legal no convierte en lícito un envío que Prospector deba bloquear.

## Variables de servidor

- `OPENAI_API_KEY`: única credencial para las funciones de IA.
- `PROSPECTOR_API_URL` y `PROSPECTOR_API_TOKEN`: activan el bridge de datos.
- `EMAIL_PROVIDER_KEY`: activa el transporte de prueba y campañas.
- `DB` y `BUCKET`: persistencia D1 y R2 del producto autónomo.

Nunca se exponen claves al navegador. El endpoint autenticado `/api/integration-readiness` devuelve solamente booleanos de disponibilidad y capacidades.

## Criterios de aceptación

- Un usuario sólo puede listar y usar leads de su tenant.
- Una campaña enviada conserva documento, asunto, preheader, HTML, texto y versión inmutables.
- `buildComplianceHandoff(document).builderStatus` debe ser `ready`; aun así, Prospector siempre ejecuta su validación por destinatario.
- Leads suprimidos o sin base aplicable quedan excluidos antes de encolar.
- La primera comunicación incorpora la información exigible cuando el dato no procede del interesado, según la política definida en Prospector.
- La oposición a marketing tiene efecto antes de aceptar otro envío.
- Reintentos no duplican envíos.
- La baja se procesa antes de aceptar otro envío al destinatario.
- Métricas y variante A/B quedan vinculadas a campaña, lead y tenant.
