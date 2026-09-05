import {
  createBlankDocument,
  createBlock,
  type EmailBlockType,
  type TemplateDocument,
} from "@/lib/template-types";

export type ProductionDesign = {
  id: string;
  name: string;
  family: string;
  primary: string;
  accent: string;
  background: string;
  content: string;
  text: string;
  layout: "full" | "cards" | "editorial" | "dynamic";
  corner: "sharp" | "soft" | "round";
  imageStyle: string;
  archetype: string;
  motif: string;
};

export type FontPreset = {
  id: string;
  name: string;
  group: string;
  value: string;
  sample: string;
  weight: number;
  letterSpacing: number;
  transform: "none" | "uppercase" | "capitalize";
};

export type ImageRecipe = {
  id: string;
  name: string;
  sector: string;
  scene: string;
  prompt: string;
  style: string;
  thumbnail: string;
  headline: string;
  composition: string;
  palette: string;
};

export type TemplateRecipe = {
  id: string;
  name: string;
  category: string;
  objective: string;
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  designId: string;
  fontId: string;
  imageRecipeId: string;
};

const DESIGN_FAMILIES = [
  [
    "Digital Orbit",
    "#02d9ff",
    "#8c4dff",
    "Futurismo tecnológico editorial",
    "Órbita tecnológica",
    "orbit",
  ],
  [
    "Industrial Grid",
    "#ffb000",
    "#334155",
    "Fotografía industrial cinematográfica",
    "Retícula de precisión",
    "grid",
  ],
  [
    "Clinical Light",
    "#00a7a5",
    "#b7f0e7",
    "Fotografía sanitaria humana y luminosa",
    "Calma clínica",
    "halo",
  ],
  [
    "Architectural Monolith",
    "#d46237",
    "#171717",
    "Arquitectura editorial de autor",
    "Monolito arquitectónico",
    "monolith",
  ],
  [
    "Living Gallery",
    "#1e5c70",
    "#d6b46c",
    "Interiores aspiracionales de revista",
    "Galería habitable",
    "gallery",
  ],
  [
    "Culinary Close-up",
    "#b33122",
    "#ffbd59",
    "Fotografía gastronómica macro",
    "Primer plano sensorial",
    "closeup",
  ],
  [
    "Retail Collage",
    "#f43f72",
    "#6338f0",
    "Collage de producto contemporáneo",
    "Collage comercial",
    "collage",
  ],
  [
    "Automotive Motion",
    "#ff3b30",
    "#101828",
    "Automoción en movimiento cinematográfico",
    "Velocidad diagonal",
    "speed",
  ],
  [
    "Logistics Atlas",
    "#0866c6",
    "#ff8a1f",
    "Operaciones logísticas a gran escala",
    "Mapa de rutas",
    "atlas",
  ],
  [
    "Energy Horizon",
    "#00a76f",
    "#b8e11f",
    "Paisaje energético limpio",
    "Horizonte sostenible",
    "horizon",
  ],
  [
    "Financial Ledger",
    "#064e3b",
    "#d4af37",
    "Dirección financiera premium",
    "Libro de valor",
    "ledger",
  ],
  [
    "Human Shield",
    "#2450a4",
    "#68c6d9",
    "Protección humana editorial",
    "Marco protector",
    "shield",
  ],
  [
    "Learning Playground",
    "#ff6b35",
    "#2ec4b6",
    "Educación visual, inteligente y optimista",
    "Sistema modular",
    "modules",
  ],
  [
    "Travel Postcard",
    "#006d77",
    "#f4a261",
    "Viaje documental aspiracional",
    "Postal panorámica",
    "postcard",
  ],
  [
    "Beauty Ritual",
    "#9d3d75",
    "#f3c6d8",
    "Belleza editorial de lujo",
    "Ritual de producto",
    "silk",
  ],
  [
    "Sports Impact",
    "#ef2d3f",
    "#111827",
    "Acción deportiva de alto contraste",
    "Impacto cinético",
    "impact",
  ],
  [
    "Origin Story",
    "#4d6b38",
    "#d39b55",
    "Origen agroalimentario documental",
    "Materia y territorio",
    "terrain",
  ],
  [
    "Executive Journal",
    "#172554",
    "#22d3ee",
    "Retrato profesional editorial",
    "Revista ejecutiva",
    "journal",
  ],
  [
    "Event Spotlight",
    "#7424d6",
    "#ff3ea5",
    "Evento inmersivo y escénico",
    "Foco y escenario",
    "spotlight",
  ],
  [
    "Circular Future",
    "#087f5b",
    "#65d65e",
    "Tecnología medioambiental tangible",
    "Círculo regenerativo",
    "cycle",
  ],
] as const;

const DESIGN_VARIANTS = [
  ["Signature", "full", "soft", "#eef4f6", "#ffffff", "#15252d"],
  ["Nocturne", "cards", "round", "#050b12", "#101c27", "#f1f8fa"],
  ["Editorial", "editorial", "sharp", "#f2efe9", "#fffdf8", "#171717"],
  ["Dynamic", "dynamic", "soft", "#e9eef3", "#ffffff", "#17202b"],
  ["Contrast", "cards", "sharp", "#101217", "#191d25", "#f8fafc"],
] as const;

export const DESIGN_PRESETS_100: ProductionDesign[] = DESIGN_FAMILIES.flatMap(
  (family, familyIndex) =>
    DESIGN_VARIANTS.map((variant, variantIndex) => ({
      id: `design-${String(familyIndex * 5 + variantIndex + 1).padStart(3, "0")}`,
      name: `${family[0]} · ${variant[0]}`,
      family: family[0],
      primary: family[1],
      accent: family[2],
      background: variant[3],
      content: variant[4],
      text: variant[5],
      layout: variant[1],
      corner: variant[2],
      imageStyle: family[3],
      archetype: family[4],
      motif: family[5],
    })),
);

const FONT_BASES = [
  ["Arial", "Arial, Helvetica, sans-serif", "Corporativa"],
  ["Helvetica", "Helvetica, Arial, sans-serif", "Minimal"],
  ["Aptos", "Aptos, Calibri, Arial, sans-serif", "Corporativa"],
  ["Verdana", "Verdana, Geneva, sans-serif", "Legible"],
  ["Tahoma", "Tahoma, Arial, sans-serif", "Tecnológica"],
  ["Trebuchet", "'Trebuchet MS', Arial, sans-serif", "Dinámica"],
  ["Segoe UI", "'Segoe UI', Arial, sans-serif", "Digital"],
  ["Century Gothic", "'Century Gothic', Arial, sans-serif", "Geométrica"],
  ["Gill Sans", "'Gill Sans', 'Trebuchet MS', Arial, sans-serif", "Humanista"],
  ["Optima", "Optima, 'Segoe UI', Arial, sans-serif", "Premium"],
  ["Lucida", "'Lucida Sans', 'Lucida Grande', Arial, sans-serif", "Amable"],
  ["Franklin", "'Franklin Gothic Medium', Arial, sans-serif", "Impactante"],
  ["Candara", "Candara, Calibri, Arial, sans-serif", "Cercana"],
  ["Corbel", "Corbel, Calibri, Arial, sans-serif", "Contemporánea"],
  ["Georgia", "Georgia, Times, serif", "Editorial"],
  ["Times", "'Times New Roman', Times, serif", "Clásica"],
  ["Garamond", "Garamond, Georgia, serif", "Lujo"],
  ["Baskerville", "Baskerville, Georgia, serif", "Editorial"],
  ["Palatino", "Palatino, 'Palatino Linotype', Georgia, serif", "Clásica"],
  ["Rockwell", "Rockwell, 'Courier New', serif", "Robusta"],
  ["Courier", "'Courier New', Courier, monospace", "Técnica"],
  ["Consolas", "Consolas, Monaco, monospace", "Tecnológica"],
  ["Impact", "Impact, Haettenschweiler, sans-serif", "Display"],
  ["Comic", "'Comic Sans MS', cursive", "Infantil"],
  [
    "Copperplate",
    "Copperplate, 'Copperplate Gothic Light', serif",
    "Distintiva",
  ],
] as const;

const FONT_MODES = [
  ["Regular", 400, 0, "none", "Lectura clara y natural"],
  ["Executive", 700, 0.2, "none", "Autoridad con precisión"],
  ["Display", 800, 1.4, "uppercase", "IMPACTO VISUAL"],
  ["Friendly", 500, 0.4, "capitalize", "Cercanía Con Carácter"],
] as const;

export const FONT_CATALOG_100: FontPreset[] = FONT_BASES.flatMap(
  (font, fontIndex) =>
    FONT_MODES.map((mode, modeIndex) => ({
      id: `font-${String(fontIndex * 4 + modeIndex + 1).padStart(3, "0")}`,
      name: `${font[0]} ${mode[0]}`,
      group: font[2],
      value: `'Aurevanta ${fontIndex + 1} ${modeIndex + 1}', ${font[1]}`,
      sample: mode[4],
      weight: mode[1],
      letterSpacing: mode[2],
      transform: mode[3],
    })),
);

const BUSINESS_GROUPS = [
  [
    "Tecnología",
    [
      "Agencia de IA",
      "SaaS B2B",
      "Ciberseguridad",
      "Desarrollo de software",
      "Consultoría tecnológica",
    ],
    "equipo de innovación, interfaces avanzadas y datos convertidos en decisiones",
  ],
  [
    "Industria",
    [
      "Limpieza industrial",
      "Mantenimiento industrial",
      "Ingeniería mecánica",
      "Automatización industrial",
      "Fabricación avanzada",
    ],
    "planta industrial avanzada, profesionales en acción y detalle técnico realista",
  ],
  [
    "Salud",
    [
      "Clínica de fisioterapia",
      "Clínica dental",
      "Centro médico",
      "Psicología",
      "Nutrición",
    ],
    "profesional sanitario atendiendo con cercanía en un espacio moderno",
  ],
  [
    "Construcción",
    [
      "Constructora",
      "Estudio de arquitectura",
      "Reformas premium",
      "Ingeniería civil",
      "Instalaciones técnicas",
    ],
    "arquitectos, ingeniería y ejecución de alta calidad en una obra contemporánea",
  ],
  [
    "Inmobiliario",
    [
      "Agencia inmobiliaria",
      "Promotora residencial",
      "Property management",
      "Alquiler vacacional",
      "Interiorismo",
    ],
    "arquitectura y espacios premium, luminosos, aspiracionales y habitables",
  ],
  [
    "Gastronomía",
    [
      "Restaurante",
      "Hotel gastronómico",
      "Catering",
      "Pastelería artesanal",
      "Bodega",
    ],
    "producto gastronómico excepcional, equipo experto y presentación editorial",
  ],
  [
    "Comercio",
    ["Tienda de moda", "Ecommerce", "Joyería", "Óptica", "Mobiliario"],
    "experiencia de compra contemporánea y producto cuidadosamente presentado",
  ],
  [
    "Automoción",
    [
      "Concesionario",
      "Taller mecánico",
      "Renting de vehículos",
      "Movilidad eléctrica",
      "Detailing de coches",
    ],
    "vehículo y profesionales en un entorno dinámico, preciso y tecnológico",
  ],
  [
    "Logística",
    [
      "Transporte de mercancías",
      "Operador logístico",
      "Mensajería",
      "Almacén automatizado",
      "Transporte marítimo",
    ],
    "flujo eficiente de mercancías, trazabilidad y escala operativa",
  ],
  [
    "Energía",
    [
      "Energía solar",
      "Eficiencia energética",
      "Instalaciones eléctricas",
      "Hidrógeno verde",
      "Climatización",
    ],
    "infraestructura energética limpia, tecnología y sostenibilidad tangible",
  ],
  [
    "Finanzas",
    [
      "Asesoría financiera",
      "Fintech",
      "Gestoría",
      "Auditoría",
      "Inversión inmobiliaria",
    ],
    "profesionales analizando decisiones económicas con claridad, rigor y confianza",
  ],
  [
    "Seguros",
    [
      "Correduría de seguros",
      "Seguro de salud",
      "Seguro empresarial",
      "Insurtech",
      "Mediación hipotecaria",
    ],
    "protección, tranquilidad y asesoramiento humano en momentos importantes",
  ],
  [
    "Educación",
    [
      "Academia de idiomas",
      "Colegio",
      "Formación empresarial",
      "Edtech",
      "Oposiciones",
    ],
    "aprendizaje activo, estudiantes motivados y tecnología educativa",
  ],
  [
    "Turismo",
    [
      "Hotel boutique",
      "Agencia de viajes",
      "Turismo rural",
      "Experiencias de aventura",
      "Apartamentos turísticos",
    ],
    "destino extraordinario y experiencia de viaje auténtica y aspiracional",
  ],
  [
    "Belleza",
    ["Clínica estética", "Peluquería", "Cosmética", "Spa", "Centro de uñas"],
    "bienestar, belleza y cuidado personal con acabado editorial de lujo",
  ],
  [
    "Deporte",
    [
      "Gimnasio",
      "Entrenador personal",
      "Club deportivo",
      "Tienda deportiva",
      "Centro de pádel",
    ],
    "deportista en acción, energía, precisión, comunidad y superación",
  ],
  [
    "Agroalimentario",
    [
      "Agricultura ecológica",
      "Distribuidor alimentario",
      "Cooperativa",
      "Productos gourmet",
      "Ganadería sostenible",
    ],
    "origen, producción responsable y producto de máxima calidad",
  ],
  [
    "Profesionales",
    [
      "Despacho de abogados",
      "Consultoría empresarial",
      "Recursos humanos",
      "Marketing digital",
      "Traducción profesional",
    ],
    "consultores colaborando en una decisión estratégica de alto valor",
  ],
  [
    "Eventos",
    [
      "Organización de eventos",
      "Wedding planner",
      "Producción audiovisual",
      "Fotografía profesional",
      "Espacio para eventos",
    ],
    "experiencia inmersiva, iluminación cuidada, emoción y público real",
  ],
  [
    "Sostenibilidad",
    [
      "Gestión de residuos",
      "Economía circular",
      "Consultoría ambiental",
      "Tratamiento de agua",
      "Movilidad sostenible",
    ],
    "naturaleza, tecnología y operación responsable trabajando juntas",
  ],
] as const;

const BUSINESS_SECTORS = BUSINESS_GROUPS.flatMap(
  ([category, businesses, subject]) =>
    businesses.map((name) => ({
      name,
      category,
      subject: `${name}: ${subject}`,
    })),
);

const IMAGE_SCENES = [
  [
    "Retrato editorial",
    "plano humano natural con acción creíble, sujeto fuera del centro y profundidad cinematográfica",
    "Fotografía editorial",
    "negative-right",
  ],
  [
    "Operación inmersiva",
    "escena real de trabajo tomada desde dentro de la acción, escala, textura y detalle técnico",
    "Documental cinematográfico",
    "panoramic",
  ],
  [
    "Producto hero",
    "producto o servicio convertido en protagonista escultórico, iluminación de estudio y sombras expresivas",
    "Campaña publicitaria premium",
    "center-object",
  ],
  [
    "Metáfora visual",
    "concepto sofisticado y original que explica el valor del negocio sin clichés ni interfaces falsas",
    "Arte conceptual fotorrealista",
    "negative-left",
  ],
  [
    "Mundo de marca",
    "escenario panorámico propio, atmósfera reconocible y dirección de arte de campaña internacional",
    "Fotografía de marca",
    "full-bleed",
  ],
] as const;

const IMAGE_PALETTES = [
  "cian eléctrico y violeta profundo",
  "ámbar industrial y grafito",
  "verde agua y blanco luminoso",
  "terracota y negro tinta",
  "azul petróleo y oro suave",
  "rojo tomate y miel",
  "magenta y ultravioleta",
  "rojo carrera y negro carbono",
  "azul rutas y naranja señal",
  "verde energía y lima",
  "verde bosque y oro",
  "azul confianza y turquesa",
  "naranja aprendizaje y turquesa",
  "teal oceánico y coral",
  "ciruela y rosa empolvado",
  "rojo energía y negro",
  "verde tierra y cobre",
  "azul noche y cian",
  "violeta escénico y fucsia",
  "verde circular y lima",
];

export const IMAGE_RECIPES_100: ImageRecipe[] = BUSINESS_SECTORS.map(
  (business, index) => {
    const scene = IMAGE_SCENES[index % IMAGE_SCENES.length];
    const headline = [
      "La próxima ventaja empieza aquí",
      "Precisión que se nota",
      "Confianza para avanzar",
      "Construimos lo extraordinario",
      "Un espacio para vivir mejor",
    ][index % 5];
    return {
      id: `image-${String(index + 1).padStart(3, "0")}`,
      name: `${business.name} · ${scene[0]}`,
      sector: business.category,
      scene: scene[0],
      prompt: `${business.subject}. ${scene[1]}. Dirección de arte específica para ${business.name}, sin clichés genéricos, personas naturales cuando proceda, anatomía correcta, detalle nítido, contraste premium y acabado 4K. Reservar una zona limpia para texto HTML editable.`,
      style: scene[2],
      thumbnail: "",
      headline,
      composition: scene[3],
      palette: IMAGE_PALETTES[Math.floor(index / 5)],
    };
  },
);

const CAMPAIGN_TYPES = [
  [
    "Captación",
    "conseguir una conversación comercial",
    "Una oportunidad concreta para {{lead.company}}",
    "Una propuesta relevante preparada para vuestro contexto.",
    "NUEVA OPORTUNIDAD",
    "Una idea diseñada para hacer avanzar tu negocio",
    "Hola {{lead.first_name}}, hemos identificado una oportunidad específica para {{lead.company}}.",
    "Descubrir la propuesta",
  ],
  [
    "Lanzamiento",
    "presentar una novedad",
    "Algo nuevo está a punto de empezar",
    "Accede antes que nadie a una propuesta creada para marcar diferencia.",
    "NUEVO LANZAMIENTO",
    "El siguiente capítulo empieza ahora",
    "Una novedad construida para transformar la forma en que tu equipo avanza.",
    "Conocer el lanzamiento",
  ],
  [
    "Promoción",
    "activar una oferta",
    "Una ventaja especial para {{lead.company}}",
    "Condiciones exclusivas durante un periodo limitado.",
    "OPORTUNIDAD LIMITADA",
    "Más valor, en el momento adecuado",
    "Hemos preparado una condición especial para que podáis dar el siguiente paso con confianza.",
    "Activar la oferta",
  ],
  [
    "Fidelización",
    "fortalecer la relación",
    "Gracias por seguir avanzando con nosotros",
    "Nuevas ventajas y contenidos para sacar más partido a la relación.",
    "CLIENTES",
    "Lo mejor de la relación aún está por llegar",
    "Queremos ayudarte a obtener todavía más valor con una experiencia más completa y personalizada.",
    "Ver mis ventajas",
  ],
  [
    "Reactivación",
    "recuperar una conversación",
    "¿Retomamos la conversación, {{lead.first_name}}?",
    "Una propuesta más clara y una siguiente acción sencilla.",
    "VOLVAMOS A CONECTAR",
    "A veces, el momento adecuado llega después",
    "Hemos refinado la propuesta para {{lead.company}} y ahora encaja mejor con nuevas prioridades.",
    "Retomar la conversación",
  ],
] as const;

export const TEMPLATE_RECIPES_100: TemplateRecipe[] = BUSINESS_SECTORS.map(
  (business, index) => {
    const campaign = CAMPAIGN_TYPES[index % CAMPAIGN_TYPES.length];
    return {
      id: `template-${String(index + 1).padStart(3, "0")}`,
      name: business.name,
      category: business.category,
      objective: campaign[1],
      subject: campaign[2],
      preheader: campaign[3],
      eyebrow: `${business.name.toUpperCase()} · ${campaign[4]}`,
      title: campaign[5],
      body: `${campaign[6]} Una propuesta adaptada específicamente a ${business.name.toLowerCase()}.`,
      cta: campaign[7],
      designId: DESIGN_PRESETS_100[index].id,
      fontId: FONT_CATALOG_100[index].id,
      imageRecipeId: IMAGE_RECIPES_100[index].id,
    };
  },
);

const COMPOSITIONS: EmailBlockType[][] = [
  ["brand", "hero", "text", "button", "footer"],
  ["brand", "heading", "hero", "columns", "button", "footer"],
  ["brand", "hero", "artText", "text", "image", "button", "footer"],
  ["hero", "brand", "heading", "text", "divider", "button", "footer"],
  ["brand", "hero", "button", "spacer", "columns", "image", "footer"],
  ["brand", "artText", "hero", "text", "button", "divider", "footer"],
  ["brand", "heading", "image", "text", "button", "columns", "footer"],
  ["hero", "brand", "columns", "heading", "text", "button", "footer"],
  ["brand", "image", "artText", "text", "divider", "button", "footer"],
  [
    "brand",
    "hero",
    "heading",
    "columns",
    "spacer",
    "button",
    "image",
    "footer",
  ],
  ["hero", "brand", "artText", "button", "text", "footer"],
  ["brand", "columns", "hero", "heading", "button", "footer"],
  ["brand", "heading", "text", "image", "artText", "button", "footer"],
  ["hero", "heading", "button", "divider", "columns", "footer"],
  ["brand", "artText", "columns", "image", "text", "button", "footer"],
  ["image", "brand", "heading", "text", "button", "footer"],
  ["brand", "hero", "divider", "heading", "columns", "button", "footer"],
  ["artText", "brand", "hero", "button", "spacer", "text", "footer"],
  ["brand", "heading", "columns", "image", "button", "text", "footer"],
  ["hero", "brand", "text", "artText", "button", "divider", "footer"],
];

function compositionFor(index: number) {
  const base = [...COMPOSITIONS[Math.floor(index / 5) % COMPOSITIONS.length]];
  const variant = index % 5;
  if (variant === 1) base.splice(Math.max(1, base.length - 2), 0, "divider");
  if (variant === 2) base.splice(Math.min(2, base.length), 0, "artText");
  if (variant === 3) {
    const visual = base.findIndex(
      (item) => item === "hero" || item === "image",
    );
    if (visual > 0) base.unshift(base.splice(visual, 1)[0]);
  }
  if (variant === 4) base.splice(Math.max(1, base.length - 1), 0, "columns");
  return base;
}

export function buildProductionDocument(
  recipe: TemplateRecipe,
): TemplateDocument {
  const index = Math.max(
    0,
    TEMPLATE_RECIPES_100.findIndex((item) => item.id === recipe.id),
  );
  const design = catalogItem(DESIGN_PRESETS_100, recipe.designId);
  const font = catalogItem(FONT_CATALOG_100, recipe.fontId);
  const image = catalogItem(IMAGE_RECIPES_100, recipe.imageRecipeId);
  const document = createBlankDocument();
  Object.assign(document.settings, {
    primaryColor: design.primary,
    accentColor: design.accent,
    backgroundColor: design.background,
    contentColor: design.content,
    textColor: design.text,
    fontFamily: font.value,
    cornerRadius:
      design.corner === "sharp" ? 0 : design.corner === "round" ? 28 : 14,
  });
  document.creative = {
    stylePreset: design.id,
    intensity: 35 + (index % 7) * 10,
    contentDensity:
      index % 3 === 0 ? "minimal" : index % 3 === 1 ? "balanced" : "editorial",
    colorMode:
      design.background.startsWith("#0") || design.background.startsWith("#1")
        ? "dark"
        : "light",
    compatibilityMode: "hybrid",
    typographyStyle: font.id,
    imageStyle: image.style,
  };
  const familyIndex = Math.floor(index / 5);
  const variantIndex = index % 5;
  document.blocks = compositionFor(index).map((type, blockIndex) => {
    const block = createBlock(type);
    block.id = `${recipe.id}-${blockIndex}`;
    const widthSteps = [100, 92, 86, 78, 94];
    const edgeSteps = [0, 24, 32, 40, 52];
    const alignments = ["left", "center", "right"];
    Object.assign(block.props, {
      fontPreset: font.id,
      fontFamily: font.value,
      fontWeight: font.weight,
      letterSpacing: font.letterSpacing,
      textTransform: font.transform,
      textColor: design.text,
      blockWidth:
        type === "hero" && [0, 3].includes(variantIndex)
          ? 100
          : widthSteps[
              (familyIndex + variantIndex + blockIndex) % widthSteps.length
            ],
      edgePadding:
        type === "hero" && [0, 3].includes(variantIndex)
          ? 0
          : edgeSteps[
              (familyIndex + variantIndex + blockIndex * 2) % edgeSteps.length
            ],
      paddingTop: ((index + blockIndex) % 4) * 6,
      paddingBottom: 18 + ((index * 3 + blockIndex) % 6) * 6,
      blockRadius:
        design.corner === "sharp"
          ? 0
          : design.corner === "round"
            ? 26
            : 10 + (index % 4) * 3,
      backgroundColor: "transparent",
      borderWidth:
        design.layout === "dynamic" && (index + blockIndex) % 3 === 0 ? 1 : 0,
      borderColor: design.accent,
      shadow:
        design.layout === "cards" && ["hero", "image"].includes(type)
          ? "soft"
          : "none",
      rotation:
        design.layout === "dynamic" &&
        ["heading", "artText", "button"].includes(type)
          ? ((index % 5) - 2) * 1.5
          : 0,
      skewX:
        design.layout === "dynamic" && type === "artText" ? (index % 7) - 3 : 0,
      align: alignments[(index + blockIndex) % alignments.length],
    });
    if (type === "brand")
      Object.assign(block.props, {
        label: recipe.category.toUpperCase(),
        color: design.text,
      });
    if (type === "hero")
      Object.assign(block.props, {
        eyebrow: recipe.eyebrow,
        title: recipe.title,
        body: variantIndex === 0 ? "" : recipe.body,
        imageUrl: image.thumbnail,
        imageAlt: image.name,
        overlay: true,
        minHeight: 300 + ((familyIndex * 3 + variantIndex) % 7) * 48,
        verticalAlign: ["top", "center", "bottom"][
          (familyIndex + variantIndex) % 3
        ],
        imagePosition: ["left", "center", "right"][
          (familyIndex + variantIndex * 2) % 3
        ],
        paddingX: 24 + ((familyIndex + variantIndex) % 6) * 8,
        titleFontSize: 30 + ((familyIndex * 2 + variantIndex) % 7) * 5,
        bodyFontSize: 14 + ((familyIndex + variantIndex) % 4) * 2,
        textColor: "#ffffff",
        fallbackStart: design.primary,
        fallbackEnd: design.accent,
        visualMotif: design.motif,
      });
    if (type === "heading")
      Object.assign(block.props, {
        text: recipe.title,
        level: (index % 3) + 1,
        fontSize: 24 + (index % 7) * 4,
      });
    if (type === "artText")
      Object.assign(block.props, {
        text: recipe.eyebrow,
        effect: ["straight", "arc", "wave", "outline", "rotate"][index % 5],
        fontSize: 30 + (index % 6) * 5,
        color: design.accent,
      });
    if (type === "text")
      Object.assign(block.props, {
        content: `${recipe.body}\n\n${recipe.objective}.`,
        lineHeight: 1.45 + (index % 5) * 0.08,
      });
    if (type === "button")
      Object.assign(block.props, {
        label: recipe.cta,
        url: "{{campaign.cta_url}}",
        buttonColor: design.primary,
        buttonTextColor:
          design.background === "#050b12" ? "#ffffff" : "#ffffff",
        buttonStyle: index % 4 === 0 ? "outline" : "solid",
        buttonShape:
          design.corner === "sharp"
            ? "square"
            : design.corner === "round"
              ? "pill"
              : "rounded",
        buttonRadius:
          design.corner === "sharp"
            ? 0
            : design.corner === "round"
              ? 80
              : 12 + (index % 18),
        buttonWidth: index % 5 === 0 ? "full" : "auto",
      });
    if (type === "image")
      Object.assign(block.props, {
        imageUrl: image.thumbnail,
        imageAlt: image.name,
        caption: image.scene,
        widthPercent: 60 + ((familyIndex + variantIndex * 2) % 9) * 5,
        fallbackStart: design.primary,
        fallbackEnd: design.accent,
      });
    if (type === "columns")
      Object.assign(block.props, {
        leftTitle: "Ventaja principal",
        leftText: recipe.objective,
        rightTitle: "Siguiente paso",
        rightText: recipe.cta,
        columnBackgroundColor: "transparent",
      });
    if (type === "divider")
      Object.assign(block.props, {
        color: design.accent,
        thickness: 1 + (index % 4),
      });
    if (type === "spacer")
      Object.assign(block.props, { height: 16 + (index % 8) * 6 });
    if (type === "footer")
      Object.assign(block.props, {
        company: "{{sender.legal_name}}",
        address: "{{sender.postal_address}}",
        note: "{{campaign.legal_reason}}",
        privacyLabel: "Política de privacidad",
        privacyUrl: "{{sender.privacy_url}}",
        preferencesLabel: "Gestionar preferencias",
        preferencesUrl: "{{system.preferences_url}}",
        unsubscribeLabel: "Cancelar suscripción",
        unsubscribeUrl: "{{system.unsubscribe_url}}",
      });
    return block;
  });
  return document;
}

export function buildOpeningShowcaseDocument(): TemplateDocument {
  const document = createBlankDocument();
  const font = "'Arial Black', 'Segoe UI', Arial, sans-serif";
  Object.assign(document.settings, {
    width: 680,
    backgroundColor: "#06121d",
    backgroundImageUrl: "/assets/aurevanta-command-center-hero-4k.webp",
    backgroundImageOpacity: 16,
    backgroundImagePosition: "center top",
    backgroundImageSize: "cover",
    backgroundImageRepeat: "no-repeat",
    contentColor: "#07121d",
    textColor: "#f7fbff",
    mutedColor: "#9fb6c8",
    primaryColor: "#03d9ff",
    accentColor: "#985cff",
    fontFamily: font,
    cornerRadius: 24,
  });
  document.creative = {
    stylePreset: "aurevanta-command-center",
    intensity: 92,
    contentDensity: "balanced",
    colorMode: "dark",
    compatibilityMode: "hybrid",
    typographyStyle: "technology-display",
    imageStyle: "cinematic-premium",
  };

  let showcaseBlockIndex = 0;
  const block = (
    type: EmailBlockType,
    props: Record<string, string | number | boolean>,
  ) => ({
    ...createBlock(type),
    id: `showcase-${type}-${showcaseBlockIndex++}`,
    props,
  });
  document.blocks = [
    block("brand", {
      label: "AUREVANTA / AI COMMAND CENTER",
      align: "left",
      fontFamily: font,
      fontSize: 13,
      fontWeight: 900,
      lineHeight: 1.1,
      letterSpacing: 3.4,
      textTransform: "uppercase",
      textColor: "#c9f7ff",
      blockWidth: 100,
      edgePadding: 38,
      paddingTop: 34,
      paddingBottom: 20,
      backgroundColor: "transparent",
      blockRadius: 0,
      borderWidth: 0,
      borderColor: "#03d9ff",
      rotation: 0,
      skewX: 0,
      shadow: "none",
    }),
    block("hero", {
      eyebrow: "INTELIGENCIA CREATIVA · CRECIMIENTO REAL",
      title: "Convierte una idea en una campaña imposible de ignorar.",
      body: "Diseño, copy, imagen 4K y personalización comercial coordinados por IA para {{lead.company}}.",
      imageUrl: "/assets/aurevanta-command-center-hero-4k.webp",
      imageAlt:
        "Equipo directivo trabajando con inteligencia artificial en un centro de estrategia tecnológico",
      overlay: true,
      minHeight: 520,
      align: "left",
      verticalAlign: "bottom",
      imagePosition: "center",
      paddingX: 42,
      fontFamily: font,
      titleFontSize: 50,
      bodyFontSize: 17,
      fontWeight: 900,
      lineHeight: 1.02,
      letterSpacing: -1.2,
      textTransform: "none",
      textColor: "#ffffff",
      blockWidth: 100,
      edgePadding: 0,
      paddingTop: 0,
      paddingBottom: 18,
      backgroundColor: "transparent",
      blockRadius: 24,
      borderWidth: 1,
      borderColor: "#5eeeff",
      rotation: 0,
      skewX: 0,
      shadow: "glow",
      fallbackStart: "#07121d",
      fallbackEnd: "#6d28d9",
    }),
    block("artText", {
      text: "ESTRATEGIA × DISEÑO × IMPACTO",
      effect: "straight",
      rotation: -1,
      fontFamily: font,
      fontSize: 27,
      fontWeight: 900,
      lineHeight: 1,
      letterSpacing: 1.8,
      textTransform: "uppercase",
      fontStyle: "display",
      align: "center",
      textAlign: "center",
      color: "#5eeeff",
      textColor: "#5eeeff",
      textDepth: "neon",
      textDepthColor: "#7448d9",
      blockWidth: 88,
      blockAlign: "center",
      edgePadding: 28,
      paddingTop: 20,
      paddingBottom: 20,
      backgroundColor: "transparent",
      blockRadius: 16,
      borderWidth: 1,
      borderColor: "#7448d9",
      skewX: -2,
      shadow: "glow",
      blockDepth: "floating",
      blockDepthColor: "#24114f",
    }),
    block("heading", {
      text: "Tu próxima campaña empieza con una ventaja.",
      level: 2,
      align: "left",
      fontFamily: font,
      fontSize: 34,
      fontWeight: 900,
      lineHeight: 1.08,
      letterSpacing: -0.8,
      textTransform: "none",
      textColor: "#ffffff",
      blockWidth: 86,
      edgePadding: 44,
      paddingTop: 28,
      paddingBottom: 12,
      backgroundColor: "transparent",
      blockRadius: 0,
      borderWidth: 0,
      borderColor: "#03d9ff",
      rotation: 0,
      skewX: 0,
      shadow: "none",
    }),
    block("text", {
      content:
        "Hola {{lead.first_name}}, hemos preparado una experiencia que une dirección creativa, datos y automatización para transformar una oportunidad en una pieza comercial memorable. Sin plantillas genéricas. Sin perder el control.",
      align: "left",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize: 17,
      lineHeight: 1.65,
      letterSpacing: 0,
      textTransform: "none",
      fontWeight: 400,
      textColor: "#c8d8e5",
      blockWidth: 86,
      edgePadding: 44,
      paddingTop: 0,
      paddingBottom: 26,
      backgroundColor: "transparent",
      blockRadius: 0,
      borderWidth: 0,
      borderColor: "#03d9ff",
      rotation: 0,
      skewX: 0,
      shadow: "none",
    }),
    block("columns", {
      leftTitle: "01 · CREA",
      leftText:
        "Campañas completas, imágenes de alta resolución y variantes listas para personalizar.",
      rightTitle: "02 · CONVIERTE",
      rightText:
        "Mensajes relevantes, CTA claros y revisión inteligente antes de activar.",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize: 15,
      fontWeight: 500,
      lineHeight: 1.55,
      letterSpacing: 0,
      textTransform: "none",
      textAlign: "left",
      textColor: "#c8d8e5",
      columnBackgroundColor: "transparent",
      blockWidth: 88,
      blockAlign: "center",
      edgePadding: 32,
      paddingTop: 0,
      paddingBottom: 24,
      backgroundColor: "transparent",
      blockRadius: 20,
      borderWidth: 1,
      borderColor: "#5eeeff",
      rotation: 0,
      skewX: 0,
      shadow: "none",
    }),
    block("button", {
      label: "ACTIVAR MI VENTAJA",
      url: "{{campaign.cta_url}}",
      align: "center",
      textAlign: "center",
      fontFamily: font,
      fontSize: 16,
      fontWeight: 900,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      buttonStyle: "solid",
      buttonShape: "pill",
      buttonRadius: 80,
      buttonSize: "large",
      buttonWidth: "full",
      buttonColor: "#03bdda",
      buttonTextColor: "#031018",
      buttonDepth: "raised",
      buttonDepthColor: "#08798a",
      blockWidth: 72,
      blockAlign: "center",
      edgePadding: 52,
      paddingTop: 10,
      paddingBottom: 34,
      backgroundColor: "transparent",
      blockRadius: 80,
      borderWidth: 0,
      borderColor: "#03d9ff",
      rotation: 0,
      skewX: 0,
      shadow: "glow",
    }),
    block("divider", {
      color: "#6d4bcc",
      thickness: 1,
      blockWidth: 84,
      edgePadding: 44,
      paddingTop: 0,
      paddingBottom: 24,
      backgroundColor: "transparent",
      blockRadius: 0,
      borderWidth: 0,
      borderColor: "#6d4bcc",
      rotation: 0,
      skewX: 0,
      shadow: "none",
      align: "center",
    }),
    block("footer", {
      company: "{{sender.legal_name}}",
      address: "{{sender.postal_address}}",
      note: "{{campaign.legal_reason}}",
      privacyLabel: "Política de privacidad",
      privacyUrl: "{{sender.privacy_url}}",
      preferencesLabel: "Gestionar preferencias",
      preferencesUrl: "{{system.preferences_url}}",
      unsubscribeLabel: "Cancelar suscripción",
      unsubscribeUrl: "{{system.unsubscribe_url}}",
      align: "center",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize: 12,
      fontWeight: 400,
      lineHeight: 1.7,
      letterSpacing: 0.2,
      textTransform: "none",
      textColor: "#8fa6b8",
      blockWidth: 86,
      edgePadding: 44,
      paddingTop: 6,
      paddingBottom: 32,
      backgroundColor: "transparent",
      blockRadius: 0,
      borderWidth: 0,
      borderColor: "#294052",
      rotation: 0,
      skewX: 0,
      shadow: "none",
    }),
  ];
  return document;
}

export function catalogItem<T extends { id: string }>(items: T[], id?: string) {
  return items.find((item) => item.id === id) ?? items[0];
}

export const PRODUCTION_CATALOG_COUNTS = {
  designs: DESIGN_PRESETS_100.length,
  fonts: FONT_CATALOG_100.length,
  images: IMAGE_RECIPES_100.length,
  templates: TEMPLATE_RECIPES_100.length,
};
