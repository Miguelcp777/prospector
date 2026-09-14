// ============================================================
// Diagnóstico de incidencias.
//
// Por qué esto NO es una llamada al modelo
// ----------------------------------------
// La tentación es mandarle el error a Claude y que proponga arreglo. El
// problema lo enseñó el primer fallo que hubo que diagnosticar: la
// inferencia devolvía 502 porque se había agotado el saldo de Anthropic. Un
// diagnosticador que llama a Anthropic para explicar que Anthropic no
// responde no diagnostica nada — se cae con el mismo error y encima cobra.
//
// Así que el catálogo manda: firmas conocidas, con su causa y su arreglo
// escritos por quien ya se comió el problema. Es instantáneo, gratis, y
// funciona con el proveedor caído.
//
// El modelo entra solo donde aporta algo que una tabla no puede: explicar
// un error que nadie ha visto antes. Eso vive en `diagnosticarConIA`, va
// aparte, y si no está disponible la pantalla sigue sirviendo.
// ============================================================

export type Diagnostico = {
  /** Qué ha pasado, en una frase, sin jerga. */
  causa: string;
  /** Qué hay que hacer. Pasos concretos. */
  arreglo: string[];
  /** Quién puede arreglarlo: cambia a quién se le manda. */
  responsable: "tu" | "it" | "proveedor";
  /** Si la app queda usable mientras tanto. */
  bloquea: string | null;
};

type Regla = { patron: RegExp; dx: Diagnostico };

const CATALOGO: Regla[] = [
  {
    // El que motivó todo esto. Anthropic lo manda como 400
    // invalid_request_error, que parece una petición mal formada.
    patron: /credit balance is too low|insufficient.*credit/i,
    dx: {
      causa: "Se ha agotado el saldo de la API de Anthropic.",
      arreglo: [
        "Entra en console.anthropic.com → Plans & Billing.",
        "Añade crédito o activa la recarga automática.",
        "Vuelve a intentarlo: no hay que desplegar nada.",
      ],
      responsable: "tu",
      bloquea: "Inferir segmentos, redactar mensajes y la demo pública. El descubrimiento y los leads ya guardados no se ven afectados.",
    },
  },
  {
    patron: /authentication_error|invalid x-api-key/i,
    dx: {
      causa: "La clave de la API de Anthropic no es válida o ha sido revocada.",
      arreglo: [
        "Genera una clave nueva en console.anthropic.com → API Keys.",
        "Actualízala: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...",
        "Las Edge Functions la recogen en la siguiente invocación.",
      ],
      responsable: "it",
      bloquea: "Todo lo que use el modelo: inferencia, redacción y demo.",
    },
  },
  {
    patron: /rate_limit|429/i,
    dx: {
      causa: "Demasiadas peticiones seguidas al proveedor del modelo.",
      arreglo: [
        "Espera un minuto y reintenta.",
        "Si se repite a diario, sube el límite en la consola del proveedor.",
      ],
      responsable: "tu",
      bloquea: null,
    },
  },
  {
    patron: /model.*(not found|does not exist)|unknown model/i,
    dx: {
      causa: "El identificador de modelo que usa el código ya no existe.",
      arreglo: [
        "Comprueba el nombre vigente en la documentación de Anthropic.",
        "Actualiza MODELO en supabase/functions/_shared/inferencia.ts.",
        "Redespliega las funciones que lo usan.",
      ],
      responsable: "it",
      bloquea: "Inferencia y redacción.",
    },
  },
  {
    patron: /provider is not enabled|Unsupported provider/i,
    dx: {
      causa: "El proveedor de acceso (Google) no está activado en el proyecto.",
      arreglo: [
        "Dashboard de Supabase → Authentication → Sign In / Providers → Google.",
        "Activa el interruptor, pega Client ID y Client Secret, y pulsa Save.",
        "Recarga la página para confirmar que quedó guardado.",
      ],
      responsable: "it",
      bloquea: "Entrar con Google. La entrada con correo y contraseña sigue funcionando.",
    },
  },
  {
    patron: /permission denied for (table|relation)/i,
    dx: {
      causa: "La base ha rechazado la escritura: falta permiso sobre esa tabla o columna.",
      arreglo: [
        "Es intencionado en varios sitios (los límites de la cuenta, por ejemplo).",
        "Si la operación debería estar permitida, hace falta una migración con el GRANT.",
        "No se arregla desde la app.",
      ],
      responsable: "it",
      bloquea: null,
    },
  },
  {
    patron: /row-level security|violates row-level/i,
    dx: {
      causa: "La política de aislamiento ha bloqueado la operación.",
      arreglo: [
        "Normalmente significa que el usuario no tiene fila en `profiles`.",
        "Compruébalo en la pantalla de Cuenta: si no aparece el negocio, es eso.",
      ],
      responsable: "it",
      bloquea: "Todo lo que dependa del tenant.",
    },
  },
  {
    patron: /REQUEST_DENIED|API key not valid|PERMISSION_DENIED.*places/i,
    dx: {
      causa: "Google Places rechaza la clave del proyecto.",
      // El proyecto de Places es del servicio, no del cliente: aquí no se
      // manda a nadie a mirar una cuenta que no es suya. Quien lo arregla ya
      // sabe qué revisar dentro de Google Cloud.
      arreglo: [
        "Comprueba que la API 'Places API (New)' sigue habilitada en Google Cloud.",
        "Revisa el estado del proyecto de Google.",
        "Si la clave tiene restricciones, que permitan llamadas de servidor.",
      ],
      responsable: "it",
      bloquea: "Buscar clientes potenciales.",
    },
  },
  {
    patron: /Failed to fetch|NetworkError|ERR_INTERNET/i,
    dx: {
      causa: "El navegador no ha podido contactar con el servidor.",
      arreglo: [
        "Comprueba tu conexión y reintenta.",
        "Si el resto de internet va bien, puede ser una caída de Supabase: status.supabase.com.",
      ],
      responsable: "tu",
      bloquea: null,
    },
  },
];

/** El catálogo, o null si esta firma no la hemos visto antes. */
export function diagnosticar(mensaje: string): Diagnostico | null {
  return CATALOGO.find((r) => r.patron.test(mensaje))?.dx ?? null;
}

/**
 * Firma estable para agrupar. Sin esto, un mensaje que lleva dentro un uuid
 * o una hora genera una incidencia nueva en cada intento.
 */
export function firmaDe(origen: string, mensaje: string): string {
  const conocido = CATALOGO.findIndex((r) => r.patron.test(mensaje));
  if (conocido >= 0) return `cat-${conocido}`;

  const normalizado = mensaje
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")
    .replace(/\d+/g, "")
    .replace(/[^a-záéíóúñ ]/g, "")
    .trim()
    .slice(0, 60);
  return `${origen}:${normalizado}` .slice(0, 80);
}

export type Incidencia = {
  id: string;
  origen: string;
  operacion: string | null;
  codigo: string;
  mensaje: string;
  detalle: Record<string, unknown>;
  estado: string;
  veces: number;
  primera_en: string;
  ultima_en: string;
};

/**
 * El texto que se le manda a quien tiene que arreglarlo.
 *
 * Lleva lo que hace falta para no tener que preguntar nada de vuelta: qué se
 * intentaba, qué dijo el sistema, desde cuándo, cuántas veces, y qué ya se ha
 * descartado. Un "no me funciona la inferencia" cuesta tres correos; esto,
 * ninguno.
 */
export function promptParaIT(i: Incidencia, dx: Diagnostico | null): string {
  const cuando = (s: string) => new Date(s).toLocaleString("es-ES");

  return [
    `Incidencia en Prospector (Aurevanta Labs)`,
    ``,
    `QUÉ FALLA`,
    `- Operación: ${i.operacion ?? "—"}`,
    `- Componente: ${i.origen}`,
    `- Mensaje literal: ${i.mensaje}`,
    ``,
    `CUÁNDO`,
    `- Primera vez: ${cuando(i.primera_en)}`,
    `- Última vez: ${cuando(i.ultima_en)}`,
    `- Repeticiones: ${i.veces}`,
    ``,
    dx
      ? [
          `DIAGNÓSTICO (del catálogo de la app)`,
          `- Causa probable: ${dx.causa}`,
          `- Pasos propuestos:`,
          ...dx.arreglo.map((p) => `  ${p}`),
          dx.bloquea ? `- Queda bloqueado: ${dx.bloquea}` : `- No bloquea el resto de la app.`,
        ].join("\n")
      : [
          `DIAGNÓSTICO`,
          `- Firma no catalogada. Es la primera vez que aparece este error.`,
        ].join("\n"),
    ``,
    `CONTEXTO TÉCNICO`,
    `- Proyecto Supabase: tpfjeumrvdbciktmaaii`,
    `- App: https://prospector-captacion.netlify.app`,
    `- Código interno de agrupación: ${i.codigo}`,
    Object.keys(i.detalle ?? {}).length
      ? `- Detalle: ${JSON.stringify(i.detalle)}`
      : ``,
    ``,
    `QUÉ NECESITO`,
    dx?.responsable === "tu"
      ? `Confirmación de que se ha hecho lo de arriba, o de por qué no procede.`
      : `Revisión y arreglo, o indicación de qué hace falta por mi parte.`,
  ].filter((l) => l !== undefined).join("\n");
}
