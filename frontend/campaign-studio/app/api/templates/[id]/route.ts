import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { templates, templateVersions } from "@/db/schema";
import { renderEmailHtml, renderEmailText } from "@/lib/email-renderer";
import { requireRequestUser } from "@/lib/request-user";
import type { StoredTemplate, TemplateDocument } from "@/lib/template-types";
import { validateTemplateDocument } from "@/lib/template-document-schema";

type Context = { params: Promise<{ id: string }> };

function mapTemplate(row: typeof templates.$inferSelect): StoredTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    subject: row.subject,
    preheader: row.preheader,
    document: JSON.parse(row.documentJson) as TemplateDocument,
    htmlCache: row.htmlCache,
    textCache: row.textCache,
    thumbnailUrl: row.thumbnailUrl,
    sourceType: row.sourceType,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request, context: Context) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  const db = getDb();
  const [row] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.ownerId, auth.user.id)))
    .limit(1);
  if (!row) return Response.json({ error: "Plantilla no encontrada" }, { status: 404 });
  const versions = await db
    .select({ version: templateVersions.version, createdAt: templateVersions.createdAt })
    .from(templateVersions)
    .where(and(eq(templateVersions.templateId, id), eq(templateVersions.ownerId, auth.user.id)))
    .orderBy(desc(templateVersions.version))
    .limit(20);
  return Response.json({ template: mapTemplate(row), versions });
}

export async function PUT(request: Request, context: Context) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  try {
    const payload = (await request.json()) as Partial<StoredTemplate> & { expectedVersion?: number };
    const validation = validateTemplateDocument(payload.document);
    if (!validation.success) return Response.json(
      { error: "Documento de plantilla no válido", issues: validation.issues },
      { status: 400 },
    );
    const document = validation.document;
    const expectedVersion = Number(payload.expectedVersion ?? payload.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return Response.json({ error: "Versión esperada no válida" }, { status: 400 });
    }
    const nextVersion = expectedVersion + 1;
    const now = new Date().toISOString();
    const name = payload.name?.trim().slice(0, 120) || "Plantilla sin título";
    const subject = payload.subject?.trim().slice(0, 240) || "";
    const preheader = payload.preheader?.trim().slice(0, 300) || "";
    const documentJson = JSON.stringify(document);
    const htmlCache = renderEmailHtml(document, subject, preheader);
    const textCache = renderEmailText(document);
    const db = getDb();
    const [row] = await db
      .update(templates)
      .set({
        name,
        category: payload.category?.slice(0, 60) || "custom",
        subject,
        preheader,
        documentJson,
        htmlCache,
        textCache,
        thumbnailUrl: payload.thumbnailUrl || null,
        sourceType: payload.sourceType || "studio",
        version: nextVersion,
        updatedAt: now,
      })
      .where(
        and(
          eq(templates.id, id),
          eq(templates.ownerId, auth.user.id),
          eq(templates.version, expectedVersion),
        ),
      )
      .returning();
    if (!row) {
      return Response.json(
        { error: "La plantilla cambió en otra sesión. Recarga antes de guardar." },
        { status: 409 },
      );
    }
    await db.insert(templateVersions).values({
      id: crypto.randomUUID(),
      templateId: id,
      ownerId: auth.user.id,
      version: nextVersion,
      subject,
      preheader,
      documentJson,
      htmlCache,
      createdAt: now,
    });
    return Response.json({ template: mapTemplate(row) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la plantilla" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  const db = getDb();
  const [row] = await db
    .update(templates)
    .set({ status: "archived", updatedAt: new Date().toISOString() })
    .where(and(eq(templates.id, id), eq(templates.ownerId, auth.user.id)))
    .returning({ id: templates.id });
  if (!row) return Response.json({ error: "Plantilla no encontrada" }, { status: 404 });
  return Response.json({ archived: true, id: row.id });
}

export async function PATCH(request: Request, context: Context) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  const payload = (await request.json().catch(() => ({}))) as {
    action?: string;
  };
  if (payload.action !== "restore") {
    return Response.json({ error: "Acción no válida" }, { status: 400 });
  }
  const [row] = await getDb()
    .update(templates)
    .set({ status: "draft", updatedAt: new Date().toISOString() })
    .where(and(eq(templates.id, id), eq(templates.ownerId, auth.user.id)))
    .returning();
  if (!row)
    return Response.json({ error: "Campaña no encontrada" }, { status: 404 });
  return Response.json({ template: mapTemplate(row) });
}
