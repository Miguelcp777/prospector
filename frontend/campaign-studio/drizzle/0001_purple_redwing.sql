CREATE TABLE `campaign_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`template_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_approvals_owner_template` ON `campaign_approvals` (`owner_id`,`template_id`);--> statement-breakpoint
CREATE TABLE `campaign_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`document_json` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preheader` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_checkpoints_owner_template` ON `campaign_checkpoints` (`owner_id`,`template_id`);--> statement-breakpoint
CREATE TABLE `campaign_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`template_id` text NOT NULL,
	`block_id` text,
	`author_name` text DEFAULT 'Colaborador' NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_comments_owner_template` ON `campaign_comments` (`owner_id`,`template_id`);--> statement-breakpoint
CREATE TABLE `reusable_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'Personalizado' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`blocks_json` text NOT NULL,
	`keep_styles` integer DEFAULT true NOT NULL,
	`synchronized` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reusable_modules_owner_updated` ON `reusable_modules` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `test_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`template_id` text,
	`recipients_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_test_deliveries_owner_created` ON `test_deliveries` (`owner_id`,`created_at`);