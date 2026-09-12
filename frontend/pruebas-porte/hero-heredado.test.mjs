// Las plantillas guardadas antes de V45 no cambian de aspecto.
//
// V45 traía `const freeMode = true` en el renderizador: pintaba TODO hero
// con capas colocadas a mano, incluidos los 33 heros que ya había guardados
// en la base, que no llevan `heroComposition` porque se guardaron antes de
// que existiera. Esta prueba es lo que impide que ese `true` vuelva.
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

const hero = (props) => ({
  schemaVersion: 1,
  settings: {
    width: 640, backgroundColor: "#eef3f6", backgroundMode: "color",
    contentColor: "#ffffff", textColor: "#111827", mutedColor: "#637083",
    primaryColor: "#0b7285", accentColor: "#7c3aed",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  blocks: [{ id: "hero-1", type: "hero", props }],
  variables: [],
});

test("un hero guardado sin composición se pinta como siempre", async () => {
  const { renderEmailHtml } = await vite.ssrLoadModule("/lib/email-renderer.ts");
  // Tal y como lo dejaba V31: con overlay y sin `heroComposition`.
  const html = renderEmailHtml(
    hero({
      eyebrow: "NOVEDAD", title: "Titular", body: "Cuerpo",
      imageUrl: "/imagenes/ai-campaign.webp", imageAlt: "Imagen",
      overlay: true, minHeight: 360, paddingX: 38,
    }),
    "Asunto", "Preencabezado",
  );
  assert.ok(!html.includes("hero-free-canvas"), "no debe usar el lienzo libre");
  assert.ok(html.includes("hero-copy"), "el texto va en su franja, como antes");
  assert.match(html, /background-image:linear-gradient\(90deg[^"]*url\(/);
});

test("un hero que el usuario ha compuesto a mano sí usa las capas", async () => {
  const { renderEmailHtml } = await vite.ssrLoadModule("/lib/email-renderer.ts");
  // El editor escribe estas dos props al arrastrar una capa o aplicar un
  // preset. Es la señal de que la composición libre la eligió alguien.
  const html = renderEmailHtml(
    hero({
      eyebrow: "NOVEDAD", title: "Titular", body: "Cuerpo",
      imageUrl: "/imagenes/ai-campaign.webp", imageAlt: "Imagen",
      heroComposition: "free", overlay: false, minHeight: 360,
    }),
    "Asunto", "Preencabezado",
  );
  assert.ok(html.includes("hero-free-canvas"), "debe usar el lienzo libre");
  assert.match(html, /data-hero-layer="title"/);
});

test("una plantilla nueva nace en composición libre", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule("/lib/template-types.ts");
  const bloque = createBlankDocument().blocks.find((b) => b.type === "hero");
  assert.equal(bloque.props.heroComposition, "free");
  assert.equal(bloque.props.overlay, false);
});
