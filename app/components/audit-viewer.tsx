"use client";
import { useEffect, useState } from "react";
import { RetrievalConfidencePanel } from "@/app/components/retrieval-confidence";
import type { RetrievalConfidence } from "@/lib/workspace-search/confidence";
export function AuditViewer({
  kind,
  id,
}: {
  kind: "receipt" | "trace";
  id: string;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [replayMode, setReplayMode] = useState<"concise" | "developer">("concise");
  const path =
    kind === "receipt"
      ? `/api/search-receipts/${encodeURIComponent(id)}`
      : `/api/retrieval-traces/${encodeURIComponent(id)}`;
  useEffect(() => {
    fetch(path, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message ?? "Audit record unavailable.");
        setData(body);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Audit record unavailable.",
        ),
      );
  }, [path]);
  return (
    <section className="content-section">
      <span className="page-badge">
        {kind === "receipt" ? "Search receipt" : "Developer retrieval trace"}
      </span>
      <h1>{kind === "receipt" ? "Search receipt" : "Retrieval trace"}</h1>
      <p>
        This record reflects the stored runtime search execution. It is not
        described as immutable or cryptographically signed.
      </p>
      {error && <p className="disclosure">{error}</p>}
      {data && (
        <>
          <div className="audit-hero">
            <div><small>Query received</small><h2>“{String(data.query ?? "") }”</h2><div className="audit-context"><span>{data.workspaceId === "ws_yc_demo_acme" ? "Northstar · Enterprise Launch" : "Authorized workspace"}</span><span>{data.searchTimestamp || data.createdAt ? new Date(String(data.searchTimestamp ?? data.createdAt)).toLocaleString() : "Recorded search"}</span></div><p>{kind === "trace" ? "Every stage from authorization to final ordering, recorded without exposing credentials or private document contents." : "A portable record of what was searched, what was returned, and how complete the evidence set was."}</p></div>
            <span className="page-badge">{String(data.searchMode ?? "best matches")}</span>
          </div>
          <div className="trust-grid">
            {Object.entries(data)
              .filter(([key]) =>
                [
                  "totalMatches",
                  "totalReturned",
                  "finalResultCount",
                  "completenessStatus",
                  "searchDurationMs",
                ].includes(key),
              )
              .map(([key, value]) => (
                <article key={key}>
                  <div>
                    <h2>{key.replace(/([A-Z])/g, " $1")}</h2>
                    <span>{String(value)}</span>
                  </div>
                </article>
              ))}
          </div>
          {data.retrievalConfidence && typeof data.retrievalConfidence === "object" && <RetrievalConfidencePanel confidence={data.retrievalConfidence as RetrievalConfidence} />}
          {Array.isArray(data.rankingExplanations) && <details className="citation-preview"><summary>Stored ranking explanations · {data.rankingSnapshotVersion ? String(data.rankingSnapshotVersion) : "legacy"}</summary><div className="ranking-audit-list">{(data.rankingExplanations as Array<Record<string, unknown>>).map((item) => <article key={String(item.fileId)}><b>Rank #{String(item.position)} · score {String(item.finalScore)}</b><p>{String(item.conciseExplanation ?? "Stored ranking breakdown")}</p><small>{String(item.rankedAboveNext ?? "Last displayed result")}</small></article>)}</div></details>}
          {kind === "trace" && <div className="audit-metric-strip"><span><b>{String(data.authorizedFilesConsidered ?? 0)}</b> authorized files considered</span><span><b>{String(data.finalResultCount ?? 0)}</b> final results</span><span><b>{totalLatency(data.latencyByStage)} ms</b> recorded retrieval latency</span></div>}
          {kind === "trace" && <ReplayViewer replay={data.replay} mode={replayMode} setMode={setReplayMode} />}
          {kind === "receipt" && Array.isArray(data.citations) && <div className="receipt-evidence"><h2>Cited evidence</h2><p>{data.citations.length} exact citation{data.citations.length === 1 ? "" : "s"} recorded · configuration and result-set hashes included.</p><code>{String(data.configurationHash ?? "")}</code></div>}
          <div className="audit-actions">
            <button onClick={() => navigator.clipboard.writeText(id)}>
              Copy {kind} ID
            </button>
            {kind === "trace" && <a href={`/diffs?before=${encodeURIComponent(id)}`}>Compare this trace</a>}
            {kind === "receipt" && (
              <>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(window.location.href)
                  }
                >
                  Copy read-only link
                </button>
                <a href={`${path}?format=json`}>Export JSON</a>
                <a href={`${path}?format=csv`}>Export CSV</a>
              </>
            )}
          </div>
          <details className="citation-preview">
            <summary>Complete stored JSON record</summary>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
function ReplayViewer({ replay, mode, setMode }: { replay: unknown; mode: "concise" | "developer"; setMode: (mode: "concise" | "developer") => void }) {
  if (!replay || typeof replay !== "object") return <div className="empty-state"><h2>Replay unavailable</h2><p>This older trace remains readable, but versioned replay events were not recorded. No missing steps are simulated.</p></div>;
  const record = replay as { schemaVersion?: unknown; events?: unknown }, events = Array.isArray(record.events) ? record.events as Array<Record<string, unknown>> : [];
  return <section className="replay-panel" aria-labelledby="replay-heading"><div className="replay-heading"><div><h2 id="replay-heading">Retrieval replay</h2><p>Persisted events in actual recorded order · {String(record.schemaVersion ?? "unknown version")}</p></div><div className="mode-switch" aria-label="Replay detail"><button aria-pressed={mode === "concise"} onClick={() => setMode("concise")}>Concise</button><button aria-pressed={mode === "developer"} onClick={() => setMode("developer")}>Developer</button></div></div><div className="trace-timeline">{events.map((item, index) => <article key={`${String(item.stage)}-${String(item.sequence)}`}><span>{String(item.sequence ?? index + 1)}</span><div><b>{String(item.label ?? item.stage)}</b><p>{String(item.summary ?? "Recorded event")}</p>{mode === "developer" && <dl className="replay-metadata"><div><dt>Start</dt><dd>{item.startedAt ? String(item.startedAt) : "Unavailable"}</dd></div><div><dt>Duration</dt><dd>{typeof item.durationMs === "number" ? `${item.durationMs} ms` : "Unavailable"}</dd></div><div><dt>Counts</dt><dd>in {valueOrUnavailable(item.inputCount)} · out {valueOrUnavailable(item.outputCount)} · excluded {valueOrUnavailable(item.excludedCount)}</dd></div><div><dt>Warnings</dt><dd>{valueOrUnavailable(item.warningCount)}</dd></div><div><dt>Version</dt><dd>{String(item.configurationVersion ?? "Unavailable")}</dd></div><div><dt>Reason codes</dt><dd>{Array.isArray(item.reasonCodes) ? item.reasonCodes.join(", ") : "Unavailable"}</dd></div></dl>}</div><em>{String(item.status ?? "unavailable")}</em></article>)}</div></section>;
}
function valueOrUnavailable(value: unknown) { return typeof value === "number" ? String(value) : "Unavailable"; }
function totalLatency(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>((total, item) => total + (typeof item === "number" ? item : 0), 0);
}
