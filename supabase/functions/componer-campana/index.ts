// ============================================================
// Edge Function · componer-campana
//
// Dos especialistas trabajando a la vez sobre el mismo encargo:
//
//   REDACTOR        escribe el correo y un repertorio de piezas
//   DIRECTOR DE ARTE elige paleta, tipografía, estructura y la escena de la
//                    imagen
//
// Van en `Promise.all` porque no dependen uno del otro: los dos parten del
// negocio, no del trabajo del otro. El tiempo total es el del más lento en
// vez de la suma — una sola llamada que lo hacía todo tardaba unos 47 s.
//
// Que el redactor escriba SIEMPRE las ventajas, se usen o no, es lo que
// permite ese paralelo: si el director pide dos columnas, el contenido ya
// está escrito y nadie ha tenido que esperar.
//
// QUÉ NO HACE NINGUNO DE LOS DOS
//
// Escribir el HTML. Eso lo monta `email-renderer.ts`, que produce tablas
// anidadas y estilos en línea que Outlook entiende, y que garantiza el pie
// con el enlace de baja. Un modelo devolvería algo distinto cada vez, el
// correo dejaría de ser editable en el studio y el cumplimiento pasaría a
// depender de que se acordara. Lo que el director sí decide es qué bloques
// lleva el correo y en qué orden.
//
// Tampoco inventan datos del cliente: ni cifras, ni premios, ni testimonios.
// Un correo comercial con un dato inventado es un problema legal, no un
// texto mejorable.
//
// La clave sale del Vault y desde la 047 puede ser la del propio cliente.
//
// Desplegar: supabase functions deploy componer-campana
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";
import { anotarConsumo } from "../_shared/consumo.ts";

const MODELO = "gpt-5";

const COMUN = `Responde ÚNICAMENTE con un JSON válido, sin markdown.
No inventes clientes, cifras, porcentajes, premios, testimonios,
certificaciones ni plazos: si el brief no lo dice, no existe.`;

const SISTEMA_REDACTOR = `Escribes correos comerciales entre empresas, en
español de España, para el negocio que te describan.

${COMUN}

- Conserva literalmente las variables con formato {{campo.ruta}}. No las
  traduzcas ni las reescribas.
- El destinatario es una empresa: trátala de usted y ve al grano.
- Frases cortas, español natural. Sin relleno de consultoría ni superlativos
  vacíos. Nada de urgencia fabricada.

Forma exacta:

{
  "subject": "asunto, máximo 60 caracteres",
  "preheader": "preencabezado, entre 35 y 110 caracteres",
  "eyebrow": "antetítulo corto: la actividad del negocio",
  "title": "titular, máximo 60 caracteres",
  "body": "una o dos frases para la portada",
  "sectionTitle": "subtítulo de la sección principal",
  "sectionBody": "dos o tres frases desarrollando lo que se ofrece",
  "ctaLabel": "texto del botón, máximo 30 caracteres",
  "ventajas": [
    { "titulo": "2 o 3 palabras", "texto": "una frase" },
    { "titulo": "2 o 3 palabras", "texto": "una frase" }
  ],
  "cierre": "una frase de despedida"
}

Las dos ventajas se escriben siempre, aunque el correo quizá no las use.`;

const SISTEMA_DIRECTOR = `Eres director de arte de correos comerciales. Te
describen un negocio y decides cómo debe verse su correo.

${COMUN}

- Los siete colores en formato #RRGGBB de seis dígitos.
- "texto" sobre "superficie" y "textoSobrePrimario" sobre "primario" tienen
  que leerse sin esfuerzo. Un correo ilegible no es una opción estética.
- La dirección tiene que ir con el negocio: un estudio de tatuajes no se
  parece a una clínica, ni una asesoría a una pastelería.
- "tipografia" es uno de los ocho valores de la lista, literal. No propongas
  nombres de fuentes.
- "estructura" son los bloques del correo en orden. Elige los que hagan falta
  —no metas todos siempre— y varía según el negocio y el mensaje.
- "imagePrompt" va en inglés y describe una escena real del negocio, sin
  texto superpuesto, sin logotipos y sin collage. Menciona dentro los colores
  dominantes, porque es la única vía por la que la paleta llega a la imagen.

Forma exacta:

{
  "paleta": {
    "fondo": "#RRGGBB", "superficie": "#RRGGBB", "texto": "#RRGGBB",
    "suave": "#RRGGBB", "primario": "#RRGGBB", "acento": "#RRGGBB",
    "textoSobrePrimario": "#RRGGBB"
  },
  "tipografia": "sans-neutra|sans-geometrica|sans-cercana|sans-legible|serif-editorial|serif-clasica|serif-lujo|mono-tecnica",
  "mayusculas": false,
  "densidad": "minima|equilibrada|editorial",
  "esquinas": "recta|suave|redonda",
  "modo": "claro|oscuro",
  "estructura": ["brand","hero","text","columns","divider","button"],
  "imagePrompt": "professional photo of …",
  "porQue": "una frase: por qué esta dirección encaja con este negocio"
}

Bloques disponibles: brand (la marca), hero (portada con imagen y titular),
heading (título de sección), text (párrafos), columns (dos ventajas),
divider (separador), spacer (aire), button (llamada a la acción). El pie
legal se añade solo: no lo incluyas.`;

type Brief = {
  companyName?: string;
  sector?: string;
  queTransmitir?: string;
  objective?: string;
  offer?: string;
  tone?: string;
  audience?: string;
  companyContext?: string;
  destinationUrl?: string;
  actionType?: string;
};

type Uso = { prompt_tokens?: number; completion_tokens?: number };

/** Una llamada al modelo que devuelve JSON, con su uso de tokens. */
async function pedirJson(
  clave: string,
  sistema: string,
  datos: unknown,
): Promise<{ objeto: Record<string, unknown> | null; uso?: Uso; error?: string }> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
    body: JSON.stringify({
      model: MODELO,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: JSON.stringify(datos) },
      ],
    }),
  });

  if (!r.ok) {
    const detalle = await r.text();
    console.error("OpenAI rechazó la petición:", r.status, detalle.slice(0, 400));
    let mensaje = `El proveedor del modelo rechazó la petición (HTTP ${r.status})`;
    try {
      const j = JSON.parse(detalle);
      if (j?.error?.message) mensaje += `: ${j.error.message}`;
    } catch { /* sin cuerpo legible */ }
    return { objeto: null, error: mensaje };
  }

  const data = await r.json();
  const texto = data?.choices?.[0]?.message?.content ?? "";
  try {
    return { objeto: JSON.parse(texto), uso: data?.usage };
  } catch {
    console.error("JSON no parseable:", String(texto).slice(0, 300));
    return { objeto: null, uso: data?.usage, error: "El modelo respondió con un formato inesperado." };
  }
}

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

    // El encargo, tal y como lo escribió quien lo rellenó. Lo que no venga se
    // queda fuera: los prompts ya prohíben inventar.
    const encargo = {
      empresa: brief.companyName?.trim() || null,
      actividad: brief.sector?.trim() || null,
      que_transmitir: brief.queTransmitir?.trim() || null,
      contexto: brief.companyContext?.trim() || null,
      objetivo: brief.objective?.trim() || null,
      lo_que_se_ofrece: brief.offer?.trim() || null,
      a_quien_escribimos: brief.audience?.trim() || null,
      tono: brief.tone?.trim() || null,
      accion: brief.actionType?.trim() || null,
      variables_disponibles: [
        "{{lead.first_name}}", "{{lead.company}}", "{{campaign.cta_url}}",
      ],
    };

    const [redactor, director] = await Promise.all([
      pedirJson(clave, SISTEMA_REDACTOR, encargo),
      pedirJson(clave, SISTEMA_DIRECTOR, encargo),
    ]);

    // Sin texto no hay correo: eso sí es un error. Sin dirección de arte se
    // puede seguir —el cliente tiene un respaldo por sector— así que se avisa
    // y se continúa.
    if (!redactor.objeto) {
      return json(req, { error: redactor.error ?? "El modelo no pudo escribir el correo." }, 502);
    }

    const tokens = (uso?: Uso) => ({
      entrada: uso?.prompt_tokens ?? 0,
      salida: uso?.completion_tokens ?? 0,
    });
    const a = tokens(redactor.uso);
    const b = tokens(director.uso);

    // Las dos llamadas van al mismo apunte: para el panel de coste por
    // campaña, componer una campaña es una operación, no dos.
    await anotarConsumo(
      "componer-campana",
      MODELO,
      { input_tokens: a.entrada + b.entrada, output_tokens: a.salida + b.salida },
      perfil.tenant_id,
      null,
    );

    return json(req, {
      copy: redactor.objeto,
      arte: director.objeto,
      avisoArte: director.objeto ? null : (director.error ?? "El director de arte no contestó."),
    });
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error inesperado." }, 500);
  }
});
