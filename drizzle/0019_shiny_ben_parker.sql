ALTER TABLE `indexing_continuations` ADD `processed_count_at_completion` integer;--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `metadata_indexed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `content_indexed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `unchanged_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `duplicate_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexing_jobs` ADD `retried_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `source_files` ADD `retry_count` integer DEFAULT 0 NOT NULL;