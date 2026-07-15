ALTER TABLE `retrieval_traces` ADD `correlation_id` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `index_snapshot_hash` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `result_set_hash` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `correlation_id` text;--> statement-breakpoint
ALTER TABLE `source_files` ADD `extraction_mode` text;--> statement-breakpoint
ALTER TABLE `source_files` ADD `structural_fallback_reason` text;--> statement-breakpoint
CREATE INDEX `source_files_workspace_status_idx` ON `source_files` (`workspace_id`,`index_status`);--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `structured_files` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `fallback_files` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `fallback_reasons_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX `extracted_units_workspace_file_idx` ON `extracted_units` (`workspace_id`,`file_id`);