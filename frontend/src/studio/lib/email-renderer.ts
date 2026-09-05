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

function typeStyle(
  props: EmailBlock["props"],
  fallbackColor: string,
  defaults: { size: number; weight?: number; lineHeight?: number },
) {
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
  return `font-family:${escapeHtml(props.fontFamily || "Arial, Helvetica, sans-serif")};font-size:${Math.min(72, Math.max(9, Number(props.fontSize) || defaults.size))}px;font-weight:${Math.min(900, Math.max(100, Number(props.fontWeight) || defaults.weight || 400))};line-height:${Math.min(2.4, Math.max(0.8, Number(props.lineHeight) || defaults.lineHeight || 1.4))};letter-spacing:${Math.min(12, Math.max(-2, Number(props.letterSpacing) || 0))}px;text-transform:${transform};color:${safeColor(props.textColor, fallbackColor)};text-shadow:${depth};`;
}

function blockCell(
  block: EmailBlock,
  content: string,
  defaults = { top: 0, bottom: 24 },
) {
  const props = block.props;
  const width = Math.min(100, Math.max(30, Number(props.blockWidth) || 100));
  const top = Math.min(
    100,
    Math.max(0, Number(props.paddingTop) || defaults.top),
  );
  const bottom = Math.min(
    100,
    Math.max(0, Number(props.paddingBottom) || defaults.bottom),
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
    60,
    Math.max(0, Number.isFinite(edgeValue) ? edgeValue : 40),
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
    `<table role="presentation" width="${width}%" align="${blockAlign}" cellspacing="0" cellpadding="0" style="width:${width}%;max-width:100%;margin:${margin};border-collapse:separate;"><tr><td style="box-sizing:border-box;padding:${top}px 0 ${bottom}px;background:${background};border:${borderWidth}px solid ${safeColor(props.borderColor, "#dbe3ea")};border-radius:${blockRadius}px;box-shadow:${shadow};transform:rotate(${rotation}deg) skewX(${skew}deg);overflow:hidden;">${content}</td></tr></table>`,
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
      const height = Math.min(
        620,
        Math.max(220, Number(props.minHeight) || 360),
      );
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
        100,
        Math.max(30, Number(props.blockWidth) || 100),
      );
      const edgeValue = Number(props.edgePadding);
      const edge = Math.min(
        60,
        Math.max(0, Number.isFinite(edgeValue) ? edgeValue : 40),
      );
      const top = Math.min(100, Math.max(0, Number(props.paddingTop) || 0));
      const bottom = Math.min(
        100,
        Math.max(0, Number(props.paddingBottom) || 24),
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
      return cell(
        `<table role="presentation" width="${width}%" align="${blockAlign}" cellspacing="0" cellpadding="0" style="width:${width}%;max-width:100%;margin:${margin};border-collapse:separate;background:${surfaceColor};border:${borderWidth}px solid ${safeColor(props.borderColor, "#dbe3ea")};border-radius:${blockRadius}px;box-shadow:${shadow};transform:rotate(${rotation}deg) skewX(${skew}deg);overflow:hidden;"><tr><td valign="${vertical}" style="height:${height}px;padding:0;${overlay ? `background-image:${heroBackground};background-position:${imagePosition};background-size:cover;` : ""}">${overlay ? "" : hasImage ? `<img src="${image}" width="560" alt="${interpolate(props.imageAlt, data)}" style="display:block;width:100%;height:auto;border:0;">` : `<div style="height:${Math.round(height * 0.72)}px;background:${fallback};"></div>`}<div class="hero-copy" style="padding:34px ${paddingX}px;text-align:${align};font-family:${family};text-transform:${transform};"><div style="font-size:11px;font-weight:700;letter-spacing:.17em;color:#ffffff;margin-bottom:14px;">${interpolate(props.eyebrow, data)}</div><h1 style="margin:0 0 16px;font-size:${Math.min(72, Math.max(18, Number(props.titleFontSize) || 34))}px;line-height:${Math.min(2, Math.max(0.8, Number(props.lineHeight) || 1.08))};font-weight:${Number(props.fontWeight) || 700};letter-spacing:${Number(props.letterSpacing) || 0}px;color:${safeColor(props.textColor, "#ffffff")};">${interpolate(props.title, data)}</h1>${String(props.body || "").trim() ? `<p style="margin:${align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0"};max-width:460px;font-size:${Math.min(36, Math.max(10, Number(props.bodyFontSize) || 17))}px;line-height:1.6;color:${safeColor(props.textColor, "#d8e3ec")};">${interpolate(props.body, data)}</p>` : ""}</div></td></tr></table>`,
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
      const width = Math.min(100, Math.max(20, Number(props.blockWidth) || 40));
      const edgeValue = Number(props.edgePadding);
      const edge = Math.min(
        60,
        Math.max(0, Number.isFinite(edgeValue) ? edgeValue : 40),
      );
      const top = Math.min(100, Math.max(0, Number(props.paddingTop) || 0));
      const bottom = Math.min(
        100,
        Math.max(0, Number(props.paddingBottom) || 24),
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
      const buttonDepth =
        props.buttonDepth === "raised"
          ? `0 6px 0 ${safeColor(props.buttonDepthColor, "#064852")},0 12px 20px rgba(0,0,0,.22)`
          : props.buttonDepth === "deep"
            ? `0 10px 0 ${safeColor(props.buttonDepthColor, "#064852")},0 18px 28px rgba(0,0,0,.3)`
            : props.buttonDepth === "glass"
              ? "inset 0 1px 0 rgba(255,255,255,.42),0 12px 26px rgba(15,23,42,.24)"
              : props.blockDepth === "lifted"
                ? `0 8px 0 ${safeColor(props.blockDepthColor, "#0f172a")},0 18px 30px rgba(15,23,42,.24)`
                : props.blockDepth === "deep"
                  ? `0 12px 0 ${safeColor(props.blockDepthColor, "#0f172a")},0 24px 42px rgba(15,23,42,.34)`
                  : props.shadow === "soft"
                    ? "0 12px 30px rgba(15,23,42,.14)"
                    : props.shadow === "strong"
                      ? "0 18px 45px rgba(15,23,42,.28)"
                      : "none";
      const rotation = Math.min(12, Math.max(-12, Number(props.rotation) || 0));
      const skew = Math.min(16, Math.max(-16, Number(props.skewX) || 0));
      return cell(
        `<table role="presentation" width="${width}%" cellspacing="0" cellpadding="0" align="${align}" style="width:${width}%;max-width:100%;margin:${margin};border-collapse:separate;transform:rotate(${rotation}deg) skewX(${skew}deg);"><tr><td align="${safeAlign(props.textAlign || "center")}" style="border-radius:${radiusButton}px;background:${outline || ghost ? "transparent" : buttonColor};border:${borderWidth}px solid ${borderColor};box-shadow:${buttonDepth};overflow:hidden;"><a href="${safeUrl(props.url, data)}" style="display:block;padding:${props.buttonSize === "small" ? "10px 18px" : props.buttonSize === "large" ? "17px 30px" : "14px 24px"};${typeStyle({ ...props, textColor: props.buttonTextColor }, outline || ghost ? buttonColor : "#ffffff", { size: 15, weight: 700, lineHeight: 1.2 })}text-align:${safeAlign(props.textAlign || "center")};text-decoration:none;">${interpolate(props.label, data)}</a></td></tr></table>`,
        `${top}px ${edge}px ${bottom}px`,
        block.id,
      );
    }
    case "image": {
      const width = Math.min(
        100,
        Math.max(30, Number(props.widthPercent) || 100),
      );
      const align = ["left", "center", "right"].includes(String(props.align))
        ? String(props.align)
        : "center";
      const margin =
        align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0";
      const image = safeUrl(props.imageUrl, data);
      const media =
        image === "#"
          ? `<div role="img" aria-label="${interpolate(props.imageAlt, data)}" style="width:${width}%;height:220px;margin:${margin};border-radius:${radius}px;background:radial-gradient(circle at 78% 22%,rgba(255,255,255,.3),transparent 22%),linear-gradient(135deg,${safeColor(props.fallbackStart, primary)},${safeColor(props.fallbackEnd, doc.settings.accentColor)});"></div>`
          : `<img src="${image}" width="${Math.round((560 * width) / 100)}" alt="${interpolate(props.imageAlt, data)}" style="display:block;width:${width}%;height:auto;margin:${margin};border:0;border-radius:${radius}px;">`;
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
      return blockCell(
        block,
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="50%" valign="top" style="padding:22px 20px;background:${columnBackground};border-radius:${radius}px 0 0 ${radius}px;font-family:${escapeHtml(props.fontFamily || doc.settings.fontFamily)};text-align:${textAlign};"><h3 style="margin:0 0 8px;${typeStyle({ ...props, fontSize: Number(props.fontSize || 14) + 4, fontWeight: 700 }, text, { size: 18, weight: 700, lineHeight: 1.3 })}">${interpolate(props.leftTitle, data)}</h3><p style="margin:0;${typeStyle(props, muted, { size: 14, lineHeight: 1.6 })}">${interpolate(props.leftText, data)}</p></td><td width="2%"></td><td width="48%" valign="top" style="padding:22px 20px;background:${columnBackground};border-radius:0 ${radius}px ${radius}px 0;font-family:${escapeHtml(props.fontFamily || doc.settings.fontFamily)};text-align:${textAlign};"><h3 style="margin:0 0 8px;${typeStyle({ ...props, fontSize: Number(props.fontSize || 14) + 4, fontWeight: 700 }, text, { size: 18, weight: 700, lineHeight: 1.3 })}">${interpolate(props.rightTitle, data)}</h3><p style="margin:0;${typeStyle(props, muted, { size: 14, lineHeight: 1.6 })}">${interpolate(props.rightText, data)}</p></td></tr></table>`,
      );
    }
    case "divider":
      return blockCell(
        block,
        `<div style="height:${Math.max(1, Number(props.thickness) || 1)}px;background:${safeColor(props.color, "#dbe3ea")};font-size:0;line-height:0;">&nbsp;</div>`,
      );
    case "spacer":
      return `<tr data-block-id="${escapeHtml(block.id)}"><td aria-hidden="true" style="height:${Math.min(80, Math.max(8, Number(props.height) || 24))}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
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

  const width = Math.min(760, Math.max(480, Number(doc.settings.width) || 640));
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
    .map((block) => renderBlock(block, doc, data))
    .join("");
  const hasMobileOverrides = doc.blocks.some(
    (block) => block.mobile && Object.keys(block.mobile).length > 0,
  );
  const mobile = hasMobileOverrides ? mobileDocument(doc) : null;
  const mobileRows = mobile
    ? mobile.blocks
        .filter((block) => matchesCondition(block, data))
        .map((block) => renderBlock(block, mobile, data))
        .join("")
    : "";
  const canvasTable = (
    contentRows: string,
    className: string,
    maxWidth: number,
    hidden = false,
  ) =>
    `<table class="${className}" role="presentation" width="${maxWidth}" cellspacing="0" cellpadding="0"${usesBackgroundImage ? ` background="${backgroundImage}"` : ""} style="${hidden ? "display:none;mso-hide:all;" : ""}width:100%;max-width:${maxWidth}px;border-collapse:separate;${canvasBackground}border-radius:22px;overflow:hidden;box-shadow:${backgroundMode === "transparent" ? "none" : "0 18px 50px rgba(20,36,50,.10)"};">${contentRows}</table>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${interpolate(subject, data)}</title><style>.mobile-layout{display:none;mso-hide:all;}@media(max-width:600px){.hero-copy{padding:28px 22px!important}.hero-copy h1{font-size:28px!important}.hero-copy p{font-size:16px!important}td{max-width:100%!important}${hasMobileOverrides ? ".desktop-layout{display:none!important;mso-hide:all!important}.mobile-layout{display:table!important;mso-hide:none!important;width:100%!important}" : ""}}</style></head><body style="margin:0;padding:0;background:${bg};font-family:${font};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${interpolate(preheader, data)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${bg};"><tr><td align="center" style="padding:28px 12px;">${canvasTable(rows, "desktop-layout", width)}${mobile ? canvasTable(mobileRows, "mobile-layout", Math.min(420, width), true) : ""}</td></tr></table></body></html>`;
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
