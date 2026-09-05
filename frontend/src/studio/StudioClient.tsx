"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Blocks,
  Bold,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  CloudUpload,
  Code2,
  Columns2,
  ContactRound,
  Copy,
  Database,
  Download,
  Eye,
  FilePlus2,
  GalleryHorizontalEnd,
  GripVertical,
  History,
  HelpCircle,
  ImageIcon,
  Import,
  LayoutTemplate,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Minus,
  Monitor,
  MoreHorizontal,
  Palette,
  Plus,
  Redo2,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareMousePointer,
  TextCursorInput,
  Trash2,
  Undo2,
  WandSparkles,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@studio/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@studio/ui/dialog";
import { Input } from "@studio/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@studio/ui/tabs";
import { Textarea } from "@studio/ui/textarea";
import { Toaster } from "@studio/ui/sonner";
import CampaignCommandCenter from "./campaign-command-center";
import GuidedTour, { type TourStep } from "./guided-tour";
import {
  analyseEmailQuality,
  renderEmailHtml,
  renderEmailText,
} from "@studio/lib/email-renderer";
import { absolutizeEmailHtml } from "@studio/lib/export-html";
import {
  fitImageDimensions,
  getGeneratedImageDimensions,
  getImageFormat,
  IMAGE_FORMATS,
  normalizeCustomImageDimensions,
  type GeneratedImageFormat,
} from "@studio/lib/image-formats";
import {
  buildProductionDocument,
  buildOpeningShowcaseDocument,
  catalogItem,
  DESIGN_PRESETS_100,
  FONT_CATALOG_100,
  IMAGE_RECIPES_100,
  TEMPLATE_RECIPES_100,
  type FontPreset,
} from "@studio/lib/production-catalog";
import {
  createBlankDocument,
  createBlock,
  DEFAULT_VARIABLES,
  type EmailBlockType,
  type StoredTemplate,
  type TemplateDocument,
  type TemplateVariable,
} from "@studio/lib/template-types";
import {
  ALLOWED_IMAGE_TYPES,
  DIRECT_UPLOAD_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_STORED_IMAGE_BYTES,
  UPLOAD_CHUNK_BYTES,
} from "@studio/lib/upload-policy";

type StudioProps = { displayName: string };
type Device = "desktop" | "mobile";
type AppTheme = "dark" | "light" | "ocean" | "emerald" | "violet";
type ExperienceMode = "guided" | "professional";
type WorkflowStep = "library" | "content" | "design" | "variables" | "review";
type TextTarget = {
  scope: "block" | "subject" | "preheader";
  blockId?: string;
  prop?: string;
  start: number;
  end: number;
};

async function fileHasTransparentPixels(file: File): Promise<boolean | null> {
  if (!/image\/(png|webp)/i.test(file.type)) return false;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, width, height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 250) return true;
    }
    return false;
  } catch {
    return null;
  }
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/webp",
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("El navegador no pudo optimizar la imagen")),
      type,
      quality,
    );
  });
}

async function prepareImageForUpload(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type))
    throw new Error("Utiliza una imagen PNG, JPG o WebP");
  if (file.size > MAX_SOURCE_IMAGE_BYTES)
    throw new Error("La imagen original supera 60 MB");
  if (file.size <= MAX_STORED_IMAGE_BYTES)
    return { file, optimized: false, originalBytes: file.size };

  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 4096;
    let scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = window.document.createElement("canvas");
    const draw = () => {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("El navegador no puede preparar esta imagen");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    };

    const transparent = await fileHasTransparentPixels(file);
    let outputType: "image/png" | "image/webp" =
      file.type === "image/png" ? "image/png" : "image/webp";
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      draw();
      blob = await canvasBlob(
        canvas,
        outputType,
        outputType === "image/webp" ? Math.max(0.78, 0.94 - attempt * 0.04) : undefined,
      );
      if (blob.size <= MAX_STORED_IMAGE_BYTES) break;
      if (outputType === "image/png" && transparent) {
        outputType = "image/webp";
      } else {
        scale *= 0.82;
      }
    }
    if (!blob || blob.size > MAX_STORED_IMAGE_BYTES)
      throw new Error(
        "No se ha podido reducir la imagen por debajo del límite de subida",
      );
    const baseName = file.name.replace(/\.[^.]+$/, "") || "imagen";
    const extension = outputType === "image/png" ? "png" : "webp";
    return {
      file: new File([blob], `${baseName}.${extension}`, {
        type: outputType,
        lastModified: file.lastModified,
      }),
      optimized: true,
      originalBytes: file.size,
    };
  } finally {
    bitmap.close();
  }
}
const TOUR_STEPS: TourStep[] = [
  {
    eyebrow: "BIENVENIDA",
    title: "Domina Campaign Studio en dos minutos",
    body: "Te enseñaremos el flujo completo para crear, personalizar, comprobar y exportar una campaña. No modificaremos tu trabajo durante el recorrido.",
    tip: "Puedes cerrar la guía y volver a abrirla desde el botón Ayuda.",
  },
  {
    selector: '[data-tour="workflow"]',
    eyebrow: "PASO 1",
    title: "Sigue un flujo claro",
    body: "Avanza de izquierda a derecha: plantilla, contenido, diseño, variables y revisión. Cada fase ordena las herramientas que necesitas.",
  },
  {
    selector: '[data-tour="ai"]',
    eyebrow: "PASO 2",
    title: "Genera una campaña completa con IA",
    body: "El asistente pregunta por empresa, objetivo, audiencia, diseño, imagen y destino. Después crea una campaña totalmente editable.",
  },
  {
    selector: '[data-tour="blocks"]',
    eyebrow: "PASO 3",
    title: "Añade y ordena bloques",
    body: "Arrastra nuevos bloques a la posición exacta, reordena los existentes o elimínalos. El fondo completo funciona como una capa independiente.",
  },
  {
    selector: '[data-tour="canvas"]',
    eyebrow: "PASO 4",
    title: "Trabaja viendo el resultado real",
    body: "Selecciona y arrastra bloques directamente sobre la maqueta. Alterna escritorio y móvil y ajusta el zoom sin perder la posición.",
  },
  {
    selector: '[data-tour="inspector"]',
    eyebrow: "PASO 5",
    title: "Personaliza cada bloque por separado",
    body: "Edita contenido, tipografía, tamaño, colores, fondo, bordes, formas, giro, alineación, imágenes y comportamiento móvil del bloque seleccionado.",
  },
  {
    selector: '[data-tour="review"]',
    eyebrow: "PASO 6",
    title: "Revisa antes de utilizar la campaña",
    body: "Comprueba enlaces, variables, contraste, spam, accesibilidad, móvil, modo oscuro, comentarios, pruebas y variantes A/B.",
  },
  {
    selector: '[data-tour="save"]',
    eyebrow: "PASO 7",
    title: "Guarda, versiona y exporta",
    body: "El autoguardado protege el borrador. Guarda versiones permanentes y exporta HTML compatible con imágenes y fondos incluidos.",
    tip: "La aplicación también dispone de Ctrl K para buscar cualquier acción rápidamente.",
  },
  {
    eyebrow: "LISTO",
    title: "Tu campaña siempre permanece bajo tu control",
    body: "Puedes volver a esta guía desde Ayuda, consultar las explicaciones por fase o buscar una acción con Ctrl K. Ninguna generación de IA bloquea la edición manual.",
    tip: "Antes de usar una campaña, abre el Centro de campaña y completa todos los controles críticos.",
  },
];

const HELP_SECTIONS = [
  {
    id: "create",
    title: "Crear con IA",
    description: "El wizard reúne empresa, objetivo, público, oferta, tono, composición, imagen y URL para generar una campaña completa y editable.",
    steps: ["Abre Crear con IA", "Completa las preguntas", "Revisa el resumen y el coste", "Genera y personaliza el resultado"],
  },
  {
    id: "blocks",
    title: "Bloques y composición",
    description: "Añade, elimina y reordena bloques desde la columna izquierda. Cada bloque conserva sus propios estilos y ajustes móviles.",
    steps: ["Arrastra el bloque a la posición exacta", "Selecciónalo en la maqueta", "Edita contenido y diseño a la derecha", "Comprueba escritorio y móvil"],
  },
  {
    id: "images",
    title: "Imágenes y fondos",
    description: "Genera, sube o reutiliza imágenes. Puedes escoger formato, resolución, encaje, transparencia y fondo completo de maqueta.",
    steps: ["Selecciona Imagen, Hero o Fondo", "Elige biblioteca, subida o IA", "Previsualiza el encaje", "Aplica solo al bloque seleccionado"],
  },
  {
    id: "variables",
    title: "Variables y destinatarios",
    description: "Inserta variables en el punto exacto del texto y previsualiza la campaña con datos de un lead antes de entregarla a Prospector.",
    steps: ["Coloca el cursor en el texto", "Abre Personalizar", "Inserta la variable", "Verifica su valor de ejemplo"],
  },
  {
    id: "review",
    title: "Revisión y cumplimiento",
    description: "El Centro de campaña comprueba enlaces, variables, contraste, accesibilidad, móvil, modo oscuro, spam y estructura legal.",
    steps: ["Abre Centro de campaña", "Resuelve controles críticos", "Prepara una prueba", "Guarda una versión inmutable"],
  },
  {
    id: "export",
    title: "Guardar y exportar",
    description: "El autoguardado protege el borrador. Guardar crea versiones y Exportar genera HTML con imágenes y fondos absolutos.",
    steps: ["Comprueba el estado Guardada", "Pulsa Guardar para versionar", "Abre Revisar y exportar", "Descarga HTML o EML de prueba"],
  },
] as const;
type Preset = {
  id: string;
  name: string;
  category: string;
  image: string;
  subject: string;
  preheader: string;
  accent: string;
  document: TemplateDocument;
  objective: string;
  designId: string;
  fontId: string;
  imageRecipeId: string;
  designFamily: string;
  motif: string;
  variant: number;
  imagePrompt: string;
};
type BrandKit = {
  name: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  senderName: string;
  senderEmail: string;
  postalAddress: string;
  legalName: string;
  privacyUrl: string;
  privacyEmail: string;
};
type MediaAsset = {
  id: string;
  url: string;
  filename: string;
  source: string;
  altText: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
};

const BLOCK_META: Array<{
  type: EmailBlockType;
  label: string;
  description: string;
  icon: typeof Blocks;
}> = [
  {
    type: "hero",
    label: "Hero 4K",
    description: "Imagen y propuesta",
    icon: GalleryHorizontalEnd,
  },
  {
    type: "heading",
    label: "Titular",
    description: "Jerarquía clara",
    icon: Bold,
  },
  {
    type: "artText",
    label: "Texto artístico",
    description: "Giro, curva y display",
    icon: WandSparkles,
  },
  {
    type: "text",
    label: "Texto",
    description: "Contenido personalizable",
    icon: TextCursorInput,
  },
  {
    type: "button",
    label: "Botón",
    description: "CTA principal",
    icon: SquareMousePointer,
  },
  {
    type: "image",
    label: "Imagen",
    description: "Recurso visual",
    icon: ImageIcon,
  },
  {
    type: "columns",
    label: "2 columnas",
    description: "Beneficios paralelos",
    icon: Columns2,
  },
  {
    type: "divider",
    label: "Divisor",
    description: "Separador visual",
    icon: Minus,
  },
  {
    type: "spacer",
    label: "Espacio",
    description: "Control de ritmo",
    icon: MoreHorizontal,
  },
  {
    type: "brand",
    label: "Marca",
    description: "Logo tipográfico",
    icon: BriefcaseBusiness,
  },
  {
    type: "footer",
    label: "Pie legal",
    description: "Baja y dirección",
    icon: ShieldCheck,
  },
];

const PROP_LABELS: Record<string, string> = {
  label: "Etiqueta",
  align: "Alineación",
  textAlign: "Alineación del texto",
  blockAlign: "Alineación del bloque",
  eyebrow: "Antetítulo",
  title: "Titular",
  body: "Texto de apoyo",
  imageUrl: "URL de imagen",
  imageAlt: "Texto alternativo",
  overlay: "Superponer contenido",
  text: "Texto",
  level: "Nivel",
  content: "Contenido",
  url: "Enlace",
  caption: "Pie de imagen",
  leftTitle: "Título izquierdo",
  leftText: "Texto izquierdo",
  rightTitle: "Título derecho",
  rightText: "Texto derecho",
  color: "Color",
  thickness: "Grosor",
  height: "Altura",
  company: "Empresa",
  address: "Dirección",
  note: "Nota legal",
  privacyLabel: "Texto de privacidad",
  privacyUrl: "Enlace de privacidad",
  preferencesLabel: "Texto de preferencias",
  preferencesUrl: "Enlace de preferencias",
  unsubscribeLabel: "Texto de baja",
  unsubscribeUrl: "Enlace de baja",
  effect: "Efecto",
  rotation: "Giro",
  fontSize: "Tamaño",
  fontStyle: "Estilo tipográfico",
  minHeight: "Altura del hero",
  verticalAlign: "Posición vertical",
  imagePosition: "Encuadre de imagen",
  paddingX: "Margen lateral",
  widthPercent: "Tamaño de imagen",
  blockWidth: "Ancho del bloque",
  paddingTop: "Espacio superior",
  paddingBottom: "Espacio inferior",
  backgroundColor: "Fondo del bloque",
  textColor: "Color del texto",
  lineHeight: "Interlineado",
  fontWeight: "Grosor del texto",
  buttonStyle: "Estilo del botón",
  buttonShape: "Forma del botón",
  buttonSize: "Tamaño del botón",
  buttonWidth: "Ancho del botón",
  buttonColor: "Color del botón",
  buttonTextColor: "Color de etiqueta",
  edgePadding: "Margen exterior",
  blockRadius: "Radio del bloque",
  borderWidth: "Grosor del borde",
  borderColor: "Color del borde",
  skewX: "Inclinación",
  shadow: "Sombra",
  blockDepth: "Profundidad 3D del bloque",
  blockDepthColor: "Color de profundidad",
  textDepth: "Efecto 3D del texto",
  textDepthColor: "Color del efecto 3D",
  buttonDepth: "Profundidad 3D del botón",
  buttonDepthColor: "Color de profundidad del botón",
  columnBackgroundColor: "Fondo de las columnas",
  buttonRadius: "Radio exacto del botón",
  fontFamily: "Tipografía",
  titleFontSize: "Tamaño del titular",
  bodyFontSize: "Tamaño del texto",
  letterSpacing: "Espaciado entre letras",
  textTransform: "Transformación",
};

const MULTILINE_PROPS = new Set([
  "body",
  "content",
  "leftText",
  "rightText",
  "note",
]);
const LAYOUT_PROPS = new Set([
  "blockWidth",
  "blockAlign",
  "edgePadding",
  "paddingTop",
  "paddingBottom",
  "backgroundColor",
  "blockRadius",
  "borderWidth",
  "borderColor",
  "rotation",
  "skewX",
  "shadow",
  "blockDepth",
  "blockDepthColor",
  "fallbackStart",
  "fallbackEnd",
  "visualMotif",
  "buttonGeometryUnified",
  "heroGeometryUnified",
]);
const DESIGN_PROPS = new Set([
  "fontFamily",
  "fontSize",
  "titleFontSize",
  "bodyFontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textColor",
  "textAlign",
  "textDepth",
  "textDepthColor",
  "buttonDepth",
  "buttonDepthColor",
  "columnBackgroundColor",
]);
const MEDIA_OPTIONS = [
  {
    url: "/assets/aurevanta-command-center-hero.webp",
    full: "/assets/aurevanta-command-center-hero-4k.webp",
    label: "AI Command Center",
  },
  {
    url: "/assets/ai-campaign.webp",
    full: "/assets/ai-campaign-4k.webp",
    label: "Inteligencia B2B",
  },
  {
    url: "/assets/industrial-cleaning.webp",
    full: "/assets/industrial-cleaning-4k.webp",
    label: "Impacto industrial",
  },
  {
    url: "/assets/sports-physio.webp",
    full: "/assets/sports-physio-4k.webp",
    label: "Movimiento y salud",
  },
];
// Sin usar desde que el selector de fuentes pasó al catálogo.
// @ts-expect-error conservado a propósito: lo usará el selector de tipografía
const FONT_CATALOG = FONT_CATALOG_100;

function cloneDocument(document: TemplateDocument) {
  const next = structuredClone(document);
  for (const variable of DEFAULT_VARIABLES)
    if (!next.variables.some((item) => item.key === variable.key))
      next.variables.push(structuredClone(variable));
  next.compliance = {
    schemaVersion: 1,
    builderStatus: "ready",
    prospectorValidationRequired: true,
    requiredRuntimeVariables: [
      "sender.legal_name",
      "sender.postal_address",
      "sender.privacy_url",
      "campaign.legal_reason",
      "system.unsubscribe_url",
      "system.preferences_url",
    ],
    senderIdentityConfigured: true,
    privacyConfigured: true,
  };
  next.blocks = next.blocks.map((block) => {
    const legacyAlign = String(block.props.align || "left");
    const layout = {
      blockWidth: 100,
      blockAlign:
        legacyAlign === "center" || legacyAlign === "right"
          ? legacyAlign
          : "left",
      edgePadding: 40,
      paddingTop: 0,
      paddingBottom: 24,
      backgroundColor: "transparent",
      blockRadius: 0,
      borderWidth: 0,
      borderColor: "#dbe3ea",
      rotation: 0,
      skewX: 0,
      shadow: "none",
      blockDepth: "none",
      blockDepthColor: "#0f172a",
    };
    const typography = {
      fontFamily: next.settings.fontFamily,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: 0,
      textTransform: "none",
      textColor: next.settings.textColor,
      textAlign: legacyAlign,
      textDepth: "none",
      textDepthColor: "#111827",
    };
    if (block.type === "hero")
      return {
        ...block,
        props: {
          ...layout,
          ...typography,
          fontWeight: 700,
          titleFontSize: 34,
          bodyFontSize: 17,
          textColor: "#ffffff",
          minHeight: 360,
          align: "left",
          verticalAlign: "center",
          imagePosition: "center",
          paddingX: 38,
          ...block.props,
          blockRadius:
            block.props.heroGeometryUnified === true
              ? Number(block.props.blockRadius ?? next.settings.cornerRadius)
              : Number(block.props.blockRadius) > 0
                ? Number(block.props.blockRadius)
                : Number(next.settings.cornerRadius ?? 0),
          heroGeometryUnified: true,
        },
      };
    if (block.type === "image")
      return {
        ...block,
        props: {
          ...layout,
          ...typography,
          fontSize: 12,
          widthPercent: 100,
          align: "center",
          ...block.props,
        },
      };
    if (block.type === "button")
      return {
        ...block,
        props: {
          ...layout,
          ...typography,
          fontSize: 15,
          fontWeight: 700,
          align: "left",
          textAlign: "center",
          buttonStyle: "solid",
          buttonShape: "pill",
          buttonRadius: 80,
          buttonSize: "medium",
          buttonWidth: "auto",
          buttonColor: next.settings.primaryColor,
          buttonTextColor: "#ffffff",
          buttonDepth: "none",
          buttonDepthColor: "#064852",
          ...block.props,
          blockWidth:
            block.props.buttonGeometryUnified === true
              ? Number(block.props.blockWidth ?? 40)
              : block.props.buttonWidth === "full"
                ? Number(block.props.blockWidth ?? 100)
                : Number(block.props.blockWidth) === 100
                  ? 40
                  : Number(block.props.blockWidth ?? 40),
          blockRadius:
            block.props.buttonGeometryUnified === true
              ? Number(block.props.blockRadius ?? 80)
              : Math.min(80, Number(block.props.buttonRadius ?? 80)),
          buttonGeometryUnified: true,
        },
      };
    if (block.type === "heading")
      return {
        ...block,
        props: {
          ...layout,
          ...typography,
          align: "left",
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.2,
          ...block.props,
        },
      };
    if (block.type === "text")
      return {
        ...block,
        props: {
          ...layout,
          ...typography,
          align: "left",
          fontSize: 16,
          lineHeight: 1.72,
          ...block.props,
        },
      };
    if (block.type === "artText")
      return {
        ...block,
        props: {
          ...layout,
          ...typography,
          align: "center",
          fontFamily: "Georgia, Times, serif",
          fontSize: 42,
          fontWeight: 800,
          lineHeight: 1.05,
          color: next.settings.accentColor,
          ...block.props,
        },
      };
    if (["brand", "columns", "footer"].includes(block.type)) {
      const compliance =
        block.type === "footer"
          ? {
              company: "{{sender.legal_name}}",
              address: "{{sender.postal_address}}",
              note: "{{campaign.legal_reason}}",
              privacyLabel: "Política de privacidad",
              privacyUrl: "{{sender.privacy_url}}",
              preferencesLabel: "Gestionar preferencias",
              preferencesUrl: "{{system.preferences_url}}",
              unsubscribeLabel: "Cancelar suscripción",
              unsubscribeUrl: "{{system.unsubscribe_url}}",
            }
          : block.type === "columns"
            ? { columnBackgroundColor: "transparent" }
            : {};
      return {
        ...block,
        props: {
          ...layout,
          ...typography,
          ...compliance,
          align: block.type === "footer" ? "center" : "left",
          fontSize:
            block.type === "brand" ? 13 : block.type === "footer" ? 12 : 14,
          ...block.props,
        },
      };
    }
    return { ...block, props: { ...layout, ...block.props } };
  });
  return next;
}

function estimatedCanvasHeight(document: TemplateDocument) {
  return Math.min(
    4096,
    Math.max(
      480,
      document.blocks.reduce((total, block) => {
        if (block.type === "hero")
          return total + Number(block.props.minHeight || 360);
        if (block.type === "image") return total + 340;
        if (block.type === "columns") return total + 190;
        if (block.type === "spacer")
          return total + Number(block.props.height || 24);
        return (
          total +
          110 +
          Number(block.props.paddingTop || 0) +
          Number(block.props.paddingBottom || 0)
        );
      }, 0),
    ),
  );
}

function guestSession() {
  const key = "aurevanta-guest-session";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, value);
  }
  return value;
}

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-aurevanta-session", guestSession());
  return fetch(input, { ...init, headers });
}

function buildPresets() {
  const presets = TEMPLATE_RECIPES_100.map((recipe, index) => {
    const design = catalogItem(DESIGN_PRESETS_100, recipe.designId);
    const image = catalogItem(IMAGE_RECIPES_100, recipe.imageRecipeId);
    return {
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      image: image.thumbnail,
      subject: recipe.subject,
      preheader: recipe.preheader,
      accent: design.primary,
      document: buildProductionDocument(recipe),
      objective: recipe.objective,
      designId: recipe.designId,
      fontId: recipe.fontId,
      imageRecipeId: recipe.imageRecipeId,
      designFamily: design.archetype,
      motif: design.motif,
      variant: index % 5,
      imagePrompt: image.prompt,
    };
  });
  presets[0] = {
    ...presets[0],
    name: "Aurevanta AI Command Center",
    subject: "{{lead.first_name}}, convierte ideas en campañas memorables",
    preheader:
      "Diseño, imagen 4K y personalización comercial coordinados por IA.",
    image: "/assets/aurevanta-command-center-hero.webp",
    accent: "#03d9ff",
    document: buildOpeningShowcaseDocument(),
    objective: "presentar una experiencia de campaña premium",
    designFamily: "AI Command Center",
    motif: "orbit",
  };
  return presets;
}

function TemplatePreview({
  preset,
  compact = false,
  imageUrl = "",
}: {
  preset: Preset;
  compact?: boolean;
  imageUrl?: string;
}) {
  const design = catalogItem(DESIGN_PRESETS_100, preset.designId);
  return (
    <div
      className={`template-art motif-${preset.motif} variant-${preset.variant} ${compact ? "compact" : ""}`}
      style={
        {
          "--art-primary": design.primary,
          "--art-accent": design.accent,
          "--art-bg": design.background,
          "--art-content": design.content,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {imageUrl && <img src={imageUrl} alt="" />}
      <div className="art-media">
        <i />
        <i />
        <i />
      </div>
      <div className="art-copy">
        <small>{preset.category}</small>
        <strong>{preset.name}</strong>
        <span />
        <span />
      </div>
      <div className="art-cta" />
      <div className="art-grid">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

const SEARCH_SYNONYMS: Record<string, string[]> = {
  industrial: [
    "industria",
    "mantenimiento",
    "limpieza",
    "ingeniería",
    "fabricación",
    "instalaciones",
  ],
  salud: [
    "clínica",
    "fisio",
    "dental",
    "médico",
    "psicología",
    "nutrición",
    "estética",
  ],
  digital: [
    "ia",
    "software",
    "saas",
    "tecnología",
    "marketing",
    "ciberseguridad",
    "ecommerce",
  ],
  hogar: [
    "inmobiliaria",
    "reformas",
    "arquitectura",
    "interiorismo",
    "mobiliario",
    "construcción",
  ],
  movilidad: [
    "automoción",
    "vehículo",
    "renting",
    "taller",
    "logística",
    "transporte",
  ],
  sostenible: ["residuos", "ambiental", "circular", "agua", "solar", "energía"],
  profesional: [
    "abogados",
    "consultoría",
    "finanzas",
    "seguros",
    "auditoría",
    "gestoría",
  ],
  gastronomia: [
    "restaurante",
    "bar",
    "comida",
    "catering",
    "bodega",
    "pastelería",
    "hotel gastronómico",
  ],
  educacion: [
    "academia",
    "colegio",
    "formación",
    "cursos",
    "oposiciones",
    "edtech",
  ],
  turismo: [
    "hotel",
    "viajes",
    "turismo",
    "vacaciones",
    "aventura",
    "apartamentos",
  ],
  belleza: ["estética", "peluquería", "cosmética", "spa", "uñas", "bienestar"],
  deporte: ["gimnasio", "entrenador", "club", "pádel", "fitness", "deportivo"],
  eventos: [
    "eventos",
    "boda",
    "wedding",
    "audiovisual",
    "fotografía",
    "celebración",
  ],
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function recommendPresets(presets: Preset[], query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return presets;
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 1);
  const expanded = new Set(tokens);
  for (const [concept, words] of Object.entries(SEARCH_SYNONYMS))
    if (
      tokens.includes(concept) ||
      words.some((word) => normalized.includes(normalizeSearch(word)))
    )
      words.forEach((word) => expanded.add(normalizeSearch(word)));
  return presets
    .map((preset) => {
      const name = normalizeSearch(preset.name);
      const category = normalizeSearch(preset.category);
      const objective = normalizeSearch(preset.objective);
      let score =
        name === normalized
          ? 200
          : name.includes(normalized)
            ? 120
            : category.includes(normalized)
              ? 80
              : 0;
      expanded.forEach((token) => {
        if (name.includes(token)) score += 30;
        if (category.includes(token)) score += 18;
        if (objective.includes(token)) score += 8;
      });
      return { preset, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.preset.name.localeCompare(b.preset.name),
    )
    .map((item) => item.preset);
}

function initialMergeData() {
  return {
    "lead.first_name": "María",
    "lead.company": "Lumen Arquitectura",
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
}

function contextualAsset(preset: Preset, assets: MediaAsset[]) {
  const business = normalizeSearch(preset.name);
  return (
    assets.find((asset) =>
      normalizeSearch(`${asset.altText} ${asset.filename}`).includes(business),
    )?.url || ""
  );
}

function fieldClass() {
  return "studio-field";
}

function RangeWithNumber({
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  className = "",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    const timer = window.setTimeout(() => setDraft(String(value)), 0);
    return () => window.clearTimeout(timer);
  }, [value]);
  const commit = (candidate: string) => {
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) return setDraft(String(value));
    const clamped = Math.min(max, Math.max(min, parsed));
    const precision = String(step).includes(".")
      ? String(step).split(".")[1].length
      : 0;
    const normalized = Number(clamped.toFixed(precision));
    setDraft(String(normalized));
    onChange(normalized);
  };
  return (
    <div className={`range-number-control ${className}`}>
      <Input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <label>
        <input
          aria-label="Valor numérico"
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span>{suffix}</span>
      </label>
    </div>
  );
}

export default function StudioClient({ displayName }: StudioProps) {
  const presets = useMemo(buildPresets, []);
  const [document, setDocument] = useState<TemplateDocument>(() =>
    cloneDocument(presets[0].document),
  );
  const [history, setHistory] = useState<TemplateDocument[]>([]);
  const [future, setFuture] = useState<TemplateDocument[]>([]);
  const [subject, setSubject] = useState(presets[0].subject);
  const [preheader, setPreheader] = useState(presets[0].preheader);
  const [name, setName] = useState(presets[0].name);
  const [category, setCategory] = useState(presets[0].category);
  const [selectedBlockId, setSelectedBlockId] = useState(
    document.blocks[1]?.id ?? document.blocks[0]?.id ?? "",
  );
  const [device, setDevice] = useState<Device>("desktop");
  const [savedTemplates, setSavedTemplates] = useState<StoredTemplate[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaLoading, setMediaLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Todos");
  const [openTemplateGroups, setOpenTemplateGroups] = useState<string[]>([
    "Tecnología",
  ]);
  const [fontSearch, setFontSearch] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBrief, setAiBrief] = useState({
    campaignName: "",
    sector: "Servicios B2B",
    objective: "conseguir reuniones cualificadas",
    offer: "una auditoría de oportunidades",
    tone: "estratégico y humano",
    audience: "dirección comercial",
    companyName: "",
    companyContext: "",
    proofPoints: [] as string[],
    templatePresetId: TEMPLATE_RECIPES_100[0].id,
    designPresetId: DESIGN_PRESETS_100[0].id,
    fontPresetId: FONT_CATALOG_100[0].id,
    imageRecipeId: IMAGE_RECIPES_100[0].id,
    stylePreset: DESIGN_PRESETS_100[0].id,
    intensity: 55,
    contentDensity: "balanced",
    heroTextAmount: "minimal",
    embeddedImageText: "none",
    backgroundMood: "brand",
    layoutStyle: "full",
    cornerStyle: "soft",
    fontMood: "corporate",
    colorMode: "light",
    compatibilityMode: "hybrid",
    typographyStyle: FONT_CATALOG_100[0].id,
    imageStyle: IMAGE_RECIPES_100[0].style,
    imageResolution: "draft" as "draft" | "2k" | "4k",
    imageFormat: "horizontal" as GeneratedImageFormat,
    imageSizingMode: "hero" as "preset" | "hero" | "canvas",
    imageSubjectPosition:
      "Sujetos en el tercio inferior, con espacio visual limpio en la zona superior" as string,
    variantCount: 1,
    destinationUrl: "https://",
    actionType: "Solicitar información",
    landingContext: "",
    imagePrompt: IMAGE_RECIPES_100[0].prompt,
    generateImage: true,
  });
  const [aiStep, setAiStep] = useState(1);
  const [aiProgress, setAiProgress] = useState("");
  const [appTheme, setAppTheme] = useState<AppTheme>("dark");
  const [experienceMode, setExperienceMode] =
    useState<ExperienceMode>("guided");
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [lastAutosaveAt, setLastAutosaveAt] = useState<Date | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [draggingNewBlockType, setDraggingNewBlockType] =
    useState<EmailBlockType | null>(null);
  const [blockDropIndex, setBlockDropIndex] = useState<number | null>(null);
  const [draggingVariableKey, setDraggingVariableKey] = useState<string | null>(
    null,
  );
  const [textTarget, setTextTarget] = useState<TextTarget | null>(null);
  const [customVariable, setCustomVariable] = useState({
    label: "",
    key: "",
    fallback: "",
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importHtml, setImportHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageTarget, setImageTarget] = useState<"block" | "background">(
    "block",
  );
  const [imageLoading, setImageLoading] = useState(false);
  const [generatedImagePreview, setGeneratedImagePreview] = useState<{
    url: string;
    mode?: string;
    width?: number;
    height?: number;
  } | null>(null);
  const [imagePrompt, setImagePrompt] = useState(
    "Equipo directivo B2B convirtiendo datos complejos en oportunidades comerciales, escena premium y cinematográfica",
  );
  const [imageBrief, setImageBrief] = useState({
    style: "Fotografía editorial",
    mood: "Seguro y ambicioso",
    lighting: "Cinematográfica suave",
    composition: "Sujeto a la derecha, espacio negativo",
    camera: "Plano medio editorial",
    finish: "Nítido y premium",
    palette: "Azul petróleo, cian y violeta",
    people: "Personas reales y naturales",
    embeddedText: "none",
    textContent: "",
    transparentBackground: false,
    resolution: "4k" as "draft" | "2k" | "4k",
    format: "horizontal" as GeneratedImageFormat,
    sizingMode: "preset" as "preset" | "hero" | "canvas" | "custom",
    customWidth: 1600,
    customHeight: 900,
  });
  const [catalogImageResolution, setCatalogImageResolution] = useState<
    "draft" | "2k" | "4k"
  >("draft");
  const [catalogImageFormat, setCatalogImageFormat] =
    useState<GeneratedImageFormat>("horizontal");
  const [brandOpen, setBrandOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [brandKit, setBrandKit] = useState<BrandKit>({
    name: "Aurevanta Labs",
    primaryColor: "#12d7e7",
    accentColor: "#8b5cf6",
    backgroundColor: "#071019",
    fontFamily: "Arial, Helvetica, sans-serif",
    senderName: "",
    senderEmail: "",
    postalAddress: "Valencia, España",
    legalName: "Aurevanta Labs",
    privacyUrl: "https://example.com/privacidad",
    privacyEmail: "privacidad@example.com",
  });
  const [mergeData, setMergeData] =
    useState<Record<string, string>>(initialMergeData);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("content");
  const uploadRef = useRef<HTMLInputElement>(null);
  const backgroundUploadRef = useRef<HTMLInputElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewScrollRef = useRef(0);

  const selectedBlock = document.blocks.find(
    (block) => block.id === selectedBlockId,
  );
  const canvasBackgroundMode =
    document.settings.backgroundMode ??
    (document.settings.backgroundImageUrl ? "image" : "color");
  const selectedImageFormat = getImageFormat(imageBrief.format);
  const selectedHero = document.blocks.find((block) => block.type === "hero");
  const imageDimensionsForResolution = (resolution: "draft" | "2k" | "4k") =>
    imageBrief.sizingMode === "custom"
      ? normalizeCustomImageDimensions(
          imageBrief.customWidth,
          imageBrief.customHeight,
        )
      : imageBrief.sizingMode === "hero"
        ? fitImageDimensions(
            document.settings.width,
            Number(selectedHero?.props.minHeight || 360),
            resolution,
          )
        : imageBrief.sizingMode === "canvas"
          ? fitImageDimensions(
              document.settings.width,
              estimatedCanvasHeight(document),
              resolution,
            )
          : getGeneratedImageDimensions(imageBrief.format, resolution);
  const selectedImageDimensions = imageDimensionsForResolution(
    imageBrief.resolution,
  );
  const html = useMemo(
    () => renderEmailHtml(document, subject, preheader, mergeData),
    [document, subject, preheader, mergeData],
  );
  const plainText = useMemo(
    () => renderEmailText(document, mergeData),
    [document, mergeData],
  );
  const quality = useMemo(
    () => analyseEmailQuality(document, subject, preheader),
    [document, subject, preheader],
  );
  const filteredMediaAssets = useMemo(
    () =>
      mediaAssets.filter((asset) =>
        normalizeSearch(
          `${asset.filename} ${asset.altText} ${asset.source}`,
        ).includes(normalizeSearch(mediaSearch)),
      ),
    [mediaAssets, mediaSearch],
  );

  function focusSelectedBlockInPreview(blockId: string, center = true) {
    if (!blockId || blockId === "__canvas_background__") return;
    let frameWindow: Window | null | undefined;
    let frameDocument: Document | null | undefined;
    try {
      frameWindow = previewFrameRef.current?.contentWindow;
      frameDocument = previewFrameRef.current?.contentDocument;
    } catch {
      return;
    }
    if (!frameWindow || !frameDocument) return;
    try {
      const rows = Array.from(
        frameDocument.querySelectorAll<HTMLElement>("[data-block-id]"),
      );
      let target: HTMLElement | undefined;
      for (const row of rows) {
        const visual =
          row.querySelector<HTMLElement>(":scope > td > table") ?? row;
        visual.style.outline = "none";
        visual.style.outlineOffset = "0";
        if (row.dataset.blockId === blockId) {
          target = row;
          visual.style.outline = "2px solid #11cfe0";
          visual.style.outlineOffset = "-2px";
        }
      }
      if (!target || !center) return;
      const rect = target.getBoundingClientRect();
      const viewportHeight = frameWindow.innerHeight;
      const documentHeight = frameDocument.documentElement.scrollHeight;
      const nextTop = Math.max(
        0,
        Math.min(
          frameWindow.scrollY + rect.top - (viewportHeight - rect.height) / 2,
          Math.max(0, documentHeight - viewportHeight),
        ),
      );
      previewScrollRef.current = nextTop;
      frameWindow.scrollTo({ top: nextTop, behavior: "auto" });
    } catch {
      return;
    }
  }

  function handlePreviewLoad() {
    let frameWindow: Window | null | undefined;
    let frameDocument: Document | null | undefined;
    try {
      frameWindow = previewFrameRef.current?.contentWindow;
      frameDocument = previewFrameRef.current?.contentDocument;
    } catch {
      return;
    }
    if (!frameWindow) return;
    try {
      if (!selectedBlockId || selectedBlockId === "__canvas_background__")
        frameWindow.scrollTo({
          top: previewScrollRef.current,
          behavior: "auto",
        });
      frameWindow.addEventListener(
        "scroll",
        () => {
          previewScrollRef.current = frameWindow.scrollY;
        },
        { passive: true },
      );
      if (!frameDocument) return;
      frameDocument.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(
        (link) => {
          link.addEventListener("click", (event) => event.preventDefault());
          link.title = "Enlace desactivado dentro del editor";
        },
      );
      const rows = Array.from(
        frameDocument.querySelectorAll<HTMLElement>("[data-block-id]"),
      );
      rows.forEach((row, index) => {
        const id = row.dataset.blockId;
        if (!id) return;
        row.draggable = true;
        row.style.cursor = "grab";
        row.style.transition =
          "outline-color .15s ease, box-shadow .15s ease, opacity .15s ease";
        row.addEventListener("click", () => setSelectedBlockId(id));
        row.addEventListener("dragstart", (event) => {
          event.dataTransfer?.setData("application/x-aurevanta-block-id", id);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          row.style.opacity = ".42";
        });
        row.addEventListener("dragend", () => {
          row.style.opacity = "1";
        });
        row.addEventListener("dragover", (event) => {
          event.preventDefault();
          const after =
            event.clientY >
            row.getBoundingClientRect().top +
              row.getBoundingClientRect().height / 2;
          row.dataset.dropAfter = after ? "true" : "false";
          row.style.boxShadow = after
            ? "inset 0 -5px 0 #11cfe0"
            : "inset 0 5px 0 #11cfe0";
        });
        row.addEventListener("dragleave", () => {
          row.style.boxShadow = "none";
        });
        row.addEventListener("drop", (event) => {
          event.preventDefault();
          const sourceId = event.dataTransfer?.getData(
            "application/x-aurevanta-block-id",
          );
          if (!sourceId || sourceId === id) return;
          reorderBlockById(
            sourceId,
            index + (row.dataset.dropAfter === "true" ? 1 : 0),
          );
        });
      });
      frameWindow.requestAnimationFrame(() =>
        focusSelectedBlockInPreview(selectedBlockId, true),
      );
    } catch {
      return;
    }
  }

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() =>
      focusSelectedBlockInPreview(selectedBlockId, true),
    );
    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedBlockId]);

  function reorderBlockById(id: string, targetIndex: number) {
    commitDocument((current) => {
      const from = current.blocks.findIndex((block) => block.id === id);
      if (from < 0) return current;
      const [moved] = current.blocks.splice(from, 1);
      const adjusted = from < targetIndex ? targetIndex - 1 : targetIndex;
      current.blocks.splice(
        Math.max(0, Math.min(adjusted, current.blocks.length)),
        0,
        moved,
      );
      return current;
    });
    setSelectedBlockId(id);
    toast.success("Bloque movido en la maqueta");
  }

  function rememberTextTarget(
    scope: TextTarget["scope"],
    event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>,
    prop?: string,
  ) {
    const field = event.currentTarget;
    setTextTarget({
      scope,
      blockId: scope === "block" ? selectedBlockId : undefined,
      prop,
      start: field.selectionStart ?? field.value.length,
      end: field.selectionEnd ?? field.value.length,
    });
  }

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      void loadLibrary();
      void loadMediaLibrary();
      void loadBrandKit();
      try {
      const savedTheme = globalThis.localStorage?.getItem(
        "aurevanta-studio-theme",
      ) as AppTheme | null;
      if (
        savedTheme &&
        ["dark", "light", "ocean", "emerald", "violet"].includes(savedTheme)
      )
        setAppTheme(savedTheme);
      const savedMode = globalThis.localStorage?.getItem(
        "aurevanta-experience-mode",
      ) as ExperienceMode | null;
      if (savedMode === "guided" || savedMode === "professional")
        setExperienceMode(savedMode);
      const recoveryRaw = globalThis.localStorage?.getItem(
        "aurevanta-draft-recovery",
      );
      if (recoveryRaw) {
        const recovery = JSON.parse(recoveryRaw) as {
          savedAt?: number;
          name?: string;
          category?: string;
          subject?: string;
          preheader?: string;
          document?: TemplateDocument;
        };
        if (
          recovery.document?.schemaVersion === 1 &&
          Date.now() - Number(recovery.savedAt || 0) < 7 * 24 * 60 * 60 * 1000
        ) {
          setDocument(cloneDocument(recovery.document));
          setName(recovery.name || "Borrador recuperado");
          setCategory(recovery.category || "Recuperada");
          setSubject(recovery.subject || "");
          setPreheader(recovery.preheader || "");
          setSelectedBlockId(recovery.document.blocks[0]?.id || "");
          setDirty(true);
          toast.success("Se ha recuperado el último borrador local");
        }
      }
      if (!globalThis.localStorage?.getItem("aurevanta-guided-tour-complete"))
        window.setTimeout(() => setTourOpen(true), 700);
      } catch {}
    }, 0);
    return () => window.clearTimeout(initialize);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    try {
      globalThis.localStorage?.setItem(
        "aurevanta-draft-recovery",
        JSON.stringify({
          savedAt: Date.now(),
          name,
          category,
          subject,
          preheader,
          document,
        }),
      );
    } catch {}
    const timer = window.setTimeout(() => {
      if (!saving) void saveTemplate();
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [
    dirty,
    saving,
    name,
    category,
    subject,
    preheader,
    document,
    templateId,
    version,
  ]);

  function changeAppTheme(theme: AppTheme) {
    setAppTheme(theme);
    try {
      globalThis.localStorage?.setItem("aurevanta-studio-theme", theme);
    } catch {}
  }

  function changeExperienceMode(mode: ExperienceMode) {
    setExperienceMode(mode);
    try {
      globalThis.localStorage?.setItem("aurevanta-experience-mode", mode);
    } catch {}
  }

  function commitDocument(
    change: (current: TemplateDocument) => TemplateDocument,
  ) {
    setDocument((current) => {
      const next = change(cloneDocument(current));
      setHistory((items) => [...items.slice(-29), cloneDocument(current)]);
      setFuture([]);
      return next;
    });
    setDirty(true);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [cloneDocument(document), ...items].slice(0, 30));
    setHistory((items) => items.slice(0, -1));
    setDocument(cloneDocument(previous));
    setDirty(true);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, cloneDocument(document)].slice(-30));
    setFuture((items) => items.slice(1));
    setDocument(cloneDocument(next));
    setDirty(true);
  }

  async function loadLibrary() {
    setLibraryLoading(true);
    try {
      const response = await apiFetch("/api/templates");
      if (response.ok) {
        const data = (await response.json()) as { templates: StoredTemplate[] };
        setSavedTemplates(data.templates);
      }
    } finally {
      setLibraryLoading(false);
    }
  }

  async function loadMediaLibrary() {
    setMediaLoading(true);
    try {
      const response = await apiFetch("/api/assets");
      if (!response.ok) return;
      const data = (await response.json()) as { assets: MediaAsset[] };
      setMediaAssets(data.assets);
    } finally {
      setMediaLoading(false);
    }
  }

  async function loadBrandKit() {
    try {
      const response = await apiFetch("/api/brand-kit");
      if (!response.ok) return;
      const data = (await response.json()) as { brandKit: BrandKit };
      setBrandKit((current) => ({ ...current, ...data.brandKit }));
    } catch {}
  }

  function insertBlockAt(type: EmailBlockType, insertAt: number) {
    const block = createBlock(type);
    commitDocument((current) => {
      delete current.rawHtml;
      current.blocks.splice(
        Math.max(0, Math.min(insertAt, current.blocks.length)),
        0,
        block,
      );
      return current;
    });
    setSelectedBlockId(block.id);
    toast.success(
      `${BLOCK_META.find((item) => item.type === type)?.label ?? "Bloque"} añadido`,
    );
  }

  function addBlock(type: EmailBlockType) {
    const currentIndex = document.blocks.findIndex(
      (item) => item.id === selectedBlockId,
    );
    insertBlockAt(
      type,
      currentIndex >= 0 ? currentIndex + 1 : document.blocks.length,
    );
  }

  function updateBlockProp(key: string, value: string | number | boolean) {
    commitDocument((current) => {
      const block = current.blocks.find((item) => item.id === selectedBlockId);
      if (block) block.props[key] = value;
      return current;
    });
  }

  function updateCanvasSetting<K extends keyof TemplateDocument["settings"]>(
    key: K,
    value: TemplateDocument["settings"][K],
  ) {
    commitDocument((current) => {
      current.settings[key] = value;
      return current;
    });
  }

  function applyMediaToTarget(
    url: string,
    altText: string,
    explicitTarget?: "block" | "background",
  ) {
    const target = explicitTarget ?? imageTarget;
    if (target === "background") {
      commitDocument((current) => {
        current.settings.backgroundImageUrl = url;
        current.settings.backgroundMode = "image";
        if (current.settings.backgroundImageOpacity === undefined)
          current.settings.backgroundImageOpacity = 100;
        return current;
      });
      toast.success("Imagen aplicada al fondo de la maqueta");
      return;
    }
    if (!selectedBlock || !["hero", "image"].includes(selectedBlock.type)) {
      toast.error("Selecciona primero un bloque Hero o Imagen");
      return;
    }
    updateBlockProp("imageUrl", url);
    updateBlockProp("imageAlt", altText);
  }

  function openImageStudio(target: "block" | "background") {
    setImageTarget(target);
    setGeneratedImagePreview(null);
    setImageBrief((current) => ({
      ...current,
      sizingMode:
        target === "background"
          ? "canvas"
          : selectedBlock?.type === "hero"
            ? "hero"
            : current.sizingMode,
    }));
    setImageOpen(true);
  }

  function contextualImagePrompt(basePrompt: string) {
    const context = [
      aiBrief.companyName && `Empresa: ${aiBrief.companyName}`,
      aiBrief.sector && `actividad: ${aiBrief.sector}`,
      aiBrief.companyContext && `contexto real: ${aiBrief.companyContext}`,
      aiBrief.objective && `objetivo de campaña: ${aiBrief.objective}`,
      aiBrief.offer && `oferta: ${aiBrief.offer}`,
      aiBrief.audience && `público: ${aiBrief.audience}`,
    ]
      .filter(Boolean)
      .join(". ");
    return `${basePrompt}. ${context}. La escena, objetos, entorno, vestuario y lenguaje visual deben ser específicos de esta actividad y oferta; evitar imágenes corporativas genéricas.`.slice(
      0,
      1800,
    );
  }

  function applyFontPreset(font: FontPreset) {
    commitDocument((current) => {
      const block = current.blocks.find((item) => item.id === selectedBlockId);
      if (block)
        Object.assign(block.props, {
          fontPreset: font.id,
          fontFamily: font.value,
          fontWeight: font.weight,
          letterSpacing: font.letterSpacing,
          textTransform: font.transform,
        });
      return current;
    });
  }

  function applyCampaignDesign(id: string) {
    const design = catalogItem(DESIGN_PRESETS_100, id);
    commitDocument((current) => {
      Object.assign(current.settings, {
        primaryColor: design.primary,
        accentColor: design.accent,
        backgroundColor: design.background,
        contentColor: design.content,
        textColor: design.text,
        cornerRadius:
          design.corner === "sharp" ? 0 : design.corner === "round" ? 28 : 14,
      });
      current.creative = {
        ...(current.creative ?? {
          intensity: 55,
          contentDensity: "balanced",
          colorMode: "adaptive",
          compatibilityMode: "hybrid",
          typographyStyle: "modern-sans",
          imageStyle: design.imageStyle,
        }),
        stylePreset: design.id,
        imageStyle: design.imageStyle,
      };
      current.blocks.forEach((block, index) => {
        block.props.blockRadius =
          design.corner === "sharp" ? 0 : design.corner === "round" ? 28 : 14;
        block.props.backgroundColor =
          design.layout === "cards" &&
          ["heading", "text", "columns"].includes(block.type)
            ? design.content
            : "transparent";
        block.props.rotation =
          design.layout === "dynamic" &&
          ["heading", "artText", "button"].includes(block.type)
            ? index % 2
              ? -2
              : 2
            : 0;
        block.props.shadow =
          design.layout === "cards" &&
          ["hero", "image", "columns"].includes(block.type)
            ? "soft"
            : "none";
        if (block.type === "button") block.props.buttonColor = design.primary;
        else if (block.type === "artText") block.props.color = design.accent;
        else if (block.type !== "hero") block.props.textColor = design.text;
      });
      return current;
    });
    toast.success(`Diseño ${design.name} aplicado sin cambiar el contenido`);
  }

  function applyCampaignFont(id: string) {
    const font = catalogItem(FONT_CATALOG_100, id);
    commitDocument((current) => {
      current.settings.fontFamily = font.value;
      if (current.creative) current.creative.typographyStyle = font.id;
      current.blocks.forEach((block) => {
        if (
          [
            "brand",
            "hero",
            "heading",
            "artText",
            "text",
            "button",
            "image",
            "columns",
            "footer",
          ].includes(block.type)
        )
          Object.assign(block.props, {
            fontPreset: font.id,
            fontFamily: font.value,
            fontWeight: font.weight,
            letterSpacing: font.letterSpacing,
            textTransform: font.transform,
          });
      });
      return current;
    });
    toast.success(`Tipografía ${font.name} aplicada a la campaña`);
  }

  function selectWizardTemplate(id: string) {
    const recipe = catalogItem(TEMPLATE_RECIPES_100, id);
    const design = catalogItem(DESIGN_PRESETS_100, recipe.designId);
    const font = catalogItem(FONT_CATALOG_100, recipe.fontId);
    const image = catalogItem(IMAGE_RECIPES_100, recipe.imageRecipeId);
    setAiBrief((current) => ({
      ...current,
      templatePresetId: recipe.id,
      sector: recipe.name,
      objective: recipe.objective,
      designPresetId: design.id,
      stylePreset: design.id,
      layoutStyle: design.layout,
      cornerStyle: design.corner,
      fontPresetId: font.id,
      typographyStyle: font.id,
      imageRecipeId: image.id,
      imageStyle: image.style,
      imagePrompt: image.prompt,
    }));
  }

  function randomizeWizardDirection() {
    const template =
      TEMPLATE_RECIPES_100[
        Math.floor(Math.random() * TEMPLATE_RECIPES_100.length)
      ];
    const design =
      DESIGN_PRESETS_100[Math.floor(Math.random() * DESIGN_PRESETS_100.length)];
    const font =
      FONT_CATALOG_100[Math.floor(Math.random() * FONT_CATALOG_100.length)];
    const image =
      IMAGE_RECIPES_100[Math.floor(Math.random() * IMAGE_RECIPES_100.length)];
    const format =
      IMAGE_FORMATS[Math.floor(Math.random() * IMAGE_FORMATS.length)];
    setAiBrief((current) => ({
      ...current,
      templatePresetId: template.id,
      sector: template.name,
      objective: template.objective,
      designPresetId: design.id,
      stylePreset: design.id,
      layoutStyle: design.layout,
      cornerStyle: design.corner,
      fontPresetId: font.id,
      typographyStyle: font.id,
      imageRecipeId: image.id,
      imageStyle: image.style,
      imagePrompt: image.prompt,
      imageFormat: format.id,
    }));
    toast.success("Combinación creativa aleatoria preparada");
  }

  function removeBlock(id: string) {
    const index = document.blocks.findIndex((block) => block.id === id);
    commitDocument((current) => {
      current.blocks = current.blocks.filter((block) => block.id !== id);
      return current;
    });
    const remaining = document.blocks.filter((block) => block.id !== id);
    setSelectedBlockId(
      remaining[Math.max(0, index - 1)]?.id ?? remaining[0]?.id ?? "",
    );
    toast.success("Bloque eliminado");
  }

  function duplicateBlock(id: string) {
    const source = document.blocks.find((block) => block.id === id);
    if (!source) return;
    const copy = {
      ...structuredClone(source),
      id: `${source.type}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
    };
    commitDocument((current) => {
      const index = current.blocks.findIndex((block) => block.id === id);
      current.blocks.splice(index + 1, 0, copy);
      return current;
    });
    setSelectedBlockId(copy.id);
    toast.success("Bloque duplicado");
  }

  function moveBlock(id: string, direction: -1 | 1) {
    commitDocument((current) => {
      const index = current.blocks.findIndex((block) => block.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.blocks.length)
        return current;
      [current.blocks[index], current.blocks[target]] = [
        current.blocks[target],
        current.blocks[index],
      ];
      return current;
    });
  }

  function dropBlockAt(targetIndex: number) {
    if (draggingNewBlockType) {
      insertBlockAt(draggingNewBlockType, targetIndex);
      setDraggingNewBlockType(null);
      setBlockDropIndex(null);
      return;
    }
    if (!draggingBlockId) return;
    commitDocument((current) => {
      const from = current.blocks.findIndex(
        (block) => block.id === draggingBlockId,
      );
      if (from < 0) return current;
      const [moved] = current.blocks.splice(from, 1);
      const adjustedTarget = from < targetIndex ? targetIndex - 1 : targetIndex;
      current.blocks.splice(
        Math.max(0, Math.min(adjustedTarget, current.blocks.length)),
        0,
        moved,
      );
      return current;
    });
    setDraggingBlockId(null);
    setBlockDropIndex(null);
    toast.success("Bloque recolocado");
  }

  function dropStructureItem(
    event: React.DragEvent<HTMLDivElement>,
    targetIndex: number,
  ) {
    event.preventDefault();
    const newType = event.dataTransfer.getData(
      "application/x-aurevanta-block",
    ) as EmailBlockType;
    const movedId = event.dataTransfer.getData(
      "application/x-aurevanta-block-id",
    );
    if (newType && BLOCK_META.some((item) => item.type === newType)) {
      insertBlockAt(newType, targetIndex);
      setDraggingNewBlockType(null);
      setBlockDropIndex(null);
      return;
    }
    if (movedId) {
      reorderBlockById(movedId, targetIndex);
      setDraggingBlockId(null);
      setBlockDropIndex(null);
      return;
    }
    dropBlockAt(targetIndex);
  }

  function toggleProofPoint(value: string) {
    setAiBrief((current) => ({
      ...current,
      proofPoints: current.proofPoints.includes(value)
        ? current.proofPoints.filter((item) => item !== value)
        : [...current.proofPoints, value],
    }));
  }

  function applyPreset(preset: Preset) {
    setDocument(cloneDocument(preset.document));
    setSubject(preset.subject);
    setPreheader(preset.preheader);
    setName(preset.name);
    setCategory(preset.category);
    setTemplateId(null);
    setVersion(1);
    setHistory([]);
    setFuture([]);
    setSelectedBlockId(
      preset.document.blocks.find(
        (block) => block.type === "hero" || block.type === "image",
      )?.id ??
        preset.document.blocks[0]?.id ??
        "",
    );
    setDirty(true);
    toast.success(`Plantilla “${preset.name}” aplicada`);
  }

  async function preparePresetImage(preset: Preset) {
    applyPreset(preset);
    const recipe = catalogItem(IMAGE_RECIPES_100, preset.imageRecipeId);
    setWorkflowStep("content");
    setImageLoading(true);
    toast.message(
      `Creando un visual ${catalogImageResolution === "draft" ? "normal" : catalogImageResolution.toUpperCase()} exclusivo para ${preset.name}…`,
    );
    try {
      const prompt = contextualImagePrompt(recipe.prompt);
      const response = await apiFetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          altText: `${preset.name}: ${recipe.scene}`,
          style: recipe.style,
          mood: "Premium, auténtico y específico del negocio",
          composition: recipe.composition,
          palette: recipe.palette,
          people: "Personas reales y naturales cuando proceda",
          camera: "Dirección fotográfica publicitaria",
          finish:
            catalogImageResolution === "4k"
              ? "Hiperrealista 4K"
              : "Nítido y premium",
          embeddedText: "none",
          resolution: catalogImageResolution,
          format: catalogImageFormat,
        }),
      });
      const data = (await response.json()) as {
        url?: string;
        error?: string;
        mode?: string;
      };
      if (!response.ok || !data.url)
        throw new Error(data.error || "No se pudo generar el visual");
      setDocument((current) => {
        const next = cloneDocument(current);
        const visual = next.blocks.find(
          (block) => block.type === "hero" || block.type === "image",
        );
        if (visual) {
          visual.props.imageUrl = data.url!;
          visual.props.imageAlt = `${preset.name}: ${recipe.scene}`;
        }
        return next;
      });
      setDirty(true);
      await loadMediaLibrary();
      toast.success(
        `Visual ${catalogImageResolution === "draft" ? "normal" : catalogImageResolution.toUpperCase()} de ${preset.name} guardado en la biblioteca`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo generar el visual",
      );
    } finally {
      setImageLoading(false);
    }
  }

  function openStored(template: StoredTemplate) {
    setDocument(cloneDocument(template.document));
    setSubject(template.subject);
    setPreheader(template.preheader);
    setName(template.name);
    setCategory(template.category);
    setTemplateId(template.id);
    setVersion(template.version);
    setSelectedBlockId(template.document.blocks[0]?.id ?? "");
    setHistory([]);
    setFuture([]);
    setDirty(false);
    toast.success(`“${template.name}” abierta`);
  }

  function newTemplate() {
    const next = createBlankDocument();
    setDocument(next);
    setSubject("Una propuesta para {{lead.company}}");
    setPreheader("Descubre una oportunidad preparada para tu empresa.");
    setName("Plantilla sin título");
    setCategory("Personalizada");
    setTemplateId(null);
    setVersion(1);
    setHistory([]);
    setFuture([]);
    setSelectedBlockId(next.blocks[1]?.id ?? next.blocks[0]?.id ?? "");
    setDirty(true);
  }

  async function saveTemplate() {
    setSaving(true);
    try {
      const response = await apiFetch(
        templateId ? `/api/templates/${templateId}` : "/api/templates",
        {
          method: templateId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            category,
            subject,
            preheader,
            document,
            version,
            expectedVersion: version,
            sourceType: document.rawHtml ? "html-import" : "studio",
          }),
        },
      );
      const data = (await response.json()) as {
        template?: StoredTemplate;
        error?: string;
      };
      if (!response.ok || !data.template)
        throw new Error(data.error || "No se pudo guardar");
      setTemplateId(data.template.id);
      setVersion(data.template.version);
      setDirty(false);
      setLastAutosaveAt(new Date());
      try {
        globalThis.localStorage?.removeItem("aurevanta-draft-recovery");
      } catch {}
      await loadLibrary();
      toast.success(`Versión ${data.template.version} guardada`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la plantilla",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveTemplate() {
    if (!templateId) return;
    const response = await apiFetch(`/api/templates/${templateId}`, {
      method: "DELETE",
    });
    if (!response.ok) return toast.error("No se pudo archivar");
    toast.success("Plantilla archivada");
    newTemplate();
    await loadLibrary();
  }

  function duplicateTemplate() {
    setTemplateId(null);
    setVersion(1);
    setName(`${name} · copia`);
    setDirty(true);
    toast.success("Copia independiente creada");
  }

  function downloadFile(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    window.document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function exportableHtml() {
    return absolutizeEmailHtml(html, window.location.origin);
  }

  function importTemplate() {
    if (importHtml.trim().length < 40)
      return toast.error("Pega un HTML de email válido");
    const next = createBlankDocument();
    next.blocks = [];
    next.rawHtml = importHtml;
    setDocument(next);
    setName("Plantilla importada");
    setCategory("Importada");
    setTemplateId(null);
    setVersion(1);
    setSelectedBlockId("");
    setDirty(true);
    setImportOpen(false);
    toast.success("HTML importado en modo seguro");
  }

  async function generateTemplate() {
    setAiLoading(true);
    setAiProgress("Creando estrategia, textos y estructura…");
    try {
      const response = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(aiBrief),
      });
      const data = (await response.json()) as {
        document?: TemplateDocument;
        subject?: string;
        preheader?: string;
        mode?: string;
        error?: string;
      };
      if (!response.ok || !data.document)
        throw new Error(data.error || "No se pudo generar");
      const generatedDocument = cloneDocument(data.document);
      let generatedImageUrl: string | null = null;
      if (aiBrief.generateImage) {
        setAiProgress(
          `Generando la imagen principal en ${aiBrief.imageResolution === "draft" ? "calidad normal" : aiBrief.imageResolution.toUpperCase()}…`,
        );
        const prompt = contextualImagePrompt(
          aiBrief.imagePrompt.trim() ||
            `${aiBrief.companyName || "Empresa"}, ${aiBrief.sector}. Campaña para ${aiBrief.objective}. Representar ${aiBrief.offer}. Audiencia: ${aiBrief.audience}. Composición con espacio negativo para texto de email.`,
        );
        const generatedHero = generatedDocument.blocks.find(
          (block) => block.type === "hero",
        );
        const adaptiveDimensions =
          aiBrief.imageSizingMode === "hero"
            ? fitImageDimensions(
                generatedDocument.settings.width,
                Number(generatedHero?.props.minHeight ?? 360),
                aiBrief.imageResolution,
              )
            : aiBrief.imageSizingMode === "canvas"
              ? fitImageDimensions(
                  generatedDocument.settings.width,
                  estimatedCanvasHeight(generatedDocument),
                  aiBrief.imageResolution,
                )
              : null;
        const imageResponse = await apiFetch("/api/generate-image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            altText: prompt,
            style: aiBrief.imageStyle,
            mood: aiBrief.tone,
            composition: `${catalogItem(IMAGE_RECIPES_100, aiBrief.imageRecipeId).composition}. ${aiBrief.imageSubjectPosition}`,
            palette: catalogItem(IMAGE_RECIPES_100, aiBrief.imageRecipeId)
              .palette,
            people: "Personas reales y naturales",
            camera: "Plano medio editorial",
            finish:
              aiBrief.imageResolution === "4k"
                ? "Hiperrealista 4K"
                : "Nítido y premium",
            embeddedText: aiBrief.embeddedImageText,
            textContent:
              aiBrief.embeddedImageText === "headline"
                ? catalogItem(IMAGE_RECIPES_100, aiBrief.imageRecipeId).headline
                : "",
            resolution: aiBrief.imageResolution,
            format: aiBrief.imageFormat,
            sizingMode: aiBrief.imageSizingMode,
            customWidth: adaptiveDimensions?.width,
            customHeight: adaptiveDimensions?.height,
          }),
        });
        const imageData = (await imageResponse.json()) as {
          url?: string;
          asset?: MediaAsset;
          error?: string;
        };
        if (!imageResponse.ok || !imageData.url)
          throw new Error(imageData.error || "No se pudo generar la imagen");
        const hero = generatedDocument.blocks.find(
          (block) => block.type === "hero",
        );
        if (hero) {
          hero.props.imageUrl = imageData.url;
          hero.props.imageAlt = prompt.slice(0, 180);
        }
        generatedImageUrl = imageData.url;
      }
      setAiProgress("Guardando la campaña y sus recursos…");
      const campaignName = (
        aiBrief.campaignName.trim() ||
        `${aiBrief.companyName || aiBrief.sector} · ${aiBrief.objective}`
      ).slice(0, 120);
      const saveResponse = await apiFetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          category: "Generada por IA",
          subject: data.subject,
          preheader: data.preheader,
          document: generatedDocument,
          sourceType: "ai-wizard",
          thumbnailUrl: generatedImageUrl,
        }),
      });
      const saved = (await saveResponse.json()) as {
        template?: StoredTemplate;
        error?: string;
      };
      if (!saveResponse.ok || !saved.template)
        throw new Error(
          saved.error || "La campaña se creó, pero no pudo guardarse",
        );
      setDocument(generatedDocument);
      setSubject(data.subject ?? "Nueva campaña");
      setPreheader(data.preheader ?? "");
      setName(saved.template.name);
      setCategory(saved.template.category);
      setTemplateId(saved.template.id);
      setVersion(saved.template.version);
      setSelectedBlockId(
        generatedDocument.blocks[1]?.id ??
          generatedDocument.blocks[0]?.id ??
          "",
      );
      setDirty(false);
      setAiOpen(false);
      setAiStep(1);
      await Promise.all([loadLibrary(), loadMediaLibrary()]);
      toast.success("Campaña completa creada y guardada");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo generar la plantilla",
      );
    } finally {
      setAiLoading(false);
      setAiProgress("");
    }
  }

  async function generateImage() {
    setImageLoading(true);
    try {
      const contextualPrompt = contextualImagePrompt(imagePrompt);
      const response = await apiFetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: contextualPrompt,
          altText: imagePrompt,
          ...imageBrief,
          customWidth: selectedImageDimensions.width,
          customHeight: selectedImageDimensions.height,
        }),
      });
      const data = (await response.json()) as {
        url?: string;
        mode?: string;
        width?: number;
        height?: number;
        error?: string;
      };
      if (!response.ok || !data.url)
        throw new Error(data.error || "No se pudo generar la imagen");
      setGeneratedImagePreview({
        url: data.url,
        mode: data.mode,
        width: data.width,
        height: data.height,
      });
      await loadMediaLibrary();
      toast.success(
        data.mode?.startsWith("ai-")
          ? `Imagen ${imageBrief.resolution.toUpperCase()} preparada para revisar`
          : "Recurso de demostración preparado para revisar",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo generar la imagen",
      );
    } finally {
      setImageLoading(false);
    }
  }

  function applyGeneratedImagePreview() {
    if (!generatedImagePreview) return;
    applyMediaToTarget(generatedImagePreview.url, imagePrompt.slice(0, 180));
    setGeneratedImagePreview(null);
    setImageOpen(false);
  }

  async function responsePayload(response: Response) {
    const text = await response.text();
    if (!text) return {} as { asset?: { url: string }; error?: string };
    try {
      return JSON.parse(text) as {
        asset?: { url: string };
        error?: string;
      };
    } catch {
      return {
        error:
          response.status === 413
            ? "La petición supera el límite de transferencia"
            : "El servidor no pudo procesar la imagen",
      };
    }
  }

  async function uploadPreparedImage(
    file: File,
    altText: string,
    toastId: string | number,
  ) {
    if (file.size <= DIRECT_UPLOAD_BYTES) {
      const form = new FormData();
      form.set("file", file);
      form.set("altText", altText);
      const response = await apiFetch("/api/assets", {
        method: "POST",
        body: form,
      });
      const data = await responsePayload(response);
      if (!response.ok || !data.asset)
        throw new Error(data.error || "No se pudo subir");
      return data.asset;
    }

    const uploadId = crypto.randomUUID();
    const totalParts = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
    try {
      for (let part = 0; part < totalParts; part += 1) {
        const start = part * UPLOAD_CHUNK_BYTES;
        const chunk = file.slice(start, start + UPLOAD_CHUNK_BYTES);
        toast.loading(
          `Subiendo imagen por partes · ${Math.round(((part + 1) / totalParts) * 100)}%`,
          { id: toastId },
        );
        const response = await apiFetch(
          `/api/assets/chunk?id=${encodeURIComponent(uploadId)}&part=${part}`,
          {
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            body: chunk,
          },
        );
        if (!response.ok) {
          const data = await responsePayload(response);
          throw new Error(data.error || `No se pudo subir la parte ${part + 1}`);
        }
      }
      toast.loading("Reconstruyendo la imagen en tu biblioteca...", {
        id: toastId,
      });
      const response = await apiFetch("/api/assets/chunk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: uploadId,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          totalParts,
          altText,
        }),
      });
      const data = await responsePayload(response);
      if (!response.ok || !data.asset)
        throw new Error(data.error || "No se pudo completar la subida");
      return data.asset;
    } catch (error) {
      void apiFetch(`/api/assets/chunk?id=${encodeURIComponent(uploadId)}`, {
        method: "DELETE",
      });
      throw error;
    }
  }

  async function uploadImage(file?: File) {
    if (!file) return;
    const transparencyCheck = fileHasTransparentPixels(file);
    const toastId = toast.loading(
      file.size > MAX_STORED_IMAGE_BYTES
        ? "Optimizando imagen sin perder transparencia..."
        : "Subiendo recurso...",
    );
    try {
      const prepared = await prepareImageForUpload(file);
      if (prepared.optimized)
        toast.loading("Imagen optimizada. Guardando en la biblioteca...", {
          id: toastId,
        });
      const altText = file.name.replace(/[-_]/g, " ");
      const asset = await uploadPreparedImage(prepared.file, altText, toastId);
      applyMediaToTarget(asset.url, altText);
      await loadMediaLibrary();
      const hasTransparency = await transparencyCheck;
      if (hasTransparency === false && /image\/(png|webp)/i.test(file.type)) {
        toast.warning(
          "Imagen añadida, pero sus píxeles son opacos: no contiene transparencia real",
          { id: toastId, duration: 6500 },
        );
      } else {
        toast.success(
          hasTransparency
            ? prepared.optimized
              ? "Imagen optimizada y transparencia conservada"
              : "Imagen transparente añadida y conservada"
            : prepared.optimized
              ? "Imagen optimizada y añadida a tu biblioteca"
              : "Recurso añadido a tu biblioteca",
          { id: toastId },
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir", {
        id: toastId,
      });
    }
  }

  function handleImageInputChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    void uploadImage(file);
  }

  function insertVariableAt(
    key: string,
    target: TextTarget | null = textTarget,
  ) {
    const tag = `{{${key}}}`;
    if (target?.scope === "subject") {
      setSubject(
        (value) =>
          `${value.slice(0, target.start)}${tag}${value.slice(target.end)}`,
      );
      setDirty(true);
      return toast.success(`${tag} insertado en el asunto`);
    }
    if (target?.scope === "preheader") {
      setPreheader(
        (value) =>
          `${value.slice(0, target.start)}${tag}${value.slice(target.end)}`,
      );
      setDirty(true);
      return toast.success(`${tag} insertado en el preheader`);
    }
    if (target?.scope === "block" && target.blockId && target.prop) {
      commitDocument((current) => {
        const block = current.blocks.find((item) => item.id === target.blockId);
        if (!block || typeof block.props[target.prop!] !== "string")
          return current;
        const value = String(block.props[target.prop!]);
        block.props[target.prop!] =
          `${value.slice(0, target.start)}${tag}${value.slice(target.end)}`;
        return current;
      });
      return toast.success(`${tag} insertado en la posición seleccionada`);
    }
    if (!selectedBlock)
      return toast.error("Sitúa primero el cursor en un campo de texto");
    const preferred = ["title", "body", "content", "text", "label"].find(
      (prop) => typeof selectedBlock.props[prop] === "string",
    );
    if (preferred)
      updateBlockProp(
        preferred,
        `${selectedBlock.props[preferred]} ${tag}`.trim(),
      );
    toast.success(`${tag} insertado`);
  }

  function insertVariable(key: string) {
    insertVariableAt(key);
  }

  function dropVariable(
    event: React.DragEvent<HTMLInputElement | HTMLTextAreaElement>,
    scope: TextTarget["scope"],
    prop?: string,
  ) {
    event.preventDefault();
    const key =
      event.dataTransfer.getData("application/x-aurevanta-variable") ||
      draggingVariableKey;
    if (!key) return;
    const field = event.currentTarget;
    const target: TextTarget = {
      scope,
      blockId: scope === "block" ? selectedBlockId : undefined,
      prop,
      start: field.selectionStart ?? field.value.length,
      end: field.selectionEnd ?? field.value.length,
    };
    setTextTarget(target);
    insertVariableAt(key, target);
    setDraggingVariableKey(null);
  }

  function restoreVariable(variable: TemplateVariable) {
    if (document.variables.some((item) => item.key === variable.key)) return;
    commitDocument((current) => {
      current.variables.push(structuredClone(variable));
      return current;
    });
    setMergeData((current) => ({
      ...current,
      [variable.key]: current[variable.key] ?? variable.fallback,
    }));
    toast.success(`${variable.label} recuperada`);
  }

  function addCustomVariable() {
    const label = customVariable.label.trim();
    const normalized = customVariable.key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.]+/g, "_")
      .replace(/^\.|\.$/g, "");
    const key = normalized.includes(".") ? normalized : `custom.${normalized}`;
    if (!label || !normalized)
      return toast.error("Indica el nombre y la clave de la variable");
    if (document.variables.some((item) => item.key === key))
      return toast.error("Esa variable ya existe");
    restoreVariable({
      key,
      label,
      type: "text",
      required: false,
      fallback: customVariable.fallback.trim(),
      source: "custom",
    });
    setCustomVariable({ label: "", key: "", fallback: "" });
  }

  function removeVariable(key: string) {
    const tag = `{{${key}}}`;
    commitDocument((current) => {
      current.variables = current.variables.filter(
        (variable) => variable.key !== key,
      );
      current.blocks.forEach((block) =>
        Object.entries(block.props).forEach(([prop, value]) => {
          if (typeof value === "string")
            block.props[prop] = value
              .replaceAll(tag, "")
              .replace(/\s{2,}/g, " ")
              .trim();
        }),
      );
      return current;
    });
    setSubject((value) =>
      value
        .replaceAll(tag, "")
        .replace(/\s{2,}/g, " ")
        .trim(),
    );
    setPreheader((value) =>
      value
        .replaceAll(tag, "")
        .replace(/\s{2,}/g, " ")
        .trim(),
    );
    toast.success("Variable eliminada de la plantilla");
  }

  async function saveBrandKit() {
    try {
      const response = await apiFetch("/api/brand-kit", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(brandKit),
      });
      if (!response.ok) throw new Error("No se pudo guardar la marca");
      commitDocument((current) => {
        current.settings.primaryColor = brandKit.primaryColor;
        current.settings.accentColor = brandKit.accentColor;
        current.settings.fontFamily = brandKit.fontFamily;
        const brand = current.blocks.find((block) => block.type === "brand");
        if (brand) {
          brand.props.label = brandKit.name.toUpperCase();
          brand.props.logoUrl = brandKit.logoUrl || "";
        }
        const footer = current.blocks.find((block) => block.type === "footer");
        if (footer) {
          footer.props.company = "{{sender.legal_name}}";
          footer.props.address = "{{sender.postal_address}}";
          footer.props.privacyUrl = "{{sender.privacy_url}}";
        }
        current.compliance = {
          schemaVersion: 1,
          builderStatus:
            brandKit.legalName && brandKit.postalAddress && brandKit.privacyUrl
              ? "ready"
              : "incomplete",
          prospectorValidationRequired: true,
          requiredRuntimeVariables: [
            "sender.legal_name",
            "sender.postal_address",
            "sender.privacy_url",
            "campaign.legal_reason",
            "system.unsubscribe_url",
            "system.preferences_url",
          ],
          senderIdentityConfigured: Boolean(
            brandKit.legalName && brandKit.postalAddress,
          ),
          privacyConfigured: Boolean(brandKit.privacyUrl),
        };
        return current;
      });
      setMergeData((data) => ({
        ...data,
        "sender.company": brandKit.name,
        "sender.legal_name": brandKit.legalName,
        "sender.postal_address": brandKit.postalAddress,
        "sender.privacy_url": brandKit.privacyUrl,
        "sender.privacy_email": brandKit.privacyEmail,
      }));
      setBrandOpen(false);
      toast.success("Sistema de marca aplicado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar la marca",
      );
    }
  }

  const templateCategories = [
    "Todos",
    ...Array.from(new Set(presets.map((preset) => preset.category))),
  ];
  const categoryPresets = presets.filter(
    (preset) =>
      templateCategory === "Todos" || preset.category === templateCategory,
  );
  const filteredPresets = recommendPresets(categoryPresets, search);
  const groupedPresets = templateCategories
    .filter((item) => item !== "Todos")
    .map((categoryName) => ({
      category: categoryName,
      presets: filteredPresets.filter(
        (preset) => preset.category === categoryName,
      ),
    }))
    .filter((group) => group.presets.length);
  const visibleFonts = FONT_CATALOG_100.filter((font) =>
    `${font.name} ${font.group}`
      .toLowerCase()
      .includes(fontSearch.toLowerCase()),
  );
  const recommendedWizardTemplates = recommendPresets(
    presets,
    aiBrief.sector,
  ).slice(0, 4);
  const SelectedBlockIcon =
    BLOCK_META.find((item) => item.type === selectedBlock?.type)?.icon ??
    Blocks;
  const inspectorStep =
    workflowStep === "design" || workflowStep === "variables"
      ? workflowStep
      : "content";

  function changeWorkflowStep(step: WorkflowStep) {
    setWorkflowStep(step);
    if (step === "review") setCommandCenterOpen(true);
  }

  function applyExternalDocument(next: TemplateDocument) {
    commitDocument(() => cloneDocument(next));
    if (!next.blocks.some((block) => block.id === selectedBlockId))
      setSelectedBlockId(next.blocks[0]?.id || "");
  }

  function applyDetectedBrand(brand: Partial<BrandKit>) {
    const nextBrand = { ...brandKit, ...brand };
    setBrandKit(nextBrand);
    commitDocument((current) => {
      current.settings.primaryColor = nextBrand.primaryColor;
      current.settings.accentColor = nextBrand.accentColor;
      current.settings.backgroundColor = nextBrand.backgroundColor;
      current.settings.fontFamily = nextBrand.fontFamily;
      const brandBlock = current.blocks.find((block) => block.type === "brand");
      if (brandBlock) {
        if (nextBrand.name) brandBlock.props.label = nextBrand.name;
        brandBlock.props.logoUrl = nextBrand.logoUrl || "";
      }
      const footer = current.blocks.find((block) => block.type === "footer");
      if (footer) {
        footer.props.company = "{{sender.legal_name}}";
        footer.props.address = "{{sender.postal_address}}";
        footer.props.privacyUrl = "{{sender.privacy_url}}";
      }
      return current;
    });
    setMergeData((data) => ({
      ...data,
      "sender.company": nextBrand.name || data["sender.company"],
      "sender.legal_name":
        nextBrand.legalName || nextBrand.name || data["sender.legal_name"],
      "sender.postal_address":
        nextBrand.postalAddress || data["sender.postal_address"],
      "sender.privacy_url": nextBrand.privacyUrl || data["sender.privacy_url"],
      "sender.privacy_email":
        nextBrand.privacyEmail || data["sender.privacy_email"],
    }));
  }

  return (
    <>
      <Toaster position="bottom-right" richColors />
      <div className={`studio-shell theme-${appTheme} mode-${experienceMode}`}>
        <aside className="app-sidebar">
          <div className="brand-lockup">
            <img
              src="/assets/aurevanta-labs-official.jpg"
              alt="Aurevanta Labs"
            />
            <span>PROSPECTOR</span>
          </div>
          <nav className="main-nav" aria-label="Navegación principal">
            <span className="nav-caption">PROSPECCIÓN</span>
            <button>
              <ContactRound /> Leads
            </button>
            <button>
              <Zap /> Campañas
            </button>
            <button>
              <MessageSquareText /> Mensajes
            </button>
            <span className="nav-caption second">CAMPAIGN STUDIO</span>
            <button
              className="active"
              onClick={() => changeWorkflowStep("library")}
            >
              <LayoutTemplate /> Plantillas <i>Activo</i>
            </button>
            <button onClick={() => setBrandOpen(true)}>
              <Palette /> Kit de marca
            </button>
            <button>
              <History /> Historial
            </button>
            <span className="nav-caption second">ADMINISTRACIÓN</span>
            <button>
              <ShieldCheck /> Supresiones
            </button>
            <button>
              <CircleUserRound /> Cuenta
            </button>
          </nav>
          <div className="sidebar-signal">
            <span className="signal-orbit">
              <i />
            </span>
            <div>
              <strong>Sistema conectado</strong>
              <small>Módulo preparado · v0.3.1</small>
            </div>
          </div>
          <div className="user-chip">
            <div className="avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{displayName.split(" ")[0]}</strong>
              <small>Espacio privado</small>
            </div>
            <MoreHorizontal />
          </div>
        </aside>

        <main className="studio-main">
          <header className="studio-topbar">
            <div className="mobile-menu">
              <Menu />
            </div>
            <div className="title-cluster">
              <div className="breadcrumb">
                <span>Prospector</span>
                <ChevronRight />
                <span>Plantillas</span>
                <ChevronRight />
                <strong>{name}</strong>
              </div>
              <div className="name-row">
                <input
                  aria-label="Nombre de plantilla"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setDirty(true);
                  }}
                />
                <span className={dirty ? "save-state dirty" : "save-state"}>
                  {saving
                    ? "Guardando automáticamente…"
                    : dirty
                      ? "Autoguardado pendiente"
                      : `${lastAutosaveAt ? `Guardada ${lastAutosaveAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : "Guardada"} · v${version}`}
                </span>
              </div>
            </div>
            <div className="top-actions">
              <label className="mode-picker" title="Nivel de herramientas">
                <span>Modo</span>
                <select
                  aria-label="Modo de experiencia"
                  value={experienceMode}
                  onChange={(event) =>
                    changeExperienceMode(event.target.value as ExperienceMode)
                  }
                >
                  <option value="guided">Guiado</option>
                  <option value="professional">Profesional</option>
                </select>
              </label>
              <label
                className="theme-picker"
                title="Apariencia de la aplicación"
              >
                <Palette />
                <span>Tema</span>
                <select
                  aria-label="Tema visual de la aplicación"
                  value={appTheme}
                  onChange={(event) =>
                    changeAppTheme(event.target.value as AppTheme)
                  }
                >
                  <option value="dark">Noche Aurevanta</option>
                  <option value="light">Claro mineral</option>
                  <option value="ocean">Océano profundo</option>
                  <option value="emerald">Esmeralda ejecutiva</option>
                  <option value="violet">Violeta creativo</option>
                </select>
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={undo}
                disabled={!history.length}
                aria-label="Deshacer"
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={redo}
                disabled={!future.length}
                aria-label="Rehacer"
              >
                <Redo2 />
              </Button>
              <span className="top-divider" />
              <Button
                variant="outline"
                className="dark-button campaign-center-button"
                data-tour="review"
                onClick={() => setCommandCenterOpen(true)}
              >
                <ShieldCheck /> Centro de campaña
              </Button>
              <Button
                variant="outline"
                className="dark-button"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye /> Vista previa
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setHelpOpen(true)}
                aria-label="Abrir centro de ayuda"
                title="Ayuda y guía"
              >
                <HelpCircle />
              </Button>
              <Button
                className="save-button"
                data-tour="save"
                onClick={saveTemplate}
                disabled={saving}
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Save />}{" "}
                Guardar
              </Button>
            </div>
          </header>

          <div
            className="workflow-bar"
            data-tour="workflow"
            aria-label="Flujo de creación de plantilla"
          >
            <div className="workflow-heading">
              <span>FLUJO DE TRABAJO</span>
              <small>Completa las fases de izquierda a derecha</small>
            </div>
            <div className="workflow-steps">
              {(
                [
                  ["library", "01", "Elegir plantilla", "Base o diseño propio"],
                  ["content", "02", "Editar contenido", "Bloques y mensaje"],
                  ["design", "03", "Diseño y marca", "Estilo visual"],
                  ["variables", "04", "Personalizar", "Datos dinámicos"],
                  ["review", "05", "Revisar y exportar", "Control final"],
                ] as Array<[WorkflowStep, string, string, string]>
              ).map(([step, number, label, detail]) => (
                <button
                  key={step}
                  className={workflowStep === step ? "active" : ""}
                  onClick={() => changeWorkflowStep(step)}
                >
                  <b>{number}</b>
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
          </div>

          <div className="studio-commandbar">
            <div className="command-group">
              <Button variant="ghost" size="sm" onClick={newTemplate}>
                <FilePlus2 /> Nueva
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-tour="ai"
                onClick={() => setAiOpen(true)}
                className="ai-command"
              >
                <WandSparkles /> Crear con IA
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <Import /> Importar HTML
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCommandPaletteOpen(true)}
              >
                <Search /> Acciones <kbd>Ctrl K</kbd>
              </Button>
            </div>
            <div className="command-group right">
              <Button variant="ghost" size="sm" onClick={duplicateTemplate}>
                <Copy /> Duplicar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadFile(
                    exportableHtml(),
                    `${name.replace(/\W+/g, "-").toLowerCase() || "plantilla"}.html`,
                    "text/html",
                  )
                }
              >
                <Download /> Exportar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBrandOpen(true)}
              >
                <Palette /> Marca
              </Button>
              {templateId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="danger-ghost"
                  onClick={archiveTemplate}
                  aria-label="Archivar"
                >
                  <Archive />
                </Button>
              )}
            </div>
          </div>

          <section className="workspace-grid">
            <aside className="palette-panel" data-tour="blocks">
              <Tabs
                value={workflowStep === "library" ? "library" : "blocks"}
                onValueChange={(value) =>
                  setWorkflowStep(value === "library" ? "library" : "content")
                }
                className="panel-tabs"
              >
                <TabsList className="studio-tabs" variant="line">
                  <TabsTrigger value="blocks">
                    <Blocks /> Bloques
                  </TabsTrigger>
                  <TabsTrigger value="library">
                    <LayoutTemplate /> Biblioteca
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="blocks" className="tab-scroll">
                  <div className="panel-intro">
                    <span>AÑADE BLOQUES</span>
                    <small>Cada bloque se edita de forma independiente</small>
                  </div>
                  <div className="block-palette">
                    <button
                      className="canvas-layer-entry"
                      onClick={() => {
                        setSelectedBlockId("__canvas_background__");
                        setWorkflowStep("design");
                      }}
                    >
                      <span>
                        <ImageIcon />
                      </span>
                      <div>
                        <strong>Fondo de maqueta</strong>
                        <small>Color, imagen, IA y transparencia</small>
                      </div>
                      <ChevronRight />
                    </button>
                    {BLOCK_META.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.type}
                          draggable
                          onDragStart={(event) => {
                            setDraggingNewBlockType(item.type);
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(
                              "application/x-aurevanta-block",
                              item.type,
                            );
                          }}
                          onDragEnd={() => {
                            setDraggingNewBlockType(null);
                            setBlockDropIndex(null);
                          }}
                          onClick={() => addBlock(item.type)}
                        >
                          <span>
                            <Icon />
                          </span>
                          <div>
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </div>
                          <Plus />
                        </button>
                      );
                    })}
                  </div>
                  <div className="structure-title">
                    <span>ARRASTRA PARA REORDENAR</span>
                    <small>{document.blocks.length} bloques</small>
                  </div>
                  <div
                    className={`block-structure ${draggingNewBlockType || draggingBlockId ? "is-dragging" : ""}`}
                  >
                    <div
                      className={`block-structure-row canvas-base-layer ${selectedBlockId === "__canvas_background__" ? "active" : ""}`}
                    >
                      <button
                        className="block-select"
                        onClick={() => {
                          setSelectedBlockId("__canvas_background__");
                          setWorkflowStep("design");
                        }}
                      >
                        <span className="drag-index">BG</span>
                        <ImageIcon />
                        <strong>Fondo de maqueta</strong>
                      </button>
                      <span className="layer-lock">BASE</span>
                    </div>
                    {document.rawHtml && (
                      <div className="raw-html-pill">
                        <Code2 /> HTML importado
                      </div>
                    )}
                    {document.blocks.map((block, index) => {
                      const meta = BLOCK_META.find(
                        (item) => item.type === block.type,
                      );
                      return (
                        <div className="block-structure-slot" key={block.id}>
                          <div
                            className={`block-drop-zone ${blockDropIndex === index ? "active" : ""}`}
                            onDragEnter={() => setBlockDropIndex(index)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect =
                                event.dataTransfer.types.includes(
                                  "application/x-aurevanta-block",
                                )
                                  ? "copy"
                                  : "move";
                            }}
                            onDrop={(event) => dropStructureItem(event, index)}
                          >
                            <span>Soltar aquí</span>
                          </div>
                          <div
                            className={`block-structure-row ${selectedBlockId === block.id ? "active" : ""} ${draggingBlockId === block.id ? "dragging" : ""}`}
                          >
                            <button
                              className="block-select"
                              draggable
                              onDragStart={(event) => {
                                setDraggingBlockId(block.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData(
                                  "application/x-aurevanta-block-id",
                                  block.id,
                                );
                              }}
                              onDragEnd={() => {
                                setDraggingBlockId(null);
                                setBlockDropIndex(null);
                              }}
                              onClick={() => setSelectedBlockId(block.id)}
                            >
                              <span className="drag-index">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <GripVertical />
                              <strong>{meta?.label ?? block.type}</strong>
                            </button>
                            <button
                              className="block-delete"
                              title={`Eliminar ${meta?.label ?? block.type}`}
                              aria-label={`Eliminar ${meta?.label ?? block.type}`}
                              onClick={() => removeBlock(block.id)}
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div
                      className={`block-drop-zone final ${blockDropIndex === document.blocks.length ? "active" : ""}`}
                      onDragEnter={() =>
                        setBlockDropIndex(document.blocks.length)
                      }
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect =
                          event.dataTransfer.types.includes(
                            "application/x-aurevanta-block",
                          )
                            ? "copy"
                            : "move";
                      }}
                      onDrop={(event) =>
                        dropStructureItem(event, document.blocks.length)
                      }
                    >
                      <span>
                        {document.blocks.length
                          ? "Soltar al final"
                          : "Arrastra aquí tu primer bloque"}
                      </span>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="library" className="tab-scroll">
                  <div className="library-search">
                    <Search />
                    <Input
                      placeholder="Buscar negocio, actividad u objetivo"
                      value={search}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSearch(value);
                        if (value)
                          setOpenTemplateGroups(
                            templateCategories.filter(
                              (item) => item !== "Todos",
                            ),
                          );
                      }}
                    />
                  </div>
                  <div className="catalog-controls">
                    <select
                      value={templateCategory}
                      onChange={(event) => {
                        const value = event.target.value;
                        setTemplateCategory(value);
                        if (value !== "Todos") setOpenTemplateGroups([value]);
                      }}
                    >
                      {templateCategories.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <button
                      onClick={() =>
                        applyPreset(
                          presets[Math.floor(Math.random() * presets.length)],
                        )
                      }
                    >
                      <Sparkles /> Aleatoria
                    </button>
                  </div>
                  <div className="global-look-controls">
                    <div className="section-label">
                      <span>CAMBIAR SIN PERDER CONTENIDO</span>
                    </div>
                    <label>
                      <span>Diseño global</span>
                      <select
                        value={
                          DESIGN_PRESETS_100.some(
                            (item) =>
                              item.id === document.creative?.stylePreset,
                          )
                            ? document.creative?.stylePreset
                            : DESIGN_PRESETS_100[0].id
                        }
                        onChange={(event) =>
                          applyCampaignDesign(event.target.value)
                        }
                      >
                        {DESIGN_PRESETS_100.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Tipografía global</span>
                      <select
                        value={
                          FONT_CATALOG_100.some(
                            (item) =>
                              item.id === document.creative?.typographyStyle,
                          )
                            ? document.creative?.typographyStyle
                            : FONT_CATALOG_100[0].id
                        }
                        onChange={(event) =>
                          applyCampaignFont(event.target.value)
                        }
                      >
                        {FONT_CATALOG_100.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.group} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="library-section-label catalog-title">
                    <span>100 NEGOCIOS · 100 DIRECCIONES VISUALES</span>
                    <button
                      onClick={() =>
                        setOpenTemplateGroups(
                          openTemplateGroups.length
                            ? []
                            : templateCategories.filter(
                                (item) => item !== "Todos",
                              ),
                        )
                      }
                    >
                      {openTemplateGroups.length
                        ? "Plegar todas"
                        : "Desplegar todas"}
                      <ChevronDown />
                    </button>
                  </div>
                  <div className="catalog-visual-note">
                    <WandSparkles />
                    <span>
                      <strong>Un visual original por actividad</strong>
                      <small>
                        Elige formato y calidad antes de generar. La imagen se
                        aplicará y quedará guardada.
                      </small>
                    </span>
                    <div className="catalog-output-selectors">
                      <label>
                        <span>Formato</span>
                        <select
                          aria-label="Formato de las imágenes de plantilla"
                          value={catalogImageFormat}
                          onChange={(event) =>
                            setCatalogImageFormat(
                              event.target.value as GeneratedImageFormat,
                            )
                          }
                        >
                          {IMAGE_FORMATS.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label} · {item.ratioLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Resolución</span>
                        <select
                          aria-label="Resolución de las imágenes de plantilla"
                          value={catalogImageResolution}
                          onChange={(event) =>
                            setCatalogImageResolution(
                              event.target.value as "draft" | "2k" | "4k",
                            )
                          }
                        >
                          <option value="draft">Normal · 1 unidad</option>
                          <option value="2k">2K · 2 unidades</option>
                          <option value="4k">4K · 4 unidades</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="template-families">
                    {groupedPresets.map((group) => {
                      const open = openTemplateGroups.includes(group.category);
                      return (
                        <section
                          className={`template-family ${open ? "open" : ""}`}
                          key={group.category}
                        >
                          <button
                            className="template-family-toggle"
                            onClick={() =>
                              setOpenTemplateGroups((current) =>
                                current.includes(group.category)
                                  ? current.filter(
                                      (item) => item !== group.category,
                                    )
                                  : [...current, group.category],
                              )
                            }
                            aria-expanded={open}
                          >
                            <span>
                              <strong>{group.category}</strong>
                              <small>
                                {group.presets.length} actividades · diseños
                                propios
                              </small>
                            </span>
                            <ChevronDown />
                          </button>
                          {open && (
                            <div className="preset-list visual-catalog">
                              {group.presets.map((preset, index) => (
                                <article
                                  className="preset-card-v2"
                                  key={preset.id}
                                >
                                  <button
                                    className="preset-open"
                                    onClick={() => applyPreset(preset)}
                                  >
                                    <TemplatePreview
                                      preset={preset}
                                      imageUrl={contextualAsset(
                                        preset,
                                        mediaAssets,
                                      )}
                                    />
                                    {search && index === 0 && (
                                      <b className="recommend-badge">
                                        MEJOR ENCAJE
                                      </b>
                                    )}
                                    <span className="preset-meta">
                                      <small>{preset.designFamily}</small>
                                      <strong>{preset.name}</strong>
                                      <em>{preset.objective}</em>
                                    </span>
                                  </button>
                                  <div className="preset-actions">
                                    <button onClick={() => applyPreset(preset)}>
                                      Usar estructura
                                    </button>
                                    <button
                                      disabled={imageLoading}
                                      onClick={() =>
                                        void preparePresetImage(preset)
                                      }
                                    >
                                      {imageLoading ? (
                                        <LoaderCircle className="animate-spin" />
                                      ) : (
                                        <WandSparkles />
                                      )}{" "}
                                      Generar visual{" "}
                                      {catalogImageResolution === "draft"
                                        ? "normal"
                                        : catalogImageResolution.toUpperCase()}
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                  {!filteredPresets.length && (
                    <div className="empty-library">
                      <Search />
                      <strong>Sin coincidencia exacta</strong>
                      <small>
                        Prueba con el sector, la actividad o un objetivo
                        diferente.
                      </small>
                    </div>
                  )}
                  <div className="library-section-label saved">
                    <span>MIS PLANTILLAS</span>
                    <small>{savedTemplates.length}</small>
                  </div>
                  {libraryLoading ? (
                    <div className="library-loading">
                      <LoaderCircle className="animate-spin" /> Cargando
                      espacio...
                    </div>
                  ) : savedTemplates.length ? (
                    <div className="saved-list">
                      {savedTemplates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => openStored(template)}
                        >
                          <span>
                            <LayoutTemplate />
                          </span>
                          <div>
                            <strong>{template.name}</strong>
                            <small>
                              {template.category} · v{template.version}
                            </small>
                          </div>
                          <ChevronRight />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-library">
                      <CloudUpload />
                      <strong>Tu espacio está listo</strong>
                      <small>
                        Guarda una plantilla para crear tu primera versión.
                      </small>
                    </div>
                  )}
                  <div className="library-section-label saved">
                    <span>MIS IMÁGENES</span>
                    <small>{mediaAssets.length}</small>
                  </div>
                  {mediaAssets.length > 0 && (
                    <div className="media-smart-search">
                      <Search />
                      <Input
                        value={mediaSearch}
                        onChange={(event) => setMediaSearch(event.target.value)}
                        placeholder="Buscar por negocio, escena, color o campaña"
                      />
                      <small>{filteredMediaAssets.length} resultados</small>
                    </div>
                  )}
                  {mediaLoading ? (
                    <div className="library-loading">
                      <LoaderCircle className="animate-spin" /> Cargando
                      imágenes...
                    </div>
                  ) : filteredMediaAssets.length ? (
                    <div className="asset-library-grid">
                      {filteredMediaAssets.map((asset) => (
                        <button
                          key={asset.id}
                          title={asset.altText || asset.filename}
                          onClick={() => {
                            const target = document.blocks.find(
                              (block) =>
                                block.type === "hero" || block.type === "image",
                            );
                            if (!target)
                              return toast.error(
                                "Añade primero un bloque de imagen",
                              );
                            setSelectedBlockId(target.id);
                            commitDocument((current) => {
                              const block = current.blocks.find(
                                (item) => item.id === target.id,
                              );
                              if (block) {
                                block.props.imageUrl = asset.url;
                                block.props.imageAlt =
                                  asset.altText || asset.filename;
                              }
                              return current;
                            });
                            toast.success("Imagen aplicada a la campaña");
                          }}
                        >
                          <img
                            src={asset.url}
                            alt={asset.altText || asset.filename}
                          />
                          <span>
                            {asset.source.startsWith("openai")
                              ? "IA"
                              : "SUBIDA"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-library">
                      <ImageIcon />
                      <strong>
                        {mediaAssets.length
                          ? "Sin coincidencias"
                          : "Biblioteca preparada"}
                      </strong>
                      <small>
                        {mediaAssets.length
                          ? "Prueba con otro término o limpia la búsqueda."
                          : "Genera o sube una imagen y quedará disponible aquí."}
                      </small>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </aside>

            <section className="canvas-panel" data-tour="canvas">
              <div className="message-fields">
                <div>
                  <label>
                    ASUNTO <span>{subject.length}/60</span>
                  </label>
                  <Input
                    value={subject}
                    onSelect={(event) => rememberTextTarget("subject", event)}
                    onDragOver={(event) => {
                      if (draggingVariableKey) event.preventDefault();
                    }}
                    onDrop={(event) => dropVariable(event, "subject")}
                    onChange={(event) => {
                      setSubject(event.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
                <div>
                  <label>
                    PREHEADER <span>{preheader.length}/110</span>
                  </label>
                  <Input
                    value={preheader}
                    onSelect={(event) => rememberTextTarget("preheader", event)}
                    onDragOver={(event) => {
                      if (draggingVariableKey) event.preventDefault();
                    }}
                    onDrop={(event) => dropVariable(event, "preheader")}
                    onChange={(event) => {
                      setPreheader(event.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
              </div>
              <div className="canvas-toolbar">
                <div className="device-switch">
                  <button
                    className={device === "desktop" ? "active" : ""}
                    onClick={() => setDevice("desktop")}
                  >
                    <Monitor /> Escritorio
                  </button>
                  <button
                    className={device === "mobile" ? "active" : ""}
                    onClick={() => setDevice("mobile")}
                  >
                    <Smartphone /> Móvil
                  </button>
                </div>
                <div className="canvas-zoom">
                  <button
                    onClick={() =>
                      setCanvasZoom((value) => Math.max(60, value - 10))
                    }
                    aria-label="Reducir zoom"
                  >
                    <ZoomOut />
                  </button>
                  <span>{canvasZoom}%</span>
                  <button
                    onClick={() =>
                      setCanvasZoom((value) => Math.min(130, value + 10))
                    }
                    aria-label="Aumentar zoom"
                  >
                    <ZoomIn />
                  </button>
                </div>
                <div className="canvas-meta">
                  <span className="live-dot" /> Vista compatible <i />{" "}
                  {document.settings.width}px
                </div>
              </div>
              <div className="canvas-stage">
                <div className="canvas-drag-hint">
                  <GripVertical />
                  <span>
                    Arrastra cualquier bloque directamente en la maqueta
                  </span>
                </div>
                <div
                  className={`device-frame ${device}`}
                  style={{
                    transform: `scale(${canvasZoom / 100})`,
                    transformOrigin: "top center",
                  }}
                >
                  {device === "mobile" && <div className="phone-speaker" />}
                  <iframe
                    ref={previewFrameRef}
                    title="Vista previa del email"
                    srcDoc={html}
                    sandbox="allow-popups allow-same-origin"
                    onLoad={handlePreviewLoad}
                  />
                </div>
              </div>
              <div className="quality-bar">
                <div className="quality-score">
                  <span
                    style={
                      {
                        "--score": `${quality.score * 3.6}deg`,
                      } as React.CSSProperties
                    }
                  >
                    <strong>{quality.score}</strong>
                  </span>
                  <div>
                    <strong>Impact Score</strong>
                    <small>
                      {quality.score >= 85
                        ? "Lista para validar"
                        : "Revisa las recomendaciones"}
                    </small>
                  </div>
                </div>
                <div className="quality-checks">
                  {quality.checks.slice(0, 4).map((check) => (
                    <span
                      key={check.id}
                      className={check.passed ? "passed" : ""}
                    >
                      {check.passed ? <Check /> : <X />}
                      {check.label}
                    </span>
                  ))}
                </div>
                <button onClick={() => setPreviewOpen(true)}>
                  Ver informe <ChevronRight />
                </button>
              </div>
            </section>

            <aside className="inspector-panel" data-tour="inspector">
              <Tabs
                value={inspectorStep}
                onValueChange={(value) =>
                  setWorkflowStep(value as "content" | "design" | "variables")
                }
                className="panel-tabs inspector-tabs"
              >
                <TabsList
                  className="studio-tabs inspector-tablist"
                  variant="line"
                >
                  <TabsTrigger value="content">Contenido</TabsTrigger>
                  <TabsTrigger value="design">Diseño</TabsTrigger>
                  <TabsTrigger value="variables">Variables</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="content"
                  className="tab-scroll inspector-scroll"
                >
                  {selectedBlock ? (
                    <>
                      <div className="selection-heading">
                        <span>
                          <SelectedBlockIcon />
                        </span>
                        <div>
                          <small>BLOQUE SELECCIONADO</small>
                          <strong>
                            {BLOCK_META.find(
                              (item) => item.type === selectedBlock.type,
                            )?.label ?? selectedBlock.type}
                          </strong>
                        </div>
                        <div className="selection-actions">
                          <button
                            title="Subir"
                            onClick={() => moveBlock(selectedBlock.id, -1)}
                          >
                            <ArrowUp />
                          </button>
                          <button
                            title="Bajar"
                            onClick={() => moveBlock(selectedBlock.id, 1)}
                          >
                            <ArrowDown />
                          </button>
                          <button
                            title="Duplicar"
                            onClick={() => duplicateBlock(selectedBlock.id)}
                          >
                            <Copy />
                          </button>
                          <button
                            title="Eliminar"
                            onClick={() => removeBlock(selectedBlock.id)}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </div>
                      {(selectedBlock.type === "hero" ||
                        selectedBlock.type === "image") && (
                        <div className="inspector-section media-section">
                          <div className="section-label">
                            <span>IMAGEN</span>
                            <button onClick={() => openImageStudio("block")}>
                              <Sparkles /> Generar imagen
                            </button>
                          </div>
                          <div className="media-grid">
                            {MEDIA_OPTIONS.map((media) => (
                              <button
                                key={media.url}
                                className={
                                  selectedBlock.props.imageUrl === media.url
                                    ? "active"
                                    : ""
                                }
                                onClick={() =>
                                  applyMediaToTarget(
                                    media.url,
                                    media.label,
                                    "block",
                                  )
                                }
                              >
                                <img src={media.url} alt={media.label} />
                                <span>{media.label}</span>
                              </button>
                            ))}
                          </div>
                          {mediaAssets.length > 0 && (
                            <>
                              <div className="section-label personal-media-label">
                                <span>MI BIBLIOTECA</span>
                                <small>{mediaAssets.length} recursos</small>
                              </div>
                              <div className="personal-media-grid">
                                {mediaAssets.map((asset) => (
                                  <button
                                    key={asset.id}
                                    className={
                                      selectedBlock.props.imageUrl === asset.url
                                        ? "active"
                                        : ""
                                    }
                                    onClick={() =>
                                      applyMediaToTarget(
                                        asset.url,
                                        asset.altText || asset.filename,
                                        "block",
                                      )
                                    }
                                    title={asset.altText || asset.filename}
                                  >
                                    <img
                                      src={asset.url}
                                      alt={asset.altText || asset.filename}
                                    />
                                    <span>
                                      {asset.source.startsWith("openai")
                                        ? "IA"
                                        : "Propia"}
                                      {asset.width ? ` · ${asset.width}px` : ""}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          <button
                            className="upload-button"
                            onClick={() => {
                              setImageTarget("block");
                              uploadRef.current?.click();
                            }}
                          >
                            <CloudUpload /> Subir imagen propia o PNG
                            transparente
                          </button>
                          <input
                            ref={uploadRef}
                            className="sr-only"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleImageInputChange}
                          />
                        </div>
                      )}
                      <div className="inspector-section fields-section block-layout-section">
                        <div className="section-label">
                          <span>POSICIÓN Y TAMAÑO · SOLO ESTE BLOQUE</span>
                        </div>
                        {selectedBlock.type === "hero" && (
                          <div className="property-field">
                            <label>Posición del texto dentro del hero</label>
                            <div className="position-grid">
                              {[
                                "top-left",
                                "top-center",
                                "top-right",
                                "center-left",
                                "center-center",
                                "center-right",
                                "bottom-left",
                                "bottom-center",
                                "bottom-right",
                              ].map((position) => {
                                const [vertical, horizontal] =
                                  position.split("-");
                                const active =
                                  selectedBlock.props.verticalAlign ===
                                    vertical &&
                                  (selectedBlock.props.textAlign ??
                                    selectedBlock.props.align) === horizontal;
                                return (
                                  <button
                                    key={position}
                                    title={`${vertical} ${horizontal}`}
                                    aria-label={`${vertical} ${horizontal}`}
                                    className={active ? "active" : ""}
                                    onClick={() =>
                                      commitDocument((current) => {
                                        const block = current.blocks.find(
                                          (item) => item.id === selectedBlockId,
                                        );
                                        if (block) {
                                          block.props.verticalAlign = vertical;
                                          block.props.textAlign = horizontal;
                                        }
                                        return current;
                                      })
                                    }
                                  >
                                    <i />
                                  </button>
                                );
                              })}
                            </div>
                            <small className="field-help">
                              Solo mueve el texto; no desplaza ni redimensiona
                              el hero.
                            </small>
                          </div>
                        )}
                        <div className="property-field">
                          <label>
                            Ancho del bloque{" "}
                            <span>
                              {selectedBlock.props.blockWidth ?? 100}%
                            </span>
                          </label>
                          <RangeWithNumber
                            min={30}
                            max={100}
                            step={5}
                            suffix="%"
                            value={Number(
                              selectedBlock.props.blockWidth ?? 100,
                            )}
                            onChange={(value) =>
                              updateBlockProp("blockWidth", value)
                            }
                          />
                        </div>
                        <div className="property-field">
                          <label>
                            Margen exterior{" "}
                            <span>
                              {selectedBlock.props.edgePadding ?? 40}px
                            </span>
                          </label>
                          <RangeWithNumber
                            min={0}
                            max={60}
                            step={2}
                            suffix="px"
                            value={Number(
                              selectedBlock.props.edgePadding ?? 40,
                            )}
                            onChange={(value) =>
                              updateBlockProp("edgePadding", value)
                            }
                          />
                          <small className="field-help">
                            0 px hace que el bloque ocupe todo el ancho.
                          </small>
                        </div>
                        <div className="spacing-pair">
                          <div className="property-field">
                            <label>
                              Espacio arriba{" "}
                              <span>
                                {selectedBlock.props.paddingTop ?? 0}px
                              </span>
                            </label>
                            <RangeWithNumber
                              min={0}
                              max={100}
                              step={4}
                              suffix="px"
                              value={Number(
                                selectedBlock.props.paddingTop ?? 0,
                              )}
                              onChange={(value) =>
                                updateBlockProp("paddingTop", value)
                              }
                            />
                          </div>
                          <div className="property-field">
                            <label>
                              Espacio abajo{" "}
                              <span>
                                {selectedBlock.props.paddingBottom ?? 24}px
                              </span>
                            </label>
                            <RangeWithNumber
                              min={0}
                              max={100}
                              step={4}
                              suffix="px"
                              value={Number(
                                selectedBlock.props.paddingBottom ?? 24,
                              )}
                              onChange={(value) =>
                                updateBlockProp("paddingBottom", value)
                              }
                            />
                          </div>
                        </div>
                        <div className="property-field">
                          <label>Alineación del bloque</label>
                          <div className="align-control">
                            {[
                              {
                                id: "left",
                                icon: <AlignLeft />,
                                label: "Izquierda",
                              },
                              {
                                id: "center",
                                icon: <AlignCenter />,
                                label: "Centro",
                              },
                              {
                                id: "right",
                                icon: <AlignRight />,
                                label: "Derecha",
                              },
                            ].map((item) => (
                              <button
                                key={item.id}
                                title={item.label}
                                className={
                                  (selectedBlock.props.blockAlign ?? "left") ===
                                  item.id
                                    ? "active"
                                    : ""
                                }
                                onClick={() =>
                                  updateBlockProp("blockAlign", item.id)
                                }
                              >
                                {item.icon}
                              </button>
                            ))}
                          </div>
                          <small className="field-help">
                            Mueve el bloque sin cambiar la alineación de su
                            contenido.
                          </small>
                        </div>
                        {[
                          "brand",
                          "hero",
                          "heading",
                          "artText",
                          "text",
                          "button",
                          "columns",
                          "footer",
                        ].includes(selectedBlock.type) && (
                          <div className="property-field">
                            <label>Alineación del texto</label>
                            <div className="align-control align-four">
                              {[
                                {
                                  id: "left",
                                  icon: <AlignLeft />,
                                  label: "Izquierda",
                                },
                                {
                                  id: "center",
                                  icon: <AlignCenter />,
                                  label: "Centro",
                                },
                                {
                                  id: "right",
                                  icon: <AlignRight />,
                                  label: "Derecha",
                                },
                                {
                                  id: "justify",
                                  icon: <AlignJustify />,
                                  label: "Justificado",
                                },
                              ].map((item) => (
                                <button
                                  key={item.id}
                                  title={item.label}
                                  aria-label={item.label}
                                  className={
                                    (selectedBlock.props.textAlign ??
                                      selectedBlock.props.align ??
                                      "left") === item.id
                                      ? "active"
                                      : ""
                                  }
                                  onClick={() =>
                                    updateBlockProp("textAlign", item.id)
                                  }
                                >
                                  {item.icon}
                                </button>
                              ))}
                            </div>
                            <small className="field-help">
                              Incluye justificación completa y no modifica la
                              posición ni el ancho del bloque.
                            </small>
                          </div>
                        )}
                        <div className="spacing-pair">
                          <div className="property-field">
                            <label>
                              Radio{" "}
                              <span>
                                {selectedBlock.props.blockRadius ?? 0}px
                              </span>
                            </label>
                            <RangeWithNumber
                              min={0}
                              max={80}
                              step={2}
                              suffix="px"
                              value={Number(
                                selectedBlock.props.blockRadius ?? 0,
                              )}
                              onChange={(value) =>
                                updateBlockProp("blockRadius", value)
                              }
                            />
                          </div>
                          <div className="property-field">
                            <label>
                              Borde{" "}
                              <span>
                                {selectedBlock.props.borderWidth ?? 0}px
                              </span>
                            </label>
                            <RangeWithNumber
                              min={0}
                              max={8}
                              suffix="px"
                              value={Number(
                                selectedBlock.props.borderWidth ?? 0,
                              )}
                              onChange={(value) =>
                                updateBlockProp("borderWidth", value)
                              }
                            />
                          </div>
                        </div>
                        <div className="geometry-grid">
                          <label className="color-field">
                            <span>Fondo del bloque</span>
                            <div>
                              <input
                                type="color"
                                value={String(
                                  selectedBlock.type === "button"
                                    ? selectedBlock.props.buttonColor
                                    : selectedBlock.props.backgroundColor ===
                                        "transparent"
                                      ? document.settings.contentColor
                                      : selectedBlock.props.backgroundColor,
                                )}
                                onChange={(event) => {
                                  const color = event.target.value;
                                  commitDocument((current) => {
                                    const block = current.blocks.find(
                                      (item) => item.id === selectedBlockId,
                                    );
                                    if (block?.type === "button") {
                                      block.props.buttonColor = color;
                                      block.props.backgroundColor =
                                        "transparent";
                                      block.props.buttonStyle = "solid";
                                    } else if (block) {
                                      block.props.backgroundColor = color;
                                    }
                                    return current;
                                  });
                                }}
                              />
                              <button
                                className={
                                  selectedBlock.props.backgroundColor ===
                                  "transparent"
                                    ? "active"
                                    : ""
                                }
                                onClick={() =>
                                  commitDocument((current) => {
                                    const block = current.blocks.find(
                                      (item) => item.id === selectedBlockId,
                                    );
                                    if (block) {
                                      block.props.backgroundColor =
                                        "transparent";
                                      if (block.type === "button")
                                        block.props.buttonStyle = "ghost";
                                    }
                                    return current;
                                  })
                                }
                              >
                                {selectedBlock.props.backgroundColor ===
                                "transparent"
                                  ? "✓ Sin fondo"
                                  : "Sin fondo"}
                              </button>
                            </div>
                            <small className="field-help">
                              {selectedBlock.type === "button"
                                ? "Sin fondo elimina también el relleno oscuro del botón."
                                : "Sin fondo deja ver la capa de la maqueta."}
                            </small>
                          </label>
                          <label className="color-field">
                            <span>Borde</span>
                            <div>
                              <input
                                type="color"
                                value={String(
                                  selectedBlock.props.borderColor ?? "#dbe3ea",
                                )}
                                onChange={(event) =>
                                  updateBlockProp(
                                    "borderColor",
                                    event.target.value,
                                  )
                                }
                              />
                              <code>
                                {String(
                                  selectedBlock.props.borderColor ?? "#dbe3ea",
                                )}
                              </code>
                            </div>
                          </label>
                        </div>
                        <div className="spacing-pair">
                          <div className="property-field">
                            <label>
                              Giro{" "}
                              <span>{selectedBlock.props.rotation ?? 0}°</span>
                            </label>
                            <RangeWithNumber
                              min={-12}
                              max={12}
                              suffix="°"
                              value={Number(selectedBlock.props.rotation ?? 0)}
                              onChange={(value) =>
                                updateBlockProp("rotation", value)
                              }
                            />
                          </div>
                          <div className="property-field">
                            <label>
                              Ángulo{" "}
                              <span>{selectedBlock.props.skewX ?? 0}°</span>
                            </label>
                            <RangeWithNumber
                              min={-16}
                              max={16}
                              suffix="°"
                              value={Number(selectedBlock.props.skewX ?? 0)}
                              onChange={(value) =>
                                updateBlockProp("skewX", value)
                              }
                            />
                          </div>
                        </div>
                        <div className="property-field">
                          <label>Sombra</label>
                          <select
                            className="studio-select"
                            value={String(selectedBlock.props.shadow ?? "none")}
                            onChange={(event) =>
                              updateBlockProp("shadow", event.target.value)
                            }
                          >
                            <option value="none">Sin sombra</option>
                            <option value="soft">Suave</option>
                            <option value="strong">Profunda</option>
                            <option value="glow">Resplandor</option>
                          </select>
                        </div>
                        <div className="property-field">
                          <label>Profundidad 3D del bloque</label>
                          <select
                            className="studio-select"
                            value={String(
                              selectedBlock.props.blockDepth ?? "none",
                            )}
                            onChange={(event) =>
                              updateBlockProp("blockDepth", event.target.value)
                            }
                          >
                            <option value="none">Sin profundidad</option>
                            <option value="lifted">Elevado 3D</option>
                            <option value="deep">Extrusión profunda</option>
                            <option value="floating">Flotante premium</option>
                          </select>
                        </div>
                        {selectedBlock.props.blockDepth !== "none" && (
                          <label className="color-field">
                            <span>Color de profundidad</span>
                            <div>
                              <input
                                type="color"
                                value={String(
                                  selectedBlock.props.blockDepthColor ??
                                    "#0f172a",
                                )}
                                onChange={(event) =>
                                  updateBlockProp(
                                    "blockDepthColor",
                                    event.target.value,
                                  )
                                }
                              />
                              <code>
                                {String(
                                  selectedBlock.props.blockDepthColor ??
                                    "#0f172a",
                                )}
                              </code>
                            </div>
                          </label>
                        )}
                      </div>
                      <div className="inspector-section fields-section">
                        <div className="section-label">
                          <span>CONTENIDO Y ESTILO · SOLO ESTE BLOQUE</span>
                        </div>
                        {Object.entries(selectedBlock.props).map(
                          ([key, value]) => {
                            if (
                              LAYOUT_PROPS.has(key) ||
                              DESIGN_PROPS.has(key) ||
                              key === "align" ||
                              (selectedBlock.type === "button" &&
                                [
                                  "buttonRadius",
                                  "buttonColor",
                                  "buttonWidth",
                                ].includes(key)) ||
                              (selectedBlock.type === "hero" &&
                                key === "verticalAlign")
                            )
                              return null;
                            if (typeof value === "boolean")
                              return (
                                <label key={key} className="toggle-field">
                                  <span>
                                    <strong>{PROP_LABELS[key] ?? key}</strong>
                                    <small>Control visual del bloque</small>
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={value}
                                    onChange={(event) =>
                                      updateBlockProp(key, event.target.checked)
                                    }
                                  />
                                </label>
                              );
                            if (key === "imagePosition")
                              return (
                                <div className="property-field" key={key}>
                                  <label>{PROP_LABELS[key]}</label>
                                  <select
                                    className="studio-select"
                                    value={String(value)}
                                    onChange={(event) =>
                                      updateBlockProp(key, event.target.value)
                                    }
                                  >
                                    <option value="left">Izquierda</option>
                                    <option value="center">Centro</option>
                                    <option value="right">Derecha</option>
                                    <option value="top">Arriba</option>
                                    <option value="bottom">Abajo</option>
                                  </select>
                                </div>
                              );
                            if (
                              [
                                "buttonStyle",
                                "buttonShape",
                                "buttonSize",
                                "buttonWidth",
                              ].includes(key)
                            ) {
                              const options: Record<
                                string,
                                Array<[string, string]>
                              > = {
                                buttonStyle: [
                                  ["solid", "Sólido"],
                                  ["outline", "Contorno"],
                                  ["ghost", "Sin fondo"],
                                ],
                                buttonShape: [
                                  ["square", "Recto"],
                                  ["rounded", "Redondeado"],
                                  ["pill", "Píldora"],
                                ],
                                buttonSize: [
                                  ["small", "Pequeño"],
                                  ["medium", "Medio"],
                                  ["large", "Grande"],
                                ],
                                buttonWidth: [
                                  ["auto", "Según contenido"],
                                  ["full", "Ancho completo"],
                                ],
                              };
                              return (
                                <div className="property-field" key={key}>
                                  <label>{PROP_LABELS[key]}</label>
                                  <select
                                    className="studio-select"
                                    value={String(value)}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      if (key !== "buttonShape") {
                                        updateBlockProp(key, nextValue);
                                        return;
                                      }
                                      commitDocument((current) => {
                                        const block = current.blocks.find(
                                          (item) => item.id === selectedBlockId,
                                        );
                                        if (block) {
                                          block.props.buttonShape = nextValue;
                                          block.props.blockRadius =
                                            nextValue === "square"
                                              ? 0
                                              : nextValue === "rounded"
                                                ? 12
                                                : 80;
                                        }
                                        return current;
                                      });
                                    }}
                                  >
                                    {options[key].map(([id, label]) => (
                                      <option key={id} value={id}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }
                            if (
                              [
                                "textColor",
                                "buttonColor",
                                "buttonTextColor",
                                "color",
                              ].includes(key)
                            )
                              return (
                                <label className="color-field" key={key}>
                                  <span>{PROP_LABELS[key] ?? key}</span>
                                  <div>
                                    <input
                                      type="color"
                                      value={String(value)}
                                      onChange={(event) =>
                                        updateBlockProp(key, event.target.value)
                                      }
                                    />
                                    <code>{String(value)}</code>
                                  </div>
                                </label>
                              );
                            if (typeof value === "number") {
                              const range =
                                key === "minHeight"
                                  ? {
                                      min: 220,
                                      max: 620,
                                      step: 20,
                                      suffix: "px",
                                    }
                                  : key === "paddingX"
                                    ? {
                                        min: 18,
                                        max: 72,
                                        step: 2,
                                        suffix: "px",
                                      }
                                    : key === "widthPercent"
                                      ? {
                                          min: 30,
                                          max: 100,
                                          step: 5,
                                          suffix: "%",
                                        }
                                      : key === "height"
                                        ? {
                                            min: 8,
                                            max: 80,
                                            step: 1,
                                            suffix: "px",
                                          }
                                        : key === "fontSize"
                                          ? {
                                              min: 11,
                                              max: 64,
                                              step: 1,
                                              suffix: "px",
                                            }
                                          : key === "lineHeight"
                                            ? {
                                                min: 1.1,
                                                max: 2.2,
                                                step: 0.05,
                                                suffix: "",
                                              }
                                            : key === "fontWeight"
                                              ? {
                                                  min: 300,
                                                  max: 800,
                                                  step: 100,
                                                  suffix: "",
                                                }
                                              : key === "buttonRadius"
                                                ? {
                                                    min: 0,
                                                    max: 80,
                                                    step: 2,
                                                    suffix: "px",
                                                  }
                                                : key === "rotation"
                                                  ? {
                                                      min: -12,
                                                      max: 12,
                                                      step: 1,
                                                      suffix: "°",
                                                    }
                                                  : {
                                                      min: 1,
                                                      max:
                                                        key === "level" ? 3 : 8,
                                                      step: 1,
                                                      suffix: "",
                                                    };
                              return (
                                <div className="property-field" key={key}>
                                  <label>
                                    {PROP_LABELS[key] ?? key}
                                    <span>
                                      {value}
                                      {range.suffix}
                                    </span>
                                  </label>
                                  <RangeWithNumber
                                    className={fieldClass()}
                                    min={range.min}
                                    max={range.max}
                                    step={range.step}
                                    suffix={range.suffix}
                                    value={value}
                                    onChange={(next) =>
                                      updateBlockProp(key, next)
                                    }
                                  />
                                </div>
                              );
                            }
                            return (
                              <div className="property-field" key={key}>
                                <label>{PROP_LABELS[key] ?? key}</label>
                                {MULTILINE_PROPS.has(key) ? (
                                  <Textarea
                                    className={fieldClass()}
                                    rows={
                                      key === "body" || key === "content"
                                        ? 4
                                        : 3
                                    }
                                    value={String(value)}
                                    onSelect={(event) =>
                                      rememberTextTarget("block", event, key)
                                    }
                                    onDragOver={(event) => {
                                      if (draggingVariableKey)
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) =>
                                      dropVariable(event, "block", key)
                                    }
                                    onChange={(event) =>
                                      updateBlockProp(key, event.target.value)
                                    }
                                  />
                                ) : (
                                  <Input
                                    className={fieldClass()}
                                    value={String(value)}
                                    onSelect={(event) =>
                                      rememberTextTarget("block", event, key)
                                    }
                                    onDragOver={(event) => {
                                      if (draggingVariableKey)
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) =>
                                      dropVariable(event, "block", key)
                                    }
                                    onChange={(event) =>
                                      updateBlockProp(key, event.target.value)
                                    }
                                  />
                                )}
                              </div>
                            );
                          },
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="empty-inspector">
                      <SquareMousePointer />
                      <strong>Selecciona un bloque</strong>
                      <small>
                        El contenido importado puede previsualizarse y
                        exportarse, pero no editarse por bloques.
                      </small>
                    </div>
                  )}
                </TabsContent>
                <TabsContent
                  value="design"
                  className="tab-scroll inspector-scroll"
                >
                  <div className="inspector-section fields-section canvas-background-editor">
                    <div className="section-label">
                      <span>FONDO COMPLETO DE LA MAQUETA</span>
                      <button onClick={() => openImageStudio("background")}>
                        <Sparkles /> Generar fondo
                      </button>
                    </div>
                    <div
                      className="canvas-background-modes"
                      role="group"
                      aria-label="Tipo de fondo de la maqueta"
                    >
                      <button
                        className={
                          canvasBackgroundMode === "color" ? "active" : ""
                        }
                        onClick={() =>
                          updateCanvasSetting("backgroundMode", "color")
                        }
                      >
                        <Palette />
                        <span>
                          <strong>Color</strong>
                          <small>Color uniforme</small>
                        </span>
                      </button>
                      <button
                        className={
                          canvasBackgroundMode === "image" ? "active" : ""
                        }
                        onClick={() =>
                          updateCanvasSetting("backgroundMode", "image")
                        }
                      >
                        <ImageIcon />
                        <span>
                          <strong>Imagen</strong>
                          <small>Fondo visual</small>
                        </span>
                      </button>
                      <button
                        className={
                          canvasBackgroundMode === "transparent" ? "active" : ""
                        }
                        onClick={() =>
                          updateCanvasSetting("backgroundMode", "transparent")
                        }
                      >
                        <SquareMousePointer />
                        <span>
                          <strong>Sin fondo</strong>
                          <small>Deja ver el exterior</small>
                        </span>
                      </button>
                    </div>
                    <div className="background-mode-row">
                      <label className="color-field">
                        <span>Color base</span>
                        <div>
                          <input
                            type="color"
                            value={document.settings.contentColor}
                            onChange={(event) =>
                              updateCanvasSetting(
                                "contentColor",
                                event.target.value,
                              )
                            }
                          />
                          <code>{document.settings.contentColor}</code>
                        </div>
                      </label>
                      <button
                        className="upload-button compact-upload"
                        onClick={() => {
                          setImageTarget("background");
                          backgroundUploadRef.current?.click();
                        }}
                      >
                        <CloudUpload /> Subir fondo
                      </button>
                      <input
                        ref={backgroundUploadRef}
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleImageInputChange}
                      />
                    </div>
                    {document.settings.backgroundImageUrl ? (
                      <div className="background-current">
                        <img
                          src={document.settings.backgroundImageUrl}
                          alt="Fondo actual de la maqueta"
                        />
                        <div>
                          <strong>
                            {canvasBackgroundMode === "image"
                              ? "Fondo de imagen activo"
                              : "Imagen conservada"}
                          </strong>
                          <small>
                            {canvasBackgroundMode === "image"
                              ? "Se verá detrás de todos los bloques transparentes."
                              : "Puedes volver a Imagen sin perder esta selección."}
                          </small>
                          <button
                            onClick={() =>
                              updateCanvasSetting("backgroundImageUrl", "")
                            }
                          >
                            <Trash2 /> Quitar imagen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="background-empty">
                        <ImageIcon />
                        <span>
                          <strong>Sin imagen seleccionada</strong>
                          <small>
                            Genera, sube o elige una imagen de tu galería.
                          </small>
                        </span>
                      </div>
                    )}
                    {mediaAssets.length > 0 && (
                      <>
                        <div className="section-label personal-media-label">
                          <span>ELEGIR DE MI GALERÍA</span>
                          <small>{mediaAssets.length}</small>
                        </div>
                        <div className="personal-media-grid background-gallery">
                          {mediaAssets.map((asset) => (
                            <button
                              key={asset.id}
                              className={
                                document.settings.backgroundImageUrl ===
                                asset.url
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                applyMediaToTarget(
                                  asset.url,
                                  asset.altText || asset.filename,
                                  "background",
                                )
                              }
                              title={asset.altText || asset.filename}
                            >
                              <img
                                src={asset.url}
                                alt={asset.altText || asset.filename}
                              />
                              <span>
                                {asset.source.startsWith("openai")
                                  ? "IA"
                                  : "Propia"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {canvasBackgroundMode === "image" && (
                      <>
                        <div className="property-field">
                          <label>
                            Visibilidad de la imagen{" "}
                            <span>
                              {document.settings.backgroundImageOpacity ?? 100}%
                            </span>
                          </label>
                          <RangeWithNumber
                            min={0}
                            max={100}
                            step={5}
                            suffix="%"
                            value={Number(
                              document.settings.backgroundImageOpacity ?? 100,
                            )}
                            onChange={(value) =>
                              updateCanvasSetting(
                                "backgroundImageOpacity",
                                value,
                              )
                            }
                          />
                          <small className="field-help">
                            Bájala para que el color base cubra progresivamente
                            la imagen.
                          </small>
                        </div>
                        <div className="spacing-pair">
                          <div className="property-field">
                            <label>Ajuste</label>
                            <select
                              className="studio-select"
                              value={
                                document.settings.backgroundImageSize ?? "cover"
                              }
                              onChange={(event) =>
                                updateCanvasSetting(
                                  "backgroundImageSize",
                                  event.target.value as
                                    "cover" | "contain" | "auto",
                                )
                              }
                            >
                              <option value="cover">
                                Cubrir toda la maqueta
                              </option>
                              <option value="contain">
                                Mostrar imagen completa
                              </option>
                              <option value="auto">Tamaño original</option>
                            </select>
                          </div>
                          <div className="property-field">
                            <label>Repetición</label>
                            <select
                              className="studio-select"
                              value={
                                document.settings.backgroundImageRepeat ??
                                "no-repeat"
                              }
                              onChange={(event) =>
                                updateCanvasSetting(
                                  "backgroundImageRepeat",
                                  event.target.value as "no-repeat" | "repeat",
                                )
                              }
                            >
                              <option value="no-repeat">Sin repetir</option>
                              <option value="repeat">Repetir patrón</option>
                            </select>
                          </div>
                        </div>
                        <div className="property-field">
                          <label>Posición del fondo</label>
                          <div className="position-grid">
                            {[
                              "left top",
                              "center top",
                              "right top",
                              "left center",
                              "center center",
                              "right center",
                              "left bottom",
                              "center bottom",
                              "right bottom",
                            ].map((position) => (
                              <button
                                key={position}
                                title={position}
                                aria-label={position}
                                className={
                                  (document.settings.backgroundImagePosition ??
                                    "center center") === position
                                    ? "active"
                                    : ""
                                }
                                onClick={() =>
                                  updateCanvasSetting(
                                    "backgroundImagePosition",
                                    position as NonNullable<
                                      TemplateDocument["settings"]["backgroundImagePosition"]
                                    >,
                                  )
                                }
                              >
                                <i />
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="png-note">
                      <ShieldCheck />
                      <span>
                        <strong>Transparencia real, de capa a capa</strong>
                        <small>
                          Un PNG con alfa y un bloque en “Sin fondo” mostrarán
                          la imagen o el color de esta maqueta. La aplicación
                          avisará si el archivo solo parece PNG pero es
                          completamente opaco.
                        </small>
                      </span>
                    </div>
                  </div>
                  {selectedBlock ? (
                    <>
                      <div className="selection-heading">
                        <span>
                          <SelectedBlockIcon />
                        </span>
                        <div>
                          <small>DISEÑO DEL BLOQUE</small>
                          <strong>
                            {BLOCK_META.find(
                              (item) => item.type === selectedBlock.type,
                            )?.label ?? selectedBlock.type}
                          </strong>
                        </div>
                        <div className="selection-actions">
                          <button
                            title="Duplicar"
                            onClick={() => duplicateBlock(selectedBlock.id)}
                          >
                            <Copy />
                          </button>
                          <button
                            title="Eliminar"
                            onClick={() => removeBlock(selectedBlock.id)}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </div>
                      <div className="inspector-section fields-section">
                        <div className="section-label">
                          <span>TIPOGRAFÍA · SOLO ESTE BLOQUE</span>
                        </div>
                        {[
                          "brand",
                          "hero",
                          "heading",
                          "artText",
                          "text",
                          "button",
                          "image",
                          "columns",
                          "footer",
                        ].includes(selectedBlock.type) ? (
                          <>
                            <div className="property-field">
                              <label>
                                Catálogo tipográfico <span>100 opciones</span>
                              </label>
                              <div className="font-search">
                                <Search />
                                <Input
                                  placeholder="Buscar tipografía o estilo"
                                  value={fontSearch}
                                  onChange={(event) =>
                                    setFontSearch(event.target.value)
                                  }
                                />
                              </div>
                              <div className="font-catalog block-font-catalog">
                                {visibleFonts.map((font) => (
                                  <button
                                    key={font.id}
                                    className={
                                      selectedBlock.props.fontPreset === font.id
                                        ? "active"
                                        : ""
                                    }
                                    onClick={() => applyFontPreset(font)}
                                  >
                                    <span>
                                      <strong>{font.name}</strong>
                                      <small>{font.group}</small>
                                    </span>
                                    <em
                                      style={{
                                        fontFamily: font.value,
                                        fontWeight: font.weight,
                                        letterSpacing: `${font.letterSpacing}px`,
                                        textTransform: font.transform,
                                      }}
                                    >
                                      {font.sample}
                                    </em>
                                  </button>
                                ))}
                              </div>
                            </div>
                            {selectedBlock.type === "hero" ? (
                              <>
                                <div className="property-field">
                                  <label>
                                    Tamaño del titular{" "}
                                    <span>
                                      {selectedBlock.props.titleFontSize ?? 34}
                                      px
                                    </span>
                                  </label>
                                  <RangeWithNumber
                                    min={18}
                                    max={72}
                                    suffix="px"
                                    value={Number(
                                      selectedBlock.props.titleFontSize ?? 34,
                                    )}
                                    onChange={(value) =>
                                      updateBlockProp("titleFontSize", value)
                                    }
                                  />
                                </div>
                                <div className="property-field">
                                  <label>
                                    Tamaño del texto{" "}
                                    <span>
                                      {selectedBlock.props.bodyFontSize ?? 17}px
                                    </span>
                                  </label>
                                  <RangeWithNumber
                                    min={10}
                                    max={36}
                                    suffix="px"
                                    value={Number(
                                      selectedBlock.props.bodyFontSize ?? 17,
                                    )}
                                    onChange={(value) =>
                                      updateBlockProp("bodyFontSize", value)
                                    }
                                  />
                                </div>
                              </>
                            ) : (
                              <div className="property-field">
                                <label>
                                  Tamaño{" "}
                                  <span>
                                    {selectedBlock.props.fontSize ?? 16}px
                                  </span>
                                </label>
                                <RangeWithNumber
                                  min={9}
                                  max={72}
                                  suffix="px"
                                  value={Number(
                                    selectedBlock.props.fontSize ?? 16,
                                  )}
                                  onChange={(value) =>
                                    updateBlockProp("fontSize", value)
                                  }
                                />
                              </div>
                            )}
                            <div className="spacing-pair">
                              <div className="property-field">
                                <label>
                                  Peso{" "}
                                  <span>
                                    {selectedBlock.props.fontWeight ?? 400}
                                  </span>
                                </label>
                                <RangeWithNumber
                                  min={100}
                                  max={900}
                                  step={100}
                                  value={Number(
                                    selectedBlock.props.fontWeight ?? 400,
                                  )}
                                  onChange={(value) =>
                                    updateBlockProp("fontWeight", value)
                                  }
                                />
                              </div>
                              <div className="property-field">
                                <label>
                                  Interlineado{" "}
                                  <span>
                                    {selectedBlock.props.lineHeight ?? 1.5}
                                  </span>
                                </label>
                                <RangeWithNumber
                                  min={0.8}
                                  max={2.4}
                                  step={0.05}
                                  value={Number(
                                    selectedBlock.props.lineHeight ?? 1.5,
                                  )}
                                  onChange={(value) =>
                                    updateBlockProp("lineHeight", value)
                                  }
                                />
                              </div>
                            </div>
                            <div className="property-field">
                              <label>
                                Espaciado entre letras{" "}
                                <span>
                                  {selectedBlock.props.letterSpacing ?? 0}px
                                </span>
                              </label>
                              <RangeWithNumber
                                min={-2}
                                max={12}
                                step={0.5}
                                suffix="px"
                                value={Number(
                                  selectedBlock.props.letterSpacing ?? 0,
                                )}
                                onChange={(value) =>
                                  updateBlockProp("letterSpacing", value)
                                }
                              />
                            </div>
                            <div className="property-field">
                              <label>Transformación</label>
                              <select
                                className="studio-select"
                                value={String(
                                  selectedBlock.props.textTransform ?? "none",
                                )}
                                onChange={(e) =>
                                  updateBlockProp(
                                    "textTransform",
                                    e.target.value,
                                  )
                                }
                              >
                                <option value="none">Como está escrito</option>
                                <option value="uppercase">MAYÚSCULAS</option>
                                <option value="lowercase">minúsculas</option>
                                <option value="capitalize">
                                  Iniciales en mayúscula
                                </option>
                              </select>
                            </div>
                            {selectedBlock.type === "artText" && (
                              <>
                                <div className="property-field">
                                  <label>Efecto artístico</label>
                                  <select
                                    className="studio-select"
                                    value={String(
                                      selectedBlock.props.effect ?? "straight",
                                    )}
                                    onChange={(e) =>
                                      updateBlockProp("effect", e.target.value)
                                    }
                                  >
                                    <option value="straight">Recto</option>
                                    <option value="arc">Arco</option>
                                    <option value="wave">Onda</option>
                                    <option value="outline">Contorno</option>
                                    <option value="rotate">Inclinado</option>
                                  </select>
                                </div>
                                <div className="property-field">
                                  <label>Estilo</label>
                                  <select
                                    className="studio-select"
                                    value={String(
                                      selectedBlock.props.fontStyle ??
                                        "display",
                                    )}
                                    onChange={(e) =>
                                      updateBlockProp(
                                        "fontStyle",
                                        e.target.value,
                                      )
                                    }
                                  >
                                    <option value="display">Display</option>
                                    <option value="normal">Normal</option>
                                    <option value="italic">Cursiva</option>
                                  </select>
                                </div>
                              </>
                            )}
                            <label className="color-field">
                              <span>Color del texto</span>
                              <div>
                                <input
                                  type="color"
                                  value={String(
                                    selectedBlock.props.color ??
                                      selectedBlock.props.textColor ??
                                      selectedBlock.props.buttonTextColor ??
                                      document.settings.textColor,
                                  )}
                                  onChange={(e) =>
                                    updateBlockProp(
                                      selectedBlock.type === "artText"
                                        ? "color"
                                        : selectedBlock.type === "button"
                                          ? "buttonTextColor"
                                          : "textColor",
                                      e.target.value,
                                    )
                                  }
                                />
                                <code>
                                  {String(
                                    selectedBlock.props.color ??
                                      selectedBlock.props.textColor ??
                                      selectedBlock.props.buttonTextColor ??
                                      document.settings.textColor,
                                  )}
                                </code>
                              </div>
                            </label>
                          </>
                        ) : (
                          <div className="empty-inspector compact">
                            <strong>Este bloque no contiene texto</strong>
                            <small>
                              Utiliza Contenido para modificar su forma,
                              espaciado y color.
                            </small>
                          </div>
                        )}
                      </div>
                      {[
                        "brand",
                        "hero",
                        "heading",
                        "artText",
                        "text",
                        "button",
                        "image",
                        "columns",
                        "footer",
                      ].includes(selectedBlock.type) && (
                        <div className="inspector-section fields-section">
                          <div className="section-label">
                            <span>
                              ALINEACIÓN Y PROFUNDIDAD · SOLO ESTE BLOQUE
                            </span>
                          </div>
                          <div className="property-field">
                            <label>Alineación del texto</label>
                            <div className="align-control align-four">
                              {[
                                {
                                  id: "left",
                                  icon: <AlignLeft />,
                                  label: "Izquierda",
                                },
                                {
                                  id: "center",
                                  icon: <AlignCenter />,
                                  label: "Centro",
                                },
                                {
                                  id: "right",
                                  icon: <AlignRight />,
                                  label: "Derecha",
                                },
                                {
                                  id: "justify",
                                  icon: <AlignJustify />,
                                  label: "Justificado",
                                },
                              ].map((item) => (
                                <button
                                  key={item.id}
                                  title={item.label}
                                  className={
                                    (selectedBlock.props.textAlign ??
                                      selectedBlock.props.align ??
                                      "left") === item.id
                                      ? "active"
                                      : ""
                                  }
                                  onClick={() =>
                                    updateBlockProp("textAlign", item.id)
                                  }
                                >
                                  {item.icon}
                                </button>
                              ))}
                            </div>
                            <small className="field-help">
                              Alinea únicamente el contenido; no mueve ni
                              redimensiona el bloque.
                            </small>
                          </div>
                          <div className="property-field">
                            <label>Efecto 3D del texto</label>
                            <select
                              className="studio-select"
                              value={String(
                                selectedBlock.props.textDepth ?? "none",
                              )}
                              onChange={(event) =>
                                updateBlockProp("textDepth", event.target.value)
                              }
                            >
                              <option value="none">Sin efecto</option>
                              <option value="soft">Relieve suave</option>
                              <option value="extruded">Extrusión 3D</option>
                              <option value="neon">Neón volumétrico</option>
                            </select>
                          </div>
                          {selectedBlock.props.textDepth !== "none" && (
                            <label className="color-field">
                              <span>Color del efecto 3D</span>
                              <div>
                                <input
                                  type="color"
                                  value={String(
                                    selectedBlock.props.textDepthColor ??
                                      "#111827",
                                  )}
                                  onChange={(event) =>
                                    updateBlockProp(
                                      "textDepthColor",
                                      event.target.value,
                                    )
                                  }
                                />
                                <code>
                                  {String(
                                    selectedBlock.props.textDepthColor ??
                                      "#111827",
                                  )}
                                </code>
                              </div>
                            </label>
                          )}
                          {selectedBlock.type === "button" && (
                            <>
                              <div className="property-field">
                                <label>Profundidad 3D del botón</label>
                                <select
                                  className="studio-select"
                                  value={String(
                                    selectedBlock.props.buttonDepth ?? "none",
                                  )}
                                  onChange={(event) =>
                                    updateBlockProp(
                                      "buttonDepth",
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="none">Plano</option>
                                  <option value="raised">Elevado 3D</option>
                                  <option value="deep">
                                    Extrusión profunda
                                  </option>
                                  <option value="glass">
                                    Cristal flotante
                                  </option>
                                </select>
                              </div>
                              {selectedBlock.props.buttonDepth !== "none" && (
                                <label className="color-field">
                                  <span>Color de profundidad del botón</span>
                                  <div>
                                    <input
                                      type="color"
                                      value={String(
                                        selectedBlock.props.buttonDepthColor ??
                                          "#064852",
                                      )}
                                      onChange={(event) =>
                                        updateBlockProp(
                                          "buttonDepthColor",
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <code>
                                      {String(
                                        selectedBlock.props.buttonDepthColor ??
                                          "#064852",
                                      )}
                                    </code>
                                  </div>
                                </label>
                              )}
                            </>
                          )}
                          {selectedBlock.type === "columns" && (
                            <label className="color-field">
                              <span>Fondo interior de las columnas</span>
                              <div>
                                <input
                                  type="color"
                                  value={String(
                                    selectedBlock.props
                                      .columnBackgroundColor === "transparent"
                                      ? document.settings.contentColor
                                      : (selectedBlock.props
                                          .columnBackgroundColor ??
                                          document.settings.contentColor),
                                  )}
                                  onChange={(event) =>
                                    updateBlockProp(
                                      "columnBackgroundColor",
                                      event.target.value,
                                    )
                                  }
                                />
                                <button
                                  className={
                                    selectedBlock.props
                                      .columnBackgroundColor === "transparent"
                                      ? "active"
                                      : ""
                                  }
                                  onClick={() =>
                                    updateBlockProp(
                                      "columnBackgroundColor",
                                      "transparent",
                                    )
                                  }
                                >
                                  {selectedBlock.props.columnBackgroundColor ===
                                  "transparent"
                                    ? "✓ Transparentes"
                                    : "Sin fondo"}
                                </button>
                              </div>
                            </label>
                          )}
                        </div>
                      )}
                      {selectedBlock.type === "button" && (
                        <div className="inspector-section fields-section">
                          <div className="section-label">
                            <span>POSICIÓN DEL BOTÓN · SOLO ESTE BLOQUE</span>
                          </div>
                          <div className="property-field">
                            <label>Botón dentro de su contenedor</label>
                            <div className="align-control">
                              {[
                                {
                                  id: "left",
                                  icon: <AlignLeft />,
                                  label: "Izquierda",
                                },
                                {
                                  id: "center",
                                  icon: <AlignCenter />,
                                  label: "Centro",
                                },
                                {
                                  id: "right",
                                  icon: <AlignRight />,
                                  label: "Derecha",
                                },
                              ].map((item) => (
                                <button
                                  key={item.id}
                                  title={item.label}
                                  className={
                                    (selectedBlock.props.align ?? "center") ===
                                    item.id
                                      ? "active"
                                      : ""
                                  }
                                  onClick={() =>
                                    updateBlockProp("align", item.id)
                                  }
                                >
                                  {item.icon}
                                </button>
                              ))}
                            </div>
                            <small className="field-help">
                              Es independiente de la posición del bloque y de la
                              alineación del texto del botón.
                            </small>
                          </div>
                        </div>
                      )}
                      <div className="inspector-section block-design-note">
                        <ShieldCheck />
                        <div>
                          <strong>Edición aislada</strong>
                          <small>
                            La posición del bloque, la alineación del texto, los
                            colores y los efectos 3D son independientes y solo
                            afectan al bloque seleccionado.
                          </small>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="empty-inspector">
                      <SquareMousePointer />
                      <strong>Selecciona un bloque</strong>
                      <small>
                        Después podrás diseñarlo de manera independiente.
                      </small>
                    </div>
                  )}
                </TabsContent>
                <TabsContent
                  value="variables"
                  className="tab-scroll inspector-scroll"
                >
                  <div className="variables-intro">
                    <span>
                      <Database />
                    </span>
                    <div>
                      <strong>Variables arrastrables</strong>
                      <small>
                        Arrastra una variable y suéltala en el punto exacto de
                        cualquier campo de texto.
                      </small>
                    </div>
                  </div>
                  <div className="variable-groups">
                    {["lead", "campaign", "sender", "system", "custom"].map(
                      (source) => {
                        const variables = document.variables.filter(
                          (variable) => variable.source === source,
                        );
                        if (!variables.length) return null;
                        return (
                          <div key={source}>
                            <div className="section-label">
                              <span>
                                {
                                  (
                                    {
                                      lead: "LEAD",
                                      campaign: "CAMPAÑA",
                                      sender: "REMITENTE",
                                      system: "SISTEMA",
                                      custom: "PERSONALIZADAS",
                                    } as Record<string, string>
                                  )[source]
                                }
                              </span>
                            </div>
                            {variables.map((variable) => (
                              <div className="variable-row" key={variable.key}>
                                <div className="variable-actions">
                                  <button
                                    draggable
                                    onDragStart={(event) => {
                                      setDraggingVariableKey(variable.key);
                                      event.dataTransfer.effectAllowed = "copy";
                                      event.dataTransfer.setData(
                                        "application/x-aurevanta-variable",
                                        variable.key,
                                      );
                                    }}
                                    onDragEnd={() =>
                                      setDraggingVariableKey(null)
                                    }
                                    onClick={() => insertVariable(variable.key)}
                                  >
                                    <span>
                                      <GripVertical /> {variable.label}
                                    </span>
                                    <code>{`{{${variable.key}}}`}</code>
                                  </button>
                                  <button
                                    title="Eliminar variable"
                                    aria-label={`Eliminar ${variable.label}`}
                                    onClick={() => removeVariable(variable.key)}
                                  >
                                    <Trash2 />
                                  </button>
                                </div>
                                <Input
                                  value={
                                    mergeData[variable.key] ?? variable.fallback
                                  }
                                  onChange={(event) =>
                                    setMergeData((data) => ({
                                      ...data,
                                      [variable.key]: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        );
                      },
                    )}
                  </div>
                  {DEFAULT_VARIABLES.some(
                    (variable) =>
                      !document.variables.some(
                        (item) => item.key === variable.key,
                      ),
                  ) && (
                    <div className="variable-catalog">
                      <div className="section-label">
                        <span>VARIABLES ELIMINADAS</span>
                        <small>Recuperables</small>
                      </div>
                      {DEFAULT_VARIABLES.filter(
                        (variable) =>
                          !document.variables.some(
                            (item) => item.key === variable.key,
                          ),
                      ).map((variable) => (
                        <button
                          key={variable.key}
                          onClick={() => restoreVariable(variable)}
                        >
                          <Plus />
                          <span>
                            <strong>{variable.label}</strong>
                            <code>{`{{${variable.key}}}`}</code>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="custom-variable-form">
                    <div className="section-label">
                      <span>NUEVA VARIABLE</span>
                      <small>Personalizada</small>
                    </div>
                    <Input
                      placeholder="Nombre visible"
                      value={customVariable.label}
                      onChange={(event) =>
                        setCustomVariable({
                          ...customVariable,
                          label: event.target.value,
                        })
                      }
                    />
                    <Input
                      placeholder="Clave · ej. contrato.fecha"
                      value={customVariable.key}
                      onChange={(event) =>
                        setCustomVariable({
                          ...customVariable,
                          key: event.target.value,
                        })
                      }
                    />
                    <Input
                      placeholder="Valor de prueba opcional"
                      value={customVariable.fallback}
                      onChange={(event) =>
                        setCustomVariable({
                          ...customVariable,
                          fallback: event.target.value,
                        })
                      }
                    />
                    <Button variant="outline" onClick={addCustomVariable}>
                      <Plus /> Crear variable
                    </Button>
                  </div>
                  <div className="variable-note">
                    <ShieldCheck />
                    <span>
                      <strong>Datos de prueba aislados</strong>
                      <small>
                        Estos valores solo alimentan la vista previa; nunca se
                        guardan en el HTML final.
                      </small>
                    </span>
                  </div>
                </TabsContent>
              </Tabs>
            </aside>
          </section>
        </main>

        <CampaignCommandCenter
          open={commandCenterOpen}
          onOpenChange={setCommandCenterOpen}
          document={document}
          subject={subject}
          preheader={preheader}
          name={name}
          templateId={templateId}
          selectedBlockId={selectedBlockId}
          mergeData={mergeData}
          mediaAssets={mediaAssets}
          onDocumentChange={applyExternalDocument}
          onSubjectChange={(value) => {
            setSubject(value);
            setDirty(true);
          }}
          onPreheaderChange={(value) => {
            setPreheader(value);
            setDirty(true);
          }}
          onMergeDataChange={setMergeData}
          onSelectBlock={setSelectedBlockId}
          onApplyBrand={applyDetectedBrand}
          apiFetch={apiFetch}
        />

        <GuidedTour
          key={tourOpen ? "tour-open" : "tour-closed"}
          open={tourOpen}
          onOpenChange={setTourOpen}
          steps={TOUR_STEPS}
        />

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="studio-dialog help-center-dialog">
            <DialogHeader>
              <div className="dialog-kicker"><span><HelpCircle /></span> AYUDA INTEGRADA</div>
              <DialogTitle>¿Qué necesitas hacer?</DialogTitle>
              <DialogDescription>
                Consulta una fase concreta o inicia el recorrido visual sobre la propia aplicación.
              </DialogDescription>
            </DialogHeader>
            <div className="help-center-actions">
              <Button onClick={() => { setHelpOpen(false); setTourOpen(true); }}>
                <Sparkles /> Iniciar recorrido guiado
              </Button>
              <Button variant="outline" onClick={() => { setHelpOpen(false); setCommandPaletteOpen(true); }}>
                <Search /> Buscar una acción
              </Button>
            </div>
            <div className="help-topic-grid">
              {HELP_SECTIONS.map((section, index) => (
                <article key={section.id}>
                  <header><span>{String(index + 1).padStart(2, "0")}</span><strong>{section.title}</strong></header>
                  <p>{section.description}</p>
                  <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                </article>
              ))}
            </div>
            <div className="help-center-note">
              <ShieldCheck />
              <span><strong>Antes de utilizar una campaña</strong> Revisa los controles críticos y recuerda que Prospector validará destinatarios, base legal, oposición y supresiones en el flujo de envío.</span>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
          <DialogContent className="studio-dialog command-palette-dialog">
            <DialogHeader>
              <div className="dialog-kicker">
                <span>
                  <Search />
                </span>
                ACCIONES RÁPIDAS
              </div>
              <DialogTitle>¿Qué quieres hacer?</DialogTitle>
              <DialogDescription>
                Busca una acción y ejecútala sin recorrer los menús.
              </DialogDescription>
            </DialogHeader>
            <div className="command-search">
              <Search />
              <Input
                autoFocus
                value={commandSearch}
                onChange={(event) => setCommandSearch(event.target.value)}
                placeholder="Ej. generar, revisar, exportar, botón…"
              />
            </div>
            <div className="command-results">
              {[
                {
                  label: "Crear campaña completa con IA",
                  keywords: "generar wizard ia",
                  icon: WandSparkles,
                  run: () => setAiOpen(true),
                },
                {
                  label: "Abrir centro de revisión",
                  keywords: "revisar enlaces accesibilidad spam",
                  icon: ShieldCheck,
                  run: () => setCommandCenterOpen(true),
                },
                {
                  label: "Añadir llamada a la acción",
                  keywords: "insertar bloque boton cta",
                  icon: SquareMousePointer,
                  run: () => addBlock("button"),
                },
                {
                  label: "Añadir hero visual",
                  keywords: "insertar bloque imagen hero",
                  icon: GalleryHorizontalEnd,
                  run: () => addBlock("hero"),
                },
                {
                  label: "Editar fondo de maqueta",
                  keywords: "fondo imagen color transparencia",
                  icon: ImageIcon,
                  run: () => {
                    setSelectedBlockId("__canvas_background__");
                    setWorkflowStep("design");
                  },
                },
                {
                  label: "Editar kit de marca",
                  keywords: "marca logo colores empresa",
                  icon: Palette,
                  run: () => setBrandOpen(true),
                },
                {
                  label: "Ver versión móvil",
                  keywords: "movil responsive smartphone",
                  icon: Smartphone,
                  run: () => setDevice("mobile"),
                },
                {
                  label: "Importar HTML",
                  keywords: "importar codigo",
                  icon: Import,
                  run: () => setImportOpen(true),
                },
                {
                  label: "Exportar HTML",
                  keywords: "descargar exportar",
                  icon: Download,
                  run: () =>
                    downloadFile(
                      exportableHtml(),
                      `${name.replace(/\W+/g, "-").toLowerCase() || "plantilla"}.html`,
                      "text/html",
                    ),
                },
                {
                  label: "Abrir centro de ayuda",
                  keywords: "ayuda guía tour tutorial aprender manual",
                  icon: HelpCircle,
                  run: () => setHelpOpen(true),
                },
              ]
                .filter((command) =>
                  `${command.label} ${command.keywords}`
                    .toLowerCase()
                    .includes(commandSearch.toLowerCase()),
                )
                .map((command) => {
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.label}
                      onClick={() => {
                        command.run();
                        setCommandPaletteOpen(false);
                        setCommandSearch("");
                      }}
                    >
                      <span>
                        <Icon />
                      </span>
                      <strong>{command.label}</strong>
                      <ChevronRight />
                    </button>
                  );
                })}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={aiOpen} onOpenChange={setAiOpen}>
          <DialogContent className="studio-dialog ai-dialog campaign-wizard-dialog">
            <DialogHeader>
              <div className="dialog-kicker">
                <span>
                  <WandSparkles />
                </span>
                DIRECTOR DE CAMPAÑA IA
              </div>
              <DialogTitle>
                {
                  [
                    "Identifica la empresa",
                    "Define la campaña",
                    "Selecciona la audiencia",
                    "Dirige el diseño y la imagen",
                    "Configura la acción",
                    "Revisa y genera",
                  ][aiStep - 1]
                }
              </DialogTitle>
              <DialogDescription>
                La IA construirá textos, imagen contextual, diseño, enlace y
                plantilla editable, y guardará el resultado automáticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="wizard-progress">
              <div>
                {[1, 2, 3, 4, 5, 6].map((step) => (
                  <span
                    key={step}
                    className={
                      step === aiStep ? "active" : step < aiStep ? "done" : ""
                    }
                  >
                    {step < aiStep ? <Check /> : step}
                  </span>
                ))}
              </div>
              <small>Paso {aiStep} de 6</small>
            </div>
            <div className="wizard-stage">
              {aiStep === 1 && (
                <section>
                  <h3>Empresa y contexto</h3>
                  <p>
                    Indica la actividad y el sistema recomendará las plantillas
                    con mejor encaje.
                  </p>
                  <div className="dialog-form grid-two">
                    <label>
                      <span>Nombre de la empresa *</span>
                      <Input
                        placeholder="Ej. Aurevanta Labs"
                        value={aiBrief.companyName}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            companyName: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Sector o actividad *</span>
                      <Input
                        placeholder="Ej. Limpieza industrial"
                        value={aiBrief.sector}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, sector: e.target.value })
                        }
                      />
                    </label>
                    <label className="wide">
                      <span>¿Qué hace y qué la diferencia? *</span>
                      <Textarea
                        rows={4}
                        placeholder="Servicios, especialización, territorio, experiencia y propuesta de valor"
                        value={aiBrief.companyContext}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            companyContext: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  {recommendedWizardTemplates.length > 0 && (
                    <div className="wizard-recommendations">
                      <div className="section-label">
                        <span>RECOMENDADAS PARA ESTE NEGOCIO</span>
                        <small>Selección inteligente</small>
                      </div>
                      <div>
                        {recommendedWizardTemplates.map((preset) => (
                          <button
                            key={preset.id}
                            className={
                              aiBrief.templatePresetId === preset.id
                                ? "active"
                                : ""
                            }
                            onClick={() => selectWizardTemplate(preset.id)}
                          >
                            <TemplatePreview preset={preset} compact />
                            <span>
                              <strong>{preset.name}</strong>
                              <small>
                                {preset.category} · {preset.designFamily}
                              </small>
                            </span>
                            <ChevronRight />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="context-chips">
                    {[
                      "Experiencia y trayectoria",
                      "Clientes de referencia",
                      "Certificaciones",
                      "Cobertura geográfica",
                      "Equipo especializado",
                      "Resultados demostrables",
                    ].map((item) => (
                      <button
                        key={item}
                        className={
                          aiBrief.proofPoints.includes(item) ? "active" : ""
                        }
                        onClick={() => toggleProofPoint(item)}
                      >
                        {aiBrief.proofPoints.includes(item) ? (
                          <Check />
                        ) : (
                          <Plus />
                        )}
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {aiStep === 2 && (
                <section>
                  <h3>Objetivo y oferta</h3>
                  <p>
                    Define qué debe conseguir el correo y qué recibirá el
                    destinatario.
                  </p>
                  <div className="dialog-form grid-two">
                    <label className="wide">
                      <span>Nombre interno de la campaña</span>
                      <Input
                        placeholder="Ej. Captación industrial septiembre"
                        value={aiBrief.campaignName}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            campaignName: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="wide">
                      <span>Objetivo principal *</span>
                      <Input
                        placeholder="Conseguir reuniones, presentar un servicio, lanzar un producto…"
                        value={aiBrief.objective}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, objective: e.target.value })
                        }
                      />
                    </label>
                    <label className="wide">
                      <span>Oferta o mensaje central *</span>
                      <Textarea
                        rows={4}
                        placeholder="Qué ofreces, ventaja, condiciones y beneficio esperado"
                        value={aiBrief.offer}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, offer: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </section>
              )}
              {aiStep === 3 && (
                <section>
                  <h3>Destinatario y voz</h3>
                  <p>
                    La campaña ajustará vocabulario, argumentos y extensión al
                    perfil seleccionado.
                  </p>
                  <div className="dialog-form grid-two">
                    <label className="wide">
                      <span>¿A quién va dirigida? *</span>
                      <Input
                        placeholder="Ej. Directores de mantenimiento de plantas industriales"
                        value={aiBrief.audience}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, audience: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Tono</span>
                      <select
                        value={aiBrief.tone}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, tone: e.target.value })
                        }
                      >
                        <option>Estratégico y humano</option>
                        <option>Corporativo y serio</option>
                        <option>Cercano e informal</option>
                        <option>Persuasivo y enérgico</option>
                        <option>Premium y exclusivo</option>
                        <option>Divertido y juvenil</option>
                        <option>Didáctico e infantil</option>
                      </select>
                    </label>
                    <label>
                      <span>Cantidad de contenido</span>
                      <select
                        value={aiBrief.contentDensity}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            contentDensity: e.target.value,
                          })
                        }
                      >
                        <option value="minimal">Breve · impacto rápido</option>
                        <option value="balanced">Equilibrado</option>
                        <option value="editorial">
                          Desarrollado · explicativo
                        </option>
                      </select>
                    </label>
                  </div>
                </section>
              )}
              {aiStep === 4 && (
                <section>
                  <div className="wizard-title-row">
                    <div>
                      <h3>Dirección creativa completa</h3>
                      <p>
                        Cada actividad utiliza una composición y una dirección
                        fotográfica propias.
                      </p>
                    </div>
                    <button onClick={randomizeWizardDirection}>
                      <Sparkles /> Sorpréndeme
                    </button>
                  </div>
                  <div className="catalog-metrics">
                    <span>
                      <strong>100</strong> composiciones
                    </span>
                    <span>
                      <strong>20</strong> familias visuales
                    </span>
                    <span>
                      <strong>100</strong> tipografías
                    </span>
                    <span>
                      <strong>100</strong> escenas
                    </span>
                  </div>
                  <div className="dialog-form grid-two catalog-selectors">
                    <label>
                      <span>Plantilla y negocio</span>
                      <select
                        value={aiBrief.templatePresetId}
                        onChange={(e) => selectWizardTemplate(e.target.value)}
                      >
                        {TEMPLATE_RECIPES_100.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.category} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Sistema visual</span>
                      <select
                        value={aiBrief.designPresetId}
                        onChange={(e) => {
                          const item = catalogItem(
                            DESIGN_PRESETS_100,
                            e.target.value,
                          );
                          setAiBrief({
                            ...aiBrief,
                            designPresetId: item.id,
                            stylePreset: item.id,
                            layoutStyle: item.layout,
                            cornerStyle: item.corner,
                            imageStyle: item.imageStyle,
                          });
                        }}
                      >
                        {DESIGN_PRESETS_100.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Tipografía</span>
                      <select
                        value={aiBrief.fontPresetId}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            fontPresetId: e.target.value,
                            typographyStyle: e.target.value,
                          })
                        }
                      >
                        {FONT_CATALOG_100.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.group} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Escena adaptada al negocio</span>
                      <select
                        value={aiBrief.imageRecipeId}
                        onChange={(e) => {
                          const item = catalogItem(
                            IMAGE_RECIPES_100,
                            e.target.value,
                          );
                          setAiBrief({
                            ...aiBrief,
                            imageRecipeId: item.id,
                            imageStyle: item.style,
                            imagePrompt: item.prompt,
                          });
                        }}
                      >
                        {IMAGE_RECIPES_100.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sector} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Formato de imagen</span>
                      <select
                        value={aiBrief.imageFormat}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            imageFormat: e.target.value as GeneratedImageFormat,
                          })
                        }
                      >
                        {IMAGE_FORMATS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · {item.ratioLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Ajuste al diseño</span>
                      <select
                        value={aiBrief.imageSizingMode}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            imageSizingMode: e.target.value as
                              "preset" | "hero" | "canvas",
                          })
                        }
                      >
                        <option value="hero">
                          Detectar tamaño del hero · recomendado
                        </option>
                        <option value="canvas">
                          Detectar maqueta completa
                        </option>
                        <option value="preset">Usar formato estándar</option>
                      </select>
                    </label>
                    <label>
                      <span>Posición de los sujetos</span>
                      <select
                        value={aiBrief.imageSubjectPosition}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            imageSubjectPosition: e.target.value,
                          })
                        }
                      >
                        <option value="Sujetos en el tercio inferior, con espacio visual limpio en la zona superior">
                          Abajo · espacio libre superior
                        </option>
                        <option value="Sujetos abajo a la izquierda, con espacio negativo a la derecha y arriba">
                          Abajo izquierda
                        </option>
                        <option value="Sujetos abajo a la derecha, con espacio negativo a la izquierda y arriba">
                          Abajo derecha
                        </option>
                        <option value="Sujetos centrados en la zona inferior, composición simétrica y aire superior">
                          Abajo centrados
                        </option>
                        <option value="Sujeto principal en primer plano inferior, entorno visible y profundidad cinematográfica">
                          Primer plano inferior
                        </option>
                        <option value="Composición editorial libre adaptada al contexto del negocio">
                          Automática según contexto
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>Resolución y consumo</span>
                      <select
                        value={aiBrief.imageResolution}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            imageResolution: e.target.value as
                              "draft" | "2k" | "4k",
                          })
                        }
                      >
                        <option value="draft">
                          Normal · 1 unidad estimada
                        </option>
                        <option value="2k">2K · 2 unidades estimadas</option>
                        <option value="4k">4K · 4 unidades estimadas</option>
                      </select>
                    </label>
                    <label>
                      <span>Texto HTML sobre el hero</span>
                      <select
                        value={aiBrief.heroTextAmount}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            heroTextAmount: e.target.value,
                          })
                        }
                      >
                        <option value="none">Solo titular</option>
                        <option value="minimal">Mínimo · recomendado</option>
                        <option value="balanced">Titular y texto breve</option>
                      </select>
                    </label>
                    <label>
                      <span>Texto integrado en la imagen</span>
                      <select
                        value={aiBrief.embeddedImageText}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            embeddedImageText: e.target.value,
                          })
                        }
                      >
                        <option value="none">Sin texto · recomendado</option>
                        <option value="headline">
                          Un claim corto del negocio
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>Fondo general</span>
                      <select
                        value={aiBrief.backgroundMood}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            backgroundMood: e.target.value,
                          })
                        }
                      >
                        <option value="brand">Adaptado al diseño</option>
                        <option value="light">Luminoso</option>
                        <option value="dark">Oscuro premium</option>
                        <option value="contrast">Contraste de marca</option>
                      </select>
                    </label>
                    <label className="wide">
                      <span>Dirección adicional para la imagen</span>
                      <Textarea
                        rows={3}
                        value={aiBrief.imagePrompt}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            imagePrompt: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="creative-combination-preview">
                    <i
                      style={{
                        background: `linear-gradient(135deg,${catalogItem(DESIGN_PRESETS_100, aiBrief.designPresetId).primary},${catalogItem(DESIGN_PRESETS_100, aiBrief.designPresetId).accent})`,
                      }}
                    />
                    <span>
                      <strong>
                        {
                          catalogItem(
                            DESIGN_PRESETS_100,
                            aiBrief.designPresetId,
                          ).archetype
                        }
                      </strong>
                      <small>
                        {
                          catalogItem(FONT_CATALOG_100, aiBrief.fontPresetId)
                            .name
                        }{" "}
                        ·{" "}
                        {
                          catalogItem(IMAGE_RECIPES_100, aiBrief.imageRecipeId)
                            .name
                        }{" "}
                        · {getImageFormat(aiBrief.imageFormat).label}{" "}
                        {getImageFormat(aiBrief.imageFormat).ratioLabel}
                      </small>
                    </span>
                  </div>
                  <label className="toggle-field wizard-toggle">
                    <span>
                      <strong>Generar visual principal original</strong>
                      <small>
                        Imagen contextual{" "}
                        {getImageFormat(aiBrief.imageFormat).ratioLabel} en
                        resolución{" "}
                        {aiBrief.imageResolution === "draft"
                          ? "normal"
                          : aiBrief.imageResolution.toUpperCase()}
                        , guardada automáticamente en tu biblioteca
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={aiBrief.generateImage}
                      onChange={(e) =>
                        setAiBrief({
                          ...aiBrief,
                          generateImage: e.target.checked,
                        })
                      }
                    />
                  </label>
                </section>
              )}
              {aiStep === 5 && (
                <section>
                  <h3>Acción, enlace y destino</h3>
                  <p>
                    Indica exactamente qué ocurrirá al pulsar el botón
                    principal.
                  </p>
                  <div className="dialog-form grid-two">
                    <label>
                      <span>Acción deseada</span>
                      <select
                        value={aiBrief.actionType}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, actionType: e.target.value })
                        }
                      >
                        <option>Solicitar información</option>
                        <option>Reservar una reunión</option>
                        <option>Comprar ahora</option>
                        <option>Descargar contenido</option>
                        <option>Ver propuesta</option>
                        <option>Inscribirse</option>
                        <option>Llamar por teléfono</option>
                        <option>Responder al correo</option>
                      </select>
                    </label>
                    <label>
                      <span>URL de destino *</span>
                      <Input
                        type="url"
                        placeholder="https://empresa.es/servicio"
                        value={aiBrief.destinationUrl}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            destinationUrl: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="wide">
                      <span>¿Qué encontrará el usuario al llegar?</span>
                      <Textarea
                        rows={3}
                        placeholder="Formulario, agenda, página de producto, dossier…"
                        value={aiBrief.landingContext}
                        onChange={(e) =>
                          setAiBrief({
                            ...aiBrief,
                            landingContext: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </section>
              )}
              {aiStep === 6 && (
                <section>
                  <h3>Todo preparado para generar</h3>
                  <p>
                    La IA realizará el proceso completo y guardará una campaña
                    editable junto con su imagen.
                  </p>
                  <div className="wizard-summary">
                    <div>
                      <small>EMPRESA</small>
                      <strong>{aiBrief.companyName}</strong>
                      <span>{aiBrief.sector}</span>
                    </div>
                    <div>
                      <small>OBJETIVO</small>
                      <strong>{aiBrief.objective}</strong>
                      <span>{aiBrief.offer}</span>
                    </div>
                    <div>
                      <small>AUDIENCIA</small>
                      <strong>{aiBrief.audience}</strong>
                      <span>
                        {aiBrief.tone} · {aiBrief.contentDensity}
                      </span>
                    </div>
                    <div>
                      <small>COMBINACIÓN CREATIVA</small>
                      <strong>
                        {
                          catalogItem(
                            DESIGN_PRESETS_100,
                            aiBrief.designPresetId,
                          ).name
                        }
                      </strong>
                      <span>
                        {
                          catalogItem(FONT_CATALOG_100, aiBrief.fontPresetId)
                            .name
                        }{" "}
                        ·{" "}
                        {
                          catalogItem(IMAGE_RECIPES_100, aiBrief.imageRecipeId)
                            .name
                        }{" "}
                        ·{" "}
                        {aiBrief.generateImage
                          ? `Imagen ${aiBrief.imageResolution === "draft" ? "normal" : aiBrief.imageResolution.toUpperCase()} incluida`
                          : "Sin nueva imagen"}
                      </span>
                    </div>
                    <div>
                      <small>DESTINO</small>
                      <strong>{aiBrief.actionType}</strong>
                      <span>{aiBrief.destinationUrl}</span>
                    </div>
                  </div>
                  {aiLoading && (
                    <div className="wizard-generating">
                      <LoaderCircle className="animate-spin" />
                      <div>
                        <strong>{aiProgress}</strong>
                        <small>
                          No cierres esta ventana. Las resoluciones más altas
                          pueden tardar unos minutos.
                        </small>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
            <DialogFooter className="wizard-footer">
              <Button
                variant="ghost"
                onClick={() =>
                  aiStep === 1
                    ? setAiOpen(false)
                    : setAiStep((step) => step - 1)
                }
                disabled={aiLoading}
              >
                {aiStep === 1 ? (
                  "Cancelar"
                ) : (
                  <>
                    <ChevronLeft />
                    Atrás
                  </>
                )}
              </Button>
              <Button
                className="save-button"
                disabled={aiLoading}
                onClick={() => {
                  if (
                    aiStep === 1 &&
                    (!aiBrief.companyName.trim() ||
                      !aiBrief.sector.trim() ||
                      !aiBrief.companyContext.trim())
                  )
                    return toast.error(
                      "Completa los datos esenciales de la empresa",
                    );
                  if (
                    aiStep === 2 &&
                    (!aiBrief.objective.trim() || !aiBrief.offer.trim())
                  )
                    return toast.error("Define el objetivo y la oferta");
                  if (aiStep === 3 && !aiBrief.audience.trim())
                    return toast.error("Indica a quién va dirigida la campaña");
                  if (
                    aiStep === 5 &&
                    !/^https?:\/\/.+/.test(aiBrief.destinationUrl)
                  )
                    return toast.error("Introduce una URL completa y válida");
                  if (aiStep < 6) setAiStep((step) => step + 1);
                  else void generateTemplate();
                }}
              >
                {aiLoading ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Generando campaña
                  </>
                ) : aiStep < 6 ? (
                  <>
                    Continuar
                    <ChevronRight />
                  </>
                ) : (
                  <>
                    <Sparkles />
                    Generar todo con IA
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent className="studio-dialog image-dialog image-studio-dialog">
            <DialogHeader>
              <div className="dialog-kicker">
                <span>
                  <ImageIcon />
                </span>
                IMAGE STUDIO IA
              </div>
              <DialogTitle>
                {imageTarget === "background"
                  ? "Genera el fondo completo de la maqueta"
                  : "Construye una imagen con dirección artística"}
              </DialogTitle>
              <DialogDescription>
                {imageTarget === "background"
                  ? "La imagen se aplicará detrás de todos los bloques y quedará disponible en tu galería."
                  : "Controla estilo, emoción, luz, composición, personas y resolución. También puedes seguir utilizando tus propias imágenes."}
              </DialogDescription>
            </DialogHeader>
            <div
              className="image-prompt-preview format-aware"
              style={{
                aspectRatio: `${selectedImageDimensions.width} / ${selectedImageDimensions.height}`,
              }}
            >
              <img
                src={String(
                  generatedImagePreview?.url ??
                    (imageTarget === "background"
                      ? document.settings.backgroundImageUrl ||
                        "/assets/ai-campaign.webp"
                      : (selectedBlock?.props.imageUrl ??
                        "/assets/ai-campaign.webp")),
                )}
                alt={
                  generatedImagePreview
                    ? "Vista previa del resultado generado"
                    : "Vista previa de referencia"
                }
              />
              <span>
                {generatedImagePreview ? "RESULTADO · " : "REFERENCIA · "}
                {imageBrief.sizingMode === "preset"
                  ? `${selectedImageFormat.label} · ${selectedImageFormat.ratioLabel}`
                  : imageBrief.sizingMode === "hero"
                    ? "Ajuste automático al hero"
                    : imageBrief.sizingMode === "canvas"
                      ? "Ajuste automático a la maqueta"
                      : "Tamaño personalizado"}{" "}
                ·{" "}
                {generatedImagePreview?.width ?? selectedImageDimensions.width}
                {" × "}
                {generatedImagePreview?.height ??
                  selectedImageDimensions.height}
              </span>
            </div>
            <label className="dialog-field">
              <span>100 escenas por tipo de negocio</span>
              <select
                className="studio-select"
                value={aiBrief.imageRecipeId}
                onChange={(event) => {
                  const item = catalogItem(
                    IMAGE_RECIPES_100,
                    event.target.value,
                  );
                  setAiBrief({ ...aiBrief, imageRecipeId: item.id });
                  setImagePrompt(item.prompt);
                  setImageBrief({ ...imageBrief, style: item.style });
                }}
              >
                {IMAGE_RECIPES_100.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sector} · {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="dialog-field">
              <span>Dirección creativa</span>
              <Textarea
                rows={5}
                value={imagePrompt}
                onChange={(event) => setImagePrompt(event.target.value)}
              />
            </label>
            <div className="image-format-section">
              <div>
                <strong>Formato de salida</strong>
                <small>
                  La IA recompondrá la escena para la proporción elegida.
                </small>
              </div>
              <div className="image-format-picker">
                {IMAGE_FORMATS.map((item) => (
                  <button
                    key={item.id}
                    className={imageBrief.format === item.id ? "active" : ""}
                    onClick={() =>
                      setImageBrief({ ...imageBrief, format: item.id })
                    }
                  >
                    <i style={{ aspectRatio: item.ratio }} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.ratioLabel}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="dialog-form grid-two image-controls adaptive-size-controls">
              <label className="wide">
                <span>Ajuste de tamaño</span>
                <select
                  value={imageBrief.sizingMode}
                  onChange={(event) =>
                    setImageBrief({
                      ...imageBrief,
                      sizingMode: event.target
                        .value as typeof imageBrief.sizingMode,
                    })
                  }
                >
                  <option value="preset">Usar el formato seleccionado</option>
                  <option value="hero">Detectar y ajustar al hero</option>
                  <option value="canvas">
                    Detectar y ajustar a toda la maqueta
                  </option>
                  <option value="custom">
                    Introducir tamaño personalizado
                  </option>
                </select>
              </label>
              {imageBrief.sizingMode === "custom" && (
                <>
                  <label>
                    <span>Ancho final · 320–4096 px</span>
                    <Input
                      type="number"
                      min={320}
                      max={4096}
                      step={2}
                      value={imageBrief.customWidth}
                      onChange={(event) =>
                        setImageBrief({
                          ...imageBrief,
                          customWidth: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Alto final · 320–4096 px</span>
                    <Input
                      type="number"
                      min={320}
                      max={4096}
                      step={2}
                      value={imageBrief.customHeight}
                      onChange={(event) =>
                        setImageBrief({
                          ...imageBrief,
                          customHeight: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <div className="dialog-form grid-two image-controls">
              <label>
                <span>Estilo visual</span>
                <select
                  value={imageBrief.style}
                  onChange={(e) =>
                    setImageBrief({ ...imageBrief, style: e.target.value })
                  }
                >
                  <option>Fotografía editorial</option>
                  <option>Fotorrealismo cinematográfico</option>
                  <option>Fotografía corporativa premium</option>
                  <option>Producto publicitario</option>
                  <option>Ilustración 3D</option>
                  <option>Cartoon premium</option>
                  <option>Animación infantil</option>
                  <option>Collage editorial</option>
                  <option>Acuarela artística</option>
                  <option>Minimalismo gráfico</option>
                  <option>Arte futurista</option>
                  <option>Retro publicitario</option>
                  <option>Brutalismo visual</option>
                  <option>Isométrico tecnológico</option>
                  <option>Infografía conceptual</option>
                  <option>Macro hiperrealista</option>
                </select>
              </label>
              <label>
                <span>Emoción</span>
                <Input
                  value={imageBrief.mood}
                  onChange={(e) =>
                    setImageBrief({ ...imageBrief, mood: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Iluminación</span>
                <select
                  value={imageBrief.lighting}
                  onChange={(e) =>
                    setImageBrief({ ...imageBrief, lighting: e.target.value })
                  }
                >
                  <option>Cinematográfica suave</option>
                  <option>Natural luminosa</option>
                  <option>Hora dorada</option>
                  <option>Neón dramático</option>
                  <option>Estudio de lujo</option>
                  <option>Alto contraste</option>
                  <option>Infantil colorida</option>
                  <option>Industrial realista</option>
                  <option>Etérea y difusa</option>
                </select>
              </label>
              <label>
                <span>Composición</span>
                <select
                  value={imageBrief.composition}
                  onChange={(e) =>
                    setImageBrief({
                      ...imageBrief,
                      composition: e.target.value,
                    })
                  }
                >
                  <option>Sujeto a la derecha, espacio negativo</option>
                  <option>Sujeto a la izquierda, espacio negativo</option>
                  <option>Simétrica y central</option>
                  <option>Vista cenital</option>
                  <option>Primer plano emocional</option>
                  <option>Panorámica ambiental</option>
                  <option>Diagonal dinámica</option>
                  <option>Capas con profundidad</option>
                  <option>Composición minimalista</option>
                </select>
              </label>
              <label>
                <span>Cámara y plano</span>
                <select
                  value={imageBrief.camera}
                  onChange={(e) =>
                    setImageBrief({ ...imageBrief, camera: e.target.value })
                  }
                >
                  <option>Plano medio editorial</option>
                  <option>Gran angular cinematográfico</option>
                  <option>Primerísimo primer plano</option>
                  <option>Vista aérea</option>
                  <option>Teleobjetivo comprimido</option>
                  <option>Perspectiva isométrica</option>
                  <option>Plano detalle macro</option>
                </select>
              </label>
              <label>
                <span>Acabado</span>
                <select
                  value={imageBrief.finish}
                  onChange={(e) =>
                    setImageBrief({ ...imageBrief, finish: e.target.value })
                  }
                >
                  <option>Nítido y premium</option>
                  <option>Hiperrealista 4K</option>
                  <option>Grano cinematográfico</option>
                  <option>Suave y elegante</option>
                  <option>Textura artesanal</option>
                  <option>Color grading publicitario</option>
                  <option>Alto detalle técnico</option>
                </select>
              </label>
              <label>
                <span>Paleta</span>
                <Input
                  value={imageBrief.palette}
                  onChange={(e) =>
                    setImageBrief({ ...imageBrief, palette: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Personas</span>
                <select
                  value={imageBrief.people}
                  onChange={(e) =>
                    setImageBrief({ ...imageBrief, people: e.target.value })
                  }
                >
                  <option>Personas reales y naturales</option>
                  <option>Sin personas</option>
                  <option>Grupo diverso</option>
                  <option>Profesionales en acción</option>
                  <option>Retrato individual</option>
                  <option>Personaje ilustrado</option>
                  <option>Familia o público infantil</option>
                </select>
              </label>
              <label>
                <span>Texto dentro de la imagen</span>
                <select
                  value={imageBrief.embeddedText}
                  onChange={(e) =>
                    setImageBrief({
                      ...imageBrief,
                      embeddedText: e.target.value,
                    })
                  }
                >
                  <option value="none">Sin texto · editable en HTML</option>
                  <option value="custom">Integrar un claim corto</option>
                </select>
              </label>
              {imageBrief.embeddedText === "custom" && (
                <label>
                  <span>Claim exacto</span>
                  <Input
                    maxLength={100}
                    placeholder="Máximo una frase breve"
                    value={imageBrief.textContent}
                    onChange={(e) =>
                      setImageBrief({
                        ...imageBrief,
                        textContent: e.target.value,
                      })
                    }
                  />
                </label>
              )}
              <label className="toggle-field wide">
                <span>
                  <strong>Fondo transparente</strong>
                  <small>
                    Ideal para logotipos, recortes y elementos PNG/WebP
                    superpuestos.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={imageBrief.transparentBackground}
                  onChange={(e) =>
                    setImageBrief({
                      ...imageBrief,
                      transparentBackground: e.target.checked,
                    })
                  }
                />
              </label>
            </div>
            <div className="dialog-form grid-two image-controls subject-placement">
              <label className="wide">
                <span>Posición del sujeto o elemento principal</span>
                <select
                  value={imageBrief.composition}
                  onChange={(event) =>
                    setImageBrief({
                      ...imageBrief,
                      composition: event.target.value,
                    })
                  }
                >
                  <option>Sujeto abajo, espacio libre superior</option>
                  <option>Sujeto abajo a la izquierda, espacio superior</option>
                  <option>Sujeto abajo a la derecha, espacio superior</option>
                  <option>Sujeto centrado en el tercio inferior</option>
                  <option>Sujeto a la derecha, espacio negativo</option>
                  <option>Sujeto a la izquierda, espacio negativo</option>
                  <option>Simétrica y central</option>
                  <option>Panorámica ambiental</option>
                  <option>Composición minimalista</option>
                </select>
              </label>
            </div>
            <div className="resolution-picker">
              {(["draft", "2k", "4k"] as const).map((resolution) => {
                const dimensions = imageDimensionsForResolution(resolution);
                return (
                  <button
                    key={resolution}
                    className={
                      imageBrief.resolution === resolution ? "active" : ""
                    }
                    onClick={() => setImageBrief({ ...imageBrief, resolution })}
                  >
                    <strong>
                      {resolution === "draft"
                        ? "Normal"
                        : resolution.toUpperCase()}
                    </strong>
                    <small>
                      {dimensions.width} × {dimensions.height}
                      {resolution === "draft" ? " · menor consumo" : ""}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className="capability-note">
              <ShieldCheck />
              <span>
                <strong>Composición segura para email</strong>
                <small>
                  Sin texto incrustado, sin logotipos inventados y con
                  alternativa accesible editable.
                </small>
              </span>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setGeneratedImagePreview(null);
                  setImageOpen(false);
                }}
              >
                {generatedImagePreview ? "Descartar" : "Cancelar"}
              </Button>
              {generatedImagePreview && (
                <Button
                  className="save-button"
                  onClick={applyGeneratedImagePreview}
                >
                  <Check /> Aplicar{" "}
                  {imageTarget === "background" ? "como fondo" : "al bloque"}
                </Button>
              )}
              <Button
                className={
                  generatedImagePreview ? "secondary-action" : "save-button"
                }
                onClick={generateImage}
                disabled={imageLoading}
              >
                {imageLoading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <WandSparkles />
                )}{" "}
                {generatedImagePreview ? "Regenerar " : "Generar "}
                {imageBrief.resolution === "draft"
                  ? "normal"
                  : imageBrief.resolution.toUpperCase()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="studio-dialog import-dialog">
            <DialogHeader>
              <div className="dialog-kicker">
                <span>
                  <Code2 />
                </span>
                IMPORTADOR SEGURO
              </div>
              <DialogTitle>Trae una plantilla HTML existente</DialogTitle>
              <DialogDescription>
                Se eliminan scripts, iframes y eventos ejecutables. El HTML
                queda disponible para previsualizar, versionar y exportar.
              </DialogDescription>
            </DialogHeader>
            <label className="dialog-field">
              <span>HTML del email</span>
              <Textarea
                className="code-area"
                rows={13}
                placeholder="<!doctype html>..."
                value={importHtml}
                onChange={(event) => setImportHtml(event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setImportOpen(false)}>
                Cancelar
              </Button>
              <Button className="save-button" onClick={importTemplate}>
                <Import /> Importar plantilla
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
          <DialogContent className="studio-dialog brand-dialog">
            <DialogHeader>
              <div className="dialog-kicker">
                <span>
                  <Palette />
                </span>
                KIT DE MARCA
              </div>
              <DialogTitle>Un sistema visual, todas tus campañas</DialogTitle>
              <DialogDescription>
                Centraliza identidad, remitente y datos legales para mantener
                coherencia.
              </DialogDescription>
            </DialogHeader>
            <div
              className="brand-preview"
              style={{
                background: `linear-gradient(135deg,${brandKit.backgroundColor},#0b1724)`,
              }}
            >
              <span style={{ background: brandKit.primaryColor }} />
              <i style={{ background: brandKit.accentColor }} />
              <strong>{brandKit.name || "TU MARCA"}</strong>
              <small>CAMPO DE IDENTIDAD</small>
            </div>
            <div className="dialog-form grid-two">
              <label className="wide">
                <span>Nombre de marca</span>
                <Input
                  value={brandKit.name}
                  onChange={(event) =>
                    setBrandKit({ ...brandKit, name: event.target.value })
                  }
                />
              </label>
              <label className="wide">
                <span>Logotipo (URL o imagen de la galería)</span>
                <Input
                  value={brandKit.logoUrl || ""}
                  onChange={(event) =>
                    setBrandKit({ ...brandKit, logoUrl: event.target.value })
                  }
                  placeholder="https://…/logo.png"
                />
                {mediaAssets.length > 0 && (
                  <select
                    value={brandKit.logoUrl || ""}
                    onChange={(event) =>
                      setBrandKit({ ...brandKit, logoUrl: event.target.value })
                    }
                  >
                    <option value="">Sin logotipo gráfico</option>
                    {mediaAssets.map((asset) => (
                      <option key={asset.id} value={asset.url}>
                        {asset.filename}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              {(
                ["primaryColor", "accentColor", "backgroundColor"] as const
              ).map((key) => (
                <label key={key}>
                  <span>
                    {
                      (
                        {
                          primaryColor: "Color principal",
                          accentColor: "Acento",
                          backgroundColor: "Fondo",
                        } as const
                      )[key]
                    }
                  </span>
                  <div className="dialog-color">
                    <input
                      type="color"
                      value={brandKit[key]}
                      onChange={(event) =>
                        setBrandKit({ ...brandKit, [key]: event.target.value })
                      }
                    />
                    <Input
                      value={brandKit[key]}
                      onChange={(event) =>
                        setBrandKit({ ...brandKit, [key]: event.target.value })
                      }
                    />
                  </div>
                </label>
              ))}
              <label>
                <span>Remitente</span>
                <Input
                  value={brandKit.senderName}
                  onChange={(event) =>
                    setBrandKit({ ...brandKit, senderName: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Email remitente</span>
                <Input
                  type="email"
                  value={brandKit.senderEmail}
                  onChange={(event) =>
                    setBrandKit({
                      ...brandKit,
                      senderEmail: event.target.value,
                    })
                  }
                />
              </label>
              <label className="wide">
                <span>Razón social o identidad legal</span>
                <Input
                  value={brandKit.legalName}
                  onChange={(event) =>
                    setBrandKit({ ...brandKit, legalName: event.target.value })
                  }
                  placeholder="Empresa Ejemplo, S.L."
                />
              </label>
              <label className="wide">
                <span>Dirección postal</span>
                <Input
                  value={brandKit.postalAddress}
                  onChange={(event) =>
                    setBrandKit({
                      ...brandKit,
                      postalAddress: event.target.value,
                    })
                  }
                />
              </label>
              <label className="wide">
                <span>URL de la política de privacidad</span>
                <Input
                  type="url"
                  value={brandKit.privacyUrl}
                  onChange={(event) =>
                    setBrandKit({ ...brandKit, privacyUrl: event.target.value })
                  }
                  placeholder="https://empresa.es/privacidad"
                />
              </label>
              <label className="wide">
                <span>Email de privacidad</span>
                <Input
                  type="email"
                  value={brandKit.privacyEmail}
                  onChange={(event) =>
                    setBrandKit({
                      ...brandKit,
                      privacyEmail: event.target.value,
                    })
                  }
                />
              </label>
              <div className="wide compliance-box">
                <ShieldCheck />
                <div>
                  <strong>Responsabilidad compartida</strong>
                  <small>
                    El constructor prepara identidad, privacidad, preferencias y
                    baja. Prospector validará la base aplicable, la procedencia,
                    las exclusiones y el derecho de oposición antes del envío.
                  </small>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBrandOpen(false)}>
                Cancelar
              </Button>
              <Button className="save-button" onClick={saveBrandKit}>
                <Save /> Guardar y aplicar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent
            className="preview-dialog studio-dialog"
            showCloseButton
          >
            <DialogHeader>
              <div className="preview-heading">
                <div>
                  <DialogTitle>{name}</DialogTitle>
                  <DialogDescription>{subject}</DialogDescription>
                </div>
                <div className="preview-actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadFile(
                        plainText,
                        `${name.replace(/\W+/g, "-").toLowerCase()}.txt`,
                        "text/plain",
                      )
                    }
                  >
                    <ClipboardList /> Texto plano
                  </Button>
                  <Button
                    className="save-button"
                    onClick={() =>
                      downloadFile(
                        exportableHtml(),
                        `${name.replace(/\W+/g, "-").toLowerCase()}.html`,
                        "text/html",
                      )
                    }
                  >
                    <Download /> HTML
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="preview-layout">
              <div className="preview-frame">
                <iframe
                  title="Previsualización ampliada"
                  srcDoc={html}
                  sandbox="allow-popups"
                />
              </div>
              <aside>
                <div className="big-score">
                  <span
                    style={
                      {
                        "--score": `${quality.score * 3.6}deg`,
                      } as React.CSSProperties
                    }
                  >
                    <strong>{quality.score}</strong>
                    <small>/100</small>
                  </span>
                  <div>
                    <strong>Impact Score</strong>
                    <small>Evaluación previa al envío</small>
                  </div>
                </div>
                <div className="full-checks">
                  {quality.checks.map((check) => (
                    <div
                      key={check.id}
                      className={check.passed ? "passed" : ""}
                    >
                      <span>{check.passed ? <Check /> : <X />}</span>
                      <div>
                        <strong>{check.label}</strong>
                        <small>{check.detail}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="compliance-box">
                  <ShieldCheck />
                  <div>
                    <strong>Estructura legal del constructor</strong>
                    <small>
                      {quality.checks
                        .filter((check) =>
                          [
                            "unsubscribe",
                            "sender-identity",
                            "compliance-variables",
                          ].includes(check.id),
                        )
                        .every((check) => check.passed)
                        ? "Completa; pendiente de validar destinatarios en Prospector."
                        : "Incompleta. Corrige el pie legal y el Kit de marca antes de entregarla a Prospector."}
                    </small>
                  </div>
                </div>
              </aside>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
