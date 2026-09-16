// ============================================================
// Buscar sin que las tildes estorben.
//
// EL PROBLEMA, medido: buscar «peluqueria» en Mensajes devolvía 0 de 200
// habiendo dos borradores cuyo asunto decía «peluquería». `toLowerCase()`
// baja las mayúsculas pero no descompone los diacríticos, así que
// «peluquería» y «peluqueria» son cadenas distintas y ninguna contiene a la
// otra.
//
// Esto trabaja en español y sobre negocios españoles: peluquería, óptica,
// panadería, fisioterapia, cafetería. O sea que fallaba justo en las
// palabras que alguien va a escribir para encontrar algo — y **fallaba en
// silencio**: no decía «no encuentro», decía «0 de 200», que se lee como
// «no hay».
//
// Estaba repetido en cuatro pantallas con el mismo error en las cuatro. Por
// eso esto vive aquí y no arreglado cuatro veces: cuatro arreglos
// independientes son cuatro sitios donde se vuelve a olvidar.
// ============================================================

/**
 * Minúsculas y sin tildes, **conservando todo lo demás**.
 *
 * `NFD` separa cada letra acentuada en letra + diacrítico, y el reemplazo se
 * lleva los diacríticos sueltos. Lo que NO se toca son arrobas, puntos,
 * guiones ni espacios: aquí se buscan correos y direcciones, no cabeceras de
 * hoja de cálculo. Esa otra normalización —la que aplasta la puntuación— vive
 * en `deteccion-de-columnas.ts` y sirve para otra cosa.
 *
 * Ojo con la **ñ**: `NFD` la descompone, así que «Muñoz» se pliega a «munoz».
 * En español la ñ es una letra propia y no una n con virgulilla, así que esto
 * es discutible en teoría. En un buscador no lo es: hace que «munoz»
 * encuentre «Muñoz», y «muñoz» lo sigue encontrando igual porque los dos se
 * pliegan a lo mismo. Solo añade resultados, nunca los quita. Lo mismo vale
 * para la ç.
 */
export function plegar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * ¿Alguno de los campos contiene lo buscado, ignorando tildes y mayúsculas?
 *
 * Con la búsqueda vacía devuelve `true`, que es lo que las cuatro pantallas
 * hacían ya a mano antes de comparar: sin nada escrito se ve todo.
 */
export function coincide(
  buscado: string,
  ...campos: (string | null | undefined)[]
): boolean {
  const aguja = plegar(buscado).trim();
  if (aguja === "") return true;
  return campos.some((c) => plegar(c).includes(aguja));
}
