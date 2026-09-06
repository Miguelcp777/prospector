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
import { generarDocumento, guidedCopy, type Brief } from "./generacion";

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
  "Esta parte del studio todavía no está conectada. Mientras tanto, el " +
  "resto del editor funciona.";



// ------------------------------------------------------------
// Plantillas
// ------------------------------------------------------------

async function listarPlantillas() {
  const { data, error: fallo } = await supabase
    .from("plantillas").select(COLUMNAS)
    .neq("estado", "archivada")
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

  const assets = await Promise.all((data ?? []).map(async (r) => ({
    id: r.id as string,
    // El bucket es privado: sin firmar, el navegador no puede pintarla.
    url: await urlFirmada(r.ruta as string),
    filename: r.nombre as string,
    source: r.origen as string,
    altText: (r.texto_alt as string) ?? "",
    width: r.ancho as number | null,
    height: r.alto as number | null,
    createdAt: r.creado_en as string,
  })));
  return json({ assets });
}

// ------------------------------------------------------------
// Componer un correo desde el brief
//
// Sin red y sin claves: `guidedCopy` escribe el texto de forma
// determinista y el catálogo monta el documento. En el original la IA solo
// SUSTITUÍA el texto cuando había clave de OpenAI; todo lo demás siempre
// fue local. Por eso esto funciona hoy, al instante y gratis.
// ------------------------------------------------------------

function componer(brief: Brief) {
  const copy = guidedCopy(brief);
  const documento = generarDocumento(brief, copy);
  return json({
    document: documento,
    subject: copy.subject,
    preheader: copy.preheader,
    mode: "guided-preview",
  });
}

// ------------------------------------------------------------
// Subir una imagen · bucket `recursos` (017), carpeta por tenant
//
// La ruta empieza por el tenant porque las políticas de storage comprueban
// `(storage.foldername(name))[1] = auth_tenant_id()::text`: el aislamiento
// entre clientes está en el nombre del archivo, no en el código de aquí.
// ------------------------------------------------------------

const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

async function subirImagen(form: FormData) {
  const archivo = form.get("file");
  if (!(archivo instanceof File)) return error("No llegó ningún archivo");
  if (!TIPOS_IMAGEN.includes(archivo.type))
    return error("Formato no admitido: solo PNG, JPEG o WebP");
  if (archivo.size > MAX_BYTES)
    return error("La imagen pasa de 8 MB");

  const { data: perfil } = await supabase.from("profiles").select("tenant_id").single();
  if (!perfil?.tenant_id) return error("Sin cuenta activa", 401);

  const ext = archivo.type.split("/")[1].replace("jpeg", "jpg");
  const ruta = `${perfil.tenant_id}/studio/${crypto.randomUUID()}.${ext}`;

  const { error: falloSubida } = await supabase.storage
    .from("recursos").upload(ruta, archivo, { contentType: archivo.type });
  if (falloSubida) return error(falloSubida.message, 500);

  // Las medidas se leen aquí: el editor las necesita para maquetar y en el
  // servidor habría que decodificar la imagen para saberlas.
  let ancho: number | null = null, alto: number | null = null;
  try {
    const bitmap = await createImageBitmap(archivo);
    ancho = bitmap.width; alto = bitmap.height;
    bitmap.close();
  } catch { /* formato que el navegador no decodifica */ }

  const { data: fila, error: falloFila } = await supabase.from("recursos").insert({
    tipo: "imagen",
    nombre: archivo.name.slice(0, 200),
    ruta,
    mime: archivo.type,
    tamano: archivo.size,
    ancho, alto,
    origen: "subida",
    texto_alt: String(form.get("altText") ?? "").slice(0, 300),
  }).select("id, nombre, ruta, origen, texto_alt, ancho, alto, creado_en").single();

  if (falloFila) {
    // La fila es la que manda: sin ella el archivo queda huérfano y nadie
    // lo va a encontrar nunca. Se retira.
    await supabase.storage.from("recursos").remove([ruta]);
    return error(falloFila.message, 500);
  }

  const url = await urlFirmada(ruta);
  return json({ asset: {
    id: fila.id, url, filename: fila.nombre, source: fila.origen,
    altText: fila.texto_alt, width: fila.ancho, height: fila.alto,
    createdAt: fila.creado_en,
  }, url });
}

/** El bucket es privado: cada uso necesita su enlace firmado. */
async function urlFirmada(ruta: string) {
  const { data } = await supabase.storage.from("recursos")
    .createSignedUrl(ruta, 60 * 60 * 8);
  return data?.signedUrl ?? "";
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
        // Archiva, no borra. El botón del editor dice "Archivar" y hasta
        // ahora hacía un DELETE de verdad, sin preguntar: un clic en un
        // icono pequeño y la plantilla desaparecía.
        //
        // Y no se llevaba solo la plantilla. `plantilla_versiones` cuelga
        // con ON DELETE CASCADE, así que se iba con ella el histórico de
        // versiones —el que la 025 hizo inmutable a propósito— y
        // `messages.plantilla_id` es ON DELETE SET NULL, así que los
        // correos ya enviados perdían el registro de con qué se
        // compusieron. Eso es justo lo que hay que poder enseñar ante una
        // reclamación.
        //
        // `estado` ya admitía 'archivada' desde la 025. Solo había que
        // usarlo.
        const { error: fallo } = await supabase.from("plantillas")
          .update({ estado: "archivada", actualizado_en: new Date().toISOString() })
          .eq("id", id);
        return fallo ? error(fallo.message, 500) : json({ ok: true, estado: "archivada" });
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

    if (ruta === "/api/assets") {
      if (metodo === "GET") return await listarImagenes();
      if (metodo === "POST" && init.body instanceof FormData)
        return await subirImagen(init.body);
    }

    if (ruta === "/api/generate" && metodo === "POST")
      return componer(cuerpo as Brief);

    // Las herramientas de texto sí van al modelo, y por eso pasan por una
    // Edge Function: la clave de Anthropic no puede estar en el navegador.
    if (ruta === "/api/ai-tools" && metodo === "POST") {
      const { data, error: fallo } = await supabase.functions.invoke("studio-ia", {
        body: { action: cuerpo.action, payload: cuerpo },
      });
      if (fallo) {
        // El motivo real viaja en el cuerpo, no en el mensaje del error.
        // Ver lib/edge.ts, donde está el mismo problema explicado.
        const ctx = (fallo as { context?: Response }).context;
        let mensaje = fallo.message;
        try {
          const j = JSON.parse(await ctx!.text());
          mensaje = j.error ?? mensaje;
        } catch { /* sin cuerpo legible */ }
        return error(mensaje, 502);
      }
      const conError = data as { error?: string } | null;
      if (conError?.error) return error(conError.error, 502);
      return json(data);
    }

    // Estado de la integración: el editor lo consulta para saber qué
    // enseñar. Booleanos, nunca claves.
    if (ruta === "/api/integration-readiness") {
      return json({ ai: false, email: false, prospector: true });
    }

    if (ruta === "/api/generate-image" && metodo === "POST") {
      const { data, error: fallo } = await supabase.functions.invoke("generar-imagen", {
        body: {
          prompt: cuerpo.prompt,
          altText: cuerpo.altText,
          // El studio habla de "draft/2k/4k"; OpenAI, de tamaños. La
          // traducción vive en la función, que es quien conoce al proveedor.
          orientacion: cuerpo.orientation ?? "horizontal",
          calidad: cuerpo.resolution === "4k" ? "alta" : "media",
        },
      });
      if (fallo) {
        const ctx = (fallo as { context?: Response }).context;
        let mensaje = fallo.message;
        try { mensaje = JSON.parse(await ctx!.text()).error ?? mensaje; } catch { /* sin cuerpo */ }
        return error(mensaje, 502);
      }
      const conError = data as { error?: string } | null;
      if (conError?.error) return error(conError.error, 502);
      return json(data);
    }

    // El troceado del hosting anterior. No se implementa a propósito: ver el
    // comentario de DIRECT_UPLOAD_BYTES en upload-policy.ts. Si algo vuelve a
    // llegar aquí es que ese tope se ha bajado, y el mensaje tiene que decirlo
    // en vez del genérico "todavía no está conectada".
    if (ruta.startsWith("/api/assets/chunk"))
      return error(
        "La subida por partes no existe en esta versión. Si ves esto, " +
        "DIRECT_UPLOAD_BYTES ha bajado por debajo del tamaño de la imagen.",
        501,
      );

    // Lo que aún no está. Con cuerpo JSON y mensaje, no un 404 mudo.
    return error(TODAVIA_NO, 503);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Fallo inesperado", 500);
  }
}
