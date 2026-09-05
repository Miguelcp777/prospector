import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_STORED_IMAGE_BYTES,
  MAX_UPLOAD_PARTS,
  pendingChunkKey,
  pendingChunkPrefix,
  safeUploadFilename,
  UPLOAD_CHUNK_BYTES,
  validUploadId,
} from "@/lib/upload-policy";

function bucketBinding() {
  return (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
}

async function removePending(bucket: R2Bucket, prefix: string) {
  const listed = await bucket.list({ prefix, limit: MAX_UPLOAD_PARTS + 1 });
  if (listed.objects.length)
    await bucket.delete(listed.objects.map((object) => object.key));
}

export async function PUT(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const bucket = bucketBinding();
  if (!bucket)
    return Response.json(
      { error: "Almacenamiento no disponible" },
      { status: 503 },
    );
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("id");
  const part = Number(url.searchParams.get("part"));
  if (
    !validUploadId(uploadId) ||
    !Number.isInteger(part) ||
    part < 0 ||
    part >= MAX_UPLOAD_PARTS
  )
    return Response.json({ error: "Fragmento no válido" }, { status: 400 });
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > UPLOAD_CHUNK_BYTES)
    return Response.json(
      { error: "El fragmento supera el tamaño permitido" },
      { status: 400 },
    );
  await bucket.put(
    pendingChunkKey(auth.user.id, String(uploadId), part),
    bytes,
    { httpMetadata: { contentType: "application/octet-stream" } },
  );
  return Response.json({ part, sizeBytes: bytes.byteLength });
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const bucket = bucketBinding();
  if (!bucket)
    return Response.json(
      { error: "Almacenamiento no disponible" },
      { status: 503 },
    );
  const payload = (await request.json()) as {
    id?: string;
    filename?: string;
    contentType?: string;
    sizeBytes?: number;
    totalParts?: number;
    altText?: string;
  };
  const uploadId = String(payload.id ?? "");
  const totalParts = Number(payload.totalParts);
  const declaredSize = Number(payload.sizeBytes);
  const contentType = String(payload.contentType ?? "");
  if (
    !validUploadId(uploadId) ||
    !ALLOWED_IMAGE_TYPES.has(contentType) ||
    !Number.isInteger(totalParts) ||
    totalParts < 1 ||
    totalParts > MAX_UPLOAD_PARTS ||
    !Number.isInteger(declaredSize) ||
    declaredSize < 1 ||
    declaredSize > MAX_STORED_IMAGE_BYTES
  )
    return Response.json({ error: "Subida no válida" }, { status: 400 });

  const prefix = pendingChunkPrefix(auth.user.id, uploadId);
  const listed = await bucket.list({ prefix, limit: MAX_UPLOAD_PARTS + 1 });
  const chunks = listed.objects.sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  if (chunks.length !== totalParts)
    return Response.json(
      { error: "Faltan fragmentos de la imagen. Repite la subida." },
      { status: 409 },
    );
  const actualSize = chunks.reduce((total, chunk) => total + chunk.size, 0);
  if (actualSize !== declaredSize || actualSize > MAX_STORED_IMAGE_BYTES)
    return Response.json(
      { error: "La imagen recibida no coincide con el archivo original" },
      { status: 400 },
    );

  const complete = new Uint8Array(actualSize);
  let offset = 0;
  for (const chunk of chunks) {
    const object = await bucket.get(chunk.key);
    if (!object)
      return Response.json(
        { error: "No se pudo recuperar un fragmento" },
        { status: 409 },
      );
    const bytes = new Uint8Array(await object.arrayBuffer());
    complete.set(bytes, offset);
    offset += bytes.byteLength;
  }

  const safeName = safeUploadFilename(payload.filename);
  const objectKey = `campaign-assets/${auth.user.id}/${uploadId}-${safeName}`;
  await bucket.put(objectKey, complete, {
    httpMetadata: { contentType },
    customMetadata: {
      ownerId: auth.user.id,
      originalName: String(payload.filename ?? "imagen").slice(0, 180),
    },
  });
  try {
    const [row] = await getDb()
      .insert(assets)
      .values({
        id: uploadId,
        ownerId: auth.user.id,
        objectKey,
        filename: String(payload.filename ?? "imagen").slice(0, 180),
        contentType,
        sizeBytes: actualSize,
        source: "upload",
        altText: String(payload.altText ?? "").slice(0, 300),
        createdAt: new Date().toISOString(),
      })
      .returning();
    await removePending(bucket, prefix);
    return Response.json(
      { asset: { ...row, url: `/api/assets/${row.id}` } },
      { status: 201 },
    );
  } catch (error) {
    await bucket.delete(objectKey);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar la subida",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const bucket = bucketBinding();
  if (!bucket)
    return Response.json(
      { error: "Almacenamiento no disponible" },
      { status: 503 },
    );
  const uploadId = new URL(request.url).searchParams.get("id");
  if (!validUploadId(uploadId))
    return Response.json({ error: "Subida no válida" }, { status: 400 });
  await removePending(
    bucket,
    pendingChunkPrefix(auth.user.id, String(uploadId)),
  );
  return Response.json({ deleted: true });
}
