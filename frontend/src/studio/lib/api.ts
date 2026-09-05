// ============================================================
// El puente del studio con Supabase.
//
// El editor venía de un proyecto Next y hablaba con quince rutas de API
// suyas. Aquí no hay servidor: el cliente habla con Postgres y la RLS
// protege, que es como funciona el resto de Prospector.
//
// En vez de tocar los dieciséis sitios que llaman a `apiFetch` dentro de
// las 7.500 líneas del editor, este módulo se hace pasar por `fetch`:
// recibe la misma ruta, devuelve un `Response` de verdad, y por dentro va a
// Supabase. El editor no se entera, y el día que alguien traiga una versión
// nueva del studio hay menos diferencias que reconciliar.
//
// Lo que todavía no existe devuelve 503 con un mensaje en español, NO un
// 404 con cuerpo vacío. Esa diferencia no es cosmética: el editor hace
// `.json()` sobre la respuesta, y sobre un cuerpo vacío eso lanza
// "Unexpected end of JSON input", que acababa como error rojo en la cara
// del usuario cada doce segundos.
// ============================================================

import { supabase } from "../../lib/supabase";
import { renderEmailHtml, renderEmailText } from "./email-renderer";
import type { StoredTemplate, TemplateDocument } from "./template-types";

/** Fila de `plantillas` tal y como la devuelve Postgres. */
type FilaPlantilla = {
  id: string;
  nombre: string;
  categoria: string;
  estado: string;
  asunto: string;
  preencabezado: string;
  documento: TemplateDocument;
  html: string;
  texto: string;
  miniatura: string | null;
  origen: string;
  version: number;
  creado_en: string;
  actualizado_en: string;
};

const COLUMNAS =
  "id, nombre, categoria, estado, asunto, preencabezado, documento, " +
  "html, texto, miniatura, origen, version, creado_en, actualizado_en";

/** El esquema está en español y el editor espera inglés. Aquí se traduce. */
function aPlantilla(f: FilaPlantilla): StoredTemplate {
  return {
    id: f.id,
    name: f.nombre,
    category: f.categoria,
    status: f.estado,
    subject: f.asunto,
    preheader: f.preencabezado,
    document: f.documento,
    htmlCache: f.html,
    textCache: f.texto,
    thumbnailUrl: f.miniatura,
    sourceType: f.origen,
    version: f.version,
    createdAt: f.creado_en,
    updatedAt: f.actualizado_en,
  };
}

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json" },
  });
}

/** Siempre con cuerpo JSON: ver la cabecera sobre `.json()` y los 404. */
function error(mensaje: string, estado = 400) {
  return json({ error: mensaje }, estado);
}

const TODAVIA_NO =
  "Esta parte del studio todavía no está conectada. Se conecta en la " +
  "siguiente entrega; mientras tanto, el resto del editor funciona.";

// ------------------------------------------------------------
// Plantillas
// ------------------------------------------------------------

async function listarPlantillas() {
  const { data, error: fallo } = await supabase
    .from("plantillas").select(COLUMNAS)
    .order("actualizado_en", { ascending: false }).limit(200);
  if (fallo) return error(fallo.message, 500);
  return json({ templates: (data as unknown as FilaPlantilla[]).map(aPlantilla) });
}

type CuerpoGuardar = {
  name?: string;
  category?: string;
  subject?: string;
  preheader?: string;
  document?: TemplateDocument;
  sourceType?: string;
  thumbnailUrl?: string | null;
};

/**
 * El HTML se calcula aquí, no lo manda el editor.
 *
 * `cerrar_version_plantilla` se niega a congelar una plantilla sin HTML, y
 * con razón: lo que se envía no puede depender de volver a renderizar algo
 * que entretanto ha cambiado. Guardarlo en cada escritura es lo que hace
 * que esa versión inmutable signifique algo.
 */
function derivados(doc: TemplateDocument, asunto: string, preencabezado: string) {
  try {
    return {
      html: renderEmailHtml(doc, asunto, preencabezado),
      texto: renderEmailText(doc),
    };
  } catch {
    // Un documento a medio construir no debe impedir guardarlo: se guarda
    // sin derivados y ya se recalcularán al siguiente guardado bueno.
    return { html: "", texto: "" };
  }
}

async function crearPlantilla(c: CuerpoGuardar) {
  if (!c.document) return error("Falta el documento de la plantilla");
  const asunto = c.subject ?? "";
  const pre = c.preheader ?? "";

  const { data, error: fallo } = await supabase.from("plantillas").insert({
    // tenant_id y creado_por los ponen los DEFAULT de la 025.
    nombre: (c.name ?? "Plantilla sin título").slice(0, 200),
    categoria: c.category ?? "personalizada",
    asunto, preencabezado: pre,
    documento: c.document,
    ...derivados(c.document, asunto, pre),
    miniatura: c.thumbnailUrl ?? null,
    origen: c.sourceType ?? "studio",
  }).select(COLUMNAS).single();

  if (fallo) return error(fallo.message, 500);
  return json({ template: aPlantilla(data as unknown as FilaPlantilla) });
}

async function actualizarPlantilla(id: string, c: CuerpoGuardar) {
  if (!c.document) return error("Falta el documento de la plantilla");
  const asunto = c.subject ?? "";
  const pre = c.preheader ?? "";

  const { data, error: fallo } = await supabase.from("plantillas").update({
    nombre: (c.name ?? "Plantilla sin título").slice(0, 200),
    categoria: c.category ?? "personalizada",
    asunto, preencabezado: pre,
    documento: c.document,
    ...derivados(c.document, asunto, pre),
    miniatura: c.thumbnailUrl ?? null,
    origen: c.sourceType ?? "studio",
    actualizado_en: new Date().toISOString(),
  }).eq("id", id).select(COLUMNAS).single();

  if (fallo) return error(fallo.message, 500);
  if (!data) return error("La plantilla no existe o no es tuya", 404);
  return json({ template: aPlantilla(data as unknown as FilaPlantilla) });
}

// ------------------------------------------------------------
// Kit de marca · una fila por tenant
// ------------------------------------------------------------

async function leerKit() {
  const { data, error: fallo } = await supabase
    .from("kits_marca").select("datos").maybeSingle();
  if (fallo) return error(fallo.message, 500);
  return json({ brandKit: data?.datos ?? {} });
}

async function guardarKit(datos: unknown) {
  // upsert por tenant_id, que es único; el DEFAULT lo rellena.
  const { data: fila } = await supabase.from("kits_marca").select("id").maybeSingle();
  const q = fila
    ? supabase.from("kits_marca").update({ datos, actualizado_en: new Date().toISOString() }).eq("id", fila.id)
    : supabase.from("kits_marca").insert({ datos });
  const { error: fallo } = await q;
  if (fallo) return error(fallo.message, 500);
  return json({ brandKit: datos });
}

// ------------------------------------------------------------
// Imágenes · `recursos` con tipo 'imagen' (ver 025)
// ------------------------------------------------------------

async function listarImagenes() {
  const { data, error: fallo } = await supabase
    .from("recursos").select("id, nombre, ruta, origen, texto_alt, ancho, alto, creado_en")
    .eq("tipo", "imagen").order("creado_en", { ascending: false }).limit(200);
  if (fallo) return error(fallo.message, 500);

  const assets = (data ?? []).map((r) => ({
    id: r.id as string,
    // El bucket es privado: la URL se firma al vuelo más abajo.
    url: r.ruta as string,
    filename: r.nombre as string,
    source: r.origen as string,
    altText: (r.texto_alt as string) ?? "",
    width: r.ancho as number | null,
    height: r.alto as number | null,
    createdAt: r.creado_en as string,
  }));
  return json({ assets });
}

// ------------------------------------------------------------
// El encaminador
// ------------------------------------------------------------

export async function apiFetch(
  entrada: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const url = typeof entrada === "string" ? entrada : entrada.toString();
  const ruta = url.split("?")[0].replace(/^https?:\/\/[^/]+/, "");
  const metodo = (init.method ?? "GET").toUpperCase();

  let cuerpo: Record<string, unknown> = {};
  if (typeof init.body === "string") {
    try { cuerpo = JSON.parse(init.body); } catch { /* no era JSON */ }
  }

  try {
    if (ruta === "/api/templates") {
      if (metodo === "GET")  return await listarPlantillas();
      if (metodo === "POST") return await crearPlantilla(cuerpo as CuerpoGuardar);
    }

    const conId = ruta.match(/^\/api\/templates\/([0-9a-f-]{36})$/i);
    if (conId) {
      const id = conId[1];
      if (metodo === "PUT" || metodo === "PATCH")
        return await actualizarPlantilla(id, cuerpo as CuerpoGuardar);
      if (metodo === "DELETE") {
        const { error: fallo } = await supabase.from("plantillas").delete().eq("id", id);
        return fallo ? error(fallo.message, 500) : json({ ok: true });
      }
      if (metodo === "GET") {
        const { data, error: fallo } = await supabase
          .from("plantillas").select(COLUMNAS).eq("id", id).maybeSingle();
        if (fallo) return error(fallo.message, 500);
        if (!data) return error("La plantilla no existe o no es tuya", 404);
        return json({ template: aPlantilla(data as unknown as FilaPlantilla) });
      }
    }

    if (ruta === "/api/brand-kit") {
      if (metodo === "GET") return await leerKit();
      return await guardarKit(cuerpo.brandKit ?? cuerpo);
    }

    if (ruta === "/api/assets" && metodo === "GET") return await listarImagenes();

    // Estado de la integración: el editor lo consulta para saber qué
    // enseñar. Booleanos, nunca claves.
    if (ruta === "/api/integration-readiness") {
      return json({ ai: false, email: false, prospector: true });
    }

    // Lo que aún no está. Con cuerpo JSON y mensaje, no un 404 mudo.
    return error(TODAVIA_NO, 503);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Fallo inesperado", 500);
  }
}
