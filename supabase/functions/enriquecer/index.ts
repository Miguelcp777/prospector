// ============================================================
// Edge Function · enriquecer  (Fase 2)
//
// Places no devuelve correos. Este worker entra en la web del lead, busca
// el buzón de contacto y valida que el dominio pueda recibir correo.
//
// No cuesta dinero: son peticiones HTTP a webs públicas. Lo que cuesta es
// tiempo, así que va troceado igual que `descubrir` y lo despierta el mismo
// cron.
//
// REGLA QUE NO SE TOCA SIN LEER docs/compliance.md:
// se acepta el buzón de la EMPRESA y se descarta el de una PERSONA. El
// correo de una persona física es dato personal bajo RGPD y tiene otro
// tratamiento; el de la empresa como entidad, no.
//
// La primera versión invertía la carga con una lista blanca de buzones
// genéricos, y sobre 28 webs reales descartó el 39 % — entre ellos
// `informacion@`, `comunicacion@` y buzones de sede como
// `valencia-ruzafa@fitnesspark.es`. Ninguno era una persona. De ahí que
// ahora la regla sea "acepta salvo que parezca de alguien".
//
// Desplegar: supabase functions deploy enriquecer --no-verify-jwt
// Secretos:  supabase secrets set WORKER_SECRETO=<la misma que descubrir>
// ============================================================

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const PLAZO_MS = Number(Deno.env.get("ENRIQUECER_PLAZO_MS") ?? 100_000);
const TAREAS_POR_TANDA = 8;      // Es espera de red: caben más que en Places.
const TIMEOUT_FETCH_MS = 8_000;
const MAX_HTML = 400_000;        // Un contacto no necesita más. Corta webs enormes.
const AGENTE = "ProspectorBot/1.0 (+contacto: buzon publico de la web)";

/** Rutas donde una empresa suele poner su correo, en orden de probabilidad. */
const RUTAS_CONTACTO = ["/contacto", "/contact", "/aviso-legal", "/legal", "/contactar"];

/**
 * Buzones que se prefieren cuando hay varios. No es una lista blanca: la
 * primera versión lo era y descartaba el 39 % de los hallazgos, entre ellos
 * `informacion@`, `comunicacion@` y buzones de sede como
 * `valencia-ruzafa@fitnesspark.es` — todos de empresa, ninguno de persona.
 */
const BUZONES_PREFERIDOS = new Set([
  "info", "informacion", "contacto", "contact", "hola", "hello", "correo",
  "mail", "buzon", "administracion", "admin", "recepcion", "reservas",
  "citas", "cita", "secretaria", "gerencia", "direccion", "comercial",
  "ventas", "atencion", "clientes", "soporte", "ayuda", "comunicacion",
  "marketing", "prensa", "rrhh", "empleo", "facturacion", "pedidos",
  "clinica", "centro", "oficina", "consulta", "general",
]);

/**
 * Lo que compliance.md quiere evitar no es un buzón raro: es el correo de
 * una persona física, que sí es dato personal bajo RGPD. Así que la regla
 * pasa a ser "acepta salvo que parezca una persona".
 *
 * Nombres de pila más comunes en España. No pretende ser exhaustivo — el
 * caso que no cubre es el buzón que solo lleva un apellido (`duato@`), que
 * se acepta y es el riesgo residual conocido de este enfoque.
 */
const NOMBRES_PILA = new Set([
  "juan","jose","maria","antonio","manuel","francisco","david","javier","daniel",
  "carlos","miguel","rafael","pedro","angel","alejandro","fernando","sergio",
  "pablo","jorge","alberto","luis","alvaro","adrian","diego","raul","enrique",
  "ivan","ruben","oscar","andres","joaquin","ramon","jesus","victor","ricardo",
  "marcos","mario","roberto","eduardo","gonzalo","ignacio","hugo","guillermo",
  "santiago","cristian","gabriel","tomas","martin","alfonso","felipe","borja",
  "ana","carmen","laura","isabel","marta","cristina","lucia","sara","paula",
  "elena","raquel","patricia","silvia","beatriz","rocio","natalia","andrea",
  "irene","alba","julia","nuria","eva","susana","monica","sonia","teresa",
  "pilar","angeles","rosa","yolanda","veronica","noelia","alicia","clara",
  "sandra","lorena","celia","blanca","carla","ines","nerea","olga","gema",
  "amparo","consuelo","esther","virginia","miriam","lidia","aitana",
]);

/**
 * Ruido habitual: iconos, servicios de terceros y —el que más engaña—
 * dominios de plantilla que el diseñador se dejó puestos. `hola@miempresa.es`
 * apareció en una web real y se guardó como si fuera un lead válido.
 */
const DOMINIOS_RUIDO = [
  "sentry.io", "wixpress.com", "example.com", "example.org", "domain.com",
  "email.com", "sentry-next",
  "miempresa.es", "miempresa.com", "midominio.com", "midominio.es",
  "tuempresa.com", "tuempresa.es", "tudominio.com", "tudominio.es",
  "your-domain.com", "dominio.com", "empresa.com", "tusitio.com",
];
const EXTENSIONES_IMAGEN = /\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i;

const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

type Tarea = {
  id: string;
  job_id: string;
  tenant_id: string;
  lead_id: string;
  query: string;          // aquí viaja la URL del lead
  intentos: number;
};

Deno.serve(async (req) => {
  const secreto = Deno.env.get("WORKER_SECRETO");
  if (!secreto || req.headers.get("x-worker-secreto") !== secreto) {
    return new Response(JSON.stringify({ error: "No autorizado." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const hasta = Date.now() + PLAZO_MS;
  let procesadas = 0, encontrados = 0, errores = 0;

  while (Date.now() < hasta) {
    const { data: tareas, error } = await supabase.rpc("reclamar_tareas", {
      p_limite: TAREAS_POR_TANDA,
      p_tipo: "enriquecer",
    });

    if (error) {
      console.error("No se pudieron reclamar tareas:", error.message);
      break;
    }
    if (!tareas || tareas.length === 0) break;

    for (const tarea of tareas as Tarea[]) {
      if (Date.now() >= hasta) {
        await devolverACola(supabase, tarea, "Plazo de la invocación agotado");
        continue;
      }

      try {
        const hallazgo = await buscarEmail(tarea.query);

        if (hallazgo.email) {
          const { error: fallo } = await supabase
            .from("leads")
            .update({
              email: hallazgo.email,
              email_origen: hallazgo.origen,
              email_capturado_en: new Date().toISOString(),
            })
            .eq("id", tarea.lead_id);
          if (fallo) throw new Error(`Guardando email: ${fallo.message}`);
          encontrados++;
        }

        await supabase.from("job_tareas")
          .update({
            estado: "hecho",
            detalle: hallazgo.detalle.slice(0, 300),
            actualizado_en: new Date().toISOString(),
          })
          .eq("id", tarea.id);

        procesadas++;
      } catch (e) {
        errores++;
        const mensaje = e instanceof Error ? e.message : String(e);
        console.error(`Tarea ${tarea.id} (${tarea.query}):`, mensaje);

        // Una web caída hoy puede estar viva mañana. Dos intentos y a otra
        // cosa: aquí no hay factura que justifique insistir más.
        if (tarea.intentos < 2) {
          await devolverACola(supabase, tarea, mensaje);
        } else {
          await supabase.from("job_tareas")
            .update({
              estado: "error",
              detalle: mensaje.slice(0, 300),
              actualizado_en: new Date().toISOString(),
            })
            .eq("id", tarea.id);
        }
      }

      await supabase.rpc("cerrar_job_si_completo", { p_job: tarea.job_id });
    }
  }

  return new Response(
    JSON.stringify({ procesadas, encontrados, errores }),
    { headers: { "content-type": "application/json" } },
  );
});

async function devolverACola(supabase: SupabaseClient, tarea: Tarea, motivo: string) {
  await supabase.from("job_tareas")
    .update({
      estado: "pendiente",
      detalle: motivo.slice(0, 300),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", tarea.id);
}

type Hallazgo = { email: string | null; origen: string | null; detalle: string };

/**
 * Recorre la web del lead buscando un buzón genérico.
 *
 * Se para en cuanto encuentra uno válido: no hace falta recorrer el sitio
 * entero, y cada página de más es una petición al servidor de un tercero.
 */
async function buscarEmail(web: string): Promise<Hallazgo> {
  const base = normalizarUrl(web);
  if (!base) return { email: null, origen: null, detalle: "URL no utilizable" };

  if (!(await robotsPermite(base))) {
    return { email: null, origen: null, detalle: "robots.txt lo desaconseja" };
  }

  const urls = [base.href, ...RUTAS_CONTACTO.map((r) => new URL(r, base).href)];
  const descartados = new Set<string>();
  let visitadas = 0;

  for (const url of urls) {
    const html = await bajar(url);
    if (html === null) continue;
    visitadas++;

    const { aceptado, rechazados } = clasificar(html, base.hostname);
    rechazados.forEach((e) => descartados.add(e));

    if (aceptado) {
      if (await tieneMx(aceptado.split("@")[1])) {
        return { email: aceptado, origen: url, detalle: `Encontrado en ${rutaCorta(url)}` };
      }
      descartados.add(`${aceptado} (dominio sin MX)`);
    }
  }

  if (visitadas === 0) return { email: null, origen: null, detalle: "La web no respondió" };

  // Distinguir "no hay correo" de "hay pero no vale" importa: lo segundo es
  // una decisión de compliance, no una web pobre, y conviene poder revisarla.
  if (descartados.size > 0) {
    return {
      email: null,
      origen: null,
      detalle: `Solo correos de persona (descartados): ${[...descartados].slice(0, 3).join(", ")}`,
    };
  }
  return { email: null, origen: null, detalle: "Sin correo en la web" };
}

function normalizarUrl(web: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(web) ? web : `https://${web}`);
  } catch {
    return null;
  }
}

function rutaCorta(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "la portada" : u.pathname;
  } catch {
    return url;
  }
}

/**
 * Comprobación deliberadamente simple: solo respeta un "Disallow: /" para
 * User-agent: *. No es un parser completo de robots.txt, y no pretende
 * serlo — pero honra la señal inequívoca de "no me rastrees".
 */
async function robotsPermite(base: URL): Promise<boolean> {
  const txt = await bajar(new URL("/robots.txt", base).href);
  if (!txt) return true;                    // Sin robots.txt, adelante.

  const lineas = txt.split("\n").map((l) => l.trim().toLowerCase());
  let enGeneral = false;
  for (const l of lineas) {
    if (l.startsWith("user-agent:")) enGeneral = l.includes("*");
    else if (enGeneral && l.startsWith("disallow:")) {
      if (l.replace("disallow:", "").trim() === "/") return false;
    }
  }
  return true;
}

async function bajar(url: string): Promise<string | null> {
  const corte = AbortSignal.timeout(TIMEOUT_FETCH_MS);
  try {
    const r = await fetch(url, {
      headers: { "user-agent": AGENTE, accept: "text/html,text/plain,*/*" },
      signal: corte,
      redirect: "follow",
    });
    if (!r.ok) return null;
    const texto = await r.text();
    return texto.slice(0, MAX_HTML);
  } catch {
    return null;                            // Timeout, DNS, TLS: no es un fallo nuestro.
  }
}

function clasificar(html: string, dominioSitio: string) {
  const encontrados = [...new Set(html.match(RE_EMAIL) ?? [])]
    .map((e) => e.toLowerCase())
    .filter((e) => !EXTENSIONES_IMAGEN.test(e))
    .filter((e) => !DOMINIOS_RUIDO.some((d) => e.endsWith(d)));

  const rechazados: string[] = [];
  const raiz = dominioSitio.replace(/^www\./, "");

  // Cuatro cajones por orden de preferencia. Un buzón preferido del propio
  // dominio es lo mejor; uno cualquiera de otro dominio, lo último.
  let preferidoPropio: string | null = null;
  let preferidoOtro: string | null = null;
  let otroPropio: string | null = null;
  let otroCualquiera: string | null = null;

  for (const email of encontrados) {
    const [local, dominio] = email.split("@");

    if (pareceDePersona(local)) {
      rechazados.push(email);               // Dato personal. Ver compliance.md.
      continue;
    }

    const propio = dominio.replace(/^www\./, "") === raiz;
    const preferido = BUZONES_PREFERIDOS.has(local);

    if (preferido && propio) preferidoPropio ??= email;
    else if (preferido) preferidoOtro ??= email;
    else if (propio) otroPropio ??= email;
    else otroCualquiera ??= email;
  }

  return {
    aceptado: preferidoPropio ?? otroPropio ?? preferidoOtro ?? otroCualquiera,
    rechazados,
  };
}

/**
 * "Parece de persona" si el primer trozo del buzón es un nombre de pila, o
 * si tiene forma de inicial+apellido (`j.garcia`, `mgarcia`).
 *
 * Un buzón largo con muchos trozos —`club.universitari.de.muntanya`— es el
 * nombre de la entidad, no de alguien.
 */
function pareceDePersona(local: string): boolean {
  const trozos = local.split(/[._-]/).filter(Boolean);
  if (trozos.length === 0) return false;

  if (NOMBRES_PILA.has(trozos[0])) return true;
  if (trozos.length === 2 && NOMBRES_PILA.has(trozos[1])) return true;
  if (/^[a-z]\.[a-z]{3,}$/.test(local)) return true;

  return false;
}

/**
 * Un dominio sin MX no puede recibir correo, así que ese lead no sirve para
 * lo que viene después. Si la resolución falla no bloqueamos: preferimos un
 * email sin verificar a perderlo por un problema de DNS nuestro.
 */
async function tieneMx(dominio: string): Promise<boolean> {
  try {
    const mx = await Deno.resolveDns(dominio, "MX");
    return Array.isArray(mx) && mx.length > 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // NotFound es una respuesta: el dominio no tiene MX.
    if (/NotFound|NXDOMAIN|no record/i.test(msg)) return false;
    return true;                            // Cualquier otro fallo: damos por bueno.
  }
}
