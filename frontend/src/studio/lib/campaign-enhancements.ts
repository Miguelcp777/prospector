import {
  createBlock,
  REQUIRED_COMPLIANCE_VARIABLES,
  type EmailBlock,
  type EmailBlockType,
  type TemplateDocument,
} from "./template-types";

export type LeadProfile = {
  id: string;
  firstName: string;
  company: string;
  sector: string;
  city: string;
  temperature: "frío" | "templado" | "caliente";
  customer: boolean;
  language: string;
  hasProduct: boolean;
};

export type ReviewIssue = {
  id: string;
  group: "Contenido" | "Enlaces" | "Accesibilidad" | "Entregabilidad" | "Móvil";
  severity: "critical" | "warning" | "passed";
  label: string;
  detail: string;
  blockId?: string;
};

export type LinkAudit = {
  id: string;
  blockId: string;
  label: string;
  url: string;
  valid: boolean;
  placeholder: boolean;
};

export type SectionCategory =
  | "Cabeceras"
  | "Héroes"
  | "Servicios"
  | "Testimonios"
  | "Galerías"
  | "Precios"
  | "CTA"
  | "Pies";
export type SectionPreset = {
  id: string;
  name: string;
  category: SectionCategory;
  tags: string[];
  blocks: EmailBlock[];
};

const SPAM_TERMS = [
  "gratis",
  "urgente",
  "compra ahora",
  "100%",
  "sin riesgo",
  "gana dinero",
  "última oportunidad",
];

function textValues(block: EmailBlock) {
  return Object.values(block.props).filter(
    (value): value is string => typeof value === "string",
  );
}

export function extractTemplateLinks(document: TemplateDocument): LinkAudit[] {
  const links: LinkAudit[] = [];
  for (const block of document.blocks) {
    for (const [key, raw] of Object.entries(block.props)) {
      if (typeof raw !== "string" || !(key === "url" || /url$/i.test(key)))
        continue;
      const url = raw.trim();
      const placeholder = /{{\s*[\w.]+\s*}}/.test(url);
      const valid = placeholder || /^(https?:\/\/|mailto:|tel:)/i.test(url);
      links.push({
        id: `${block.id}:${key}`,
        blockId: block.id,
        label: String(block.props.label || block.props.title || block.type),
        url,
        valid,
        placeholder,
      });
    }
  }
  return links;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [0, 2, 4].map((start) =>
    Number.parseInt(clean.slice(start, start + 2), 16),
  );
}

function luminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  return rgb
    .map((value) => value / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

export function contrastRatio(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function reviewCampaign(
  document: TemplateDocument,
  subject: string,
  preheader: string,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const allText = document.blocks.flatMap(textValues).join(" ");
  const wordCount = allText.trim().split(/\s+/).filter(Boolean).length;
  const unresolved = [
    ...new Set(
      [
        ...subject.matchAll(/{{\s*([^}]+)\s*}}/g),
        ...preheader.matchAll(/{{\s*([^}]+)\s*}}/g),
        ...allText.matchAll(/{{\s*([^}]+)\s*}}/g),
      ].map((match) => match[1].trim()),
    ),
  ];
  const defined = new Set(document.variables.map((variable) => variable.key));
  const unknown = unresolved.filter((key) => !defined.has(key));
  const links = extractTemplateLinks(document);
  const images = document.blocks.filter(
    (block) => block.type === "image" || block.type === "hero",
  );
  const buttons = document.blocks.filter((block) => block.type === "button");
  const spamHits = SPAM_TERMS.filter((term) =>
    `${subject} ${preheader} ${allText}`.toLowerCase().includes(term),
  );
  const hasFooter = document.blocks.some((block) => block.type === "footer");
  const footer = document.blocks.find((block) => block.type === "footer");
  const footerText = footer
    ? Object.values(footer.props)
        .filter((value) => typeof value === "string")
        .join(" ")
    : "";
  const complianceVariables = new Set(
    document.variables.map((variable) => variable.key),
  );
  const hasLegalLinks =
    /system\.unsubscribe_url/.test(footerText) &&
    /system\.preferences_url/.test(footerText) &&
    /sender\.privacy_url/.test(footerText);
  const hasIdentity = Boolean(
    footer &&
    String(footer.props.company || "").trim() &&
    String(footer.props.address || "").trim(),
  );
  const missingComplianceVariables = REQUIRED_COMPLIANCE_VARIABLES.filter(
    (key) => !complianceVariables.has(key),
  );
  const push = (
    group: ReviewIssue["group"],
    severity: ReviewIssue["severity"],
    id: string,
    label: string,
    detail: string,
    blockId?: string,
  ) => issues.push({ group, severity, id, label, detail, blockId });

  push(
    "Contenido",
    subject.trim().length >= 20 && subject.length <= 60 ? "passed" : "warning",
    "subject",
    "Asunto",
    `${subject.trim().length} caracteres; recomendado entre 20 y 60.`,
  );
  push(
    "Contenido",
    preheader.trim().length >= 35 &&
      preheader.length <= 110 &&
      preheader.trim() !== subject.trim()
      ? "passed"
      : "warning",
    "preheader",
    "Preencabezado",
    "Debe complementar el asunto y ocupar entre 35 y 110 caracteres.",
  );
  push(
    "Contenido",
    wordCount <= 420 ? "passed" : "warning",
    "density",
    "Cantidad de contenido",
    `${wordCount} palabras; conviene que la campaña sea fácil de recorrer.`,
  );
  push(
    "Contenido",
    buttons.length >= 1 && buttons.length <= 2 ? "passed" : "warning",
    "cta",
    "Jerarquía de llamadas a la acción",
    `${buttons.length} botones detectados.`,
  );
  push(
    "Enlaces",
    links.every((link) => link.valid) ? "passed" : "critical",
    "links",
    "Enlaces válidos",
    `${links.filter((link) => !link.valid).length} enlaces requieren corrección.`,
  );
  push(
    "Enlaces",
    unknown.length ? "critical" : "passed",
    "variables",
    "Variables reconocidas",
    unknown.length
      ? `No están definidas: ${unknown.join(", ")}`
      : `${unresolved.length} variables verificadas.`,
  );
  push(
    "Accesibilidad",
    images.every(
      (block) => String(block.props.imageAlt || "").trim().length >= 5,
    )
      ? "passed"
      : "critical",
    "alt",
    "Textos alternativos",
    `${images.length} imágenes comprobadas.`,
  );
  push(
    "Accesibilidad",
    contrastRatio(
      document.settings.textColor,
      document.settings.contentColor,
    ) >= 4.5
      ? "passed"
      : "critical",
    "contrast",
    "Contraste principal",
    `Relación ${contrastRatio(document.settings.textColor, document.settings.contentColor).toFixed(2)}:1.`,
  );
  push(
    "Entregabilidad",
    spamHits.length ? "warning" : "passed",
    "spam",
    "Lenguaje no agresivo",
    spamHits.length
      ? `Revisa: ${spamHits.join(", ")}.`
      : "No se detectaron expresiones de riesgo habituales.",
  );
  push(
    "Entregabilidad",
    hasFooter && hasLegalLinks ? "passed" : "critical",
    "unsubscribe",
    "Pie legal y baja",
    hasFooter && hasLegalLinks
      ? "Baja, preferencias y privacidad están preparadas."
      : "Añade un pie con baja, preferencias y política de privacidad.",
  );
  push(
    "Entregabilidad",
    hasIdentity ? "passed" : "critical",
    "sender-identity",
    "Identidad del remitente",
    hasIdentity
      ? "Razón social y dirección postal visibles."
      : "Completa la razón social y la dirección postal.",
    footer?.id,
  );
  push(
    "Entregabilidad",
    missingComplianceVariables.length ? "critical" : "passed",
    "compliance-contract",
    "Contrato con Prospector",
    missingComplianceVariables.length
      ? `Faltan: ${missingComplianceVariables.join(", ")}.`
      : "Estructura legal completa; pendiente de validar destinatarios en Prospector.",
  );
  push(
    "Móvil",
    document.settings.width >= 480 && document.settings.width <= 680
      ? "passed"
      : "warning",
    "width",
    "Ancho compatible",
    `${document.settings.width}px.`,
  );
  push(
    "Móvil",
    document.blocks.some((block) => block.mobile) ? "passed" : "warning",
    "mobile",
    "Ajustes móviles",
    document.blocks.some((block) => block.mobile)
      ? "Hay decisiones específicas para móvil."
      : "La campaña utiliza la adaptación automática.",
  );
  return issues;
}

export function mergeDataForLead(lead: LeadProfile) {
  return {
    "lead.first_name": lead.firstName,
    "lead.company": lead.company,
    "lead.segment": lead.sector,
    "lead.city": lead.city,
    "lead.temperature": lead.temperature,
    "lead.customer": lead.customer ? "sí" : "no",
    "lead.language": lead.language,
    "lead.has_product": lead.hasProduct ? "sí" : "no",
  };
}

export function matchesCondition(
  block: EmailBlock,
  data: Record<string, string | number | undefined>,
) {
  if (!block.condition?.field) return true;
  const actual = String(data[block.condition.field] ?? "").toLowerCase();
  const expected = String(block.condition.value ?? "").toLowerCase();
  if (block.condition.operator === "exists") return Boolean(actual);
  if (block.condition.operator === "contains") return actual.includes(expected);
  if (block.condition.operator === "not_equals") return actual !== expected;
  return actual === expected;
}

export function documentForLead(
  document: TemplateDocument,
  lead: LeadProfile,
  device: "desktop" | "mobile" = "desktop",
) {
  const data = mergeDataForLead(lead);
  const next = structuredClone(document);
  next.blocks = next.blocks.filter((block) => matchesCondition(block, data));
  if (device === "mobile") {
    next.blocks = next.blocks
      .filter((block) => !block.mobile?.hidden)
      .sort(
        (a, b) =>
          (a.mobile?.order ?? next.blocks.indexOf(a)) -
          (b.mobile?.order ?? next.blocks.indexOf(b)),
      )
      .map((block) => ({
        ...block,
        props: {
          ...block.props,
          ...(block.mobile?.widthPercent
            ? { blockWidth: block.mobile.widthPercent }
            : {}),
          ...(block.mobile?.imageUrl
            ? { imageUrl: block.mobile.imageUrl }
            : {}),
          ...(block.mobile?.fontScale
            ? {
                fontSize: Math.round(
                  (Number(block.props.fontSize || 16) *
                    block.mobile.fontScale) /
                    100,
                ),
              }
            : {}),
        },
      }));
  }
  return { document: next, mergeData: data };
}

const SECTION_BLUEPRINTS: Array<{
  category: SectionCategory;
  types: EmailBlockType[];
  tags: string[];
}> = [
  {
    category: "Cabeceras",
    types: ["brand", "divider"],
    tags: ["marca", "cabecera"],
  },
  {
    category: "Héroes",
    types: ["hero", "button"],
    tags: ["impacto", "imagen"],
  },
  {
    category: "Servicios",
    types: ["heading", "columns", "button"],
    tags: ["servicios", "beneficios"],
  },
  {
    category: "Testimonios",
    types: ["heading", "text"],
    tags: ["confianza", "prueba social"],
  },
  {
    category: "Galerías",
    types: ["heading", "image", "image"],
    tags: ["visual", "portfolio"],
  },
  {
    category: "Precios",
    types: ["heading", "columns", "button"],
    tags: ["precio", "oferta"],
  },
  {
    category: "CTA",
    types: ["heading", "text", "button"],
    tags: ["conversión", "acción"],
  },
  { category: "Pies", types: ["divider", "footer"], tags: ["legal", "baja"] },
];

function sectionBlocks(
  types: EmailBlockType[],
  variant: number,
  category: SectionCategory,
) {
  const palettes = ["#0b7285", "#7c3aed", "#c2410c", "#047857", "#be185d"];
  return types.map((type, index) => {
    const block = createBlock(
      type,
      `section-${category.toLowerCase()}-${variant + 1}-${index + 1}`,
    );
    block.props = {
      ...block.props,
      backgroundColor: ["heading", "text", "artText", "columns"].includes(type)
        ? "transparent"
        : index === 0 && variant % 3 === 1
          ? `${palettes[variant % palettes.length]}18`
          : "transparent",
      columnBackgroundColor:
        type === "columns" ? "transparent" : block.props.columnBackgroundColor,
      blockRadius: variant % 4 === 0 ? 22 : variant % 4 === 1 ? 8 : 0,
      edgePadding: 24 + (variant % 4) * 6,
    };
    if (type === "heading")
      block.props.text =
        variant % 2
          ? "Una solución creada para avanzar"
          : "Lo que cambia a partir de hoy";
    if (type === "text")
      block.props.content =
        variant % 2
          ? "Una experiencia concreta, humana y orientada a resultados."
          : "Convierte una posibilidad en una siguiente acción clara.";
    if (type === "button")
      block.props = {
        ...block.props,
        label: variant % 2 ? "Descubrir la propuesta" : "Quiero saber más",
        buttonColor: palettes[variant % palettes.length],
      };
    return block;
  });
}

export const SECTION_LIBRARY_200: SectionPreset[] = SECTION_BLUEPRINTS.flatMap(
  (blueprint) =>
    Array.from({ length: 25 }, (_, index) => ({
      id: `${blueprint.category.toLowerCase()}-${index + 1}`,
      name: `${blueprint.category.slice(0, -1)} ${String(index + 1).padStart(2, "0")}`,
      category: blueprint.category,
      tags: [
        ...blueprint.tags,
        index % 2 ? "editorial" : "conversión",
        index % 3 ? "claro" : "oscuro",
      ],
      blocks: sectionBlocks(blueprint.types, index, blueprint.category),
    })),
);

export function reimagineDocument(
  document: TemplateDocument,
  direction: string,
  seed = 0,
) {
  const next = structuredClone(document);
  const systems: Record<string, [string, string, string, string]> = {
    premium: ["#0a0a0b", "#171719", "#d6ad60", "#f8f2e8"],
    visual: ["#081827", "#102b42", "#20d7df", "#f4fbff"],
    minimal: ["#f2f4f7", "#ffffff", "#111827", "#111827"],
    comercial: ["#fff2e8", "#ffffff", "#e64a19", "#24140f"],
    corporativa: ["#eaf0f4", "#ffffff", "#075985", "#10202c"],
    temporada: ["#120d1d", "#211431", "#e879f9", "#fff7ff"],
  };
  const chosen = systems[direction] || systems.premium;
  Object.assign(next.settings, {
    backgroundColor: chosen[0],
    contentColor: chosen[1],
    primaryColor: chosen[2],
    accentColor: chosen[2],
    textColor: chosen[3],
    cornerRadius:
      direction === "minimal" ? 2 : direction === "premium" ? 24 : 14,
  });
  const layout = seed % 3;
  next.blocks = next.blocks.map((block, index) => ({
    ...block,
    props: {
      ...block.props,
      blockWidth: layout === 1 && index % 3 === 1 ? 86 : 100,
      blockAlign: layout === 2 ? "center" : block.props.blockAlign || "left",
      edgePadding: layout === 2 ? 26 : 40,
      blockRadius:
        layout === 0 && ["heading", "text", "columns"].includes(block.type)
          ? 18
          : 0,
      backgroundColor: "transparent",
      columnBackgroundColor:
        block.type === "columns"
          ? "transparent"
          : block.props.columnBackgroundColor,
      textAlign:
        layout === 2 && block.type !== "footer"
          ? "center"
          : block.props.textAlign || block.props.align,
    },
  }));
  return next;
}

export function imageCostEstimate(resolution: "draft" | "2k" | "4k") {
  return resolution === "draft"
    ? { units: 1, label: "Consumo bajo" }
    : resolution === "2k"
      ? { units: 2, label: "Consumo medio" }
      : { units: 4, label: "Consumo alto" };
}

export function buildEml(
  subject: string,
  html: string,
  to: string,
  from = "preview@aurevanta.local",
) {
  const boundary = `aurevanta-${Date.now().toString(36)}`;
  return [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject.replace(/[\r\n]/g, " ")}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
