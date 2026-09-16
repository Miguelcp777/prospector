// Pruebas del lector de tablas. Las muestras se construyen aquí, byte a
// byte, en vez de guardarlas como archivos: así la prueba dice qué está
// probando en vez de esconderlo en un binario que nadie abre.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodificar,
  detectarDelimitador,
  tokenizar,
  leerTexto,
  leerPegado,
  pareceQueHayCabecera,
} from "../src/lib/tabla-importada.ts";

const utf8 = (s: string) => new TextEncoder().encode(s).buffer;

/** Windows-1252: un byte por carácter, que es justo lo que lo delata. */
function win1252(s: string): ArrayBuffer {
  const mapa: Record<string, number> = {
    "á": 0xe1, "é": 0xe9, "í": 0xed, "ó": 0xf3, "ú": 0xfa, "ñ": 0xf1,
    "Á": 0xc1, "É": 0xc9, "Í": 0xcd, "Ó": 0xd3, "Ú": 0xda, "Ñ": 0xd1, "ü": 0xfc,
  };
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = mapa[s[i]] ?? s.charCodeAt(i);
  return b.buffer;
}

// ---------------------------------------------------------------------------
// Codificación
// ---------------------------------------------------------------------------

test("UTF-8 sin marca se lee como UTF-8", () => {
  const { texto, codificacion } = decodificar(utf8("nombre,correo\nMaría,m@x.es\n"));
  assert.equal(codificacion, "utf-8");
  assert.match(texto, /María/);
});

test("la marca de orden de bytes se retira y se nombra", () => {
  const con = new Uint8Array([0xef, 0xbb, 0xbf, ...new Uint8Array(utf8("a,b"))]);
  const { texto, codificacion } = decodificar(con.buffer);
  assert.equal(codificacion, "utf-8-bom");
  assert.equal(texto, "a,b", "el BOM no debe quedar pegado a la primera celda");
});

test("lo que Excel español guarda como CSV se lee como Windows-1252", () => {
  // Este es EL caso: un byte 0xF1 suelto no es UTF-8 válido, y si se leyera
  // como tal saldría un rombo en vez de la eñe. No rompe nada: solo escribe
  // mal el nombre de dos mil personas.
  const { texto, codificacion } = decodificar(win1252("nombre;correo\nMuñoz;m@x.es\n"));
  assert.equal(codificacion, "windows-1252");
  assert.match(texto, /Muñoz/);
});

test("ASCII puro no se confunde con Windows-1252", () => {
  assert.equal(decodificar(utf8("a,b\n1,2")).codificacion, "utf-8");
});

// ---------------------------------------------------------------------------
// Delimitador
// ---------------------------------------------------------------------------

test("punto y coma gana a la coma cuando la coma es decimal", () => {
  // El caso clásico del Excel español: `;` separa y `,` es el decimal.
  const texto = "nombre;importe;correo\nAna;1,50;a@x.es\nBea;2,75;b@x.es\nCid;3,10;c@x.es";
  assert.equal(detectarDelimitador(texto), ";");
});

test("la coma gana cuando es el separador de verdad", () => {
  const texto = "nombre,correo\nAna,a@x.es\nBea,b@x.es\nCid,c@x.es";
  assert.equal(detectarDelimitador(texto), ",");
});

test("los delimitadores dentro de comillas no cuentan", () => {
  const texto = '"Ruiz, S.L.";a@x.es\n"Gil, S.A.";b@x.es\n"Paz, S.L.";c@x.es';
  assert.equal(detectarDelimitador(texto), ";");
});

test("el portapapeles llega en tabuladores", () => {
  const texto = "nombre\tcorreo\nAna\ta@x.es\nBea\tb@x.es";
  assert.equal(leerPegado(texto).delimitador, "\t");
});

// ---------------------------------------------------------------------------
// Tokenizador
// ---------------------------------------------------------------------------

test("comillas: delimitador dentro, comilla escapada y salto de línea", () => {
  const filas = tokenizar('"Ruiz, S.L.";"Dijo ""hola""";"Calle Mayor 1\n28001 Madrid"', ";");
  assert.deepEqual(filas, [["Ruiz, S.L.", 'Dijo "hola"', "Calle Mayor 1\n28001 Madrid"]]);
});

test("acepta \\r\\n, \\n y \\r suelto", () => {
  assert.equal(tokenizar("a,b\r\nc,d\ne,f\rg,h", ",").length, 4);
});

test("la última línea sin salto final también cuenta", () => {
  assert.deepEqual(tokenizar("a,b\nc,d", ","), [["a", "b"], ["c", "d"]]);
});

test("las líneas en blanco no consumen número de fila", () => {
  // Importa de verdad: el origen del dato que se guarda es «lista X, fila
  // N», y si N se desplaza apunta a otra persona.
  assert.deepEqual(tokenizar("a,b\n\n\nc,d\n", ","), [["a", "b"], ["c", "d"]]);
});

test("una fila con menos celdas que la cabecera no se pierde", () => {
  assert.deepEqual(tokenizar("a,b,c\n1,2", ","), [["a", "b", "c"], ["1", "2"]]);
});

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------

test("si la primera fila no trae correos y las demás sí, es cabecera", () => {
  assert.equal(pareceQueHayCabecera([["nombre", "correo"], ["Ana", "a@x.es"]]), true);
});

test("si la primera fila ya trae un correo, son datos", () => {
  assert.equal(pareceQueHayCabecera([["Ana", "a@x.es"], ["Bea", "b@x.es"]]), false);
});

// ---------------------------------------------------------------------------
// De punta a punta
// ---------------------------------------------------------------------------

test("un CSV de Excel español entero: codificación, delimitador y celdas", () => {
  const t = leerTexto(win1252('nombre;correo;importe\nMuñoz;a@x.es;1,50\n"Gil, S.L.";b@x.es;2,00\n'));
  assert.equal(t.codificacion, "windows-1252");
  assert.equal(t.delimitador, ";");
  assert.deepEqual(t.filas, [
    ["nombre", "correo", "importe"],
    ["Muñoz", "a@x.es", "1,50"],
    ["Gil, S.L.", "b@x.es", "2,00"],
  ]);
});
