CREATE TABLE `beta_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`workspace_id` text,
	`event` text NOT NULL,
	`properties_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `beta_analytics_event_idx` ON `beta_analytics` (`event`);--> statement-breakpoint
CREATE INDEX `beta_analytics_created_idx` ON `beta_analytics` (`created_at`);--> statement-breakpoint
CREATE TABLE `beta_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`category` text NOT NULL,
	`query` text NOT NULL,
	`trace_id` text,
	`result_ids_json` text NOT NULL,
	`comment` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `beta_feedback_workspace_idx` ON `beta_feedback` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `beta_feedback_status_idx` ON `beta_feedback` (`status`);--> statement-breakpoint
CREATE TABLE `beta_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`status` text NOT NULL,
	`cohort` text NOT NULL,
	`expires_at` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_invitations_email_idx` ON `beta_invitations` (`email_hash`);--> statement-breakpoint
CREATE INDEX `beta_invitations_status_idx` ON `beta_invitations` (`status`);--> statement-breakpoint
CREATE TABLE `beta_users` (
	`actor_id` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`status` text NOT NULL,
	`role` text NOT NULL,
	`invited_at` text NOT NULL,
	`activated_at` text NOT NULL,
	`onboarding_completed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_users_email_idx` ON `beta_users` (`email_hash`);--> statement-breakpoint
CREATE INDEX `beta_users_status_idx` ON `beta_users` (`status`);--> statement-breakpoint
CREATE TABLE `operation_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`operation` text NOT NULL,
	`window_start` text NOT NULL,
	`request_count` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operation_rate_limits_actor_operation_window_idx` ON `operation_rate_limits` (`actor_id`,`operation`,`window_start`);