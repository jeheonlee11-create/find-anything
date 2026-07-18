ALTER TABLE `retrieval_traces` ADD `ranking_snapshot_version` text;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `ranking_snapshot_json` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `ranking_snapshot_version` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `ranking_snapshot_json` text;