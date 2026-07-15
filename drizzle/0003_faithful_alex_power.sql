CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_idx` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_workspace_idx` ON `api_keys` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `api_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`window_start` text NOT NULL,
	`request_count` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_rate_limits_key_window_idx` ON `api_rate_limits` (`api_key_id`,`window_start`);--> statement-breakpoint
CREATE TABLE `file_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`from_file_id` text NOT NULL,
	`to_file_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`confidence` integer NOT NULL,
	`reasons_json` text NOT NULL,
	`inferred` integer NOT NULL,
	`user_status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_relationships_pair_type_idx` ON `file_relationships` (`workspace_id`,`from_file_id`,`to_file_id`,`relationship_type`);--> statement-breakpoint
CREATE INDEX `file_relationships_workspace_idx` ON `file_relationships` (`workspace_id`);