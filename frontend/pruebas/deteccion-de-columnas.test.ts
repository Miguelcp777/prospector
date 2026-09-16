// Pruebas de la detección de columnas.
//
// Cada prueba es una hoja de cliente distinta. Ese es el punto: si solo se
// prueba con una, se está probando la hoja y no el detector.

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectar, normalizar, porQue } from "../src/lib/deteccion-de-columnas.ts";

/** Genera n filas para superar el mínimo de muestra. */
function filas(n: number, hacer: (i: number) => string[]): string[][] {
  return Array.from({ length: n }, (_, i) => hacer(i + 1));
}

test("normalizar quita acentos, mayúsculas y puntuación", () => {
  assert.equal(normalizar("Teléfono"), "telefono");
  assert.equal(normalizar("E-Mail / correo"), "e mail correo");
  assert.equal(normalizar("CORREO_ELECTRONICO"), "correo electronico");
});

test("la encuentra por el contenido aunque la cabecera no diga nada", () => {
  // La prueba que importa: columnas llamadas «Campo 1, 2, 3».
  const d = detectar(
    ["Campo 1", "Campo 2", "Campo 3"],
    filas(10, (i) => [`Cliente ${i}`, `cliente${i}@ejemplo.es`, `96000000${i}`]),
  );
  assert.equal(d.propuesta.email?.indice, 1);
  assert.equal(d.sinEmail, false);
});

test("la encuentra sin cabecera ninguna", () => {
  const d = detectar(
    ["Columna 1", "Columna 2"],
    filas(10, (i) => [`a${i}@ejemplo.es`, `Cliente ${i}`]),
  );
  assert.equal(d.propuesta.email?.indice, 0);
});

test("la encuentra en una hoja en inglés", () => {
  const d = detectar(
    ["Company", "Contact Email", "Phone"],
    filas(8, (i) => [`Firm ${i}`, `f${i}@example.com`, `+34 600 000 00${i}`]),
  );
  assert.equal(d.propuesta.email?.indice, 1);
  assert.equal(d.propuesta.empresa?.indice, 0);
  assert.equal(d.propuesta.telefono?.indice, 2);
});

test("la columna «Email» casi vacía de un export de CRM se propone igual", () => {
  // Contenido flojísimo, pero la cabecera es exacta y hay muchas celdas.
  // Se PROPONE; no se importa sola.
  const d = detectar(
    ["Nombre", "Email"],
    filas(40, (i) => [`Cliente ${i}`, i <= 5 ? `c${i}@ejemplo.es` : ""]),
  );
  assert.equal(d.propuesta.email?.indice, 1);
});

test("dos columnas de correos: elige y avisa de que es ambiguo", () => {
  const d = detectar(
    ["Email", "Email 2"],
    filas(10, (i) => [`a${i}@ejemplo.es`, `b${i}@ejemplo.es`]),
  );
  assert.equal(d.ambiguo, true, "con dos candidatas hay que avisar, no elegir en silencio");
  assert.equal(d.propuesta.email?.indice, 0, "gana la cabecera exacta");
});

test("sin ninguna columna de correos, no propone nada", () => {
  const d = detectar(
    ["Nombre", "Ciudad"],
    filas(10, (i) => [`Cliente ${i}`, "Valencia"]),
  );
  assert.equal(d.sinEmail, true);
  assert.equal(d.propuesta.email, undefined);
});

test("una columna de webs no se confunde con la de correos", () => {
  const d = detectar(
    ["Web", "Correo"],
    filas(10, (i) => [`www.cliente${i}.es`, `c${i}@cliente.es`]),
  );
  assert.equal(d.propuesta.email?.indice, 1);
  assert.equal(d.propuesta.web?.indice, 0);
});

test("una columna sola no puede tener dos roles", () => {
  const d = detectar(
    ["Correo"],
    filas(10, (i) => [`c${i}@x.es`]),
  );
  assert.equal(d.propuesta.email?.indice, 0);
  assert.equal(d.propuesta.web, undefined);
});

test("nombre y empresa solo por cabecera, nunca por contenido", () => {
  // «Clínica Dental Ruiz» y «María Ruiz» son indistinguibles, así que sin
  // cabecera no se adivina — y no adivinar es lo correcto.
  const d = detectar(
    ["A", "B", "C"],
    filas(10, (i) => [`Clínica Ruiz ${i}`, `María Pérez ${i}`, `m${i}@x.es`]),
  );
  assert.equal(d.propuesta.email?.indice, 2);
  assert.equal(d.propuesta.nombre, undefined);
  assert.equal(d.propuesta.empresa, undefined);
});

test("con menos de cinco celdas no se arriesga por contenido", () => {
  const d = detectar(["Cosa"], [["a@x.es"], ["b@x.es"]]);
  assert.equal(d.sinEmail, true, "dos filas no son una muestra");
});

test("una hoja con basura al final también se detecta", () => {
  // Las 200 filas de muestra se reparten por todo el archivo justamente
  // para esto: muchas hojas llevan las notas y los dados de baja al final.
  const buenas = filas(300, (i) => [`Cliente ${i}`, `c${i}@ejemplo.es`]);
  const basura = filas(40, () => ["TOTAL", ""]);
  const d = detectar(["Nombre", "Correo"], [...buenas, ...basura]);
  assert.equal(d.propuesta.email?.indice, 1);
});

test("el texto que se le enseña al usuario dice el porqué", () => {
  const d = detectar(["Nombre", "Correo"], filas(10, (i) => [`C ${i}`, `c${i}@x.es`]));
  assert.match(porQue(d.propuesta.email), /100 de cada 100/);
});
