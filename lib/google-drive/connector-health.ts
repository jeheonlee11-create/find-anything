import { classifyIndexingFailure } from "../indexing/failures.ts";

/**
 * One decision point for "can this connector be used right now?" and "what
 * should a failure do to the connector?". Pure (no D1, no env) so the search
 * routes, the permission inventory, and the sync all agree, and so it can be
 * tested directly.
 */
export type ConnectorStatus =
  | "connected"
  | "token_refreshing"
  | "reauthorization_required"
  | "syncing"
  | "error"
  | "revoked";

export interface ConnectorFailure {
  /** True when retrying later can succeed without the user doing anything. */
  retryable: boolean;
  /**
   * Status to persist. Transient failures keep the connector `connected` (its
   * token is still valid or refreshable) and only record `code`.
   */
  status: "connected" | "reauthorization_required" | "error";
  code: string;
}

export type ConnectorSearchAccess =
  | { allowed: true }
  | { allowed: false; code: string; message: string };

/** Statuses whose stored credential is valid or refreshable. */
const USABLE_STATUSES = new Set(["connected", "syncing", "token_refreshing"]);
/** Scopes the app accepts on a token (drive.readonly is the legacy grant). */
const ACCEPTED_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];
const REAUTHORIZATION_REQUIRED = "GOOGLE_REAUTHORIZATION_REQUIRED";

export function isUsableConnectorStatus(status: string | null | undefined) {
  return Boolean(status && USABLE_STATUSES.has(status));
}

/** A refresh response without any accepted Drive scope cannot read Drive. */
export function hasAcceptedDriveScope(scope: string | null | undefined) {
  if (!scope) return true; // Google omits `scope` when it is unchanged.
  const granted = new Set(scope.split(/\s+/));
  return ACCEPTED_DRIVE_SCOPES.some((accepted) => granted.has(accepted));
}

/**
 * Classifies an OAuth/Drive failure (a thrown error or a stored error code).
 * Revoked or expired grants and missing scopes need the user to reconnect;
 * rate limits, 5xx, timeouts, and network errors are transient.
 */
export function classifyConnectorFailure(error: unknown): ConnectorFailure {
  const oauth = oauthErrorShape(error);
  if (oauth) {
    if (oauth.code === "invalid_grant" || oauth.code === "revoked")
      return { retryable: false, status: "reauthorization_required", code: REAUTHORIZATION_REQUIRED };
    return oauth.retryable
      ? { retryable: true, status: "connected", code: `GOOGLE_OAUTH_${oauth.code.toUpperCase()}` }
      : { retryable: false, status: "error", code: `GOOGLE_OAUTH_${oauth.code.toUpperCase()}` };
  }
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "",
    code = raw.replace(/[^A-Z0-9_()-]/gi, "_").slice(0, 100) || "UNKNOWN_ERROR",
    normalized = code.toUpperCase();
  if (/REFRESH_TOKEN_MISSING|REAUTHORIZATION|INVALID_GRANT|OAUTH_REVOKED|SCOPE_MISSING|HTTP_401\b/.test(normalized))
    return { retryable: false, status: "reauthorization_required", code: REAUTHORIZATION_REQUIRED };
  // Checked before the indexing classifier, which reads any "PERMISSION" or
  // "403" as permanent: an incomplete inventory page is a transient Drive
  // condition, while a Drive 403 stays a permanent connector error.
  if (/HTTP_5\d\d\b|HTTP_429\b|TEMPORARILY_UNAVAILABLE|REQUEST_UNAVAILABLE|TOKEN_REFRESH_FAILED|INVENTORY_INCOMPLETE|INCOMPLETE_SEARCH/.test(normalized))
    return { retryable: true, status: "connected", code };
  if (/HTTP_403\b/.test(normalized)) return { retryable: false, status: "error", code };
  return classifyIndexingFailure(code).retryable
    ? { retryable: true, status: "connected", code }
    : { retryable: false, status: "error", code };
}

/**
 * Whether a search may use this connector. A refresh in progress, a running
 * sync, or a transient last error still has a valid-or-refreshable token; a
 * revoked grant or permanent error blocks with a clear reason.
 */
export function connectorSearchAccess(
  connector: { status: string; lastErrorCode?: string | null } | null | undefined,
): ConnectorSearchAccess {
  if (!connector)
    return { allowed: false, code: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Connect Google Drive before searching this workspace." };
  if (isUsableConnectorStatus(connector.status)) return { allowed: true };
  if (connector.status === "error" && connector.lastErrorCode && classifyConnectorFailure(connector.lastErrorCode).retryable)
    return { allowed: true };
  if (connector.status === "reauthorization_required")
    return { allowed: false, code: REAUTHORIZATION_REQUIRED, message: "Google Drive access was revoked or expired. Reconnect Google Drive to search this workspace." };
  if (connector.status === "error")
    return { allowed: false, code: "GOOGLE_DRIVE_NEEDS_ATTENTION", message: "Google Drive rejected this connection. Reconnect Google Drive to search this workspace." };
  return { allowed: false, code: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Connect Google Drive before searching this workspace." };
}

/**
 * For a failure while revalidating Drive permissions during a search: the
 * blocking response when it is permanent, or null when it is transient (the
 * caller then returns its retryable 503).
 */
export function permanentConnectorFailure(error: unknown): { code: string; message: string } | null {
  const failure = classifyConnectorFailure(error);
  if (failure.retryable) return null;
  const access = connectorSearchAccess({ status: failure.status, lastErrorCode: failure.code });
  return access.allowed ? null : { code: access.code, message: access.message };
}

function oauthErrorShape(error: unknown): { code: string; retryable: boolean } | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; retryable?: unknown };
  return typeof candidate.code === "string" && typeof candidate.retryable === "boolean"
    ? { code: candidate.code, retryable: candidate.retryable }
    : null;
}
