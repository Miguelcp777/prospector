import { requireRequestUser } from "@/lib/request-user";

function allowed(raw: string) {
  if (/^(mailto:|tel:)/i.test(raw)) return { url: raw, special: true };
  if (/{{\s*[\w.]+\s*}}/.test(raw)) return { url: raw, personalized: true };
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) return null;
    if (host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)/.test(host)) return null;
    return { url: url.toString() };
  } catch { return null; }
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const payload = await request.json() as { links?: Array<{ id?: string; url?: string }> };
  const links = Array.isArray(payload.links) ? payload.links.slice(0, 20) : [];
  const results = await Promise.all(links.map(async (item) => {
    const target = allowed(String(item.url || "").trim());
    if (!target) return { id: item.id, status: "invalid", ok: false, detail: "Formato o destino no permitido" };
    if ("special" in target) return { id: item.id, status: "valid", ok: true, detail: "Enlace de correo o teléfono válido" };
    if ("personalized" in target) return { id: item.id, status: "personalized", ok: true, detail: "Se comprobará al sustituir la variable" };
    try {
      let response = await fetch(target.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
      if (response.status === 405) response = await fetch(target.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000), headers: { range: "bytes=0-0" } });
      return { id: item.id, status: response.ok ? "reachable" : "error", ok: response.ok, code: response.status, detail: response.ok ? `Destino accesible · ${response.status}` : `El destino respondió ${response.status}` };
    } catch { return { id: item.id, status: "unreachable", ok: false, detail: "No se pudo alcanzar el destino" }; }
  }));
  return Response.json({ results });
}
