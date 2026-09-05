// ============================================================
// Edge Function · studio-ia
//
// Las herramientas de texto del studio de plantillas: proponer asuntos,
// generar variantes A/B, traducir, adaptar a otros canales y ordenar la
// galería por afinidad.
//
// Autenticada: escribe consumo a nombre de un tenant, así que hace falta
// saber de quién es. El token del usuario viaja al cliente de Supabase y la
// RLS sigue aplicando.
//
// La clave de Anthropic vive aquí, nunca en el navegador.
// Desplegar: supabase functions deploy studio-ia
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { MODELO } from "../_shared/inferencia.ts";
import { anotarConsumo } from "../_shared/consumo.ts";
import { json, preflight } from "../_shared/http.ts";

/** Lo que el editor sabe pedir. Cualquier otra cosa se rechaza. */
const ACCIONES = [
  "subjects",
  "ab-variants",
  "creative-director",
  "translate",
  "repurpose",
  "brand-from-url",
  "content-from-url",
  "gallery-search",
] as const;

type Accion = typeof ACCIONES[number];

const COMUN =
  "Responde únicamente JSON válido, sin markdown. No inventes clientes, " +
  "cifras, premios, testimonios ni certificaciones. Conserva literalmente " +
  "las variables con formato {{campo.ruta}}.";

// Las instrucciones vienen del studio original: describen la forma exacta
// del JSON que el editor espera de vuelta. Cambiar una sin cambiar el
// editor rompe esa pantalla en silencio.
const INSTRUCCIONES: Record<Accion, string> = {
  subjects:
    `${COMUN} Devuelve {"subjects":[{"subject":string,"preheader":string,"score":number,"risk":"bajo"|"medio"|"alto"}]} con 6 alternativas en español de España, distintas entre sí y concisas.`,
  "ab-variants":
    `${COMUN} Devuelve {"variants":[{"name":string,"direction":"premium"|"visual"|"minimal"|"comercial"|"corporativa"|"temporada","subject":string,"preheader":string,"rationale":string}]} con exactamente tres conceptos A/B/C claramente diferentes para la campaña.`,
  "creative-director":
    `${COMUN} Actúa como director creativo. Devuelve {"patches":[{"blockId":string,"prop":string,"value":string|number|boolean}],"message":string}. Modifica solo propiedades existentes del bloque indicado y aplica exactamente la petición.`,
  translate:
    `${COMUN} Traduce con adaptación cultural al idioma pedido. Devuelve {"document":object,"subject":string,"preheader":string,"language":string}. Mantén ids, tipos, URLs, colores y estructura; traduce solo texto humano.`,
  repurpose:
    `${COMUN} Devuelve {"channels":{"linkedin":string,"instagram":string,"banner":string,"landing":string}}. Cada valor debe incluir versión final, CTA, recomendación visual y formato o dimensiones; adapta tono y longitud al canal sin inventar hechos.`,
  "brand-from-url":
    `${COMUN} Analiza solo la información aportada. Devuelve {"brand":{"name":string,"logoUrl":string,"primaryColor":string,"accentColor":string,"backgroundColor":string,"fontFamily":string,"description":string,"services":string[],"tone":string,"socialLinks":string[],"legal":string}}. Selecciona logoUrl únicamente de logoCandidates. Usa colores hex válidos y marca como pendiente lo no verificable.`,
  "content-from-url":
    `${COMUN} Devuelve {"content":{"title":string,"body":string,"offer":string,"cta":string}} con una síntesis fiel y comercial, sin añadir hechos.`,
  "gallery-search":
    `${COMUN} Recibe una consulta y metadatos de imágenes. Devuelve {"rankedIds":string[]} ordenando por afinidad semántica, sector, estilo, color, orientación y uso solicitado; incluye solo IDs recibidos.`,
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { action, payload } = await req.json();

    if (!ACCIONES.includes(action)) {
      return json(req, { error: "Acción de IA no válida" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return json(req, { error: "No autenticado." }, 401);

    // El tenant, para repartir el gasto. Si no hay perfil, la RLS ya habría
    // frenado todo lo demás de la app.
    const { data: perfil } = await supabase
      .from("profiles").select("tenant_id").eq("id", user.user.id).single();

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 3000,
        system: INSTRUCCIONES[action as Accion],
        // Recortado: el documento de una plantilla puede ser enorme y el
        // coste va por tokens de entrada.
        messages: [{ role: "user", content: JSON.stringify(payload ?? {}).slice(0, 60000) }],
      }),
    });

    if (!r.ok) {
      const cuerpo = await r.text();
      let tipo = "", detalle = "";
      try {
        const j = JSON.parse(cuerpo);
        tipo = j?.error?.type ?? "";
        detalle = j?.error?.message ?? "";
      } catch { /* no era JSON */ }
      console.error("Anthropic devolvió", r.status, cuerpo.slice(0, 500));
      return json(req, {
        error: `El proveedor del modelo rechazó la petición (HTTP ${r.status}` +
          `${tipo ? " · " + tipo : ""})` +
          `${detalle ? ": " + detalle.replace(/sk-ant-[\w-]+/g, "sk-ant-***").slice(0, 200) : ""}`,
      }, 502);
    }

    const data = await r.json();

    // Se anota antes de mirar el contenido: la llamada ya está pagada
    // aunque la respuesta venga mal formada. Sin campaña, porque una
    // plantilla es reutilizable y no pertenece a ninguna.
    await anotarConsumo("studio-ia", MODELO, data.usage, perfil?.tenant_id ?? null, null);

    const texto = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    try {
      return json(req, { ...JSON.parse(texto), mode: "ia" });
    } catch {
      console.error("JSON no parseable:", texto.slice(0, 300));
      return json(req, { error: "Respuesta con formato inesperado." }, 502);
    }
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error inesperado." }, 500);
  }
});
