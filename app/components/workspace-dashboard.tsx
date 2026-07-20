/* eslint-disable react-hooks/set-state-in-effect -- loading state is synchronized with an external API request */
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSearch } from "@/app/components/workspace-search";
import { WorkspaceCoverageMap } from "@/app/components/workspace-coverage-map";
type Dashboard = {
  demoMode: boolean;
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
  indexingJob: null | {
    id: string;
    status: string;
    processedCount: number;
    discoveredCount: number;
    indexedCount: number;
    unsupportedCount: number;
    failedCount: number;
    structuralCount: number;
    fallbackCount: number;
    lastErrorCode: string | null;
    heartbeatAt: string | null;
    completedAt: string | null;
    updatedAt: string;
  };
};
export function WorkspaceDashboard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter(),
    [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [busyLabel, setBusyLabel] = useState("Working…"),
    [error, setError] = useState("");
  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
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
    if (!background) setLoading(false);
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
  useEffect(() => {
    if (!data || !isActiveJob(data.indexingJob?.status)) return;
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [data, load]);
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
    setBusyLabel("Queueing…");
    setError("");
    const response = await fetch("/api/connectors/google-drive/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      }),
      body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.message ?? "Indexing could not be queued.");
      setBusy(false);
      return;
    }
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!jobId) {
      await load();
      setBusy(false);
      return;
    }
    setBusyLabel("Indexing in background…");
    for (let poll = 0; jobId && poll < 120; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const progressResponse = await fetch(
          `/api/indexing-jobs/${encodeURIComponent(jobId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        ),
        progress = await progressResponse.json().catch(() => ({})),
        status = progress.job?.status as string | undefined;
      if (progress.job)
        setBusyLabel(
          `${progress.job.processedCount}/${progress.job.discoveredCount || "?"} processed`,
        );
      if (
        status &&
        ["completed", "partial", "failed", "cancelled", "reauthorization_required"].includes(status)
      )
        break;
    }
    await load(true);
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
        <div className="search-loading" role="status"><span className="spinner" aria-hidden="true"/>Preparing your workspace…</div>
      </section>
    );
  if (!data)
    return (
      <section className="content-section">
        <p className="disclosure">{error || "Workspace unavailable."}</p>
      </section>
    );
  const accessibleFiles = data.files.filter((file) => file.indexStatus === "indexed").length,
    unavailableFiles = data.latestSync?.filesRemoved ?? 0,
    job = data.indexingJob,
    activeJob = isActiveJob(job?.status),
    remaining = job?.discoveredCount
      ? Math.max(0, job.discoveredCount - job.processedCount)
      : null;
  return (
    <>
      <section className="content-section">
        <div className="workspace-title">
          <div>
            <span className="page-badge">
              Workspace · {data.workspace.role}
            </span>
            <h2>{data.workspace.name}</h2>
            {!data.demoMode && <code>{data.workspace.id}</code>}
          </div>
          <button onClick={() => router.push("/app")}>All workspaces</button>
        </div>
        {error && (
          <p className="disclosure" role="alert">
            {error}
          </p>
        )}
      </section>
      {data.demoMode ? (
        <>
          <section className="content-section demo-overview">
            <div className="demo-status-row">
              <div><span className="page-badge">Decision demo · Synthetic</span><h2>What agents found—and what they missed</h2><p>{accessibleFiles} Acme AI pricing, launch, security, sales, and engineering sources are searchable. The previously known Finance source is unavailable under the current authorization.</p></div>
              <div className="demo-metrics"><b>{accessibleFiles} / {accessibleFiles + unavailableFiles}</b><span>accessible</span><b>{unavailableFiles}</b><span>unavailable</span></div>
            </div>
            <div className="demo-flow" aria-label="Retrieval flow"><span>Evidence</span><i>→</i><span>Confidence</span><i>→</i><span>Coverage</span><i>→</i><span>Conflict</span><i>→</i><span>Replay</span></div>
          </section>
          <WorkspaceSearch workspaceId={workspaceId} demoMode />
          <section className="content-section developer-proof">
            <span className="page-badge">Built for agents</span>
            <h2>Same retrieval, structured interfaces.</h2>
            <p>The UI, REST endpoint, and MCP tools share one authorization and evidence pipeline.</p>
              <div className="developer-grid"><article><b>REST API</b><code>POST /v1/search</code><small>Stable JSON · cursor pagination · trace ID</small></article><article><b>MCP · POST /api/mcp</b><code>tools/list · tools/call</code><small>Search and inspect evidence from an agent</small></article><article><b>Trust layer</b><code>trace + receipt</code><small>Coverage, ranking factors, citations, latency</small></article></div>
            <div className="audit-actions"><a href="/docs">Open API documentation</a><a href="/mcp">Open MCP endpoint</a></div>
          </section>
        </>
      ) : <>
      <section className="content-section">
        <h2>2 · Connect Google Drive</h2>
        {data.connector ? (
          <div className="connection-panel">
            <div>
              <b>{friendlyConnectorStatus(data.connector.status)}</b>
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
              {data.connector.lastErrorCode && <p>{friendlyConnectorError(data.connector.lastErrorCode)}</p>}
            </div>
            {data.latestSync&&<div><p>{data.latestSync.paginationComplete?"The complete authorized Drive inventory was checked.":"Coverage is incomplete because Drive pagination did not finish."}</p><p>{data.latestSync.filesAdded} new · {data.latestSync.filesUpdated} updated · {data.latestSync.filesUnchanged} unchanged · {data.latestSync.filesRemoved} removed or no longer authorized</p></div>}
            <div>
              {data.connector.status === "reauthorization_required" ? (
                <button className="button" disabled={busy} onClick={connect}>
                  {busy ? "Preparing…" : "Reconnect Google Drive"}
                </button>
              ) : (
                <button className="button" disabled={busy || activeJob} onClick={sync}>
                  {busy ? busyLabel : activeJob ? "Indexing…" : data.latestSync ? "Check for updates" : "Start indexing"}
                </button>
              )}
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
        <h2>Coverage map</h2>
        <WorkspaceCoverageMap workspaceId={workspaceId} />
      </section>
      <section className="content-section">
        <h2>3 · Indexing status</h2>
        {job && (
          <div className="indexing-progress" role="status" aria-live="polite">
            <b>{indexingProgressLabel(job)}</b>
            <p>
              {remaining === null
                ? "Discovering the authorized Drive inventory…"
                : `${remaining} remaining · ${job.indexedCount} indexed · ${job.unsupportedCount} skipped · ${job.failedCount} failed`}
            </p>
            {job.discoveredCount > 0 && (
              <progress value={job.processedCount} max={job.discoveredCount}>
                {job.processedCount} of {job.discoveredCount}
              </progress>
            )}
          </div>
        )}
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
          <div className="empty-state"><b>Ready to build your searchable index</b><p>Start indexing above. You can leave this page and come back—saved progress is preserved.</p></div>
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
          <div className="empty-state"><b>{data.connector ? "No searchable files yet" : "Connect Drive to get started"}</b><p>{data.connector ? "Start indexing, then this list will fill as files become searchable." : "Connect with read-only access. Find Anything never edits or deletes your Drive files."}</p></div>
        )}
      </section>
      <WorkspaceSearch workspaceId={workspaceId} />
      </>}
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
function friendlyConnectorStatus(status: string) {
  if (status === "connected") return "Google Drive connected";
  if (status === "syncing") return "Indexing your Drive";
  if (status === "token_refreshing") return "Refreshing your secure connection";
  if (status === "reauthorization_required") return "Reconnect Google Drive to continue";
  if (status === "error") return "Google Drive needs attention";
  return "Google Drive disconnected";
}
function friendlyConnectorError(code: string) {
  if (code.includes("TIME_BUDGET") || code.includes("PARTIAL")) return "Indexing paused safely. Your saved progress was preserved; choose Check for updates to continue.";
  if (code.includes("TOKEN") || code.includes("AUTH")) return "Your Google permission needs to be renewed. Reconnect Drive to continue safely.";
  return "Some files could not be processed. Searchable files remain available, and you can retry indexing.";
}
function isActiveJob(status: string | null | undefined) {
  return Boolean(status && ["queued", "running", "pausing", "stale"].includes(status));
}
function indexingProgressLabel(job: NonNullable<Dashboard["indexingJob"]>) {
  if (job.status === "completed") return `Indexing complete: ${job.processedCount} of ${job.discoveredCount} files accounted for`;
  if (["failed", "cancelled", "reauthorization_required"].includes(job.status))
    return `Indexing stopped after ${job.processedCount} of ${job.discoveredCount || "the discovered"} files`;
  if (!job.discoveredCount) return "Discovering authorized Drive files";
  return `Indexing ${job.processedCount} of ${job.discoveredCount} files`;
}
