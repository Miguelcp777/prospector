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

import { anotarConsumo, type Quien } from "./consumo.ts";
import { claveAnthropic, ErrorSinClave } from "./claves.ts";

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
  // Quién paga esta llamada. La demo pública no tiene tenant y aun así
  // gasta: por eso se anota igual, con tenant nulo.
  quien?: Quien,
): Promise<Segmento[]> {
  const referencia = vertical && TAXONOMIAS[vertical]
    ? `\n\nTaxonomía de referencia para ${vertical}:\n- ${TAXONOMIAS[vertical].join("\n- ")}`
    : "";

  // La clave, antes de la llamada: si falta, el aviso tiene que decir
  // qué falta y a quién le toca ponerla. Sin esto, un cliente sin clave
  // propia recibía «Error inesperado» y no tenía nada que hacer con eso.
  let clave: string;
  try {
    clave = await claveAnthropic(quien?.tenant);
  } catch (e) {
    if (e instanceof ErrorSinClave) throw new ErrorInferencia(503, e.message);
    throw e;
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": clave,
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
    // El motivo va al mensaje, no solo al log. Un 502 a secas obliga a mirar
    // los logs del proveedor, y esos no siempre están: el día que hizo falta,
    // el API de logs de Supabase estaba caído.
    //
    // Se expone el tipo de error y el código HTTP, nunca el cuerpo entero:
    // basta para distinguir la clave, el saldo y el modelo.
    const cuerpo = await r.text();
    let tipo = "", detalle = "";
    try {
      const j = JSON.parse(cuerpo);
      tipo = j?.error?.type ?? "";
      detalle = j?.error?.message ?? "";
    } catch { /* no era JSON */ }
    console.error("Anthropic devolvió", r.status, cuerpo.slice(0, 500));
    throw new ErrorInferencia(
      502,
      `El proveedor del modelo rechazó la petición (HTTP ${r.status}` +
        `${tipo ? " · " + tipo : ""})` +
        // El mensaje del proveedor es lo único que distingue "modelo que no
        // existe" de "parámetro mal puesto". Recortado, y con las claves
        // tachadas por si algún día las cita de vuelta.
        `${detalle ? ": " + detalle.replace(/sk-ant-[\w-]+/g, "sk-ant-***").slice(0, 200) : ""}`,
    );
  }

  const data = await r.json();

  // Antes de mirar el contenido: la llamada ya está pagada aunque la
  // respuesta venga mal formada, así que se anota aquí y no al final.
  if (quien) await anotarConsumo(quien.funcion, MODELO, data.usage, quien.tenant, quien.campana);

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
