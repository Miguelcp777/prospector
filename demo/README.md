# Demo · Prospector

Prototipo navegable de la app de prospección. Un solo archivo, sin build y sin
dependencias.

Funciona en dos modos, y el que esté activo se ve en la cabecera y en el pie:

| Modo | Cuándo | Qué hace |
|---|---|---|
| **Simulado** | `SUPABASE_URL` vacío | Todo de guion. Ni una llamada de red |
| **En vivo** | `SUPABASE_URL` configurado | Los segmentos los deduce Claude a partir de lo que escriba el visitante |

Los **leads son siempre simulados**, en los dos modos. Descubrirlos de verdad
consulta Google Places, que se paga por consulta y exige una campaña de un
cliente real. La demo lo dice explícitamente en pantalla en vez de dejarlo
implícito, que es lo que convierte una demo en un problema.

## Activar la inferencia real

1. Despliega la función `demo-inferir` — ver `supabase/README.md`.

2. Abre `index.html` y pega la URL del proyecto arriba del `<script>`:

   ```js
   const SUPABASE_URL = 'https://tpfjeumrvdbciktmaaii.supabase.co';
   ```

3. Fija el dominio de la demo en el backend, o cualquiera podrá incrustar la
   función y te pagará las llamadas a Claude:

   ```bash
   supabase secrets set ORIGENES_PERMITIDOS=https://tu-demo.netlify.app
   ```

No hay ninguna clave en este archivo, y no debe haberla: es un sitio estático
y su código fuente es público. `demo-inferir` es pública a propósito y lo que
la protege es la cuota, no un secreto.

## Cuánto puede costar

Cada visitante que pulsa "Inferir segmentos" es una llamada a Claude. Los
topes por defecto son 5 inferencias por IP y 300 al día en total; al pasarse,
la demo sigue funcionando con los segmentos de la taxonomía curada y lo avisa.

Para cambiarlos:

```bash
supabase secrets set DEMO_MAX_POR_IP=10
supabase secrets set DEMO_MAX_POR_DIA=500
```

## Desplegar en Netlify

**Arrastrar y soltar** — entra en app.netlify.com, pestaña Sites, y arrastra
esta carpeta al recuadro. Queda publicada en unos segundos.

**Desde Git** — conecta el repositorio, pon `demo` como base directory y deja
el build vacío. Ya está configurado en `netlify.toml`.

Funciona igual en Vercel, Cloudflare Pages o GitHub Pages.

Después de publicar, vuelve a fijar `ORIGENES_PERMITIDOS` con el dominio real
que te haya dado Netlify.

## Probar en local

Abrir `index.html` en el navegador. No necesita servidor.

En modo simulado funciona tal cual. En modo en vivo, el navegador manda un
`Origin` de tipo `null` desde `file://`, que no estará en tu lista de orígenes
permitidos: para probar la inferencia real en local, sirve la carpeta por HTTP
(`npx serve demo`) y añade `http://localhost:3000` a `ORIGENES_PERMITIDOS`.

## Antes de enseñarlo a un cliente

- Cambia el nombre "Prospector" por el vuestro en `index.html`.
- Los nombres de negocios son inventados a propósito: llevan "Ejemplo" y el
  email el prefijo `ejemplo-`. Si los sustituyes por reales, revisa
  `docs/compliance.md` antes.
- Las etiquetas de la cabecera y el pie son deliberadas. Quitarlas convierte
  una demo honesta en una demo que miente sobre qué datos está enseñando.
