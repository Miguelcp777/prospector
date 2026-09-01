// ============================================================
// Edge Function · infer-segments
//
// Recibe la descripción de un negocio y devuelve sus segmentos
// de cliente potencial, persistiéndolos en la campaña del tenant.
//
// Autenticada: el token del usuario viaja al cliente de Supabase, así que
// la RLS sigue aplicando y nadie escribe en la campaña de otro.
// El escaparate público sin auth es demo-inferir, que no toca datos.
//
// La clave de Anthropic vive aquí, nunca en el navegador.
// Desplegar:  supabase functions deploy infer-segments
// Secretos:   supabase secrets set ANTHROPIC_API_KEY=sk-...
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ErrorInferencia, inferirSegmentos, validarDescripcion } from "../_shared/inferencia.ts";
import { json, preflight } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { campaign_id, descripcion, vertical, ciudad } = await req.json();

    const problema = validarDescripcion(descripcion);
    if (problema) return json(req, { error: problema }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return json(req, { error: "No autenticado." }, 401);

    // El tenant de quien llama, para poder repartir el gasto por cliente en
    // el panel. Si no hay perfil, la RLS ya habría frenado todo lo demás.
    const { data: perfil } = await supabase
      .from("profiles").select("tenant_id").eq("id", user.user.id).single();

    const segmentos = await inferirSegmentos(
      descripcion, vertical, ciudad,
      // campaign_id es opcional en esta función —sirve para probar el prompt
      // sin persistir— y entonces el consumo queda sin campaña, como debe.
      { funcion: "infer-segments", tenant: perfil?.tenant_id ?? null,
        campana: campaign_id ?? null },
    );

    // Sin campaign_id devolvemos sin persistir: útil para probar el prompt.
    if (!campaign_id) return json(req, { segmentos });

    const { data: campana } = await supabase
      .from("campaigns").select("tenant_id").eq("id", campaign_id).single();
    if (!campana) return json(req, { error: "Campaña no encontrada." }, 404);

    const filas = segmentos.map((s) => ({
      tenant_id: campana.tenant_id,
      campaign_id,
      slug: s.slug,
      nombre: s.nombre,
      motivo: s.motivo,
      prioridad: s.prioridad,
      queries: s.queries,
    }));

    const { error } = await supabase
      .from("segments").upsert(filas, { onConflict: "campaign_id,slug" });
    if (error) {
      console.error("Error guardando segmentos:", error.message);
      return json(req, { error: "Los segmentos no se han guardado." }, 500);
    }

    await supabase.from("campaigns").update({ estado: "inferido" }).eq("id", campaign_id);

    return json(req, { segmentos: filas });
  } catch (e) {
    if (e instanceof ErrorInferencia) return json(req, { error: e.message }, e.estado);
    console.error(e);
    return json(req, { error: "Error inesperado." }, 500);
  }
});
