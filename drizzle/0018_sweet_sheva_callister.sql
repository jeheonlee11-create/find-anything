CREATE TABLE `indexing_continuations` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`status` text NOT NULL,
	`persisted_at` text NOT NULL,
	`dispatched_at` text,
	`acknowledged_at` text,
	`worker_started_at` text,
	`completed_at` text,
	`failed_at` text,
	`error_code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexing_continuations_job_sequence_idx` ON `indexing_continuations` (`job_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `indexing_continuations_status_idx` ON `indexing_continuations` (`status`);
