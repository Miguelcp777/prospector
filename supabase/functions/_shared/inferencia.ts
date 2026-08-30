// ============================================================
// Compartido · el cerebro de inferencia
//
// Lo usan dos funciones con permisos muy distintos:
//   infer-segments  → autenticada, persiste en la campaña del tenant
//   demo-inferir    → pública y con cuota, no toca datos de nadie
//
// El prompt vive aquí para que no se bifurque: si la demo enseña unos
// segmentos y el producto devuelve otros, la demo deja de demostrar nada.
// ============================================================

export const MODELO = "claude-sonnet-5";

export type Segmento = {
  slug: string;
  nombre: string;
  motivo: string;
  prioridad: "alta" | "media" | "baja";
  queries: string[];
};

// Taxonomías curadas: anclan al modelo para que no invente segmentos
// irrelevantes. Al añadir verticales, ampliar este mapa.
export const TAXONOMIAS: Record<string, string[]> = {
  fisioterapia: [
    "clubes deportivos federados",
    "gimnasios y centros fitness",
    "clínicas derivadoras (traumatología, podología)",
    "residencias y centros de día",
    "asociaciones deportivas",
    "empresas con plan de bienestar",
    "centros educativos con deporte escolar",
  ],
};

const SISTEMA =
  `Eres un analista comercial que identifica segmentos de cliente potencial para pequeñas empresas en España.

Dado un negocio, devuelves los TIPOS DE ORGANIZACIÓN que deberían ser sus clientes: no personas sueltas, sino entidades localizables en un directorio de negocios.

Reglas:
- Entre 5 y 8 segmentos, ordenados por potencial comercial real.
- Cada segmento debe ser buscable geográficamente. "Gente con dolor de espalda" no vale; "gimnasios" sí.
- El motivo explica la relación comercial concreta, no una generalidad.
- Las queries son términos de búsqueda en español tal y como aparecerían en un directorio.
- Si te doy una taxonomía de referencia, úsala como base y añade solo lo que aporte.

Respondes ÚNICAMENTE con JSON válido, sin markdown, sin explicación previa:
{"segmentos":[{"slug":"","nombre":"","motivo":"","prioridad":"alta|media|baja","queries":[""]}]}`;

export class ErrorInferencia extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
  }
}

/**
 * Llama a Claude y devuelve los segmentos ya validados.
 * Lanza ErrorInferencia con el código HTTP que debe ver el cliente.
 */
export async function inferirSegmentos(
  descripcion: string,
  vertical?: string,
  ciudad?: string,
): Promise<Segmento[]> {
  const referencia = vertical && TAXONOMIAS[vertical]
    ? `\n\nTaxonomía de referencia para ${vertical}:\n- ${TAXONOMIAS[vertical].join("\n- ")}`
    : "";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 2000,
      system: SISTEMA,
      messages: [{
        role: "user",
        content: `Negocio: ${descripcion}\nZona: ${ciudad ?? "España"}${referencia}`,
      }],
    }),
  });

  if (!r.ok) {
    console.error("Anthropic devolvió", r.status, await r.text());
    throw new ErrorInferencia(502, "No se pudo completar la inferencia. Inténtalo de nuevo.");
  }

  const data = await r.json();
  const texto = data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  let segmentos: unknown;
  try {
    segmentos = JSON.parse(texto).segmentos;
  } catch {
    console.error("JSON no parseable:", texto.slice(0, 500));
    throw new ErrorInferencia(502, "Respuesta con formato inesperado. Inténtalo de nuevo.");
  }

  if (!Array.isArray(segmentos) || segmentos.length === 0) {
    throw new ErrorInferencia(422, "No se encontraron segmentos para este negocio.");
  }

  return segmentos.map(normalizar).filter((s) => s.slug && s.nombre);
}

/** El modelo casi siempre acierta el formato. "Casi" no basta para escribir en la base. */
function normalizar(s: Record<string, unknown>): Segmento {
  const prioridad = String(s.prioridad ?? "media");
  return {
    slug: String(s.slug ?? "").trim().slice(0, 60),
    nombre: String(s.nombre ?? "").trim().slice(0, 120),
    motivo: String(s.motivo ?? "").trim().slice(0, 400),
    prioridad: ["alta", "media", "baja"].includes(prioridad)
      ? prioridad as Segmento["prioridad"]
      : "media",
    queries: Array.isArray(s.queries)
      ? s.queries.map((q: unknown) => String(q).trim()).filter(Boolean).slice(0, 8)
      : [],
  };
}

export function validarDescripcion(descripcion: unknown): string | null {
  if (typeof descripcion !== "string" || descripcion.trim().length < 20) {
    return "Describe el negocio con algo más de detalle.";
  }
  if (descripcion.length > 2000) {
    return "La descripción es demasiado larga.";
  }
  return null;
}
