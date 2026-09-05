// ============================================================
// Vestir los mensajes de una campaña con una plantilla del studio.
//
// La campaña redacta el TEXTO de cada lead —uno a uno, con Claude— y el
// studio diseña la FORMA. Esto los junta: el texto de cada mensaje entra en
// el diseño elegido y sale un HTML por lead.
//
// Se hace en el navegador y no en el servidor a propósito: usa exactamente
// `renderEmailHtml`, el mismo que dibuja la vista previa del editor. Lo que
// se ve es literalmente lo que se guarda, y no hay dos renderizadores que
// puedan separarse con el tiempo.
// ============================================================

import { supabase } from "./supabase";
import { renderEmailHtml } from "../studio/lib/email-renderer";
import type { TemplateDocument } from "../studio/lib/template-types";

/** El separador que `redaccion.ts` pone antes del pie legal. */
const SEPARADOR = "\n—\n";

export type Resultado = {
  vestidos: number;
  saltados: number;
  motivos: string[];
};

type MensajeFila = {
  id: string;
  asunto: string | null;
  cuerpo: string;
  token_baja: string;
  leads: { nombre: string; email: string | null } | null;
};

/**
 * Aplica una plantilla a todos los borradores de una campaña.
 *
 * No toca los ya enviados: lo enviado es lo que se envió, y rehacerlo
 * falsearía el registro que hay que poder enseñar ante una reclamación.
 */
export async function aplicarPlantilla(
  campanaId: string,
  plantillaId: string,
): Promise<Resultado> {
  const { data: plantilla, error: falloP } = await supabase
    .from("plantillas")
    .select("id, documento, asunto, preencabezado, version")
    .eq("id", plantillaId)
    .single();
  if (falloP || !plantilla) throw new Error(falloP?.message ?? "Plantilla no encontrada");

  const { data: mensajes, error: falloM } = await supabase
    .from("messages")
    .select("id, asunto, cuerpo, token_baja, leads!inner(nombre, email, campaign_id)")
    .eq("leads.campaign_id", campanaId)
    .eq("estado", "borrador");
  if (falloM) throw new Error(falloM.message);

  const filas = (mensajes ?? []) as unknown as MensajeFila[];
  const resultado: Resultado = { vestidos: 0, saltados: 0, motivos: [] };

  for (const m of filas) {
    try {
      const html = componer(m, plantilla.documento as TemplateDocument, plantilla.asunto);

      // La garantía, comprobada aquí y otra vez por el trigger al enviar.
      // Si el diseño no tiene pie, o alguien lo borró del bloque, el
      // mensaje se queda sin vestir en vez de salir sin enlace de baja.
      if (!html.includes(`t=${m.token_baja}`)) {
        resultado.saltados++;
        resultado.motivos.push(
          `${m.leads?.nombre ?? m.id}: la plantilla no incluye el enlace de baja`,
        );
        continue;
      }

      const { error: falloU } = await supabase
        .from("messages")
        .update({
          html,
          plantilla_id: plantilla.id,
          plantilla_version: plantilla.version,
        })
        .eq("id", m.id);
      if (falloU) throw new Error(falloU.message);

      resultado.vestidos++;
    } catch (e) {
      resultado.saltados++;
      resultado.motivos.push(
        `${m.leads?.nombre ?? m.id}: ${e instanceof Error ? e.message : "fallo al componer"}`,
      );
    }
  }

  return resultado;
}

/**
 * Mete el texto de un mensaje dentro del documento de la plantilla.
 *
 * El cuerpo se parte por el separador del pie: lo de arriba es lo que
 * escribió Claude para ese lead, y lo de abajo es el pie legal en texto
 * plano, que en HTML lo pone el bloque de pie del diseño. Meter los dos
 * duplicaría la identificación del remitente y el enlace de baja.
 */
function componer(m: MensajeFila, documento: TemplateDocument, asuntoPlantilla: string) {
  const corte = m.cuerpo.indexOf(SEPARADOR);
  const texto = (corte === -1 ? m.cuerpo : m.cuerpo.slice(0, corte)).trim();

  // El enlace de baja de ESTE mensaje. Se saca del propio cuerpo en vez de
  // recomponerlo: así no hay dos sitios que decidan cómo se forma la URL.
  const urlBaja = (m.cuerpo.match(/https?:\/\/\S*t=[A-Za-z0-9_-]+/) ?? [""])[0];

  // Copia: la plantilla es de la campaña entera y aquí se personaliza para
  // un lead. Mutar el original vestiría a todos con el texto del primero.
  const doc = structuredClone(documento);

  const bloque = doc.blocks.find((b) => b.type === "text");
  if (bloque) bloque.props.content = texto;

  return renderEmailHtml(doc, m.asunto ?? asuntoPlantilla, "", {
    "lead.company": m.leads?.nombre ?? "",
    "system.unsubscribe_url": urlBaja,
  });
}
