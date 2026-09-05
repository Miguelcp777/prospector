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

  // El negocio de quien envía. Va al pie legal, que exige identificación
  // inequívoca del remitente.
  const { data: perfil } = await supabase
    .from("profiles").select("tenants(nombre)").single();
  const negocio =
    (perfil as { tenants?: { nombre?: string } } | null)?.tenants?.nombre ?? "";

  const filas = (mensajes ?? []) as unknown as MensajeFila[];
  const resultado: Resultado = { vestidos: 0, saltados: 0, motivos: [] };

  for (const m of filas) {
    try {
      const html = componer(m, plantilla.documento as TemplateDocument, plantilla.asunto, negocio);

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
/**
 * Bloques que sobreviven al vestir un mensaje real.
 *
 * Una plantilla trae DISEÑO y texto de relleno. El diseño vale; el texto no
 * lo escribió nadie para este lead. Dejarlo pasar mandaría el marketing del
 * catálogo —"01 · CREA / 02 · CONVIERTE"— dentro de un correo que va de la
 * clínica de fisio a un gimnasio del barrio.
 *
 * Sobreviven los que llevan lo real (la marca, el titular, el mensaje, la
 * llamada a la acción, el pie legal) y los que no llevan texto.
 */
const BLOQUES_QUE_QUEDAN = new Set([
  "brand", "hero", "text", "button", "footer", "divider", "spacer", "image",
]);

/**
 * Datos de combinación con valores REALES.
 *
 * El renderizador, cuando una variable no viene, cae en sus datos de
 * ejemplo: `{{lead.first_name}}` se convierte en "María". Eso está bien en
 * la vista previa del editor y es inaceptable en el correo que se envía —
 * salían mensajes que empezaban "Hola María" dirigidos a una clínica
 * dental.
 *
 * Aquí se pasan todas explícitamente. Lo que no se sabe va vacío, que es
 * feo pero honesto; un nombre inventado no lo es.
 */
function datosReales(m: MensajeFila, urlBaja: string, negocio: string) {
  return {
    // No hay nombre de pila: escribimos a buzones corporativos, no a
    // personas. Ver docs/compliance.md.
    "lead.first_name": "",
    "lead.company": m.leads?.nombre ?? "",
    "lead.segment": "",
    "campaign.offer": "",
    "campaign.cta_url": "",
    "sender.name": negocio,
    "sender.company": negocio,
    "sender.legal_name": negocio,
    "sender.postal_address": "",
    "sender.privacy_url": "",
    "sender.privacy_email": "",
    "campaign.legal_reason":
      "Le escribimos porque su negocio aparece en directorios públicos de empresas del sector.",
    "system.unsubscribe_url": urlBaja,
    "system.preferences_url": urlBaja,
  };
}

function componer(
  m: MensajeFila,
  documento: TemplateDocument,
  asuntoPlantilla: string,
  negocio: string,
) {
  const corte = m.cuerpo.indexOf(SEPARADOR);
  const texto = (corte === -1 ? m.cuerpo : m.cuerpo.slice(0, corte)).trim();

  // El enlace de baja de ESTE mensaje. Se saca del propio cuerpo en vez de
  // recomponerlo: así no hay dos sitios que decidan cómo se forma la URL.
  const urlBaja = (m.cuerpo.match(/https?:\/\/\S*t=[A-Za-z0-9_-]+/) ?? [""])[0];

  // Copia: la plantilla es de la campaña entera y aquí se personaliza para
  // un lead. Mutar el original vestiría a todos con el texto del primero.
  const doc = structuredClone(documento);

  // Fuera el relleno del catálogo. Se conserva el primer bloque de texto —
  // que es donde entra el mensaje— y se quitan los demás: un segundo bloque
  // de texto siempre trae copy que no es de este lead.
  // De los tipos que llevan texto solo se queda el PRIMERO de cada uno: el
  // que se va a personalizar. Las plantillas del catálogo traen varios —la
  // que probaste tenía dos heros y dos bloques de texto— y los segundos
  // arrastran copy de muestra que nadie escribió para este lead.
  const vistos = new Set<string>();
  doc.blocks = doc.blocks.filter((b) => {
    if (!BLOQUES_QUE_QUEDAN.has(b.type)) return false;
    if (b.type === "text" || b.type === "hero") {
      if (vistos.has(b.type)) return false;
      vistos.add(b.type);
    }
    return true;
  });

  // Si la plantilla no traía bloque de texto —muchas del catálogo son solo
  // titular, columnas y botón— se crea uno. Rechazar el mensaje por eso
  // sería correcto y a la vez inútil: lo que hace falta es que quepa.
  let bloque = doc.blocks.find((b) => b.type === "text");
  if (!bloque) {
    bloque = {
      id: `texto-${crypto.randomUUID()}`,
      type: "text",
      props: { content: "", align: "left", fontSize: 15 },
    } as (typeof doc.blocks)[number];
    // Detrás del titular, que es donde va el cuerpo de una carta.
    const trasHero = doc.blocks.findIndex((b) => b.type === "hero");
    doc.blocks.splice(trasHero >= 0 ? trasHero + 1 : 1, 0, bloque);
  }
  bloque.props.content = texto;

  // El titular también, y no es un detalle. El hero es lo primero y lo más
  // grande que se ve; dejarlo con el texto genérico del catálogo daría un
  // correo que empieza hablando de nadie y solo se vuelve personal en el
  // párrafo de debajo. El asunto que escribió el modelo para este lead es
  // justo la frase que corresponde ahí.
  const hero = doc.blocks.find((b) => b.type === "hero");
  if (hero && m.asunto) {
    hero.props.title = m.asunto;
    // El antetítulo del catálogo —"INTELIGENCIA CREATIVA · CRECIMIENTO
    // REAL"— es de la plantilla, no de este correo.
    hero.props.eyebrow = "";
    // El cuerpo del hero se vacía: si no, repetiría lo que ya dice el
    // párrafo, que es el mismo texto.
    hero.props.body = "";
  }


  // La marca lleva el nombre de quien envía, no el de la plantilla. Esa
  // etiqueta venía puesta como "AUREVANTA / AI COMMAND CENTER": firmar con
  // ella un correo de la clínica de fisio es lo más grave de todo esto,
  // porque no parece un error de relleno sino una suplantación.
  const marca = doc.blocks.find((b) => b.type === "brand");
  if (marca && negocio) marca.props.label = negocio;

  // El botón de la plantilla apunta a {{campaign.cta_url}}, y hoy no hay
  // ninguna configurada. Un botón grande que no lleva a ningún sitio es
  // peor que no tenerlo: la llamada a la acción ya va escrita en el texto.
  doc.blocks = doc.blocks.filter((b) => b.type !== "button");

  // El pie de la plantilla ofrece "Política de privacidad" y "Gestionar
  // preferencias". No hay ninguna de las dos —docs/compliance.md las tiene
  // pendientes de redactar— y un enlace legal que no lleva a ningún sitio
  // es peor que no ofrecerlo: promete un derecho que no se puede ejercer.
  // La baja sí existe y se queda.
  const pie = doc.blocks.find((b) => b.type === "footer");
  if (pie) {
    pie.props.privacyLabel = "";
    pie.props.privacyUrl = "";
    pie.props.preferencesLabel = "";
    pie.props.preferencesUrl = "";
  }

  return renderEmailHtml(doc, m.asunto ?? asuntoPlantilla, "",
                         datosReales(m, urlBaja, negocio));
}
