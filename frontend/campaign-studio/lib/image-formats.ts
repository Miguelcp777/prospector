export type GeneratedImageFormat =
  "horizontal" | "panoramic" | "square" | "vertical" | "portrait" | "story";
export type GeneratedImageResolution = "draft" | "2k" | "4k";

export const IMAGE_FORMATS: Array<{
  id: GeneratedImageFormat;
  label: string;
  ratioLabel: string;
  ratio: string;
  prompt: string;
}> = [
  {
    id: "horizontal",
    label: "Horizontal",
    ratioLabel: "16:9",
    ratio: "16 / 9",
    prompt: "composición horizontal 16:9, amplia y equilibrada",
  },
  {
    id: "panoramic",
    label: "Panorámica",
    ratioLabel: "12:5",
    ratio: "12 / 5",
    prompt:
      "composición panorámica ultrawide 12:5, narrativa y con profundidad lateral",
  },
  {
    id: "square",
    label: "Cuadrada",
    ratioLabel: "1:1",
    ratio: "1 / 1",
    prompt: "composición cuadrada 1:1, contundente y centrada",
  },
  {
    id: "vertical",
    label: "Vertical",
    ratioLabel: "4:5",
    ratio: "4 / 5",
    prompt:
      "composición vertical 4:5, jerarquía ascendente y sujeto protagonista",
  },
  {
    id: "portrait",
    label: "Retrato",
    ratioLabel: "2:3",
    ratio: "2 / 3",
    prompt: "composición de retrato 2:3, editorial y con profundidad vertical",
  },
  {
    id: "story",
    label: "Story",
    ratioLabel: "9:16",
    ratio: "9 / 16",
    prompt:
      "composición vertical 9:16 para story, lectura de arriba abajo y zonas seguras",
  },
];

const OUTPUT_DIMENSIONS: Record<
  GeneratedImageFormat,
  Record<GeneratedImageResolution, { width: number; height: number }>
> = {
  horizontal: {
    draft: { width: 1536, height: 864 },
    "2k": { width: 2560, height: 1440 },
    "4k": { width: 3840, height: 2160 },
  },
  panoramic: {
    draft: { width: 1536, height: 640 },
    "2k": { width: 2560, height: 1080 },
    "4k": { width: 3840, height: 1600 },
  },
  square: {
    draft: { width: 1024, height: 1024 },
    "2k": { width: 2048, height: 2048 },
    "4k": { width: 3840, height: 3840 },
  },
  vertical: {
    draft: { width: 1024, height: 1280 },
    "2k": { width: 1600, height: 2000 },
    "4k": { width: 3072, height: 3840 },
  },
  portrait: {
    draft: { width: 1024, height: 1536 },
    "2k": { width: 1440, height: 2160 },
    "4k": { width: 2560, height: 3840 },
  },
  story: {
    draft: { width: 864, height: 1536 },
    "2k": { width: 1440, height: 2560 },
    "4k": { width: 2160, height: 3840 },
  },
};

export function getImageFormat(value: unknown) {
  return IMAGE_FORMATS.find((item) => item.id === value) ?? IMAGE_FORMATS[0];
}

export function getGeneratedImageDimensions(
  format: GeneratedImageFormat,
  resolution: GeneratedImageResolution,
) {
  return OUTPUT_DIMENSIONS[format][resolution];
}

export function normalizeCustomImageDimensions(
  width: unknown,
  height: unknown,
) {
  const normalize = (value: unknown, fallback: number) => {
    const numeric = Math.round(Number(value));
    const clamped = Number.isFinite(numeric)
      ? Math.min(4096, Math.max(320, numeric))
      : fallback;
    return clamped % 2 === 0 ? clamped : clamped - 1;
  };
  return { width: normalize(width, 1600), height: normalize(height, 900) };
}

export function fitImageDimensions(
  width: number,
  height: number,
  resolution: GeneratedImageResolution,
) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const longEdge =
    resolution === "4k" ? 3840 : resolution === "2k" ? 2560 : 1536;
  const scale = longEdge / Math.max(safeWidth, safeHeight);
  return normalizeCustomImageDimensions(safeWidth * scale, safeHeight * scale);
}

export function getProviderImageSizeForDimensions(
  width: number,
  height: number,
) {
  const ratio = width / Math.max(1, height);
  if (ratio >= 0.9 && ratio <= 1.1) return "1024x1024" as const;
  return height > width ? ("1024x1536" as const) : ("1536x1024" as const);
}

export function getProviderImageSize(format: GeneratedImageFormat) {
  if (format === "square") return "1024x1024" as const;
  if (["vertical", "portrait", "story"].includes(format))
    return "1024x1536" as const;
  return "1536x1024" as const;
}
