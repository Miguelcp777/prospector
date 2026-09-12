import {
  REQUIRED_COMPLIANCE_VARIABLES,
  type EmailBlock,
  type TemplateDocument,
} from "./template-types";
import { matchesCondition } from "./campaign-enhancements";
import { mobileDocument } from "./studio-finalization";

export type MergeData = Record<string, string | number | undefined>;

export type QualityCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

const DEFAULT_DATA: MergeData = {
  "lead.first_name": "María",
  "lead.company": "Empresa Ejemplo",
  "lead.segment": "Servicios profesionales",
  "campaign.offer": "una auditoría inicial sin compromiso",
  "campaign.cta_url": "https://example.com/reserva",
  "sender.name": "Laura",
  "sender.company": "Aurevanta Labs",
  "sender.legal_name": "Aurevanta Labs",
  "sender.postal_address": "Valencia, España",
  "sender.privacy_url": "https://example.com/privacidad",
  "sender.privacy_email": "privacidad@example.com",
  "campaign.legal_reason":
    "Recibes esta comunicación por la relación existente con nuestra empresa.",
  "system.unsubscribe_url": "https://example.com/baja",
  "system.preferences_url": "https://example.com/preferencias",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function interpolate(value: unknown, data: MergeData) {
  return String(value ?? "").replace(/{{\s*([\w.]+)\s*}}/g, (_match, key) =>
    escapeHtml(data[key] ?? DEFAULT_DATA[key] ?? `{{${key}}}`),
  );
}

function safeColor(value: unknown, fallback: string) {
  const color = String(value ?? "");
  return /^(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\))$/.test(color)
    ? color
    : fallback;
}

function colorWithAlpha(value: unknown, alpha: number) {
  const color = safeColor(value, "#eef3f6");
  const normalized = Math.min(1, Math.max(0, alpha));
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [r, g, b] = color
      .slice(1)
      .split("")
      .map((part) => parseInt(part + part, 16));
    return `rgba(${r},${g},${b},${normalized})`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const value = parseInt(color.slice(1), 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${normalized})`;
  }
  return normalized === 1 ? color : `rgba(238,243,246,${normalized})`;
}

function safeUrl(value: unknown, data: MergeData) {
  const interpolated = String(value ?? "").replace(
    /{{\s*([\w.]+)\s*}}/g,
    (_m, key) => String(data[key] ?? DEFAULT_DATA[key] ?? "#"),
  );
  if (interpolated.startsWith("/") || interpolated.startsWith("#"))
    return escapeHtml(interpolated);
  try {
    const url = new URL(interpolated);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
      ? escapeHtml(url.toString())
      : "#";
  } catch {
    return "#";
  }
}

function cell(content: string, padding = "0 40px 24px", blockId = "") {
  const marker = blockId ? ` data-block-id="${escapeHtml(blockId)}"` : "";
  return `<tr${marker}><td style="padding:${padding};">${content}</td></tr>`;
}

function safeAlign(value: unknown) {
  return ["left", "center", "right", "justify"].includes(String(value))
    ? String(value)
    : "left";
}

function automaticLayoutScale(props: EmailBlock["props"]) {
  if (props.autoFlow === false) return 1;
  return Math.min(300, Math.max(25, Number(props.freeScale) || 100)) / 100;
}

function typeStyle(
  props: EmailBlock["props"],
  fallbackColor: string,
  defaults: { size: number; weight?: number; lineHeight?: number },
) {
  const layoutScale = automaticLayoutScale(props);
  const transform = ["none", "uppercase", "lowercase", "capitalize"].includes(
    String(props.textTransform),
  )
    ? String(props.textTransform)
    : "none";
  const depthColor = safeColor(props.textDepthColor, "#111827");
  const depth =
    props.textDepth === "soft"
      ? "0 3px 8px rgba(15,23,42,.38)"
      : props.textDepth === "extruded"
        ? `1px 1px 0 ${depthColor},2px 2px 0 ${depthColor},3px 3px 0 ${depthColor},4px 4px 0 ${depthColor},6px 8px 14px rgba(0,0,0,.28)`
        : props.textDepth === "neon"
          ? `0 0 5px ${depthColor},0 0 12px ${depthColor},0 0 22px ${depthColor}`
          : "none";
  return `font-family:${escapeHtml(props.fontFamily || "Arial, Helvetica, sans-serif")};font-size:${Math.min(216, Math.max(9, (Number(props.fontSize) || defaults.size) * layoutScale))}px;font-weight:${Math.min(900, Math.max(100, Number(props.fontWeight) || defaults.weight || 400))};line-height:${Math.min(2.4, Math.max(0.8, Number(props.lineHeight) || defaults.lineHeight || 1.4))};letter-spacing:${Math.min(36, Math.max(-6, (Number(props.letterSpacing) || 0) * layoutScale))}px;text-transform:${transform};color:${safeColor(props.textColor, fallbackColor)};text-shadow:${depth};`;
}

function blockCell(
  block: EmailBlock,
  content: string,
  defaults = { top: 0, bottom: 24 },
) {
  const props = block.props;
  const automaticFlow = props.autoFlow !== false;
  const layoutScale = automaticLayoutScale(props);
  const maximumWidth = 200;
  const width = Math.min(
    maximumWidth,
    Math.max(8, (Number(props.blockWidth) || 100) * layoutScale),
  );
  const maximumWidthStyle = width > 100 ? "none" : "100%";
  const top = Math.min(
    automaticFlow ? 40 : 100,
    Math.max(0, (Number(props.paddingTop) || defaults.top) * layoutScale),
  );
  const bottom = Math.min(
    automaticFlow ? 40 : 100,
    Math.max(0, (Number(props.paddingBottom) || defaults.bottom) * layoutScale),
  );
  const blockAlign = ["left", "center", "right"].includes(
    String(props.blockAlign),
  )
    ? String(props.blockAlign)
    : "left";
  const margin =
    blockAlign === "center"
      ? "0 auto"
      : blockAlign === "right"
        ? "0 0 0 auto"
        : "0";
  const background =
    props.backgroundColor === "transparent"
      ? "transparent"
      : safeColor(props.backgroundColor, "transparent");
  const edgeValue = Number(props.edgePadding);
  const edge = Math.min(
    automaticFlow ? 48 : 60,
    Math.max(0, (Number.isFinite(edgeValue) ? edgeValue : 40) * layoutScale),
  );
  const blockRadius = Math.min(80, Math.max(0, Number(props.blockRadius) || 0));
  const borderWidth = Math.min(8, Math.max(0, Number(props.borderWidth) || 0));
  const rotation = Math.min(12, Math.max(-12, Number(props.rotation) || 0));
  const skew = Math.min(16, Math.max(-16, Number(props.skewX) || 0));
  const depthColor = safeColor(props.blockDepthColor, "#0f172a");
  const shadow =
    props.blockDepth === "lifted"
      ? `0 8px 0 ${depthColor},0 18px 30px rgba(15,23,42,.24)`
      : props.blockDepth === "deep"
        ? `0 12px 0 ${depthColor},0 24px 42px rgba(15,23,42,.34)`
        : props.blockDepth === "floating"
          ? `0 20px 42px rgba(15,23,42,.34),inset 0 1px 0 rgba(255,255,255,.24)`
          : props.shadow === "soft"
            ? "0 12px 30px rgba(15,23,42,.14)"
            : props.shadow === "strong"
              ? "0 18px 45px rgba(15,23,42,.28)"
              : props.shadow === "glow"
                ? `0 0 30px ${safeColor(props.borderColor, "#7c3aed")}`
                : "none";
  return cell(
    `<table role="presentation" width="${width}%" align="${blockAlign}" cellspacing="0" cellpadding="0" style="width:${width}%;max-width:${maximumWidthStyle};margin:${margin};border-collapse:separate;"><tr><td style="box-sizing:border-box;padding:${top}px 0 ${bottom}px;background:${background};border:${borderWidth}px solid ${safeColor(props.borderColor, "#dbe3ea")};border-radius:${blockRadius}px;box-shadow:${shadow};transform:rotate(${rotation}deg) skewX(${skew}deg);overflow:hidden;">${content}</td></tr></table>`,
    `0 ${edge}px`,
    block.id,
  );
}

function renderBlock(
  block: EmailBlock,
  doc: TemplateDocument,
  data: MergeData,
) {
  const { props } = block;
  const primary = safeColor(doc.settings.primaryColor, "#0b7285");
  const text = safeColor(doc.settings.textColor, "#111827");
  const muted = safeColor(doc.settings.mutedColor, "#637083");
  const radius = Math.min(
    28,
    Math.max(0, Number(doc.settings.cornerRadius) || 0),
  );

  switch (block.type) {
    case "brand": {
      const logo = safeUrl(props.logoUrl, data);
      const graphic =
        logo === "#"
          ? ""
          : `<img src="${logo}" alt="${interpolate(props.label, data)}" width="${Math.min(280, Math.max(60, Number(props.logoWidth) || 160))}" style="display:inline-block;max-width:100%;height:auto;border:0;vertical-align:middle;">`;
      return blockCell(
        block,
        `<div style="${typeStyle(props, text, { size: 13, weight: 800, lineHeight: 1.2 })}text-align:${safeAlign(props.textAlign ?? props.align)};">${graphic}${graphic && props.showLabel !== true ? "" : interpolate(props.label, data)}</div>`,
        { top: 30, bottom: 24 },
      );
    }
    case "hero": {
      const image = safeUrl(props.imageUrl, data);
      const hasImage = image !== "#";
      const overlay = props.overlay !== false;
      const automaticFlow = props.autoFlow !== false;
      const layoutScale = automaticLayoutScale(props);
      const designHeight = Math.min(
        620,
        Math.max(220, Number(props.minHeight) || 360),
      );
      const baseHeight = automaticFlow
        ? Math.min(1200, Math.max(80, designHeight * layoutScale))
        : designHeight;
      const layoutNumber = (
        key: string,
        minimum: number,
        maximum: number,
        fallbackValue: number,
      ) => {
        const value = Number(props[key]);
        return Math.min(
          maximum,
          Math.max(minimum, Number.isFinite(value) ? value : fallbackValue),
        );
      };
      const canvasWidth =
        Math.min(760, Math.max(280, Number(doc.settings.width) || 640)) *
        (Math.min(
          200,
          Math.max(8, (Number(props.blockWidth) || 100) * layoutScale),
        ) /
          100);
      const textLayerBottom = (
        content: unknown,
        prefix: string,
        fallbackY: number,
        fallbackWidth: number,
        fallbackSize: number,
        lineHeight: number,
      ) => {
        const textValue = String(content ?? "").trim();
        if (!textValue) return 0;
        const widthPercent = layoutNumber(
          `${prefix}Width`,
          10,
          200,
          fallbackWidth,
        );
        const fontSize =
          layoutNumber(`${prefix}FontSize`, 8, 120, fallbackSize) *
          layoutScale;
        const availableWidth = Math.max(
          80,
          (canvasWidth * widthPercent) / 100,
        );
        const charactersPerLine = Math.max(
          7,
          Math.floor(availableWidth / Math.max(5, fontSize * 0.54)),
        );
        const lines = textValue
          .split(/\n/)
          .reduce(
            (total, line) =>
              total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
            0,
          );
        const textHeight = lines * fontSize * lineHeight;
        return (
          (layoutNumber(`${prefix}Y`, -25, 125, fallbackY) / 100) *
            baseHeight +
          textHeight / 2
        );
      };
      const occupiedBottom = Math.max(
        (layoutNumber("heroImageY", -25, 125, 50) / 100) * baseHeight +
          (layoutNumber("heroImageHeight", 10, 150, 62) / 100) *
            baseHeight /
            2,
        textLayerBottom(props.eyebrow, "eyebrow", 18, 38, 14, 1.25),
        textLayerBottom(
          props.title,
          "title",
          48,
          58,
          58,
          Math.min(2, Math.max(0.8, Number(props.lineHeight) || 1.08)),
        ),
        textLayerBottom(props.body, "body", 78, 48, 20, 1.6),
      );
      const height = automaticFlow
        ? Math.min(
            Math.max(80, 620 * layoutScale),
            Math.max(
              Math.max(80, 220 * layoutScale),
              Math.ceil(occupiedBottom + 20 * layoutScale),
            ),
          )
        : baseHeight;
      const verticalRatio = baseHeight / height;
      const paddingX = Math.min(72, Math.max(18, Number(props.paddingX) || 38));
      const align = safeAlign(props.textAlign ?? props.align);
      const vertical =
        props.verticalAlign === "top"
          ? "top"
          : props.verticalAlign === "bottom"
            ? "bottom"
            : "middle";
      const imagePosition = [
        "left",
        "center",
        "right",
        "top",
        "bottom",
      ].includes(String(props.imagePosition))
        ? String(props.imagePosition)
        : "center";
      const family = escapeHtml(props.fontFamily || doc.settings.fontFamily);
      const transform = [
        "none",
        "uppercase",
        "lowercase",
        "capitalize",
      ].includes(String(props.textTransform))
        ? String(props.textTransform)
        : "none";
      const fallback = `linear-gradient(135deg,${safeColor(props.fallbackStart, primary)},${safeColor(props.fallbackEnd, doc.settings.accentColor)})`;
      const heroBackground = hasImage
        ? `linear-gradient(90deg,rgba(4,12,22,.96),rgba(4,12,22,.32)),url('${image}')`
        : `radial-gradient(circle at 80% 18%,rgba(255,255,255,.24),transparent 25%),${fallback}`;
      const blockAlign = ["left", "center", "right"].includes(
        String(props.blockAlign),
      )
        ? String(props.blockAlign)
        : "left";
      const width = Math.min(
        200,
        Math.max(8, (Number(props.blockWidth) || 100) * layoutScale),
      );
      const maximumWidthStyle = width > 100 ? "none" : "100%";
      const edgeValue = Number(props.edgePadding);
      const edge = Math.min(
        automaticFlow ? 48 : 60,
        Math.max(0, (Number.isFinite(edgeValue) ? edgeValue : 40) * layoutScale),
      );
      const top = Math.min(
        automaticFlow ? 40 : 100,
        Math.max(0, (Number(props.paddingTop) || 0) * layoutScale),
      );
      const bottom = Math.min(
        automaticFlow ? 40 : 100,
        Math.max(0, (Number(props.paddingBottom) || 24) * layoutScale),
      );
      const margin =
        blockAlign === "center"
          ? "0 auto"
          : blockAlign === "right"
            ? "0 0 0 auto"
            : "0";
      const blockRadius = Math.min(
        80,
        Math.max(0, Number(props.blockRadius) || 0),
      );
      const borderWidth = Math.min(
        8,
        Math.max(0, Number(props.borderWidth) || 0),
      );
      const rotation = Math.min(12, Math.max(-12, Number(props.rotation) || 0));
      const skew = Math.min(16, Math.max(-16, Number(props.skewX) || 0));
      const depthColor = safeColor(props.blockDepthColor, "#0f172a");
      const shadow =
        props.blockDepth === "lifted"
          ? `0 8px 0 ${depthColor},0 18px 30px rgba(15,23,42,.24)`
          : props.blockDepth === "deep"
            ? `0 12px 0 ${depthColor},0 24px 42px rgba(15,23,42,.34)`
            : props.blockDepth === "floating"
              ? "0 20px 42px rgba(15,23,42,.34),inset 0 1px 0 rgba(255,255,255,.24)"
              : props.shadow === "soft"
                ? "0 12px 30px rgba(15,23,42,.14)"
                : props.shadow === "strong"
                  ? "0 18px 45px rgba(15,23,42,.28)"
                  : props.shadow === "glow"
                    ? `0 0 30px ${safeColor(props.borderColor, "#7c3aed")}`
                    : "none";
      const surfaceColor =
        props.backgroundColor === "transparent"
          ? "transparent"
          : safeColor(props.backgroundColor, "#071019");
      const freeMode = true;
      const layerNumber = (
        key: string,
        minimum: number,
        maximum: number,
        fallbackValue: number,
      ) => {
        const value = Number(props[key]);
        return Math.min(
          maximum,
          Math.max(minimum, Number.isFinite(value) ? value : fallbackValue),
        );
      };
      const layerStyle = (
        prefix: string,
        defaults: { x: number; y: number; width: number; z: number },
      ) =>
        `position:absolute;left:${layerNumber(`${prefix}X`, -25, 125, defaults.x)}%;top:${layerNumber(`${prefix}Y`, -25, 125, defaults.y) * verticalRatio}%;width:${layerNumber(`${prefix}Width`, 10, 200, defaults.width)}%;z-index:${layerNumber(`${prefix}Z`, 0, 20, defaults.z)};opacity:${layerNumber(`${prefix}Opacity`, 0, 100, 100) / 100};transform:translate(-50%,-50%) rotate(${layerNumber(`${prefix}Rotation`, -30, 30, 0)}deg);`;
      const imageFit = ["cover", "contain", "fill"].includes(
        String(props.heroImageFit),
      )
        ? String(props.heroImageFit)
        : "cover";
      const freeHeroContent = freeMode
        ? `<div class="hero-free-canvas" style="position:relative;width:100%;height:${height}px;overflow:${props.heroOverflow === "visible" ? "visible" : "hidden"};font-family:${family};text-transform:${transform};">${
            hasImage
              ? `<img data-hero-layer="heroImage" class="hero-free-layer hero-image-layer" src="${image}" alt="${interpolate(props.imageAlt, data)}" style="${layerStyle("heroImage", { x: 72, y: 50, width: 48, z: 2 })}height:${layerNumber("heroImageHeight", 10, 150, 62) * verticalRatio}%;object-fit:${imageFit};object-position:${imagePosition};border:0;border-radius:${Math.min(20, blockRadius)}px;">`
              : `<div data-hero-layer="heroImage" class="hero-free-layer hero-image-layer" role="img" aria-label="${interpolate(props.imageAlt, data)}" style="${layerStyle("heroImage", { x: 72, y: 50, width: 48, z: 2 })}height:${layerNumber("heroImageHeight", 10, 150, 62) * verticalRatio}%;border-radius:${Math.min(20, blockRadius)}px;background:${fallback};"></div>`
          }<div data-hero-layer="eyebrow" class="hero-free-layer hero-eyebrow-layer" style="${layerStyle("eyebrow", { x: 22, y: 18, width: 38, z: 4 })}font-size:${layerNumber("eyebrowFontSize", 8, 48, 14) * layoutScale}px;font-weight:700;line-height:1.25;letter-spacing:.17em;text-align:${safeAlign(props.eyebrowTextAlign)};color:${safeColor(props.textColor, "#ffffff")};overflow-wrap:break-word;">${interpolate(props.eyebrow, data)}</div><h1 data-hero-layer="title" class="hero-free-layer hero-title-layer" style="${layerStyle("title", { x: 32, y: 48, width: 58, z: 5 })}margin:0;font-size:${layerNumber("titleFontSize", 18, 120, 58) * layoutScale}px;line-height:${Math.min(2, Math.max(0.8, Number(props.lineHeight) || 1.08))};font-weight:${Number(props.fontWeight) || 700};letter-spacing:${(Number(props.letterSpacing) || 0) * layoutScale}px;text-align:${safeAlign(props.titleTextAlign)};color:${safeColor(props.textColor, "#ffffff")};overflow-wrap:break-word;">${interpolate(props.title, data)}</h1>${String(props.body || "").trim() ? `<p data-hero-layer="body" class="hero-free-layer hero-body-layer" style="${layerStyle("body", { x: 28, y: 78, width: 48, z: 6 })}margin:0;font-size:${layerNumber("bodyFontSize", 10, 72, 20) * layoutScale}px;line-height:1.6;text-align:${safeAlign(props.bodyTextAlign)};color:${safeColor(props.textColor, "#d8e3ec")};overflow-wrap:break-word;">${interpolate(props.body, data)}</p>` : ""}</div>`
        : "";
      const heroContent = freeMode
        ? freeHeroContent
        : `${overlay ? "" : hasImage ? `<img src="${image}" width="560" alt="${interpolate(props.imageAlt, data)}" style="display:block;width:100%;height:auto;border:0;">` : `<div style="height:${Math.round(height * 0.72)}px;background:${fallback};"></div>`}<div class="hero-copy" style="padding:34px ${paddingX}px;text-align:${align};font-family:${family};text-transform:${transform};"><div style="font-size:11px;font-weight:700;letter-spacing:.17em;color:#ffffff;margin-bottom:14px;">${interpolate(props.eyebrow, data)}</div><h1 style="margin:0 0 16px;font-size:${Math.min(120, Math.max(18, Number(props.titleFontSize) || 34))}px;line-height:${Math.min(2, Math.max(0.8, Number(props.lineHeight) || 1.08))};font-weight:${Number(props.fontWeight) || 700};letter-spacing:${Number(props.letterSpacing) || 0}px;color:${safeColor(props.textColor, "#ffffff")};">${interpolate(props.title, data)}</h1>${String(props.body || "").trim() ? `<p style="margin:${align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0"};max-width:460px;font-size:${Math.min(72, Math.max(10, Number(props.bodyFontSize) || 17))}px;line-height:1.6;color:${safeColor(props.textColor, "#d8e3ec")};">${interpolate(props.body, data)}</p>` : ""}</div>`;
      return cell(
        `<table role="presentation" width="${width}%" align="${blockAlign}" cellspacing="0" cellpadding="0" style="width:${width}%;max-width:${maximumWidthStyle};margin:${margin};border-collapse:separate;background:${surfaceColor};border:${borderWidth}px solid ${safeColor(props.borderColor, "#dbe3ea")};border-radius:${blockRadius}px;box-shadow:${shadow};transform:rotate(${rotation}deg) skewX(${skew}deg);overflow:${freeMode && props.heroOverflow === "visible" ? "visible" : "hidden"};"><tr><td valign="${vertical}" style="height:${height}px;padding:0;${!freeMode && overlay ? `background-image:${heroBackground};background-position:${imagePosition};background-size:cover;` : ""}">${heroContent}</td></tr></table>`,
        `${top}px ${edge}px ${bottom}px`,
        block.id,
      );
    }
    case "heading": {
      const size = Number(props.level) === 3 ? 22 : 28;
      return blockCell(
        block,
        `<h2 style="margin:0;${typeStyle(props, text, { size, weight: 700, lineHeight: 1.2 })}text-align:${safeAlign(props.textAlign ?? props.align)};">${interpolate(props.text, data)}</h2>`,
      );
    }
    case "artText": {
      const rotation = Math.min(12, Math.max(-12, Number(props.rotation) || 0));
      const effect = String(props.effect || "straight");
      const experimental = doc.creative?.compatibilityMode === "experimental";
      const transform = experimental ? `transform:rotate(${rotation}deg);` : "";
      const letterSpacing = effect === "outline" ? ".08em" : "-.03em";
      return blockCell(
        block,
        `<div style="margin:8px 0;text-align:${safeAlign(props.textAlign ?? props.align)};${transform}"><span style="display:inline-block;${typeStyle({ ...props, textColor: props.color }, primary, { size: 42, weight: 800, lineHeight: 1.05 })}font-style:${props.fontStyle === "italic" ? "italic" : "normal"};${props.letterSpacing === undefined ? `letter-spacing:${letterSpacing};` : ""}">${interpolate(props.text, data)}</span></div>`,
      );
    }
    case "text":
      return blockCell(
        block,
        `<p style="margin:0;${typeStyle(props, text, { size: 16, weight: 400, lineHeight: 1.72 })}text-align:${safeAlign(props.textAlign ?? props.align)};">${interpolate(props.content, data).replaceAll("\n", "<br>")}</p>`,
      );
    case "button": {
      const align = ["left", "center", "right"].includes(
        String(props.blockAlign),
      )
        ? String(props.blockAlign)
        : "left";
      const layoutScale = automaticLayoutScale(props);
      const width = Math.min(
        200,
        Math.max(8, (Number(props.blockWidth) || 40) * layoutScale),
      );
      const maximumWidthStyle = width > 100 ? "none" : "100%";
      const edgeValue = Number(props.edgePadding);
      const automaticFlow = props.autoFlow !== false;
      const edge = Math.min(
        automaticFlow ? 48 : 60,
        Math.max(0, (Number.isFinite(edgeValue) ? edgeValue : 40) * layoutScale),
      );
      const top = Math.min(
        automaticFlow ? 40 : 100,
        Math.max(0, (Number(props.paddingTop) || 0) * layoutScale),
      );
      const bottom = Math.min(
        automaticFlow ? 40 : 100,
        Math.max(0, (Number(props.paddingBottom) || 24) * layoutScale),
      );
      const margin =
        align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0";
      const radiusButton = Math.min(
        80,
        Math.max(0, Number(props.blockRadius) || 0),
      );
      const outline = props.buttonStyle === "outline";
      const ghost = props.buttonStyle === "ghost";
      const buttonColor = safeColor(props.buttonColor, primary);
      const borderWidth = outline
        ? Math.max(2, Number(props.borderWidth) || 0)
        : Math.min(8, Math.max(0, Number(props.borderWidth) || 0));
      const borderColor = outline
        ? buttonColor
        : safeColor(props.borderColor, buttonColor);
      const depthMode = String(props.buttonDepth ?? "none");
      const defaultDepthOffset = depthMode === "deep" ? 10 : 6;
      const depthOffset = Math.min(
        24,
        Math.max(0, Number(props.buttonDepthOffset) || defaultDepthOffset),
      );
      const depthBlur = Math.min(
        48,
        Math.max(0, Number(props.buttonDepthBlur) || 20),
      );
      const depthOpacity = Math.min(
        1,
        Math.max(0, Number(props.buttonDepthOpacity ?? 100) / 100),
      );
      const depthBaseColor = safeColor(props.buttonDepthColor, "#064852");
      const depthColor =
        depthOpacity === 1
          ? depthBaseColor
          : colorWithAlpha(depthBaseColor, depthOpacity);
      const buttonDepth =
        depthMode === "raised"
          ? `0 ${depthOffset}px 0 ${depthColor},0 ${Math.round(depthOffset * 2)}px ${depthBlur}px rgba(0,0,0,${Math.min(0.45, depthOpacity * 0.3)})`
          : depthMode === "deep"
            ? `0 ${depthOffset}px 0 ${depthColor},0 ${Math.round(depthOffset * 1.8)}px ${depthBlur}px rgba(0,0,0,${Math.min(0.55, depthOpacity * 0.4)})`
            : depthMode === "glass"
              ? `inset 0 1px 0 rgba(255,255,255,${Math.min(0.8, depthOpacity)}),0 ${depthOffset}px ${depthBlur}px ${colorWithAlpha(depthBaseColor, Math.min(0.65, depthOpacity * 0.45))}`
              : "none";
      const rotation = Math.min(12, Math.max(-12, Number(props.rotation) || 0));
      const skew = Math.min(16, Math.max(-16, Number(props.skewX) || 0));
      return cell(
        `<table role="presentation" width="${width}%" cellspacing="0" cellpadding="0" align="${align}" style="width:${width}%;max-width:${maximumWidthStyle};margin:${margin};border-collapse:separate;transform:rotate(${rotation}deg) skewX(${skew}deg);"><tr><td align="${safeAlign(props.textAlign || "center")}" style="border-radius:${radiusButton}px;background:${outline || ghost ? "transparent" : buttonColor};border:${borderWidth}px solid ${borderColor};box-shadow:${buttonDepth};overflow:hidden;"><a href="${safeUrl(props.url, data)}" style="display:block;padding:${props.buttonSize === "small" ? `${10 * layoutScale}px ${18 * layoutScale}px` : props.buttonSize === "large" ? `${17 * layoutScale}px ${30 * layoutScale}px` : `${14 * layoutScale}px ${24 * layoutScale}px`};${typeStyle({ ...props, textColor: props.buttonTextColor }, outline || ghost ? buttonColor : "#ffffff", { size: 15, weight: 700, lineHeight: 1.2 })}text-align:${safeAlign(props.textAlign || "center")};text-decoration:none;">${interpolate(props.label, data)}</a></td></tr></table>`,
        `${top}px ${edge}px ${bottom}px`,
        block.id,
      );
    }
    case "image": {
      const layoutScale = automaticLayoutScale(props);
      const width = Math.min(
        200,
        Math.max(30, Number(props.widthPercent) || 100),
      );
      const maximumWidthStyle = width > 100 ? "none" : "100%";
      const align = ["left", "center", "right"].includes(String(props.align))
        ? String(props.align)
        : "center";
      const margin =
        align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0";
      const image = safeUrl(props.imageUrl, data);
      const media =
        image === "#"
          ? `<div role="img" aria-label="${interpolate(props.imageAlt, data)}" style="width:${width}%;height:${220 * layoutScale}px;margin:${margin};border-radius:${radius}px;background:radial-gradient(circle at 78% 22%,rgba(255,255,255,.3),transparent 22%),linear-gradient(135deg,${safeColor(props.fallbackStart, primary)},${safeColor(props.fallbackEnd, doc.settings.accentColor)});"></div>`
          : `<img src="${image}" width="${Math.round((560 * width) / 100)}" alt="${interpolate(props.imageAlt, data)}" style="display:block;width:${width}%;max-width:${maximumWidthStyle};height:auto;margin:${margin};border:0;border-radius:${radius}px;">`;
      return blockCell(
        block,
        `${media}${props.caption ? `<p style="margin:9px 0 0;text-align:${align};${typeStyle(props, muted, { size: 12, lineHeight: 1.5 })}">${interpolate(props.caption, data)}</p>` : ""}`,
      );
    }
    case "columns": {
      const columnBackground =
        props.columnBackgroundColor === "transparent"
          ? "transparent"
          : safeColor(props.columnBackgroundColor, "transparent");
      const textAlign = safeAlign(props.textAlign ?? props.align);
      const columnOne = `<td width="${props.mobileStack === true ? "100%" : "50%"}" valign="top" style="padding:${props.mobileStack === true ? "16px 14px" : "22px 20px"};background:${columnBackground};border-radius:${props.mobileStack === true ? `${radius}px ${radius}px 0 0` : `${radius}px 0 0 ${radius}px`};font-family:${escapeHtml(props.fontFamily || doc.settings.fontFamily)};text-align:${textAlign};"><h3 style="margin:0 0 8px;${typeStyle({ ...props, fontSize: Number(props.fontSize || 14) + 4, fontWeight: 700 }, text, { size: 18, weight: 700, lineHeight: 1.3 })}">${interpolate(props.leftTitle, data)}</h3><p style="margin:0;${typeStyle(props, muted, { size: 14, lineHeight: 1.6 })}">${interpolate(props.leftText, data)}</p></td>`;
      const columnTwo = `<td width="${props.mobileStack === true ? "100%" : "48%"}" valign="top" style="padding:${props.mobileStack === true ? "16px 14px" : "22px 20px"};background:${columnBackground};border-radius:${props.mobileStack === true ? `0 0 ${radius}px ${radius}px` : `0 ${radius}px ${radius}px 0`};font-family:${escapeHtml(props.fontFamily || doc.settings.fontFamily)};text-align:${textAlign};"><h3 style="margin:0 0 8px;${typeStyle({ ...props, fontSize: Number(props.fontSize || 14) + 4, fontWeight: 700 }, text, { size: 18, weight: 700, lineHeight: 1.3 })}">${interpolate(props.rightTitle, data)}</h3><p style="margin:0;${typeStyle(props, muted, { size: 14, lineHeight: 1.6 })}">${interpolate(props.rightText, data)}</p></td>`;
      return blockCell(
        block,
        props.mobileStack === true
          ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${columnOne}</tr><tr><td aria-hidden="true" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr><tr>${columnTwo}</tr></table>`
          : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${columnOne}<td width="2%"></td>${columnTwo}</tr></table>`,
      );
    }
    case "divider":
      return blockCell(
        block,
        `<div style="height:${Math.max(1, Number(props.thickness) || 1)}px;background:${safeColor(props.color, "#dbe3ea")};font-size:0;line-height:0;">&nbsp;</div>`,
      );
    case "spacer":
      return `<tr data-block-id="${escapeHtml(block.id)}"><td aria-hidden="true" style="height:${Math.min(props.autoFlow === false ? 80 : 48, Math.max(2, (Number(props.height) || 24) * automaticLayoutScale(props)))}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    case "footer": {
      const links = [
        `<a href="${safeUrl(props.unsubscribeUrl || "{{system.unsubscribe_url}}", data)}" style="color:inherit;text-decoration:underline;">${interpolate(props.unsubscribeLabel || "Cancelar suscripción", data)}</a>`,
        `<a href="${safeUrl(props.preferencesUrl || "{{system.preferences_url}}", data)}" style="color:inherit;text-decoration:underline;">${interpolate(props.preferencesLabel || "Gestionar preferencias", data)}</a>`,
        `<a href="${safeUrl(props.privacyUrl || "{{sender.privacy_url}}", data)}" style="color:inherit;text-decoration:underline;">${interpolate(props.privacyLabel || "Política de privacidad", data)}</a>`,
      ].join(" &nbsp;·&nbsp; ");
      return blockCell(
        block,
        `<div style="padding-top:6px;border-top:1px solid #dbe3ea;text-align:${safeAlign(props.textAlign ?? props.align ?? "center")};${typeStyle(props, muted, { size: 12, lineHeight: 1.65 })}"><strong style="color:${text};">${interpolate(props.company || "{{sender.legal_name}}", data)}</strong><br>${interpolate(props.address || "{{sender.postal_address}}", data)}<br>${interpolate(props.note || "{{campaign.legal_reason}}", data)}<br>${links}</div>`,
        { top: 8, bottom: 30 },
      );
    }
    default:
      return "";
  }
}

function positionBlockRow(markup: string, block: EmailBlock) {
  const x = Math.min(800, Math.max(-800, Number(block.props.freeX) || 0));
  const y = Math.min(1200, Math.max(-1200, Number(block.props.freeY) || 0));
  const z = Math.min(100, Math.max(-50, Number(block.props.freeZ) || 0));
  const scale = Math.min(
    300,
    Math.max(25, Number(block.props.freeScale) || 100),
  );
  const automaticFlow = block.props.autoFlow !== false;
  const scaleFactor = scale / 100;
  const positioning = automaticFlow
    ? `transform:translate(${x}px,${y}px);`
    : `transform:translate(${x}px,${y}px) scale(${scaleFactor});`;
  const marker = `<tr data-block-id="${escapeHtml(block.id)}"`;
  return markup.replace(
    marker,
    `${marker} data-free-x="${x}" data-free-y="${y}" data-free-z="${z}" data-free-scale="${scale}" data-auto-flow="${automaticFlow}" style="position:relative;z-index:${z};${positioning}transform-origin:center center;"`,
  );
}

export function sanitizeImportedHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

export function renderEmailHtml(
  doc: TemplateDocument,
  subject: string,
  preheader: string,
  mergeData: MergeData = {},
) {
  const data = { ...DEFAULT_DATA, ...mergeData };
  if (doc.rawHtml) return sanitizeImportedHtml(doc.rawHtml);

  const width = Math.min(1600, Math.max(280, Number(doc.settings.width) || 640));
  const bg = safeColor(doc.settings.backgroundColor, "#eef3f6");
  const content = safeColor(doc.settings.contentColor, "#ffffff");
  const backgroundImage = safeUrl(doc.settings.backgroundImageUrl || "#", data);
  const hasBackgroundImage = backgroundImage !== "#";
  const backgroundMode =
    doc.settings.backgroundMode ?? (hasBackgroundImage ? "image" : "color");
  const usesBackgroundImage = backgroundMode === "image" && hasBackgroundImage;
  const imageOpacity =
    Math.min(
      100,
      Math.max(0, Number(doc.settings.backgroundImageOpacity ?? 100)),
    ) / 100;
  const backgroundPosition = [
    "left top",
    "center top",
    "right top",
    "left center",
    "center center",
    "right center",
    "left bottom",
    "center bottom",
    "right bottom",
  ].includes(String(doc.settings.backgroundImagePosition))
    ? String(doc.settings.backgroundImagePosition)
    : "center center";
  const backgroundSize = ["cover", "contain", "auto"].includes(
    String(doc.settings.backgroundImageSize),
  )
    ? String(doc.settings.backgroundImageSize)
    : "cover";
  const backgroundRepeat =
    doc.settings.backgroundImageRepeat === "repeat" ? "repeat" : "no-repeat";
  const canvasBackground =
    backgroundMode === "transparent"
      ? "background-color:transparent;"
      : usesBackgroundImage
        ? `background-color:${content};background-image:linear-gradient(${colorWithAlpha(content, 1 - imageOpacity)},${colorWithAlpha(content, 1 - imageOpacity)}),url('${backgroundImage}');background-position:${backgroundPosition};background-size:${backgroundSize};background-repeat:${backgroundRepeat};`
        : `background:${content};`;
  const font = escapeHtml(
    doc.settings.fontFamily || "Arial, Helvetica, sans-serif",
  );
  const rows = doc.blocks
    .filter((block) => matchesCondition(block, data))
    .map((block) => positionBlockRow(renderBlock(block, doc, data), block))
    .join("");
  const mobile = mobileDocument(doc);
  const mobileRows = mobile.blocks
    .filter((block) => matchesCondition(block, data))
    .map((block) => positionBlockRow(renderBlock(block, mobile, data), block))
    .join("");
  const canvasTable = (
    contentRows: string,
    className: string,
    maxWidth: number,
    requestedHeight: unknown,
    hidden = false,
  ) => {
    const numericHeight = Number(requestedHeight);
    const height = Number.isFinite(numericHeight)
      ? Math.min(6000, Math.max(240, Math.round(numericHeight)))
      : 0;
    const innerRows = height
      ? `<tr><td valign="top" style="padding:0;"><div class="canvas-height-viewport" style="height:${height}px;overflow:hidden;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;">${contentRows}</table></div></td></tr>`
      : contentRows;
    return `<table class="${className}" role="presentation" width="${maxWidth}" cellspacing="0" cellpadding="0"${usesBackgroundImage ? ` background="${backgroundImage}"` : ""} style="${hidden ? "display:none;mso-hide:all;" : ""}width:100%;max-width:${maxWidth}px;border-collapse:separate;${canvasBackground}border-radius:22px;overflow:hidden;box-shadow:${backgroundMode === "transparent" ? "none" : "0 18px 50px rgba(20,36,50,.10)"};">${innerRows}</table>`;
  };

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${interpolate(subject, data)}</title><style>.mobile-layout{display:none;mso-hide:all;}@media(max-width:600px){.desktop-layout{display:none!important;mso-hide:all!important}.mobile-layout{display:table!important;mso-hide:none!important;width:100%!important;border-radius:14px!important}.email-shell{padding:10px 6px!important}.hero-copy{padding:22px 14px!important}td{max-width:100%!important}img{max-width:100%;height:auto}}</style></head><body style="margin:0;padding:0;background:${bg};font-family:${font};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${interpolate(preheader, data)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${bg};"><tr><td class="email-shell" align="center" style="padding:28px 12px;">${canvasTable(rows, "desktop-layout", width, doc.settings.canvasHeight)}${canvasTable(mobileRows, "mobile-layout", mobile.settings.width, mobile.settings.canvasHeight, true)}</td></tr></table></body></html>`;
}

export function renderEmailText(
  doc: TemplateDocument,
  mergeData: MergeData = {},
) {
  const data = { ...DEFAULT_DATA, ...mergeData };
  if (doc.rawHtml) {
    return sanitizeImportedHtml(doc.rawHtml)
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return doc.blocks
    .flatMap((block) => Object.values(block.props))
    .filter((value) => typeof value === "string" && !/^https?:/i.test(value))
    .map((value) =>
      String(value).replace(/{{\s*([\w.]+)\s*}}/g, (_m, key) =>
        String(data[key] ?? key),
      ),
    )
    .join("\n\n");
}

export function analyseEmailQuality(
  doc: TemplateDocument,
  subject: string,
  preheader: string,
) {
  const buttons = doc.blocks.filter((block) => block.type === "button");
  const imageBlocks = doc.blocks.filter(
    (block) => block.type === "image" || block.type === "hero",
  );
  const footer = doc.blocks.find((block) => block.type === "footer");
  const footerText = footer
    ? Object.values(footer.props)
        .filter((value) => typeof value === "string")
        .join(" ")
    : "";
  const variableKeys = new Set(doc.variables.map((variable) => variable.key));
  const complianceVariablesReady = REQUIRED_COMPLIANCE_VARIABLES.every((key) =>
    variableKeys.has(key),
  );
  const legalIdentityReady = Boolean(
    footer &&
    String(footer.props.company || "").trim() &&
    String(footer.props.address || "").trim(),
  );
  const legalLinksReady = Boolean(
    footer &&
    /system\.unsubscribe_url/.test(footerText) &&
    /system\.preferences_url/.test(footerText) &&
    /sender\.privacy_url/.test(footerText),
  );
  const checks: QualityCheck[] = [
    {
      id: "subject",
      label: "Asunto enfocado",
      passed: subject.trim().length >= 20 && subject.length <= 60,
      detail: `${subject.trim().length}/60 caracteres`,
    },
    {
      id: "preheader",
      label: "Preheader complementario",
      passed: preheader.trim().length >= 35 && preheader.length <= 110,
      detail: `${preheader.trim().length}/110 caracteres`,
    },
    {
      id: "cta",
      label: "Una acción principal",
      passed: buttons.length === 1,
      detail: `${buttons.length} CTA detectados`,
    },
    {
      id: "alt",
      label: "Imágenes accesibles",
      passed:
        imageBlocks.length === 0 ||
        imageBlocks.every(
          (block) => String(block.props.imageAlt ?? "").trim().length > 4,
        ),
      detail: `${imageBlocks.length} imágenes revisadas`,
    },
    {
      id: "unsubscribe",
      label: "Baja, preferencias y privacidad",
      passed: legalLinksReady,
      detail: legalLinksReady
        ? "Enlaces dinámicos preparados para Prospector"
        : "El pie debe incluir baja, preferencias y privacidad",
    },
    {
      id: "sender-identity",
      label: "Identidad del remitente",
      passed: legalIdentityReady,
      detail: legalIdentityReady
        ? "Razón social y dirección visibles"
        : "Completa razón social y dirección postal",
    },
    {
      id: "compliance-variables",
      label: "Contrato legal con Prospector",
      passed: complianceVariablesReady,
      detail: complianceVariablesReady
        ? "Variables obligatorias definidas"
        : "Faltan variables de cumplimiento",
    },
    {
      id: "width",
      label: "Ancho compatible",
      passed: doc.settings.width >= 480 && doc.settings.width <= 680,
      detail: `${doc.settings.width}px`,
    },
    {
      id: "creative-compatibility",
      label: "Creatividad compatible",
      passed:
        !doc.blocks.some((block) => block.type === "artText") ||
        doc.creative?.compatibilityMode !== "experimental",
      detail: doc.blocks.some((block) => block.type === "artText")
        ? "Texto artístico con fallback seguro"
        : "Sin efectos de riesgo",
    },
  ];
  const score = Math.round(
    (checks.filter((check) => check.passed).length / checks.length) * 100,
  );
  return { score, checks };
}
