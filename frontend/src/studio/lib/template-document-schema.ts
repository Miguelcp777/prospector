import { z } from "zod";
import type { TemplateDocument } from "./template-types";

export const TEMPLATE_DOCUMENT_SCHEMA_VERSION = 1 as const;

const scalar = z.union([
  z.string().max(200_000),
  z.number().finite(),
  z.boolean(),
]);

const variableSchema = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
  type: z.enum(["text", "url", "date", "number"]),
  required: z.boolean(),
  fallback: z.string().max(10_000),
  source: z.enum(["lead", "campaign", "sender", "system", "custom"]),
}).strict();

const blockSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.enum([
    "brand", "hero", "heading", "artText", "text", "button", "image",
    "columns", "divider", "spacer", "footer",
  ]),
  props: z.record(z.string(), scalar),
  moduleRef: z.object({
    id: z.string().min(1).max(160),
    revision: z.number().int().min(1),
    index: z.number().int().min(0),
  }).strict().optional(),
  condition: z.object({
    field: z.string().min(1).max(160),
    operator: z.enum(["equals", "not_equals", "contains", "exists"]),
    value: z.string().max(10_000).optional(),
  }).strict().optional(),
  mobile: z.object({
    hidden: z.boolean().optional(),
    order: z.number().int().min(0).max(500).optional(),
    widthPercent: z.number().min(1).max(100).optional(),
    fontScale: z.number().min(25).max(300).optional(),
    imageUrl: z.string().max(20_000).optional(),
  }).strict().optional(),
}).strict();

export const templateDocumentV1Schema = z.object({
  schemaVersion: z.literal(TEMPLATE_DOCUMENT_SCHEMA_VERSION),
  settings: z.object({
    width: z.number().int().min(280).max(1_600),
    backgroundColor: z.string().max(80),
    backgroundMode: z.enum(["color", "image", "transparent"]).optional(),
    backgroundImageUrl: z.string().max(20_000).optional(),
    backgroundImageOpacity: z.number().min(0).max(100).optional(),
    backgroundImagePosition: z.enum([
      "left top", "center top", "right top", "left center", "center center",
      "right center", "left bottom", "center bottom", "right bottom",
    ]).optional(),
    backgroundImageSize: z.enum(["cover", "contain", "auto"]).optional(),
    backgroundImageRepeat: z.enum(["no-repeat", "repeat"]).optional(),
    contentColor: z.string().max(80),
    textColor: z.string().max(80),
    mutedColor: z.string().max(80),
    primaryColor: z.string().max(80),
    accentColor: z.string().max(80),
    fontFamily: z.string().max(500),
    cornerRadius: z.number().min(0).max(300),
  }).strict(),
  creative: z.object({
    stylePreset: z.string().min(1).max(120),
    intensity: z.number().min(0).max(100),
    contentDensity: z.enum(["minimal", "balanced", "editorial"]),
    colorMode: z.enum(["light", "dark", "adaptive"]),
    compatibilityMode: z.enum(["compatible", "hybrid", "experimental"]),
    typographyStyle: z.string().min(1).max(120),
    imageStyle: z.string().min(1).max(120),
  }).strict().optional(),
  compliance: z.object({
    schemaVersion: z.literal(1),
    builderStatus: z.enum(["ready", "incomplete"]),
    prospectorValidationRequired: z.literal(true),
    requiredRuntimeVariables: z.array(z.string().min(1).max(160)).max(100),
    senderIdentityConfigured: z.boolean(),
    privacyConfigured: z.boolean(),
  }).strict().optional(),
  variables: z.array(variableSchema).max(200),
  blocks: z.array(blockSchema).min(1).max(500),
  rawHtml: z.string().max(2_000_000).optional(),
}).strict();

export type TemplateDocumentValidation =
  | { success: true; document: TemplateDocument }
  | { success: false; issues: string[] };

export function validateTemplateDocument(value: unknown): TemplateDocumentValidation {
  const result = templateDocumentV1Schema.safeParse(value);
  if (result.success) {
    return { success: true, document: result.data as TemplateDocument };
  }
  return {
    success: false,
    issues: result.error.issues.slice(0, 20).map((issue) =>
      `${issue.path.join(".") || "document"}: ${issue.message}`,
    ),
  };
}

export function requireTemplateDocument(value: unknown): TemplateDocument {
  const result = validateTemplateDocument(value);
  if (!result.success) {
    throw new Error(`TemplateDocument v1 no válido: ${result.issues.join("; ")}`);
  }
  return result.document;
}
