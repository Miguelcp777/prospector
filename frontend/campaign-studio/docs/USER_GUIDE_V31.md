# Manual funcional · Aurevanta Campaign Studio v31

## Estado del producto

Campaign Studio v31 es un producto autónomo para crear, personalizar, revisar, guardar y exportar campañas de email marketing. La aplicación funciona de forma independiente; la selección real de leads, la validación jurídica por destinatario, el envío masivo, las supresiones y las métricas se conectarán desde Prospector.

## Flujo recomendado

1. **Elegir plantilla:** buscar por sector, objetivo o estilo y partir de una de las 100 recetas.
2. **Editar contenido:** añadir, eliminar, mover y seleccionar bloques.
3. **Diseño y marca:** aplicar el kit de empresa, tipografías, geometrías, fondos y estilos.
4. **Personalizar:** insertar variables en la posición exacta y comprobar sus valores de ejemplo.
5. **Revisar y exportar:** resolver controles críticos, guardar una versión y descargar el resultado.

## Ayuda integrada

El botón de ayuda de la cabecera abre un centro con seis temas: IA, bloques, imágenes, variables, revisión y exportación. Desde él se puede iniciar el recorrido visual que señala cada zona de la interfaz. `Ctrl+K` abre el buscador de acciones.

## Creación con IA

El wizard solicita empresa, contexto, objetivo, audiencia, oferta, destino, tono, densidad, estilo, tipografía e imagen. Permite elegir plantilla, composición, orientación, resolución y posición del sujeto. El resultado sigue siendo totalmente editable.

La misma `OPENAI_API_KEY`, configurada exclusivamente en servidor, alimenta copy, dirección creativa, traducción e imagen. Sin clave, la aplicación emplea el motor guiado y recursos de demostración identificados.

## Editor de bloques

Los tipos disponibles son marca, hero, titular, texto artístico, texto, botón, imagen, columnas, divisor, espacio y pie legal. Se pueden insertar en una posición concreta, reordenar, duplicar o eliminar.

Cada bloque mantiene sus propiedades independientes: contenido, fuente, tamaño, peso, interlineado, color, alineación, fondo, transparencia, borde, radio, giro, ángulo, profundidad, anchura, márgenes, espacios, visibilidad y ajustes móviles. El lienzo conserva la posición del bloque seleccionado durante la edición.

## Imágenes y fondos

Las imágenes pueden proceder del catálogo, la biblioteca, una subida o generación IA. Se admiten PNG, JPEG y WebP. Los PNG conservan transparencia. Las subidas grandes se optimizan y transfieren por fragmentos para evitar el límite de petición.

La generación permite formato horizontal, vertical, cuadrado, panorámico, retrato, banner o tamaño personalizado; resolución normal, 2K o 4K; encaje a hero, bloque o maqueta; estilo, composición, iluminación, posición del sujeto, texto integrado opcional y fondo transparente.

El fondo completo de la maqueta es una capa independiente y admite color, imagen o transparencia, además de posición, encaje, repetición y opacidad.

## Variables y personalización

Las variables se insertan donde está el cursor. Pueden eliminarse y volver a añadirse. Se distinguen fuentes de lead, campaña, remitente, sistema y campos personalizados. La vista previa sustituye variables con datos de ejemplo o con un perfil de lead cuando Prospector esté conectado.

Variables legales mínimas: razón social, dirección postal, política de privacidad, motivo de la comunicación, baja y centro de preferencias.

## Centro de campaña

La revisión comprueba enlaces, variables, textos alternativos, contraste, tamaño y densidad de imágenes, exceso de texto, riesgo de spam, versión móvil, clientes oscuros y estructura legal. También permite variantes A/B/C, reimaginar, mezclar secciones, mapa de atención, comentarios, aprobación, prueba EML, traducción y adaptación multicanal.

El estado **Estructura legal completa; pendiente de validar destinatarios en Prospector** indica que el constructor está preparado. No autoriza el envío: Prospector debe validar base jurídica, procedencia, oposición y supresiones por destinatario.

## Guardado y recuperación

El autoguardado conserva un borrador local recuperable. Guardar crea una versión persistente con control de concurrencia. Los puntos de restauración permiten volver a estados anteriores. Las versiones utilizadas para campañas deben quedar inmutables.

## Exportación

La exportación genera HTML compatible y texto plano. Las URL de imágenes y fondos se convierten a rutas públicas absolutas. La vista móvil independiente y sus ajustes se incorporan al HTML. También puede prepararse un archivo EML para una prueba manual.

## Modos de experiencia

- **Guiado:** reduce la densidad de controles avanzados y prioriza el flujo recomendado.
- **Profesional:** muestra el máximo nivel de personalización.

Temas visuales de la aplicación: Noche Aurevanta, Claro mineral, Océano profundo, Esmeralda ejecutiva y Violeta creativo. Estos temas no cambian el diseño del email.

## Límites y responsabilidades

- Campaign Studio construye, revisa y exporta.
- Prospector identifica al tenant y al usuario, proporciona leads y segmentos, valida cumplimiento, procesa bajas, programa, envía y recibe métricas.
- Las claves nunca se escriben en el navegador ni en Git.
- `TemplateDocument v1` es la fuente canónica; HTML y texto son derivados.

