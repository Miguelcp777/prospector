import {
  analyseEmailQuality,
  renderEmailHtml,
  renderEmailText,
  type MergeData,
} from "@/lib/email-renderer";
import { requireRequestUser } from "@/lib/request-user";
import type { TemplateDocument } from "@/lib/template-types";
import { validateTemplateDocument } from "@/lib/template-document-schema";

type Payload = {
  document?: TemplateDocument;
  subject?: string;
  preheader?: string;
  mergeData?: MergeData;
};

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  try {
    const payload = (await request.json()) as Payload;
    const validation = validateTemplateDocument(payload.document);
    if (!validation.success) return Response.json(
      { error: "Documento de plantilla no válido", issues: validation.issues },
      { status: 400 },
    );
    const document = validation.document;
    const subject = String(payload.subject ?? "").slice(0, 240);
    const preheader = String(payload.preheader ?? "").slice(0, 300);
    return Response.json({
      html: renderEmailHtml(document, subject, preheader, payload.mergeData),
      text: renderEmailText(document, payload.mergeData),
      quality: analyseEmailQuality(document, subject, preheader),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo renderizar el email" },
      { status: 500 },
    );
  }
}
