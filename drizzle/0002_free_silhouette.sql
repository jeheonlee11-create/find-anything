CREATE TABLE `unit_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`file_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`vector_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_embeddings_unit_model_idx` ON `unit_embeddings` (`unit_id`,`model`);--> statement-breakpoint
CREATE INDEX `unit_embeddings_workspace_idx` ON `unit_embeddings` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `unit_embeddings_file_idx` ON `unit_embeddings` (`file_id`);