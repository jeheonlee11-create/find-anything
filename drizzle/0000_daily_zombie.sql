CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text,
	`status` text NOT NULL,
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text,
	`token_expires_at` text,
	`granted_scopes` text NOT NULL,
	`last_sync_at` text,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connectors_workspace_provider_idx` ON `connectors` (`workspace_id`,`provider`);--> statement-breakpoint
CREATE TABLE `extracted_units` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`file_id` text NOT NULL,
	`file_version_id` text NOT NULL,
	`unit_type` text NOT NULL,
	`structural_location_json` text NOT NULL,
	`text_content` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `extracted_units_file_idx` ON `extracted_units` (`file_id`);--> statement-breakpoint
CREATE INDEX `extracted_units_workspace_idx` ON `extracted_units` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `file_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`source_modified_at` text NOT NULL,
	`content_hash` text NOT NULL,
	`extraction_status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_versions_file_hash_idx` ON `file_versions` (`file_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_workspace_user_idx` ON `memberships` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`pkce_verifier_ciphertext` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_states_expiry_idx` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `source_files` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`owners_json` text NOT NULL,
	`permissions_json` text NOT NULL,
	`parents_json` text NOT NULL,
	`modified_at` text NOT NULL,
	`web_view_link` text,
	`md5_checksum` text,
	`size_bytes` integer,
	`trashed` integer NOT NULL,
	`index_status` text NOT NULL,
	`extraction_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_files_connector_source_idx` ON `source_files` (`connector_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `source_files_workspace_idx` ON `source_files` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`status` text NOT NULL,
	`files_discovered` integer NOT NULL,
	`files_indexed` integer NOT NULL,
	`files_failed` integer NOT NULL,
	`next_page_token` text,
	`error_code` text,
	`started_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_connector_idx` ON `sync_runs` (`connector_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workspaces_owner_idx` ON `workspaces` (`owner_user_id`);