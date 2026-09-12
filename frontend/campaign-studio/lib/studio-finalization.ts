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
  const configuredWidth = Number(next.settings.width) || 640;
  const desktopWidth = Math.min(1600, Math.max(280, configuredWidth));
  const mobileWidth = Math.min(
    600,
    Math.max(
      280,
      Number(next.settings.mobileWidth) || Math.min(375, configuredWidth),
    ),
  );
  const layoutRatio = mobileWidth / desktopWidth;
  const originalOrder = new Map(
    next.blocks.map((block, index) => [block.id, index]),
  );
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, value));
  const number = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const textHeight = (
    value: unknown,
    widthPercent: number,
    fontSize: number,
    lineHeight: number,
  ) => {
    const content = String(value ?? "").trim();
    if (!content) return 0;
    const usableWidth = Math.max(120, (mobileWidth * widthPercent) / 100);
    const charactersPerLine = Math.max(
      8,
      Math.floor(usableWidth / Math.max(5, fontSize * 0.54)),
    );
    const lines = Math.max(
      1,
      content
        .split(/\n/)
        .reduce(
          (total, line) =>
            total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
          0,
        ),
    );
    return Math.ceil(lines * fontSize * lineHeight);
  };
  const responsiveHero = (
    block: EmailBlock,
    typeScale: number,
    automatic: boolean,
  ) => {
    if (!automatic) return {};
    const props = block.props;
    const eyebrowFontSize = clamp(
      Math.round(number(props.eyebrowFontSize, 14) * typeScale),
      11,
      18,
    );
    const titleFontSize = clamp(
      Math.round(number(props.titleFontSize, 58) * typeScale),
      24,
      48,
    );
    const bodyFontSize = clamp(
      Math.round(number(props.bodyFontSize, 20) * typeScale),
      15,
      22,
    );
    const eyebrowWidth = clamp(number(props.eyebrowWidth, 38), 72, 92);
    const titleWidth = clamp(number(props.titleWidth, 58), 82, 94);
    const bodyWidth = clamp(number(props.bodyWidth, 48), 82, 94);
    const initialHeight = clamp(
      Math.round(number(props.minHeight, 360) * 0.92),
      360,
      540,
    );
    const eyebrowHeight = textHeight(
      props.eyebrow,
      eyebrowWidth,
      eyebrowFontSize,
      1.25,
    );
    const titleHeight = textHeight(
      props.title,
      titleWidth,
      titleFontSize,
      clamp(number(props.lineHeight, 1.08), 1, 1.35),
    );
    const bodyHeight = textHeight(
      props.body,
      bodyWidth,
      bodyFontSize,
      1.5,
    );
    let cursor = 20;
    const place = (desiredY: number, height: number, gap: number) => {
      if (!height) return desiredY;
      const desiredTop = (desiredY / 100) * initialHeight - height / 2;
      const top = Math.max(cursor, desiredTop);
      cursor = top + height + gap;
      return top + height / 2;
    };
    const eyebrowCenter = place(number(props.eyebrowY, 18), eyebrowHeight, 12);
    const titleCenter = place(number(props.titleY, 48), titleHeight, 16);
    const bodyCenter = place(number(props.bodyY, 78), bodyHeight, 20);
    const finalHeight = clamp(Math.max(initialHeight, Math.ceil(cursor + 20)), 360, 620);
    const safeX = (value: unknown, width: number) =>
      clamp(number(value, 50), width / 2 + 3, 97 - width / 2);
    return {
      minHeight: finalHeight,
      paddingX: Math.min(18, number(props.paddingX, 38)),
      eyebrowFontSize,
      titleFontSize,
      bodyFontSize,
      eyebrowWidth,
      titleWidth,
      bodyWidth,
      eyebrowX: safeX(props.eyebrowX, eyebrowWidth),
      titleX: safeX(props.titleX, titleWidth),
      bodyX: safeX(props.bodyX, bodyWidth),
      eyebrowY: Math.round((eyebrowCenter / finalHeight) * 100),
      titleY: Math.round((titleCenter / finalHeight) * 100),
      bodyY: Math.round((bodyCenter / finalHeight) * 100),
      eyebrowZ: Math.max(4, number(props.eyebrowZ, 4)),
      titleZ: Math.max(5, number(props.titleZ, 5)),
      bodyZ: Math.max(6, number(props.bodyZ, 6)),
      heroImageWidth: clamp(number(props.heroImageWidth, 48), 35, 100),
      heroImageHeight: clamp(number(props.heroImageHeight, 62), 28, 100),
      heroImageX: clamp(number(props.heroImageX, 72), 18, 82),
      heroImageY: clamp(number(props.heroImageY, 50), 18, 82),
      heroImageZ: Math.min(2, number(props.heroImageZ, 2)),
    };
  };
  next.blocks = next.blocks
    .filter((block) => !block.mobile?.hidden)
    .sort(
      (a, b) =>
        (a.mobile?.order ?? originalOrder.get(a.id) ?? 0) -
        (b.mobile?.order ?? originalOrder.get(b.id) ?? 0),
    )
    .map((block) => {
      const automatic = block.mobile?.autoResponsive !== false;
      const automaticFontScale = automatic
        ? clamp(layoutRatio + 0.18, 0.82, 0.92)
        : 1;
      const manualFontScale =
        clamp(block.mobile?.fontScale ?? 100, 50, 140) / 100;
      const typeScale = automaticFontScale * manualFontScale;
      const minimumFont =
        block.type === "heading" || block.type === "artText"
          ? 22
          : block.type === "text" || block.type === "columns"
            ? 15
            : block.type === "button"
              ? 14
              : 12;
      const scaledFont = (key: string, minimum = minimumFont) =>
        block.props[key] === undefined
          ? {}
          : {
              [key]: Math.max(
                minimum,
                Math.round(number(block.props[key], minimum) * typeScale),
              ),
            };
      const compactSpacing = (
        key: string,
        maximum: number,
        fallback: number,
      ) =>
        automatic
          ? {
              [key]: clamp(
                Math.round(
                  number(block.props[key], fallback) * layoutRatio * 0.62,
                ),
                0,
                maximum,
              ),
            }
          : block.props[key] === undefined
            ? {}
            : { [key]: block.props[key] };
      const desktopWidthPercent = number(block.props.blockWidth, 100);
      const automaticWidth =
        block.type === "button"
          ? clamp(desktopWidthPercent, 72, 100)
          : block.type === "image"
            ? clamp(desktopWidthPercent, 88, 100)
            : clamp(desktopWidthPercent, 94, 100);
      const desktopScale = number(block.props.freeScale, 100);
      const responsiveScale = automatic
        ? clamp(desktopScale, 70, 115)
        : desktopScale;
      return {
        ...block,
        props: {
          ...block.props,
          blockWidth:
            block.mobile?.widthPercent ??
            (automatic ? automaticWidth : block.props.blockWidth),
          ...(block.mobile?.imageUrl ? { imageUrl: block.mobile.imageUrl } : {}),
          freeX:
            block.mobile?.freeX ??
            (automatic ? 0 : number(block.props.freeX, 0)),
          freeY:
            block.mobile?.freeY ??
            (automatic ? 0 : number(block.props.freeY, 0)),
          freeZ: block.mobile?.freeZ ?? block.props.freeZ ?? 0,
          freeScale: block.mobile?.freeScale ?? responsiveScale,
          ...scaledFont("fontSize"),
          ...compactSpacing("edgePadding", 14, 40),
          ...compactSpacing("paddingTop", 28, 0),
          ...compactSpacing("paddingBottom", 32, 24),
          ...compactSpacing("paddingX", 18, 38),
          ...(automatic && block.type === "image"
            ? { widthPercent: 100 }
            : {}),
          ...(automatic && block.type === "columns"
            ? { mobileStack: true }
            : {}),
          ...(automatic && block.type === "spacer"
            ? { height: clamp(Math.round(number(block.props.height, 24) * 0.6), 8, 36) }
            : {}),
          ...(automatic
            ? {
                rotation: number(block.props.rotation, 0) * 0.45,
                skewX: number(block.props.skewX, 0) * 0.45,
              }
            : {}),
          ...(block.type === "hero"
            ? responsiveHero(block, typeScale, automatic)
            : {}),
        },
      };
    });
  next.settings.width = mobileWidth;
  const desktopCanvasHeight = Number(document.settings.canvasHeight);
  const mobileCanvasHeight = Number(document.settings.mobileCanvasHeight);
  if (Number.isFinite(mobileCanvasHeight) && mobileCanvasHeight >= 240)
    next.settings.canvasHeight = Math.min(6000, mobileCanvasHeight);
  else if (Number.isFinite(desktopCanvasHeight) && desktopCanvasHeight >= 240)
    next.settings.canvasHeight = Math.min(
      6000,
      Math.max(240, Math.round(desktopCanvasHeight * layoutRatio)),
    );
  else delete next.settings.canvasHeight;
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
