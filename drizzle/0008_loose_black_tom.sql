CREATE TABLE `coverage_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`run_id` text,
	`job_id` text,
	`status` text NOT NULL,
	`inventory_complete` integer NOT NULL,
	`counts_json` text NOT NULL,
	`extraction_version` text NOT NULL,
	`indexing_version` text NOT NULL,
	`stale_recovery_json` text DEFAULT '{}' NOT NULL,
	`deployment_version` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coverage_receipts_workspace_idx` ON `coverage_receipts` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `coverage_receipts_job_idx` ON `coverage_receipts` (`job_id`);--> statement-breakpoint
CREATE TABLE `indexing_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`run_id` text,
	`job_id` text,
	`provider_file_id` text NOT NULL,
	`sanitized_file_name` text,
	`mime_type` text NOT NULL,
	`category` text NOT NULL,
	`retryable` integer NOT NULL,
	`user_explanation` text NOT NULL,
	`diagnostic_code` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexing_failures_file_category_idx` ON `indexing_failures` (`connector_id`,`provider_file_id`,`category`);--> statement-breakpoint
CREATE INDEX `indexing_failures_workspace_idx` ON `indexing_failures` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `indexing_job_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`heartbeat_at` text NOT NULL,
	`completed_at` text,
	`error_code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexing_job_attempts_job_attempt_idx` ON `indexing_job_attempts` (`job_id`,`attempt_number`);--> statement-breakpoint
CREATE TABLE `indexing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`job_type` text DEFAULT 'full_sync' NOT NULL,
	`status` text NOT NULL,
	`inventory_cursor` text,
	`continuation_token_hash` text NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`indexed_count` integer DEFAULT 0 NOT NULL,
	`unsupported_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`structural_count` integer DEFAULT 0 NOT NULL,
	`fallback_count` integer DEFAULT 0 NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`continuation_count` integer DEFAULT 0 NOT NULL,
	`terminal_reason` text,
	`last_error_code` text,
	`deployment_version` text DEFAULT 'unknown' NOT NULL,
	`started_at` text,
	`heartbeat_at` text,
	`completed_at` text,
	`next_attempt_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `indexing_jobs_workspace_idx` ON `indexing_jobs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `indexing_jobs_connector_status_idx` ON `indexing_jobs` (`connector_id`,`status`);--> statement-breakpoint
ALTER TABLE `source_files` ADD `searchable_status` text DEFAULT 'hidden' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_files` ADD `permission_fingerprint` text;--> statement-breakpoint
ALTER TABLE `source_files` ADD `provider_revision` text;--> statement-breakpoint
ALTER TABLE `source_files` ADD `extraction_version` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_files` ADD `indexing_version` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_files` ADD `tombstoned_at` text;--> statement-breakpoint
UPDATE `source_files`
SET `searchable_status` = 'searchable'
WHERE `index_status` = 'indexed' AND `trashed` = 0;--> statement-breakpoint
UPDATE `source_files`
SET `searchable_status` = 'unauthorized', `tombstoned_at` = `updated_at`
WHERE `trashed` = 1;
