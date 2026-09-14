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
import {
  elegirReceta, generarDocumento, guidedCopy, type Brief, type GeneratedCopy,
} from "./generacion";
import { arteDelSector, validarDireccionArte } from "./direccion-arte";
import { componerDocumentoSimple, type CopyCampana } from "./composicion-simple";
import { datosDelRemitente } from "./datos-remitente";

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

/**
 * Las archivadas, para poder deshacer.
 *
 * Archivar sin una forma de volver atrás no es archivar, es esconder: el
 * dato sigue en la base pero nadie puede llegar a él sin SQL.
 */
async function listarArchivadas() {
  const { data, error: fallo } = await supabase
    .from("plantillas").select(COLUMNAS)
    .eq("estado", "archivada")
    .order("actualizado_en", { ascending: false }).limit(200);
  if (fallo) return error(fallo.message, 500);
  return json({ templates: (data as unknown as FilaPlantilla[]).map(aPlantilla) });
}

async function restaurarPlantilla(id: string) {
  // Vuelve a 'borrador', no a 'activa': lo que estaba archivado hay que
  // volver a mirarlo antes de darlo por bueno.
  const { data, error: fallo } = await supabase.from("plantillas")
    .update({ estado: "borrador", actualizado_en: new Date().toISOString() })
    .eq("id", id).eq("estado", "archivada")
    .select(COLUMNAS).maybeSingle();
  if (fallo) return error(fallo.message, 500);
  if (!data) return error("La plantilla no está archivada o no es tuya", 404);
  return json({ template: aPlantilla(data as unknown as FilaPlantilla) });
}

/**
 * Qué se lleva por delante borrar una plantilla.
 *
 * Se consulta antes de preguntar, para que el aviso diga números en vez de
 * "esto es irreversible", que no informa de nada.
 */
async function usoDePlantilla(id: string) {
  const [versiones, mensajes, enviados] = await Promise.all([
    supabase.from("plantilla_versiones").select("id", { count: "exact", head: true })
      .eq("plantilla_id", id),
    supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("plantilla_id", id),
    supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("plantilla_id", id).eq("estado", "enviado"),
  ]);
  return {
    versiones: versiones.count ?? 0,
    mensajes: mensajes.count ?? 0,
    enviados: enviados.count ?? 0,
  };
}

/**
 * Borrado definitivo.
 *
 * Solo desde la lista de archivadas: archivar primero y borrar después son
 * dos pasos a propósito, porque esto no se deshace.
 *
 * Se niega si la plantilla compuso algún correo YA ENVIADO. `messages.html`
 * guarda lo que se mandó y sobrevive —el enlace es ON DELETE SET NULL, no
 * cascade— pero se perdería con qué plantilla se compuso, y eso es parte
 * del registro que hay que poder enseñar ante una reclamación. Ver
 * docs/compliance.md.
 *
 * Hoy no salta nunca: no hay ni un mensaje enviado. Está para cuando lo
 * haya, que es cuando ya no se puede añadir.
 */
async function borrarPlantilla(id: string) {
  const uso = await usoDePlantilla(id);

  if (uso.enviados > 0)
    return error(
      `No se puede borrar: esta plantilla compuso ${uso.enviados} correo${
        uso.enviados === 1 ? "" : "s"
      } ya enviado${uso.enviados === 1 ? "" : "s"}. Se queda archivada, ` +
        `porque hay que poder decir con qué se compuso lo que se mandó.`,
      409,
    );

  const { error: fallo } = await supabase.from("plantillas")
    .delete().eq("id", id).eq("estado", "archivada");
  if (fallo) return error(fallo.message, 500);
  return json({ ok: true, ...uso });
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
async function derivados(doc: TemplateDocument, asunto: string, preencabezado: string) {
  // Sin esto el HTML guardado firma «Aurevanta Labs · Valencia, España», que
  // es el remitente de ejemplo del renderizador. Lo guardado es lo que se
  // congela al cerrar una versión, así que ahí no puede firmar nadie ajeno.
  const { merge } = await datosDelRemitente();
  try {
    return {
      html: renderEmailHtml(doc, asunto, preencabezado, merge),
      texto: renderEmailText(doc, merge),
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
    ...(await derivados(c.document, asunto, pre)),
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
    ...(await derivados(c.document, asunto, pre)),
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

  // El kit que no se ha rellenado nunca hereda de Cuenta lo que ya se sabe.
  // Sin esto el editor arranca con «Aurevanta Labs», que es el nombre del
  // producto del que salió, y lo estampa en la marca y en el pie del correo.
  const { merge } = await datosDelRemitente();
  const kit = { ...(data?.datos ?? {}) } as Record<string, unknown>;
  const heredar = (clave: string, valor: string) => {
    // Solo se hereda el hueco. Un kit con valor propio manda, aunque sea
    // distinto del de Cuenta: el cliente lo escribió ahí a propósito.
    if (!String(kit[clave] ?? "").trim() && valor) kit[clave] = valor;
  };
  heredar("name", merge["sender.company"]);
  heredar("legalName", merge["sender.legal_name"]);
  heredar("senderName", merge["sender.name"]);
  heredar("postalAddress", merge["sender.postal_address"]);
  heredar("privacyUrl", merge["sender.privacy_url"]);
  heredar("privacyEmail", merge["sender.privacy_email"]);

  return json({ brandKit: kit });
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
//
// El archivo va a un bucket **público** desde la 050. Lo que se dibuja
// dentro de un correo no puede servirse con una URL firmada: el correo se
// abre horas o semanas después y la firma caduca a las ocho, así que la
// imagen llega rota. La fila del catálogo sigue en `recursos`, que es quien
// sabe de quién es cada archivo.
// ------------------------------------------------------------

const BUCKET_IMAGENES = "imagenes-correo";

async function listarImagenes() {
  const { data, error: fallo } = await supabase
    .from("recursos").select("id, nombre, ruta, bucket, origen, texto_alt, ancho, alto, creado_en")
    .eq("tipo", "imagen").order("creado_en", { ascending: false }).limit(200);
  if (fallo) return error(fallo.message, 500);

  const assets = await Promise.all((data ?? []).map(async (r) => ({
    id: r.id as string,
    url: await urlDelRecurso(r.ruta as string, r.bucket as string | null),
    // Las de antes de la 050 siguen en el bucket privado: se ven aquí con
    // una firma de ocho horas y llegan rotas a una bandeja de entrada. Se
    // marcan en la galería para que nadie las elija sin saberlo.
    caduca: r.bucket !== BUCKET_IMAGENES,
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

async function componer(brief: Brief & { modoAsistente?: string }) {
  // El texto y la dirección de arte los escriben dos especialistas del
  // modelo, en paralelo. Antes esto lo resolvía `guidedCopy`, una plantilla
  // determinista, y el aspecto salía de una receta del catálogo: con un
  // estudio de tatuajes salía un correo de clínica de fisioterapia.
  const simple = brief.modoAsistente !== "avanzado";

  const { data, error: fallo } = await supabase.functions.invoke("componer-campana", {
    body: brief,
  });

  let mensajeDeError: string | null = null;
  if (fallo) {
    const ctx = (fallo as { context?: Response }).context;
    mensajeDeError = fallo.message;
    try { mensajeDeError = JSON.parse(await ctx!.text()).error ?? mensajeDeError; } catch { /* sin cuerpo */ }
  }

  const respuesta = (data ?? {}) as {
    copy?: Record<string, unknown>;
    arte?: unknown;
    avisoArte?: string | null;
  };
  const escrito = respuesta.copy;

  // En el modo simple la promesa es que lo hace la IA. Si no ha podido, se
  // dice: un correo de plantilla disfrazado de generado es peor que un error
  // honesto, porque se guarda igual y nadie vuelve a mirarlo.
  if (simple && !escrito) {
    return error(mensajeDeError ?? "El modelo no pudo escribir el correo.", 502);
  }

  // En simple no hay relleno: el hueco que el modelo deje se queda vacío.
  //
  // Rellenarlo con `guidedCopy` es lo que metió «Auditoría de oportunidades
  // para Lumen Arquitectura» en medio del correo de un estudio de tatuajes:
  // esa frase la compone la plantilla determinista con el objetivo y la
  // oferta que el asistente trae puestos de fábrica, y con el destinatario
  // de ejemplo de la vista previa. Dos voces en el mismo correo, y la
  // segunda hablando de otro negocio.
  const base = simple ? null : guidedCopy(brief);
  const texto = (clave: keyof GeneratedCopy) =>
    String(escrito?.[clave] || base?.[clave] || "");

  const copy: CopyCampana = escrito
    ? {
      subject: texto("subject"),
      preheader: texto("preheader"),
      eyebrow: texto("eyebrow"),
      title: texto("title"),
      body: texto("body"),
      sectionTitle: texto("sectionTitle"),
      sectionBody: texto("sectionBody"),
      ctaLabel: texto("ctaLabel"),
      ventajas: Array.isArray(escrito.ventajas)
        ? (escrito.ventajas as Array<{ titulo?: string; texto?: string }>)
        : [],
      cierre: String(escrito.cierre ?? ""),
    }
    : base!;

  if (!simple) {
    // Camino de siempre, intacto: catálogo y todo.
    const documento = generarDocumento(
      { ...brief, templatePresetId: elegirReceta(brief) },
      copy,
    );
    return json({
      document: documento,
      subject: copy.subject,
      preheader: copy.preheader,
      imagePrompt: null,
      mode: escrito ? "ia" : "guided-preview",
      aviso: escrito ? null : mensajeDeError,
    });
  }

  // Si el director de arte no contestó, se sigue con una dirección derivada
  // del sector: el correo sale igual, con otro aspecto, y se avisa.
  const { arte, correcciones } = validarDireccionArte(respuesta.arte, arteDelSector(brief));

  const documento = componerDocumentoSimple({
    copy,
    arte,
    nombreEmpresa: String(brief.companyName ?? "").trim(),
    urlImagen: null,
    urlDestino: brief.destinationUrl,
  });

  return json({
    document: documento,
    subject: copy.subject,
    preheader: copy.preheader,
    // El prompt de la imagen lo escribe el director de arte, que es quien
    // conoce la paleta. Y tiene que ir dentro del texto: `generar-imagen`
    // solo recibe prompt, texto alternativo, orientación y calidad.
    imagePrompt: arte.imagePrompt || null,
    mode: "ia",
    aviso: respuesta.avisoArte ?? null,
    correcciones,
    porQue: arte.porQue || null,
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
    .from(BUCKET_IMAGENES).upload(ruta, archivo, { contentType: archivo.type });
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
    bucket: BUCKET_IMAGENES,
    mime: archivo.type,
    tamano: archivo.size,
    ancho, alto,
    origen: "subida",
    texto_alt: String(form.get("altText") ?? "").slice(0, 300),
  }).select("id, nombre, ruta, bucket, origen, texto_alt, ancho, alto, creado_en").single();

  if (falloFila) {
    // La fila es la que manda: sin ella el archivo queda huérfano y nadie
    // lo va a encontrar nunca. Se retira.
    await supabase.storage.from(BUCKET_IMAGENES).remove([ruta]);
    return error(falloFila.message, 500);
  }

  const url = await urlDelRecurso(ruta, BUCKET_IMAGENES);
  return json({ asset: {
    id: fila.id, url, filename: fila.nombre, source: fila.origen,
    altText: fila.texto_alt, width: fila.ancho, height: fila.alto,
    createdAt: fila.creado_en,
  }, url });
}

/**
 * La dirección de un archivo del catálogo, según dónde viva.
 *
 * `imagenes-correo` es público desde la 050 y devuelve una URL estable. Las
 * imágenes anteriores siguen en `recursos`, que es privado, y solo se pueden
 * ver con una firma que caduca a las ocho horas — que es justo el motivo de
 * aquella migración.
 */
async function urlDelRecurso(ruta: string, bucket?: string | null) {
  if (bucket === BUCKET_IMAGENES)
    return supabase.storage.from(BUCKET_IMAGENES).getPublicUrl(ruta).data.publicUrl;
  const { data } = await supabase.storage.from(bucket || "recursos")
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

    if (ruta === "/api/templates/archivadas" && metodo === "GET")
      return await listarArchivadas();

    const paraRestaurar = ruta.match(/^\/api\/templates\/([0-9a-f-]{36})\/restaurar$/i);
    if (paraRestaurar && metodo === "POST")
      return await restaurarPlantilla(paraRestaurar[1]);

    const paraUso = ruta.match(/^\/api\/templates\/([0-9a-f-]{36})\/uso$/i);
    if (paraUso && metodo === "GET") return json(await usoDePlantilla(paraUso[1]));

    const paraBorrar = ruta.match(/^\/api\/templates\/([0-9a-f-]{36})\/definitivo$/i);
    if (paraBorrar && metodo === "DELETE")
      return await borrarPlantilla(paraBorrar[1]);

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
      return await componer(cuerpo as Brief);

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
