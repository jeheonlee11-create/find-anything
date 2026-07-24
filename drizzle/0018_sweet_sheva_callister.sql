CREATE TABLE `indexing_continuations` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`attempt_epoch` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`persisted_at` text NOT NULL,
	`available_at` text NOT NULL,
	`dispatched_at` text,
	`last_dispatched_at` text,
	`dispatch_count` integer DEFAULT 0 NOT NULL,
	`dispatch_lease_owner` text,
	`dispatch_lease_expires_at` text,
	`acknowledged_at` text,
	`worker_started_at` text,
	`execution_lease_owner` text,
	`execution_lease_expires_at` text,
	`completed_at` text,
	`failed_at` text,
	`error_code` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexing_continuations_job_sequence_idx` ON `indexing_continuations` (`job_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `indexing_continuations_status_available_idx` ON `indexing_continuations` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `indexing_continuations_dispatch_lease_idx` ON `indexing_continuations` (`dispatch_lease_expires_at`);--> statement-breakpoint
CREATE INDEX `indexing_continuations_execution_lease_idx` ON `indexing_continuations` (`execution_lease_expires_at`);
