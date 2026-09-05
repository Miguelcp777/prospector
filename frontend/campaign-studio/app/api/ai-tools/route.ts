import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { aiUsageEvents, generationRuns } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import { estimateAiCost } from "@/lib/studio-finalization";

type Action = "subjects" | "ab-variants" | "creative-director" | "translate" | "repurpose" | "brand-from-url" | "content-from-url" | "gallery-search";

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)/.test(host)) return null;
    if (url.port && url.port !== "443") return null;
    return url;
  } catch { return null; }
}

async function pageContext(input: string) {
  const url = safeWebUrl(input);
  if (!url) throw new Error("Introduce una URL HTTPS pública y válida");
  const response = await fetch(url, { headers: { "user-agent": "AurevantaCampaignStudio/1.0" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`La página respondió ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html") && !type.includes("text/plain")) throw new Error("La URL no contiene una página compatible");
  const html = (await response.text()).slice(0, 250_000);
  const attr = (pattern: RegExp) => html.match(pattern)?.[1]?.trim() || "";
  const absolute = (value: string) => { try { return new URL(value, url).toString(); } catch { return ""; } };
  const candidates = [...html.matchAll(/<link\b[^>]*rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi), ...html.matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi)].map((match) => absolute(match[1])).filter(Boolean).slice(0, 8);
  const socialLinks = [...html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:linkedin\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|youtube\.com)[^"']*)["']/gi)].map((match) => match[1]).slice(0, 12);
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&quot;|&#39;/g, " ").replace(/\s+/g, " ").slice(0, 14_000);
  return { sourceUrl: url.toString(), title: attr(/<title[^>]*>([^<]+)<\/title>/i), description: attr(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/i), themeColor: attr(/<meta\b[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i), logoCandidates: candidates, socialLinks: [...new Set(socialLinks)], text };
}

function fallback(action: Action, payload: Record<string, unknown>) {
  if (action === "subjects") {
    const company = String(payload.company || "tu empresa");
    return { subjects: [`Una idea concreta para ${company}`, `Una oportunidad que merece 2 minutos`, `¿Exploramos una vía de crecimiento?`, `Una propuesta preparada para vuestro equipo`, `El siguiente paso para ${company}`].map((subject, index) => ({ subject, preheader: `Propuesta ${index + 1}: clara, relevante y preparada para revisar.`, score: 91 - index * 3, risk: "bajo" })) };
  }
  if (action === "ab-variants") return { variants: [
    { name: "A · Autoridad premium", direction: "premium", subject: String(payload.subject || "Una propuesta preparada para tu empresa"), preheader: String(payload.preheader || "Una oportunidad concreta, clara y relevante."), rationale: "Refuerza percepción de valor." },
    { name: "B · Impacto visual", direction: "visual", subject: "Una idea que merece ser vista", preheader: "Descubre una propuesta visual creada alrededor de vuestro contexto.", rationale: "Prioriza atención y reconocimiento." },
    { name: "C · Claridad directa", direction: "minimal", subject: "Una propuesta concreta para vuestro equipo", preheader: "La idea, el valor y el siguiente paso sin rodeos.", rationale: "Reduce fricción y carga cognitiva." },
  ] };
  if (action === "repurpose") return { channels: { linkedin: "Una idea clara puede cambiar el siguiente paso de una empresa. Descubre la propuesta completa.", instagram: "Una propuesta. Una oportunidad. Un siguiente paso. ✦", banner: "Convierte oportunidades en conversaciones", landing: "Descubre una propuesta creada alrededor de tus objetivos." } };
  if (action === "brand-from-url") return { brand: { name: "Marca detectada", primaryColor: "#0b7285", accentColor: "#7c3aed", backgroundColor: "#071019", fontFamily: "Arial, Helvetica, sans-serif", description: "Propuesta de marca preparada para revisión.", services: ["Servicio principal"], tone: "profesional y cercano", socialLinks: [], legal: "Revisar datos legales antes del envío" } };
  if (action === "content-from-url") return { content: { title: "Propuesta extraída de la página", body: "Contenido sintetizado y preparado para editar.", offer: "Descubre la propuesta completa", cta: "Saber más" } };
  if (action === "translate") return { document: payload.document, subject: payload.subject, preheader: payload.preheader, language: payload.language, mode: "fallback" };
  if (action === "gallery-search") return { rankedIds: Array.isArray(payload.assets) ? (payload.assets as Array<{ id?: string }>).map((asset) => asset.id).filter(Boolean) : [] };
  return { patches: [], message: "Describe qué bloque quieres transformar y volveré a intentarlo." };
}

function instruction(action: Action) {
  const common = "Responde únicamente JSON válido, sin markdown. No inventes clientes, cifras, premios, testimonios ni certificaciones. Conserva literalmente las variables con formato {{campo.ruta}}.";
  const map: Record<Action, string> = {
    subjects: `${common} Devuelve {\"subjects\":[{\"subject\":string,\"preheader\":string,\"score\":number,\"risk\":\"bajo\"|\"medio\"|\"alto\"}]} con 6 alternativas en español de España, distintas entre sí y concisas.`,
    "ab-variants": `${common} Devuelve {\"variants\":[{\"name\":string,\"direction\":\"premium\"|\"visual\"|\"minimal\"|\"comercial\"|\"corporativa\"|\"temporada\",\"subject\":string,\"preheader\":string,\"rationale\":string}]} con exactamente tres conceptos A/B/C claramente diferentes para la campaña.`,
    "creative-director": `${common} Actúa como director creativo. Devuelve {\"patches\":[{\"blockId\":string,\"prop\":string,\"value\":string|number|boolean}],\"message\":string}. Modifica solo propiedades existentes del bloque indicado y aplica exactamente la petición.`,
    translate: `${common} Traduce con adaptación cultural al idioma pedido. Devuelve {\"document\":object,\"subject\":string,\"preheader\":string,\"language\":string}. Mantén ids, tipos, URLs, colores y estructura; traduce solo texto humano.`,
    repurpose: `${common} Devuelve {\"channels\":{\"linkedin\":string,\"instagram\":string,\"banner\":string,\"landing\":string}}. Cada valor debe incluir versión final, CTA, recomendación visual y formato o dimensiones; adapta tono y longitud al canal sin inventar hechos.`,
    "brand-from-url": `${common} Analiza solo la información aportada. Devuelve {\"brand\":{\"name\":string,\"logoUrl\":string,\"primaryColor\":string,\"accentColor\":string,\"backgroundColor\":string,\"fontFamily\":string,\"description\":string,\"services\":string[],\"tone\":string,\"socialLinks\":string[],\"legal\":string}}. Selecciona logoUrl únicamente de logoCandidates. Usa colores hex válidos y marca como pendiente lo no verificable.`,
    "content-from-url": `${common} Devuelve {\"content\":{\"title\":string,\"body\":string,\"offer\":string,\"cta\":string}} con una síntesis fiel y comercial, sin añadir hechos.`,
    "gallery-search": `${common} Recibe una consulta y metadatos de imágenes. Devuelve {\"rankedIds\":string[]} ordenando por afinidad semántica, sector, estilo, color, orientación y uso solicitado; incluye solo IDs recibidos.`
  };
  return map[action];
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const payload = await request.json() as Record<string, unknown>;
  const action = payload.action as Action;
  if (!["subjects", "ab-variants", "creative-director", "translate", "repurpose", "brand-from-url", "content-from-url", "gallery-search"].includes(action)) return Response.json({ error: "Acción de IA no válida" }, { status: 400 });
  const runtime = env as unknown as { OPENAI_API_KEY?: string };
  const runId = crypto.randomUUID();
  try {
    let enriched = payload;
    if ((action === "brand-from-url" || action === "content-from-url") && typeof payload.url === "string") enriched = { ...payload, pageContext: await pageContext(payload.url) };
    let result = fallback(action, enriched);
    let provider = "guided-engine";
    if (runtime.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${runtime.OPENAI_API_KEY}` }, body: JSON.stringify({ model: "gpt-5-mini", input: [{ role: "system", content: instruction(action) }, { role: "user", content: JSON.stringify(enriched).slice(0, 60_000) }] }) });
      if (!response.ok) throw new Error(`La IA respondió ${response.status}`);
      const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const raw = data.output_text ?? data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
      if (raw) result = JSON.parse(raw);
      provider = "openai";
      const usage = data.usage || {};
      const cost = estimateAiCost({ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens });
      await getDb().insert(aiUsageEvents).values({ id: crypto.randomUUID(), ownerId: auth.user.id, kind: action, model: "gpt-5-mini", inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0, estimatedCostMicros: Math.round(cost.amount * 1_000_000), currency: cost.currency, createdAt: new Date().toISOString() });
    }
    await getDb().insert(generationRuns).values({ id: runId, ownerId: auth.user.id, kind: action, provider, status: "completed", promptSummary: JSON.stringify(payload).slice(0, 500), createdAt: new Date().toISOString() });
    return Response.json({ ...result, mode: provider });
  } catch (error) {
    try { await getDb().insert(generationRuns).values({ id: runId, ownerId: auth.user.id, kind: action, provider: runtime.OPENAI_API_KEY ? "openai" : "guided-engine", status: "failed", promptSummary: JSON.stringify(payload).slice(0, 500), errorCode: "ai_tool_failed", createdAt: new Date().toISOString() }); } catch {}
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo completar la acción" }, { status: 502 });
  }
}
