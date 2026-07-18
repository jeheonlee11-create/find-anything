CREATE TABLE `retrieval_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`conflict_type` text NOT NULL,
	`detection_version` text NOT NULL,
	`detection_method` text NOT NULL,
	`left_file_id` text NOT NULL,
	`right_file_id` text NOT NULL,
	`left_value_json` text NOT NULL,
	`right_value_json` text NOT NULL,
	`left_citation_json` text NOT NULL,
	`right_citation_json` text NOT NULL,
	`newer_file_id` text,
	`relationship_inference` text NOT NULL,
	`reasons_json` text NOT NULL,
	`status` text NOT NULL,
	`decision_json` text,
	`detected_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retrieval_conflicts_fingerprint_idx` ON `retrieval_conflicts` (`workspace_id`,`left_file_id`,`right_file_id`,`conflict_type`,`left_value_json`,`right_value_json`);--> statement-breakpoint
CREATE INDEX `retrieval_conflicts_workspace_idx` ON `retrieval_conflicts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `retrieval_conflicts_status_idx` ON `retrieval_conflicts` (`status`);--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `conflict_snapshot_version` text;--> statement-breakpoint
ALTER TABLE `retrieval_traces` ADD `conflict_snapshot_json` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `conflict_snapshot_version` text;--> statement-breakpoint
ALTER TABLE `search_receipts` ADD `conflict_snapshot_json` text;