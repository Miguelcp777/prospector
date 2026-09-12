import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/studio", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => vite.close());

test("TemplateDocument v1 accepts the canonical document and rejects malformed input", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { validateTemplateDocument, TEMPLATE_DOCUMENT_SCHEMA_VERSION } =
    await vite.ssrLoadModule("/lib/template-document-schema.ts");
  const valid = validateTemplateDocument(createBlankDocument());
  assert.equal(TEMPLATE_DOCUMENT_SCHEMA_VERSION, 1);
  assert.equal(valid.success, true);

  const responsive = createBlankDocument();
  responsive.blocks[0].mobile = {
    autoResponsive: true,
    freeX: -120,
    freeY: 240,
    freeZ: 8,
    freeScale: 135,
    widthPercent: 125,
  };
  assert.equal(validateTemplateDocument(responsive).success, true);

  const sizedCanvas = createBlankDocument();
  Object.assign(sizedCanvas.settings, {
    width: 980,
    canvasHeight: 1800,
    mobileWidth: 390,
    mobileCanvasHeight: 920,
  });
  assert.equal(validateTemplateDocument(sizedCanvas).success, true);

  const invalid = validateTemplateDocument({
    schemaVersion: 1,
    settings: {},
    variables: [],
    blocks: [],
  });
  assert.equal(invalid.success, false);
  assert.ok(invalid.issues.length > 0);
});

test("portable JSON Schema freezes version and canonical roots", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL("../campaign-studio/contracts/template-document-v1.schema.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.required, [
    "schemaVersion",
    "settings",
    "variables",
    "blocks",
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.blocks.minItems, 1);
  const mobile = schema.$defs.block.properties.mobile.properties;
  for (const key of [
    "autoResponsive",
    "freeX",
    "freeY",
    "freeZ",
    "freeScale",
  ])
    assert.ok(mobile[key]);
  assert.equal(mobile.widthPercent.maximum, 200);
});

test("reference HTTP adapter keeps authorization server-side and uses v1 paths", async () => {
  const calls = [];
  const { createProspectorHttpAdapter } = await vite.ssrLoadModule(
    "/integration/prospector/http-adapter.ts",
  );
  const adapter = createProspectorHttpAdapter({
    baseUrl: "https://prospector.example/",
    getAccessToken: async () => "server-token",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          tenancy: true,
          contacts: true,
          segments: true,
          transactionalEmail: true,
          campaignActivation: true,
          metrics: true,
          suppression: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const capabilities = await adapter.capabilities();
  assert.equal(capabilities.campaignActivation, true);
  assert.equal(
    calls[0].url,
    "https://prospector.example/campaign-studio/v1/capabilities",
  );
  assert.equal(calls[0].init.headers.authorization, "Bearer server-token");
});

test("help center remains embedded and reachable from the command palette", async () => {
  const source = await readFile(
    new URL("../src/studio/StudioClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /AYUDA INTEGRADA/);
  assert.match(source, /Iniciar recorrido guiado/);
  assert.match(source, /Abrir centro de ayuda/);
  assert.match(source, /HELP_SECTIONS/);
});

test("image studio exposes detected and editable brand-screen context", async () => {
  const source = await readFile(
    new URL("../src/studio/StudioClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Detectado desde marca y pantalla/);
  assert.match(source, /Contexto de pantalla y función de la imagen/);
  assert.match(source, /Contexto de marca para generar imágenes/);
  assert.match(source, /refreshDetectedImageContext/);
});

test("campaign library exposes durable reuse and archive recovery", async () => {
  const studio = await readFile(
    new URL("../src/studio/StudioClient.tsx", import.meta.url),
    "utf8",
  );
  const collection = await readFile(
    new URL("../campaign-studio/app/api/templates/route.ts", import.meta.url),
    "utf8",
  );
  const item = await readFile(
    new URL("../campaign-studio/app/api/templates/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(studio, /Todas tus campañas, siempre disponibles/);
  assert.match(studio, /Usar como base/);
  assert.match(studio, /Archivadas recuperables/);
  assert.match(collection, /view === "all"/);
  assert.match(item, /payload\.action !== "restore"/);
});

test("brand configuration keeps long text scrollable and actions visible", async () => {
  const studio = await readFile(
    new URL("../src/studio/StudioClient.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../src/estilos-studio.css", import.meta.url),
    "utf8",
  );
  assert.match(studio, /brand-dialog-scroll/);
  assert.match(studio, /compact-scroll-textarea/);
  assert.match(studio, /dialog-actions-sticky/);
  assert.match(studio, /Cerrar sin aplicar/);
  assert.match(styles, /field-sizing:fixed!important/);
  assert.match(styles, /overflow-y:auto!important/);
  assert.match(styles, /grid-template-rows:auto minmax\(0,1fr\) auto/);
});

test("all application themes reach portalled dialogs and use the contrast contract", async () => {
  const studio = await readFile(
    new URL("../src/studio/StudioClient.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../src/estilos-studio.css", import.meta.url),
    "utf8",
  );
  assert.match(
    studio,
    /window\.document\.documentElement\.classList\.add\(`theme-\$\{appTheme\}`\)/,
  );
  assert.match(
    studio,
    /window\.document\.body\.classList\.add\(`theme-\$\{appTheme\}`\)/,
  );
  for (const theme of ["dark", "light", "ocean", "emerald", "violet"])
    assert.match(styles, new RegExp(`\\.theme-${theme}\\{--contrast-surface:`));
});

test("image controls and hero layers expose direct independent positioning", async () => {
  const studio = await readFile(
    new URL("../src/studio/StudioClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(studio, /IMAGE_SIZE_MAX_PERCENT = 200/);
  assert.match(studio, /aria-label="Capas del hero"/);
  assert.match(studio, /pulsa directamente el elemento dentro del hero/);
  assert.match(studio, /Enviar detrás/);
  assert.match(studio, /Traer delante/);
  assert.doesNotMatch(studio, /HERO_POSITIONS/);
  assert.doesNotMatch(studio, /Posición conjunta de los textos/);
  assert.match(studio, /buttonDepthOffset/);
  assert.match(studio, /buttonDepthBlur/);
  assert.match(studio, /buttonDepthOpacity/);
  assert.match(studio, /Sin fondo elimina relleno, borde, sombra y profundidad 3D/);
  assert.match(studio, /CAPA LIBRE SELECCIONADA/);
  assert.match(studio, /Restablecer posición y tamaño iniciales/);
  assert.match(studio, /freeScale/);
  assert.match(studio, /Puede cruzarse y superponerse con cualquier/);
  assert.match(studio, /onChange\(Math\.min\(max, Math\.max\(min, parsed\)\)\)/);
  assert.match(studio, /Ocupar todo el hero/);
  assert.match(studio, /heroImageWidth/);
  assert.match(studio, /heroImageHeight/);
  assert.match(studio, /titleFontSize/);
  assert.match(studio, /La profundidad decide qué/);
  assert.match(studio, /COMPOSICIÓN MÓVIL/);
  assert.match(studio, /Adaptación inteligente/);
  assert.match(studio, /Recuperar adaptación móvil automática/);
  assert.match(studio, /isMobileLayer/);
  assert.match(studio, /updateMobileProp/);
  assert.match(studio, /Autoajustar espacio/);
  assert.match(studio, /selectedBlock\.props\.autoFlow !== false/);
  assert.match(studio, /dataAutoFlow|dataset\.autoFlow/);
});
