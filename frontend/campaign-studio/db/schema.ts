import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const templates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("custom"),
    status: text("status").notNull().default("draft"),
    subject: text("subject").notNull().default(""),
    preheader: text("preheader").notNull().default(""),
    documentJson: text("document_json").notNull(),
    htmlCache: text("html_cache").notNull().default(""),
    textCache: text("text_cache").notNull().default(""),
    thumbnailUrl: text("thumbnail_url"),
    sourceType: text("source_type").notNull().default("studio"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_templates_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_templates_owner_status").on(table.ownerId, table.status),
  ],
);

export const templateVersions = sqliteTable(
  "template_versions",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    version: integer("version").notNull(),
    subject: text("subject").notNull().default(""),
    preheader: text("preheader").notNull().default(""),
    documentJson: text("document_json").notNull(),
    htmlCache: text("html_cache").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_template_versions_template_version").on(
      table.templateId,
      table.version,
    ),
    index("idx_template_versions_owner_template").on(
      table.ownerId,
      table.templateId,
    ),
  ],
);

export const brandKits = sqliteTable(
  "brand_kits",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull().default("Mi marca"),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").notNull().default("#11d7e8"),
    accentColor: text("accent_color").notNull().default("#8b5cf6"),
    backgroundColor: text("background_color").notNull().default("#071019"),
    fontFamily: text("font_family").notNull().default("Arial, sans-serif"),
    senderName: text("sender_name").notNull().default(""),
    senderEmail: text("sender_email").notNull().default(""),
    postalAddress: text("postal_address").notNull().default(""),
    settingsJson: text("settings_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("uq_brand_kits_owner").on(table.ownerId)],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    source: text("source").notNull().default("upload"),
    prompt: text("prompt"),
    altText: text("alt_text").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_assets_object_key").on(table.objectKey),
    index("idx_assets_owner_created").on(table.ownerId, table.createdAt),
  ],
);

export const generationRuns = sqliteTable(
  "generation_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    templateId: text("template_id"),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    promptSummary: text("prompt_summary").notNull().default(""),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_generation_runs_owner_created").on(table.ownerId, table.createdAt)],
);

export const reusableModules = sqliteTable(
  "reusable_modules",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("Personalizado"),
    tagsJson: text("tags_json").notNull().default("[]"),
    blocksJson: text("blocks_json").notNull(),
    keepStyles: integer("keep_styles", { mode: "boolean" }).notNull().default(true),
    synchronized: integer("synchronized", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_reusable_modules_owner_updated").on(table.ownerId, table.updatedAt)],
);

export const campaignCheckpoints = sqliteTable(
  "campaign_checkpoints",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    templateId: text("template_id").notNull(),
    name: text("name").notNull(),
    documentJson: text("document_json").notNull(),
    subject: text("subject").notNull().default(""),
    preheader: text("preheader").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_campaign_checkpoints_owner_template").on(table.ownerId, table.templateId)],
);

export const campaignComments = sqliteTable(
  "campaign_comments",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    templateId: text("template_id").notNull(),
    blockId: text("block_id"),
    authorName: text("author_name").notNull().default("Colaborador"),
    body: text("body").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_campaign_comments_owner_template").on(table.ownerId, table.templateId)],
);

export const campaignApprovals = sqliteTable(
  "campaign_approvals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    templateId: text("template_id").notNull(),
    status: text("status").notNull().default("pending"),
    reviewerName: text("reviewer_name").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_campaign_approvals_owner_template").on(table.ownerId, table.templateId)],
);

export const testDeliveries = sqliteTable(
  "test_deliveries",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    templateId: text("template_id"),
    recipientsJson: text("recipients_json").notNull().default("[]"),
    status: text("status").notNull().default("prepared"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_test_deliveries_owner_created").on(table.ownerId, table.createdAt)],
);

export const campaignShares = sqliteTable(
  "campaign_shares",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    templateId: text("template_id").notNull(),
    token: text("token").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("uq_campaign_shares_token").on(table.token), index("idx_campaign_shares_owner_template").on(table.ownerId, table.templateId)],
);

export const abExperiments = sqliteTable(
  "ab_experiments",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    templateId: text("template_id"),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    metric: text("metric").notNull().default("clicks"),
    variantsJson: text("variants_json").notNull(),
    allocationJson: text("allocation_json").notNull(),
    winnerRuleJson: text("winner_rule_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_ab_experiments_owner_created").on(table.ownerId, table.createdAt)],
);

export const aiUsageEvents = sqliteTable(
  "ai_usage_events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    model: text("model").notNull().default(""),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    resolution: text("resolution"),
    estimatedCostMicros: integer("estimated_cost_micros").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_ai_usage_owner_created").on(table.ownerId, table.createdAt)],
);
