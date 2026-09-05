import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("emits development preview metadata", async () => {
  // Active D1/R2 API routes intentionally make the Worker bundle depend on
  // the Cloudflare runtime, so this Node-side contract inspects the SSR build
  // instead of importing the Worker entry point.
  const bundle = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );
  assert.match(bundle, /codex-preview/);
  assert.match(bundle, /development/);
});
