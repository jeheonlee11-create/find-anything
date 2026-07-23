ALTER TABLE `indexing_jobs` ADD `stage` text DEFAULT 'connecting' NOT NULL;
--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `discovery_status` text DEFAULT 'not_started' NOT NULL;
--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `skipped_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `inaccessible_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `indexing_jobs_connector_active_idx`
ON `indexing_jobs` (`connector_id`)
WHERE `status` IN ('queued', 'running', 'pausing', 'stale');
