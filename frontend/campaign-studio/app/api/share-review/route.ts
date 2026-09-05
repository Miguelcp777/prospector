import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaignApprovals, campaignComments, campaignShares, templates } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import type { TemplateDocument } from "@/lib/template-types";

async function shareByToken(token: string) {
  const [share] = await getDb().select().from(campaignShares).where(and(eq(campaignShares.token, token), eq(campaignShares.active, true))).limit(1);
  if (!share || share.revokedAt || (share.expiresAt && Date.parse(share.expiresAt) <= Date.now())) return undefined;
  return share;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const share = await shareByToken(token);
  if (!share) return Response.json({ error: "El enlace de revisión no es válido o ha caducado" }, { status: 404 });
  const db = getDb();
  const [template] = await db.select().from(templates).where(and(eq(templates.id, share.templateId), eq(templates.ownerId, share.ownerId))).limit(1);
  if (!template) return Response.json({ error: "Campaña no encontrada" }, { status: 404 });
  const comments = await db.select().from(campaignComments).where(and(eq(campaignComments.templateId, share.templateId), eq(campaignComments.ownerId, share.ownerId))).orderBy(desc(campaignComments.createdAt)).limit(100);
  const approvals = await db.select().from(campaignApprovals).where(and(eq(campaignApprovals.templateId, share.templateId), eq(campaignApprovals.ownerId, share.ownerId))).orderBy(desc(campaignApprovals.createdAt)).limit(20);
  return Response.json({ campaign: { name: template.name, subject: template.subject, preheader: template.preheader, document: JSON.parse(template.documentJson) as TemplateDocument, version: template.version }, comments, approvals });
}

export async function POST(request: Request) {
  const payload = await request.json() as { action?: string; templateId?: string; token?: string; authorName?: string; body?: string; blockId?: string; status?: string; note?: string; expiresInDays?: number };
  const db = getDb();
  const now = new Date().toISOString();
  if (payload.action === "revoke") {
    const auth = requireRequestUser(request);
    if (!auth.user) return auth.response;
    const [item] = await db.update(campaignShares).set({ active: false, revokedAt: now }).where(and(eq(campaignShares.token, String(payload.token||"")), eq(campaignShares.ownerId, auth.user.id))).returning();
    return item ? Response.json({ revoked: true }) : Response.json({ error: "Enlace no encontrado" }, { status: 404 });
  }
  if (payload.action === "create") {
    const auth = requireRequestUser(request);
    if (!auth.user) return auth.response;
    const templateId = String(payload.templateId || "");
    const [template] = await db.select({ id: templates.id }).from(templates).where(and(eq(templates.id, templateId), eq(templates.ownerId, auth.user.id))).limit(1);
    if (!template) return Response.json({ error: "Guarda primero la campaña para compartirla" }, { status: 400 });
    const [existing] = await db.select().from(campaignShares).where(and(eq(campaignShares.templateId, templateId), eq(campaignShares.ownerId, auth.user.id), eq(campaignShares.active, true))).limit(1);
    if (existing && (!existing.expiresAt || Date.parse(existing.expiresAt)>Date.now())) return Response.json({ token: existing.token, expiresAt: existing.expiresAt });
    const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(Date.now()+Math.min(90,Math.max(1,Number(payload.expiresInDays||14)))*86400000).toISOString();
    await db.insert(campaignShares).values({ id: crypto.randomUUID(), ownerId: auth.user.id, templateId, token, active: true, expiresAt, createdAt: now });
    return Response.json({ token, expiresAt }, { status: 201 });
  }
  const share = await shareByToken(String(payload.token || ""));
  if (!share) return Response.json({ error: "Enlace de revisión no válido" }, { status: 404 });
  const author = String(payload.authorName || "Revisor externo").trim().slice(0, 80) || "Revisor externo";
  if (payload.action === "comment") {
    const body = String(payload.body || "").trim();
    if (!body) return Response.json({ error: "Escribe un comentario" }, { status: 400 });
    const [item] = await db.insert(campaignComments).values({ id: crypto.randomUUID(), ownerId: share.ownerId, templateId: share.templateId, blockId: payload.blockId || null, authorName: author, body: body.slice(0, 1200), status: "open", createdAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  if (payload.action === "approval") {
    const status = payload.status === "approved" ? "approved" : "changes_requested";
    const [item] = await db.insert(campaignApprovals).values({ id: crypto.randomUUID(), ownerId: share.ownerId, templateId: share.templateId, status, reviewerName: author, note: String(payload.note || "").slice(0, 800), createdAt: now }).returning();
    return Response.json({ item }, { status: 201 });
  }
  return Response.json({ error: "Acción no válida" }, { status: 400 });
}
