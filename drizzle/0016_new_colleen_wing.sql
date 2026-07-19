CREATE TABLE `beta_access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`email_ciphertext` text NOT NULL,
	`full_name` text NOT NULL,
	`company` text NOT NULL,
	`job_title` text NOT NULL,
	`company_size` text NOT NULL,
	`knowledge_tools_json` text NOT NULL,
	`uses_ai_agents` integer NOT NULL,
	`knowledge_problem` text NOT NULL,
	`willing_limited_folder` integer NOT NULL,
	`intent` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_access_requests_email_idx` ON `beta_access_requests` (`email_hash`);--> statement-breakpoint
CREATE INDEX `beta_access_requests_status_idx` ON `beta_access_requests` (`status`);--> statement-breakpoint
CREATE INDEX `beta_access_requests_created_idx` ON `beta_access_requests` (`created_at`);