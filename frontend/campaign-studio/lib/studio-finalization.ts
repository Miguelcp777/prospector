import type { EmailBlock, TemplateDocument } from "./template-types";

export type EmailClientProfile = "original" | "gmail-dark" | "outlook-dark" | "apple-dark";
export type CampaignSegment = "header" | "hero" | "body" | "cta" | "footer";

export type AttentionHotspot = {
  blockId: string;
  label: string;
  score: number;
  x: number;
  y: number;
  radius: number;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function mobileDocument(document: TemplateDocument) {
  const next = clone(document);
  const originalOrder = new Map(next.blocks.map((block, index) => [block.id, index]));
  next.blocks = next.blocks
    .filter((block) => !block.mobile?.hidden)
    .sort((a, b) => (a.mobile?.order ?? originalOrder.get(a.id) ?? 0) - (b.mobile?.order ?? originalOrder.get(b.id) ?? 0))
    .map((block) => {
      const scale = Math.min(140, Math.max(60, block.mobile?.fontScale ?? 100)) / 100;
      const scaled = (key: string) => block.props[key] === undefined ? {} : { [key]: Math.round(Number(block.props[key]) * scale) };
      return {
        ...block,
        props: {
          ...block.props,
          ...(block.mobile?.widthPercent ? { blockWidth: block.mobile.widthPercent } : {}),
          ...(block.mobile?.imageUrl ? { imageUrl: block.mobile.imageUrl } : {}),
          ...scaled("fontSize"),
          ...scaled("titleFontSize"),
          ...scaled("bodyFontSize"),
          ...(block.type === "hero" ? { minHeight: Math.min(520, Math.max(220, Number(block.props.minHeight || 360) * .82)), paddingX: Math.min(28, Number(block.props.paddingX || 38)) } : {}),
        },
      };
    });
  next.settings.width = Math.min(420, next.settings.width);
  return next;
}

export function simulateEmailClient(document: TemplateDocument, profile: EmailClientProfile) {
  const next = clone(document);
  if (profile === "original") return next;
  const palettes = {
    "gmail-dark": { backgroundColor: "#111418", contentColor: "#1c1f24", textColor: "#f1f3f4", mutedColor: "#bdc1c6" },
    "outlook-dark": { backgroundColor: "#000000", contentColor: "#242424", textColor: "#ffffff", mutedColor: "#d0d0d0" },
    "apple-dark": { backgroundColor: "#000000", contentColor: "#1c1c1e", textColor: "#f5f5f7", mutedColor: "#aeaeb2" },
  } as const;
  Object.assign(next.settings, palettes[profile]);
  next.blocks = next.blocks.map((block) => ({
    ...block,
    props: {
      ...block.props,
      ...(block.props.backgroundColor && block.props.backgroundColor !== "transparent" ? { backgroundColor: palettes[profile].contentColor } : {}),
      ...(["brand", "heading", "artText", "text", "footer"].includes(block.type) ? { textColor: palettes[profile].textColor } : {}),
    },
  }));
  return next;
}

export function segmentForBlock(block: EmailBlock): CampaignSegment {
  if (block.type === "brand") return "header";
  if (block.type === "hero") return "hero";
  if (block.type === "button") return "cta";
  if (block.type === "footer") return "footer";
  return "body";
}

export function combineVariantDocuments(variants: TemplateDocument[], selection: Record<CampaignSegment, number>) {
  const base = clone(variants[selection.body] || variants[0]);
  const ordered: CampaignSegment[] = ["header", "hero", "body", "cta", "footer"];
  base.blocks = ordered.flatMap((segment) => {
    const source = variants[selection[segment]] || variants[0];
    return source.blocks.filter((block) => segmentForBlock(block) === segment).map((block) => clone(block));
  });
  return base;
}

export function estimateAttention(document: TemplateDocument): AttentionHotspot[] {
  const visible = document.blocks.filter((block) => !["spacer", "divider", "footer"].includes(block.type));
  const weights: Record<string, number> = { hero: 96, artText: 82, button: 92, heading: 76, image: 72, columns: 58, text: 48, brand: 42 };
  const total = Math.max(1, visible.length);
  return visible.map((block, index) => {
    const score = Math.min(100, Math.round((weights[block.type] || 45) + Math.min(8, Number(block.props.fontSize || block.props.titleFontSize || 16) / 10)));
    const align = String(block.props.align || "left");
    return {
      blockId: block.id,
      label: block.type,
      score,
      x: align === "right" ? 72 : align === "center" ? 50 : 30,
      y: Math.round(10 + index / total * 78),
      radius: Math.round(28 + score * .25),
    };
  }).sort((a, b) => b.score - a.score);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function rankMediaAssets<T extends { filename: string; altText: string; source: string; width?: number | null; height?: number | null }>(assets: T[], query: string) {
  const terms = normalize(query).split(/[^a-z0-9]+/).filter((term) => term.length > 1);
  const requestedOrientation = /horizontal|panoram/.test(normalize(query)) ? "landscape" : /vertical|retrato/.test(normalize(query)) ? "portrait" : /cuadrad/.test(normalize(query)) ? "square" : "";
  return assets.map((asset) => {
    const haystack = normalize(`${asset.filename} ${asset.altText} ${asset.source}`);
    let score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 20 : 0), 0);
    const width = Number(asset.width || 0); const height = Number(asset.height || 0);
    const orientation = width === height && width ? "square" : width > height ? "landscape" : height > width ? "portrait" : "";
    if (requestedOrientation && requestedOrientation === orientation) score += 25;
    if (!terms.length) score = 1;
    return { asset, score, orientation };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || b.asset.filename.localeCompare(a.asset.filename));
}

export type AiCostRates = { textInputPerMillion: number; textOutputPerMillion: number; imageDraft: number; image2k: number; image4k: number; currency: "USD" | "EUR" };
export const DEFAULT_AI_COST_RATES: AiCostRates = { textInputPerMillion: 0.25, textOutputPerMillion: 2, imageDraft: 0.04, image2k: 0.08, image4k: 0.16, currency: "USD" };

export function estimateAiCost(input: { resolution?: "draft" | "2k" | "4k"; inputTokens?: number; outputTokens?: number }, rates: AiCostRates = DEFAULT_AI_COST_RATES) {
  const text = (Number(input.inputTokens || 0) / 1_000_000) * rates.textInputPerMillion + (Number(input.outputTokens || 0) / 1_000_000) * rates.textOutputPerMillion;
  const image = input.resolution ? rates[input.resolution === "draft" ? "imageDraft" : input.resolution === "2k" ? "image2k" : "image4k"] : 0;
  return { amount: Number((text + image).toFixed(4)), currency: rates.currency, estimated: true };
}

export function createExperimentPlan(variantIds: string[], metric: "clicks" | "conversions" | "opens" = "clicks") {
  const count = Math.max(1, variantIds.length);
  const base = Math.floor(100 / count);
  let remainder = 100 - base * count;
  return {
    metric,
    status: "draft" as const,
    variants: variantIds.map((id) => ({ id, allocation: base + (remainder-- > 0 ? 1 : 0) })),
    winnerRule: { minimumRecipients: 100, confidence: 0.95, fallbackAfterHours: 24 },
  };
}
