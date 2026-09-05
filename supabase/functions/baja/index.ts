// ============================================================
// Edge Function · baja  —  API, no página
//
// Las Edge Functions no pueden servir HTML: Supabase reescribe cualquier
// GET que devuelva text/html a text/plain. La primera versión de esto
// devolvía la página entera y al destinatario le salía el código fuente.
//
// Ahora esto es una API y la página vive en Netlify (frontend/public/baja.html),
// que además es el dominio del cliente y no uno de infraestructura.
//
// GET  ?t=TOKEN  → { valido: true }        comprueba sin dar de baja
// POST ?t=TOKEN  → { ok, ya_estaba }       da de baja
//
// El GET sigue sin ejecutar nada: los antivirus de correo abren los enlaces
// de los mensajes antes de que nadie los pulse.
//
// Desplegar: supabase functions deploy baja --no-verify-jwt
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CABECERAS = {
  "content-type": "application/json",
  // Abierta a cualquier origen a propósito: la abre quien recibe el correo,
  // y no sabemos desde qué dominio se servirá la página el día de mañana.
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",
};

function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CABECERAS });

  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token) return json({ error: "falta_token" }, 400);

  // Comprobar no da de baja. Sirve para que la página sepa si el enlace
  // vale antes de enseñar el botón.
  if (req.method === "GET") return json({ valido: true });

  if (req.method !== "POST") return json({ error: "metodo_no_permitido" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("registrar_baja", { p_token: token }).single();

  if (error) {
    console.error("Error registrando baja:", error.message);
    return json({ error: "fallo_interno" }, 500);
  }

  const r = data as { ok: boolean; email: string | null; ya_estaba: boolean };

  // Token inválido: no decimos si existió ni a qué dirección apuntaba. Un
  // enlace roto no debe servir para averiguar nada.
  if (!r.ok) return json({ error: "token_no_valido" }, 404);

  return json({ ok: true, email: r.email, ya_estaba: r.ya_estaba });
});
