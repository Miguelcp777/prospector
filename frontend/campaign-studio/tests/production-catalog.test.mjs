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

test("provides exactly one hundred production choices in every catalog", async () => {
  const catalog = await vite.ssrLoadModule("/lib/production-catalog.ts");
  assert.deepEqual(catalog.PRODUCTION_CATALOG_COUNTS, {
    designs: 100,
    fonts: 100,
    images: 100,
    templates: 100,
  });
  for (const items of [
    catalog.DESIGN_PRESETS_100,
    catalog.FONT_CATALOG_100,
    catalog.IMAGE_RECIPES_100,
    catalog.TEMPLATE_RECIPES_100,
  ]) {
    assert.equal(new Set(items.map((item) => item.id)).size, 100);
  }
  assert.equal(
    new Set(catalog.TEMPLATE_RECIPES_100.map((item) => item.name)).size,
    100,
  );
});

test("builds one hundred structurally and visually distinct editable documents", async () => {
  const { TEMPLATE_RECIPES_100, buildProductionDocument } =
    await vite.ssrLoadModule("/lib/production-catalog.ts");
  const signatures = TEMPLATE_RECIPES_100.map((recipe) => {
    const document = buildProductionDocument(recipe);
    assert.ok(document.blocks.length >= 5);
    assert.ok(document.blocks.some((block) => block.type === "button"));
    assert.ok(
      document.blocks.every(
        (block) => typeof block.id === "string" && block.id.length > 0,
      ),
    );
    assert.ok(
      document.blocks
        .filter((block) =>
          ["heading", "artText", "text", "columns"].includes(block.type),
        )
        .every((block) => block.props.backgroundColor === "transparent"),
    );
    assert.ok(
      document.blocks
        .filter((block) => block.type === "columns")
        .every((block) => block.props.columnBackgroundColor === "transparent"),
    );
    return JSON.stringify({
      settings: document.settings,
      creative: document.creative,
      blocks: document.blocks.map((block) => ({
        type: block.type,
        props: block.props,
      })),
    });
  });
  assert.equal(new Set(signatures).size, 100);
});

test("uses twenty art directions and one contextual prompt per business", async () => {
  const { DESIGN_PRESETS_100, IMAGE_RECIPES_100 } = await vite.ssrLoadModule(
    "/lib/production-catalog.ts",
  );
  assert.equal(
    new Set(DESIGN_PRESETS_100.map((item) => item.archetype)).size,
    20,
  );
  assert.equal(new Set(IMAGE_RECIPES_100.map((item) => item.prompt)).size, 100);
  assert.equal(
    IMAGE_RECIPES_100.every((item) => item.thumbnail === ""),
    true,
  );
});

test("opens with an editable premium 4K showcase", async () => {
  const { buildOpeningShowcaseDocument } = await vite.ssrLoadModule(
    "/lib/production-catalog.ts",
  );
  const document = buildOpeningShowcaseDocument();
  assert.equal(document.settings.backgroundImageOpacity, 16);
  assert.match(
    document.settings.backgroundImageUrl,
    /command-center-hero-4k\.webp$/,
  );
  assert.ok(document.blocks.length >= 8);
  const hero = document.blocks.find((block) => block.type === "hero");
  assert.match(hero.props.imageUrl, /command-center-hero-4k\.webp$/);
  assert.equal(hero.props.minHeight, 520);
  assert.ok(document.blocks.some((block) => block.type === "artText"));
  assert.ok(document.blocks.some((block) => block.type === "columns"));
});
