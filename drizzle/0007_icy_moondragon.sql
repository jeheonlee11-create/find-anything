CREATE TABLE `beta_access_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_actor_id` text NOT NULL,
	`target_actor_id` text,
	`invitation_id` text,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `beta_access_audit_created_idx` ON `beta_access_audit` (`created_at`);--> statement-breakpoint
ALTER TABLE `beta_feedback` ADD `search_mode` text;--> statement-breakpoint
ALTER TABLE `beta_feedback` ADD `receipt_id` text;--> statement-breakpoint
ALTER TABLE `beta_feedback` ADD `selected_result_id` text;--> statement-breakpoint
ALTER TABLE `beta_feedback` ADD `evidence_excerpt` text;--> statement-breakpoint
ALTER TABLE `beta_feedback` ADD `include_evidence_excerpt` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `beta_feedback` ADD `application_version` text DEFAULT 'unknown' NOT NULL;