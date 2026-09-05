import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

test("exports hero, canvas backgrounds and inserted images with absolute public URLs", async () => {
  const { absolutizeEmailHtml } = await vite.ssrLoadModule("/lib/export-html.ts");
  const result = absolutizeEmailHtml(`<table background="/api/assets/canvas"><tr><td><div style="background-image:url('/api/assets/123')"><img src="/assets/example.webp"><a href="/landing">Ir</a></div></td></tr></table>`, "https://studio.example/");
  assert.match(result, /url\('https:\/\/studio\.example\/api\/assets\/123'\)/);
  assert.match(result, /background="https:\/\/studio\.example\/api\/assets\/canvas"/);
  assert.match(result, /src="https:\/\/studio\.example\/assets\/example\.webp"/);
  assert.match(result, /href="https:\/\/studio\.example\/landing"/);
});

test("preserves already absolute and data URLs", async () => {
  const { absolutizeEmailHtml } = await vite.ssrLoadModule("/lib/export-html.ts");
  const source = `<img src="https://cdn.example/image.webp"><img src="data:image/png;base64,abc">`;
  assert.equal(absolutizeEmailHtml(source, "https://studio.example"), source);
});
