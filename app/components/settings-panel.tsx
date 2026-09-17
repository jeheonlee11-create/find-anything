/* eslint-disable react-hooks/set-state-in-effect -- loading state is synchronized with an external API request */
"use client";
import { useCallback, useEffect, useState } from "react";

type Workspace = { id: string; name: string; role: string; createdAt: string };
type Connector = {
  id: string;
  status: string;
  lastSyncAt: string | null;
  lastErrorCode: string | null;
  scopeVerified: boolean;
} | null;

/**
 * Workspace and Google Drive settings. Every action here calls the same
 * authenticated, membership-checked API the workspace dashboard uses; this
 * component adds no capability of its own.
 */
export function SettingsPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [connector, setConnector] = useState<Connector>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/workspaces", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      setError(body.error?.message ?? "Workspaces could not be loaded.");
    else {
      const list: Workspace[] = body.workspaces ?? [];
      setWorkspaces(list);
      setSelectedId((current) =>
        current && list.some((item) => item.id === current)
          ? current
          : (list[0]?.id ?? ""),
      );
    }
    setLoading(false);
  }, []);

  const loadConnector = useCallback(async (workspaceId: string) => {
    if (!workspaceId) {
      setConnector(null);
      return;
    }
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/google-drive`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setConnector(null);
      setError(
        body.error?.message ?? "The Drive connection could not be loaded.",
      );
      return;
    }
    setConnector(body.connector ?? null);
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);
  useEffect(() => {
    void loadConnector(selectedId);
  }, [loadConnector, selectedId]);

  const selected = workspaces.find((item) => item.id === selectedId) ?? null;

  async function disconnect() {
    if (!selected) return;
    if (
      !window.confirm(
        "Disconnect Google Drive and permanently delete this workspace’s indexed Drive data? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(selected.id)}/google-drive`,
      { method: "DELETE" },
    );
    const body =
      response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (response.ok)
      setNotice(
        "Google authorization was revoked and this workspace’s Drive data was deleted.",
      );
    else
      setError(
        body.error?.message ??
          "Drive could not be disconnected. Nothing was deleted.",
      );
    await loadConnector(selected.id);
    setBusy(false);
  }

  return (
    <>
      <section className="content-section">
        <h2>Workspace</h2>
        {loading ? (
          <div className="search-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Loading your workspaces…
          </div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state">
            <b>No workspace yet</b>
            <p>
              Connecting Google Drive creates your first workspace
              automatically.
            </p>
          </div>
        ) : (
          <>
            {workspaces.length > 1 && (
              <label>
                Selected workspace
                <select
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected && (
              <dl className="settings-list">
                <div>
                  <dt>Name</dt>
                  <dd>{selected.name}</dd>
                </div>
                <div>
                  <dt>Workspace ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Your membership role</dt>
                  <dd>{selected.role}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
                </div>
              </dl>
            )}
            <p className="disclosure">
              Workspace membership is checked on the server for every workspace,
              connector, search, and receipt request. Another workspace’s files
              are never reachable from this one.
            </p>
            <div className="audit-actions">
              <a
                href={`/app/workspaces/${encodeURIComponent(selectedId)}`}
                aria-disabled={!selectedId}
              >
                Open this workspace
              </a>
            </div>
          </>
        )}
      </section>

      <section className="content-section">
        <h2>Google Drive</h2>
        {error && (
          <p className="disclosure" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="disclosure" role="status">
            {notice}
          </p>
        )}
        {connector ? (
          <div className="connection-panel">
            <div>
              <b>{driveStatusLabel(connector.status)}</b>
              <p>
                {connector.lastSyncAt
                  ? `Last indexed ${new Date(connector.lastSyncAt).toLocaleString()}`
                  : "Connected; indexing has not completed."}
              </p>
              <p>
                {connector.scopeVerified
                  ? "Per-file Drive access verified"
                  : "The required read-only Drive permission is missing; reconnect Drive."}
              </p>
            </div>
            <div>
              <button
                disabled={busy || !selected || selected.role !== "owner"}
                onClick={disconnect}
              >
                {busy ? "Disconnecting…" : "Disconnect Google Drive and delete data"}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <b>No Google Drive connected</b>
            <p>
              Start the connection from your workspace. Find Anything requests
              read-only access and never edits or deletes Drive files.
            </p>
          </div>
        )}
        {selected && selected.role !== "owner" && (
          <p className="disclosure">
            Only the workspace owner can disconnect Drive.
          </p>
        )}
        <h3>What disconnecting deletes</h3>
        <p>
          The server first asks Google to revoke the authorization. If Google does
          not confirm revocation, nothing is deleted and you can retry safely.
          Once revocation is confirmed, these are permanently deleted:
        </p>
        <ul className="status-list">
          <li>Encrypted access and refresh tokens, and any pending authorization state.</li>
          <li>Indexed file metadata, file versions, and extracted searchable text units.</li>
          <li>Search vectors, inferred file relationships, and detected conflicts.</li>
          <li>Retrieval traces and search receipts, including their stored queries and citations.</li>
          <li>Indexing job history, retry attempts, failure records, and coverage receipts.</li>
        </ul>
        <p>These are kept, because they are not Drive content:</p>
        <ul className="status-list">
          <li>Your account, this workspace, and its membership record.</li>
          <li>Developer API keys you created for this workspace.</li>
          <li>Feedback you submitted, and privacy-safe aggregate event counters.</li>
        </ul>
        <p className="disclosure">
          Find Anything never deletes or modifies anything in your Google Drive.
          Deleting the workspace record itself, or the account, is a founder-run
          request during the controlled beta — it is not yet a self-service
          action in this interface.
        </p>
      </section>
    </>
  );
}

function driveStatusLabel(status: string) {
  if (status === "connected") return "Google Drive connected";
  if (status === "syncing") return "Indexing your Drive";
  if (status === "token_refreshing") return "Refreshing the secure connection";
  if (status === "reauthorization_required")
    return "Reconnect Google Drive to continue";
  if (status === "error") return "Google Drive needs attention";
  return "Google Drive disconnected";
}
