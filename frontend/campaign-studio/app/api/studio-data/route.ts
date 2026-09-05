import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { abExperiments, campaignApprovals, campaignCheckpoints, campaignComments, reusableModules, templateVersions, templates, testDeliveries } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import { renderEmailHtml } from "@/lib/email-renderer";
import type { EmailBlock, TemplateDocument } from "@/lib/template-types";

type Kind = "modules" | "checkpoints" | "comments" | "approvals" | "test-deliveries" | "experiments";

function selected(kind: Kind) {
  return kind === "modules" ? reusableModules : kind === "checkpoints" ? campaignCheckpoints : kind === "comments" ? campaignComments : kind === "approvals" ? campaignApprovals : kind === "experiments" ? abExperiments : testDeliveries;
}

export async function GET(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as Kind;
  const templateId = url.searchParams.get("templateId") || "";
  if (!["modules", "checkpoints", "comments", "approvals", "test-deliveries", "experiments"].includes(kind)) return Response.json({ error: "Colección no válida" }, { status: 400 });
  const table = selected(kind);
  const where = templateId && kind !== "modules" && kind !== "test-deliveries" ? and(eq(table.ownerId, auth.user.id), eq((table as typeof campaignComments).templateId, templateId)) : eq(table.ownerId, auth.user.id);
  const items = await getDb().select().from(table).where(where).orderBy(desc(table.createdAt)).limit(100);
  return Response.json({ items });
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const payload = await request.json() as Record<string, unknown>;
  const kind = payload.kind as Kind;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = getDb();
  if (kind === "modules") {
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
    if (!blocks.length) return Response.json({ error: "Selecciona al menos un bloque" }, { status: 400 });
    const [item] = await db.insert(reusableModules).values({ id, ownerId: auth.user.id, name: String(payload.name || "Módulo sin nombre").slice(0, 100), category: String(payload.category || "Personalizado").slice(0, 60), tagsJson: JSON.stringify(payload.tags || []), blocksJson: JSON.stringify(blocks), keepStyles: payload.keepStyles !== false, synchronized: payload.synchronized === true, revision: 1, createdAt: now, updatedAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  if (kind === "checkpoints") {
    const [item] = await db.insert(campaignCheckpoints).values({ id, ownerId: auth.user.id, templateId: String(payload.templateId || "local"), name: String(payload.name || "Punto de restauración").slice(0, 100), documentJson: JSON.stringify(payload.document || {}), subject: String(payload.subject || "").slice(0, 240), preheader: String(payload.preheader || "").slice(0, 300), createdAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  if (kind === "comments") {
    const body = String(payload.body || "").trim();
    if (!body) return Response.json({ error: "Escribe un comentario" }, { status: 400 });
    const [item] = await db.insert(campaignComments).values({ id, ownerId: auth.user.id, templateId: String(payload.templateId || "local"), blockId: payload.blockId ? String(payload.blockId) : null, authorName: String(payload.authorName || "Colaborador").slice(0, 80), body: body.slice(0, 1200), status: "open", createdAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  if (kind === "approvals") {
    const status = ["pending", "approved", "changes_requested"].includes(String(payload.status)) ? String(payload.status) : "pending";
    const [item] = await db.insert(campaignApprovals).values({ id, ownerId: auth.user.id, templateId: String(payload.templateId || "local"), status, reviewerName: String(payload.reviewerName || "").slice(0, 80), note: String(payload.note || "").slice(0, 800), createdAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  if (kind === "test-deliveries") {
    const recipients = Array.isArray(payload.recipients) ? payload.recipients.map(String).slice(0, 10) : [];
    const [item] = await db.insert(testDeliveries).values({ id, ownerId: auth.user.id, templateId: payload.templateId ? String(payload.templateId) : null, recipientsJson: JSON.stringify(recipients), status: "prepared", createdAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  if (kind === "experiments") {
    const variants = Array.isArray(payload.variants) ? payload.variants.slice(0, 5) : [];
    if (variants.length < 2) return Response.json({ error: "La prueba necesita al menos dos variantes" }, { status: 400 });
    const metric = ["clicks", "conversions", "opens"].includes(String(payload.metric)) ? String(payload.metric) : "clicks";
    const [item] = await db.insert(abExperiments).values({ id, ownerId: auth.user.id, templateId: payload.templateId ? String(payload.templateId) : null, name: String(payload.name || "Prueba A/B").slice(0, 120), status: "draft", metric, variantsJson: JSON.stringify(variants), allocationJson: JSON.stringify(payload.allocation || []), winnerRuleJson: JSON.stringify(payload.winnerRule || {}), createdAt: now, updatedAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  return Response.json({ error: "Operación no válida" }, { status: 400 });
}

export async function PATCH(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const payload = await request.json() as { kind?: Kind; id?: string; status?: string; blocks?: EmailBlock[]; name?: string };
  if (payload.kind === "modules" && payload.id && Array.isArray(payload.blocks) && payload.blocks.length) {
    const db = getDb();
    const [existing] = await db.select().from(reusableModules).where(and(eq(reusableModules.id, payload.id), eq(reusableModules.ownerId, auth.user.id))).limit(1);
    if (!existing) return Response.json({ error: "Módulo no encontrado" }, { status: 404 });
    const revision = existing.revision + 1;
    const sourceBlocks = payload.blocks.slice(0, 20);
    const now = new Date().toISOString();
    const [item] = await db.update(reusableModules).set({ blocksJson: JSON.stringify(sourceBlocks), name: String(payload.name || existing.name).slice(0, 100), revision, updatedAt: now }).where(eq(reusableModules.id, existing.id)).returning();
    let affectedTemplates = 0;
    if (existing.synchronized) {
      const ownedTemplates = await db.select().from(templates).where(eq(templates.ownerId, auth.user.id)).limit(250);
      for (const template of ownedTemplates) {
        try {
          const document = JSON.parse(template.documentJson) as TemplateDocument;
          let changed = false;
          document.blocks = document.blocks.map((block) => {
            if (block.moduleRef?.id !== existing.id) return block;
            const source = sourceBlocks[block.moduleRef.index] || sourceBlocks[0];
            if (!source) return block;
            changed = true;
            return { ...structuredClone(source), id: block.id, moduleRef: { id: existing.id, revision, index: block.moduleRef.index } };
          });
          if (!changed) continue;
          const nextVersion = template.version + 1;
          const html = renderEmailHtml(document, template.subject, template.preheader);
          await db.update(templates).set({ documentJson: JSON.stringify(document), htmlCache: html, version: nextVersion, updatedAt: now }).where(and(eq(templates.id, template.id), eq(templates.ownerId, auth.user.id)));
          await db.insert(templateVersions).values({ id: crypto.randomUUID(), templateId: template.id, ownerId: auth.user.id, version: nextVersion, subject: template.subject, preheader: template.preheader, documentJson: JSON.stringify(document), htmlCache: html, createdAt: now });
          affectedTemplates += 1;
        } catch {}
      }
    }
    return Response.json({ item, affectedTemplates });
  }
  if (payload.kind !== "comments" || !payload.id) return Response.json({ error: "Operación no válida" }, { status: 400 });
  const [item] = await getDb().update(campaignComments).set({ status: payload.status === "resolved" ? "resolved" : "open" }).where(and(eq(campaignComments.id, payload.id), eq(campaignComments.ownerId, auth.user.id))).returning();
  return item ? Response.json({ item }) : Response.json({ error: "Comentario no encontrado" }, { status: 404 });
}
