export const MAX_STORED_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 60 * 1024 * 1024;
export const DIRECT_UPLOAD_BYTES = 384 * 1024;
export const UPLOAD_CHUNK_BYTES = 256 * 1024;
export const MAX_UPLOAD_PARTS = Math.ceil(
  MAX_STORED_IMAGE_BYTES / UPLOAD_CHUNK_BYTES,
);

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function validUploadId(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ""),
  );
}

export function safeUploadFilename(value: unknown) {
  return (
    String(value ?? "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(-120) || "imagen"
  );
}

export function pendingChunkKey(
  ownerId: string,
  uploadId: string,
  part: number,
) {
  return `pending-assets/${ownerId}/${uploadId}/${String(part).padStart(3, "0")}`;
}

export function pendingChunkPrefix(ownerId: string, uploadId: string) {
  return `pending-assets/${ownerId}/${uploadId}/`;
}
