// ============================================================
// Compartido · generar el correo a partir del brief
//
// Sale de la ruta `/api/generate` del proyecto Next, quitándole el
// servidor. Aquí no hace falta ninguno: `guidedCopy` escribe el texto de
// forma determinista y `buildProductionDocument` monta el documento desde
// el catálogo. La IA del original solo SUSTITUÍA el texto cuando había
// clave; el resto siempre fue local.
//
// Eso significa que "Crear con IA" funciona sin ninguna clave, al instante
// y gratis. Con clave, el texto lo mejora Claude — ver `mejorarCopy`.
// ============================================================

import { createBlankDocument } from "@studio/lib/template-types";
import {
  buildProductionDocument,
  catalogItem,
  DESIGN_PRESETS_100,
  FONT_CATALOG_100,
  TEMPLATE_RECIPES_100,
} from "@studio/lib/production-catalog";

export type Brief = {
  campaignName?: string;
  sector?: string;
  objective?: string;
  offer?: string;
  tone?: string;
  audience?: string;
  companyName?: string;
  companyContext?: string;
  proofPoints?: string[];
  stylePreset?: string;
  templatePresetId?: string;
  designPresetId?: string;
  fontPresetId?: string;
  imageRecipeId?: string;
  intensity?: number;
  contentDensity?: "minimal" | "balanced" | "editorial";
  colorMode?: "light" | "dark" | "adaptive";
  compatibilityMode?: "compatible" | "hybrid" | "experimental";
  typographyStyle?: string;
  imageStyle?: string;
  variantCount?: number;
  destinationUrl?: string;
  actionType?: string;
  landingContext?: string;
  imagePrompt?: string;
  generateImage?: boolean;
  heroTextAmount?: "none" | "minimal" | "balanced";
  backgroundMood?: "brand" | "light" | "dark" | "contrast";
  layoutStyle?: "full" | "cards" | "editorial" | "dynamic";
  cornerStyle?: "sharp" | "soft" | "round";
  fontMood?: "corporate" | "editorial" | "friendly" | "impact";
};

const STYLE_SYSTEMS: Record<
  string,
  {
    primary: string;
    accent: string;
    background: string;
    content: string;
    text: string;
    font: string;
  }
> = {
  executive: {
    primary: "#0b7285",
    accent: "#7c3aed",
    background: "#eef3f6",
    content: "#ffffff",
    text: "#111827",
    font: "Arial, Helvetica, sans-serif",
  },
  premium: {
    primary: "#b88a44",
    accent: "#f0d7a0",
    background: "#11100f",
    content: "#1b1917",
    text: "#f7f0e5",
    font: "Georgia, Times, serif",
  },
  bold: {
    primary: "#ff3d71",
    accent: "#6c4cff",
    background: "#f2f0ff",
    content: "#ffffff",
    text: "#171329",
    font: "Arial, Helvetica, sans-serif",
  },
  cartoon: {
    primary: "#6c4cff",
    accent: "#ffbd2e",
    background: "#eaf7ff",
    content: "#ffffff",
    text: "#24224a",
    font: "Verdana, Geneva, sans-serif",
  },
  kids: {
    primary: "#ff5d8f",
    accent: "#28c7d9",
    background: "#fff3d9",
    content: "#ffffff",
    text: "#34305a",
    font: "Verdana, Geneva, sans-serif",
  },
  organic: {
    primary: "#4f7c5a",
    accent: "#d39b5f",
    background: "#f2eee5",
    content: "#fffdf8",
    text: "#28352c",
    font: "Georgia, Times, serif",
  },
  tech: {
    primary: "#12c9d8",
    accent: "#8b5cf6",
    background: "#071019",
    content: "#0e1d29",
    text: "#edfafd",
    font: "Arial, Helvetica, sans-serif",
  },
  editorial: {
    primary: "#b42318",
    accent: "#111827",
    background: "#f4f1eb",
    content: "#fffdf8",
    text: "#161616",
    font: "Georgia, Times, serif",
  },
  minimal: {
    primary: "#111827",
    accent: "#64748b",
    background: "#f8fafc",
    content: "#ffffff",
    text: "#0f172a",
    font: "Helvetica, Arial, sans-serif",
  },
  luxury: {
    primary: "#9b7a3c",
    accent: "#e8d5a9",
    background: "#090909",
    content: "#151515",
    text: "#f6f1e8",
    font: "Garamond, Georgia, serif",
  },
  futuristic: {
    primary: "#00e5ff",
    accent: "#b14cff",
    background: "#030712",
    content: "#0b1220",
    text: "#eefcff",
    font: "Tahoma, Arial, sans-serif",
  },
  retro: {
    primary: "#e05d3f",
    accent: "#e8b84a",
    background: "#f3dfba",
    content: "#fff6dc",
    text: "#442f25",
    font: "'Trebuchet MS', Arial, sans-serif",
  },
  brutalist: {
    primary: "#ffdf00",
    accent: "#ff3d00",
    background: "#d9ff00",
    content: "#ffffff",
    text: "#050505",
    font: "Impact, Arial, sans-serif",
  },
  playful: {
    primary: "#ff4f96",
    accent: "#694cff",
    background: "#f5eaff",
    content: "#ffffff",
    text: "#312451",
    font: "'Trebuchet MS', Arial, sans-serif",
  },
  wellness: {
    primary: "#2f8578",
    accent: "#91c788",
    background: "#edf7f2",
    content: "#ffffff",
    text: "#183d38",
    font: "Verdana, Geneva, sans-serif",
  },
  industrial: {
    primary: "#e39b28",
    accent: "#637381",
    background: "#e9eef1",
    content: "#ffffff",
    text: "#18242d",
    font: "Arial, Helvetica, sans-serif",
  },
};

export function applyCreativeSystem(
  document: ReturnType<typeof createBlankDocument>,
  brief: Brief,
) {
  const preset = brief.stylePreset || "executive";
  const catalogDesign = DESIGN_PRESETS_100.find(
    (item) => item.id === (brief.designPresetId || preset),
  );
  const system = catalogDesign
    ? {
        primary: catalogDesign.primary,
        accent: catalogDesign.accent,
        background: catalogDesign.background,
        content: catalogDesign.content,
        text: catalogDesign.text,
        font: document.settings.fontFamily,
      }
    : STYLE_SYSTEMS[preset] || STYLE_SYSTEMS.executive;
  const dark = brief.colorMode === "dark";
  Object.assign(document.settings, {
    primaryColor: system.primary,
    accentColor: system.accent,
    backgroundColor: dark ? "#070d13" : system.background,
    contentColor: dark ? "#101b25" : system.content,
    textColor: dark ? "#f2f8fa" : system.text,
    fontFamily: system.font,
  });
  if (brief.backgroundMood === "dark")
    Object.assign(document.settings, {
      backgroundColor: "#050b11",
      contentColor: "#0d1923",
      textColor: "#f1f8fa",
    });
  if (brief.backgroundMood === "light")
    Object.assign(document.settings, {
      backgroundColor: "#eef4f6",
      contentColor: "#ffffff",
      textColor: "#14232b",
    });
  if (brief.backgroundMood === "contrast")
    Object.assign(document.settings, {
      backgroundColor: system.primary,
      contentColor: "#071019",
      textColor: "#f4fbfc",
    });
  const fonts = {
    corporate: "Arial, Helvetica, sans-serif",
    editorial: "Georgia, Times, serif",
    friendly: "'Trebuchet MS', Arial, sans-serif",
    impact: "Impact, Arial, sans-serif",
  };
  const catalogFont = FONT_CATALOG_100.find(
    (item) => item.id === brief.fontPresetId,
  );
  if (catalogFont) document.settings.fontFamily = catalogFont.value;
  else if (brief.fontMood) document.settings.fontFamily = fonts[brief.fontMood];
  document.settings.cornerRadius =
    brief.cornerStyle === "sharp" ? 0 : brief.cornerStyle === "round" ? 28 : 14;
  document.creative = {
    stylePreset: preset,
    intensity: Math.min(100, Math.max(0, Number(brief.intensity) || 55)),
    contentDensity: brief.contentDensity || "balanced",
    colorMode: brief.colorMode || "light",
    compatibilityMode: brief.compatibilityMode || "compatible",
    typographyStyle: brief.typographyStyle || "modern-sans",
    imageStyle: brief.imageStyle || "editorial",
  };
}

export function applyLayoutDirection(
  document: ReturnType<typeof createBlankDocument>,
  brief: Brief,
) {
  const layout = brief.layoutStyle || "cards";
  const blockRadius =
    brief.cornerStyle === "sharp" ? 0 : brief.cornerStyle === "round" ? 28 : 14;
  document.blocks = document.blocks.map((block, index) => ({
    ...block,
    props: {
      blockWidth:
        layout === "editorial" && ["heading", "text"].includes(block.type)
          ? 82
          : 100,
      blockAlign: "left",
      edgePadding: layout === "full" && block.type === "hero" ? 0 : 40,
      paddingTop: 0,
      paddingBottom: block.type === "hero" ? 24 : 24,
      backgroundColor: "transparent",
      columnBackgroundColor:
        block.type === "columns"
          ? "transparent"
          : block.props.columnBackgroundColor,
      blockRadius:
        layout === "cards" &&
        ["heading", "text", "columns"].includes(block.type)
          ? blockRadius
          : 0,
      borderWidth: 0,
      borderColor: document.settings.accentColor,
      rotation:
        layout === "dynamic" && ["heading", "button"].includes(block.type)
          ? index % 2
            ? -2
            : 2
          : 0,
      skewX: 0,
      shadow: "none",
      ...block.props,
      ...(["heading", "text", "artText", "columns"].includes(block.type)
        ? {
            backgroundColor: "transparent",
            columnBackgroundColor:
              block.type === "columns"
                ? "transparent"
                : block.props.columnBackgroundColor,
          }
        : {}),
    },
  }));
}

export type GeneratedCopy = {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  sectionTitle: string;
  sectionBody: string;
  ctaLabel: string;
};

export function guidedCopy(brief: Brief): GeneratedCopy {
  const sector = brief.sector?.trim() || "servicios profesionales";
  const objective =
    brief.objective?.trim() || "generar una conversación comercial";
  const offer = brief.offer?.trim() || "una evaluación inicial personalizada";
  return {
    subject: `Una oportunidad concreta para {{lead.company}}`,
    preheader: `Descubre cómo ${offer} puede ayudar a tu equipo a avanzar.`,
    eyebrow: `${sector.toUpperCase()} · PROPUESTA PERSONALIZADA`,
    title: `Una nueva forma de ${objective}`,
    body: `Hola {{lead.first_name}}, ${brief.companyName ? `${brief.companyName} ha preparado` : "hemos preparado"} una idea relevante para {{lead.company}}, basada en vuestro contexto y orientada a resultados medibles.`,
    sectionTitle: "De la posibilidad al avance",
    sectionBody: `Te proponemos ${offer}. Un punto de partida claro, sin ruido y con una siguiente acción concreta.`,
    ctaLabel: "Explorar la propuesta",
  };
}

/**
 * Qué receta del catálogo encaja con lo que el usuario ha escrito.
 *
 * El brief nace con `TEMPLATE_RECIPES_100[0]`, que es de tecnología, y quien
 * no toca el selector se lleva esa: un estudio de tatuajes recibía un correo
 * con la etiqueta TECNOLOGÍA y una foto de oficina. El texto lo escribe el
 * modelo, pero la imagen de catálogo y la categoría salen de aquí.
 *
 * Se puntúa contra el nombre, la categoría y el objetivo de cada receta, que
 * es lo mismo que hace el buscador del catálogo. Si nada encaja, se queda la
 * que hubiera: inventar un sector es peor que no acertar.
 */
export function elegirReceta(brief: Brief): string | undefined {
  const texto = [brief.sector, brief.companyContext, brief.companyName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const palabras = texto.split(/\s+/).filter((p) => p.length > 3);
  if (!palabras.length) return brief.templatePresetId;

  const normal = (v: string) =>
    v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  let mejor = { id: brief.templatePresetId, puntos: 0 };
  for (const receta of TEMPLATE_RECIPES_100) {
    const nombre = normal(receta.name);
    const categoria = normal(receta.category);
    let puntos = 0;
    for (const palabra of palabras) {
      if (nombre.includes(palabra)) puntos += 10;
      if (categoria.includes(palabra)) puntos += 6;
      if (normal(receta.objective).includes(palabra)) puntos += 2;
    }
    if (puntos > mejor.puntos) mejor = { id: receta.id, puntos };
  }
  return mejor.id;
}

export function generarDocumento(brief: Brief, copy: GeneratedCopy) {
  const receta = catalogItem(TEMPLATE_RECIPES_100, brief.templatePresetId);
  const documento = buildProductionDocument({
    ...receta,
    designId: brief.designPresetId || receta.designId,
    fontId: brief.fontPresetId || receta.fontId,
    imageRecipeId: brief.imageRecipeId || receta.imageRecipeId,
  });
  applyCreativeSystem(documento, brief);
  applyLayoutDirection(documento, brief);

  const hero = documento.blocks.find((b) => b.type === "hero");
  if (hero)
    hero.props = {
      ...hero.props,
      eyebrow: brief.heroTextAmount === "none" ? "" : copy.eyebrow,
      title: copy.title,
      body: brief.heroTextAmount === "balanced" ? copy.body : "",
    };

  const texto = documento.blocks.find((b) => b.type === "text");
  if (texto)
    texto.props = {
      ...texto.props,
      content: `${copy.sectionTitle}

${copy.sectionBody}`,
    };

  const boton = documento.blocks.find((b) => b.type === "button");
  if (boton)
    boton.props = {
      ...boton.props,
      label: copy.ctaLabel,
      url: brief.destinationUrl?.trim() || "{{campaign.cta_url}}",
    };

  if (
    (brief.typographyStyle === "artistic" || brief.typographyStyle === "curved") &&
    brief.compatibilityMode !== "compatible"
  ) {
    documento.blocks.splice(2, 0, {
      id: `art-${crypto.randomUUID()}`,
      type: "artText",
      props: {
        text: copy.sectionTitle,
        effect: brief.typographyStyle === "curved" ? "arc" : "rotate",
        rotation: brief.typographyStyle === "curved" ? 0 : -3,
        fontSize: 42,
        fontStyle: "display",
        align: "center",
        color: documento.settings.accentColor,
      },
    });
  }

  return documento;
}

