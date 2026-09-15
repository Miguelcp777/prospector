"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  RotateCcw,
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
  ClipboardList,
  CloudUpload,
  Code2,
  Columns2,
  Copy,
  Database,
  Download,
  Eye,
  FilePlus2,
  GalleryHorizontalEnd,
  GripVertical,
  HelpCircle,
  History,
  ImageIcon,
  Import,
  LayoutTemplate,
  Layers3,
  LoaderCircle,
  Minus,
  Monitor,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@studio/lib/api";
import { datosDelRemitente } from "@studio/lib/datos-remitente";
import { leerPerfil } from "../lib/perfil-negocio";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@studio/ui/dropdown-menu";
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
  detectVisualContext,
  type VisualGenerationContext,
} from "@studio/lib/image-context";
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
  type EmailBlock,
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
import { type StudioSpace } from "@studio/lib/studio-navigation";
import { normalizarRutaRecurso } from "@studio/lib/rutas-recurso";

type StudioProps = { displayName: string };

/** El recorrido del modo guiado, en orden. */
const PASOS_GUIA: WorkflowStep[] = ["library", "content", "design", "variables", "mobile", "review"];

const NOMBRE_PASO: Record<WorkflowStep, string> = {
  library: "Elegir plantilla",
  content: "Editar contenido",
  design: "Diseño y marca",
  variables: "Personalizar",
  mobile: "Adaptación móvil",
  review: "Revisar y guardar",
};
type Device = "desktop" | "mobile";
type AppTheme = "dark" | "light" | "ocean" | "emerald" | "violet";
const APP_THEMES: AppTheme[] = ["dark", "light", "ocean", "emerald", "violet"];
const IMAGE_SIZE_MAX_PERCENT = 200;
type ExperienceMode = "guided" | "professional";
type WorkflowStep = "library" | "content" | "design" | "variables" | "mobile" | "review";
type TemplateTier = "recommended" | "premium" | "all" | "classic";
const GUIDED_FLOW: Array<[WorkflowStep, string, string, string]> = [
  ["library", "01", "Crear", "IA, plantilla, anterior, cero o HTML"],
  ["content", "02", "Contenido", "Mensaje, CTA, enlaces y variables"],
  ["design", "03", "Diseño", "Composición, marca e imágenes"],
  ["mobile", "04", "Adaptación móvil", "Comparar y corregir"],
  ["review", "05", "Revisión y exportación", "Calidad y cumplimiento"],
];
type CampaignLibraryFilter = "active" | "archived" | "all";
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
        outputType === "image/webp"
          ? Math.max(0.78, 0.94 - attempt * 0.04)
          : undefined,
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
    description:
      "El wizard reúne empresa, objetivo, público, oferta, tono, composición, imagen y URL para generar una campaña completa y editable.",
    steps: [
      "Abre Crear con IA",
      "Completa las preguntas",
      "Revisa el resumen y el coste",
      "Genera y personaliza el resultado",
    ],
  },
  {
    id: "blocks",
    title: "Bloques y composición",
    description:
      "Añade, elimina y reordena bloques desde la columna izquierda. Cada bloque conserva sus propios estilos y ajustes móviles.",
    steps: [
      "Arrastra el bloque a la posición exacta",
      "Selecciónalo en la maqueta",
      "Edita contenido y diseño a la derecha",
      "Comprueba escritorio y móvil",
    ],
  },
  {
    id: "images",
    title: "Imágenes y fondos",
    description:
      "Genera, sube o reutiliza imágenes. La IA detecta la marca, el mensaje, los bloques cercanos y si el visual será hero, imagen o fondo; siempre puedes editar ese contexto.",
    steps: [
      "Completa el contexto visual del Kit de marca",
      "Selecciona Imagen, Hero o Fondo",
      "Revisa o edita el contexto detectado",
      "Genera, previsualiza y aplica",
    ],
  },
  {
    id: "variables",
    title: "Variables y destinatarios",
    description:
      "Inserta variables en el punto exacto del texto y previsualiza la campaña con datos de un lead antes de entregarla a Prospector.",
    steps: [
      "Coloca el cursor en el texto",
      "Abre Personalizar",
      "Inserta la variable",
      "Verifica su valor de ejemplo",
    ],
  },
  {
    id: "review",
    title: "Revisión y cumplimiento",
    description:
      "El Centro de campaña comprueba enlaces, variables, contraste, accesibilidad, móvil, modo oscuro, spam y estructura legal.",
    steps: [
      "Abre Centro de campaña",
      "Resuelve controles críticos",
      "Prepara una prueba",
      "Guarda una versión inmutable",
    ],
  },
  {
    id: "export",
    title: "Guardar, reutilizar y exportar",
    description:
      "Cada campaña queda en Mis campañas con autoguardado y versiones. Desde allí puedes abrirla, buscarla, duplicarla como nueva base, archivarla o recuperarla.",
    steps: [
      "Pon un nombre reconocible a la campaña",
      "Comprueba el estado Guardada",
      "Abre Mis campañas para reutilizarla",
      "Duplica la base o exporta el resultado",
    ],
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
  premium: boolean;
  masterName?: string;
  variantName?: string;
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
  brandContext: string;
  imageGuidance: string;
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
  /** Vive en el bucket privado: su enlace caduca y en un correo llega rota. */
  caduca?: boolean;
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
  imageFit: "Ajuste de la imagen",
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
const CONTENT_PROPS = new Set([
  "label", "eyebrow", "title", "body", "text", "content", "url", "caption",
  "imageUrl", "imageAlt", "leftTitle", "leftText", "rightTitle", "rightText",
  "company", "address", "note", "privacyLabel", "privacyUrl",
  "preferencesLabel", "preferencesUrl", "unsubscribeLabel", "unsubscribeUrl",
]);
const MEDIA_OPTIONS = [
  {
    url: "/imagenes/aurevanta-command-center-hero.webp",
    full: "/imagenes/aurevanta-command-center-hero-4k.webp",
    label: "AI Command Center",
  },
  {
    url: "/imagenes/ai-campaign.webp",
    full: "/imagenes/ai-campaign-4k.webp",
    label: "Inteligencia B2B",
  },
  {
    url: "/imagenes/industrial-cleaning.webp",
    full: "/imagenes/industrial-cleaning-4k.webp",
    label: "Impacto industrial",
  },
  {
    url: "/imagenes/sports-physio.webp",
    full: "/imagenes/sports-physio-4k.webp",
    label: "Movimiento y salud",
  },
];
const PREMIUM_MASTER_STYLES = [
  "Cinematográfico", "Editorial", "Asimétrico", "Tecnológico", "Corporativo premium",
  "Oferta directa", "Lanzamiento", "Evento", "Newsletter visual", "Captación",
  "Producto inmersivo", "Autoridad", "Caso de éxito", "Minimal de lujo", "Conversión visual",
] as const;
const PREMIUM_VARIANTS = ["Hero total", "Editorial", "Contraste", "Profundidad", "Móvil primero"] as const;

function cloneDocument(document: TemplateDocument) {
  const next = structuredClone(document);
  // Las plantillas guardadas antes del traslado llevan dentro la ruta vieja
  // del catálogo. Se corrige al abrirlas: el panel de diseño pinta esta URL
  // en un <img> directo, sin pasar por el renderizador.
  next.settings.backgroundImageUrl = normalizarRutaRecurso(
    next.settings.backgroundImageUrl,
  );
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
    for (const clave of ["imageUrl", "logoUrl", "backgroundImageUrl"])
      if (block.props[clave] !== undefined)
        block.props[clave] = normalizarRutaRecurso(block.props[clave]);
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
      freeX: 0,
      freeY: 0,
      freeZ: 0,
      freeScale: 100,
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
          imageFit: "cover",
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

// `guestSession` y el `apiFetch` original vivían aquí. El primero
// fabricaba una identidad de invitado en localStorage —cualquier cadena
// valía como usuario— y el segundo llamaba a las rutas de API del proyecto
// Next. Los dos sobran: ahora la identidad es la sesión de Supabase y las
// llamadas van a `@studio/lib/api`, que traduce esas mismas rutas a
// consultas con RLS.

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
      premium: index < PREMIUM_MASTER_STYLES.length * PREMIUM_VARIANTS.length,
      masterName: index < PREMIUM_MASTER_STYLES.length * PREMIUM_VARIANTS.length ? PREMIUM_MASTER_STYLES[Math.floor(index / PREMIUM_VARIANTS.length)] : undefined,
      variantName: index < PREMIUM_MASTER_STYLES.length * PREMIUM_VARIANTS.length ? PREMIUM_VARIANTS[index % PREMIUM_VARIANTS.length] : undefined,
    };
  });
  presets[0] = {
    ...presets[0],
    name: "Aurevanta AI Command Center",
    subject: "{{lead.first_name}}, convierte ideas en campañas memorables",
    preheader:
      "Diseño, imagen 4K y personalización comercial coordinados por IA.",
    image: "/imagenes/aurevanta-command-center-hero.webp",
    accent: "#03d9ff",
    document: buildOpeningShowcaseDocument(),
    objective: "presentar una experiencia de campaña premium",
    designFamily: "AI Command Center",
    motif: "orbit",
    premium: true,
    masterName: "Tecnológico",
    variantName: "Hero total",
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

function campaignCover(template: StoredTemplate) {
  const visual = template.document.blocks.find(
    (block) => block.type === "hero" || block.type === "image",
  );
  return String(
    visual?.props.imageUrl ||
      template.document.settings.backgroundImageUrl ||
      "",
  );
}

function campaignUpdatedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
          onChange={(event) => {
            const candidate = event.target.value;
            setDraft(candidate);
            if (candidate === "" || candidate === "-" || candidate === ".")
              return;
            const parsed = Number(candidate);
            if (!Number.isFinite(parsed)) return;
            onChange(Math.min(max, Math.max(min, parsed)));
          }}
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

const HERO_LAYER_CONFIGS = [
  {
    key: "eyebrow",
    label: "Antetítulo",
    x: 22,
    y: 18,
    width: 38,
    size: 14,
    z: 4,
    image: false,
  },
  {
    key: "title",
    label: "Titular",
    x: 32,
    y: 48,
    width: 58,
    size: 58,
    z: 5,
    image: false,
  },
  {
    key: "body",
    label: "Texto de apoyo",
    x: 28,
    y: 78,
    width: 48,
    size: 20,
    z: 6,
    image: false,
  },
  {
    key: "heroImage",
    label: "Imagen",
    x: 72,
    y: 50,
    width: 48,
    size: 62,
    z: 2,
    image: true,
  },
] as const;
type HeroLayerKey = (typeof HERO_LAYER_CONFIGS)[number]["key"];

function HeroFreeLayerControls({
  values,
  selectedLayer,
  onSelect,
  onChange,
  onPreset,
}: {
  // Con undefined, como `EmailBlock.props` desde el traslado: el catálogo
  // de producción declara props opcionales sin valor.
  values: Record<string, string | number | boolean | undefined>;
  selectedLayer: HeroLayerKey;
  onSelect: (layer: HeroLayerKey) => void;
  onChange: (key: string, value: string | number | boolean) => void;
  onPreset: (preset: "cover" | "right" | "reset") => void;
}) {
  const layer =
    HERO_LAYER_CONFIGS.find((item) => item.key === selectedLayer) ??
    HERO_LAYER_CONFIGS[1];
  const numberValue = (suffix: string, fallback: number) =>
    Number(values[`${layer.key}${suffix}`] ?? fallback);
  const changeDepth = (direction: -1 | 1) =>
    onChange(
      `${layer.key}Z`,
      Math.min(20, Math.max(0, numberValue("Z", layer.z) + direction)),
    );

  return (
    <div className="hero-free-controls">
      <div className="hero-layer-selector" aria-label="Capas del hero">
        {HERO_LAYER_CONFIGS.map((item) => (
          <button
            type="button"
            key={item.key}
            className={selectedLayer === item.key ? "active" : ""}
            aria-pressed={selectedLayer === item.key}
            onClick={() => onSelect(item.key)}
          >
            <strong>{item.label}</strong>
            <small>Capa {Number(values[`${item.key}Z`] ?? item.z)}</small>
          </button>
        ))}
      </div>
      <small className="field-help hero-selection-help">
        Selecciona aquí o pulsa directamente el elemento dentro del hero.
      </small>
      <div className="hero-free-presets">
        <span>AJUSTES RÁPIDOS DE IMAGEN</span>
        <div>
          <button onClick={() => onPreset("cover")}>Ocupar todo el hero</button>
          <button onClick={() => onPreset("right")}>Mitad derecha</button>
          <button onClick={() => onPreset("reset")}>Restablecer capas</button>
        </div>
      </div>
      <section
        className="hero-layer-panel"
        aria-label={`Editar ${layer.label}`}
      >
        <header>
          <div>
            <small>EDITANDO CAPA</small>
            <strong>{layer.label}</strong>
          </div>
          <div className="hero-depth-actions">
            <button type="button" onClick={() => changeDepth(-1)}>
              Enviar detrás
            </button>
            <button type="button" onClick={() => changeDepth(1)}>
              Traer delante
            </button>
          </div>
        </header>
        <div className="hero-layer-fields">
          {[
            ["Posición X", "X", -25, 125, 1, "%", layer.x],
            ["Posición Y", "Y", -25, 125, 1, "%", layer.y],
            ["Ancho", "Width", 10, 200, 1, "%", layer.width],
            layer.image
              ? ["Alto", "Height", 10, 150, 1, "%", layer.size]
              : [
                  "Tamaño de fuente",
                  "FontSize",
                  8,
                  layer.key === "title" ? 120 : layer.key === "body" ? 72 : 48,
                  1,
                  "px",
                  layer.size,
                ],
            ["Profundidad", "Z", 0, 20, 1, "", layer.z],
            ["Giro", "Rotation", -30, 30, 1, "°", 0],
            ["Opacidad", "Opacity", 0, 100, 1, "%", 100],
          ].map(([label, suffix, min, max, step, unit, fallback]) => (
            <div className="property-field" key={`${layer.key}${suffix}`}>
              <label>{label}</label>
              <RangeWithNumber
                min={Number(min)}
                max={Number(max)}
                step={Number(step)}
                suffix={String(unit)}
                value={numberValue(String(suffix), Number(fallback))}
                onChange={(value) => onChange(`${layer.key}${suffix}`, value)}
              />
            </div>
          ))}
          {layer.image ? (
            <div className="property-field hero-layer-wide">
              <label>Ajuste de imagen</label>
              <select
                className="studio-select"
                value={String(values.heroImageFit ?? "cover")}
                onChange={(event) =>
                  onChange("heroImageFit", event.target.value)
                }
              >
                <option value="cover">Cubrir el área</option>
                <option value="contain">Mostrar completa</option>
                <option value="fill">Estirar al área</option>
              </select>
            </div>
          ) : (
            <div className="property-field hero-layer-wide">
              <label>Alineación propia</label>
              <select
                className="studio-select"
                value={String(values[`${layer.key}TextAlign`] ?? "left")}
                onChange={(event) =>
                  onChange(`${layer.key}TextAlign`, event.target.value)
                }
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
                <option value="justify">Justificado</option>
              </select>
            </div>
          )}
        </div>
      </section>
      <div className="property-field">
        <label>Contenido fuera del borde</label>
        <select
          className="studio-select"
          value={String(values.heroOverflow ?? "hidden")}
          onChange={(event) => onChange("heroOverflow", event.target.value)}
        >
          <option value="hidden">Recortar al límite del hero</option>
          <option value="visible">Permitir que sobresalga</option>
        </select>
      </div>
      <small className="field-help">
        Las capas pueden ocupar la misma zona. La profundidad decide qué
        elemento aparece delante y cuál queda detrás.
      </small>
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
  const [selectedHeroLayer, setSelectedHeroLayer] =
    useState<HeroLayerKey>("title");
  const [appTheme, setAppTheme] = useState<AppTheme>("dark");
  const [device, setDevice] = useState<Device>("desktop");
  const [savedTemplates, setSavedTemplates] = useState<StoredTemplate[]>([]);
  const [archivedTemplates, setArchivedTemplates] = useState<StoredTemplate[]>([]);
  const [campaignLibraryOpen, setCampaignLibraryOpen] = useState(false);
  const [campaignLibraryFilter, setCampaignLibraryFilter] =
    useState<CampaignLibraryFilter>("active");
  const [campaignSearch, setCampaignSearch] = useState("");
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
  // Por defecto, los tres campos. El asistente de seis pasos sigue ahí
  // entero: el que quiera elegir plantilla y receta de imagen lo abre.
  const [modoAsistente, setModoAsistente] =
    useState<"simple" | "avanzado">("simple");
  const [aiBrief, setAiBrief] = useState({
    campaignName: "",
    queTransmitir: "",
    sector: "",
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
  const [experienceMode, setExperienceMode] =
    useState<ExperienceMode>("guided");
  // El espacio activo lo lee la paleta de comandos; el lateral de V45 que
  // lo pintaba no entra, porque Prospector ya tiene su menú.
  const [, setMainSpace] = useState<StudioSpace>("home");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"blocks" | "layers" | "edit" | "view" | null>(null);
  // Arranca en true a proposito, aunque la V45 lo tenia en false. Hasta hoy
  // el boton no hacia nada, asi que los controles avanzados estaban SIEMPRE a
  // la vista; cablearlo con false los habria hecho desaparecer de golpe a quien
  // lleva semanas usandolos, sin que nadie lo pidiera. El boton ahora funciona
  // en los dos sentidos y la pantalla se ve igual que ayer. Cambiar a false es
  // una palabra, el dia que se quiera que el modo guiado empiece limpio.
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(true);
  const [templateTier, setTemplateTier] = useState<TemplateTier>("recommended");
  const [completedWorkflowSteps, setCompletedWorkflowSteps] = useState<WorkflowStep[]>([]);
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
  const [imageContext, setImageContext] = useState<VisualGenerationContext>({
    placement: "custom-asset",
    brandContext: "",
    screenContext: "",
    automaticContext: true,
  });
  // Un visual ya generado se reutiliza dentro de la sesión, indexado por
  // RECETA y no por plantilla: el prompt pertenece a la receta, y dos
  // plantillas que la comparten comparten visual.
  //
  // Sin esto, mirar tres plantillas y volver a la primera costaría tres
  // imágenes de pago. Navegar por la biblioteca no puede salir a una imagen
  // por clic.
  const visualesDelCatalogo = useRef(new Map<string, { url: string; alt: string }>());
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
    brandContext: "",
    imageGuidance: "",
  });
  const [mergeData, setMergeData] =
    useState<Record<string, string>>(initialMergeData);
  // Qué le falta a la cuenta para poder enviar de verdad (LSSI-CE). Vacío
  // mientras no se sepa: el aviso sale cuando hay respuesta, no antes.
  const [faltaRemitente, setFaltaRemitente] = useState<string[]>([]);

  // Quién firma. Solo los `sender.*` y el logo: las `lead.*` se quedan de
  // ejemplo, porque el destinatario de una vista previa no existe todavía.
  useEffect(() => {
    let vivo = true;
    datosDelRemitente().then(({ merge, falta }) => {
      if (!vivo) return;
      setMergeData((actual) => ({ ...actual, ...merge }));
      setFaltaRemitente(falta);
    });
    return () => { vivo = false; };
  }, []);

  // El asistente arranca con el negocio ya escrito (051). Quien diseña un
  // correo para su propia empresa no tiene por qué volver a teclear cómo se
  // llama y a qué se dedica cada vez; quien lo hace para otra, escribe
  // encima. Solo se rellena lo que esté en blanco, para no pisar nada.
  useEffect(() => {
    let vivo = true;
    leerPerfil().then((perfil) => {
      if (!vivo || !perfil) return;
      setAiBrief((actual) => ({
        ...actual,
        companyName: actual.companyName || perfil.nombre,
        sector: actual.sector || perfil.vertical,
        queTransmitir: actual.queTransmitir || perfil.descripcion,
        companyContext: actual.companyContext || perfil.descripcion,
        destinationUrl:
          actual.destinationUrl && actual.destinationUrl !== "https://"
            ? actual.destinationUrl
            : perfil.web || actual.destinationUrl,
      }));
    });
    return () => { vivo = false; };
  }, []);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("content");
  const uploadRef = useRef<HTMLInputElement>(null);
  const backgroundUploadRef = useRef<HTMLInputElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewScrollRef = useRef(0);

  const selectedBlock = document.blocks.find(
    (block) => block.id === selectedBlockId,
  );
  const desktopCanvasWidth = Math.min(
    1600,
    Math.max(280, Number(document.settings.width) || 640),
  );
  const mobileCanvasWidth = Math.min(
    600,
    Math.max(280, Number(document.settings.mobileWidth) || 375),
  );
  const configuredCanvasHeight =
    device === "mobile"
      ? document.settings.mobileCanvasHeight
      : document.settings.canvasHeight;
  const activeCanvasWidth =
    device === "mobile" ? mobileCanvasWidth : desktopCanvasWidth;
  const activeCanvasHeight =
    configuredCanvasHeight ??
    (device === "mobile"
      ? Math.max(
          240,
          Math.round(
            (document.settings.canvasHeight ?? estimatedCanvasHeight(document)) *
              (mobileCanvasWidth / desktopCanvasWidth),
          ),
        )
      : estimatedCanvasHeight(document));
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
  const activeSavedTemplates = useMemo(
    () => savedTemplates.filter((template) => template.status !== "archived"),
    [savedTemplates],
  );
  const archivedSavedTemplates = useMemo(
    () => savedTemplates.filter((template) => template.status === "archived"),
    [savedTemplates],
  );
  const visibleCampaigns = useMemo(() => {
    const normalized = normalizeSearch(campaignSearch);
    return savedTemplates.filter((template) => {
      const matchesFilter =
        campaignLibraryFilter === "all" ||
        (campaignLibraryFilter === "archived"
          ? template.status === "archived"
          : template.status !== "archived");
      if (!matchesFilter) return false;
      if (!normalized) return true;
      return normalizeSearch(
        `${template.name} ${template.category} ${template.subject} ${template.preheader}`,
      ).includes(normalized);
    });
  }, [campaignLibraryFilter, campaignSearch, savedTemplates]);

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
        row
          .querySelectorAll<HTMLElement>("[data-hero-layer]")
          .forEach((layer) => {
            const active =
              row.dataset.blockId === blockId &&
              layer.dataset.heroLayer === selectedHeroLayer;
            layer.style.outline = active ? "2px solid #11cfe0" : "none";
            layer.style.outlineOffset = active ? "3px" : "0";
          });
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
      frameDocument
        .querySelectorAll<HTMLAnchorElement>("a[href]")
        .forEach((link) => {
          link.addEventListener("click", (event) => event.preventDefault());
          link.title = "Enlace desactivado dentro del editor";
        });
      const rows = Array.from(
        frameDocument.querySelectorAll<HTMLElement>("[data-block-id]"),
      );
      rows.forEach((row, index) => {
        const id = row.dataset.blockId;
        if (!id) return;
        row.draggable = false;
        row.style.cursor = "move";
        row.style.transition =
          "outline-color .15s ease, box-shadow .15s ease, opacity .15s ease";
        row.addEventListener("click", () => setSelectedBlockId(id));
        row.addEventListener("pointerdown", (event) => {
          if (
            event.button !== 0 ||
            !frameDocument ||
            (event.target as HTMLElement).closest("[data-hero-layer]")
          )
            return;
          event.preventDefault();
          setSelectedBlockId(id);
          const startX = event.clientX;
          const startY = event.clientY;
          const initialX = Number(row.dataset.freeX) || 0;
          const initialY = Number(row.dataset.freeY) || 0;
          const scale = Number(row.dataset.freeScale) || 100;
          const automaticFlow = row.dataset.autoFlow !== "false";
          const isMobileLayer = Boolean(row.closest(".mobile-layout"));
          let nextX = initialX;
          let nextY = initialY;
          row.style.cursor = "grabbing";
          const move = (moveEvent: PointerEvent) => {
            moveEvent.preventDefault();
            nextX = Math.min(
              800,
              Math.max(-800, initialX + moveEvent.clientX - startX),
            );
            nextY = Math.min(
              1200,
              Math.max(-1200, initialY + moveEvent.clientY - startY),
            );
            row.style.transform = automaticFlow
              ? `translate(${nextX}px,${nextY}px)`
              : `translate(${nextX}px,${nextY}px) scale(${scale / 100})`;
          };
          const up = () => {
            row.style.cursor = "move";
            frameDocument.removeEventListener("pointermove", move);
            frameDocument.removeEventListener("pointerup", up);
            commitDocument((current) => {
              const block = current.blocks.find((item) => item.id === id);
              if (block) {
                if (isMobileLayer) {
                  block.mobile = {
                    ...block.mobile,
                    freeX: Math.round(nextX),
                    freeY: Math.round(nextY),
                  };
                } else {
                  block.props.freeX = Math.round(nextX);
                  block.props.freeY = Math.round(nextY);
                }
              }
              return current;
            });
          };
          frameDocument.addEventListener("pointermove", move);
          frameDocument.addEventListener("pointerup", up, { once: true });
        });
        row
          .querySelectorAll<HTMLElement>("[data-hero-layer]")
          .forEach((layer) => {
            const layerKey = layer.dataset.heroLayer as
              HeroLayerKey | undefined;
            if (!layerKey) return;
            layer.style.cursor = "pointer";
            layer.draggable = false;
            layer.addEventListener("dragstart", (event) => {
              event.preventDefault();
              event.stopPropagation();
            });
            layer.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedBlockId(id);
              setSelectedHeroLayer(layerKey);
            });
            layer.addEventListener("pointerdown", (event) => {
              if (event.button !== 0 || !frameDocument) return;
              const canvas = layer.closest<HTMLElement>(".hero-free-canvas");
              if (!canvas) return;
              event.preventDefault();
              event.stopPropagation();
              setSelectedBlockId(id);
              setSelectedHeroLayer(layerKey);
              const rect = canvas.getBoundingClientRect();
              const startX = event.clientX;
              const startY = event.clientY;
              const initialX = Number.parseFloat(layer.style.left) || 50;
              const initialY = Number.parseFloat(layer.style.top) || 50;
              let nextX = initialX;
              let nextY = initialY;
              const move = (moveEvent: PointerEvent) => {
                nextX = Math.min(
                  125,
                  Math.max(
                    -25,
                    initialX +
                      ((moveEvent.clientX - startX) / rect.width) * 100,
                  ),
                );
                nextY = Math.min(
                  125,
                  Math.max(
                    -25,
                    initialY +
                      ((moveEvent.clientY - startY) / rect.height) * 100,
                  ),
                );
                layer.style.left = `${nextX}%`;
                layer.style.top = `${nextY}%`;
              };
              const up = () => {
                frameDocument.removeEventListener("pointermove", move);
                frameDocument.removeEventListener("pointerup", up);
                commitDocument((current) => {
                  const block = current.blocks.find((item) => item.id === id);
                  if (block) {
                    block.props[`${layerKey}X`] = Math.round(nextX);
                    block.props[`${layerKey}Y`] = Math.round(nextY);
                    block.props.heroComposition = "free";
                    block.props.overlay = false;
                  }
                  return current;
                });
              };
              frameDocument.addEventListener("pointermove", move);
              frameDocument.addEventListener("pointerup", up, { once: true });
            });
            if (id === selectedBlockId && layerKey === selectedHeroLayer) {
              layer.style.outline = "2px solid #11cfe0";
              layer.style.outlineOffset = "3px";
            }
          });
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
        focusSelectedBlockInPreview(selectedBlockId, false),
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

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() =>
      focusSelectedBlockInPreview(selectedBlockId, false),
    );
    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedHeroLayer]);

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
        const savedProgress = globalThis.localStorage?.getItem(
          "aurevanta-ux-v2-guided-progress",
        );
        if (savedProgress) {
          const parsed = JSON.parse(savedProgress) as WorkflowStep[];
          if (Array.isArray(parsed)) setCompletedWorkflowSteps(parsed);
        }
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

  // El efecto que V45 tenía aquí pintaba `theme-*` sobre <html> y <body>, y
  // eso es la aplicación entera: el tema del studio se habría llevado por
  // delante el aspecto de Campañas, Leads y Mensajes. La clase la pone el
  // shell, unas líneas más abajo, y el CSS cuelga de ahí.

  // ------------------------------------------------------------
  // «Capas», en la barra del editor móvil.
  //
  // Las capas no son un panel propio: viven al final de la pestaña
  // «Bloques», debajo del catálogo de bloques que se pueden añadir. Así que
  // pulsar «Capas» abría el panel por arriba, enseñando «AÑADE BLOQUES», y
  // la lista de capas se quedaba fuera de la pantalla. Dos botones distintos
  // para la misma vista.
  //
  // Aquí se lleva al sitio: si el panel está en la pestaña de plantillas se
  // cambia a la de bloques —que es donde están las capas— y se desplaza
  // hasta ellas. El desplazamiento espera un fotograma porque el panel se
  // abre en este mismo render.
  // ------------------------------------------------------------
  useEffect(() => {
    if (mobilePanel !== "layers") return;
    if (workflowStep === "library") setWorkflowStep("content");
    const id = window.requestAnimationFrame(() => {
      // `document` aquí dentro es el documento de la plantilla, no el del
      // navegador: por eso `window.document`.
      window.document
        .querySelector(".palette-panel .structure-title")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [mobilePanel, workflowStep]);

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

  /**
   * Abre el asistente de IA. Si viene de una búsqueda sin resultados, lo que
   * se buscó entra como sector: es lo que el usuario acaba de decir que
   * quiere, y volver a escribirlo sería pedirle lo mismo dos veces.
   */
  function abrirIA(desdeBusqueda?: string) {
    if (desdeBusqueda) setAiBrief((actual) => ({ ...actual, sector: desdeBusqueda }));
    setAiOpen(true);
  }

  function changeAppTheme(theme: AppTheme) {
    setAppTheme(theme);
    try {
      globalThis.localStorage?.setItem("aurevanta-studio-theme", theme);
    } catch { /* almacenamiento no disponible */ }
  }

  function changeExperienceMode(mode: ExperienceMode) {
    setExperienceMode(mode);
    if (mode === "guided") setAdvancedControlsOpen(false);
    try {
      globalThis.localStorage?.setItem("aurevanta-experience-mode", mode);
    } catch {}
  }

  // Los cuatro grupos que gobierna «controles avanzados», en el orden en que
  // aparecen dentro del inspector.
  const GRUPOS_AVANZADOS =
    ".global-look-controls, .hero-free-controls, .global-layer-controls, .button-depth-grid";

  // El interruptor funcionaba y aun asi no se notaba, que para quien lo usa es
  // lo mismo que si no funcionara. Medido en produccion: lo que apaga vive en
  // y=1191 y y=2014 dentro del scroll del inspector, con una ventana de 911 px
  // de alto — o sea, fuera de la pantalla. El contenido del panel pasa de 4194
  // a 2869 px, un tercio menos, y desde donde esta el boton no se ve nada.
  // Asi que el efecto se cuenta, y al encender se lleva la vista hasta lo que
  // se acaba de descubrir. Ver TASK-007.
  // Esperar 80 ms al reloj no valia, y costo un despliegue averiguarlo: a esa
  // altura React todavia no habia pintado, el grupo seguia en `display: none`,
  // y un elemento oculto NO se deja desplazar — scrollIntoView se lo traga sin
  // decir nada. Medido: ese mismo scrollIntoView sobre el elemento ya visible
  // lleva el grupo de y=1191 a y=134. Asi que se espera al fotograma, no al
  // reloj, y se comprueba que el elemento este pintado antes de mover nada.
  function llevarLaVistaAlPrimerGrupoAvanzado(intentos = 12) {
    globalThis.requestAnimationFrame(() => {
      // globalThis.document, no document: dentro del componente `document` es
      // el TemplateDocument que se esta editando.
      const grupo = globalThis.document.querySelector(GRUPOS_AVANZADOS);
      // offsetParent nulo = todavia oculto. No se desplaza y se reintenta.
      if (grupo instanceof HTMLElement && grupo.offsetParent !== null) {
        // behavior "auto", no "smooth". Medido en produccion sobre este mismo
        // contenedor: con "smooth" el scrollTop se queda en 0 y no pasa nada,
        // con "auto" va a 930 y el grupo sube de y=1191 a y=134. No es
        // prefers-reduced-motion, que esta desactivado; el porque exacto se
        // queda sin explicar, pero lo que hace cada uno esta medido.
        grupo.scrollIntoView({ behavior: "auto", block: "center" });
        return;
      }
      if (intentos > 0) llevarLaVistaAlPrimerGrupoAvanzado(intentos - 1);
    });
  }

  function alternarControlesAvanzados() {
    const siguiente = !advancedControlsOpen;
    setAdvancedControlsOpen(siguiente);

    if (siguiente) {
      toast.message("Controles avanzados visibles", {
        description: "Capas, composicion libre del hero y profundidad, al final del panel de propiedades.",
      });
      llevarLaVistaAlPrimerGrupoAvanzado();
      return;
    }

    toast.message("Controles avanzados ocultos", {
      description: "El panel de propiedades se queda bastante mas corto.",
    });
  }

  function completeWorkflowStep(step: WorkflowStep) {
    setCompletedWorkflowSteps((current) => {
      const next = current.includes(step) ? current : [...current, step];
      try {
        globalThis.localStorage?.setItem(
          "aurevanta-ux-v2-guided-progress",
          JSON.stringify(next),
        );
      } catch {}
      return next;
    });
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
      // Las dos listas a la vez: archivar mueve una plantilla de una a la
      // otra, y recargar solo una dejaría la pantalla contando mal.
      const [vivas, archivadas] = await Promise.all([
        apiFetch("/api/templates"),
        apiFetch("/api/templates/archivadas"),
      ]);
      if (vivas.ok) {
        const data = (await vivas.json()) as { templates: StoredTemplate[] };
        setSavedTemplates(data.templates);
      }
      if (archivadas.ok) {
        const data = (await archivadas.json()) as { templates: StoredTemplate[] };
        setArchivedTemplates(data.templates);
      }
    } finally {
      setLibraryLoading(false);
    }
  }

  /**
   * Borrado definitivo, solo desde la lista de archivadas.
   *
   * Se pide el uso antes de preguntar: un aviso que dice "esto es
   * irreversible" no informa de nada, y uno que dice cuántos correos se
   * quedan sin saber con qué se compusieron, sí.
   *
   * Además del confirm hay que escribir el nombre. Es la fricción que
   * corresponde a lo único de esta pantalla que no se puede deshacer.
   */
  async function deleteTemplateForever(plantilla: StoredTemplate) {
    const respUso = await apiFetch(`/api/templates/${plantilla.id}/uso`);
    const uso = respUso.ok
      ? ((await respUso.json()) as { versiones: number; mensajes: number; enviados: number })
      : { versiones: 0, mensajes: 0, enviados: 0 };

    if (uso.enviados > 0)
      return toast.error(
        `No se puede borrar: compuso ${uso.enviados} correo(s) ya enviado(s).`,
      );

    const consecuencias = [
      uso.mensajes > 0 &&
        `${uso.mensajes} mensaje(s) dejarán de saber con qué plantilla se compusieron. El correo en sí no se toca.`,
      uso.versiones > 0 && `Se borran ${uso.versiones} versión(es) guardadas.`,
    ]
      .filter(Boolean)
      .join("\n");

    if (
      !window.confirm(
        `Borrar "${plantilla.name}" DEFINITIVAMENTE.\n\nEsto no se deshace.\n` +
          (consecuencias ? `\n${consecuencias}\n` : "") +
          `\nSi solo quieres quitarla de en medio, ya está archivada.`,
      )
    )
      return;

    const escrito = window.prompt(
      `Escribe el nombre de la plantilla para confirmar:\n\n${plantilla.name}`,
    );
    if (escrito?.trim() !== plantilla.name) {
      if (escrito !== null)
        toast.error("El nombre no coincide. No se ha borrado nada.");
      return;
    }

    const response = await apiFetch(
      `/api/templates/${plantilla.id}/definitivo`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const cuerpo = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return toast.error(cuerpo?.error ?? "No se pudo borrar");
    }
    toast.success(`"${plantilla.name}" borrada`);
    await loadLibrary();
  }

  async function restoreTemplate(plantilla: StoredTemplate) {
    const response = await apiFetch(`/api/templates/${plantilla.id}/restaurar`, {
      method: "POST",
    });
    if (!response.ok) {
      const cuerpo = (await response.json().catch(() => null)) as { error?: string } | null;
      return toast.error(cuerpo?.error ?? "No se pudo restaurar");
    }
    toast.success(`"${plantilla.name}" vuelve a la biblioteca`);
    await loadLibrary();
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

  function updateMobileProp(
    key: keyof NonNullable<EmailBlock["mobile"]>,
    value: string | number | boolean,
  ) {
    commitDocument((current) => {
      const block = current.blocks.find((item) => item.id === selectedBlockId);
      if (block) block.mobile = { ...block.mobile, [key]: value };
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
    const detected = detectedImageContext(target);
    setImageTarget(target);
    setImageContext(detected);
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

  function detectedImageContext(
    target: "block" | "background",
    sourceDocument = document,
    sourceBlockId: string | undefined = selectedBlockId,
    campaignCopy?: { name?: string; subject?: string; preheader?: string },
  ) {
    const block =
      target === "background"
        ? undefined
        : (sourceDocument.blocks.find((item) => item.id === sourceBlockId) ??
          sourceDocument.blocks.find(
            (item) => item.type === "hero" || item.type === "image",
          ));
    const blockIndex = block
      ? sourceDocument.blocks.findIndex((item) => item.id === block.id)
      : -1;
    return detectVisualContext({
      target,
      brandName: brandKit.name,
      brandContext: brandKit.brandContext,
      imageGuidance: brandKit.imageGuidance,
      primaryColor: brandKit.primaryColor,
      accentColor: brandKit.accentColor,
      backgroundColor: brandKit.backgroundColor,
      campaignName: campaignCopy?.name ?? name,
      subject: campaignCopy?.subject ?? subject,
      preheader: campaignCopy?.preheader ?? preheader,
      companyName: aiBrief.companyName,
      sector: aiBrief.sector,
      companyContext: aiBrief.companyContext,
      objective: aiBrief.objective,
      offer: aiBrief.offer,
      audience: aiBrief.audience,
      destinationUrl: aiBrief.destinationUrl,
      block,
      previousBlock:
        blockIndex > 0 ? sourceDocument.blocks[blockIndex - 1] : undefined,
      nextBlock:
        blockIndex >= 0
          ? sourceDocument.blocks[blockIndex + 1]
          : sourceDocument.blocks[0],
      canvasWidth: sourceDocument.settings.width,
      canvasHeight: estimatedCanvasHeight(sourceDocument),
    });
  }

  function refreshDetectedImageContext() {
    setImageContext(detectedImageContext(imageTarget));
    toast.success("Contexto visual recalculado desde la pantalla");
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

        // El hero también, y es el que más se nota.
        //
        // Su degradado sale de `props.fallbackStart/End` y solo cae a
        // `settings.primaryColor/accentColor` si esas props no existen. Las
        // plantillas del catálogo las traen puestas, así que cambiar el
        // diseño global movía `settings` y el hero seguía imponiendo las
        // suyas: el aviso decía "aplicado" y la vista previa no cambiaba un
        // píxel, que es justo lo que hace desconfiar de una herramienta.
        if (block.type === "hero") {
          block.props.fallbackStart = design.primary;
          block.props.fallbackEnd = design.accent;
        }
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

  function applyPresetStyle(preset: Preset) {
    commitDocument((current) => {
      current.settings = { ...current.settings, ...structuredClone(preset.document.settings) };
      const used = new Set<string>();
      current.blocks = current.blocks.map((block) => {
        const reference = preset.document.blocks.find(
          (candidate) => candidate.type === block.type && !used.has(candidate.id),
        );
        if (!reference) return block;
        used.add(reference.id);
        const content = Object.fromEntries(
          Object.entries(block.props).filter(([key]) => CONTENT_PROPS.has(key)),
        );
        return { ...block, props: { ...structuredClone(reference.props), ...content } };
      });
      return current;
    });
    toast.success(`Estilo de “${preset.name}” aplicado sin sustituir el contenido`);
  }

  function applyPresetStructure(preset: Preset) {
    commitDocument((current) => {
      const pools = new Map<EmailBlockType, EmailBlock[]>();
      for (const block of current.blocks) {
        const pool = pools.get(block.type) ?? [];
        pool.push(block);
        pools.set(block.type, pool);
      }
      current.blocks = structuredClone(preset.document.blocks).map((block) => {
        const source = pools.get(block.type)?.shift();
        if (!source) return { ...block, id: crypto.randomUUID() };
        const content = Object.fromEntries(
          Object.entries(source.props).filter(([key]) => CONTENT_PROPS.has(key)),
        );
        return { ...block, id: source.id, props: { ...block.props, ...content } };
      });
      return current;
    });
    toast.success(`Estructura de “${preset.name}” aplicada conservando el contenido compatible`);
  }

  async function saveAsMasterTemplate() {
    try {
      const response = await apiFetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `${name} · maestra`,
          category: "Premium · Maestra",
          subject,
          preheader,
          document,
          version: 1,
          sourceType: "master-reference",
        }),
      });
      if (!response.ok) throw new Error("No se pudo guardar la plantilla maestra");
      await loadLibrary();
      toast.success("Plantilla maestra guardada sin copiar datos personales adicionales");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    }
  }

  function createVisualVariant() {
    setDocument(cloneDocument(document));
    setTemplateId(null);
    setVersion(1);
    setName(`${name.replace(/ · variante \d+$/, "")} · variante ${Math.max(2, version + 1)}`);
    setHistory([]);
    setFuture([]);
    setDirty(true);
    setMainSpace("editor");
    toast.success("Variante independiente creada; el original permanece intacto");
  }

  /** Pone una imagen en el primer bloque visual del documento abierto. */
  function ponerVisual(url: string, alt: string) {
    setDocument((current) => {
      const next = cloneDocument(current);
      const visual = next.blocks.find(
        (block) => block.type === "hero" || block.type === "image",
      );
      if (visual) {
        visual.props.imageUrl = url;
        visual.props.imageAlt = alt;
      }
      return next;
    });
    setDirty(true);
  }

  async function preparePresetImage(preset: Preset) {
    applyPreset(preset);
    const recipe = catalogItem(IMAGE_RECIPES_100, preset.imageRecipeId);
    setWorkflowStep("content");

    // Ya generado en esta sesión: se reutiliza y no se llama al proveedor.
    const guardado = visualesDelCatalogo.current.get(preset.imageRecipeId);
    if (guardado) {
      ponerVisual(guardado.url, guardado.alt);
      toast.message("Se reutiliza el visual ya generado para esta plantilla");
      return;
    }

    setImageLoading(true);
    toast.message(
      `Creando un visual ${catalogImageResolution === "draft" ? "normal" : catalogImageResolution.toUpperCase()} exclusivo para ${preset.name}…`,
    );
    try {
      const prompt = recipe.prompt;
      const presetBlock = preset.document.blocks.find(
        (block) => block.type === "hero" || block.type === "image",
      );
      const presetContext = detectedImageContext(
        "block",
        preset.document,
        presetBlock?.id,
        {
          name: preset.name,
          subject: preset.subject,
          preheader: preset.preheader,
        },
      );
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
          ...presetContext,
        }),
      });
      const data = (await response.json()) as {
        url?: string;
        error?: string;
        mode?: string;
      };
      if (!response.ok || !data.url)
        throw new Error(data.error || "No se pudo generar el visual");
      const alt = `${preset.name}: ${recipe.scene}`;
      visualesDelCatalogo.current.set(preset.imageRecipeId, { url: data.url, alt });
      ponerVisual(data.url, alt);
      await loadMediaLibrary();
      toast.success(
        `Visual ${catalogImageResolution === "draft" ? "normal" : catalogImageResolution.toUpperCase()} de ${preset.name} guardado en la biblioteca`,
      );
    } catch (error) {
      // La plantilla ya está aplicada: el texto y el diseño sirven sin
      // imagen. Dejar al usuario sin nada porque el proveedor no responde
      // sería peor que el problema que vino a resolver esto.
      toast.error(
        error instanceof Error ? error.message : "No se pudo generar el visual",
        { description: "La plantilla se ha aplicado igual, sin imagen." },
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
    setCampaignLibraryOpen(false);
    toast.success(`“${template.name}” abierta`);
  }

  async function newTemplate(saveCurrent = true) {
    if (saveCurrent && dirty) {
      const saved = await saveTemplate();
      if (!saved) return;
    }
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
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la plantilla",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function archiveTemplate() {
    if (!templateId) return;
    // Preguntar antes: es un icono pequeño en una barra llena de iconos, y
    // hasta ahora un clic de más se llevaba la plantilla sin decir nada.
    if (
      !window.confirm(
        `¿Archivar "${name}"?

Deja de aparecer en la biblioteca y ` +
          `en Mensajes. No se borra: los correos ya compuestos con ella ` +
          `siguen enlazados y se puede recuperar.`,
      )
    )
      return;
    const response = await apiFetch(`/api/templates/${templateId}`, {
      method: "DELETE",
    });
    if (!response.ok) return toast.error("No se pudo archivar");
    toast.success("Plantilla archivada");
    await newTemplate(false);
    await loadLibrary();
  }

  async function createCampaignCopy(template: {
    name: string;
    category: string;
    subject: string;
    preheader: string;
    document: TemplateDocument;
    sourceType?: string;
  }) {
    const response = await apiFetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...template,
        name: `${template.name} · copia`,
        document: cloneDocument(template.document),
        sourceType: template.sourceType || "studio-copy",
      }),
    });
    const data = (await response.json()) as {
      template?: StoredTemplate;
      error?: string;
    };
    if (!response.ok || !data.template)
      throw new Error(data.error || "No se pudo crear la copia");
    await loadLibrary();
    openStored(data.template);
    toast.success("Copia guardada y preparada como nueva campaña");
  }

  async function duplicateTemplate() {
    try {
      await createCampaignCopy({
        name,
        category,
        subject,
        preheader,
        document,
        sourceType: document.rawHtml ? "html-import-copy" : "studio-copy",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear la copia",
      );
    }
  }

  async function duplicateStoredTemplate(template: StoredTemplate) {
    try {
      await createCampaignCopy(template);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear la copia",
      );
    }
  }

  async function archiveStoredTemplate(template: StoredTemplate) {
    const response = await apiFetch(`/api/templates/${template.id}`, {
      method: "DELETE",
    });
    if (!response.ok) return toast.error("No se pudo archivar la campaña");
    if (template.id === templateId) await newTemplate(false);
    await loadLibrary();
    toast.success("Campaña archivada; podrás recuperarla desde Historial");
  }

  async function restoreStoredTemplate(template: StoredTemplate) {
    const response = await apiFetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    if (!response.ok) return toast.error("No se pudo recuperar la campaña");
    await loadLibrary();
    setCampaignLibraryFilter("active");
    toast.success("Campaña recuperada");
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
    const simple = modoAsistente === "simple";
    setAiLoading(true);
    setAiProgress(
      simple
        ? "Escribiendo el correo y eligiendo la dirección de arte…"
        : "Creando estrategia, textos y estructura…",
    );
    try {
      const response = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // En simple solo viaja lo que ha escrito el cliente.
        //
        // El asistente trae `objective`, `offer`, `audience` y `tone` puestos
        // de fábrica —«conseguir reuniones cualificadas», «una auditoría de
        // oportunidades»—, y mandarlos como encargo es decirle al modelo que
        // el negocio ofrece eso. Con un estudio de tatuajes salió un correo
        // que proponía una auditoría de oportunidades.
        //
        // La imagen va siempre: el trato es que la IA lo hace todo, y un
        // correo sin portada no lo cumple.
        body: JSON.stringify(
          simple
            ? {
              ...aiBrief,
              modoAsistente,
              generateImage: true,
              objective: "",
              offer: "",
              tone: "",
              companyContext: "",
              actionType: "",
              proofPoints: [],
            }
            : { ...aiBrief, modoAsistente },
        ),
      });
      const data = (await response.json()) as {
        document?: TemplateDocument;
        subject?: string;
        preheader?: string;
        imagePrompt?: string | null;
        mode?: string;
        aviso?: string | null;
        correcciones?: string[];
        porQue?: string | null;
        error?: string;
      };
      if (!response.ok || !data.document)
        throw new Error(data.error || "No se pudo generar");

      // Si el modelo no pudo escribir, se compone con la plantilla de
      // siempre — pero se dice. Hacer pasar un texto de plantilla por uno
      // escrito para este negocio es peor que no tenerlo.
      if (data.aviso)
        toast.warning(
          simple ? "La dirección de arte es la de respaldo" : "El texto no lo ha escrito el modelo",
          { description: data.aviso },
        );
      // Corregir el contraste traiciona a la IA a propósito: una marca pastel
      // pide gris claro y recibe algo casi negro. Por eso se dice.
      if (data.correcciones?.length)
        toast.info("Se ha ajustado el diseño para que se lea", {
          description: data.correcciones.join(" · "),
        });
      else if (simple && data.porQue) toast.success(data.porQue);
      const generatedDocument = cloneDocument(data.document);
      let generatedImageUrl: string | null = null;
      if (simple || aiBrief.generateImage) {
        setAiProgress(
          `Generando la imagen principal en ${aiBrief.imageResolution === "draft" ? "calidad normal" : aiBrief.imageResolution.toUpperCase()}…`,
        );
        // La descripción que ha escrito el modelo para esta campaña manda:
        // conoce el negocio y el texto que acaba de redactar. Lo que el
        // usuario haya puesto a mano va primero, que para eso lo puso.
        const prompt =
          (simple ? data.imagePrompt?.trim() : "") ||
          aiBrief.imagePrompt.trim() ||
          data.imagePrompt?.trim() ||
          `${aiBrief.companyName || "Empresa"}, ${aiBrief.sector}. Campaña para ${aiBrief.objective}. Representar ${aiBrief.offer}. Audiencia: ${aiBrief.audience}. Composición con espacio negativo para texto de email.`;
        const generatedHero = generatedDocument.blocks.find(
          (block) => block.type === "hero",
        );
        const generatedContext = detectedImageContext(
          aiBrief.imageSizingMode === "canvas" ? "background" : "block",
          generatedDocument,
          generatedHero?.id,
          {
            name:
              aiBrief.campaignName ||
              `${aiBrief.companyName || aiBrief.sector} · ${aiBrief.objective}`,
            subject: data.subject,
            preheader: data.preheader,
          },
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
            ...generatedContext,
          }),
        });
        const imageData = (await imageResponse.json()) as {
          url?: string;
          asset?: MediaAsset;
          error?: string;
        };
        if (!imageResponse.ok || !imageData.url)
          throw new Error(imageData.error || "No se pudo generar la imagen");
        const hero = generatedHero;
        if (aiBrief.imageSizingMode === "canvas") {
          generatedDocument.settings.backgroundImageUrl = imageData.url;
          generatedDocument.settings.backgroundMode = "image";
          generatedDocument.settings.backgroundImageSize = "cover";
          generatedDocument.settings.backgroundImageRepeat = "no-repeat";
        } else if (hero) {
          hero.props.imageUrl = imageData.url;
          hero.props.imageAlt = prompt.slice(0, 180);
        }
        generatedImageUrl = imageData.url;
      }
      setAiProgress("Guardando la campaña y sus recursos…");
      // El nombre con el que se guarda.
      //
      // Llevaba `aiBrief.objective`, que en el modo simple nadie escribe: es
      // el valor de fábrica del asistente. Las tres plantillas generadas
      // hasta ahora se llaman «Woody Tattoo · conseguir reuniones
      // cualificadas» — la misma frase, que el cliente no ha dicho nunca, y
      // las tres indistinguibles en la biblioteca.
      //
      // Se usa el asunto que ha escrito el modelo: describe ESTE correo, y
      // dos generaciones seguidas no se llaman igual.
      const campaignName = (
        aiBrief.campaignName.trim() ||
        [
          aiBrief.companyName || aiBrief.sector,
          simple ? (data.subject || "").trim() : aiBrief.objective,
        ].filter(Boolean).join(" · ")
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
      const response = await apiFetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: imagePrompt,
          altText: imagePrompt,
          ...imageBrief,
          ...imageContext,
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
          throw new Error(
            data.error || `No se pudo subir la parte ${part + 1}`,
          );
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

  function handleImageInputChange(event: React.ChangeEvent<HTMLInputElement>) {
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
  const rankedCategoryPresets = recommendPresets(categoryPresets, search);
  const filteredPresets =
    templateTier === "premium"
      ? rankedCategoryPresets.filter((preset) => preset.premium)
      : templateTier === "classic"
        ? rankedCategoryPresets.filter((preset) => !preset.premium)
        : templateTier === "recommended"
          ? rankedCategoryPresets.slice(0, 20)
          : rankedCategoryPresets;
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
      : workflowStep === "mobile"
        ? "design"
        : "content";

  function changeWorkflowStep(step: WorkflowStep) {
    setWorkflowStep(step);
    setMainSpace(step === "library" ? "templates" : "editor");
    if (step === "mobile") {
      setDevice("mobile");
      setRightPanelOpen(true);
    }
    if (step === "review") setCommandCenterOpen(true);
  }

  function continueGuidedFlow() {
    completeWorkflowStep(workflowStep);
    const index = GUIDED_FLOW.findIndex(([step]) => step === workflowStep);
    const next = GUIDED_FLOW[index + 1]?.[0];
    if (next) changeWorkflowStep(next);
    else setCommandCenterOpen(true);
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
      {/* `paso-*` es lo que permite al modo guiado enseñar solo las
          herramientas del paso en el que estás. Sin ella, "guiado" y
          "profesional" pintaban exactamente lo mismo. */}
      {/* `theme-*` va aquí y no en <html>, que es donde lo ponía V45:
          fuera del studio está el resto de Prospector, que tiene su
          propio aspecto y no es de este selector. */}
      <div className={`studio-shell theme-${appTheme} mode-${experienceMode} paso-${workflowStep}`}>
        {/* El lateral del studio se quitó al integrarlo: Prospector ya
            tiene el suyo, y este duplicaba su navegación con botones que no
            hacían nada. Las dos acciones que sí valían siguen accesibles —
            "Plantillas" es el paso 01 del flujo de arriba y "Kit de marca"
            se abre desde el panel de diseño. */}


        <main className="studio-main">
          <header className="studio-topbar">
            <div className="title-cluster">
              {/* La miga de pan decía lo que el menú de Prospector ya dice. */}
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
                className={`device-quick ${device === "desktop" ? "active" : ""}`}
                onClick={() => setDevice("desktop")}
                aria-label="Vista de escritorio"
              >
                <Monitor /> Escritorio
              </Button>
              <Button
                variant="outline"
                className={`device-quick ${device === "mobile" ? "active" : ""}`}
                onClick={() => setDevice("mobile")}
                aria-label="Vista móvil"
              >
                <Smartphone /> Móvil
              </Button>
              <Button
                variant="outline"
                className="dark-button"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye /> Vista previa
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="dark-button more-actions-button">
                    <MoreHorizontal /> Más acciones
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="studio-more-menu">
                  <DropdownMenuLabel>Campaña</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => void duplicateTemplate()}><Copy /> Duplicar</DropdownMenuItem>
                  <DropdownMenuItem onSelect={createVisualVariant}><Sparkles /> Crear variante</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setImportOpen(true)}><Import /> Importar HTML</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => downloadFile(exportableHtml(), `${name.replace(/\W+/g, "-").toLowerCase() || "plantilla"}.html`, "text/html")}><Download /> Exportar HTML</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void saveAsMasterTemplate()}><Sparkles /> Guardar como plantilla maestra</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
                  {APP_THEMES.map((theme) => (
                    <DropdownMenuItem key={theme} onSelect={() => changeAppTheme(theme)}>
                      <Palette /> {theme === "dark" ? "Noche Aurevanta" : theme === "light" ? "Claro mineral" : theme === "ocean" ? "Océano profundo" : theme === "emerald" ? "Esmeralda ejecutiva" : "Violeta creativo"}
                      {appTheme === theme && <Check />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-tour="review" onSelect={() => setCommandCenterOpen(true)}><ShieldCheck /> Centro de revisión</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setHelpOpen(true)}><HelpCircle /> Ayuda y guía<DropdownMenuShortcut>?</DropdownMenuShortcut></DropdownMenuItem>
                  {templateId && <DropdownMenuItem variant="destructive" onSelect={() => void archiveTemplate()}><Archive /> Archivar campaña</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div
            className="workflow-bar"
            data-tour="workflow"
            aria-label="Flujo de creación de plantilla"
          >
            <div className="workflow-heading">
              <span>MODO GUIADO</span>
              <small>{completedWorkflowSteps.length}/5 fases completadas · progreso guardado</small>
            </div>
            <div className="workflow-steps">
              {GUIDED_FLOW.map(([step, number, label, detail]) => (
                <button
                  key={step}
                  className={`${workflowStep === step ? "active" : ""} ${completedWorkflowSteps.includes(step) ? "complete" : ""}`}
                  onClick={() => changeWorkflowStep(step)}
                >
                  <b>{completedWorkflowSteps.includes(step) ? <Check /> : number}</b>
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
            <div className="guided-next">
              <small>{workflowStep === "library" ? "Elige el punto de partida que mejor encaje." : workflowStep === "content" ? "Completa primero asunto, preheader y llamada a la acción." : workflowStep === "design" ? "Comprueba jerarquía, imagen, fondo y contraste." : workflowStep === "mobile" ? "Corrige solo lo necesario para móvil sin alterar escritorio." : "Resuelve los avisos críticos antes de exportar."}</small>
              <Button onClick={continueGuidedFlow}>Continuar <ChevronRight /></Button>
            </div>
          </div>

          <div className="studio-commandbar">
            <div className="command-group">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLeftPanelOpen((value) => !value)}
              >
                {leftPanelOpen ? <PanelLeftClose /> : <PanelLeftOpen />} Bloques y capas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRightPanelOpen((value) => !value)}
              >
                {rightPanelOpen ? <PanelRightClose /> : <PanelRightOpen />} Propiedades
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={alternarControlesAvanzados}
              >
                <Layers3 /> {advancedControlsOpen ? "Ocultar avanzados" : "Mostrar controles avanzados"}
              </Button>
            </div>
            <div className="command-group right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCommandPaletteOpen(true)}
              >
                <Search /> Buscar acción <kbd>Ctrl K</kbd>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-tour="review"
                onClick={() => setCommandCenterOpen(true)}
              >
                <ShieldCheck /> Revisión
              </Button>
              {templateId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="danger-ghost"
                  onClick={archiveTemplate}
                  aria-label="Archivar esta plantilla"
                  title="Archivar esta plantilla"
                >
                  <Archive />
                </Button>
              )}
            </div>
          </div>

          {/* Las tres clases de estado. Se perdieron al portar la V45 y sin
              ellas los botones «Bloques y capas», «Propiedades» y «Mostrar
              controles avanzados» cambiaban su propio icono y nada mas: el
              CSS que los escucha (estilos-studio.css, .left-collapsed,
              .right-collapsed y .hide-advanced) llevaba meses sin que nadie
              le pusiera la clase. Ver TASK-006.
              Lo de avanzados NO mira `experienceMode`, y la V45 si lo miraba
              (`advancedControlsOpen || experienceMode === "professional"`).
              Con esa condicion, en modo profesional la clase es siempre
              `show-advanced` y el boton queda inerte aunque cambie su propia
              etiqueta: justo el fallo del que venimos. El modo decide como
              empieza el editor; el clic del usuario decide como se queda.
              El `workspace-hidden` de la V45 no entra: depende de `mainSpace`,
              que aqui no se lee — el espacio de inicio lo resuelve `start-hub`. */}
          <section
            className={`workspace-grid ${leftPanelOpen ? "" : "left-collapsed"} ${
              rightPanelOpen ? "" : "right-collapsed"
            } ${advancedControlsOpen ? "show-advanced" : "hide-advanced"}`}
          >
            {/* El carril de pasos del modo guiado.
                Va aquí y no arriba porque en vertical caben el nombre y el
                estado de cada paso, y porque así está siempre a la vista
                sin robarle alto al correo. */}
            {experienceMode === "guided" && (
              <nav className="guia-pasos" aria-label="Pasos">
                {PASOS_GUIA.map((paso, i) => {
                  const aqui = PASOS_GUIA.indexOf(workflowStep);
                  const actual = i === aqui;
                  const hecho = i < aqui;
                  // Atrás siempre, y un paso hacia delante. Pinchar el
                  // siguiente del carril es lo que todo el mundo hace para
                  // avanzar; dejarlo muerto convertía el carril en un
                  // adorno y obligaba a encontrar el botón de abajo.
                  // Lo que sigue vedado es saltarse pasos de golpe.
                  const alcanzable = i <= aqui + 1;
                  return (
                    <button
                      key={paso}
                      className={`guia-paso${actual ? " actual" : ""}${hecho ? " hecho" : ""}${
                        i === aqui + 1 ? " siguiente" : ""
                      }`}
                      disabled={!alcanzable}
                      onClick={() => changeWorkflowStep(paso)}
                      aria-current={actual ? "step" : undefined}
                    >
                      <span className="guia-paso-marca">
                        {hecho ? <Check /> : String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="guia-paso-nombre">{NOMBRE_PASO[paso]}</span>
                    </button>
                  );
                })}

                {/* La navegación, pegada a los pasos.
                    Estaba en una barra a lo ancho del pie, lejos del
                    recorrido y justo encima de la marca de agua de Netlify,
                    que tapaba el botón de continuar. */}
                <div className="guia-mando">
                  {PASOS_GUIA.indexOf(workflowStep) < PASOS_GUIA.length - 1 ? (
                    <button
                      className="guia-siguiente"
                      onClick={() =>
                        changeWorkflowStep(PASOS_GUIA[PASOS_GUIA.indexOf(workflowStep) + 1])
                      }
                    >
                      Siguiente <ChevronRight />
                    </button>
                  ) : (
                    <button className="guia-siguiente" onClick={saveTemplate} disabled={saving}>
                      <Save /> {saving ? "Guardando…" : "Guardar"}
                    </button>
                  )}

                  <button
                    className="guia-atras"
                    disabled={PASOS_GUIA.indexOf(workflowStep) === 0}
                    onClick={() =>
                      changeWorkflowStep(PASOS_GUIA[PASOS_GUIA.indexOf(workflowStep) - 1])
                    }
                  >
                    <ChevronLeft /> Atrás
                  </button>

                  {/* Deshacer y rehacer a la vista: "puedes volver atrás y
                      rehacer" es la promesa del modo guiado, y una promesa
                      que solo cumple quien conoce el atajo no la cumple. */}
                  <div className="guia-rehacer">
                    <button onClick={undo} disabled={!history.length} title="Deshacer">
                      <Undo2 />
                    </button>
                    <button onClick={redo} disabled={!future.length} title="Rehacer">
                      <Redo2 />
                    </button>
                  </div>
                </div>
              </nav>
            )}

            {/* `mobile-open` es lo que abre este panel por debajo de 900 px: sin
                ella, los botones «Bloques» y «Capas» de la barra de abajo
                cambiaban de estado y no enseñaban nada. */}
            <aside
              className={`palette-panel ${
                mobilePanel === "blocks" || mobilePanel === "layers" ? "mobile-open" : ""
              }`}
              data-tour="blocks"
            >
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
                  <div className="template-tier-tabs" aria-label="Tipo de plantilla">
                    {([
                      ["recommended", "Recomendadas"],
                      ["premium", "Premium"],
                      ["all", "Todas"],
                      ["classic", "Clásicas"],
                    ] as Array<[TemplateTier, string]>).map(([tier, label]) => (
                      <button key={tier} className={templateTier === tier ? "active" : ""} onClick={() => setTemplateTier(tier)}>{label}</button>
                    ))}
                  </div>
                  {/* Crear con IA, con su botón.

                      Se llegaba únicamente por la paleta de comandos —Ctrl K—
                      porque el acceso visible vivía en el lateral de V45, que
                      aquí no entra. Un atajo de teclado no es una puerta: quien
                      no lo conoce no encuentra la función. */}
                  <div className="crear-con-ia">
                    <div>
                      <WandSparkles />
                      <span>
                        <strong>Crear con IA</strong>
                        <small>
                          Describe el negocio y monta la campaña entera: textos,
                          imágenes y diseño.
                        </small>
                      </span>
                    </div>
                    <Button variant="outline" onClick={() => abrirIA()}>
                      Empezar con IA
                    </Button>
                  </div>

                  <div className="visual-reference-bar">
                    <div><Sparkles /><span><strong>Convierte tu última composición en sistema</strong><small>Se conserva la dirección visual; no se copian textos ni datos personales.</small></span></div>
                    <Button variant="outline" onClick={() => void saveAsMasterTemplate()}>Usar esta campaña como referencia visual</Button>
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
                    <span>15 MAESTRAS PREMIUM · 5 VARIANTES · 100 DISEÑOS</span>
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
                  {/* Buscar y no encontrar no puede ser quedarse en blanco.

                      El buscador filtra de verdad —descarta lo que puntúa
                      cero—, así que una búsqueda como «tattoo», que no está en
                      el catálogo, vaciaba la lista sin decir nada. Parecía
                      averiado y además dejaba sin salida: justo el momento en
                      que la IA es la respuesta. */}
                  {search.trim() && groupedPresets.length === 0 && (
                    <div className="catalogo-vacio">
                      <p>
                        Ninguna plantilla del catálogo encaja con{" "}
                        <strong>«{search.trim()}»</strong>.
                      </p>
                      <Button variant="outline" onClick={() => abrirIA(search.trim())}>
                        <WandSparkles /> Crear una con IA para «{search.trim()}»
                      </Button>
                      <button className="enlace" onClick={() => setSearch("")}>
                        o ver el catálogo entero
                      </button>
                    </div>
                  )}

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
                                      <small>{preset.premium ? `PREMIUM · ${preset.masterName} · ${preset.variantName}` : `CLÁSICA · ${preset.designFamily}`}</small>
                                      <strong>{preset.name}</strong>
                                      <em>{preset.objective}</em>
                                    </span>
                                  </button>
                                  <div className="preset-actions">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button><Layers3 /> Aplicar plantilla</button>
                                      </DropdownMenuTrigger>
                                      {/* Aplicar trae la imagen. Antes ninguna de las tres
                                          opciones la traía, y el catálogo entero se veía
                                          vacío: las 100 recetas nacen con la miniatura a
                                          cadena vacía. El generador ya existía, pero detrás
                                          de un segundo botón que había que saber pulsar. */}
                                      <DropdownMenuContent align="start" className="studio-more-menu">
                                        <DropdownMenuItem onSelect={() => void preparePresetImage(preset)}><Sparkles /> Aplicar con su imagen</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => applyPreset(preset)}><Blocks /> Aplicar sin generar imagen</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => applyPresetStyle(preset)}><Palette /> Aplicar solo estilo</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => applyPresetStructure(preset)}><Layers3 /> Aplicar solo estructura</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
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
                    <span>MIS CAMPAÑAS</span>
                    <small>{activeSavedTemplates.length}</small>
                  </div>
                  {libraryLoading ? (
                    <div className="library-loading">
                      <LoaderCircle className="animate-spin" /> Cargando
                      espacio...
                    </div>
                  ) : activeSavedTemplates.length ? (
                    <div className="saved-list">
                      {activeSavedTemplates.map((template) => (
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
                      <button
                        className="open-campaign-library"
                        onClick={() => {
                          setCampaignLibraryFilter("active");
                          setCampaignLibraryOpen(true);
                        }}
                      >
                        <span>
                          <LayoutTemplate />
                        </span>
                        <div>
                          <strong>Ver todas mis campañas</strong>
                          <small>Buscar, abrir, copiar o archivar</small>
                        </div>
                        <ChevronRight />
                      </button>
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

                  {/* Solo aparece si hay alguna. Una sección vacía y
                      permanente llamada "Archivadas" es ruido en una
                      columna que ya tiene tres listas. */}
                  {archivedTemplates.length > 0 && (
                    <>
                      <div className="library-section-label saved">
                        <span>ARCHIVADAS</span>
                        <small>{archivedTemplates.length}</small>
                      </div>
                      <div className="saved-list archivadas">
                        {archivedTemplates.map((template) => (
                          <div key={template.id}>
                            <span>
                              <Archive />
                            </span>
                            <div>
                              <strong>{template.name}</strong>
                              <small>
                                {template.category} · v{template.version}
                              </small>
                            </div>
                            <div className="archivada-acciones">
                              <button
                                type="button"
                                onClick={() => restoreTemplate(template)}
                                title={`Restaurar "${template.name}"`}
                              >
                                <RotateCcw /> Restaurar
                              </button>
                              <button
                                type="button"
                                className="borrar"
                                onClick={() => deleteTemplateForever(template)}
                                title={`Borrar "${template.name}" definitivamente`}
                              >
                                <Trash2 />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
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
                  {activeCanvasWidth} × {Math.round(activeCanvasHeight)} px
                </div>
              </div>
              <div className="canvas-stage">
                <div className="canvas-drag-hint">
                  <GripVertical />
                  <span>
                    Arrastra cualquier bloque para moverlo, solaparlo y
                    superponerlo libremente
                  </span>
                </div>
                <div
                  className={`device-frame ${device}`}
                  style={{
                    width: `${activeCanvasWidth}px`,
                    maxWidth: "none",
                    ...(configuredCanvasHeight
                      ? {
                          height: `${configuredCanvasHeight + (device === "mobile" ? 26 : 0)}px`,
                          minHeight: 0,
                        }
                      : {}),
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
                <button onClick={() => { setWorkflowStep("review"); setCommandCenterOpen(true); }}>
                  Abrir revisión <ChevronRight />
                </button>
              </div>
            </section>

            <aside className={`inspector-panel ${mobilePanel === "edit" ? "mobile-open" : ""}`} data-tour="inspector">
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
                                    title={
                                      asset.caduca
                                        ? "Subida antes del cambio de almacenamiento: su enlace caduca a las 8 horas y en un correo llegaría rota. Vuelve a subirla."
                                        : asset.altText || asset.filename
                                    }
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
                                      {asset.caduca ? " · caduca" : ""}
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
                          {selectedBlock.type === "hero" && (
                            <>
                              <div
                                className="property-field"
                                style={{ marginTop: 16 }}
                              >
                                <label>{PROP_LABELS.imageFit}</label>
                                <select
                                  className="studio-select"
                                  value={
                                    selectedBlock.props.imageFit === "contain"
                                      ? "contain"
                                      : "cover"
                                  }
                                  onChange={(event) =>
                                    updateBlockProp(
                                      "imageFit",
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="cover">
                                    Rellenar (recorta lo que sobra)
                                  </option>
                                  <option value="contain">
                                    Entera (deja franja a los lados)
                                  </option>
                                </select>
                              </div>
                              <div className="property-field">
                                <label>{PROP_LABELS.imagePosition}</label>
                                <select
                                  className="studio-select"
                                  value={String(
                                    selectedBlock.props.imagePosition ??
                                      "center",
                                  )}
                                  onChange={(event) =>
                                    updateBlockProp(
                                      "imagePosition",
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="center">Centro</option>
                                  <option value="left">Izquierda</option>
                                  <option value="right">Derecha</option>
                                  <option value="top">Arriba</option>
                                  <option value="bottom">Abajo</option>
                                </select>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <div className="inspector-section fields-section block-layout-section">
                        <div className="section-label">
                          <span>POSICIÓN Y TAMAÑO · SOLO ESTE BLOQUE</span>
                        </div>
                        {selectedBlock.type === "hero" && (
                          <div className="hero-layout-controls">
                            <HeroFreeLayerControls
                              values={selectedBlock.props}
                              selectedLayer={selectedHeroLayer}
                              onSelect={setSelectedHeroLayer}
                              onChange={updateBlockProp}
                              onPreset={(preset) =>
                                commitDocument((current) => {
                                  const block = current.blocks.find(
                                    (item) => item.id === selectedBlockId,
                                  );
                                  if (!block) return current;
                                  block.props.heroComposition = "free";
                                  block.props.overlay = false;
                                  const presets = {
                                    cover: {
                                      heroImageX: 50,
                                      heroImageY: 50,
                                      heroImageWidth: 100,
                                      heroImageHeight: 100,
                                      heroImageZ: 1,
                                    },
                                    right: {
                                      heroImageX: 75,
                                      heroImageY: 50,
                                      heroImageWidth: 50,
                                      heroImageHeight: 100,
                                      heroImageZ: 2,
                                    },
                                    reset: {
                                      eyebrowX: 22,
                                      eyebrowY: 18,
                                      eyebrowWidth: 38,
                                      eyebrowFontSize: 14,
                                      eyebrowZ: 4,
                                      titleX: 32,
                                      titleY: 48,
                                      titleWidth: 58,
                                      titleFontSize: 58,
                                      titleZ: 5,
                                      bodyX: 28,
                                      bodyY: 78,
                                      bodyWidth: 48,
                                      bodyFontSize: 20,
                                      bodyZ: 6,
                                      heroImageX: 72,
                                      heroImageY: 50,
                                      heroImageWidth: 48,
                                      heroImageHeight: 62,
                                      heroImageZ: 2,
                                    },
                                  } as const;
                                  Object.assign(block.props, presets[preset]);
                                  return current;
                                })
                              }
                            />
                          </div>
                        )}
                        <div className="global-layer-controls">
                          <div className="global-layer-heading">
                            <div>
                              <small>CAPA LIBRE SELECCIONADA</small>
                              <strong>
                                {BLOCK_META.find(
                                  (item) => item.type === selectedBlock.type,
                                )?.label ?? selectedBlock.type}
                              </strong>
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() =>
                                  commitDocument((current) => {
                                    const block = current.blocks.find(
                                      (item) => item.id === selectedBlockId,
                                    );
                                    if (block) {
                                      const minimum = Math.min(
                                        ...current.blocks.map(
                                          (item) => Number(item.props.freeZ) || 0,
                                        ),
                                      );
                                      block.props.freeZ = Math.max(
                                        -50,
                                        minimum - 1,
                                      );
                                    }
                                    return current;
                                  })
                                }
                              >
                                Enviar detrás
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  commitDocument((current) => {
                                    const block = current.blocks.find(
                                      (item) => item.id === selectedBlockId,
                                    );
                                    if (block) {
                                      const maximum = Math.max(
                                        ...current.blocks.map(
                                          (item) => Number(item.props.freeZ) || 0,
                                        ),
                                      );
                                      block.props.freeZ = Math.min(
                                        100,
                                        maximum + 1,
                                      );
                                    }
                                    return current;
                                  })
                                }
                              >
                                Traer delante
                              </button>
                            </div>
                          </div>
                          <label className="auto-flow-toggle">
                            <input
                              type="checkbox"
                              checked={selectedBlock.props.autoFlow !== false}
                              onChange={(event) =>
                                updateBlockProp("autoFlow", event.target.checked)
                              }
                            />
                            <span>
                              <strong>Autoajustar espacio</strong>
                              <small>
                                El bloque ocupa solo su tamaño visual y acerca
                                automáticamente los elementos siguientes.
                              </small>
                            </span>
                          </label>
                          <label className="auto-flow-toggle intentional-overlap">
                            <input
                              type="checkbox"
                              checked={selectedBlock.props.overlapIntentional === true}
                              onChange={(event) => updateBlockProp("overlapIntentional", event.target.checked)}
                            />
                            <span>
                              <strong>Solapamiento intencionado</strong>
                              <small>Márcalo cuando la superposición forme parte del diseño para que la revisión no la trate como un error accidental.</small>
                            </span>
                          </label>
                          <div className="global-layer-grid">
                            {[
                              ["Posición X", "freeX", -800, 800, "px", 0],
                              ["Posición Y", "freeY", -1200, 1200, "px", 0],
                              ["Escala", "freeScale", 25, 300, "%", 100],
                              ["Profundidad", "freeZ", -50, 100, "", 0],
                            ].map(
                              ([label, key, min, max, suffix, fallback]) => (
                                <div className="property-field" key={String(key)}>
                                  <label>{label}</label>
                                  <RangeWithNumber
                                    min={Number(min)}
                                    max={Number(max)}
                                    suffix={String(suffix)}
                                    value={Number(
                                      selectedBlock.props[String(key)] ??
                                        fallback,
                                    )}
                                    onChange={(value) =>
                                      updateBlockProp(String(key), value)
                                    }
                                  />
                                </div>
                              ),
                            )}
                          </div>
                          <button
                            type="button"
                            className="reset-free-layer"
                            onClick={() =>
                              commitDocument((current) => {
                                const block = current.blocks.find(
                                  (item) => item.id === selectedBlockId,
                                );
                                if (block)
                                  Object.assign(block.props, {
                                    freeX: 0,
                                    freeY: 0,
                                    freeZ: 0,
                                    freeScale: 100,
                                  });
                                return current;
                              })
                            }
                          >
                            Restablecer posición y tamaño iniciales
                          </button>
                          <small className="field-help">
                            También puedes arrastrar este bloque directamente en
                            la maqueta. Puede cruzarse y superponerse con cualquier
                            otro bloque.
                          </small>
                        </div>
                        {device === "mobile" && (
                          <div className="mobile-responsive-controls">
                            <div className="mobile-responsive-heading">
                              <div>
                                <small>COMPOSICIÓN MÓVIL</small>
                                <strong>Adaptación inteligente</strong>
                              </div>
                              <label className="responsive-switch">
                                <input
                                  type="checkbox"
                                  checked={selectedBlock.mobile?.autoResponsive !== false}
                                  onChange={(event) =>
                                    updateMobileProp("autoResponsive", event.target.checked)
                                  }
                                />
                                <span>Automática</span>
                              </label>
                            </div>
                            <p>
                              Reorganiza los bloques, compacta márgenes y reserva
                              espacio legible para cada texto. Los ajustes manuales
                              siguen disponibles cuando quieras superponer algo.
                            </p>
                            <div className="global-layer-grid">
                              {[
                                ["Texto", "fontScale", 50, 140, "%", 100],
                                ["Ancho", "widthPercent", 30, 200, "%", 100],
                                ["Posición X", "freeX", -400, 400, "px", 0],
                                ["Posición Y", "freeY", -800, 800, "px", 0],
                                ["Escala", "freeScale", 40, 180, "%", 100],
                                ["Profundidad", "freeZ", -50, 100, "", 0],
                              ].map(([label, key, min, max, suffix, fallback]) => (
                                <div className="property-field" key={String(key)}>
                                  <label>{label}</label>
                                  <RangeWithNumber
                                    min={Number(min)}
                                    max={Number(max)}
                                    suffix={String(suffix)}
                                    value={Number(
                                      selectedBlock.mobile?.[
                                        key as keyof NonNullable<EmailBlock["mobile"]>
                                      ] ?? fallback,
                                    )}
                                    onChange={(value) =>
                                      updateMobileProp(
                                        key as keyof NonNullable<EmailBlock["mobile"]>,
                                        value,
                                      )
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="reset-free-layer"
                              onClick={() =>
                                commitDocument((current) => {
                                  const block = current.blocks.find(
                                    (item) => item.id === selectedBlockId,
                                  );
                                  if (block) {
                                    const { hidden, order, imageUrl } = block.mobile ?? {};
                                    block.mobile = {
                                      ...(hidden === undefined ? {} : { hidden }),
                                      ...(order === undefined ? {} : { order }),
                                      ...(imageUrl ? { imageUrl } : {}),
                                      autoResponsive: true,
                                    };
                                  }
                                  return current;
                                })
                              }
                            >
                              Recuperar adaptación móvil automática
                            </button>
                            <small className="field-help">
                              Estos valores solo afectan al móvil y cambian la
                              maqueta al instante. También puedes arrastrar el
                              bloque dentro del teléfono.
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
                            max={IMAGE_SIZE_MAX_PERCENT}
                            step={5}
                            suffix="%"
                            value={Number(
                              selectedBlock.props.blockWidth ?? 100,
                            )}
                            onChange={(value) =>
                              updateBlockProp("blockWidth", value)
                            }
                          />
                          <small className="field-help">
                            Hasta 200 %. Puedes combinar el ancho con la escala
                            libre para ampliar cualquier tipo de elemento.
                          </small>
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
                                  (selectedBlock.type === "button"
                                    ? selectedBlock.props.buttonStyle === "ghost"
                                    : selectedBlock.props.backgroundColor ===
                                      "transparent")
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
                                      if (block.type === "button") {
                                        block.props.buttonStyle = "ghost";
                                        block.props.buttonDepth = "none";
                                        block.props.blockDepth = "none";
                                        block.props.shadow = "none";
                                        block.props.borderWidth = 0;
                                      }
                                    }
                                    return current;
                                  })
                                }
                              >
                                {(selectedBlock.type === "button"
                                  ? selectedBlock.props.buttonStyle === "ghost"
                                  : selectedBlock.props.backgroundColor ===
                                    "transparent")
                                  ? "✓ Sin fondo"
                                  : "Sin fondo"}
                              </button>
                            </div>
                            <small className="field-help">
                              {selectedBlock.type === "button"
                                ? "Sin fondo elimina relleno, borde, sombra y profundidad 3D."
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
                          <label>
                            {selectedBlock.type === "button"
                              ? "Profundidad 3D del botón"
                              : "Profundidad 3D del bloque"}
                          </label>
                          <select
                            className="studio-select"
                            value={String(
                              selectedBlock.type === "button"
                                ? selectedBlock.props.buttonDepth ?? "none"
                                : selectedBlock.props.blockDepth ?? "none",
                            )}
                            onChange={(event) => {
                              if (selectedBlock.type !== "button") {
                                updateBlockProp(
                                  "blockDepth",
                                  event.target.value,
                                );
                                return;
                              }
                              const mode = event.target.value;
                              commitDocument((current) => {
                                const block = current.blocks.find(
                                  (item) => item.id === selectedBlockId,
                                );
                                if (!block) return current;
                                block.props.buttonDepth = mode;
                                block.props.blockDepth = "none";
                                if (mode === "raised")
                                  block.props.buttonDepthOffset = 6;
                                if (mode === "deep")
                                  block.props.buttonDepthOffset = 10;
                                if (mode === "glass")
                                  block.props.buttonDepthOffset = 12;
                                return current;
                              });
                            }}
                          >
                            {selectedBlock.type === "button" ? (
                              <>
                                <option value="none">Plano · sin profundidad</option>
                                <option value="raised">Elevado 3D</option>
                                <option value="deep">Extrusión profunda</option>
                                <option value="glass">Cristal flotante</option>
                              </>
                            ) : (
                              <>
                                <option value="none">Sin profundidad</option>
                                <option value="lifted">Elevado 3D</option>
                                <option value="deep">Extrusión profunda</option>
                                <option value="floating">Flotante premium</option>
                              </>
                            )}
                          </select>
                        </div>
                        {(selectedBlock.type === "button"
                          ? selectedBlock.props.buttonDepth !== "none"
                          : selectedBlock.props.blockDepth !== "none") && (
                          <label className="color-field">
                            <span>
                              {selectedBlock.type === "button"
                                ? "Color de profundidad del botón"
                                : "Color de profundidad"}
                            </span>
                            <div>
                              <input
                                type="color"
                                value={String(
                                  selectedBlock.type === "button"
                                    ? selectedBlock.props.buttonDepthColor ??
                                        "#064852"
                                    : selectedBlock.props.blockDepthColor ??
                                        "#0f172a",
                                )}
                                onChange={(event) =>
                                  updateBlockProp(
                                    selectedBlock.type === "button"
                                      ? "buttonDepthColor"
                                      : "blockDepthColor",
                                    event.target.value,
                                  )
                                }
                              />
                              <code>
                                {String(
                                  selectedBlock.type === "button"
                                    ? selectedBlock.props.buttonDepthColor ??
                                        "#064852"
                                    : selectedBlock.props.blockDepthColor ??
                                        "#0f172a",
                                )}
                              </code>
                            </div>
                          </label>
                        )}
                        {selectedBlock.type === "button" &&
                          selectedBlock.props.buttonDepth !== "none" && (
                            <div className="button-depth-grid">
                              {[
                                [
                                  "Distancia 3D",
                                  "buttonDepthOffset",
                                  0,
                                  24,
                                  "px",
                                  6,
                                ],
                                [
                                  "Desenfoque",
                                  "buttonDepthBlur",
                                  0,
                                  48,
                                  "px",
                                  20,
                                ],
                                [
                                  "Intensidad",
                                  "buttonDepthOpacity",
                                  0,
                                  100,
                                  "%",
                                  100,
                                ],
                              ].map(
                                ([label, key, min, max, suffix, fallback]) => (
                                  <div className="property-field" key={String(key)}>
                                    <label>{label}</label>
                                    <RangeWithNumber
                                      min={Number(min)}
                                      max={Number(max)}
                                      suffix={String(suffix)}
                                      value={Number(
                                        selectedBlock.props[String(key)] ??
                                          fallback,
                                      )}
                                      onChange={(value) =>
                                        updateBlockProp(String(key), value)
                                      }
                                    />
                                  </div>
                                ),
                              )}
                            </div>
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
                            // imageFit e imagePosition se pintan arriba, en
                            // la sección IMAGEN. Aquí caerían detrás de todo
                            // el bloque de posición y tamaño, a un scroll que
                            // nadie hace.
                            if (key === "imageFit" || key === "imagePosition")
                              return null;
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
                                          max: IMAGE_SIZE_MAX_PERCENT,
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
                  <div className="inspector-section fields-section canvas-size-editor">
                    <div className="section-label">
                      <span>TAMAÑO DE LA MAQUETA</span>
                      <small>{device === "mobile" ? "MÓVIL" : "ESCRITORIO"}</small>
                    </div>
                    <div className="canvas-size-grid">
                      <div className="property-field">
                        <label>
                          Anchura <span>{activeCanvasWidth}px</span>
                        </label>
                        <RangeWithNumber
                          min={280}
                          max={device === "mobile" ? 600 : 1600}
                          step={10}
                          suffix="px"
                          value={activeCanvasWidth}
                          onChange={(value) =>
                            device === "mobile"
                              ? updateCanvasSetting("mobileWidth", value)
                              : updateCanvasSetting("width", value)
                          }
                        />
                      </div>
                      <div className="property-field">
                        <label>
                          Altura{" "}
                          <span>
                            {configuredCanvasHeight
                              ? `${configuredCanvasHeight}px`
                              : `AUTO · ${Math.round(activeCanvasHeight)}px`}
                          </span>
                        </label>
                        <RangeWithNumber
                          min={240}
                          max={6000}
                          step={10}
                          suffix="px"
                          value={Math.round(activeCanvasHeight)}
                          onChange={(value) =>
                            device === "mobile"
                              ? updateCanvasSetting("mobileCanvasHeight", value)
                              : updateCanvasSetting("canvasHeight", value)
                          }
                        />
                      </div>
                    </div>
                    <div className="canvas-size-actions">
                      <button
                        type="button"
                        disabled={configuredCanvasHeight === undefined}
                        onClick={() =>
                          device === "mobile"
                            ? updateCanvasSetting("mobileCanvasHeight", undefined)
                            : updateCanvasSetting("canvasHeight", undefined)
                        }
                      >
                        Ajustar altura al contenido
                      </button>
                      <small>
                        La altura manual recorta lo que quede fuera del lienzo;
                        puedes mover y escalar los bloques para encajarlos.
                      </small>
                    </div>
                  </div>
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
                                    max={120}
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
                                    max={72}
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
            <nav className="mobile-editor-bar" aria-label="Herramientas del editor móvil">
              <button className={mobilePanel === "blocks" ? "active" : ""} onClick={() => { setMobilePanel(mobilePanel === "blocks" ? null : "blocks"); setWorkflowStep("content"); }}><Blocks /><span>Bloques</span></button>
              <button className={mobilePanel === "layers" ? "active" : ""} onClick={() => { setMobilePanel(mobilePanel === "layers" ? null : "layers"); setWorkflowStep("content"); }}><Layers3 /><span>Capas</span></button>
              <button className={mobilePanel === "edit" ? "active" : ""} onClick={() => setMobilePanel(mobilePanel === "edit" ? null : "edit")}><SquareMousePointer /><span>Editar</span></button>
              <button className={device === "mobile" ? "active" : ""} onClick={() => { setDevice(device === "mobile" ? "desktop" : "mobile"); setMobilePanel(null); }}><Monitor /><span>Vista</span></button>
            </nav>
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

        <Dialog
          open={campaignLibraryOpen}
          onOpenChange={setCampaignLibraryOpen}
        >
          <DialogContent className="studio-dialog campaign-library-dialog">
            <DialogHeader>
              <div className="dialog-kicker">
                <span>
                  <LayoutTemplate />
                </span>
                BIBLIOTECA DE CAMPAÑAS
              </div>
              <DialogTitle>Todas tus campañas, siempre disponibles</DialogTitle>
              <DialogDescription>
                Cada campaña se guarda en tu espacio. Ábrela para continuar o
                crea una copia independiente para utilizarla como base sin
                modificar el original.
              </DialogDescription>
            </DialogHeader>
            <div className="campaign-library-summary">
              <article>
                <strong>{activeSavedTemplates.length}</strong>
                <span>Campañas activas</span>
              </article>
              <article>
                <strong>{archivedSavedTemplates.length}</strong>
                <span>Archivadas recuperables</span>
              </article>
              <aside>
                <span>
                  {saving ? "Guardando cambios…" : "Guardado automático activo"}
                </span>
                <small>
                  {lastAutosaveAt
                    ? `Último guardado: ${lastAutosaveAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                    : "Las campañas se conservan entre sesiones"}
                </small>
              </aside>
            </div>
            <div className="campaign-library-toolbar">
              <div className="campaign-library-search">
                <Search />
                <Input
                  autoFocus
                  value={campaignSearch}
                  onChange={(event) => setCampaignSearch(event.target.value)}
                  placeholder="Buscar por nombre, asunto, categoría o contenido…"
                />
              </div>
              <Button
                className="save-button"
                onClick={async () => {
                  await newTemplate();
                  setCampaignLibraryOpen(false);
                }}
              >
                <FilePlus2 /> Nueva campaña
              </Button>
            </div>
            <div className="campaign-library-filters" role="tablist">
              {(
                [
                  ["active", "Activas", activeSavedTemplates.length],
                  ["archived", "Archivadas", archivedSavedTemplates.length],
                  ["all", "Todas", savedTemplates.length],
                ] as Array<[CampaignLibraryFilter, string, number]>
              ).map(([filter, label, count]) => (
                <button
                  key={filter}
                  role="tab"
                  aria-selected={campaignLibraryFilter === filter}
                  className={campaignLibraryFilter === filter ? "active" : ""}
                  onClick={() => setCampaignLibraryFilter(filter)}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
              <button className="refresh" onClick={() => void loadLibrary()}>
                <History /> Actualizar
              </button>
            </div>
            <div className="campaign-library-grid">
              {libraryLoading ? (
                <div className="campaign-library-empty">
                  <LoaderCircle className="animate-spin" />
                  <strong>Cargando tus campañas…</strong>
                </div>
              ) : visibleCampaigns.length ? (
                visibleCampaigns.map((template) => {
                  const cover = campaignCover(template);
                  const archived = template.status === "archived";
                  return (
                    <article
                      key={template.id}
                      className={archived ? "archived" : ""}
                    >
                      <div
                        className="campaign-card-cover"
                        style={{
                          background: cover
                            ? `linear-gradient(90deg,rgba(4,12,18,.93),rgba(4,12,18,.24)),url(${cover}) center/cover`
                            : `linear-gradient(135deg,${template.document.settings.backgroundColor},${template.document.settings.primaryColor}55)`,
                        }}
                      >
                        <span>{archived ? "ARCHIVADA" : "GUARDADA"}</span>
                        <b>v{template.version}</b>
                      </div>
                      <div className="campaign-card-copy">
                        <small>{template.category}</small>
                        <strong>{template.name}</strong>
                        <p>{template.subject || "Sin asunto definido"}</p>
                        <time>{campaignUpdatedLabel(template.updatedAt)}</time>
                      </div>
                      <div className="campaign-card-actions">
                        {archived ? (
                          <Button
                            variant="outline"
                            onClick={() => void restoreStoredTemplate(template)}
                          >
                            <History /> Recuperar
                          </Button>
                        ) : (
                          <>
                            <Button onClick={() => openStored(template)}>
                              <Eye /> Abrir
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                void duplicateStoredTemplate(template)
                              }
                            >
                              <Copy /> Usar como base
                            </Button>
                            <Button
                              variant="ghost"
                              className="danger-ghost"
                              aria-label={`Archivar ${template.name}`}
                              title="Archivar; podrás recuperarla después"
                              onClick={() =>
                                void archiveStoredTemplate(template)
                              }
                            >
                              <Archive />
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="campaign-library-empty">
                  <LayoutTemplate />
                  <strong>
                    {campaignSearch
                      ? "No hay campañas que coincidan"
                      : campaignLibraryFilter === "archived"
                        ? "No tienes campañas archivadas"
                        : "Todavía no hay campañas guardadas"}
                  </strong>
                  <small>
                    {campaignSearch
                      ? "Prueba con otro nombre, asunto o categoría."
                      : "Crea una campaña y quedará disponible aquí automáticamente."}
                  </small>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="studio-dialog help-center-dialog">
            <DialogHeader>
              <div className="dialog-kicker">
                <span>
                  <HelpCircle />
                </span>{" "}
                AYUDA INTEGRADA
              </div>
              <DialogTitle>¿Qué necesitas hacer?</DialogTitle>
              <DialogDescription>
                Consulta una fase concreta o inicia el recorrido visual sobre la
                propia aplicación.
              </DialogDescription>
            </DialogHeader>
            <div className="help-center-actions">
              <Button
                onClick={() => {
                  setHelpOpen(false);
                  setTourOpen(true);
                }}
              >
                <Sparkles /> Iniciar recorrido guiado
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setHelpOpen(false);
                  setCommandPaletteOpen(true);
                }}
              >
                <Search /> Buscar una acción
              </Button>
            </div>
            <div className="help-topic-grid">
              {HELP_SECTIONS.map((section, index) => (
                <article key={section.id}>
                  <header>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{section.title}</strong>
                  </header>
                  <p>{section.description}</p>
                  <ol>
                    {section.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
            <div className="help-center-note">
              <ShieldCheck />
              <span>
                <strong>Antes de utilizar una campaña</strong> Revisa los
                controles críticos y recuerda que Prospector validará
                destinatarios, base legal, oposición y supresiones en el flujo
                de envío.
              </span>
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
                  label: "Abrir Mis campañas",
                  keywords:
                    "campañas guardadas biblioteca historial reutilizar base",
                  icon: LayoutTemplate,
                  run: () => {
                    setCampaignLibraryFilter("active");
                    setCampaignLibraryOpen(true);
                  },
                },
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
                {modoAsistente === "simple"
                  ? "Crear un correo con IA"
                  : [
                    "Identifica la empresa",
                    "Define la campaña",
                    "Selecciona la audiencia",
                    "Dirige el diseño y la imagen",
                    "Configura la acción",
                    "Revisa y genera",
                  ][aiStep - 1]}
              </DialogTitle>
              <DialogDescription>
                {modoAsistente === "simple"
                  ? "Tres campos. La IA escribe el correo, decide el diseño y la estructura, y genera la imagen."
                  : "La IA construirá textos, imagen contextual, diseño, enlace y plantilla editable, y guardará el resultado automáticamente."}
              </DialogDescription>
            </DialogHeader>
            {modoAsistente === "avanzado" && (
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
              <small>
                Paso {aiStep} de 6 ·{" "}
                <button
                  type="button"
                  className="enlace-modo"
                  onClick={() => setModoAsistente("simple")}
                >
                  volver a lo simple
                </button>
              </small>
            </div>
            )}
            <div className="wizard-stage">
              {modoAsistente === "simple" && (
                <section className="asistente-simple">
                  <h3>Cuéntale a la IA de qué va</h3>
                  <p>
                    Con esto escribe el correo, elige los colores y la
                    tipografía, decide qué bloques lleva y genera la imagen de
                    portada. Después se puede retocar todo en el editor.
                  </p>
                  <div className="dialog-form grid-two">
                    <label>
                      <span>Nombre de la empresa *</span>
                      <Input
                        placeholder="Ej. Woody Tattoo"
                        value={aiBrief.companyName}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, companyName: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>A qué se dedica *</span>
                      <Input
                        placeholder="Ej. Estudio de tatuajes y piercings en Alfafar"
                        value={aiBrief.sector}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, sector: e.target.value })
                        }
                      />
                    </label>
                    <label className="wide">
                      <span>Qué quieres transmitir a tus clientes *</span>
                      <Textarea
                        rows={4}
                        placeholder="Ej. Que somos artistas, no una cadena: cada diseño se dibuja para quien lo lleva. Este mes hay un 20% en tatuajes y piercings."
                        value={aiBrief.queTransmitir}
                        onChange={(e) =>
                          setAiBrief({ ...aiBrief, queTransmitir: e.target.value })
                        }
                      />
                    </label>
                  </div>

                  {faltaRemitente.length > 0 && (
                    <p className="asistente-aviso">
                      El correo se generará igual, pero todavía no se puede
                      enviar: falta {faltaRemitente.join(" y ")}. Se rellena en
                      Cuenta → Correo saliente, y es lo que identifica al
                      remitente tal y como exige la LSSI-CE.
                    </p>
                  )}

                  <details className="asistente-avanzado">
                    <summary>Ajustes avanzados</summary>
                    <div className="dialog-form grid-two">
                      <label>
                        <span>Nombre de la campaña</span>
                        <Input
                          placeholder="Para encontrarla en la lista"
                          value={aiBrief.campaignName}
                          onChange={(e) =>
                            setAiBrief({ ...aiBrief, campaignName: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span>Enlace del botón</span>
                        <Input
                          placeholder="https://"
                          value={aiBrief.destinationUrl}
                          onChange={(e) =>
                            setAiBrief({ ...aiBrief, destinationUrl: e.target.value })
                          }
                        />
                      </label>
                      <label className="wide">
                        <span>A quién se escribe</span>
                        <Input
                          placeholder="Ej. clientes que ya han pasado por el estudio"
                          value={aiBrief.audience}
                          onChange={(e) =>
                            setAiBrief({ ...aiBrief, audience: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <p>
                      Sin enlace, el botón apunta a la landing de la campaña
                      cuando se envíe. Para elegir plantilla, paleta y receta
                      de imagen a mano, está el{" "}
                      <button
                        type="button"
                        className="enlace-modo"
                        onClick={() => {
                          setModoAsistente("avanzado");
                          setAiStep(1);
                        }}
                      >
                        asistente de seis pasos
                      </button>
                      .
                    </p>
                  </details>

                  {aiLoading && (
                    <div className="wizard-generating">
                      <LoaderCircle className="animate-spin" />
                      <div>
                        <strong>{aiProgress}</strong>
                        <small>
                          No cierres esta ventana. Escribir el correo y generar
                          la imagen tarda cerca de un minuto.
                        </small>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {modoAsistente === "avanzado" && aiStep === 1 && (
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
              {modoAsistente === "avanzado" && aiStep === 2 && (
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
              {modoAsistente === "avanzado" && aiStep === 3 && (
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
              {modoAsistente === "avanzado" && aiStep === 4 && (
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
              {modoAsistente === "avanzado" && aiStep === 5 && (
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
              {modoAsistente === "avanzado" && aiStep === 6 && (
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
                  modoAsistente === "simple" || aiStep === 1
                    ? setAiOpen(false)
                    : setAiStep((step) => step - 1)
                }
                disabled={aiLoading}
              >
                {modoAsistente === "simple" || aiStep === 1 ? (
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
                  if (modoAsistente === "simple") {
                    if (
                      !aiBrief.companyName.trim() ||
                      !aiBrief.sector.trim() ||
                      !aiBrief.queTransmitir.trim()
                    )
                      return toast.error(
                        "Rellena la empresa, la actividad y qué quieres transmitir",
                      );
                    return void generateTemplate();
                  }
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
                ) : modoAsistente === "avanzado" && aiStep < 6 ? (
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
                        "/imagenes/ai-campaign.webp"
                      : (selectedBlock?.props.imageUrl ??
                        "/imagenes/ai-campaign.webp")),
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
            <section className="visual-context-panel">
              <div className="visual-context-heading">
                <div>
                  <span>CONTEXTO VISUAL</span>
                  <strong>
                    {imageContext.automaticContext
                      ? "Detectado desde marca y pantalla"
                      : "Contexto personalizado"}
                  </strong>
                </div>
                <em>
                  {imageContext.placement === "canvas-background"
                    ? "FONDO"
                    : imageContext.placement === "hero"
                      ? "HERO"
                      : imageContext.placement === "image-block"
                        ? "IMAGEN"
                        : "RECURSO"}
                </em>
              </div>
              <label className="visual-context-toggle">
                <input
                  type="checkbox"
                  checked={imageContext.automaticContext !== false}
                  onChange={(event) =>
                    event.target.checked
                      ? refreshDetectedImageContext()
                      : setImageContext({
                          ...imageContext,
                          automaticContext: false,
                        })
                  }
                />
                <span>
                  Detectar automáticamente la marca, campaña, bloque y posición
                  de la imagen
                </span>
              </label>
              <div className="visual-context-fields">
                <label>
                  <span>Identidad y reglas visuales de marca</span>
                  <Textarea
                    rows={3}
                    value={imageContext.brandContext}
                    placeholder="Ej.: estudio de arquitectura mediterránea; materiales naturales, luz cálida, sin clichés corporativos…"
                    onChange={(event) =>
                      setImageContext({
                        ...imageContext,
                        brandContext: event.target.value,
                        automaticContext: false,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Contexto de pantalla y función de la imagen</span>
                  <Textarea
                    rows={4}
                    value={imageContext.screenContext}
                    placeholder="Describe qué comunica esta pantalla, qué hay alrededor de la imagen y dónde se utilizará."
                    onChange={(event) =>
                      setImageContext({
                        ...imageContext,
                        screenContext: event.target.value,
                        automaticContext: false,
                      })
                    }
                  />
                </label>
              </div>
              <button type="button" onClick={refreshDetectedImageContext}>
                <WandSparkles /> Recalcular desde la pantalla actual
              </button>
            </section>
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
          <DialogContent
            className="studio-dialog brand-dialog"
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void saveBrandKit();
              }
            }}
          >
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
            <div className="brand-dialog-scroll" tabIndex={0}>
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
                        setBrandKit({
                          ...brandKit,
                          logoUrl: event.target.value,
                        })
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
                <label className="wide">
                  <span>
                    Contexto de marca para generar imágenes
                    <small>{brandKit.brandContext.length}/1200</small>
                  </span>
                  <Textarea
                    rows={4}
                    maxLength={1200}
                    className="compact-scroll-textarea"
                    value={brandKit.brandContext}
                    onChange={(event) =>
                      setBrandKit({
                        ...brandKit,
                        brandContext: event.target.value,
                      })
                    }
                    placeholder="Qué hace la marca, para quién, qué la diferencia, productos, servicios y escenarios reales."
                  />
                </label>
                <label className="wide">
                  <span>
                    Dirección visual para imágenes
                    <small>{brandKit.imageGuidance.length}/1200</small>
                  </span>
                  <Textarea
                    rows={4}
                    maxLength={1200}
                    className="compact-scroll-textarea"
                    value={brandKit.imageGuidance}
                    onChange={(event) =>
                      setBrandKit({
                        ...brandKit,
                        imageGuidance: event.target.value,
                      })
                    }
                    placeholder="Estética, materiales, entornos, motivos recurrentes y elementos que deben evitarse."
                  />
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
                          setBrandKit({
                            ...brandKit,
                            [key]: event.target.value,
                          })
                        }
                      />
                      <Input
                        value={brandKit[key]}
                        onChange={(event) =>
                          setBrandKit({
                            ...brandKit,
                            [key]: event.target.value,
                          })
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
                      setBrandKit({
                        ...brandKit,
                        senderName: event.target.value,
                      })
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
                      setBrandKit({
                        ...brandKit,
                        legalName: event.target.value,
                      })
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
                      setBrandKit({
                        ...brandKit,
                        privacyUrl: event.target.value,
                      })
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
                      El constructor prepara identidad, privacidad, preferencias
                      y baja. Prospector validará la base aplicable, la
                      procedencia, las exclusiones y el derecho de oposición
                      antes del envío.
                    </small>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="dialog-actions-sticky">
              <Button variant="ghost" onClick={() => setBrandOpen(false)}>
                Cerrar sin aplicar
              </Button>
              <Button className="save-button" onClick={saveBrandKit}>
                <Save /> Guardar y aplicar
              </Button>
              <small>Ctrl + Enter para guardar</small>
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
