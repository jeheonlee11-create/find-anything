CREATE TABLE `retrieval_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`search_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`query` text NOT NULL,
	`normalized_query` text NOT NULL,
	`mode` text NOT NULL,
	`filters_json` text NOT NULL,
	`matching_policy_version` text NOT NULL,
	`candidate_counts_json` text NOT NULL,
	`duplicates_removed` integer NOT NULL,
	`permission_decisions_json` text NOT NULL,
	`threshold_decisions_json` text NOT NULL,
	`excluded_results_json` text NOT NULL,
	`final_result_count` integer NOT NULL,
	`latency_json` text NOT NULL,
	`coverage_json` text NOT NULL,
	`results_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retrieval_traces_search_idx` ON `retrieval_traces` (`search_id`);--> statement-breakpoint
CREATE INDEX `retrieval_traces_workspace_idx` ON `retrieval_traces` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `search_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`search_id` text NOT NULL,
	`trace_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`query` text NOT NULL,
	`mode` text NOT NULL,
	`filters_json` text NOT NULL,
	`matching_policy_version` text NOT NULL,
	`searched_at` text NOT NULL,
	`total_indexed_files` integer NOT NULL,
	`total_eligible_files` integer NOT NULL,
	`total_files_searched` integer NOT NULL,
	`total_matches` integer NOT NULL,
	`total_returned` integer NOT NULL,
	`pending_files` integer NOT NULL,
	`failed_files` integer NOT NULL,
	`excluded_files` integer NOT NULL,
	`completeness_status` text NOT NULL,
	`incomplete_reasons_json` text NOT NULL,
	`result_file_ids_json` text NOT NULL,
	`citations_json` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`configuration_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_receipts_search_idx` ON `search_receipts` (`search_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_receipts_trace_idx` ON `search_receipts` (`trace_id`);--> statement-breakpoint
CREATE INDEX `search_receipts_workspace_idx` ON `search_receipts` (`workspace_id`);