/* eslint-disable react-hooks/set-state-in-effect -- loading state is synchronized with an external API request */
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSearch } from "@/app/components/workspace-search";
type Dashboard = {
  workspace: { id: string; name: string; role: string };
  connector: null | {
    id: string;
    status: string;
    lastSyncAt: string | null;
    lastErrorCode: string | null;
    scopeVerified: boolean;
  };
  files: {
    id: string;
    name: string;
    mimeType: string;
    modifiedAt: string;
    webViewLink: string | null;
    indexStatus: string;
    extractionError: string | null;
    extractionMode: string | null;
    structuralFallbackReason: string | null;
  }[];
  latestSync: null | {
    status: string;
    filesDiscovered: number;
    filesIndexed: number;
    filesFailed: number;
    structuredFiles: number;
    fallbackFiles: number;
    fallbackReasonsJson: string;
    filesAdded: number;
    filesUpdated: number;
    filesUnchanged: number;
    filesRemoved: number;
    paginationComplete: boolean;
    startedAt: string;
    finishedAt: string | null;
  };
};
export function WorkspaceDashboard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter(),
    [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      ),
      body = await response.json().catch(() => ({}));
    if (response.status === 404) {
      router.replace("/app");
      return;
    }
    if (!response.ok)
      setError(body.error?.message ?? "Workspace could not be loaded.");
    else setData(body);
    setLoading(false);
  }, [router, workspaceId]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search),
      oauthError = params.get("connector_error");
    if (oauthError) {
      setError(
        oauthError === "token_exchange_failed"
          ? "Google Drive authorization could not be completed. Check the OAuth configuration and try again."
          : "Google Drive authorization failed. Please try again.",
      );
      params.delete("connector_error");
      params.delete("connector");
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (params.size ? `?${params.toString()}` : ""),
      );
    }
    void load();
  }, [load]);
  async function connect() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/connectors/google-drive/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      }),
      body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.message ?? "Google Drive could not be connected.");
      setBusy(false);
      return;
    }
    window.location.assign(body.authorizationUrl);
  }
  async function sync() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/connectors/google-drive/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      }),
      body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.message ?? "Indexing failed.");
    await load();
    setBusy(false);
  }
  async function disconnect() {
    if (
      !window.confirm(
        "Disconnect Google Drive and delete this workspace’s indexed Drive data?",
      )
    )
      return;
    setBusy(true);
    setError("");
    const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/google-drive`,
        { method: "DELETE" },
      ),
      body =
        response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok)
      setError(body.error?.message ?? "Drive could not be disconnected.");
    await load();
    setBusy(false);
  }
  if (loading)
    return (
      <section className="content-section">
        <p>Loading workspace…</p>
      </section>
    );
  if (!data)
    return (
      <section className="content-section">
        <p className="disclosure">{error || "Workspace unavailable."}</p>
      </section>
    );
  return (
    <>
      <section className="content-section">
        <div className="workspace-title">
          <div>
            <span className="page-badge">
              Workspace · {data.workspace.role}
            </span>
            <h2>{data.workspace.name}</h2>
            <code>{data.workspace.id}</code>
          </div>
          <button onClick={() => router.push("/app")}>All workspaces</button>
        </div>
        {error && (
          <p className="disclosure" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="content-section">
        <h2>2 · Connect Google Drive</h2>
        {data.connector ? (
          <div className="connection-panel">
            <div>
              <b>Status: {data.connector.status}</b>
              <p>
                {data.connector.lastSyncAt
                  ? `Last indexed ${new Date(data.connector.lastSyncAt).toLocaleString()}`
                  : "Connected; indexing has not completed."}
              </p>
              <p>
                {data.connector.scopeVerified
                  ? "Read-only Drive access verified"
                  : "Required read-only Drive permission is missing; reconnect Drive."}
              </p>
              {data.connector.lastErrorCode && (
                <p>Last error: {data.connector.lastErrorCode}</p>
              )}
            </div>
            {data.latestSync&&<div><p>{data.latestSync.paginationComplete?"The complete authorized Drive inventory was checked.":"Coverage is incomplete because Drive pagination did not finish."}</p><p>{data.latestSync.filesAdded} new · {data.latestSync.filesUpdated} updated · {data.latestSync.filesUnchanged} unchanged · {data.latestSync.filesRemoved} removed or no longer authorized</p></div>}
            <div>
              <button className="button" disabled={busy} onClick={sync}>
                {busy ? "Working…" : "Index now"}
              </button>
              <button disabled={busy} onClick={disconnect}>
                Disconnect Google Drive
              </button>
            </div>
          </div>
        ) : (
          <div className="connection-panel">
            <div>
              <b>No Drive connected</b>
              <p>
                Authorize read-only access to files your Google account can
                access.
              </p>
            </div>
            <button className="button" disabled={busy} onClick={connect}>
              {busy ? "Preparing…" : "Connect Google Drive"}
            </button>
          </div>
        )}
      </section>
      <section className="content-section">
        <h2>3 · Indexing status</h2>
        {data.latestSync ? (
          <div className="trust-grid">
            <article>
              <div>
                <h2>Discovered</h2>
                <span>{data.latestSync.filesDiscovered}</span>
              </div>
            </article>
            <article>
              <div>
                <h2>Structural</h2>
                <span>{data.latestSync.structuredFiles}</span>
              </div>
            </article>
            <article>
              <div>
                <h2>Export fallback</h2>
                <span>{data.latestSync.fallbackFiles}</span>
              </div>
            </article>
            <article>
              <div>
                <h2>Indexed</h2>
                <span>{data.latestSync.filesIndexed}</span>
              </div>
            </article>
            <article>
              <div>
                <h2>Failed</h2>
                <span>{data.latestSync.filesFailed}</span>
              </div>
            </article>
            <article>
              <div>
                <h2>Run status</h2>
                <span>{data.latestSync.status}</span>
              </div>
            </article>
          </div>
        ) : (
          <p>No indexing run yet.</p>
        )}
      </section>
      <section className="content-section">
        <h2>4 · Authorized Drive files</h2>
        <p>
          Only metadata returned by this workspace’s authorized Google
          connection is shown.
        </p>
        {data.files.length ? (
          <div className="indexed-files">
            {data.files.map((file) => (
              <article key={file.id}>
                <div>
                  <b>{file.name}</b>
                  <small>
                    {file.mimeType} · {file.indexStatus}
                  </small>
                  <small>
                    Extraction: {file.extractionMode ?? "legacy run"}
                  </small>
                  {file.extractionError && <em>{file.extractionError}</em>}
                  {file.structuralFallbackReason && (
                    <em>
                      {friendlyStructuralError(file.structuralFallbackReason)}
                    </em>
                  )}
                </div>
                {file.webViewLink && (
                  <a href={file.webViewLink} target="_blank" rel="noreferrer">
                    Open in Drive ↗
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p>No authorized files indexed yet.</p>
        )}
      </section>
      <WorkspaceSearch workspaceId={workspaceId} />
    </>
  );
}
function friendlyStructuralError(code: string) {
  if (code === "GOOGLE_DOCS_HTTP_403")
    return "Google Docs structure unavailable: enable the Google Docs API in the OAuth project. Plain-text fallback remains searchable.";
  if (code === "GOOGLE_SHEETS_HTTP_403")
    return "Google Sheets structure unavailable: enable the Google Sheets API in the OAuth project. CSV fallback remains searchable.";
  if (code === "GOOGLE_SLIDES_HTTP_403")
    return "Google Slides structure unavailable: enable the Google Slides API in the OAuth project. Plain-text fallback remains searchable.";
  return "Structured extraction was unavailable; the safe export fallback remains searchable.";
}
