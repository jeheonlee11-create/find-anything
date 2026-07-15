ALTER TABLE `retrieval_traces` ADD `stages_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `final_result_order_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `extraction_methods_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `fallback_errors_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `authorized_files_considered` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `source_files` ADD `last_permission_checked_at` text;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `files_added` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `files_updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `files_unchanged` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `files_removed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `pagination_complete` integer DEFAULT false NOT NULL;