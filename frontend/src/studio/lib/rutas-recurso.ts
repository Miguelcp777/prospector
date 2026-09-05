// ============================================================
// Rutas de las imágenes del catálogo.
//
// Las cuatro fotos predefinidas vivían en /assets/ y se movieron a
// /imagenes/, porque netlify.toml da a /assets/* un año de caché inmutable
// y esa regla vale para los ficheros del bundle, que llevan hash, no para
// unas fotos de nombre fijo.
//
// El movimiento arregló las referencias del código, pero la ruta también
// está DENTRO de los documentos ya guardados: cada plantilla lleva la suya
// en `settings.backgroundImageUrl` y en los `imageUrl` de sus bloques. Esas
// siguen apuntando a /assets/, que ahora devuelve 404, y lo que se ve es un
// hueco.
//
// Reescribirlas en la base sería tocar datos de clientes. Se corrigen al
// leerlas: cuesta lo mismo, no hay migración que revisar, y el documento
// queda bien la próxima vez que se guarde.
// ============================================================

/** Las ocho: cuatro miniaturas y sus versiones 4K. */
const CATALOGO = /^\/assets\/((?:ai-campaign|aurevanta-command-center-hero|industrial-cleaning|sports-physio)(?:-4k)?\.webp)$/;

/**
 * Devuelve la ruta buena de un recurso. Cualquier otra URL —una firmada del
 * Storage, una absoluta, una variable sin sustituir— sale intacta.
 */
export function normalizarRutaRecurso(url: unknown): string {
  const texto = String(url ?? "");
  const coincide = texto.match(CATALOGO);
  return coincide ? `/imagenes/${coincide[1]}` : texto;
}
