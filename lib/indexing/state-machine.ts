export type IndexingStage =
  | "connecting"
  | "verifying_authorization"
  | "discovering"
  | "discovery_complete"
  | "indexing"
  | "completed"
  | "failed"
  | "interrupted";

export type DiscoveryStatus =
  | "not_started"
  | "running"
  | "complete"
  | "failed";

export const INDEXING_STALE_AFTER_MS = 120_000;

export function isHeartbeatDelayed(
  status: string,
  heartbeatAt: string | null,
  now = Date.now(),
) {
  return (
    ["queued", "running", "pausing", "stale"].includes(status) &&
    Boolean(
      heartbeatAt &&
        Number.isFinite(Date.parse(heartbeatAt)) &&
        now - Date.parse(heartbeatAt) >= INDEXING_STALE_AFTER_MS,
    )
  );
}

export function indexingStageLabel(stage: IndexingStage) {
  return {
    connecting: "Connecting to Google Drive",
    verifying_authorization: "Verifying authorization and permissions",
    discovering: "Discovering files",
    discovery_complete: "File discovery complete",
    indexing: "Indexing files",
    completed: "Completed",
    failed: "Failed",
    interrupted: "Interrupted",
  }[stage];
}
