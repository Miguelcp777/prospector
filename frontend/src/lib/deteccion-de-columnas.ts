// Adivinar qué columna es cada cosa en la hoja que ha subido el cliente.
//
// LA IDEA, EN UNA FRASE: manda el contenido, no la cabecera.
//
// Mirar el nombre de la columna es lo primero que se le ocurre a cualquiera
// y es lo que falla: cada cliente la llama de una forma, en un idioma, con
// faltas, o no la llama de ninguna porque su hoja no tiene títulos. Lo que
// no cambia nunca es que una columna de correos está llena de cosas con un
// arroba en medio. Así que se muestrea el contenido y la cabecera solo
// desempata.
//
// Y nada de esto decide nada por su cuenta: **propone**. La pantalla enseña
// la propuesta, dice por qué, y deja cambiarla. Una detección que importa
// sola es una detección que un día escribe a dos mil personas llamándolas
// por el nombre de su ciudad.

export type Rol = "email" | "nombre" | "empresa" | "telefono" | "web";

export type ColumnaPropuesta = {
  indice: number;
  /** Proporción de celdas de la muestra que encajan con el patrón del rol. */
  proporcion: number;
  /** Cuántas celdas no vacías se han mirado. */
  celdas: number;
  /** Qué dice la cabecera: 1 exacta, 0.6 por inclusión, 0 nada. */
  cabecera: number;
};

export type Deteccion = {
  propuesta: Partial<Record<Rol, ColumnaPropuesta>>;
  /** Dos columnas se parecen demasiado; hay que mirarlo. */
  ambiguo: boolean;
  /** No hay ninguna candidata a correo: sin esto no se puede importar. */
  sinEmail: boolean;
};

// ---------------------------------------------------------------------------
// Normalizar una cabecera
// ---------------------------------------------------------------------------

/** «Teléfono» → «telefono». «E-Mail / correo» → «e mail correo». */
export function normalizar(cabecera: string): string {
  return cabecera
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const EXACTOS: Record<Rol, string[]> = {
  email: ["email", "e mail", "mail", "correo", "correo electronico", "correo e",
          "direccion de correo", "email address", "contact email", "emailaddress",
          "mail contacto", "e correo"],
  nombre: ["nombre", "nombres", "name", "first name", "full name", "nombre completo",
           "nombre y apellidos", "contacto", "contact", "titular", "persona"],
  empresa: ["empresa", "negocio", "compania", "company", "organizacion", "organization",
            "razon social", "comercio", "account", "cuenta", "cliente"],
  telefono: ["telefono", "tlf", "tel", "movil", "celular", "phone", "telephone",
             "mobile", "whatsapp", "numero"],
  web: ["web", "sitio web", "pagina web", "website", "url", "dominio", "site"],
};

const CONTIENE: Record<Rol, string[]> = {
  email: ["mail", "correo"],
  // «contacto» y «persona» estaban solo en EXACTOS, así que «Persona de
  // contacto» —de las cabeceras más comunes de un CRM español— no la cogía
  // nadie: `nombre` no tiene firma de contenido, y si la cabecera falla no
  // hay segunda oportunidad. No arrastra a las de correo ni teléfono porque
  // esos roles se reparten ANTES y se llevan su columna: «Correo de
  // contacto» ya está ocupada cuando le toca el turno a `nombre`.
  nombre: ["nombre", "name", "contacto", "persona", "titular"],
  empresa: ["empresa", "company", "negocio"],
  telefono: ["tel", "phone", "movil"],
  web: ["web", "url", "site"],
};

function puntosDeCabecera(cabecera: string, rol: Rol): number {
  const n = normalizar(cabecera);
  if (n === "") return 0;
  if (EXACTOS[rol].includes(n)) return 1;
  if (CONTIENE[rol].some((t) => n.includes(t))) return 0.6;
  return 0;
}

// ---------------------------------------------------------------------------
// Muestreo por contenido
// ---------------------------------------------------------------------------

const MUESTRA_MAX = 200;
const MIN_CELDAS = 5;

// Más estricta que la de validacion.ts, y a propósito: para DETECTAR una
// columna quieres pocos falsos positivos; para ACEPTAR una dirección
// concreta quieres pocos falsos negativos, y de eso ya se ocupa la base.
const RE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
const RE_TEL = /^[+(]?\d[\d\s().-]{6,}$/;
const RE_WEB = /^(https?:\/\/|www\.)|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i;

/**
 * Coge hasta 200 filas REPARTIDAS por todo el archivo, no las 200 primeras.
 * Muchas hojas llevan las filas raras al final —los «pendientes», los que
 * se dieron de baja, las notas— y mirando solo la cabeza no se ven.
 */
function muestrear<T>(filas: T[]): T[] {
  if (filas.length <= MUESTRA_MAX) return filas;
  const paso = Math.ceil(filas.length / MUESTRA_MAX);
  return filas.filter((_, i) => i % paso === 0);
}

function proporcion(muestra: string[][], col: number, re: RegExp): { p: number; n: number } {
  const celdas: string[] = [];
  for (const f of muestra) {
    const v = (f[col] ?? "").trim();
    if (v !== "") celdas.push(v);
  }
  if (celdas.length === 0) return { p: 0, n: 0 };
  // Devuelve siempre la proporción real y cuántas celdas la sostienen. Quién
  // se fía de una muestra pequeña lo decide quien acepta, no quien mide:
  // devolver 0 aquí hacía que una cabecera exacta sobre tres filas quedara
  // vetada por una guarda pensada para no adivinar por contenido.
  const aciertos = celdas.filter((c) => re.test(c)).length;
  return { p: aciertos / celdas.length, n: celdas.length };
}

// ---------------------------------------------------------------------------
// La detección
// ---------------------------------------------------------------------------

/**
 * @param cabeceras  Los títulos, o `Columna 1…n` si la hoja no traía.
 * @param datos      Las filas SIN la cabecera.
 */
export function detectar(cabeceras: string[], datos: string[][]): Deteccion {
  const muestra = muestrear(datos);
  const columnas = cabeceras.length;
  const propuesta: Partial<Record<Rol, ColumnaPropuesta>> = {};

  // 1 · El email primero: es el único obligatorio y el que más señal tiene.
  const candidatas = [];
  for (let j = 0; j < columnas; j++) {
    const { p, n } = proporcion(muestra, j, RE_EMAIL);
    const h = puntosDeCabecera(cabeceras[j] ?? "", "email");
    candidatas.push({ indice: j, proporcion: p, celdas: n, cabecera: h, puntos: 0.75 * p + 0.25 * h });
  }
  candidatas.sort((a, b) => b.puntos - a.puntos);
  const mejor = candidatas[0];

  const aceptaEmail =
    mejor !== undefined &&
    // Por contenido: hace falta una muestra que lo sostenga.
    ((mejor.celdas >= MIN_CELDAS && mejor.proporcion >= 0.6) ||
      (mejor.celdas >= MIN_CELDAS && mejor.proporcion >= 0.3 && mejor.cabecera > 0) ||
      // Por cabecera exacta: aquí el tamaño de la muestra da igual mientras
      // el contenido no la contradiga. Es el caso de «tengo doce clientes»,
      // y el de una columna «Email» de un CRM casi entera vacía. Preselecciona;
      // no importa sin mirar, que eso no lo decide esto.
      (mejor.cabecera === 1 && (mejor.proporcion >= 0.5 || (mejor.celdas >= 20 && mejor.proporcion >= 0.1))));

  let ambiguo = false;
  if (aceptaEmail) {
    const segunda = candidatas[1];
    // Ambiguo no es «empatan los puntos», es «hay otra columna que también
    // está llena de correos». El riesgo que hay que avisar es elegir la
    // columna equivocada, y una cabecera más bonita no lo reduce: con
    // «Email» y «Email 2» los puntos se separan 0,1 y aun así el usuario
    // tiene que decir a cuál de las dos quiere escribir.
    if (segunda && (segunda.proporcion >= 0.6 || Math.abs(mejor.puntos - segunda.puntos) < 0.05)) {
      ambiguo = true;
      // Con los puntos pegados gana la cabecera, luego el contenido, y por
      // último la de más a la izquierda.
      if (
        Math.abs(mejor.puntos - segunda.puntos) < 0.05 &&
        (segunda.cabecera > mejor.cabecera ||
          (segunda.cabecera === mejor.cabecera && segunda.proporcion > mejor.proporcion))
      ) {
        candidatas[0] = segunda;
        candidatas[1] = mejor;
      }
    }
    const e = candidatas[0];
    propuesta.email = { indice: e.indice, proporcion: e.proporcion, celdas: e.celdas, cabecera: e.cabecera };
  }

  // 2 · Las demás, sobre las columnas que queden libres. Un rol por columna.
  const usadas = new Set<number>();
  if (propuesta.email) usadas.add(propuesta.email.indice);

  const porContenido: Array<[Rol, RegExp, number]> = [
    ["telefono", RE_TEL, 0.6],
    ["web", RE_WEB, 0.5],
  ];
  for (const [rol, re, umbral] of porContenido) {
    let elegida: ColumnaPropuesta | null = null;
    let mejoresPuntos = 0;
    for (let j = 0; j < columnas; j++) {
      if (usadas.has(j)) continue;
      const { p, n } = proporcion(muestra, j, re);
      // Una columna de correos casa parcialmente con el patrón de web.
      if (rol === "web" && proporcion(muestra, j, RE_EMAIL).p > 0.2) continue;
      const h = puntosDeCabecera(cabeceras[j] ?? "", rol);
      // Mismo criterio que el email: por contenido hace falta muestra; por
      // cabecera exacta, no.
      const acepta = (n >= MIN_CELDAS && (p >= umbral || (p >= 0.3 && h > 0))) || h === 1;
      if (!acepta) continue;
      const puntos = 0.7 * p + 0.3 * h;
      if (puntos > mejoresPuntos) {
        mejoresPuntos = puntos;
        elegida = { indice: j, proporcion: p, celdas: n, cabecera: h };
      }
    }
    if (elegida) {
      propuesta[rol] = elegida;
      usadas.add(elegida.indice);
    }
  }

  // 3 · Nombre y empresa SOLO por cabecera.
  //
  // No tienen firma: «Clínica Dental Ruiz» y «María Ruiz» son texto libre
  // indistinguible. Una heurística de «¿parece un nombre de persona?»
  // acierta el 70 % y falla justo en los nombres que importan, que son los
  // que no se parecen a los de la lista con la que se entrenó.
  for (const rol of ["empresa", "nombre"] as const) {
    let elegida: ColumnaPropuesta | null = null;
    let mejorH = 0;
    for (let j = 0; j < columnas; j++) {
      if (usadas.has(j)) continue;
      const h = puntosDeCabecera(cabeceras[j] ?? "", rol);
      if (h > mejorH) {
        mejorH = h;
        elegida = { indice: j, proporcion: 0, celdas: 0, cabecera: h };
      }
    }
    if (elegida && mejorH > 0) {
      propuesta[rol] = elegida;
      usadas.add(elegida.indice);
    }
  }

  return { propuesta, ambiguo, sinEmail: !propuesta.email };
}

/** El texto que la pantalla enseña debajo del desplegable. */
export function porQue(c: ColumnaPropuesta | undefined): string {
  if (!c) return "";
  const pct = Math.round(c.proporcion * 100);
  if (c.celdas === 0) return "Elegida por el nombre de la columna";
  if (c.cabecera === 1 && pct < 30) {
    return `El nombre de la columna lo dice, aunque solo ${pct} de cada 100 celdas lo parezcan`;
  }
  return `${pct} de cada 100 celdas de esa columna lo parecen`;
}
