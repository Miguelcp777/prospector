// ============================================================
// Edge Function · generar-imagen
//
// Imágenes para el studio de plantillas, con OpenAI. Anthropic no las
// genera, así que este es el único sitio del proyecto con un segundo
// proveedor.
//
// La clave NO es un secreto de la función: se guarda en el Vault desde el
// panel de administración y se lee aquí con `service_role`. Así se puede
// cambiar sin volver a desplegar, y sigue sin pasar nunca por el navegador
// — `leer_clave_openai` está revocada para `authenticated`. Ver 026.
//
// Desplegar: supabase functions deploy generar-imagen
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";

const BUCKET_IMAGENES = "imagenes-correo";

const MODELO_IMAGEN = "gpt-image-1";

/** Lo que pide el studio contra lo que admite OpenAI. */
const TAMANOS: Record<string, string> = {
  cuadrado: "1024x1024",
  horizontal: "1536x1024",
  vertical: "1024x1536",
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { prompt, altText, orientacion, calidad } = await req.json();

    if (typeof prompt !== "string" || prompt.trim().length < 8) {
      return json(req, { error: "Describe la imagen con algo más de detalle." }, 400);
    }

    // Quién la pide. El token del usuario, con su RLS.
    const usuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: auth } = await usuario.auth.getUser();
    if (!auth?.user) return json(req, { error: "No autenticado." }, 401);

    const { data: perfil } = await usuario
      .from("profiles").select("tenant_id").eq("id", auth.user.id).single();
    if (!perfil?.tenant_id) return json(req, { error: "Sin cuenta activa." }, 401);

    // El worker: lee la clave del Vault y escribe el consumo. Esta es la
    // única identidad con permiso para las dos cosas.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // La clave de OpenAI de este cliente, o la del servicio si está en
    // versión de prueba. Ver 047: quien ya no está en modo demo pone la
    // suya, y no hay caída de vuelta a la del servicio.
    const { data: resuelta } = await admin.rpc("resolver_clave_modelo", {
      p_tenant: perfil.tenant_id,
      p_proveedor: "openai",
    });
    const claveResuelta = Array.isArray(resuelta) ? resuelta[0] : resuelta;
    const clave = claveResuelta?.clave as string | null;

    if (!clave) {
      return json(req, {
        error: claveResuelta?.origen === "falta_cliente"
          ? "Falta la clave de OpenAI de tu cuenta. Se pega en " +
            "Cuenta → Proveedor de modelo."
          : "Falta la clave de OpenAI. Se pega en el panel de " +
            "administración, en «Generación de imágenes».",
      }, 503);
    }

    const size = TAMANOS[String(orientacion)] ?? TAMANOS.horizontal;

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${clave}`,
      },
      body: JSON.stringify({
        model: MODELO_IMAGEN,
        prompt: prompt.slice(0, 4000),
        size,
        quality: calidad === "alta" ? "high" : "medium",
        n: 1,
      }),
    });

    if (!r.ok) {
      const cuerpo = await r.text();
      let detalle = "";
      try { detalle = JSON.parse(cuerpo)?.error?.message ?? ""; } catch { /* no era JSON */ }
      console.error("OpenAI devolvió", r.status, cuerpo.slice(0, 500));
      return json(req, {
        // Igual que con Anthropic: el motivo va al mensaje, no solo al log.
        // Y las claves tachadas por si el proveedor las cita de vuelta.
        error: `El proveedor de imágenes rechazó la petición (HTTP ${r.status})` +
          `${detalle ? ": " + detalle.replace(/sk-[\w-]{20,}/g, "sk-***").slice(0, 200) : ""}`,
      }, 502);
    }

    const datos = await r.json();
    const b64 = datos?.data?.[0]?.b64_json;
    if (!b64) return json(req, { error: "El proveedor no devolvió ninguna imagen." }, 502);

    // Se anota aquí: la imagen ya está pagada aunque falle al guardarla.
    await admin.rpc("registrar_imagen_generada", {
      p_funcion: "generar-imagen",
      p_modelo: MODELO_IMAGEN,
      p_tenant: perfil.tenant_id,
      // Sin campaña: una imagen del studio es reutilizable, igual que la
      // plantilla que la usa.
      p_campana: null,
    });

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const [ancho, alto] = size.split("x").map(Number);
    // La carpeta es el tenant porque las políticas de storage comprueban
    // `(storage.foldername(name))[1] = auth_tenant_id()`.
    const ruta = `${perfil.tenant_id}/studio/${crypto.randomUUID()}.png`;

    // Bucket publico desde la 050. Antes iba a `recursos`, que es privado, y
    // lo que quedaba dentro de la plantilla era una URL firmada de ocho
    // horas: el hero se veia bien al disenarlo y roto por la tarde, en la
    // plantilla guardada y en cualquier correo enviado con ella.
    const { error: falloSubida } = await admin.storage
      .from(BUCKET_IMAGENES).upload(ruta, bytes, { contentType: "image/png" });
    if (falloSubida) {
      return json(req, { error: `No se pudo guardar la imagen: ${falloSubida.message}` }, 500);
    }

    // La fila se escribe con el token del usuario para que el tenant lo
    // ponga la RLS y no este código: un fallo aquí no debe poder colar una
    // imagen en la cuenta de otro.
    const { data: fila, error: falloFila } = await usuario.from("recursos").insert({
      tipo: "imagen",
      nombre: (altText || prompt).slice(0, 120) + ".png",
      ruta,
      bucket: BUCKET_IMAGENES,
      mime: "image/png",
      tamano: bytes.byteLength,
      ancho, alto,
      origen: "ia",
      prompt: prompt.slice(0, 2000),
      texto_alt: String(altText ?? "").slice(0, 300),
    }).select("id, nombre, ruta, bucket, origen, texto_alt, ancho, alto, creado_en").single();

    if (falloFila) {
      // Sin fila, el archivo queda huérfano y ocuparía sitio para siempre.
      await admin.storage.from(BUCKET_IMAGENES).remove([ruta]);
      return json(req, { error: falloFila.message }, 500);
    }

    const { data: publica } = admin.storage
      .from(BUCKET_IMAGENES).getPublicUrl(ruta);

    return json(req, {
      url: publica?.publicUrl ?? "",
      asset: {
        id: fila.id,
        url: publica?.publicUrl ?? "",
        filename: fila.nombre,
        source: fila.origen,
        altText: fila.texto_alt,
        width: fila.ancho,
        height: fila.alto,
        createdAt: fila.creado_en,
      },
      mode: "ai",
      width: ancho,
      height: alto,
      ratio: `${ancho}:${alto}`,
    });
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error inesperado generando la imagen." }, 500);
  }
});
