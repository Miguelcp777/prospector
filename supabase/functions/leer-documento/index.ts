// ============================================================
// Edge Function · leer-documento
//
// Saca el texto de un documento subido para que el redactor sepa qué se
// está ofreciendo. Sin esto, los mensajes describen el negocio en general y
// no la oferta concreta.
//
// Autenticada: lee un recurso del tenant, así que va con el JWT del usuario
// y la RLS decide si es suyo. La descarga del archivo sí usa service_role,
// porque el bucket es privado.
//
// Solo PDF. Un .docx es un zip con XML dentro y añadir ese parser por un
// caso menos común no compensa: para esos, el texto se escribe a mano, que
// además suele dar mejor prompt que la extracción cruda.
//
// Desplegar: supabase functions deploy leer-documento
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { json, preflight } from "../_shared/http.ts";

const MAX_CARACTERES = 8000;   // Lo que cabe en un prompt sin ahogarlo.

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { recurso_id } = await req.json();
    if (!recurso_id) return json(req, { error: "Falta recurso_id." }, 400);

    // Con el token del usuario: si el recurso no es suyo, la RLS no lo
    // devuelve y aquí no hay nada que leer.
    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: user } = await comoUsuario.auth.getUser();
    if (!user?.user) return json(req, { error: "No autenticado." }, 401);

    const { data: recurso } = await comoUsuario
      .from("recursos").select("id, ruta, mime, nombre").eq("id", recurso_id).single();

    if (!recurso) return json(req, { error: "Documento no encontrado." }, 404);

    if (recurso.mime !== "application/pdf") {
      await comoUsuario.from("recursos")
        .update({ texto_estado: "no_soportado" }).eq("id", recurso_id);
      return json(req, {
        estado: "no_soportado",
        mensaje: "Solo se puede leer el texto de un PDF. Escribe a mano de qué va la oferta.",
      });
    }

    // El bucket es privado: la descarga necesita service_role.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: archivo, error: falloDescarga } = await admin.storage
      .from("recursos").download(recurso.ruta);

    if (falloDescarga || !archivo) {
      return json(req, { error: "No se pudo descargar el documento." }, 500);
    }

    let texto: string;
    try {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      texto = (Array.isArray(text) ? text.join("\n") : text)
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } catch (e) {
      console.error("Extrayendo texto:", e instanceof Error ? e.message : e);
      await comoUsuario.from("recursos")
        .update({ texto_estado: "fallido" }).eq("id", recurso_id);
      return json(req, {
        estado: "fallido",
        mensaje: "No se ha podido leer el PDF. Escribe a mano de qué va la oferta.",
      });
    }

    if (texto.length < 30) {
      // Un PDF de solo imágenes no da texto. Decirlo es mejor que guardar
      // cuatro caracteres y que el redactor los use como si fueran la oferta.
      await comoUsuario.from("recursos")
        .update({ texto_estado: "fallido" }).eq("id", recurso_id);
      return json(req, {
        estado: "fallido",
        mensaje: "Ese PDF no tiene texto seleccionable — puede que sea un escaneo. Escríbelo a mano.",
      });
    }

    const recortado = texto.slice(0, MAX_CARACTERES);

    const { error: falloGuardar } = await comoUsuario.from("recursos")
      .update({ texto: recortado, texto_estado: "extraido" }).eq("id", recurso_id);

    if (falloGuardar) return json(req, { error: falloGuardar.message }, 500);

    return json(req, {
      estado: "extraido",
      caracteres: recortado.length,
      recortado: texto.length > MAX_CARACTERES,
    });
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error inesperado." }, 500);
  }
});
