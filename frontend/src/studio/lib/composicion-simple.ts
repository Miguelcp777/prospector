// ============================================================
// El correo del flujo simple, montado sin catálogo.
//
// `generarDocumento` parte de una receta de `TEMPLATE_RECIPES_100` y hereda
// con ella cuatro cosas que no tienen nada que ver con el negocio del
// cliente. Con un estudio de tatuajes se veía en una sola pantalla:
//
//   · la etiqueta «SALUD»            ← recipe.category.toUpperCase()
//   · «CLÍNICA DE FISIOTERAPIA · NUEVA OPORTUNIDAD» en medio del correo
//                                    ← el bloque artText, que nadie pisaba
//   · un recuadro con degradado y la leyenda «Retrato editorial»
//                                    ← un bloque image cuya imagen es ""
//   · TODO EN MAYÚSCULAS             ← el textTransform de la fuente del
//                                      catálogo, estampado en cada bloque
//
// Aquí no hay catálogo, así que no hay nada de eso que heredar. Los bloques
// salen de `createBlock` y solo se tocan las props que se nombran.
//
// Lo que sí se conserva del camino de siempre: el contrato TemplateDocument
// v1 —el documento sigue siendo editable bloque a bloque en el studio— y el
// pie con sus variables, que es lo que garantiza el enlace de baja.
// ============================================================

import {
  createBlankDocument,
  createBlock,
  type EmailBlock,
  type TemplateDocument,
} from "@studio/lib/template-types";
import {
  fondoParaTextoBlanco,
  PILAS_TIPOGRAFICAS,
  type BloquePermitido,
  type DireccionArte,
} from "./direccion-arte";
import type { GeneratedCopy } from "./generacion";

/** Lo que escribe el redactor, con el repertorio que puede pedir la estructura. */
export type CopyCampana = GeneratedCopy & {
  ventajas?: Array<{ titulo?: string; texto?: string }>;
  cierre?: string;
};

export type EntradaComposicion = {
  copy: CopyCampana;
  arte: DireccionArte;
  nombreEmpresa: string;
  urlImagen?: string | null;
  urlDestino?: string | null;
};

/** Tamaños por densidad: alto del hero, cuerpo del titular y aire lateral. */
const MEDIDAS = {
  minima: { alto: 300, titular: 34, aire: 28, cuerpo: 16, interlineado: 1.7 },
  equilibrada: { alto: 360, titular: 40, aire: 38, cuerpo: 16, interlineado: 1.72 },
  editorial: { alto: 400, titular: 44, aire: 46, cuerpo: 17, interlineado: 1.8 },
} as const;

const RADIOS = { recta: 0, suave: 14, redonda: 28 } as const;

/** Solo se acepta un destino que sea una URL de verdad. */
function destinoValido(url?: string | null): string {
  const limpia = String(url ?? "").trim();
  // El brief nace con "https://" puesto: eso no es un destino, es un hueco.
  return /^https?:\/\/.+\..+/.test(limpia) ? limpia : "{{campaign.cta_url}}";
}

export function componerDocumentoSimple(entrada: EntradaComposicion): TemplateDocument {
  const { copy, arte, nombreEmpresa, urlImagen, urlDestino } = entrada;
  const { paleta } = arte;
  const medidas = MEDIDAS[arte.densidad];
  const pila = PILAS_TIPOGRAFICAS[arte.tipografia] ?? PILAS_TIPOGRAFICAS["sans-neutra"];
  const radio = RADIOS[arte.esquinas];

  const documento = createBlankDocument();

  documento.settings = {
    ...documento.settings,
    backgroundColor: paleta.fondo,
    contentColor: paleta.superficie,
    textColor: paleta.texto,
    mutedColor: paleta.suave,
    primaryColor: paleta.primario,
    accentColor: paleta.acento,
    fontFamily: pila,
    cornerRadius: radio,
  };

  documento.creative = {
    stylePreset: "simple-ia",
    intensity: 55,
    contentDensity:
      arte.densidad === "minima" ? "minimal" : arte.densidad === "editorial" ? "editorial" : "balanced",
    colorMode: arte.modo === "oscuro" ? "dark" : "light",
    // `compatible` apaga la rotación del texto artístico en el renderizador.
    // Un correo comercial no es el sitio para tipografía girada.
    compatibilityMode: "compatible",
    typographyStyle: arte.tipografia,
    imageStyle: "editorial",
  };

  documento.blocks = arte.estructura
    .map((tipo) => bloque(tipo, { copy, arte, nombreEmpresa, urlImagen, urlDestino, pila, medidas, radio }))
    .filter((b): b is EmailBlock => b !== null);

  return documento;
}

type Contexto = EntradaComposicion & {
  pila: string;
  medidas: typeof MEDIDAS[keyof typeof MEDIDAS];
  radio: number;
};

function bloque(tipo: BloquePermitido, ctx: Contexto): EmailBlock | null {
  const { copy, arte, nombreEmpresa, urlImagen, urlDestino, pila, medidas, radio } = ctx;
  const { paleta } = arte;
  const b = createBlock(tipo);

  // Tipografía común a todos los bloques. `textTransform: "none"` se escribe
  // siempre y a propósito: es la prop que el catálogo ponía en "uppercase" y
  // el renderizador lee la del bloque antes que la del documento.
  Object.assign(b.props, {
    fontFamily: pila,
    textTransform: "none",
    textColor: paleta.texto,
    blockRadius: radio,
  });

  switch (tipo) {
    case "brand":
      Object.assign(b.props, {
        // El nombre de la empresa del cliente. Aquí iba la categoría del
        // catálogo, y por eso un estudio de tatuajes se presentaba como SALUD.
        label: nombreEmpresa || "{{sender.company}}",
        // El logo de la cuenta, por variable. Si no hay ninguno se resuelve
        // a vacío y el renderizador pinta el nombre, que es exactamente lo
        // que hay que enseñar entonces.
        logoUrl: "{{brand.logo_url}}",
        textTransform: arte.mayusculas ? "uppercase" : "none",
        letterSpacing: arte.mayusculas ? 3 : 0,
      });
      return b;

    case "hero":
      Object.assign(b.props, {
        eyebrow: copy.eyebrow ?? "",
        title: copy.title ?? "",
        body: arte.densidad === "minima" ? "" : copy.body ?? "",
        imageUrl: urlImagen ?? "",
        imageAlt: (arte.imagePrompt || copy.title || "").slice(0, 180),
        // Composición clásica, no libre: la libre coloca las capas en
        // porcentajes fijos dentro de un contenedor con overflow oculto, y un
        // titular largo se corta. Si el usuario arrastra una capa, el editor
        // la pasa a libre, que es cuando debe serlo.
        heroComposition: "clasico",
        // Con overlay, el renderizador pone su degradado oscuro bajo el texto:
        // la legibilidad del titular deja de depender de la paleta elegida.
        overlay: true,
        textColor: "#ffffff",
        fallbackStart: fondoParaTextoBlanco(paleta.primario),
        fallbackEnd: fondoParaTextoBlanco(paleta.acento),
        minHeight: medidas.alto,
        titleFontSize: medidas.titular,
        bodyFontSize: medidas.cuerpo,
        paddingX: medidas.aire,
        imageFit: "cover",
      });
      return b;

    case "heading":
      if (!copy.sectionTitle?.trim()) return null;
      Object.assign(b.props, {
        text: copy.sectionTitle,
        fontSize: Math.round(medidas.titular * 0.6),
      });
      return b;

    case "text": {
      // Un hueco que el redactor deja se queda sin bloque, no con relleno.
      // Aquí es donde se colaba la plantilla determinista: componía
      // «Auditoría de oportunidades para Lumen Arquitectura» con la oferta
      // de fábrica del asistente y el destinatario de ejemplo, y la metía
      // en medio del correo de un estudio de tatuajes.
      const contenido = [copy.sectionTitle, copy.sectionBody]
        .map((t) => (t ?? "").trim()).filter(Boolean).join("\n\n");
      if (!contenido) return null;
      Object.assign(b.props, {
        content: contenido,
        fontSize: medidas.cuerpo,
        lineHeight: medidas.interlineado,
      });
      return b;
    }

    case "columns": {
      // Las ventajas las escribe siempre el redactor, se usen o no: es lo que
      // permite que el director de arte pida columnas sin esperar a nadie.
      const [una, otra] = copy.ventajas ?? [];
      if (!una?.texto && !otra?.texto) return null;
      Object.assign(b.props, {
        leftTitle: una?.titulo ?? "",
        leftText: una?.texto ?? "",
        rightTitle: otra?.titulo ?? "",
        rightText: otra?.texto ?? "",
        columnBackgroundColor: "transparent",
        fontSize: medidas.cuerpo - 1,
      });
      return b;
    }

    case "button":
      Object.assign(b.props, {
        label: copy.ctaLabel || "Más información",
        url: destinoValido(urlDestino),
        buttonColor: paleta.primario,
        buttonTextColor: paleta.textoSobrePrimario,
        buttonRadius: radio,
      });
      return b;

    case "footer":
      // Las variables {{sender.*}} y {{system.unsubscribe_url}} se dejan como
      // están: son las que el envío rellena con los datos reales, y el enlace
      // de baja es obligatorio. Ver docs/compliance.md.
      //
      // Lo que sí se quita es «Gestionar preferencias». No existe tal centro
      // de preferencias, y al vestir un mensaje de verdad
      // `system.preferences_url` se rellena con la URL de BAJA: un enlace que
      // promete elegir qué recibir y lo que hace es darte de baja de todo.
      //
      // La 044 dejó puesto el mecanismo —un enlace del pie se dibuja solo si
      // tiene texto Y destino— pero solo actúa si alguien los vacía a mano, y
      // nadie lo hacía. Aquí se vacía la etiqueta.
      //
      // Solo la etiqueta. La URL se deja escrita porque el contrato del
      // studio comprueba que `system.preferences_url` esté en las props del
      // pie —`REQUIRED_COMPLIANCE_VARIABLES`, y la barra de calidad del
      // editor la mira—. Sin etiqueta el enlace no se dibuja, que es lo que
      // se quería, y el documento sigue cumpliendo lo que dice cumplir.
      Object.assign(b.props, {
        preferencesLabel: "",
        preferencesUrl: "{{system.preferences_url}}",
      });
      return b;

    case "divider":
    case "spacer":
      return b;

    default:
      return null;
  }
}
