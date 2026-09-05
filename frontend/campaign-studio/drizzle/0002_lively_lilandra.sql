CREATE TABLE `campaign_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`template_id` text NOT NULL,
	`token` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_shares_token` ON `campaign_shares` (`token`);--> statement-breakpoint
CREATE INDEX `idx_campaign_shares_owner_template` ON `campaign_shares` (`owner_id`,`template_id`);