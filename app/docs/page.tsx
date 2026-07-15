import type { Metadata } from "next";
import Link from "next/link";
import { publicUrls } from "@/lib/config/urls";
export const metadata: Metadata = {
  title: "Developer docs — Find Anything",
  description: "Live workspace retrieval API and MCP contracts.",
};
const endpoints = [
  ["POST", "/v1/search", "Live workspace search with trace and receipt"],
  ["GET", "/v1/searches/:searchId", "Durable search record"],
  ["GET", "/v1/searches/:searchId/results", "Cursor-paginated stored results"],
  ["GET", "/v1/retrieval-traces/:traceId", "Real runtime trace"],
  ["GET", "/v1/search-receipts/:receiptId", "Durable exportable receipt"],
  ["GET", "/v1/workspaces/:workspaceId/coverage", "Live indexing coverage"],
  ["GET", "/v1/files/:fileId/citations", "Exact structural evidence"],
  ["GET", "/v1/files/:fileId/relationships", "Explainable inferred lineage"],
];
const curlExample = `curl ${publicUrls.app}/v1/search \\n  -H "Authorization: Bearer \$FIND_ANYTHING_API_KEY" \\n  -H "Content-Type: application/json" \\n  -d '{"query":"scholarship","mode":"best","fileType":"docs"}'`;
const mcpExample = `{"mcpServers":{"find-anything":{"url":"${publicUrls.app}/api/mcp","headers":{"Authorization":"Bearer fa_live_your_key_here"}}}}`;
export default function DocsPage() {
  return (
    <main className="content-page">
      <nav className="content-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">F</span>
          <span>Find Anything</span>
        </Link>
        <div>
          <Link href="/">Product</Link>
          <Link href="/trust">Trust</Link>
        </div>
      </nav>
      <header className="content-hero">
        <span className="page-badge">
          Developer documentation · Live locally
        </span>
        <h1>Retrieval API contract</h1>
        <p>
          The authenticated routes use real indexed workspace records. No
          example API key is live, and no production deployment is claimed.
        </p>
      </header>
      <section className="content-section">
        <h2>REST endpoints</h2>
        <div className="endpoint-list">
          {endpoints.map(([method, path, status]) => (
            <article key={path}>
              <code>{method}</code>
              <b>{path}</b>
              <span>{status}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="content-section">
        <h2>cURL</h2>
        <pre>
          <code>{curlExample}</code>
        </pre>
      </section>
      <section className="content-section">
        <h2>MCP tools · Implemented locally</h2>
        <div className="tool-grid">
          {[
            "search_files",
            "find_all_files",
            "get_exact_evidence",
            "get_search_coverage",
            "get_retrieval_trace",
            "get_search_receipt",
            "get_file_relationships",
          ].map((tool) => (
            <code key={tool}>
              {tool}
              <small>Live</small>
            </code>
          ))}
        </div>
        <pre>
          <code>{mcpExample}</code>
        </pre>
      </section>
      <section className="content-section">
        <h2>Current implementation boundary</h2>
        <ul className="status-list">
          <li>
            <b>Live:</b> Google Drive indexing, workspace isolation, literal
            search, exact citations, traces, receipts, lineage, API keys, and
            MCP.
          </li>
            <li><b>Paused:</b> semantic ranking and embeddings are disconnected from active runtime paths until explicitly authorized.</li>
          <li>
            <b>Not deployed:</b> this working state remains local until explicit
            deployment approval.
          </li>
        </ul>
      </section>
    </main>
  );
}
