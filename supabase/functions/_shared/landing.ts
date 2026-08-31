// ============================================================
// Compartido · texto de la landing de una campaña
//
// Mismo criterio que en la redacción de mensajes: el prompt vive aquí para
// que no se bifurque, y lo que es requisito legal no se le pide al modelo.
// El aviso de privacidad y la casilla de consentimiento los pone la página,
// no Claude.
// ============================================================

import { MODELO } from "./inferencia.ts";

export type ContextoLanding = {
  negocio_nombre: string;
  negocio_vertical: string;
  campana_ciudad: string;
  campana_descripcion: string | null;
  segmentos: { nombre: string; motivo: string | null }[];
};

export type Contenido = {
  titulo: string;
  subtitulo: string;
  propuesta: string;
  bloques: { titulo: string; texto: string }[];
  cta: string;
};

export class ErrorLanding extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
  }
}

const SISTEMA = `Escribes el texto de una página de aterrizaje para un
negocio pequeño español. La lee alguien de otra empresa que ha llegado desde
un correo o un anuncio, y que todavía no sabe si esto le interesa.

Cómo tiene que ser:
- Claro antes que ingenioso. Quien lo lee tiene treinta segundos.
- Concreto sobre qué se ofrece y a quién. Habla de los tipos de negocio que
  te den como público, no de "empresas" en abstracto.
- En segunda persona del plural o impersonal. Trato de usted.

Qué NO hacer:
- No inventes cifras, porcentajes, años de experiencia, número de clientes,
  premios ni testimonios. No tienes esos datos y no puedes suponerlos.
- Nada de "líderes del sector", "soluciones integrales", "sinergias" ni
  "transformamos tu negocio".
- No prometas resultados concretos. Puedes describir qué se hace, no qué se
  conseguirá.
- Sin signos de exclamación.

Devuelve SOLO un JSON con esta forma, sin texto alrededor:
{
  "titulo": "cinco a nueve palabras",
  "subtitulo": "una frase que concrete el titulo",
  "propuesta": "dos o tres frases explicando qué se ofrece",
  "bloques": [
    {"titulo": "tres o cuatro palabras", "texto": "dos frases"},
    {"titulo": "...", "texto": "..."},
    {"titulo": "...", "texto": "..."}
  ],
  "cta": "texto del botón, dos o tres palabras"
}`;

export async function generarLanding(c: ContextoLanding): Promise<Contenido> {
  const publico = c.segmentos.length > 0
    ? c.segmentos.map((s) => `- ${s.nombre}${s.motivo ? `: ${s.motivo}` : ""}`).join("\n")
    : "(sin segmentos definidos)";

  const contexto = [
    `NEGOCIO: ${c.negocio_nombre}`,
    `Sector: ${c.negocio_vertical}`,
    `Zona: ${c.campana_ciudad}`,
    c.campana_descripcion ? `A qué se dedica: ${c.campana_descripcion}` : "",
    "",
    "A QUIÉN VA DIRIGIDA LA PÁGINA:",
    publico,
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
      max_tokens: 1500,
      system: SISTEMA,
      messages: [{ role: "user", content: contexto }],
    }),
  });

  if (!r.ok) {
    console.error("Anthropic devolvió", r.status, (await r.text()).slice(0, 300));
    throw new ErrorLanding(502, "No se pudo generar la landing.");
  }

  const data = await r.json();
  const texto = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  let c2: Contenido;
  try {
    c2 = JSON.parse(texto);
  } catch {
    console.error("JSON no parseable:", texto.slice(0, 300));
    throw new ErrorLanding(502, "Respuesta con formato inesperado.");
  }

  if (!c2.titulo?.trim() || !c2.propuesta?.trim()) {
    throw new ErrorLanding(422, "El modelo devolvió una landing incompleta.");
  }

  c2.bloques = (c2.bloques ?? []).slice(0, 4);
  c2.cta = c2.cta?.trim() || "Hablemos";
  return c2;
}

/** Slug legible: la URL se comparte, así que no puede ser un uuid. */
export function slugificar(nombre: string): string {
  const base = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "campana";
  // Sufijo corto: dos campañas pueden llamarse igual en tenants distintos,
  // y el slug es único en toda la tabla.
  const sufijo = Math.random().toString(36).slice(2, 7);
  return `${base}-${sufijo}`;
}
