// La única superficie de la librería de Excel en todo el proyecto.
//
// POR QUÉ ESTA Y NO SheetJS. El candidato obvio es `xlsx`, y es justo el que
// no conviene: la versión publicada en npm está congelada en la 0.18.5 desde
// que el proyecto se mudó a su propio CDN, y arrastra CVE conocidos. Meter
// eso en un frontend que maneja datos personales de clientes reales, en un
// repositorio público y sin entorno de pruebas, no sale a cuenta.
//
// `read-excel-file` es de SOLO LECTURA —no evalúa fórmulas ni macros—, es
// MIT, y su superficie es una fracción. Va con versión exacta y sin `^`.
//
// POR QUÉ UN IMPORT DINÁMICO. Son unos 150 KB que el noventa y tantos por
// ciento de las sesiones no abre nunca. Vite lo parte en su propio trozo y
// solo viaja cuando alguien suelta un .xlsx. Mismo criterio que el `lazy`
// del studio en App.tsx.
//
// Y por eso todo lo de la librería vive aquí: cambiarla mañana es reescribir
// doce líneas, no buscar imports por media aplicación.

export type HojaLeida = {
  filas: string[][];
  /** Las hojas del libro, para poder decir cuál se ha leído. */
  hojas: string[];
  hojaLeida: string;
};

/**
 * Lee una hoja de un `.xlsx` y devuelve todo como texto recortado.
 *
 * Todo a texto a propósito: un teléfono guardado como número sale
 * `612345678` sin el `+34`, y una fecha sale como fecha. Eso no se arregla
 * aquí — se enseña en la previsualización, que es donde el cliente puede
 * verlo y decidir.
 */
export async function leerXlsx(archivo: File, hoja?: string): Promise<HojaLeida> {
  // La subruta `/browser` y no la raíz: el paquete no tiene entrada raíz,
  // solo `/universal`, `/browser`, `/node` y `/web-worker`.
  const { default: leerLibro } = await import("read-excel-file/browser");

  // La versión 9 devuelve el libro entero de una vez, así que los nombres
  // de las hojas y sus datos salen de la misma lectura.
  const libro = await leerLibro(archivo);
  const hojas = libro.map((h) => h.sheet);
  const elegida = libro.find((h) => h.sheet === hoja) ?? libro[0];

  return {
    filas: (elegida?.data ?? []).map((f) =>
      f.map((c) => (c === null || c === undefined ? "" : String(c).trim())),
    ),
    hojas,
    hojaLeida: elegida?.sheet ?? "",
  };
}
