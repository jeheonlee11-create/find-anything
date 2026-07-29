"use client";
import { type FormEvent, useState } from "react";
import { LineagePanel } from "@/app/components/lineage-panel";
import { BetaFeedback } from "@/app/components/beta-feedback";
import { RetrievalConfidencePanel } from "@/app/components/retrieval-confidence";
import { SearchConflicts } from "@/app/components/search-conflicts";
import { formatStructuralLocation } from "@/lib/workspace-search/citations";
import type {
  WorkspaceFileType,
  WorkspaceSearchMode,
  WorkspaceSearchResponse,
} from "@/lib/workspace-search/core";
type AuditedSearch = WorkspaceSearchResponse & {
  searchId: string;
  traceId: string;
  receiptId: string;
  retrieval: { kind: "literal"; semanticPaused: true };
};
export function WorkspaceSearch({ workspaceId, demoMode = false }: { workspaceId: string; demoMode?: boolean }) {
  const [query, setQuery] = useState(""),
    [mode, setMode] = useState<WorkspaceSearchMode>("best"),
    [fileType, setFileType] = useState<WorkspaceFileType>("all"),
    [data, setData] = useState<AuditedSearch | null>(null),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [searchCount, setSearchCount] = useState(0),
    [previousTraceId, setPreviousTraceId] = useState<string | null>(null);
  async function run(
    cursor: string | null,
    nextMode = mode,
    nextType = fileType,
  ) {
    setLoading(true);
    setError("");
    const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/search`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query,
            mode: nextMode,
            fileType: nextType,
            cursor,
            pageSize: 20,
          }),
        },
      ),
      body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.message ?? "Search failed.");
    else { if (!cursor && data?.traceId) setPreviousTraceId(data.traceId); setData(body); if (!cursor) setSearchCount((count) => count + 1); }
    setLoading(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setCursors([null]);
    void run(null);
  }
  function changeMode(value: WorkspaceSearchMode) {
    setMode(value);
    setCursors([null]);
    void run(null, value, fileType);
  }
  function changeType(value: WorkspaceFileType) {
    setFileType(value);
    setCursors([null]);
    void run(null, mode, value);
  }
  function next() {
    if (!data?.nextCursor) return;
    setCursors((old) => [...old, data.nextCursor]);
    void run(data.nextCursor);
  }
  function previous() {
    if (cursors.length < 2) return;
    const nextCursors = cursors.slice(0, -1);
    setCursors(nextCursors);
    void run(nextCursors.at(-1) ?? null);
  }
  return (
    <section className="content-section workspace-search">
      <span className="page-badge">{demoMode ? "Live retrieval" : "Search"}</span>
      <h2>{demoMode ? "What is our current enterprise pricing and launch date?" : "5 · Search workspace"}</h2>
      <p>{demoMode ? "Run one focused retrieval across approved, outdated, draft, final, stale, and inaccessible evidence." : "Search by a title, filename, phrase, or words you remember. Best Matches prioritizes exact phrases and recent files; Find All returns every literal match in a stable order."}</p>
      {demoMode && <div className="demo-query-chips"><button onClick={() => setQuery("What is our current enterprise pricing and launch date?")}>Use demo question</button><button onClick={() => setQuery("enterprise pricing launch date")}>Use compact query</button></div>}
      <form onSubmit={submit} className="workspace-search-form">
        <label htmlFor="workspace-query">{demoMode ? "Ask the indexed workspace" : "Search indexed Drive files"}</label>
        <div>
          <input
            id="workspace-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={demoMode ? "What is our current enterprise pricing and launch date?" : "Try Princeton, scholarship, or presentation"}
          />
          <button className="button" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>
      <div className="workspace-search-controls" aria-label="Search controls">
        <div>
          <button
            className={mode === "best" ? "active" : ""}
            onClick={() => changeMode("best")}
          >
            Best Matches
          </button>
          <button
            className={mode === "all" ? "active" : ""}
            onClick={() => changeMode("all")}
          >
            Find All
          </button>
        </div>
        <label>
          File type{" "}
          <select
            value={fileType}
            onChange={(event) =>
              changeType(event.target.value as WorkspaceFileType)
            }
          >
            <option value="all">All files</option>
            <option value="docs">Google Docs only</option>
            <option value="slides">Slides only</option>
            <option value="sheets">Sheets only</option>
            <option value="pdf">PDF only</option>
          </select>
        </label>
      </div>
      {error && <div className="empty-state" role="alert"><b>Search is temporarily unavailable</b><p>{error}</p><button onClick={() => void run(null)}>Try again</button></div>}
      {loading && <div className="search-loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true"/>Searching your authorized files…</div>}
      {data && (
        <>
          <div className="workspace-search-summary">
            <span>Query: “{data.query || "all indexed files"}”</span>
            <span>
              Mode: {data.mode === "best" ? "Best Matches" : "Find All"}
            </span>
            <b>{data.totalMatches} total matches</b>
            <span>
              Showing {data.showingFrom}–{data.showingTo} of {data.totalMatches}
            </span>
            <span>
              {data.coverage.complete
                ? "Indexing complete"
                : "Indexing incomplete"}
            </span>
            <span>{data.coverage.filesSearched} files searched</span>
            <span>{data.coverage.authorizedFilesDiscovered} permission-scoped files</span>
            <span>
              {demoMode
                ? data.coverage.snapshot.status === "complete" ? "Coverage complete" : "Coverage partial"
                : data.coverage.paginationComplete ? "Coverage complete" : "Coverage incomplete"}
            </span>
            <span>
              {data.coverage.lastSuccessfulSyncAt
                ? `Last sync ${new Date(data.coverage.lastSuccessfulSyncAt).toLocaleString()}`
                : "No successful sync recorded"}
            </span>
            <span>
              {data.coverage.failedFiles} failed · {data.coverage.pendingFiles}{" "}
              pending
            </span>
            <span>Deterministic literal retrieval · no semantic claims</span>
          </div>
          {demoMode && data.results.length > 0 && <section className="demo-evidence-first"><span className="page-badge">Answer</span><h3>{data.results[0].citations[0]?.excerpt ?? data.results[0].snippet}</h3><details open><summary>Evidence · {data.results.slice(0, 2).length} cited sources</summary>{data.results.slice(0, 2).map((result) => <article key={result.id}><b>{result.name}</b>{result.citations[0] && <blockquote>{result.citations[0].excerpt}</blockquote>}</article>)}</details></section>}
          {!demoMode && !data.coverage.complete && (
            <p className="disclosure">
              Results are incomplete:{" "}
              {data.coverage.incompleteReasons.join(" ")}
            </p>
          )}
          <RetrievalConfidencePanel confidence={data.confidence} />
          {demoMode && data.coverage.snapshot.status !== "complete" && <p className="disclosure demo-coverage-warning" role="alert"><b>Coverage warning.</b> {data.coverage.snapshot.incompleteReasons.join(" ")}</p>}
          <SearchConflicts key={data.searchId} workspaceId={workspaceId} initial={data.conflicts} />
          {demoMode && data.results[0] && <details className="citation-preview"><summary>Why this ranked</summary><p>Rank #{data.results[0].ranking.position} · score {data.results[0].ranking.finalScore}</p><p>{data.results[0].ranking.factors.some((factor) => factor.key === "authoritative_source" && factor.active) && /status:\s*approved/i.test(data.results[0].citations[0]?.excerpt ?? "") ? "This source ranked highest because it is newer, approved, and explicitly marked authoritative for the stored conflict." : data.results[0].ranking.conciseExplanation} {data.results[0].ranking.rankedAboveNext}</p></details>}
          {demoMode ? <details className="citation-preview"><summary>Replay, trace, receipt, diff, and raw records</summary><div className="audit-actions"><a className="primary-audit-action" href={`/traces/${data.traceId}`}>Replay and trace</a><a href={`/receipts/${data.receiptId}`}>Receipt</a>{previousTraceId && <a href={`/diffs?before=${encodeURIComponent(previousTraceId)}&after=${encodeURIComponent(data.traceId)}`}>Diff</a>}<button onClick={() => navigator.clipboard.writeText(data.receiptId)}>Copy receipt ID</button></div><details><summary>Raw JSON identifiers</summary><pre>{JSON.stringify({ traceId: data.traceId, receiptId: data.receiptId, previousTraceId }, null, 2)}</pre></details></details> : <div className="audit-actions"><a className="primary-audit-action" href={`/traces/${data.traceId}`}>Inspect retrieval trace</a><a href={`/receipts/${data.receiptId}`}>Open search receipt</a><button onClick={() => navigator.clipboard.writeText(data.receiptId)}>Copy receipt ID</button></div>}
          {data.results.length ? (
            <div className="workspace-search-results">
              {data.results.map((result) => (
                <article key={result.id}>
                  <div className="result-body">
                    <div className="result-heading"><span className="file-kind">{fileKind(result.mimeType)}</span><div><h3>{highlight(result.name, data.query)}</h3><small>{result.mimeType}</small></div></div>
                    <p>
                      <b>
                        {result.matchScope === "name_only"
                          ? "name-only"
                          : result.matchType}{" "}
                        match
                      </b>
                      {result.matchScope === "name_only" && (
                        <>
                          {" "}
                          ·{" "}
                          <span className="name-only-match">
                            matched on file name and type; content is not
                            indexed yet
                          </span>
                        </>
                      )}{" "}
                      · {result.ranking.conciseExplanation}
                    </p>
                    <details className="citation-preview">
                      <summary>Why this result?</summary>
                      <p>Rank #{result.ranking.position} · score {result.ranking.finalScore} · {result.ranking.rankingVersion}</p>
                      <p>{result.ranking.conciseExplanation}. {result.ranking.rankedAboveNext}</p>
                      <div className="ranking-factor-list">{result.ranking.factors.filter((factor) => factor.active).map((factor) => <span key={factor.key}><b>{factor.contribution > 0 ? "+" : ""}{factor.contribution}</b>{factor.key.replaceAll("_", " ")}<small>{factor.explanation}</small></span>)}</div>
                      <details><summary>Advanced raw breakdown</summary><pre>{JSON.stringify(result.ranking.advancedRawBreakdown, null, 2)}</pre><p>Inactive: {result.ranking.inactiveFactors.map((factor) => factor.key.replaceAll("_", " ")).join(", ") || "none"}</p></details>
                      <p>
                        Extraction: {result.extractionMethod}. Source: {demoMode ? "synthetic demo workspace" : "Google Drive"}.
                      </p>
                    </details>
                    {result.citations[0] ? (
                      <details className="citation-preview evidence-panel">
                        <summary>Exact evidence preview</summary>
                        <strong>
                          {formatStructuralLocation(
                            result.citations[0].unitType,
                            result.citations[0].structuralLocation,
                          )}
                        </strong>
                        <blockquote>
                          {highlight(result.citations[0].excerpt, data.query)}
                        </blockquote>
                        <small>
                          Evidence hash{" "}
                          {result.citations[0].contentHash.slice(0, 12)}…
                        </small>
                      </details>
                    ) : (
                      result.snippet && (
                        <blockquote>{result.snippet}</blockquote>
                      )
                    )}
                    <LineagePanel
                      workspaceId={workspaceId}
                      fileId={result.id}
                    />
                  </div>
                  {result.sourceUrl && (
                    <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                      {demoMode ? "Inspect source" : "Open source"} ↗
                    </a>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state"><b>No matches yet</b><p>Try fewer words, check the file-type filter, or use a phrase from the title. Find Anything only searches files that finished indexing.</p><button onClick={() => { setQuery(""); setFileType("all"); }}>Clear search</button></div>
          )}
          <div className="workspace-search-pagination">
            <button disabled={loading || cursors.length < 2} onClick={previous}>
              Previous
            </button>
            <button disabled={loading || !data.nextCursor} onClick={next}>
              Next
            </button>
          </div>
          <BetaFeedback workspaceId={workspaceId} query={data.query} searchMode={data.mode} traceId={data.traceId} receiptId={data.receiptId} resultIds={data.results.map((result) => result.id)} prompted={searchCount >= 3} />
        </>
      )}
    </section>
  );
}
function fileKind(mimeType: string) {
  if (mimeType.includes("spreadsheet")) return "SHEET";
  if (mimeType.includes("presentation")) return "SLIDE";
  if (mimeType.includes("pdf")) return "PDF";
  return "DOC";
}
function highlight(text: string, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text
    .split(pattern)
    .map((part, index) =>
      terms.some(
        (term) => term.toLocaleLowerCase() === part.toLocaleLowerCase(),
      ) ? (
        <mark key={`${part}-${index}`}>{part}</mark>
      ) : (
        part
      ),
    );
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
