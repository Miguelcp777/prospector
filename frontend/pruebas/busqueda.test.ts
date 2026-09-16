// Pruebas del buscador.
//
// La primera es la que motivó todo esto: `peluqueria` tiene que encontrar
// «peluquería». Salió de abrir la pantalla de Mensajes, no de leer el código.

import { test } from "node:test";
import assert from "node:assert/strict";
import { plegar, coincide } from "../src/lib/busqueda.ts";

test("sin tilde encuentra con tilde, que es el fallo que arregla esto", () => {
  assert.ok(coincide("peluqueria", "colaboración entre estudio de tatuajes y peluquería"));
});

test("y con tilde también, que es lo que ya funcionaba", () => {
  assert.ok(coincide("peluquería", "colaboración entre estudio de tatuajes y peluquería"));
});

test("las palabras del negocio español, una por una", () => {
  const casos: [string, string][] = [
    ["optica", "Óptica La Almudena"],
    ["panaderia", "Panadería El Horno Viejo"],
    ["fisioterapia", "Fisioterapia Muñoz S.L."],
    ["cafeteria", "Cafetería Central"],
    ["almassera", "Floristería L'Almàssera"],
    ["idiomes basics", "Academia Idiomes Bàsics"],
  ];
  for (const [busca, texto] of casos) {
    assert.ok(coincide(busca, texto), `«${busca}» debería encontrar «${texto}»`);
  }
});

test("la ñ se pliega, así que munoz encuentra Muñoz", () => {
  // Discutible en teoría —la ñ es una letra propia— y no en un buscador:
  // solo añade resultados. «muñoz» lo sigue encontrando igual.
  assert.ok(coincide("munoz", "Muñoz, S.L."));
  assert.ok(coincide("muñoz", "Muñoz, S.L."));
});

test("no se toca la puntuación: aquí se buscan correos", () => {
  // `deteccion-de-columnas` aplasta la puntuación a espacios, y eso aquí
  // rompería buscar por dominio.
  assert.equal(plegar("Info@Fisiomuñoz-Ejemplo.ES"), "info@fisiomunoz-ejemplo.es");
  assert.ok(coincide("@fisiomunoz-ejemplo.es", "info@fisiomuñoz-ejemplo.es"));
});

test("la búsqueda vacía no filtra nada", () => {
  assert.ok(coincide("", "lo que sea"));
  assert.ok(coincide("   ", "lo que sea"));
});

test("busca en varios campos y le dan igual los nulos", () => {
  assert.ok(coincide("gandia", null, undefined, "Clínica Vall d'Or · Gandía"));
  assert.equal(coincide("valencia", null, undefined), false);
});

test("lo que no está sigue sin estar", () => {
  // El arreglo amplía lo que encuentra; no puede convertirse en un comodín.
  assert.equal(coincide("dentista", "Óptica La Almudena"), false);
});
