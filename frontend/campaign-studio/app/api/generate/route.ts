import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { generationRuns } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import { createBlankDocument } from "@/lib/template-types";
import {
  buildProductionDocument,
  catalogItem,
  DESIGN_PRESETS_100,
  FONT_CATALOG_100,
  TEMPLATE_RECIPES_100,
} from "@/lib/production-catalog";

type Brief = {
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

function applyCreativeSystem(
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

function applyLayoutDirection(
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

type GeneratedCopy = {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  sectionTitle: string;
  sectionBody: string;
  ctaLabel: string;
};

function guidedCopy(brief: Brief): GeneratedCopy {
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

async function aiCopy(
  brief: Brief,
  apiKey: string,
): Promise<GeneratedCopy | null> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "Eres director creativo senior de email marketing. Redacta en español de España, específico y sin spam. Integra con naturalidad el nombre, descripción y credenciales de la empresa cuando existan; nunca inventes referencias, clientes, cifras ni certificaciones. Adapta tono, estilo y longitud al brief. minimal=frases muy breves, balanced=breve, editorial=contenido desarrollado. Conserva literalmente {{lead.first_name}} y {{lead.company}}. Un solo CTA coherente con actionType y landingContext.",
        },
        { role: "user", content: JSON.stringify(brief) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "email_campaign_copy",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "subject",
              "preheader",
              "eyebrow",
              "title",
              "body",
              "sectionTitle",
              "sectionBody",
              "ctaLabel",
            ],
            properties: Object.fromEntries(
              [
                "subject",
                "preheader",
                "eyebrow",
                "title",
                "body",
                "sectionTitle",
                "sectionBody",
                "ctaLabel",
              ].map((key) => [key, { type: "string" }]),
            ),
          },
        },
      },
    }),
  });
  if (!response.ok) return null;
  const result = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const raw =
    result.output_text ??
    result.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text;
  if (!raw) return null;
  return JSON.parse(raw) as GeneratedCopy;
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const runId = crypto.randomUUID();
  let provider = "guided-engine";
  let status = "completed";
  try {
    const brief = (await request.json()) as Brief;
    const runtime = env as unknown as { OPENAI_API_KEY?: string };
    let copy = guidedCopy(brief);
    if (runtime.OPENAI_API_KEY) {
      const generated = await aiCopy(brief, runtime.OPENAI_API_KEY);
      if (generated) {
        copy = generated;
        provider = "openai";
      }
    }
    const baseRecipe = catalogItem(
      TEMPLATE_RECIPES_100,
      brief.templatePresetId,
    );
    const document = buildProductionDocument({
      ...baseRecipe,
      designId: brief.designPresetId || baseRecipe.designId,
      fontId: brief.fontPresetId || baseRecipe.fontId,
      imageRecipeId: brief.imageRecipeId || baseRecipe.imageRecipeId,
    });
    applyCreativeSystem(document, brief);
    applyLayoutDirection(document, brief);
    const hero = document.blocks.find((block) => block.type === "hero");
    if (hero)
      hero.props = {
        ...hero.props,
        eyebrow: brief.heroTextAmount === "none" ? "" : copy.eyebrow,
        title: copy.title,
        body: brief.heroTextAmount === "balanced" ? copy.body : "",
      };
    const text = document.blocks.find((block) => block.type === "text");
    if (text)
      text.props = {
        ...text.props,
        content: `${copy.sectionTitle}\n\n${copy.sectionBody}`,
      };
    const button = document.blocks.find((block) => block.type === "button");
    if (button)
      button.props = {
        ...button.props,
        label: copy.ctaLabel,
        url: brief.destinationUrl?.trim() || "{{campaign.cta_url}}",
      };
    if (
      (brief.typographyStyle === "artistic" ||
        brief.typographyStyle === "curved") &&
      brief.compatibilityMode !== "compatible"
    ) {
      document.blocks.splice(2, 0, {
        id: `art-${crypto.randomUUID()}`,
        type: "artText",
        props: {
          text: copy.sectionTitle,
          effect: brief.typographyStyle === "curved" ? "arc" : "rotate",
          rotation: brief.typographyStyle === "curved" ? 0 : -3,
          fontSize: 42,
          fontStyle: "display",
          align: "center",
          color: document.settings.accentColor,
        },
      });
    }
    await getDb()
      .insert(generationRuns)
      .values({
        id: runId,
        ownerId: auth.user.id,
        kind: "template",
        provider,
        status,
        promptSummary: JSON.stringify(brief).slice(0, 500),
        createdAt: new Date().toISOString(),
      });
    return Response.json({
      document,
      subject: copy.subject,
      preheader: copy.preheader,
      mode: provider === "openai" ? "ai" : "guided-preview",
    });
  } catch (error) {
    status = "failed";
    try {
      await getDb().insert(generationRuns).values({
        id: runId,
        ownerId: auth.user.id,
        kind: "template",
        provider,
        status,
        errorCode: "generation_failed",
        createdAt: new Date().toISOString(),
      });
    } catch {}
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar la plantilla",
      },
      { status: 500 },
    );
  }
}
