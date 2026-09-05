import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("TemplateDocument v1 accepts the canonical document and rejects malformed input", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule("/lib/template-types.ts");
  const { validateTemplateDocument, TEMPLATE_DOCUMENT_SCHEMA_VERSION } = await vite.ssrLoadModule("/lib/template-document-schema.ts");
  const valid = validateTemplateDocument(createBlankDocument());
  assert.equal(TEMPLATE_DOCUMENT_SCHEMA_VERSION, 1);
  assert.equal(valid.success, true);

  const invalid = validateTemplateDocument({ schemaVersion: 1, settings: {}, variables: [], blocks: [] });
  assert.equal(invalid.success, false);
  assert.ok(invalid.issues.length > 0);
});

test("portable JSON Schema freezes version and canonical roots", async () => {
  const schema = JSON.parse(await readFile(new URL("../contracts/template-document-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.required, ["schemaVersion", "settings", "variables", "blocks"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.blocks.minItems, 1);
});

test("reference HTTP adapter keeps authorization server-side and uses v1 paths", async () => {
  const calls = [];
  const { createProspectorHttpAdapter } = await vite.ssrLoadModule("/integration/prospector/http-adapter.ts");
  const adapter = createProspectorHttpAdapter({
    baseUrl: "https://prospector.example/",
    getAccessToken: async () => "server-token",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ tenancy: true, contacts: true, segments: true, transactionalEmail: true, campaignActivation: true, metrics: true, suppression: true }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const capabilities = await adapter.capabilities();
  assert.equal(capabilities.campaignActivation, true);
  assert.equal(calls[0].url, "https://prospector.example/campaign-studio/v1/capabilities");
  assert.equal(calls[0].init.headers.authorization, "Bearer server-token");
});

test("help center remains embedded and reachable from the command palette", async () => {
  const source = await readFile(new URL("../app/studio-client.tsx", import.meta.url), "utf8");
  assert.match(source, /AYUDA INTEGRADA/);
  assert.match(source, /Iniciar recorrido guiado/);
  assert.match(source, /Abrir centro de ayuda/);
  assert.match(source, /HELP_SECTIONS/);
});
