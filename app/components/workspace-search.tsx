"use client";
import { type FormEvent, useState } from "react";
import { LineagePanel } from "@/app/components/lineage-panel";
import { BetaFeedback } from "@/app/components/beta-feedback";
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
export function WorkspaceSearch({ workspaceId }: { workspaceId: string }) {
  const [query, setQuery] = useState(""),
    [mode, setMode] = useState<WorkspaceSearchMode>("best"),
    [fileType, setFileType] = useState<WorkspaceFileType>("all"),
    [data, setData] = useState<AuditedSearch | null>(null),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
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
    else setData(body);
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
      <h2>5 · Search workspace</h2>
      <p>
        Search real indexed metadata and exact extracted evidence. Best Matches
        ranks literal matches by title, filename, type, and content. Find All
        returns every literal match in a stable order. Semantic search is
        paused.
      </p>
      <form onSubmit={submit} className="workspace-search-form">
        <label htmlFor="workspace-query">Search indexed Drive files</label>
        <div>
          <input
            id="workspace-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try Princeton, scholarship, or presentation"
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
      {error && (
        <p className="disclosure" role="alert">
          {error}
        </p>
      )}
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
            <span>
              {data.coverage.authorizedFilesDiscovered} authorized files
              discovered
            </span>
            <span>
              {data.coverage.paginationComplete
                ? "Drive inventory complete"
                : "Drive inventory incomplete"}
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
            <span>Literal full-text search · no paid APIs</span>
          </div>
          {!data.coverage.complete && (
            <p className="disclosure">
              Results are incomplete:{" "}
              {data.coverage.incompleteReasons.join(" ")}
            </p>
          )}
          <div className="audit-actions">
            <a href={`/traces/${data.traceId}`}>View retrieval trace</a>
            <a href={`/receipts/${data.receiptId}`}>Export search receipt</a>
            <button
              onClick={() => navigator.clipboard.writeText(data.receiptId)}
            >
              Copy receipt ID
            </button>
          </div>
          {data.results.length ? (
            <div className="workspace-search-results">
              {data.results.map((result) => (
                <article key={result.id}>
                  <div>
                    <h3>{highlight(result.name, data.query)}</h3>
                    <small>{result.mimeType}</small>
                    <p>
                      <b>{result.matchType} match</b> ·{" "}
                      {result.explanation.join(" · ")}
                    </p>
                    <details className="citation-preview">
                      <summary>Why this result?</summary>
                      <p>
                        Matched fields:{" "}
                        {result.explanation.join(", ") || "indexed file"}.
                      </p>
                      <p>
                        Ranking score: {result.score}. Title{" "}
                        {result.scoreBreakdown.title}; filename{" "}
                        {result.scoreBreakdown.filename}; type{" "}
                        {result.scoreBreakdown.mimeType}; content{" "}
                        {result.scoreBreakdown.content}.
                      </p>
                      <p>
                        Extraction: {result.extractionMethod}. Source: Google
                        Drive.
                      </p>
                    </details>
                    {result.citations[0] ? (
                      <details className="citation-preview">
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
                      Open source ↗
                    </a>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="workspace-search-empty">No matching indexed files.</p>
          )}
          <div className="workspace-search-pagination">
            <button disabled={loading || cursors.length < 2} onClick={previous}>
              Previous
            </button>
            <button disabled={loading || !data.nextCursor} onClick={next}>
              Next
            </button>
          </div>
          <BetaFeedback workspaceId={workspaceId} query={data.query} searchMode={data.mode} traceId={data.traceId} receiptId={data.receiptId} resultIds={data.results.map((result) => result.id)} />
        </>
      )}
    </section>
  );
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
