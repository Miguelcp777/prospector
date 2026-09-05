import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_STORED_IMAGE_BYTES,
  safeUploadFilename,
} from "@/lib/upload-policy";

function bucketBinding() {
  return (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
}

function mapAsset(row: typeof assets.$inferSelect) {
  return { ...row, url: `/api/assets/${row.id}` };
}

export async function GET(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const rows = await getDb()
    .select()
    .from(assets)
    .where(eq(assets.ownerId, auth.user.id))
    .orderBy(desc(assets.createdAt))
    .limit(100);
  return Response.json({ assets: rows.map(mapAsset) });
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  try {
    const bucket = bucketBinding();
    if (!bucket) return Response.json({ error: "Almacenamiento no disponible" }, { status: 503 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Selecciona un archivo de imagen" }, { status: 400 });
    }
    if (
      !ALLOWED_IMAGE_TYPES.has(file.type) ||
      file.size > MAX_STORED_IMAGE_BYTES
    ) {
      return Response.json(
        {
          error:
            "La imagen debe ser PNG, JPG o WebP y ocupar como máximo 8 MB una vez optimizada",
        },
        { status: 400 },
      );
    }
    const id = crypto.randomUUID();
    const safeName = safeUploadFilename(file.name);
    const objectKey = `campaign-assets/${auth.user.id}/${id}-${safeName}`;
    await bucket.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { ownerId: auth.user.id, originalName: file.name },
    });
    const [row] = await getDb()
      .insert(assets)
      .values({
        id,
        ownerId: auth.user.id,
        objectKey,
        filename: file.name.slice(0, 180),
        contentType: file.type,
        sizeBytes: file.size,
        source: "upload",
        altText: String(form.get("altText") ?? "").slice(0, 300),
        createdAt: new Date().toISOString(),
      })
      .returning();
    return Response.json({ asset: mapAsset(row) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo subir el recurso" },
      { status: 500 },
    );
  }
}
