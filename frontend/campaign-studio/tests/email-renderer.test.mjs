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

test("renders merge data and a compliant unsubscribe link", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const html = renderEmailHtml(
    document,
    "Hola {{lead.first_name}}",
    "Preheader",
    {
      "lead.first_name": "Lucía & Co",
      "system.unsubscribe_url": "https://example.com/unsubscribe",
      "system.preferences_url": "https://example.com/preferences",
      "sender.privacy_url": "https://example.com/privacy",
    },
  );

  assert.match(html, /Lucía &amp; Co/);
  assert.match(html, /https:\/\/example\.com\/unsubscribe/);
  assert.match(html, /https:\/\/example\.com\/preferences/);
  assert.match(html, /https:\/\/example\.com\/privacy/);
  assert.doesNotMatch(html, /<script/i);
});

test("detects an incomplete legal handoff", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { analyseEmailQuality } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const footer = document.blocks.find((block) => block.type === "footer");
  delete footer.props.preferencesUrl;
  document.variables = document.variables.filter(
    (variable) => variable.key !== "sender.privacy_url",
  );
  const result = analyseEmailQuality(
    document,
    "Una propuesta suficientemente concreta",
    "Un preheader suficientemente descriptivo para completar la revisión previa",
  );
  assert.equal(
    result.checks.find((check) => check.id === "unsubscribe")?.passed,
    false,
  );
  assert.equal(
    result.checks.find((check) => check.id === "compliance-variables")?.passed,
    false,
  );
});

test("sanitizes executable imported HTML", async () => {
  const { sanitizeImportedHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const safe = sanitizeImportedHtml(
    '<div onclick="steal()"><script>alert(1)</script><a href="javascript:bad()">Link</a></div>',
  );
  assert.doesNotMatch(safe, /script|onclick|javascript:/i);
  assert.match(safe, /<div><a href="bad\(\)">Link<\/a><\/div>/);
});

test("scores a complete template", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { analyseEmailQuality } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const result = analyseEmailQuality(
    createBlankDocument(),
    "Una oportunidad concreta para tu empresa",
    "Descubre una propuesta relevante y preparada para vuestro contexto comercial.",
  );
  assert.equal(result.score, 100);
  assert.equal(
    result.checks.every((check) => check.passed),
    true,
  );
});

test("renders artistic text with an editable geometric wrapper", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { analyseEmailQuality, renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  document.creative.compatibilityMode = "hybrid";
  document.blocks.splice(2, 0, {
    id: "art-test",
    type: "artText",
    props: {
      text: "Impacto creativo",
      effect: "arc",
      rotation: -4,
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: 46,
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: 4,
      textTransform: "uppercase",
      color: "#7c3aed",
      align: "center",
    },
  });
  const html = renderEmailHtml(
    document,
    "Un asunto suficientemente enfocado",
    "Un preheader complementario suficientemente descriptivo para probar",
  );
  assert.match(html, /Impacto creativo/);
  assert.match(html, /transform:rotate\(-4deg\)/);
  assert.match(html, /font-family:&#039;Courier New&#039;, Courier, monospace/);
  assert.match(html, /font-weight:600/);
  assert.match(html, /letter-spacing:4px/);
  assert.match(html, /text-transform:uppercase/);
  const result = analyseEmailQuality(
    document,
    "Un asunto suficientemente enfocado",
    "Un preheader complementario suficientemente descriptivo para probar",
  );
  assert.equal(
    result.checks.find((check) => check.id === "creative-compatibility")
      ?.passed,
    true,
  );
});

test("renders responsive hero positioning and scalable images", async () => {
  const { createBlankDocument, createBlock } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const hero = document.blocks.find((block) => block.type === "hero");
  hero.props = {
    ...hero.props,
    minHeight: 520,
    align: "right",
    verticalAlign: "bottom",
    imagePosition: "left",
    paddingX: 54,
  };
  const image = createBlock("image");
  image.props = { ...image.props, widthPercent: 65, align: "right" };
  document.blocks.splice(-1, 0, image);
  const html = renderEmailHtml(
    document,
    "Una propuesta adaptable para tu empresa",
    "Contenido responsive preparado para cualquier dispositivo y cliente de correo",
  );
  assert.match(html, /height:520px/);
  assert.match(html, /background-position:left/);
  assert.match(html, /text-align:right/);
  assert.match(html, /width:65%/);
  assert.match(html, /@media\(max-width:600px\)/);
});

test("renders the hero as one unified visual block", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const hero = document.blocks.find((block) => block.type === "hero");
  hero.props = {
    ...hero.props,
    blockWidth: 76,
    blockAlign: "right",
    edgePadding: 6,
    paddingTop: 12,
    paddingBottom: 32,
    blockRadius: 42,
    borderWidth: 3,
    borderColor: "#12c9d8",
    rotation: 2,
    skewX: -3,
    shadow: "glow",
  };
  const html = renderEmailHtml(
    document,
    "Una propuesta adaptable para tu empresa",
    "Contenido responsive preparado para cualquier dispositivo y cliente de correo",
  );
  assert.match(
    html,
    /<tr data-block-id="hero-[^"]+"><td style="padding:12px 6px 32px;"><table role="presentation" width="76%"/,
  );
  assert.match(html, /border-radius:42px/);
  assert.match(html, /border:3px solid #12c9d8/);
  assert.match(html, /transform:rotate\(2deg\) skewX\(-3deg\)/);
  assert.match(html, /background-image:linear-gradient/);
  const heroStart = html.indexOf(`data-block-id="${hero.id}"`);
  const nextBlock = html.indexOf("data-block-id=", heroStart + 1);
  const heroMarkup = html.slice(heroStart, nextBlock);
  assert.equal((heroMarkup.match(/<table role="presentation"/g) || []).length, 1);
});

test("creates hero blocks with unified geometry", async () => {
  const { createBlock } = await vite.ssrLoadModule("/lib/template-types.ts");
  const hero = createBlock("hero");
  assert.equal(hero.props.heroGeometryUnified, true);
  assert.equal(hero.props.blockRadius, 28);
});

test("renders independent block layout and button styling", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const button = document.blocks.find((block) => block.type === "button");
  button.props = {
    ...button.props,
    blockWidth: 70,
    blockAlign: "right",
    edgePadding: 0,
    paddingTop: 16,
    paddingBottom: 40,
    blockRadius: 24,
    borderWidth: 2,
    borderColor: "#12c9d8",
    rotation: 3,
    skewX: -4,
    shadow: "soft",
    align: "center",
    textAlign: "right",
    buttonStyle: "outline",
    buttonShape: "rounded",
    buttonRadius: 36,
    buttonSize: "large",
    buttonWidth: "full",
    buttonColor: "#7c3aed",
    buttonTextColor: "#7c3aed",
    buttonDepth: "deep",
    buttonDepthColor: "#331166",
  };
  const html = renderEmailHtml(
    document,
    "Una propuesta adaptable para tu empresa",
    "Contenido responsive preparado para cualquier dispositivo y cliente de correo",
  );
  assert.match(html, /width:70%/);
  assert.match(
    html,
    /<tr data-block-id="button-[^"]+"><td style="padding:16px 0px 40px;"><table role="presentation" width="70%"/,
  );
  assert.match(html, /border-radius:24px/);
  assert.match(html, /transform:rotate\(3deg\) skewX\(-4deg\)/);
  assert.doesNotMatch(html, /border-radius:36px/);
  assert.match(html, /2px solid #7c3aed/);
  assert.match(html, /width:100%/);
  assert.match(html, /margin:0 0 0 auto/);
  assert.match(html, /text-align:right/);
  assert.match(html, /box-shadow:0 10px 0 #331166/);
});

test("creates button blocks as a single unified visual element", async () => {
  const { createBlock } = await vite.ssrLoadModule("/lib/template-types.ts");
  const button = createBlock("button");
  assert.equal(button.props.buttonGeometryUnified, true);
  assert.equal(button.props.blockWidth, 40);
  assert.equal(button.props.blockRadius, 80);
  assert.equal(button.props.backgroundColor, "transparent");
});

test("keeps text placement, text alignment, transparency and 3D effects independent", async () => {
  const { createBlankDocument, createBlock } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const text = createBlock("text");
  text.props = {
    ...text.props,
    text: "Contenido justificado",
    blockWidth: 68,
    blockAlign: "right",
    textAlign: "justify",
    backgroundColor: "transparent",
    textDepth: "extruded",
    textDepthColor: "#123456",
  };
  const columns = createBlock("columns");
  columns.props = {
    ...columns.props,
    textAlign: "justify",
    backgroundColor: "transparent",
    columnBackgroundColor: "transparent",
    blockDepth: "floating",
    blockDepthColor: "#654321",
  };
  document.blocks = [text, columns];
  const html = renderEmailHtml(
    document,
    "Control independiente",
    "Control visual completo para cada bloque",
  );
  assert.match(html, /width:68%/);
  assert.match(html, /align="right"/);
  assert.match(html, /margin:0 0 0 auto/);
  assert.match(html, /text-align:justify/);
  assert.match(html, /text-shadow:1px 1px 0 #123456/);
  assert.match(html, /background:transparent/);
  assert.match(html, /0 20px 42px/);
});

test("centers blocks symmetrically, justifies their copy and renders truly transparent buttons", async () => {
  const { createBlankDocument, createBlock } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const text = createBlock("text");
  text.props = {
    ...text.props,
    blockWidth: 72,
    blockAlign: "center",
    textAlign: "justify",
    edgePadding: 32,
  };
  const button = createBlock("button");
  button.props = {
    ...button.props,
    buttonStyle: "ghost",
    buttonColor: "#000000",
    buttonTextColor: "#e11d48",
  };
  document.blocks = [text, button];
  const html = renderEmailHtml(
    document,
    "Centrado y transparencia",
    "Validación de centrado y transparencia real",
  );
  assert.match(html, /width="72%" align="center"/);
  assert.match(html, /width:72%;max-width:100%;margin:0 auto/);
  assert.match(html, /padding:0 32px/);
  assert.match(html, /text-align:justify/);
  assert.match(html, /background:transparent;border:0/);
  assert.match(html, /color:#e11d48/);
});

test("renders a configurable full-template background image with color transparency", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  Object.assign(document.settings, {
    contentColor: "#112233",
    backgroundMode: "image",
    backgroundImageUrl: "/api/assets/background-png",
    backgroundImageOpacity: 65,
    backgroundImagePosition: "right bottom",
    backgroundImageSize: "contain",
    backgroundImageRepeat: "no-repeat",
  });
  const html = renderEmailHtml(
    document,
    "Fondo visual",
    "Fondo completo configurable",
  );
  assert.match(html, /background="\/api\/assets\/background-png"/);
  assert.match(html, /url\('\/api\/assets\/background-png'\)/);
  assert.match(html, /rgba\(17,34,51,0\.35\)/);
  assert.match(html, /background-position:right bottom/);
  assert.match(html, /background-size:contain/);
  assert.match(html, /background-repeat:no-repeat/);
});

test("keeps transparent image blocks open to the canvas background", async () => {
  const { createBlankDocument, createBlock } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  Object.assign(document.settings, {
    backgroundMode: "image",
    backgroundImageUrl: "/api/assets/canvas-background",
    backgroundImageOpacity: 100,
  });
  const image = createBlock("image");
  image.props = {
    ...image.props,
    imageUrl: "/api/assets/transparent-logo.png",
    backgroundColor: "transparent",
  };
  document.blocks = [image];
  const html = renderEmailHtml(
    document,
    "Transparencia por capas",
    "La imagen transparente deja visible el fondo general",
  );
  assert.match(html, /background="\/api\/assets\/canvas-background"/);
  assert.match(html, /src="\/api\/assets\/transparent-logo\.png"/);
  assert.match(html, /background:transparent/);
  assert.doesNotMatch(html, /transparent-logo\.png[^>]+background:#fff/);
});

test("exports a genuinely transparent canvas without a hidden image background", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  Object.assign(document.settings, {
    backgroundMode: "transparent",
    backgroundImageUrl: "/api/assets/conserved-background",
  });
  const html = renderEmailHtml(
    document,
    "Maqueta transparente",
    "La imagen queda conservada pero no se aplica",
  );
  assert.match(html, /background-color:transparent/);
  assert.match(html, /box-shadow:none/);
  assert.doesNotMatch(html, /background="\/api\/assets\/conserved-background"/);
});

test("accepts isolated anonymous browser sessions", async () => {
  const { requireRequestUser } = await vite.ssrLoadModule(
    "/lib/request-user.ts",
  );
  const guest = requireRequestUser(
    new Request("https://example.test/api/templates", {
      headers: {
        "x-aurevanta-session": "12345678-1234-1234-1234-123456789abc",
      },
    }),
  );
  assert.equal(guest.response, null);
  assert.equal(guest.user.displayName, "Invitado");
  assert.equal(guest.user.id, "guest:12345678-1234-1234-1234-123456789abc");
  const missing = requireRequestUser(
    new Request("https://example.test/api/templates"),
  );
  assert.equal(missing.response.status, 401);
});

test("marks every rendered block for direct visual reordering", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule(
    "/lib/template-types.ts",
  );
  const { renderEmailHtml } = await vite.ssrLoadModule(
    "/lib/email-renderer.ts",
  );
  const document = createBlankDocument();
  const html = renderEmailHtml(
    document,
    "Un asunto suficientemente completo",
    "Un preheader suficientemente completo para validar",
  );
  for (const block of document.blocks)
    assert.match(html, new RegExp(`data-block-id="${block.id}"`));
});

test("keeps upload chunks safely below the request limit", async () => {
  const policy = await vite.ssrLoadModule("/lib/upload-policy.ts");
  assert.ok(policy.UPLOAD_CHUNK_BYTES <= 256 * 1024);
  assert.ok(policy.DIRECT_UPLOAD_BYTES < 512 * 1024);
  assert.ok(
    policy.MAX_UPLOAD_PARTS * policy.UPLOAD_CHUNK_BYTES >=
      policy.MAX_STORED_IMAGE_BYTES,
  );
});

test("builds owner-scoped temporary object keys", async () => {
  const policy = await vite.ssrLoadModule("/lib/upload-policy.ts");
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(policy.validUploadId(id), true);
  assert.equal(policy.validUploadId("../otro"), false);
  assert.equal(
    policy.pendingChunkKey("guest:abc", id, 7),
    `pending-assets/guest:abc/${id}/007`,
  );
});

test("sanitizes uploaded filenames", async () => {
  const policy = await vite.ssrLoadModule("/lib/upload-policy.ts");
  assert.equal(
    policy.safeUploadFilename("logo Aurevanta (final).png"),
    "logo-Aurevanta--final-.png",
  );
});
