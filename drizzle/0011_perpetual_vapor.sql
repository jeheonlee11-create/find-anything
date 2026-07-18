ALTER TABLE `retrieval_traces` ADD `coverage_snapshot_version` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `coverage_snapshot_version` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `coverage_snapshot_json` text;