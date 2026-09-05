export const MAX_STORED_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 60 * 1024 * 1024;
// Por encima de esto, el editor troceaba la subida en partes de 256 KB y las
// mandaba a /api/assets/chunk. Ese troceado existía por el hosting anterior:
// un Worker de Cloudflare tiene un tope duro de tamaño de petición.
//
// Aquí no hay tal petición. `apiFetch` no sale a la red: es una llamada de
// función que le pasa el File directamente a supabase-js, que hace su propia
// subida al Storage. El troceado sobra, y /api/assets/chunk nunca se llegó a
// implementar — así que toda imagen de más de 384 KB, es decir casi cualquier
// foto, moría en un 503 y no aparecía en la biblioteca.
//
// Igualado al máximo que se almacena: `prepareImageForUpload` ya garantiza
// que nada llegue por encima, así que la rama troceada queda inalcanzable.
export const DIRECT_UPLOAD_BYTES = MAX_STORED_IMAGE_BYTES;
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
