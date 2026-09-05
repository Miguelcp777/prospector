import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { templates, templateVersions } from "@/db/schema";
import { renderEmailHtml, renderEmailText } from "@/lib/email-renderer";
import { requireRequestUser } from "@/lib/request-user";
import { createBlankDocument, type StoredTemplate, type TemplateDocument } from "@/lib/template-types";
import { validateTemplateDocument } from "@/lib/template-document-schema";

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

export async function GET(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(templates)
      .where(and(eq(templates.ownerId, auth.user.id), ne(templates.status, "archived")))
      .orderBy(desc(templates.updatedAt))
      .limit(100);
    return Response.json({ templates: rows.map(mapTemplate) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las plantillas" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  try {
    const payload = (await request.json()) as Partial<StoredTemplate>;
    const validation = payload.document ? validateTemplateDocument(payload.document) : null;
    if (validation && !validation.success) {
      return Response.json(
        { error: "Documento de plantilla no válido", issues: validation.issues },
        { status: 400 },
      );
    }
    const document = validation?.success ? validation.document : createBlankDocument();
    const name = payload.name?.trim().slice(0, 120) || "Plantilla sin título";
    const subject = payload.subject?.trim().slice(0, 240) || "Una propuesta para {{lead.company}}";
    const preheader = payload.preheader?.trim().slice(0, 300) || "Descubre una oportunidad preparada para tu empresa.";
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const documentJson = JSON.stringify(document);
    const htmlCache = renderEmailHtml(document, subject, preheader);
    const textCache = renderEmailText(document);
    const db = getDb();
    const [row] = await db
      .insert(templates)
      .values({
        id,
        ownerId: auth.user.id,
        name,
        category: payload.category?.slice(0, 60) || "custom",
        status: "draft",
        subject,
        preheader,
        documentJson,
        htmlCache,
        textCache,
        thumbnailUrl: payload.thumbnailUrl || null,
        sourceType: payload.sourceType || "studio",
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db.insert(templateVersions).values({
      id: crypto.randomUUID(),
      templateId: id,
      ownerId: auth.user.id,
      version: 1,
      subject,
      preheader,
      documentJson,
      htmlCache,
      createdAt: now,
    });
    return Response.json({ template: mapTemplate(row) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo crear la plantilla" },
      { status: 500 },
    );
  }
}
