# Demo · Prospector

Prototipo navegable de la app de prospección. Un solo archivo, sin build,
sin backend y sin llamadas a ninguna API. Todos los datos son simulados.

## Qué se puede enseñar

1. **Negocio** — el cliente describe su actividad y su zona.
2. **Segmentos** — el mapa radial revela los siete segmentos adyacentes.
   Se pueden descartar tocando el círculo o la tarjeta: los leads y el
   presupuesto estimado de consultas se recalculan solos.
3. **Leads** — tabla filtrable por segmento, con score y ficha lateral.
   Cada ficha incluye el mensaje que se enviaría a ese segmento.

## Desplegar en Netlify

**Arrastrar y soltar** — entra en app.netlify.com, pestaña Sites, y arrastra
esta carpeta al recuadro. Queda publicada en unos segundos.

**Desde Git** — conecta el repositorio y deja el build vacío con
`publish = "."`. Ya está configurado en `netlify.toml`.

Funciona igual en Vercel, Cloudflare Pages o GitHub Pages.

## Probar en local

Abrir `index.html` en el navegador. No necesita servidor.

## Antes de enseñarlo a un cliente

- Cambia el nombre "Prospector" por el vuestro en `index.html`.
- Los nombres de negocios son inventados y llevan el prefijo `ejemplo-` en los
  emails a propósito. Si los sustituyes por reales, revisa `docs/compliance.md`
  del proyecto principal antes.
- La etiqueta "Datos de demostración" de la cabecera es deliberada: evita que
  nadie confunda la demo con resultados reales.
