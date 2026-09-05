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

test("provides six distinct output formats with matching final proportions", async () => {
  const { IMAGE_FORMATS, getGeneratedImageDimensions } =
    await vite.ssrLoadModule("/lib/image-formats.ts");
  assert.equal(IMAGE_FORMATS.length, 6);
  assert.equal(new Set(IMAGE_FORMATS.map((item) => item.ratioLabel)).size, 6);
  for (const format of IMAGE_FORMATS) {
    const dimensions = getGeneratedImageDimensions(format.id, "4k");
    const [ratioWidth, ratioHeight] = format.ratioLabel.split(":").map(Number);
    assert.ok(
      Math.abs(
        dimensions.width / dimensions.height - ratioWidth / ratioHeight,
      ) < 0.01,
    );
  }
});

test("uses only provider-supported source sizes and safe defaults", async () => {
  const { IMAGE_FORMATS, getImageFormat, getProviderImageSize } =
    await vite.ssrLoadModule("/lib/image-formats.ts");
  const allowed = new Set(["1536x1024", "1024x1024", "1024x1536"]);
  for (const format of IMAGE_FORMATS)
    assert.equal(allowed.has(getProviderImageSize(format.id)), true);
  assert.equal(getImageFormat("unknown").id, "horizontal");
});

test("normalizes custom sizes and fits detected layouts to each quality tier", async () => {
  const {
    fitImageDimensions,
    getProviderImageSizeForDimensions,
    normalizeCustomImageDimensions,
  } = await vite.ssrLoadModule("/lib/image-formats.ts");
  assert.deepEqual(normalizeCustomImageDimensions(719, 1281), {
    width: 718,
    height: 1280,
  });
  assert.deepEqual(normalizeCustomImageDimensions(20, 9000), {
    width: 320,
    height: 4096,
  });
  assert.deepEqual(fitImageDimensions(600, 900, "2k"), {
    width: 1706,
    height: 2560,
  });
  assert.deepEqual(fitImageDimensions(1200, 400, "4k"), {
    width: 3840,
    height: 1280,
  });
  assert.equal(getProviderImageSizeForDimensions(600, 900), "1024x1536");
  assert.equal(getProviderImageSizeForDimensions(1600, 700), "1536x1024");
});
