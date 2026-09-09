// ============================================================
// Edge Function · landing  —  API, no página
//
// Las Edge Functions no pueden servir HTML (Supabase reescribe text/html a
// text/plain). La página vive en frontend/public/landing.html, en Netlify,
// que además es el dominio del cliente: una landing comercial servida desde
// una URL de infraestructura da mala espina a quien la abre.
//
// GET  ?s=SLUG  → contenido de la landing, si está publicada
// POST ?s=SLUG  → registra un contacto del formulario
//
// Desplegar: supabase functions deploy landing --no-verify-jwt
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { hashIp } from "../_shared/http.ts";

const CABECERAS = {
  "content-type": "application/json",
  // Abierta: la landing puede acabar servida desde el dominio propio del
  // cliente, y no lo sabemos de antemano.
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

  const slug = new URL(req.url).searchParams.get("s") ?? "";
  if (!slug) return json({ error: "falta_slug" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .rpc("landing_publica", { p_slug: slug })
    .maybeSingle();

  if (error) {
    console.error("Error leyendo la landing:", error.message);
    return json({ error: "fallo_interno" }, 500);
  }

  // Sin publicar y no existente dan lo mismo por fuera: una landing en
  // borrador no debe poder descubrirse probando slugs.
  if (!data) return json({ error: "no_disponible" }, 404);

  const l = data as {
    titulo: string;
    subtitulo: string | null;
    contenido: Record<string, unknown>;
    negocio: string;
  };

  if (req.method === "GET") {
    // El bucket es privado a propósito: la oferta comercial de un cliente no
    // debe quedar suelta en internet. Se firma aquí, una hora, en cada carga.
    const { data: recursos } = await supabase
      .rpc("recursos_de_landing", { p_slug: slug });

    let logo: string | null = null;
    const documentos: { nombre: string; url: string }[] = [];

    for (
      const r of (recursos ?? []) as
        { tipo: string; nombre: string; ruta: string; bucket: string | null }[]
    ) {
      const bucket = r.bucket ?? "recursos";

      // Los logos viven ahora en un bucket público, para que se puedan ver
      // también dentro de un correo (migración 044). Firmar su ruta contra
      // `recursos` devolvería nulo y la landing se quedaría sin logo sin
      // dar ningún error. Los documentos siguen firmados y caducando.
      const url = bucket === "logos"
        ? supabase.storage.from("logos").getPublicUrl(r.ruta).data.publicUrl
        : (await supabase.storage.from(bucket).createSignedUrl(r.ruta, 3600))
            .data?.signedUrl;

      if (!url) continue;
      // El primero que llega es el logo de la campaña; el del negocio va
      // detrás y solo se usa si no había otro (lo ordena la función SQL).
      if (r.tipo === "logo") logo ??= url;
      else documentos.push({ nombre: r.nombre, url });
    }

    return json({
      titulo: l.titulo,
      subtitulo: l.subtitulo,
      contenido: l.contenido,
      negocio: l.negocio,
      logo,
      documentos,
    });
  }

  if (req.method !== "POST") return json({ error: "metodo_no_permitido" }, 405);

  const cuerpo = await req.json().catch(() => ({}));
  const email = String(cuerpo.email ?? "").trim();

  // Sin consentimiento no se guarda. Un formulario que guarda igualmente
  // convierte un dato dado a propósito en uno recogido a escondidas.
  if (cuerpo.consentimiento !== true) return json({ error: "falta_consentimiento" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email_no_valido" }, 400);

  const { data: ok } = await supabase.rpc("registrar_contacto_landing", {
    p_slug: slug,
    p_email: email,
    p_nombre: String(cuerpo.nombre ?? ""),
    p_telefono: String(cuerpo.telefono ?? ""),
    p_mensaje: String(cuerpo.mensaje ?? ""),
    // El hash y no la IP: para distinguir envíos repetidos no hace falta
    // saber de dónde vienen. Mismo criterio que el contador de la demo.
    p_ip_hash: await hashIp(req),
  });

  if (!ok) return json({ error: "fallo_interno" }, 500);
  return json({ ok: true, negocio: l.negocio });
});
