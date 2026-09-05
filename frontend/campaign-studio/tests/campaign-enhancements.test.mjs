import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

test("provides 25 reusable sections in each of eight categories", async () => {
  const { SECTION_LIBRARY_200 } = await vite.ssrLoadModule("/lib/campaign-enhancements.ts");
  assert.equal(SECTION_LIBRARY_200.length, 200);
  const counts = Map.groupBy(SECTION_LIBRARY_200, (section) => section.category);
  assert.equal(counts.size, 8);
  for (const sections of counts.values()) assert.equal(sections.length, 25);
});

test("reviews links, variables, accessibility and deliverability", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule("/lib/template-types.ts");
  const { reviewCampaign } = await vite.ssrLoadModule("/lib/campaign-enhancements.ts");
  const document = createBlankDocument();
  const issues = reviewCampaign(document, "Una propuesta concreta para tu empresa", "Descubre una oportunidad preparada específicamente para vuestro contexto comercial.");
  for (const group of ["Contenido", "Enlaces", "Accesibilidad", "Entregabilidad", "Móvil"]) assert.ok(issues.some((issue) => issue.group === group));
  assert.equal(issues.find((issue) => issue.id === "unsubscribe")?.severity, "passed");
  assert.equal(issues.find((issue) => issue.id === "sender-identity")?.severity, "passed");
  assert.match(issues.find((issue) => issue.id === "compliance-contract")?.detail || "", /pendiente de validar destinatarios en Prospector/);
});

test("applies conditional visibility and mobile overrides per block", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule("/lib/template-types.ts");
  const { documentForLead } = await vite.ssrLoadModule("/lib/campaign-enhancements.ts");
  const document = createBlankDocument();
  document.blocks[0].condition = { field: "lead.city", operator: "equals", value: "Madrid" };
  document.blocks[1].mobile = { hidden: true };
  const madrid = { id: "1", firstName: "Ana", company: "Ejemplo", sector: "Servicios", city: "Madrid", temperature: "caliente", customer: false, language: "español", hasProduct: false };
  const desktop = documentForLead(document, madrid, "desktop");
  const mobile = documentForLead(document, madrid, "mobile");
  assert.equal(desktop.document.blocks.length, document.blocks.length);
  assert.equal(mobile.document.blocks.some((block) => block.id === document.blocks[1].id), false);
});

test("creates three distinct restyles without changing content", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule("/lib/template-types.ts");
  const { reimagineDocument } = await vite.ssrLoadModule("/lib/campaign-enhancements.ts");
  const document = createBlankDocument();
  const premium = reimagineDocument(document, "premium", 0);
  const visual = reimagineDocument(document, "visual", 1);
  assert.notEqual(premium.settings.backgroundColor, visual.settings.backgroundColor);
  assert.equal(premium.blocks.find((block) => block.type === "hero").props.title, document.blocks.find((block) => block.type === "hero").props.title);
});

test("builds a portable RFC822 test message", async () => {
  const { buildEml } = await vite.ssrLoadModule("/lib/campaign-enhancements.ts");
  const eml = buildEml("Campaña de prueba", "<p>Hola</p>", "equipo@example.com");
  assert.match(eml, /MIME-Version: 1\.0/);
  assert.match(eml, /Content-Type: text\/html/);
  assert.match(eml, /equipo@example\.com/);
});

test("builds an explicit compliance handoff for Prospector", async () => {
  const { createBlankDocument } = await vite.ssrLoadModule("/lib/template-types.ts");
  const { buildComplianceHandoff } = await vite.ssrLoadModule("/lib/prospector-contract.ts");
  const document = createBlankDocument();
  const ready = buildComplianceHandoff(document);
  assert.equal(ready.builderStatus, "ready");
  assert.equal(ready.prospectorValidationRequired, true);
  document.blocks = document.blocks.filter((block) => block.type !== "footer");
  assert.equal(buildComplianceHandoff(document).builderStatus, "incomplete");
});
