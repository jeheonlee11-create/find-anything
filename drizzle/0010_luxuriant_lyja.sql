ALTER TABLE `retrieval_traces` ADD `confidence_score` integer;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `confidence_label` text;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `confidence_json` text;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `confidence_scoring_version` text;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `confidence_calculated_at` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `confidence_score` integer;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `confidence_label` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `confidence_json` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `confidence_scoring_version` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `confidence_calculated_at` text;