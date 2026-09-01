// ============================================================
// Edge Function · generar-landing
//
// Autenticada: escribe en la campaña de un tenant, así que el token del
// usuario viaja al cliente de Supabase y la RLS sigue aplicando.
//
// Síncrona y no troceada, a diferencia de la redacción de mensajes: es UNA
// llamada a Claude por campaña, no una por lead. Montar un job para eso
// sería fontanería sin motivo.
//
// La landing nace SIN publicar. El texto lo escribe un modelo y nadie
// debería poder enseñársela a un cliente sin haberla leído antes.
//
// Desplegar: supabase functions deploy generar-landing
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ContextoLanding, ErrorLanding, generarLanding, slugificar } from "../_shared/landing.ts";
import { json, preflight } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) return json(req, { error: "Falta campaign_id." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return json(req, { error: "No autenticado." }, 401);

    // La RLS decide si esta campaña es suya: si no lo es, no hay fila.
    const { data: campana } = await supabase
      .from("campaigns")
      .select("id, nombre, ciudad, descripcion, tenant_id")
      .eq("id", campaign_id)
      .single();

    if (!campana) return json(req, { error: "Campaña no encontrada." }, 404);

    const [{ data: segmentos }, { data: tenant }] = await Promise.all([
      supabase.from("segments")
        .select("nombre, motivo")
        .eq("campaign_id", campaign_id)
        .eq("aceptado", true),
      supabase.from("tenants").select("nombre, vertical").eq("id", campana.tenant_id).single(),
    ]);

    if (!tenant) return json(req, { error: "No se pudo leer el negocio." }, 404);

    const contexto: ContextoLanding = {
      negocio_nombre: tenant.nombre,
      negocio_vertical: tenant.vertical,
      campana_ciudad: campana.ciudad,
      campana_descripcion: campana.descripcion,
      segmentos: segmentos ?? [],
    };

    const contenido = await generarLanding(
      contexto,
      { funcion: "generar-landing", tenant: campana.tenant_id, campana: campaign_id },
    );

    // Si ya había landing se reescribe el contenido pero se conserva el
    // slug: la URL puede estar ya en un correo enviado.
    const { data: existente } = await supabase
      .from("landings").select("id, slug").eq("campaign_id", campaign_id).maybeSingle();

    const fila = {
      campaign_id,
      slug: existente?.slug ?? slugificar(campana.nombre),
      titulo: contenido.titulo,
      subtitulo: contenido.subtitulo,
      contenido,
      // Regenerar vuelve a dejarla sin publicar: el texto ha cambiado y hay
      // que volver a leerlo.
      publicada: false,
      actualizado_en: new Date().toISOString(),
    };

    const { error } = existente
      ? await supabase.from("landings").update(fila).eq("id", existente.id)
      : await supabase.from("landings").insert(fila);

    if (error) {
      console.error("Error guardando la landing:", error.message);
      return json(req, { error: "La landing no se ha guardado." }, 500);
    }

    return json(req, { slug: fila.slug, contenido });
  } catch (e) {
    if (e instanceof ErrorLanding) return json(req, { error: e.message }, e.estado);
    console.error(e);
    return json(req, { error: "Error inesperado." }, 500);
  }
});
