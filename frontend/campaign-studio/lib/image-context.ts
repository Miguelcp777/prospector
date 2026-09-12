export type ImagePlacement =
  | "hero"
  | "canvas-background"
  | "image-block"
  | "custom-asset";

type ContextBlock = {
  type?: string;
  props?: Record<string, string | number | boolean>;
};

export type VisualContextSource = {
  target: "block" | "background";
  brandName?: string;
  brandContext?: string;
  imageGuidance?: string;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  campaignName?: string;
  subject?: string;
  preheader?: string;
  companyName?: string;
  sector?: string;
  companyContext?: string;
  objective?: string;
  offer?: string;
  audience?: string;
  destinationUrl?: string;
  block?: ContextBlock;
  previousBlock?: ContextBlock;
  nextBlock?: ContextBlock;
  canvasWidth?: number;
  canvasHeight?: number;
};

export type VisualGenerationContext = {
  placement: ImagePlacement;
  brandContext: string;
  screenContext: string;
  automaticContext?: boolean;
};

function clean(value: unknown, limit = 320) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function blockSummary(block?: ContextBlock) {
  if (!block) return "";
  const props = block.props ?? {};
  const content = [
    props.eyebrow,
    props.title,
    props.heading,
    props.text,
    props.body,
    props.label,
    props.buttonText,
    props.caption,
  ]
    .map((value) => clean(value, 180))
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  return [clean(block.type, 40), content].filter(Boolean).join(": ");
}

export function detectVisualContext(
  source: VisualContextSource,
): VisualGenerationContext {
  const placement: ImagePlacement =
    source.target === "background"
      ? "canvas-background"
      : source.block?.type === "hero"
        ? "hero"
        : source.block?.type === "image"
          ? "image-block"
          : "custom-asset";

  const brandContext = [
    source.brandName && `Marca: ${clean(source.brandName, 120)}`,
    source.brandContext && `Esencia y negocio: ${clean(source.brandContext, 700)}`,
    source.imageGuidance &&
      `Dirección visual propia: ${clean(source.imageGuidance, 700)}`,
    [source.primaryColor, source.accentColor, source.backgroundColor].some(Boolean) &&
      `Colores de referencia: ${[source.primaryColor, source.accentColor, source.backgroundColor]
        .map((value) => clean(value, 20))
        .filter(Boolean)
        .join(", ")}`,
  ]
    .filter(Boolean)
    .join(". ");

  const currentBlock = blockSummary(source.block);
  const neighboringBlocks = [
    blockSummary(source.previousBlock),
    blockSummary(source.nextBlock),
  ]
    .filter(Boolean)
    .join(" | ");
  const screenContext = [
    source.campaignName && `Campaña: ${clean(source.campaignName, 180)}`,
    source.subject && `Asunto: ${clean(source.subject, 240)}`,
    source.preheader && `Preheader: ${clean(source.preheader, 240)}`,
    source.companyName && `Empresa: ${clean(source.companyName, 140)}`,
    source.sector && `Sector: ${clean(source.sector, 160)}`,
    source.companyContext &&
      `Contexto comercial: ${clean(source.companyContext, 600)}`,
    source.objective && `Objetivo: ${clean(source.objective, 240)}`,
    source.offer && `Oferta: ${clean(source.offer, 300)}`,
    source.audience && `Público: ${clean(source.audience, 300)}`,
    currentBlock && `Bloque de destino: ${currentBlock}`,
    neighboringBlocks && `Bloques cercanos: ${neighboringBlocks}`,
    source.canvasWidth && source.canvasHeight &&
      `Maqueta: ${Math.round(source.canvasWidth)} × ${Math.round(source.canvasHeight)} px`,
    source.destinationUrl &&
      `Destino de la campaña: ${clean(source.destinationUrl, 400)}`,
  ]
    .filter(Boolean)
    .join(". ");

  return { placement, brandContext, screenContext, automaticContext: true };
}

const PLACEMENT_DIRECTION: Record<ImagePlacement, string> = {
  hero: "Actuará como imagen principal de un hero de email: crea un foco claro y deja espacio negativo útil para el titular y el CTA HTML, sin incrustar la interfaz.",
  "canvas-background": "Actuará como fondo de toda la maqueta: usa detalle contenido, contraste moderado y zonas tranquilas bajo el texto para conservar legibilidad en todos los bloques.",
  "image-block": "Actuará como bloque de imagen dentro del email: crea una escena autónoma que continúe el ritmo narrativo de los bloques cercanos.",
  "custom-asset": "Actuará como recurso visual adaptable dentro de la campaña: mantén una composición flexible y coherente con el resto de la pantalla.",
};

export function composeVisualGenerationPrompt(
  basePrompt: string,
  context: VisualGenerationContext,
) {
  const base = clean(basePrompt, 1800);
  const brand = clean(context.brandContext, 1600);
  const screen = clean(context.screenContext, 1800);
  return [
    base,
    `Uso previsto: ${PLACEMENT_DIRECTION[context.placement]}`,
    brand && `Identidad de marca que debe guiar la imagen: ${brand}`,
    screen && `Contexto de la pantalla donde aparecerá: ${screen}`,
    "Haz que la escena, objetos, entorno, personas y lenguaje visual sean específicos de este negocio, mensaje y posición. Mantén coherencia cromática sin forzar todos los colores. No inventes logotipos, marcas, productos ni afirmaciones que no aparezcan en el contexto.",
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 5200);
}
