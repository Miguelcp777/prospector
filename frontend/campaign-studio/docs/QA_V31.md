# Matriz de verificación funcional · v31

## Puertas de calidad

| Área | Escenario | Resultado esperado |
| --- | --- | --- |
| Inicio | Abrir como visitante | Editor disponible sin bloqueo de acceso |
| Ayuda | Abrir Ayuda e iniciar recorrido | Centro por temas y guía visual operativos |
| Wizard | Generar campaña guiada | Documento editable, asunto, preheader e imagen coherentes |
| Plantillas | Buscar y aplicar receta | Se conserva una composición distinta y editable |
| Bloques | Añadir, mover y eliminar | Orden exacto tanto en lista como en maqueta |
| Inspector | Cambiar un bloque | No se modifican estilos de otros bloques |
| Variables | Insertar en el cursor | Merge tag en la posición seleccionada |
| Fondo | Color, imagen y transparente | El lienzo exportado reproduce la selección |
| PNG | Subir imagen grande transparente | Progreso completo, transparencia y biblioteca persistente |
| Imagen IA | Formato y resolución | Dimensiones cercanas al destino y previsualización previa |
| Móvil | Cambiar orden, tamaño y visibilidad | Preview y HTML móvil coincidentes |
| Guardado | Guardar dos sesiones concurrentes | Conflicto 409, sin sobrescritura silenciosa |
| Recuperación | Cerrar con cambios pendientes | Recuperación del último borrador local |
| Revisión | Ejecutar Centro de campaña | Controles críticos y recomendaciones explicables |
| Enlaces | Auditar CTA y pie legal | Listado por bloque y corrección centralizada |
| Exportación | Descargar HTML | Primera imagen, imágenes de bloque y fondo con URL absoluta |
| Cumplimiento | Quitar una variable legal | Handoff marcado como incompleto |
| Contrato | Enviar documento malformado | Respuesta 400 con incidencias de validación |
| Seguridad | Solicitar recurso de otro propietario | Acceso rechazado o recurso no encontrado |

## Escenarios completos

### 1. Campaña creada con IA

Crear una campaña B2B tecnológica, generar imagen horizontal 2K, editar el hero, insertar nombre y empresa, revisar, guardar y exportar. Debe conservarse la imagen y el HTML debe abrir sin recursos relativos.

### 2. Plantilla manual móvil

Partir de una plantilla de servicios, eliminar dos bloques, añadir CTA y columnas, cambiar orden móvil, ocultar un bloque y validar Gmail/Outlook/Apple oscuro. Escritorio y móvil deben mantener personalizaciones independientes.

### 3. Entrega a Prospector

Completar identidad y pie legal, guardar versión, construir `CampaignActivationPayload`, validar el documento contra el esquema v1 y comprobar que el handoff exige validación de destinatarios. Prospector debe bloquear bases desconocidas, suprimidos, oposiciones o ausencia de evidencia.

## Automatización

La suite cubre renderer, HTML absoluto, transparencia, responsive, merge tags, sanitización, revisión, catálogo, formatos de imagen, subida fragmentada, variantes, atención, costes y contrato v1. La auditoría manual complementa estas pruebas en interacción, foco, scroll y percepción visual.

