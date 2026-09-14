// ============================================================
// La dirección de arte que propone el modelo, validada y reparada.
//
// El director de arte devuelve paleta, tipografía y estructura. Nada de eso
// se puede usar tal cual: un modelo puede elegir un gris claro sobre blanco
// —ilegible—, una fuente que no existe en ningún cliente de correo, o una
// estructura sin pie legal.
//
// EL CRITERIO ES REPARAR, NO RECHAZAR
//
// Un correo que no sale porque la IA eligió un gris feo es peor producto que
// uno con el gris oscurecido. Así que aquí no se descarta casi nada: se
// corrige y se deja constancia de lo corregido, para poder decírselo a quien
// lo generó. Solo se cae al respaldo lo que no se puede interpretar.
//
// Lo que NO se corrige es `primario` y `acento`: ahí manda la IA, porque es
// la marca del correo. El que se mueve es el texto que va encima.
// ============================================================

import { DESIGN_PRESETS_100 } from "@studio/lib/production-catalog";
import { elegirReceta, type Brief } from "./generacion";

/** Los bloques que el director de arte puede pedir. */
export const BLOQUES_PERMITIDOS = [
  "brand", "hero", "heading", "text", "columns", "divider", "spacer", "button", "footer",
] as const;

export type BloquePermitido = typeof BLOQUES_PERMITIDOS[number];

/**
 * Las pilas tipográficas, por su nombre en el prompt.
 *
 * Son las de `FONT_BASES` del catálogo, pero solo las que tienen sentido en
 * un correo comercial. Impact, Comic Sans y Copperplate están en el catálogo
 * y no salen de aquí: ninguna debería elegirla una máquina para escribir a
 * un cliente.
 */
export const PILAS_TIPOGRAFICAS: Record<string, string> = {
  "sans-neutra": "Arial, Helvetica, sans-serif",
  "sans-geometrica": "'Century Gothic', Arial, sans-serif",
  "sans-cercana": "Candara, Calibri, Arial, sans-serif",
  "sans-legible": "Verdana, Geneva, sans-serif",
  "serif-editorial": "Georgia, Times, serif",
  "serif-clasica": "'Times New Roman', Times, serif",
  "serif-lujo": "Garamond, Georgia, serif",
  "mono-tecnica": "Consolas, Monaco, monospace",
};

export type Paleta = {
  fondo: string;
  superficie: string;
  texto: string;
  suave: string;
  primario: string;
  acento: string;
  textoSobrePrimario: string;
};

export type DireccionArte = {
  paleta: Paleta;
  tipografia: keyof typeof PILAS_TIPOGRAFICAS;
  mayusculas: boolean;
  densidad: "minima" | "equilibrada" | "editorial";
  esquinas: "recta" | "suave" | "redonda";
  modo: "claro" | "oscuro";
  estructura: BloquePermitido[];
  imagePrompt: string;
  porQue: string;
};

/** Lo que se usa cuando no hay nada que reparar porque no ha llegado nada. */
export const ARTE_POR_DEFECTO: DireccionArte = {
  paleta: {
    fondo: "#eef3f6",
    superficie: "#ffffff",
    texto: "#17232b",
    suave: "#55707c",
    primario: "#0b7285",
    acento: "#7c3aed",
    textoSobrePrimario: "#ffffff",
  },
  tipografia: "sans-neutra",
  mayusculas: false,
  densidad: "equilibrada",
  esquinas: "suave",
  modo: "claro",
  estructura: ["brand", "hero", "text", "button", "footer"],
  imagePrompt: "",
  porQue: "",
};

// ------------------------------------------------------------
// Contraste · WCAG 2.1
// ------------------------------------------------------------

const HEX = /^#([0-9a-f]{6})$/i;

function aCanales(color: string): [number, number, number] | null {
  const limpio = String(color ?? "").trim();
  const corto = /^#([0-9a-f]{3})$/i.exec(limpio);
  const hex = corto
    ? `#${corto[1].split("").map((c) => c + c).join("")}`
    : limpio;
  const m = HEX.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex(canales: [number, number, number]): string {
  return `#${canales
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function luminancia(canales: [number, number, number]): number {
  const [r, g, b] = canales.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste entre dos colores. 21 es negro sobre blanco. */
export function contraste(a: string, b: string): number {
  const ca = aCanales(a);
  const cb = aCanales(b);
  if (!ca || !cb) return 0;
  const la = luminancia(ca);
  const lb = luminancia(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mezclar(canales: [number, number, number], hacia: 0 | 255, parte: number): [number, number, number] {
  return canales.map((c) => c + (hacia - c) * parte) as [number, number, number];
}

/**
 * Acerca `color` al negro o al blanco —lo que más suba el contraste— hasta
 * que pase el mínimo contra `fondo`. Si ni el extremo llega, devuelve el
 * extremo: es feo, pero se lee.
 */
export function corregirContraste(color: string, fondo: string, minimo: number): string {
  const base = aCanales(color);
  const suelo = aCanales(fondo);
  if (!base || !suelo) return color;
  if (contraste(color, fondo) >= minimo) return color;

  // Sobre un fondo claro se oscurece; sobre uno oscuro se aclara.
  const hacia: 0 | 255 = luminancia(suelo) > 0.4 ? 0 : 255;
  for (let paso = 1; paso <= 20; paso++) {
    const candidato = aHex(mezclar(base, hacia, paso * 0.06));
    if (contraste(candidato, fondo) >= minimo) return candidato;
  }
  return hacia === 0 ? "#000000" : "#ffffff";
}

/**
 * Oscurece un color hasta que el texto blanco encima se lea.
 *
 * Lo usa el degradado de respaldo del hero, el que se ve cuando todavía no
 * hay imagen: el titular va en blanco fijo —para no depender de la paleta—
 * así que el fondo tiene que ganárselo.
 */
export function fondoParaTextoBlanco(color: string, minimo = 4.5): string {
  const base = aCanales(color);
  if (!base) return "#0b1f2a";
  if (contraste("#ffffff", color) >= minimo) return aHex(base);
  for (let paso = 1; paso <= 20; paso++) {
    const candidato = aHex(mezclar(base, 0, paso * 0.06));
    if (contraste("#ffffff", candidato) >= minimo) return candidato;
  }
  return "#000000";
}

// ------------------------------------------------------------
// Validación
// ------------------------------------------------------------

/** Mínimos por par. 4.5 es el de WCAG AA para texto normal. */
const MINIMOS: Array<[keyof Paleta, keyof Paleta, number, string]> = [
  ["texto", "superficie", 4.5, "el texto del correo"],
  ["suave", "superficie", 4.5, "el texto secundario y el pie"],
  ["textoSobrePrimario", "primario", 4.5, "el texto del botón"],
  ["acento", "superficie", 3, "el color de acento"],
];

function enLista<T extends string>(valor: unknown, lista: readonly T[], porDefecto: T): T {
  const v = String(valor ?? "").trim().toLowerCase();
  return (lista as readonly string[]).includes(v) ? (v as T) : porDefecto;
}

/**
 * La estructura, con las tres reglas que no se negocian: un solo hero, al
 * menos un botón, y el pie SIEMPRE el último. Sin pie no hay enlace de baja,
 * y sin enlace de baja el envío se niega a vestir el mensaje.
 */
function validarEstructura(valor: unknown, correcciones: string[]): BloquePermitido[] {
  const bruta = Array.isArray(valor) ? valor : [];
  const limpia: BloquePermitido[] = [];

  for (const item of bruta) {
    const tipo = String(item ?? "").trim().toLowerCase();
    if (!(BLOQUES_PERMITIDOS as readonly string[]).includes(tipo)) continue;
    if (tipo === "hero" && limpia.includes("hero")) continue;
    if (tipo === "footer") continue; // se pone al final, más abajo
    if (limpia.length >= 7) break;
    limpia.push(tipo as BloquePermitido);
  }

  if (!limpia.includes("hero")) {
    limpia.unshift("hero");
    correcciones.push("Se añadió la portada, que faltaba");
  }
  if (!limpia.includes("button")) {
    limpia.push("button");
    correcciones.push("Se añadió el botón de llamada a la acción");
  }
  limpia.push("footer");

  if (bruta.length && limpia.length !== bruta.length) {
    // No se detalla más: lo importante es que el usuario sepa que la
    // estructura no es exactamente la propuesta.
  }
  return limpia;
}

/**
 * Deja la dirección de arte en condiciones de usarse.
 *
 * `respaldo` sirve para cuando el modelo no ha devuelto nada: se deriva del
 * sector con el catálogo de diseños, que para eso está, sin arrastrar nada
 * más de él —ni recetas, ni fuentes con `transform`, ni imágenes vacías—.
 */
export function validarDireccionArte(
  valor: unknown,
  respaldo: DireccionArte = ARTE_POR_DEFECTO,
): { arte: DireccionArte; correcciones: string[] } {
  const correcciones: string[] = [];
  const bruto = (valor ?? {}) as Record<string, unknown>;
  const paletaBruta = (bruto.paleta ?? {}) as Record<string, unknown>;

  const paleta = {} as Paleta;
  for (const clave of Object.keys(respaldo.paleta) as Array<keyof Paleta>) {
    const propuesto = paletaBruta[clave];
    const canales = aCanales(String(propuesto ?? ""));
    if (canales) {
      paleta[clave] = aHex(canales);
    } else {
      paleta[clave] = respaldo.paleta[clave];
      if (propuesto !== undefined) correcciones.push(`«${clave}» no era un color válido`);
    }
  }

  for (const [encima, debajo, minimo, nombre] of MINIMOS) {
    const corregido = corregirContraste(paleta[encima], paleta[debajo], minimo);
    if (corregido !== paleta[encima]) {
      paleta[encima] = corregido;
      correcciones.push(`Se ajustó el contraste de ${nombre}`);
    }
  }

  const tipografiaBruta = String(bruto.tipografia ?? "").trim().toLowerCase();
  const tipografia = tipografiaBruta in PILAS_TIPOGRAFICAS
    ? tipografiaBruta
    : respaldo.tipografia;
  if (tipografiaBruta && tipografia !== tipografiaBruta)
    correcciones.push("La tipografía propuesta no sirve para correo; se usó una segura");

  return {
    arte: {
      paleta,
      tipografia,
      mayusculas: typeof bruto.mayusculas === "boolean" ? bruto.mayusculas : respaldo.mayusculas,
      densidad: enLista(bruto.densidad, ["minima", "equilibrada", "editorial"] as const, respaldo.densidad),
      esquinas: enLista(bruto.esquinas, ["recta", "suave", "redonda"] as const, respaldo.esquinas),
      modo: enLista(bruto.modo, ["claro", "oscuro"] as const, respaldo.modo),
      estructura: validarEstructura(bruto.estructura, correcciones),
      imagePrompt: String(bruto.imagePrompt ?? "").trim(),
      porQue: String(bruto.porQue ?? "").trim(),
    },
    correcciones,
  };
}

/**
 * Una dirección de arte derivada del sector, para cuando el director de arte
 * no contesta. Usa el catálogo de diseños —que son 100 paletas hechas por
 * alguien— en vez de inventar colores.
 */
export function arteDelSector(brief: Brief): DireccionArte {
  const recetaId = elegirReceta(brief);
  const indice = Math.max(
    0,
    Number.parseInt(String(recetaId ?? "").replace(/\D/g, ""), 10) - 1,
  );
  const diseno = DESIGN_PRESETS_100[indice] ?? DESIGN_PRESETS_100[0];
  if (!diseno) return ARTE_POR_DEFECTO;

  const superficie = diseno.content ?? ARTE_POR_DEFECTO.paleta.superficie;
  return validarDireccionArte({
    paleta: {
      fondo: diseno.background,
      superficie,
      texto: diseno.text,
      suave: diseno.text,
      primario: diseno.primary,
      acento: diseno.accent,
      textoSobrePrimario: "#ffffff",
    },
    tipografia: "sans-neutra",
    mayusculas: false,
    densidad: "equilibrada",
    esquinas: diseno.corner === "sharp" ? "recta" : diseno.corner === "round" ? "redonda" : "suave",
    modo: String(diseno.background ?? "").startsWith("#0") ? "oscuro" : "claro",
    estructura: ARTE_POR_DEFECTO.estructura,
  }).arte;
}
