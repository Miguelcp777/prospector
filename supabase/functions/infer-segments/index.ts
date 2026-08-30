// ============================================================
// Edge Function · infer-segments
//
// Recibe la descripción de un negocio y devuelve sus segmentos
// de cliente potencial. Es el cerebro del producto.
//
// La clave de Anthropic vive aquí, nunca en el navegador.
// Desplegar:  supabase functions deploy infer-segments
// Secretos:   supabase secrets set ANTHROPIC_API_KEY=sk-...
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELO = "claude-sonnet-5";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ORIGEN_PERMITIDO") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Taxonomías curadas: anclan al modelo para que no invente segmentos
// irrelevantes. Al añadir verticales, ampliar este mapa.
const TAXONOMIAS: Record<string, string[]> = {
  fisioterapia: [
    "clubes deportivos federados",
    "gimnasios y centros fitness",
    "clínicas derivadoras (traumatología, podología)",
    "residencias y centros de día",
    "asociaciones deportivas",
    "empresas con plan de bienestar",
    "centros educativos con deporte escolar",
  ],
};

const SISTEMA = `Eres un analista comercial que identifica segmentos de cliente potencial para pequeñas empresas en España.

Dado un negocio, devuelves los TIPOS DE ORGANIZACIÓN que deberían ser sus clientes: no personas sueltas, sino entidades localizables en un directorio de negocios.

Reglas:
- Entre 5 y 8 segmentos, ordenados por potencial comercial real.
- Cada segmento debe ser buscable geográficamente. "Gente con dolor de espalda" no vale; "gimnasios" sí.
- El motivo explica la relación comercial concreta, no una generalidad.
- Las queries son términos de búsqueda en español tal y como aparecerían en un directorio.
- Si te doy una taxonomía de referencia, úsala como base y añade solo lo que aporte.

Respondes ÚNICAMENTE con JSON válido, sin markdown, sin explicación previa:
{"segmentos":[{"slug":"","nombre":"","motivo":"","prioridad":"alta|media|baja","queries":[""]}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { campaign_id, descripcion, vertical, ciudad } = await req.json();

    if (!descripcion || descripcion.trim().length < 20) {
      return json({ error: "Describe el negocio con algo más de detalle." }, 400);
    }

    // El token del usuario viaja al cliente de Supabase: la RLS sigue aplicando,
    // así que nadie puede escribir segmentos en una campaña de otro tenant.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return json({ error: "No autenticado." }, 401);

    const referencia = TAXONOMIAS[vertical]
      ? `\n\nTaxonomía de referencia para ${vertical}:\n- ${TAXONOMIAS[vertical].join("\n- ")}`
      : "";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2000,
        system: SISTEMA,
        messages: [{
          role: "user",
          content: `Negocio: ${descripcion}\nZona: ${ciudad ?? "España"}${referencia}`,
        }],
      }),
    });

    if (!r.ok) {
      console.error("Anthropic devolvió", r.status, await r.text());
      return json({ error: "No se pudo completar la inferencia. Inténtalo de nuevo." }, 502);
    }

    const data = await r.json();
    const texto = data.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let segmentos;
    try {
      segmentos = JSON.parse(texto).segmentos;
    } catch {
      console.error("JSON no parseable:", texto.slice(0, 500));
      return json({ error: "Respuesta con formato inesperado. Inténtalo de nuevo." }, 502);
    }

    if (!Array.isArray(segmentos) || segmentos.length === 0) {
      return json({ error: "No se encontraron segmentos para este negocio." }, 422);
    }

    // Sin campaign_id devolvemos sin persistir: útil para la demo pública.
    if (!campaign_id) return json({ segmentos });

    const { data: campana } = await supabase
      .from("campaigns").select("tenant_id").eq("id", campaign_id).single();
    if (!campana) return json({ error: "Campaña no encontrada." }, 404);

    const filas = segmentos.map((s: Record<string, unknown>) => ({
      tenant_id: campana.tenant_id,
      campaign_id,
      slug: s.slug,
      nombre: s.nombre,
      motivo: s.motivo,
      prioridad: ["alta", "media", "baja"].includes(s.prioridad as string) ? s.prioridad : "media",
      queries: s.queries ?? [],
    }));

    const { error } = await supabase
      .from("segments").upsert(filas, { onConflict: "campaign_id,slug" });
    if (error) {
      console.error("Error guardando segmentos:", error.message);
      return json({ error: "Los segmentos no se han guardado." }, 500);
    }

    await supabase.from("campaigns").update({ estado: "inferido" }).eq("id", campaign_id);

    return json({ segmentos: filas });
  } catch (e) {
    console.error(e);
    return json({ error: "Error inesperado." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
