import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { aiUsageEvents, assets, generationRuns } from "@/db/schema";
import { requireRequestUser } from "@/lib/request-user";
import { estimateAiCost } from "@/lib/studio-finalization";
import {
  composeVisualGenerationPrompt,
  type ImagePlacement,
} from "@/lib/image-context";
import {
  getGeneratedImageDimensions,
  getImageFormat,
  getProviderImageSize,
  getProviderImageSizeForDimensions,
  normalizeCustomImageDimensions,
  type GeneratedImageFormat,
} from "@/lib/image-formats";

function fallbackImage(prompt: string) {
  const value = prompt.toLowerCase();
  if (/limpieza|industrial|mantenimiento/.test(value))
    return "/assets/industrial-cleaning-4k.webp";
  if (/fisio|salud|deporte|clínica/.test(value))
    return "/assets/sports-physio-4k.webp";
  return "/assets/ai-campaign-4k.webp";
}

export async function POST(request: Request) {
  const auth = requireRequestUser(request);
  if (!auth.user) return auth.response;
  const payload = (await request.json()) as {
    prompt?: string;
    altText?: string;
    style?: string;
    mood?: string;
    lighting?: string;
    composition?: string;
    palette?: string;
    people?: string;
    camera?: string;
    finish?: string;
    embeddedText?: "none" | "headline" | "custom";
    textContent?: string;
    resolution?: "draft" | "2k" | "4k";
    format?: GeneratedImageFormat;
    transparentBackground?: boolean;
    customWidth?: number;
    customHeight?: number;
    sizingMode?: "preset" | "hero" | "canvas" | "custom";
    placement?: ImagePlacement;
    brandContext?: string;
    screenContext?: string;
    automaticContext?: boolean;
  };
  const prompt = String(payload.prompt ?? "")
    .trim()
    .slice(0, 1800);
  if (prompt.length < 12) {
    return Response.json(
      { error: "Describe la imagen con algo más de detalle" },
      { status: 400 },
    );
  }
  const contextualPrompt = composeVisualGenerationPrompt(prompt, {
    placement: payload.placement || "custom-asset",
    brandContext: String(payload.brandContext ?? "").slice(0, 1600),
    screenContext: String(payload.screenContext ?? "").slice(0, 1800),
    automaticContext: payload.automaticContext !== false,
  });
  const runtime = env as unknown as {
    OPENAI_API_KEY?: string;
    BUCKET?: R2Bucket;
    IMAGES?: {
      input(stream: ReadableStream): {
        transform(options: Record<string, unknown>): {
          output(options: {
            format: string;
            quality: number;
          }): Promise<{ response(): Response }>;
        };
      };
    };
  };
  const resolution = payload.resolution || "4k";
  const format = getImageFormat(payload.format);
  const customDimensions =
    payload.sizingMode && payload.sizingMode !== "preset"
      ? normalizeCustomImageDimensions(
          payload.customWidth,
          payload.customHeight,
        )
      : null;
  const dimensions =
    customDimensions ?? getGeneratedImageDimensions(format.id, resolution);
  const providerSize = customDimensions
    ? getProviderImageSizeForDimensions(dimensions.width, dimensions.height)
    : getProviderImageSize(format.id);
  const formatPrompt = customDimensions
    ? `composición adaptada exactamente a una salida de ${dimensions.width} × ${dimensions.height} píxeles, proporción ${dimensions.width}:${dimensions.height}`
    : format.prompt;
  const quality = resolution === "draft" ? "medium" : "high";
  if (!runtime.OPENAI_API_KEY || !runtime.BUCKET) {
    return Response.json({
      url: fallbackImage(contextualPrompt),
      mode: "curated-4k-preview",
      contextApplied: true,
    });
  }
  const runId = crypto.randomUUID();
  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: `${contextualPrompt}. Formato final obligatorio: ${formatPrompt}. Estilo: ${payload.style || "editorial premium"}. Sensación: ${payload.mood || "impactante"}. Iluminación: ${payload.lighting || "cinematográfica"}. Composición: ${payload.composition || "espacio negativo para titular"}. Cámara y plano: ${payload.camera || "plano medio editorial"}. Acabado: ${payload.finish || "nítido y premium"}. Paleta: ${payload.palette || "coherente con marca"}. Personas: ${payload.people || "naturales si son necesarias"}. Imagen publicitaria para email marketing y comunicación digital. ${payload.transparentBackground ? "Fondo completamente transparente y recorte limpio, adecuado para superponer como elemento gráfico o logotipo." : ""} ${payload.embeddedText && payload.embeddedText !== "none" && String(payload.textContent || "").trim() ? `Integrar únicamente este texto exacto, perfectamente legible y sin añadir más palabras: "${String(payload.textContent).slice(0, 100)}".` : "Imagen limpia: absolutamente ninguna palabra, letra, cifra, rótulo, interfaz, marca de agua ni logotipo; reservar espacio negativo para superponer después texto HTML editable."}`,
          size: providerSize,
          quality,
          background: payload.transparentBackground ? "transparent" : "auto",
          output_format: payload.transparentBackground ? "png" : "webp",
          ...(payload.transparentBackground ? {} : { output_compression: 84 }),
          n: 1,
        }),
      },
    );
    if (!response.ok)
      throw new Error(`El proveedor de imagen respondió ${response.status}`);
    const result = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const base64 = result.data?.[0]?.b64_json;
    if (!base64) throw new Error("La imagen no llegó en la respuesta");
    const sourceBytes = Uint8Array.from(atob(base64), (char) =>
      char.charCodeAt(0),
    );
    let bytes = sourceBytes;
    const [providerWidth, providerHeight] = providerSize.split("x").map(Number);
    let storedWidth = providerWidth;
    let storedHeight = providerHeight;
    const outputFormat = payload.transparentBackground
      ? "image/png"
      : "image/webp";
    const extension = payload.transparentBackground ? "png" : "webp";
    if (
      runtime.IMAGES &&
      (dimensions.width !== providerWidth ||
        dimensions.height !== providerHeight)
    ) {
      const transformed = await runtime.IMAGES.input(
        new Blob([sourceBytes]).stream(),
      )
        .transform({
          width: dimensions.width,
          height: dimensions.height,
          fit: payload.transparentBackground ? "contain" : "cover",
          background: payload.transparentBackground
            ? "rgba(0,0,0,0)"
            : undefined,
        })
        .output({
          format: outputFormat,
          quality: payload.transparentBackground ? 100 : 90,
        });
      const transformedResponse = transformed.response();
      if (transformedResponse.ok) {
        bytes = new Uint8Array(await transformedResponse.arrayBuffer());
        storedWidth = dimensions.width;
        storedHeight = dimensions.height;
      }
    }
    const assetId = crypto.randomUUID();
    const objectKey = `generated/${auth.user.id}/${assetId}.${extension}`;
    await runtime.BUCKET.put(objectKey, bytes, {
      httpMetadata: { contentType: outputFormat },
    });
    const [asset] = await getDb()
      .insert(assets)
      .values({
        id: assetId,
        ownerId: auth.user.id,
        objectKey,
        filename: `aurevanta-${assetId}.${extension}`,
        contentType: outputFormat,
        sizeBytes: bytes.byteLength,
        width: storedWidth,
        height: storedHeight,
        source: "openai-gpt-image-2",
        prompt: contextualPrompt,
        altText: String(payload.altText ?? prompt).slice(0, 300),
        createdAt: new Date().toISOString(),
      })
      .returning();
    await getDb()
      .insert(generationRuns)
      .values({
        id: runId,
        ownerId: auth.user.id,
        kind: "image",
        provider: "openai",
        status: "completed",
        promptSummary: contextualPrompt.slice(0, 500),
        createdAt: new Date().toISOString(),
      });
    const cost = estimateAiCost({ resolution });
    await getDb()
      .insert(aiUsageEvents)
      .values({
        id: crypto.randomUUID(),
        ownerId: auth.user.id,
        kind: "image",
        model: "gpt-image-2",
        resolution,
        estimatedCostMicros: Math.round(cost.amount * 1_000_000),
        currency: cost.currency,
        createdAt: new Date().toISOString(),
      });
    return Response.json({
      url: `/api/assets/${asset.id}`,
      asset,
      mode: `ai-${resolution}`,
      format: format.id,
      ratio: `${storedWidth}:${storedHeight}`,
      width: storedWidth,
      height: storedHeight,
      contextApplied: true,
    });
  } catch (error) {
    try {
      await getDb()
        .insert(generationRuns)
        .values({
          id: runId,
          ownerId: auth.user.id,
          kind: "image",
          provider: "openai",
          status: "failed",
          promptSummary: contextualPrompt.slice(0, 500),
          errorCode: "image_generation_failed",
          createdAt: new Date().toISOString(),
        });
    } catch {}
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar la imagen",
      },
      { status: 502 },
    );
  }
}
