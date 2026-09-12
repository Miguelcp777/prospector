import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("UX V2 mantiene cinco espacios y un registro central de acciones", async () => {
  const source = await readFile(new URL("../src/studio/lib/studio-navigation.ts", import.meta.url), "utf8");
  for (const label of ["Inicio", "Mis campañas", "Plantillas", "Editor", "Marca y recursos"]) {
    assert.match(source, new RegExp(label));
  }
  for (const action of ["Crear con IA", "Importar HTML", "Revisar y exportar", "Buscar acciones"]) {
    assert.match(source, new RegExp(action));
  }
});

test("la matriz protege las capacidades críticas de v44", async () => {
  const matrix = await readFile(new URL("../campaign-studio/docs/UX_V2_REGRESSION_MATRIX.md", import.meta.url), "utf8");
  for (const capability of ["autoguardar", "Deshacer", "importación HTML", "solapamiento", "EML", "D1/R2"]) {
    assert.match(matrix, new RegExp(capability, "i"));
  }
});

test("UX V2 incorpora flujo guiado, premium y edición móvil", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../src/studio/StudioClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/estilos-studio.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /15 MAESTRAS PREMIUM/);
  assert.match(studio, /PREMIUM_VARIANTS/);
  assert.match(studio, /aurevanta-ux-v2-guided-progress/);
  assert.match(studio, /Solapamiento intencionado/);
  assert.match(studio, /Aplicar solo estilo/);
  assert.match(studio, /Aplicar solo estructura/);
  assert.match(css, /mobile-editor-bar/);
  assert.match(css, /left-collapsed/);
  assert.match(css, /hide-advanced/);
});
