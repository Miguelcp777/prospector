# Campaign Studio UX V2 · matriz de regresión

Base protegida: versión 44, commit `43113e8`, 69 comprobaciones automatizadas.

| Área | Capacidad v44 protegida | Cobertura UX V2 |
|---|---|---|
| Campañas | Guardar, autoguardar, abrir, buscar, duplicar, versionar, archivar y restaurar | Mis campañas + accesos contextuales |
| Documento | Deshacer, rehacer, historial local y recuperación de borrador | Cabecera compacta, sin alterar el motor |
| Creación | IA, plantilla, cero, campaña anterior e importación HTML | Inicio + modo guiado Crear |
| Editor | Añadir, borrar, duplicar, ordenar y arrastrar bloques | Panel Bloques/Capas plegable |
| Maqueta | Escritorio/móvil, zoom, ancho/alto independientes y selección directa | Superficie central prioritaria |
| Capas | Posición, escala, profundidad, solapamiento y controles hero | Inspector contextual + avanzado |
| Contenido | Asunto, preheader, texto, CTA, enlaces y variables | Paso Contenido + inspector |
| Diseño | Tipografía, color, fondo, bordes, formas, 3D e imágenes | Paso Diseño + avanzado |
| Recursos | Imágenes generadas/subidas, formatos y resoluciones | Marca y recursos + accesos contextuales |
| Marca | Logo, paleta, fuentes, datos del remitente y directrices | Espacio único Marca y recursos |
| Revisión | Calidad, enlaces, contraste, móvil, spam, cumplimiento y pruebas | Centro de revisión único |
| Exportación | HTML, texto, EML y contrato TemplateDocument | Revisión y exportación |
| Avanzado | Variantes A/B, módulos, checkpoints, comentarios y simulación | Modo profesional / Centro de campaña |
| Integración | API, D1/R2 y contrato Prospector | Sin modificación de contratos ni migraciones |

## Reglas de no regresión

- Ninguna acción protegida puede desaparecer: solo cambiar de ubicación o nivel de exposición.
- Los estados persistentes, endpoints, contratos, D1/R2 y formatos de exportación permanecen compatibles.
- El modo guiado reduce exposición; el profesional conserva el control completo.
- Toda incidencia de revisión debe conducir a la fase o control que permite resolverla.
- No se publica una nueva versión sin autorización expresa.
