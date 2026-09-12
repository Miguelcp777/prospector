import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});
after(async () => vite.close());

test("detects hero placement and combines brand, campaign and neighboring blocks", async () => {
  const { detectVisualContext } = await vite.ssrLoadModule(
    "/lib/image-context.ts",
  );
  const context = detectVisualContext({
    target: "block",
    brandName: "Nébula Arquitectura",
    brandContext: "Viviendas bioclimáticas para familias mediterráneas",
    imageGuidance: "Piedra local, madera natural y luz de amanecer",
    primaryColor: "#173B32",
    accentColor: "#D39B5A",
    campaignName: "Casa que respira",
    subject: "Menos energía, más hogar",
    objective: "Solicitar una consulta",
    offer: "Estudio bioclimático inicial",
    audience: "Propietarios de vivienda unifamiliar",
    block: {
      type: "hero",
      props: { eyebrow: "ARQUITECTURA VIVA", title: "Tu casa respira contigo" },
    },
    nextBlock: {
      type: "text",
      props: { text: "Diseño pasivo adaptado al clima y a tu parcela" },
    },
    canvasWidth: 640,
    canvasHeight: 1200,
  });
  assert.equal(context.placement, "hero");
  assert.match(context.brandContext, /Nébula Arquitectura/);
  assert.match(context.brandContext, /#173B32/);
  assert.match(context.screenContext, /Tu casa respira contigo/);
  assert.match(context.screenContext, /Diseño pasivo/);
});

test("gives a full-canvas background explicit readability constraints", async () => {
  const { detectVisualContext, composeVisualGenerationPrompt } =
    await vite.ssrLoadModule("/lib/image-context.ts");
  const context = detectVisualContext({
    target: "background",
    brandName: "Aurevanta",
    campaignName: "Informe comercial",
    canvasWidth: 600,
    canvasHeight: 1800,
  });
  const prompt = composeVisualGenerationPrompt("Red de oportunidades B2B", context);
  assert.equal(context.placement, "canvas-background");
  assert.match(prompt, /fondo de toda la maqueta/i);
  assert.match(prompt, /legibilidad/i);
  assert.match(prompt, /600 × 1800/);
});

test("preserves editable manual context and prevents invented brand elements", async () => {
  const { composeVisualGenerationPrompt } = await vite.ssrLoadModule(
    "/lib/image-context.ts",
  );
  const prompt = composeVisualGenerationPrompt("Mesa de trabajo artesanal", {
    placement: "image-block",
    automaticContext: false,
    brandContext: "Cerámica de autor, esmalte azul profundo",
    screenContext: "Acompaña una historia sobre el proceso de cocción",
  });
  assert.match(prompt, /Cerámica de autor/);
  assert.match(prompt, /proceso de cocción/);
  assert.match(prompt, /No inventes logotipos/);
});
