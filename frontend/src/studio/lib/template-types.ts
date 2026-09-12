export type EmailBlockType =
  | "brand"
  | "hero"
  | "heading"
  | "artText"
  | "text"
  | "button"
  | "image"
  | "columns"
  | "divider"
  | "spacer"
  | "footer";

export type TemplateVariable = {
  key: string;
  label: string;
  type: "text" | "url" | "date" | "number";
  required: boolean;
  fallback: string;
  source: "lead" | "campaign" | "sender" | "system" | "custom";
};

export type EmailBlock = {
  id: string;
  type: EmailBlockType;
  // Admite undefined a propósito: el catálogo de producción declara props
  // opcionales sin valor, y con el índice cerrado a string|number|boolean
  // ninguna plantilla del catálogo tipa.
  props: Record<string, string | number | boolean | undefined>;
  moduleRef?: {
    id: string;
    revision: number;
    index: number;
  };
  condition?: {
    field: string;
    operator: "equals" | "not_equals" | "contains" | "exists";
    value?: string;
  };
  mobile?: {
    hidden?: boolean;
    order?: number;
    widthPercent?: number;
    fontScale?: number;
    imageUrl?: string;
    autoResponsive?: boolean;
    freeX?: number;
    freeY?: number;
    freeZ?: number;
    freeScale?: number;
  };
};

export type TemplateDocument = {
  schemaVersion: 1;
  settings: {
    width: number;
    canvasHeight?: number;
    mobileWidth?: number;
    mobileCanvasHeight?: number;
    backgroundColor: string;
    backgroundMode?: "color" | "image" | "transparent";
    backgroundImageUrl?: string;
    backgroundImageOpacity?: number;
    backgroundImagePosition?:
      | "left top"
      | "center top"
      | "right top"
      | "left center"
      | "center center"
      | "right center"
      | "left bottom"
      | "center bottom"
      | "right bottom";
    backgroundImageSize?: "cover" | "contain" | "auto";
    backgroundImageRepeat?: "no-repeat" | "repeat";
    contentColor: string;
    textColor: string;
    mutedColor: string;
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    cornerRadius: number;
  };
  creative?: {
    stylePreset: string;
    intensity: number;
    contentDensity: "minimal" | "balanced" | "editorial";
    colorMode: "light" | "dark" | "adaptive";
    compatibilityMode: "compatible" | "hybrid" | "experimental";
    typographyStyle: string;
    imageStyle: string;
  };
  compliance?: {
    schemaVersion: 1;
    builderStatus: "ready" | "incomplete";
    prospectorValidationRequired: true;
    requiredRuntimeVariables: string[];
    senderIdentityConfigured: boolean;
    privacyConfigured: boolean;
  };
  variables: TemplateVariable[];
  blocks: EmailBlock[];
  rawHtml?: string;
};

export type StoredTemplate = {
  id: string;
  name: string;
  category: string;
  status: string;
  subject: string;
  preheader: string;
  document: TemplateDocument;
  htmlCache?: string;
  textCache?: string;
  thumbnailUrl?: string | null;
  sourceType: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_VARIABLES: TemplateVariable[] = [
  {
    key: "lead.first_name",
    label: "Nombre",
    type: "text",
    required: false,
    fallback: "María",
    source: "lead",
  },
  {
    key: "lead.company",
    label: "Empresa",
    type: "text",
    required: false,
    fallback: "Empresa Ejemplo",
    source: "lead",
  },
  {
    key: "lead.segment",
    label: "Segmento",
    type: "text",
    required: false,
    fallback: "Servicios profesionales",
    source: "lead",
  },
  {
    key: "campaign.offer",
    label: "Oferta",
    type: "text",
    required: true,
    fallback: "una auditoría inicial sin compromiso",
    source: "campaign",
  },
  {
    key: "campaign.cta_url",
    label: "URL del CTA",
    type: "url",
    required: true,
    fallback: "https://example.com/reserva",
    source: "campaign",
  },
  {
    key: "sender.name",
    label: "Remitente",
    type: "text",
    required: true,
    fallback: "Laura",
    source: "sender",
  },
  {
    key: "sender.company",
    label: "Empresa remitente",
    type: "text",
    required: true,
    fallback: "Aurevanta Labs",
    source: "sender",
  },
  {
    key: "sender.legal_name",
    label: "Razón social",
    type: "text",
    required: true,
    fallback: "Aurevanta Labs",
    source: "sender",
  },
  {
    key: "sender.postal_address",
    label: "Dirección postal",
    type: "text",
    required: true,
    fallback: "Valencia, España",
    source: "sender",
  },
  {
    key: "sender.privacy_url",
    label: "Política de privacidad",
    type: "url",
    required: true,
    fallback: "https://example.com/privacidad",
    source: "sender",
  },
  {
    key: "sender.privacy_email",
    label: "Contacto de privacidad",
    type: "text",
    required: false,
    fallback: "privacidad@example.com",
    source: "sender",
  },
  {
    key: "campaign.legal_reason",
    label: "Motivo de la comunicación",
    type: "text",
    required: true,
    fallback:
      "Recibes esta comunicación por la relación existente con nuestra empresa.",
    source: "campaign",
  },
  {
    key: "system.unsubscribe_url",
    label: "Enlace de baja",
    type: "url",
    required: true,
    fallback: "https://example.com/baja",
    source: "system",
  },
  {
    key: "system.preferences_url",
    label: "Centro de preferencias",
    type: "url",
    required: true,
    fallback: "https://example.com/preferencias",
    source: "system",
  },
];

export const REQUIRED_COMPLIANCE_VARIABLES = [
  "sender.legal_name",
  "sender.postal_address",
  "sender.privacy_url",
  "campaign.legal_reason",
  "system.unsubscribe_url",
  "system.preferences_url",
] as const;

export function blockId(prefix = "block") {
  const nativeId = globalThis.crypto?.randomUUID?.();
  const fallbackId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${nativeId ?? fallbackId}`;
}

export function createBlankDocument(): TemplateDocument {
  return {
    schemaVersion: 1,
    settings: {
      width: 640,
      mobileWidth: 375,
      backgroundColor: "#eef3f6",
      backgroundMode: "color",
      backgroundImageUrl: "",
      backgroundImageOpacity: 100,
      backgroundImagePosition: "center center",
      backgroundImageSize: "cover",
      backgroundImageRepeat: "no-repeat",
      contentColor: "#ffffff",
      textColor: "#111827",
      mutedColor: "#637083",
      primaryColor: "#0b7285",
      accentColor: "#7c3aed",
      fontFamily: "Arial, Helvetica, sans-serif",
      cornerRadius: 18,
    },
    creative: {
      stylePreset: "executive",
      intensity: 55,
      contentDensity: "balanced",
      colorMode: "light",
      compatibilityMode: "compatible",
      typographyStyle: "modern-sans",
      imageStyle: "editorial",
    },
    compliance: {
      schemaVersion: 1,
      builderStatus: "ready",
      prospectorValidationRequired: true,
      requiredRuntimeVariables: [...REQUIRED_COMPLIANCE_VARIABLES],
      senderIdentityConfigured: true,
      privacyConfigured: true,
    },
    variables: DEFAULT_VARIABLES,
    blocks: [
      {
        id: blockId("brand"),
        type: "brand",
        props: { label: "AUREVANTA LABS", align: "left" },
      },
      {
        id: blockId("hero"),
        type: "hero",
        props: {
          eyebrow: "NUEVA OPORTUNIDAD",
          title: "Una propuesta creada para {{lead.company}}",
          body: "Hola {{lead.first_name}}, hemos identificado una oportunidad concreta para mejorar vuestro proceso comercial.",
          imageUrl: "/assets/ai-campaign.webp",
          imageAlt: "Inteligencia comercial y campañas",
          // Una plantilla nueva nace en composición libre, que es la novedad
          // de V45. Las guardadas antes no llevan esta prop y siguen en el
          // hero clásico hasta que su dueño mueva una capa: ver el comentario
          // de `freeMode` en email-renderer.ts.
          heroComposition: "free",
          overlay: false,
          minHeight: 360,
          align: "left",
          verticalAlign: "center",
          imagePosition: "center",
          paddingX: 38,
        },
      },
      {
        id: blockId("button"),
        type: "button",
        props: {
          label: "Ver propuesta",
          url: "{{campaign.cta_url}}",
          align: "left",
        },
      },
      {
        id: blockId("text"),
        type: "text",
        props: {
          content:
            "Podemos preparar {{campaign.offer}} y enseñarte el resultado aplicado a vuestro caso.",
        },
      },
      {
        id: blockId("footer"),
        type: "footer",
        props: {
          company: "{{sender.legal_name}}",
          address: "{{sender.postal_address}}",
          note: "{{campaign.legal_reason}}",
          privacyLabel: "Política de privacidad",
          privacyUrl: "{{sender.privacy_url}}",
          preferencesLabel: "Gestionar preferencias",
          preferencesUrl: "{{system.preferences_url}}",
          unsubscribeLabel: "Cancelar suscripción",
          unsubscribeUrl: "{{system.unsubscribe_url}}",
        },
      },
    ],
  };
}

export function createBlock(
  type: EmailBlockType,
  stableId?: string,
): EmailBlock {
  const presets: Record<
    EmailBlockType,
    Record<string, string | number | boolean>
  > = {
    brand: {
      label: "TU MARCA",
      align: "left",
      textAlign: "left",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 13,
      fontWeight: 800,
      lineHeight: 1.2,
      letterSpacing: 3,
      textTransform: "uppercase",
      textColor: "#111827",
      textDepth: "none",
      textDepthColor: "#111827",
    },
    hero: {
      eyebrow: "NOVEDAD",
      title: "Un titular que detiene el scroll",
      body: "Explica el valor principal con claridad y una sola idea.",
      imageUrl: "/assets/ai-campaign.webp",
      imageAlt: "Imagen principal de campaña",
      overlay: false,
      heroComposition: "free",
      eyebrowPosition: "top-left",
      titlePosition: "center-left",
      bodyPosition: "bottom-left",
      heroImagePosition: "center-right",
      eyebrowX: 22,
      eyebrowY: 18,
      eyebrowWidth: 38,
      eyebrowFontSize: 14,
      eyebrowZ: 4,
      eyebrowRotation: 0,
      eyebrowOpacity: 100,
      eyebrowTextAlign: "left",
      titleX: 32,
      titleY: 48,
      titleWidth: 58,
      titleZ: 5,
      titleRotation: 0,
      titleOpacity: 100,
      titleTextAlign: "left",
      bodyX: 28,
      bodyY: 78,
      bodyWidth: 48,
      bodyZ: 6,
      bodyRotation: 0,
      bodyOpacity: 100,
      bodyTextAlign: "left",
      heroImageX: 72,
      heroImageY: 50,
      heroImageWidth: 48,
      heroImageHeight: 62,
      heroImageZ: 2,
      heroImageRotation: 0,
      heroImageOpacity: 100,
      heroImageFit: "cover",
      heroOverflow: "hidden",
      minHeight: 360,
      align: "left",
      textAlign: "left",
      verticalAlign: "center",
      imagePosition: "center",
      paddingX: 38,
      fontFamily: "Arial, Helvetica, sans-serif",
      titleFontSize: 34,
      bodyFontSize: 17,
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      textTransform: "none",
      textColor: "#ffffff",
      textDepth: "none",
      textDepthColor: "#071019",
      blockRadius: 28,
      heroGeometryUnified: true,
    },
    heading: {
      text: "Título de sección",
      level: 2,
      align: "left",
      textAlign: "left",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 28,
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      textTransform: "none",
      textColor: "#111827",
      textDepth: "none",
      textDepthColor: "#111827",
    },
    artText: {
      text: "Una idea imposible de ignorar",
      effect: "arc",
      rotation: 0,
      fontFamily: "Georgia, Times, serif",
      fontSize: 42,
      fontWeight: 800,
      lineHeight: 1.05,
      letterSpacing: 0,
      textTransform: "none",
      fontStyle: "display",
      align: "center",
      textAlign: "center",
      color: "#7c3aed",
      textDepth: "none",
      textDepthColor: "#29145f",
    },
    text: {
      content:
        "Escribe aquí un mensaje breve, relevante y centrado en el destinatario.",
      align: "left",
      textAlign: "left",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 16,
      lineHeight: 1.72,
      letterSpacing: 0,
      textTransform: "none",
      fontWeight: 400,
      textColor: "#111827",
      textDepth: "none",
      textDepthColor: "#111827",
    },
    button: {
      label: "Llamada a la acción",
      url: "{{campaign.cta_url}}",
      align: "left",
      textAlign: "center",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: 0,
      textTransform: "none",
      buttonStyle: "solid",
      buttonShape: "pill",
      buttonRadius: 999,
      buttonSize: "medium",
      buttonWidth: "auto",
      buttonColor: "#0b7285",
      buttonTextColor: "#ffffff",
      buttonDepth: "none",
      buttonDepthColor: "#064852",
      buttonDepthOffset: 6,
      buttonDepthBlur: 20,
      buttonDepthOpacity: 100,
      textDepth: "none",
      textDepthColor: "#071019",
      blockWidth: 40,
      blockRadius: 80,
      buttonGeometryUnified: true,
    },
    image: {
      imageUrl: "/assets/ai-campaign.webp",
      imageAlt: "Imagen de campaña",
      caption: "",
      widthPercent: 100,
      align: "center",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 12,
      textColor: "#637083",
    },
    columns: {
      leftTitle: "Beneficio uno",
      leftText: "Describe el primer beneficio.",
      rightTitle: "Beneficio dos",
      rightText: "Describe el segundo beneficio.",
      align: "left",
      textAlign: "left",
      columnBackgroundColor: "transparent",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 14,
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: 0,
      textTransform: "none",
      textColor: "#111827",
      textDepth: "none",
      textDepthColor: "#111827",
    },
    divider: { color: "#dbe3ea", thickness: 1 },
    spacer: { height: 28 },
    footer: {
      company: "{{sender.legal_name}}",
      address: "{{sender.postal_address}}",
      note: "{{campaign.legal_reason}}",
      privacyLabel: "Política de privacidad",
      privacyUrl: "{{sender.privacy_url}}",
      preferencesLabel: "Gestionar preferencias",
      preferencesUrl: "{{system.preferences_url}}",
      unsubscribeLabel: "Cancelar suscripción",
      unsubscribeUrl: "{{system.unsubscribe_url}}",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 12,
      fontWeight: 400,
      lineHeight: 1.65,
      letterSpacing: 0,
      textTransform: "none",
      textColor: "#637083",
    },
  };
  return {
    id: stableId ?? blockId(type),
    type,
    props: {
      blockWidth: type === "button" ? 40 : 100,
      edgePadding: 40,
      paddingTop: type === "hero" ? 0 : 0,
      paddingBottom: type === "hero" ? 24 : 24,
      backgroundColor: "transparent",
      blockAlign: "left",
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
      ...presets[type],
    },
  };
}
