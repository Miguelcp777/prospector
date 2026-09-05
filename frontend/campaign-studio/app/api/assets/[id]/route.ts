import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assets } from "@/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Recurso no encontrado" }, { status: 404 });
  const [asset] = await getDb()
    .select()
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);
  if (!asset) return Response.json({ error: "Recurso no encontrado" }, { status: 404 });
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) return Response.json({ error: "Almacenamiento no disponible" }, { status: 503 });
  const object = await bucket.get(asset.objectKey);
  if (!object) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", asset.contentType);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-disposition", `inline; filename="${asset.filename.replace(/["\\]/g, "-")}"`);
  headers.set("x-content-type-options", "nosniff");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
