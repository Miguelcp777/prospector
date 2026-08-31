// ============================================================
// Compartido · redacción del mensaje de un lead
//
// El prompt vive aquí, no dentro de la función, por lo mismo que el de
// inferencia: si se bifurca, cada campaña escribe distinto y no hay forma
// de mejorar la plantilla en un sitio.
//
// El enlace de baja NO lo escribe el modelo. No conoce el token del mensaje
// —que se genera al insertarlo— y un enlace inventado sería peor que
// ninguno. Lo añade el worker después. La base comprueba que esté antes de
// dejar marcar nada como enviado (013).
// ============================================================

import { MODELO } from "./inferencia.ts";

export type Contexto = {
  lead_nombre: string;
  lead_zona: string | null;
  lead_direccion: string | null;
  lead_resenas: number | null;
  lead_puntuacion: string | null;
  segmento_nombre: string | null;
  segmento_motivo: string | null;
  campana_descripcion: string | null;
  campana_ciudad: string;
  negocio_nombre: string;
  negocio_vertical: string;
  negocio_ciudad: string | null;
  campana_tipo: string;
  campana_tono: string;
  campana_idioma: string;
  campana_firma: string | null;
  campana_llamada: string | null;
  /** Texto de los documentos de oferta de la campaña. Puede no haber. */
  oferta: string | null;
};

const TONOS: Record<string, string> = {
  formal:  "Trato de usted, distancia profesional, sin coloquialismos.",
  cercano: "Trato de usted pero cercano y natural, como escribiría un vecino del sector.",
  directo: "Trato de usted, frases cortas, al grano desde la primera línea.",
};

const IDIOMAS: Record<string, string> = {
  es: "español de España",
  ca: "valenciano/catalán",
  en: "inglés",
};

const TIPOS: Record<string, string> = {
  prospeccion:  "Es el primer contacto: no os conocen de nada.",
  seguimiento:  "Ya hubo un contacto anterior: retomas, no te presentas desde cero.",
  reactivacion: "Fue cliente o contacto y se enfrió: el tono reconoce que ya os conocéis.",
  colaboracion: "Propones colaborar entre iguales, no vender.",
};

export type Mensaje = { asunto: string; cuerpo: string };

export class ErrorRedaccion extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
  }
}

const SISTEMA = `Escribes un correo de contacto comercial entre dos empresas.

Quien escribe es un negocio pequeño que busca colaboración o clientes. Quien
recibe es otra empresa. Escribes al buzón corporativo, no a una persona: no
uses nombres propios ni supongas quién lo va a leer.

Cómo tiene que ser:
- Breve. Cuatro o cinco frases de cuerpo, no más.
- Concreto sobre POR QUÉ le escribes a ESE negocio en particular. Usa lo que
  sepas de él. Si no sabes nada específico, dilo de forma general en vez de
  inventar un detalle.
- Una sola petición al final, y pequeña: responder, una llamada corta, una
  visita. Nunca una venta directa en el primer correo.
- Trato de usted.

Qué NO hacer:
- Nada de "espero que estés bien", "me pongo en contacto contigo para",
  "somos líderes en" ni fórmulas de plantilla.
- No exagerar ni prometer resultados. No inventar datos, cifras ni casos.
- Si te dan una oferta con condiciones concretas, puedes mencionar UNA que
  encaje con ese negocio. Nunca inventes descuentos, plazos ni condiciones
  que no estén ahí escritas: eso es un compromiso comercial en firme.
- No mencionar reseñas ni puntuaciones aunque te las den: saber eso de
  alguien a quien escribes en frío resulta invasivo.
- No incluir despedida con firma, ni enlaces, ni texto legal. Eso se añade
  después.

El asunto: sin mayúsculas de más, sin signos de exclamación, sin "urgente"
ni "oferta". Que describa el motivo real en menos de siete palabras.

Devuelve SOLO un JSON con esta forma, sin texto alrededor:
{"asunto": "...", "cuerpo": "..."}`;

export async function redactarMensaje(c: Contexto): Promise<Mensaje> {
  // Las reseñas y la puntuación se le pasan a propósito NO: el prompt dice
  // que no las use, y la forma fiable de que no las use es no dárselas.
  const contexto = [
    `QUIEN ESCRIBE: ${c.negocio_nombre}, ${c.negocio_vertical}` +
      (c.negocio_ciudad ? ` en ${c.negocio_ciudad}` : ""),
    c.campana_descripcion ? `A qué se dedica: ${c.campana_descripcion}` : "",
    "",
    `A QUIÉN ESCRIBE: ${c.lead_nombre}`,
    c.lead_direccion ? `Dirección: ${c.lead_direccion}` : "",
    c.segmento_nombre ? `Tipo de negocio: ${c.segmento_nombre}` : "",
    c.segmento_motivo ? `Por qué encaja: ${c.segmento_motivo}` : "",
    `Zona de la campaña: ${c.campana_ciudad}`,
    // La oferta va al final y con una instrucción propia: es lo único del
    // contexto que el modelo puede citar como compromiso concreto, y hay que
    // dejarle claro que no puede inventar condiciones que no estén aquí.
    c.oferta
      ? "\nLO QUE SE OFRECE (sacado de los documentos de la campaña; puedes " +
        "mencionar estas condiciones y ninguna otra):\n" + c.oferta.slice(0, 3000)
      : "",
  ].filter(Boolean).join("\n");

  const instrucciones = [
    "",
    "CÓMO ESCRIBIRLO:",
    `- Idioma: ${IDIOMAS[c.campana_idioma] ?? IDIOMAS.es}.`,
    `- Tono: ${TONOS[c.campana_tono] ?? TONOS.cercano}`,
    `- ${TIPOS[c.campana_tipo] ?? TIPOS.prospeccion}`,
    c.campana_llamada
      ? `- Lo que se pide al final, y nada más: ${c.campana_llamada}`
      : "",
  ].filter(Boolean).join("\n");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1000,
      system: SISTEMA,
      messages: [{ role: "user", content: contexto + "\n" + instrucciones }],
    }),
  });

  if (!r.ok) {
    console.error("Anthropic devolvió", r.status, (await r.text()).slice(0, 300));
    throw new ErrorRedaccion(502, "No se pudo redactar el mensaje.");
  }

  const data = await r.json();
  const texto = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  let m: Mensaje;
  try {
    m = JSON.parse(texto);
  } catch {
    console.error("JSON no parseable:", texto.slice(0, 300));
    throw new ErrorRedaccion(502, "Respuesta con formato inesperado.");
  }

  if (!m.asunto?.trim() || !m.cuerpo?.trim()) {
    throw new ErrorRedaccion(422, "El modelo devolvió un mensaje vacío.");
  }

  return { asunto: m.asunto.trim().slice(0, 200), cuerpo: m.cuerpo.trim() };
}

/**
 * El pie que convierte un texto en un correo comercial legal.
 *
 * compliance.md pide dos cosas en cada envío: identificación inequívoca del
 * remitente y un mecanismo de baja visible. Las dos van aquí, y no en el
 * prompt, porque no son cosa del estilo: son requisitos que no pueden
 * quedar a merced de lo que el modelo decida escribir ese día.
 */
export function pie(negocio: string, urlBaja: string, firma?: string | null): string {
  return [
    "",
    "—",
    firma ? `${firma}` : "",
    `${negocio}`,
    `Le escribimos porque su negocio aparece en directorios públicos de empresas del sector.`,
    `Si no desea recibir más correos nuestros, puede darse de baja aquí: ${urlBaja}`,
    // filter: sin firma no queremos una línea en blanco de más en el pie.
  ].filter((l) => l !== "").join("\n");
}
