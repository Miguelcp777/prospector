// Leer una tabla que ha escrito otro: CSV, TSV o un pegado de Excel.
//
// Todo lo de aquí es puro y sin dependencias: entra un ArrayBuffer o un
// texto, sale una matriz de celdas. Vive en lib/ y no dentro del componente
// para que se pueda probar sin montar React, que es lo que permite que
// app-web tenga por fin alguna prueba automática.
//
// Los dos fallos que de verdad tienen los CSV exportados desde Excel en
// España no son el formato: son la codificación y el separador. Un acento
// mal leído no rompe nada y escribe mal el nombre de dos mil personas.

export type Codificacion = "utf-8" | "utf-8-bom" | "utf-16" | "windows-1252";

export type TablaLeida = {
  filas: string[][];
  codificacion: Codificacion | null;
  delimitador: string;
};

/** Los que usa la gente, en el orden en que conviene desempatar. */
export const DELIMITADORES = [";", ",", "\t", "|"] as const;

// ---------------------------------------------------------------------------
// Codificación
// ---------------------------------------------------------------------------

/**
 * Decide con qué codificación leer los bytes.
 *
 * El orden importa: primero las marcas de orden de bytes, que son ciertas;
 * después UTF-8 en modo estricto; y si eso revienta, Windows-1252 — que es
 * lo que escribe «Guardar como CSV» de Excel en España y no se anuncia de
 * ninguna manera.
 */
export function decodificar(bytes: ArrayBuffer): { texto: string; codificacion: Codificacion } {
  const b = new Uint8Array(bytes);

  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return { texto: new TextDecoder("utf-8").decode(b.subarray(3)), codificacion: "utf-8-bom" };
  }
  // «Texto Unicode (*.txt)» de Excel sale así, y además con tabuladores.
  if (b[0] === 0xff && b[1] === 0xfe) {
    return { texto: new TextDecoder("utf-16le").decode(b), codificacion: "utf-16" };
  }
  if (b[0] === 0xfe && b[1] === 0xff) {
    return { texto: new TextDecoder("utf-16be").decode(b), codificacion: "utf-16" };
  }

  try {
    // fatal: true es la clave. Sin él, TextDecoder mete U+FFFD donde no
    // entiende un byte y nunca sabríamos que el archivo no era UTF-8.
    // Un archivo ASCII puro pasa por aquí y se etiqueta utf-8, que da igual:
    // ASCII es idéntico en las dos.
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(b), codificacion: "utf-8" };
  } catch {
    return { texto: new TextDecoder("windows-1252").decode(b), codificacion: "windows-1252" };
  }
}

// ---------------------------------------------------------------------------
// Delimitador
// ---------------------------------------------------------------------------

/** Cuenta apariciones de `d` fuera de comillas, que es lo único que cuenta. */
function contarFuera(linea: string, d: string): number {
  let n = 0;
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') i++;
      else dentro = !dentro;
    } else if (!dentro && c === d) n++;
  }
  return n;
}

/**
 * Elige el separador por consistencia entre líneas, no por frecuencia.
 *
 * Un CSV con `;` de separador y comas decimales dentro (`1,50`) tiene las
 * dos consistentes: la diferencia es que `;` da seis columnas y `,` da doce.
 * De ahí el desempate por número de columnas, y de ahí que `;` vaya primero
 * en la lista para el caso en que ni eso decida.
 *
 * `orden` permite invertirlo para el portapapeles, donde manda el tabulador.
 */
export function detectarDelimitador(
  texto: string,
  orden: readonly string[] = DELIMITADORES,
): string {
  const lineas = texto.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").slice(0, 10);
  if (lineas.length === 0) return orden[0];

  let mejor = orden[0];
  let mejorPuntos = -Infinity;

  for (const d of orden) {
    const cuentas = lineas.map((l) => contarFuera(l, d));
    // La moda, no la media: una línea rara no debe mover el resultado.
    const frecuencia = new Map<number, number>();
    for (const c of cuentas) frecuencia.set(c, (frecuencia.get(c) ?? 0) + 1);
    let moda = 0;
    let vecesModa = 0;
    for (const [valor, veces] of frecuencia) {
      if (veces > vecesModa || (veces === vecesModa && valor > moda)) {
        moda = valor;
        vecesModa = veces;
      }
    }
    // Si la moda es 0, ese carácter no separa nada en este archivo.
    const puntos = moda === 0 ? -1 : vecesModa + moda * 0.01;
    if (puntos > mejorPuntos) {
      mejorPuntos = puntos;
      mejor = d;
    }
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// El tokenizador
// ---------------------------------------------------------------------------

/**
 * RFC 4180 con las tolerancias de la vida real: saltos `\r\n`, `\n` y `\r`
 * sueltos, comillas escapadas duplicándolas, saltos de línea dentro de una
 * celda entrecomillada, y última línea sin salto final.
 *
 * Las líneas completamente vacías se saltan y **no consumen número de
 * fila**: si no, el «lista X, fila 37» que se guarda como origen del dato
 * apuntaría a otra fila distinta de la que ve el cliente en su Excel.
 */
export function tokenizar(texto: string, delimitador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let dentro = false;
  let hayAlgo = false;

  const cerrarCelda = () => {
    fila.push(celda);
    celda = "";
  };
  const cerrarFila = () => {
    cerrarCelda();
    // Una fila de una sola celda vacía es una línea en blanco, no un dato.
    if (!(fila.length === 1 && fila[0] === "")) filas.push(fila);
    fila = [];
    hayAlgo = false;
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else dentro = false;
      } else celda += c;
      continue;
    }

    if (c === '"' && celda === "") {
      dentro = true;
      hayAlgo = true;
    } else if (c === delimitador) {
      cerrarCelda();
      hayAlgo = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      cerrarFila();
    } else {
      celda += c;
      if (c.trim() !== "") hayAlgo = true;
    }
  }
  // Última línea sin salto final.
  if (celda !== "" || fila.length > 0 || hayAlgo) cerrarFila();

  return filas;
}

// ---------------------------------------------------------------------------
// ¿La primera fila son títulos o ya son datos?
// ---------------------------------------------------------------------------

const RE_EMAIL_DETECCION = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/**
 * Si la primera fila no trae ninguna dirección y las siguientes sí, es una
 * cabecera. No hay más señal fiable que esa: los títulos de columna pueden
 * estar en cualquier idioma, pero nunca son correos.
 */
export function pareceQueHayCabecera(filas: string[][]): boolean {
  if (filas.length < 2) return true;
  const enLaPrimera = filas[0].filter((c) => RE_EMAIL_DETECCION.test(c.trim())).length;
  if (enLaPrimera > 0) return false;

  const siguientes = filas.slice(1, 21);
  let celdas = 0;
  let correos = 0;
  for (const f of siguientes) {
    for (const c of f) {
      const v = c.trim();
      if (v === "") continue;
      celdas++;
      if (RE_EMAIL_DETECCION.test(v)) correos++;
    }
  }
  return celdas > 0 && correos / celdas > 0.02;
}

// ---------------------------------------------------------------------------
// La puerta de entrada
// ---------------------------------------------------------------------------

/** Lee un CSV/TSV desde bytes, decidiendo codificación y delimitador. */
export function leerTexto(
  bytes: ArrayBuffer,
  opciones: { delimitador?: string; orden?: readonly string[] } = {},
): TablaLeida {
  const { texto, codificacion } = decodificar(bytes);
  const delimitador = opciones.delimitador ?? detectarDelimitador(texto, opciones.orden);
  return { filas: tokenizar(texto, delimitador), codificacion, delimitador };
}

/**
 * Lee lo que alguien acaba de pegar. Excel y Google Sheets ponen TSV en el
 * portapapeles, así que el tabulador va primero; y un pegado de una sola
 * columna no tiene separador ninguno, que el detector resuelve solo porque
 * ahí todas las modas son 0 y gana el primero de la lista.
 */
export function leerPegado(texto: string, delimitador?: string): TablaLeida {
  const d = delimitador ?? detectarDelimitador(texto, ["\t", ";", ",", "|"]);
  return { filas: tokenizar(texto, d), codificacion: null, delimitador: d };
}
