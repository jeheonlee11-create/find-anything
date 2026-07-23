type IndexingEvent =
  | "oauth_authorization_succeeded"
  | "oauth_authorization_failed"
  | "connector_initialized"
  | "discovery_started"
  | "discovery_progress"
  | "discovery_completed"
  | "recovery_requested"
  | "attempt_created"
  | "continuation_scheduled"
  | "worker_started"
  | "scheduling_failure"
  | "heartbeat_updated"
  | "stale_job_recovered"
  | "job_completed"
  | "job_failed";

type SafeFields = {
  workspaceId?: string;
  connectorId?: string;
  jobId?: string;
  attemptNumber?: number;
  discoveredCount?: number;
  processedCount?: number;
  indexedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  errorCode?: string;
  stage?: string;
};

export function logIndexingEvent(event: IndexingEvent, fields: SafeFields = {}) {
  const record = {
    level: event.endsWith("failed") ? "warn" : "info",
    component: "google_drive_indexing",
    event,
    at: new Date().toISOString(),
    ...fields,
  };
  if (record.level === "warn") console.warn(JSON.stringify(record));
  else console.info(JSON.stringify(record));
}
