import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brandKits } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";

const DEFAULT_KIT = {
  name: "Aurevanta Labs",
  logoUrl: null,
  primaryColor: "#12d7e7",
  accentColor: "#8b5cf6",
  backgroundColor: "#071019",
  fontFamily: "Arial, Helvetica, sans-serif",
  senderName: "",
  senderEmail: "",
  postalAddress: "Valencia, España",
  legalName: "Aurevanta Labs",
  privacyUrl: "https://example.com/privacidad",
  privacyEmail: "privacidad@example.com",
  settingsJson: "{}",
};

function publicKit(row: Record<string, unknown>) {
  let legal: Record<string, unknown> = {};
  try { legal = JSON.parse(String(row.settingsJson || "{}")); } catch { legal = {}; }
  return { ...row, legalName: String(legal.legalName || row.name || DEFAULT_KIT.legalName), privacyUrl: String(legal.privacyUrl || DEFAULT_KIT.privacyUrl), privacyEmail: String(legal.privacyEmail || DEFAULT_KIT.privacyEmail) };
}

export async function GET(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const db = getDb();
  const [kit] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.ownerId, auth.user.id))
    .limit(1);
  return Response.json({ brandKit: publicKit((kit ?? DEFAULT_KIT) as unknown as Record<string, unknown>) });
}

export async function PUT(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  try {
    const payload = (await request.json()) as Partial<typeof DEFAULT_KIT>;
    const now = new Date().toISOString();
    const values = {
      name: String(payload.name ?? DEFAULT_KIT.name).slice(0, 100),
      logoUrl: payload.logoUrl ? String(payload.logoUrl).slice(0, 1000) : null,
      primaryColor: String(payload.primaryColor ?? DEFAULT_KIT.primaryColor).slice(0, 20),
      accentColor: String(payload.accentColor ?? DEFAULT_KIT.accentColor).slice(0, 20),
      backgroundColor: String(payload.backgroundColor ?? DEFAULT_KIT.backgroundColor).slice(0, 20),
      fontFamily: String(payload.fontFamily ?? DEFAULT_KIT.fontFamily).slice(0, 160),
      senderName: String(payload.senderName ?? "").slice(0, 120),
      senderEmail: String(payload.senderEmail ?? "").slice(0, 180),
      postalAddress: String(payload.postalAddress ?? "").slice(0, 300),
      settingsJson: JSON.stringify({ legalName: String(payload.legalName ?? payload.name ?? DEFAULT_KIT.legalName).slice(0, 180), privacyUrl: String(payload.privacyUrl ?? DEFAULT_KIT.privacyUrl).slice(0, 1000), privacyEmail: String(payload.privacyEmail ?? DEFAULT_KIT.privacyEmail).slice(0, 180) }).slice(0, 4000),
      updatedAt: now,
    };
    const db = getDb();
    const [existing] = await db
      .select({ id: brandKits.id })
      .from(brandKits)
      .where(eq(brandKits.ownerId, auth.user.id))
      .limit(1);
    const [row] = existing
      ? await db.update(brandKits).set(values).where(eq(brandKits.id, existing.id)).returning()
      : await db
          .insert(brandKits)
          .values({ id: crypto.randomUUID(), ownerId: auth.user.id, ...values, createdAt: now })
          .returning();
    return Response.json({ brandKit: publicKit(row as unknown as Record<string, unknown>) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la marca" },
      { status: 500 },
    );
  }
}
