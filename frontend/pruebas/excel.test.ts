// El camino de Excel, con un archivo de verdad.
//
// DOS AVISOS SOBRE EL ALCANCE DE ESTA PRUEBA, porque importan:
//
// 1. Usa la entrada `/node` de la librería, no la `/browser` que usa
//    `src/lib/excel.ts`. La de navegador necesita FileReader, que en Node no
//    existe. Así que lo que esto verifica es **el parser y la forma de la
//    API** —que la v9 devuelve el libro entero como `{sheet, data}[]`, que es
//    justo lo que `excel.ts` da por supuesto y lo que cambió respecto a
//    versiones anteriores—, no el envoltorio de doce líneas.
//
// 2. La muestra se genera con `pruebas/muestras/generar-xlsx.py` en vez de
//    commitear un binario que nadie puede leer. El archivo está versionado
//    para que la prueba corra sin Python en el CI, y el guion queda al lado
//    para poder rehacerlo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import leerLibro from "read-excel-file/node";
import { detectar } from "../src/lib/deteccion-de-columnas.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MUESTRA = join(AQUI, "muestras", "clientes.xlsx");

test("un .xlsx se lee con sus hojas y sus acentos", async () => {
  const libro = await leerLibro(MUESTRA);
  assert.deepEqual(libro.map((h) => h.sheet), ["Clientes"]);

  const filas = libro[0].data.map((f) =>
    f.map((c) => (c === null || c === undefined ? "" : String(c).trim())),
  );
  assert.deepEqual(filas[0], ["Nombre", "Correo electrónico", "Teléfono"]);
  assert.equal(filas[1][0], "Muñoz, S.L.", "los acentos y la coma dentro de la celda");
  assert.equal(filas.length, 4);
});

test("la detección encuentra el correo en una hoja de Excel real", async () => {
  // De punta a punta: lo que sale del .xlsx entra en el detector tal cual.
  const libro = await leerLibro(MUESTRA);
  const filas = libro[0].data.map((f) => f.map((c) => (c == null ? "" : String(c).trim())));
  const d = detectar(filas[0], filas.slice(1));

  assert.equal(d.propuesta.email?.indice, 1, "«Correo electrónico», con acento y todo");
  assert.equal(d.propuesta.nombre?.indice, 0);
  assert.equal(d.propuesta.telefono?.indice, 2);
  assert.equal(d.sinEmail, false);
});
