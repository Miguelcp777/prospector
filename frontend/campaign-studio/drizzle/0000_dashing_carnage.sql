CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`source` text DEFAULT 'upload' NOT NULL,
	`prompt` text,
	`alt_text` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assets_object_key` ON `assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_assets_owner_created` ON `assets` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brand_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text DEFAULT 'Mi marca' NOT NULL,
	`logo_url` text,
	`primary_color` text DEFAULT '#11d7e8' NOT NULL,
	`accent_color` text DEFAULT '#8b5cf6' NOT NULL,
	`background_color` text DEFAULT '#071019' NOT NULL,
	`font_family` text DEFAULT 'Arial, sans-serif' NOT NULL,
	`sender_name` text DEFAULT '' NOT NULL,
	`sender_email` text DEFAULT '' NOT NULL,
	`postal_address` text DEFAULT '' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_brand_kits_owner` ON `brand_kits` (`owner_id`);--> statement-breakpoint
CREATE TABLE `generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`template_id` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`prompt_summary` text DEFAULT '' NOT NULL,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_generation_runs_owner_created` ON `generation_runs` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`version` integer NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preheader` text DEFAULT '' NOT NULL,
	`document_json` text NOT NULL,
	`html_cache` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_template_versions_template_version` ON `template_versions` (`template_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_template_versions_owner_template` ON `template_versions` (`owner_id`,`template_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'custom' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preheader` text DEFAULT '' NOT NULL,
	`document_json` text NOT NULL,
	`html_cache` text DEFAULT '' NOT NULL,
	`text_cache` text DEFAULT '' NOT NULL,
	`thumbnail_url` text,
	`source_type` text DEFAULT 'studio' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_templates_owner_updated` ON `templates` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_templates_owner_status` ON `templates` (`owner_id`,`status`);