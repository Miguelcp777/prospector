CREATE TABLE `ab_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`template_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`metric` text DEFAULT 'clicks' NOT NULL,
	`variants_json` text NOT NULL,
	`allocation_json` text NOT NULL,
	`winner_rule_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ab_experiments_owner_created` ON `ab_experiments` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`resolution` text,
	`estimated_cost_micros` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_usage_owner_created` ON `ai_usage_events` (`owner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `campaign_shares` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `campaign_shares` ADD `revoked_at` text;