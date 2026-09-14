// La dirección de arte que propone el modelo, reparada.
//
// Lo que se protege aquí es que un correo generado siempre se pueda leer y
// siempre lleve pie legal, aunque el modelo devuelva algo malo o no devuelva
// nada. No se comprueba que sea bonito: eso no lo dice una prueba.
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/studio", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@studio": root } },
  server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());

const {
  contraste, corregirContraste, validarDireccionArte, ARTE_POR_DEFECTO, PILAS_TIPOGRAFICAS,
} = await vite.ssrLoadModule("/lib/direccion-arte.ts");

test("el contraste se calcula como manda WCAG", () => {
  assert.equal(Math.round(contraste("#000000", "#ffffff")), 21);
  assert.equal(Math.round(contraste("#ffffff", "#ffffff")), 1);
  // Un color inválido no revienta: devuelve 0 y el resto del código repara.
  assert.equal(contraste("verde", "#ffffff"), 0);
});

test("un texto ilegible se oscurece hasta que se lee", () => {
  const corregido = corregirContraste("#dddddd", "#ffffff", 4.5);
  assert.ok(contraste(corregido, "#ffffff") >= 4.5, `salió ${corregido}`);
});

test("sobre fondo oscuro se aclara, no se oscurece", () => {
  const corregido = corregirContraste("#222222", "#0b0b0b", 4.5);
  assert.ok(contraste(corregido, "#0b0b0b") >= 4.5, `salió ${corregido}`);
});

test("una paleta ilegible entra y sale legible", () => {
  const { arte, correcciones } = validarDireccionArte({
    paleta: {
      fondo: "#ffffff",
      superficie: "#ffffff",
      texto: "#eeeeee",            // gris clarísimo sobre blanco
      suave: "#f2f2f2",
      primario: "#0b7285",
      acento: "#f5f5f5",
      textoSobrePrimario: "#0b7285", // el mismo color que su fondo
    },
    tipografia: "serif-editorial",
    estructura: ["brand", "hero", "text", "button"],
  });

  assert.ok(contraste(arte.paleta.texto, arte.paleta.superficie) >= 4.5);
  assert.ok(contraste(arte.paleta.suave, arte.paleta.superficie) >= 4.5);
  assert.ok(contraste(arte.paleta.textoSobrePrimario, arte.paleta.primario) >= 4.5);
  assert.ok(correcciones.length >= 3, "tiene que decir qué ha tocado");
});

test("el color de marca no se toca: se mueve el texto de encima", () => {
  const { arte } = validarDireccionArte({
    paleta: {
      fondo: "#101010", superficie: "#1a1a1a", texto: "#ffffff", suave: "#cccccc",
      primario: "#c9a227", acento: "#c9a227", textoSobrePrimario: "#d4b23a",
    },
    estructura: ["hero", "text", "button"],
  });
  assert.equal(arte.paleta.primario, "#c9a227", "el primario es la marca, no se toca");
});

test("una tipografía que no existe en correo cae en la neutra", () => {
  const { arte, correcciones } = validarDireccionArte({ tipografia: "Impact" });
  assert.equal(arte.tipografia, ARTE_POR_DEFECTO.tipografia);
  assert.ok(PILAS_TIPOGRAFICAS[arte.tipografia].includes("Arial"));
  assert.ok(correcciones.some((c) => /tipograf/i.test(c)));
});

test("la estructura siempre acaba en pie legal", () => {
  // Sin pie: el envío se negaría a vestir el mensaje sin enlace de baja.
  const { arte } = validarDireccionArte({ estructura: ["hero", "text"] });
  assert.equal(arte.estructura.at(-1), "footer");
  assert.ok(arte.estructura.includes("button"), "y con botón");
});

test("no se cuelan bloques fuera del vocabulario", () => {
  const { arte } = validarDireccionArte({
    estructura: ["brand", "artText", "image", "script", "hero", "columns"],
  });
  assert.ok(!arte.estructura.includes("artText"));
  assert.ok(!arte.estructura.includes("image"));
  assert.ok(arte.estructura.includes("columns"));
});

test("un solo hero, aunque lo pida dos veces", () => {
  const { arte } = validarDireccionArte({ estructura: ["hero", "hero", "text"] });
  assert.equal(arte.estructura.filter((b) => b === "hero").length, 1);
});

test("sin dirección de arte, se usa el respaldo entero", () => {
  const { arte } = validarDireccionArte(null);
  assert.deepEqual(arte.paleta, ARTE_POR_DEFECTO.paleta);
  assert.equal(arte.estructura.at(-1), "footer");
});
