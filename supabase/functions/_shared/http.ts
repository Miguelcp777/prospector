// ============================================================
// Compartido · CORS y respuestas JSON
//
// ORIGENES_PERMITIDOS es una lista separada por comas. Para la demo pública
// conviene fijarla al dominio de Netlify: la función no lleva auth, y un
// comodín invita a que la incruste cualquiera y nos pague la factura Claude.
//
//   supabase secrets set ORIGENES_PERMITIDOS=https://tu-demo.netlify.app
// ============================================================

const CABECERAS_BASE = {
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function permitidos(): string[] {
  return (Deno.env.get("ORIGENES_PERMITIDOS") ?? "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function cors(req: Request): Record<string, string> {
  const lista = permitidos();
  const origen = req.headers.get("Origin") ?? "";

  if (lista.includes("*")) {
    return { ...CABECERAS_BASE, "Access-Control-Allow-Origin": "*" };
  }
  if (lista.includes(origen)) {
    return { ...CABECERAS_BASE, "Access-Control-Allow-Origin": origen };
  }
  // Origen no permitido: sin cabecera. El navegador bloquea la respuesta.
  return { ...CABECERAS_BASE };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json" },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: cors(req) }) : null;
}

/**
 * Hash de la IP para el contador de la demo.
 * Guardamos el hash y no la IP: es dato personal bajo RGPD y para contar
 * usos no hace falta saber cuál era. La sal evita que el hash sea reversible
 * por fuerza bruta sobre el espacio de IPv4, que es pequeño.
 */
export async function hashIp(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "desconocida").split(",")[0].trim();
  const sal = Deno.env.get("SAL_DEMO") ?? "prospector";
  const bytes = new TextEncoder().encode(`${sal}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
