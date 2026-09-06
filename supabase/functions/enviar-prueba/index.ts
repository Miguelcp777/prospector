// ============================================================
// Edge Function · enviar-prueba
//
// Manda UN mensaje ya redactado a la dirección de quien lo pide, para ver
// en una bandeja real lo que se va a enviar: si el diseño aguanta el
// cliente de correo, si el enlace de baja funciona, si el asunto se corta.
//
// NO es el módulo de envío. La diferencia está en una línea:
//
//     const destino = user.user.email
//
// El destinatario sale del token, no del cuerpo de la petición. No hay
// forma de pedirle que escriba a un lead ni a nadie más, ni equivocándose
// ni a propósito. Eso es lo que la separa de la Fase 4, que sigue cerrada
// hasta que haya dominio, warmup y SPF/DKIM/DMARC.
//
// Tampoco marca el mensaje como 'enviado': lo enviado es lo que se envió a
// un cliente, y una prueba a tu propio correo no lo es. Falsearlo
// estropearía el embudo y el registro que hay que poder enseñar.
//
// Se configura desde el panel: Ajustes → Correo del servicio. La clave vive
// en el Vault y se lee aquí con `service_role`; el remitente, en `ajustes`.
// Los secretos RESEND_API_KEY y REMITENTE_PRUEBA siguen valiendo como
// respaldo, para no romper una instalación que ya los tuviera.
//
// Desplegar:  supabase functions deploy enviar-prueba
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";

/** Lo que Resend acepta como remitente: "Nombre <buzon@dominio>" o el buzón. */
const REMITENTE = /^(.+\s)?<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { message_id } = await req.json();
    if (!message_id) return json(req, { error: "Falta el mensaje a probar." }, 400);

    // La configuración vive en el panel (Ajustes → Correo del servicio) y
    // se lee con `service_role`: la clave está en el Vault y no sale de ahí
    // ni para un administrador. Los secretos de entorno se quedan como
    // respaldo, para no romper una instalación que ya los tuviera puestos.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: claveVault } = await admin.rpc("leer_clave_correo");
    const { data: ajustes } = await admin
      .from("ajustes").select("remitente_servicio").maybeSingle();

    const clave = (claveVault as string | null) || Deno.env.get("RESEND_API_KEY");
    const remitente =
      (ajustes?.remitente_servicio as string | null) ||
      Deno.env.get("REMITENTE_PRUEBA");

    // Los dos avisos van por separado y con el nombre del secreto dentro:
    // "falta configuración" obliga a adivinar cuál.
    if (!clave)
      return json(req, {
        error: "Falta la clave del proveedor de correo. Se pone en el " +
               "panel: Ajustes → Correo del servicio. Se saca en " +
               "resend.com → API Keys.",
      }, 503);
    if (!remitente || !REMITENTE.test(remitente))
      return json(req, {
        error: "Falta el remitente por defecto, o no tiene forma de " +
               "dirección. Se pone en el panel: Ajustes → Correo del " +
               'servicio. Ejemplo: Prospector <pruebas@tu-dominio.com>. El ' +
               "dominio tiene que estar verificado en el proveedor o " +
               "rechazará el envío.",
      }, 503);

    // Con el token del usuario: la RLS decide a qué mensajes llega, así que
    // no hace falta comprobar el tenant a mano.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return json(req, { error: "No autenticado." }, 401);

    const destino = user.user.email;
    if (!destino)
      return json(req, { error: "Tu cuenta no tiene correo al que enviar." }, 400);

    const { data: mensaje, error: fallo } = await supabase
      .from("messages")
      .select("id, asunto, cuerpo, html, token_baja, leads(nombre)")
      .eq("id", message_id)
      .maybeSingle();
    if (fallo) return json(req, { error: fallo.message }, 500);
    if (!mensaje) return json(req, { error: "Mensaje no encontrado." }, 404);

    // La misma garantía que pide el trigger al enviar de verdad. Si la
    // prueba pudiera salir sin enlace de baja, no estaría probando lo que
    // se va a mandar.
    const texto = mensaje.cuerpo ?? "";
    const html = mensaje.html ?? "";
    const marca = `t=${mensaje.token_baja}`;
    if (!texto.includes(marca) || (html && !html.includes(marca)))
      return json(req, {
        error: "Este mensaje no lleva su enlace de baja y no se envía ni de " +
               "prueba. Vuelve a aplicarle la plantilla.",
      }, 409);

    const lead = (mensaje.leads as { nombre?: string } | null)?.nombre ?? "sin lead";

    // El asunto va marcado. Una prueba indistinguible de un envío real en
    // la bandeja es una forma estupenda de confundirse dentro de un mes.
    const asunto = `[PRUEBA] ${mensaje.asunto ?? "(sin asunto)"}`;

    const aviso =
      `Correo de PRUEBA de Prospector. Destinatario real previsto: ${lead}. ` +
      `No se ha enviado a nadie más y el mensaje sigue en borrador.`;

    const cuerpo: Record<string, unknown> = {
      from: remitente,
      to: [destino],
      subject: asunto,
      // El texto plano siempre; el HTML solo si la plantilla está aplicada.
      text: `${aviso}\n\n---\n\n${texto}`,
      ...(html
        ? {
            html:
              `<div style="padding:10px 14px;margin-bottom:14px;border-left:3px solid #a16207;` +
              `background:#fef3c7;color:#78350f;font:13px/1.5 system-ui,sans-serif;">` +
              `${aviso}</div>${html}`,
          }
        : {}),
    };

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
    });

    const datos = await resp.json().catch(() => null);

    if (!resp.ok) {
      // El motivo de Resend, no un "no se pudo enviar". Los dos fallos que
      // salen siempre al principio son el dominio sin verificar y la clave
      // en modo prueba, y los dos se explican solos si se enseña el texto.
      const motivo =
        (datos as { message?: string; name?: string } | null)?.message ??
        `Resend respondió ${resp.status}`;
      return json(req, { error: `Resend: ${motivo}` }, 502);
    }

    return json(req, {
      enviado_a: destino,
      id: (datos as { id?: string } | null)?.id ?? null,
      con_diseno: Boolean(html),
    });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Fallo inesperado" }, 500);
  }
});
