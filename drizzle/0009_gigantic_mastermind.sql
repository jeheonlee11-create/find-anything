CREATE TABLE `oauth_refresh_leases` (
	`connector_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
