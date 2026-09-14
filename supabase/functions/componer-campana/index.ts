// ============================================================
// Edge Function · componer-campana
//
// El texto de una campaña del studio, escrito por un modelo a partir del
// brief. Con OpenAI, que es lo que se pidió: el mismo proveedor que ya
// genera las imágenes, para que el correo entero salga de un sitio.
//
// QUÉ HABÍA ANTES, Y POR QUÉ ESTO EXISTE
//
// El botón «Crear con IA» del studio no llamaba a ningún modelo. El
// navegador componía el correo con `guidedCopy`, una plantilla determinista:
// asunto fijo, titular fijo —«De la posibilidad al avance»— y la primera
// receta del catálogo, que es de tecnología. Daba igual que el negocio
// fuese un estudio de tatuajes: salía un correo de tecnología firmado por
// los datos de ejemplo del renderizador.
//
// LO QUE NO HACE
//
// No inventa datos del cliente. El prompt lo prohíbe explícitamente —nada
// de cifras, premios, testimonios ni clientes— porque un correo comercial
// con un dato inventado es un problema legal, no un texto mejorable. Y
// conserva literalmente las variables {{campo.ruta}}: si las traduce o las
// reescribe, el mensaje sale con huecos sin rellenar.
//
// La clave no es un secreto de la función: sale del Vault, y desde la 047
// puede ser la del cliente. Un cliente fuera de la versión de prueba paga
// su propio texto.
//
// Desplegar: supabase functions deploy componer-campana
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";
import { anotarConsumo } from "../_shared/consumo.ts";

const MODELO = "gpt-5";

const SISTEMA = `Escribes correos comerciales entre empresas, en español de
España. Tu trabajo es redactar UNA campaña de correo a partir de un brief.

Reglas que no se negocian:
- No inventes clientes, cifras, porcentajes, premios, testimonios,
  certificaciones ni plazos. Si el brief no lo dice, no existe.
- Conserva literalmente las variables con formato {{campo.ruta}}. No las
  traduzcas ni las reescribas.
- Nada de promesas de resultados ni urgencia fabricada.
- El destinatario es una empresa, no un particular: trata de usted a la
  empresa y ve al grano.
- Español natural, frases cortas. Sin relleno de consultoría ni
  superlativos vacíos.

Devuelve ÚNICAMENTE un JSON con esta forma exacta, sin markdown:

{
  "subject": "asunto, máximo 60 caracteres",
  "preheader": "preencabezado, entre 35 y 110 caracteres",
  "eyebrow": "antetítulo corto en mayúsculas, el sector o el tipo de campaña",
  "title": "titular del correo, máximo 60 caracteres",
  "body": "uno o dos párrafos cortos, el cuerpo principal",
  "sectionTitle": "subtítulo de la sección de la oferta",
  "sectionBody": "dos o tres frases sobre la oferta concreta",
  "ctaLabel": "texto del botón, máximo 30 caracteres",
  "imagePrompt": "descripción en inglés para generar la imagen de cabecera: una escena real del negocio, sin texto superpuesto, sin logotipos, fotografía profesional"
}`;

type Brief = {
  companyName?: string;
  sector?: string;
  objective?: string;
  offer?: string;
  tone?: string;
  audience?: string;
  companyContext?: string;
  destinationUrl?: string;
  actionType?: string;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const autorizacion = req.headers.get("Authorization") ?? "";
    if (!autorizacion) return json(req, { error: "No autorizado." }, 401);

    const usuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: autorizacion } } },
    );
    const { data: auth } = await usuario.auth.getUser();
    if (!auth?.user) return json(req, { error: "No autenticado." }, 401);

    const { data: perfil } = await usuario
      .from("profiles").select("tenant_id").eq("id", auth.user.id).single();
    if (!perfil?.tenant_id) return json(req, { error: "Sin cuenta activa." }, 401);

    const brief = (await req.json()) as Brief;

    // La clave del cliente, o la del servicio si está en versión de prueba.
    // Ver 047 y 049: el aviso cambia según a quién le toque ponerla.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
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
            "administración, en Ajustes → Proveedores.",
      }, 503);
    }

    // El brief, tal y como lo escribió quien lo rellenó. Lo que no venga se
    // queda fuera: el prompt ya dice que no invente.
    const datos = {
      empresa: brief.companyName?.trim() || null,
      sector: brief.sector?.trim() || null,
      a_quien_escribimos: brief.audience?.trim() || null,
      objetivo: brief.objective?.trim() || null,
      lo_que_se_ofrece: brief.offer?.trim() || null,
      tono: brief.tone?.trim() || null,
      contexto: brief.companyContext?.trim() || null,
      accion: brief.actionType?.trim() || null,
      variables_disponibles: [
        "{{lead.first_name}}", "{{lead.company}}", "{{campaign.cta_url}}",
      ],
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${clave}`,
      },
      body: JSON.stringify({
        model: MODELO,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SISTEMA },
          { role: "user", content: JSON.stringify(datos) },
        ],
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      console.error("OpenAI rechazó la petición:", r.status, detalle.slice(0, 400));
      // El motivo real va al cliente: «error del proveedor» obliga a
      // adivinar, y este es el mensaje que acaba en la pantalla de alguien.
      let mensaje = `El proveedor del modelo rechazó la petición (HTTP ${r.status})`;
      try {
        const j = JSON.parse(detalle);
        if (j?.error?.message) mensaje += `: ${j.error.message}`;
      } catch { /* sin cuerpo legible */ }
      return json(req, { error: mensaje }, 502);
    }

    const data = await r.json();
    const texto = data?.choices?.[0]?.message?.content ?? "";

    let copy: Record<string, string>;
    try {
      copy = JSON.parse(texto);
    } catch {
      console.error("JSON no parseable:", String(texto).slice(0, 300));
      return json(req, { error: "El modelo respondió con un formato inesperado." }, 502);
    }

    // Los tokens los devuelve OpenAI; no se estiman. El coste por campaña
    // del panel se calcula con esto y la tarifa del modelo.
    await anotarConsumo(
      "componer-campana",
      MODELO,
      data?.usage
        ? {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
        }
        : undefined,
      perfil.tenant_id,
      null,
    );

    return json(req, { copy });
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error inesperado." }, 500);
  }
});
