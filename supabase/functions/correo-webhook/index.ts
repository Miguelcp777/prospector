// ============================================================
// Edge Function · correo-webhook
//
// Recibe del proveedor de correo lo que pasó con cada envío —entregado,
// abierto, rebotado, denunciado como spam, baja— y lo convierte en
// supresiones. Es la pieza que `docs/decisiones/0004-quien-es-el-remitente.md`
// señala como lo que de verdad falta antes de poder enviar: sin ella la
// lista de supresión no se mantiene sola, se sigue escribiendo a
// direcciones muertas y la reputación se hunde por su propio peso.
//
// ------------------------------------------------------------------
// POR QUÉ LA FIRMA NO ES OPCIONAL
//
// Esta función va sin JWT: la llama el proveedor, no una persona. Lo único
// que la separa de ser un formulario público para suprimir la dirección de
// cualquiera es la firma. Sin verificarla, alguien puede:
//
//   · suprimir el correo de todos los leads de un cliente, y dejar sus
//     campañas mudas sin que nadie entienda por qué;
//   · marcar mensajes como entregados o abiertos, y falsear el embudo.
//
// Por eso, si falta el secreto, la función NO acepta nada. Ni siquiera "de
// momento": un webhook que confía por defecto es peor que no tenerlo.
// ------------------------------------------------------------------
//
// Desplegar:  supabase functions deploy correo-webhook --no-verify-jwt
// Secreto:    supabase secrets set WEBHOOK_CORREO_SECRETO=whsec_...
//             (el que da Resend al crear el webhook)
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

/** Cinco minutos de tolerancia, que es lo que recomienda Svix. */
const VENTANA_SEGUNDOS = 60 * 5;

/**
 * Verifica la firma de Svix, que es lo que usa Resend.
 *
 * Se firma `${id}.${timestamp}.${cuerpo}` con HMAC-SHA256 y el secreto en
 * base64 —el que va detrás de `whsec_`—. La cabecera puede traer varias
 * firmas separadas por espacios, cada una `v1,<base64>`: hay que aceptar si
 * cualquiera cuadra, porque así es como el proveedor rota el secreto sin
 * cortar el servicio.
 */
async function firmaValida(
  secreto: string, id: string, ts: string, cuerpo: string, cabecera: string,
): Promise<boolean> {
  // Contra repetición: un evento capturado y reenviado mañana no vale.
  const edad = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(edad) || edad > VENTANA_SEGUNDOS) return false;

  const bruto = secreto.startsWith("whsec_") ? secreto.slice(6) : secreto;
  let clave: Uint8Array;
  try {
    clave = Uint8Array.from(atob(bruto), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  const hmac = await crypto.subtle.importKey(
    "raw", clave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "HMAC", hmac, new TextEncoder().encode(`${id}.${ts}.${cuerpo}`),
  );
  const esperada = btoa(String.fromCharCode(...new Uint8Array(firma)));

  // Comparación en tiempo constante: comparar con === filtra el secreto por
  // el tiempo que tarda en fallar.
  return cabecera.split(" ").some((parte) => {
    const dada = parte.split(",")[1] ?? "";
    if (dada.length !== esperada.length) return false;
    let diff = 0;
    for (let i = 0; i < dada.length; i++) diff |= dada.charCodeAt(i) ^ esperada.charCodeAt(i);
    return diff === 0;
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }

  const secreto = Deno.env.get("WEBHOOK_CORREO_SECRETO");
  if (!secreto) {
    // 503 y no 200: si respondiéramos que sí, el proveedor daría el evento
    // por entregado y no lo reintentaría. Se perdería un rebote de verdad.
    return new Response(
      JSON.stringify({ error: "Falta WEBHOOK_CORREO_SECRETO. No se acepta nada sin firma." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const cuerpo = await req.text();
  const id = req.headers.get("svix-id") ?? "";
  const ts = req.headers.get("svix-timestamp") ?? "";
  const firma = req.headers.get("svix-signature") ?? "";

  if (!id || !ts || !firma || !(await firmaValida(secreto, id, ts, cuerpo, firma))) {
    return new Response(JSON.stringify({ error: "Firma no válida" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  let evento: {
    type?: string;
    created_at?: string;
    data?: { email_id?: string; to?: string[] | string; subject?: string };
  };
  try {
    evento = JSON.parse(cuerpo);
  } catch {
    return new Response(JSON.stringify({ error: "Cuerpo ilegible" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const destino = Array.isArray(evento.data?.to) ? evento.data?.to[0] : evento.data?.to;

  // Con service_role: escribe en suppressions y messages de cualquier
  // tenant, que es justo lo que no puede hacer nadie con sesión.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.rpc("registrar_evento_correo", {
    p_proveedor: "resend",
    // El id de Svix es único por evento: es lo que hace idempotente el
    // reintento del proveedor, que reenvía hasta que le respondas 2xx.
    p_evento_id: id,
    p_tipo: evento.type ?? "desconocido",
    p_email: destino ?? null,
    p_mensaje_id: evento.data?.email_id ?? null,
    p_carga: evento,
  });

  if (error) {
    // 500 para que el proveedor reintente. Tragárselo con un 200 perdería
    // el evento para siempre.
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  const r = (data as { nuevo: boolean; suprimido: boolean; motivo: string | null }[])?.[0];
  return new Response(
    JSON.stringify({ ok: true, nuevo: r?.nuevo ?? false, suprimido: r?.suprimido ?? false }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
