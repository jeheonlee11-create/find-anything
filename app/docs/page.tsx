import type { Metadata } from "next";
import Link from "next/link";
import { publicUrls } from "@/lib/config/urls";

export const metadata:Metadata={title:"Developer docs — Find Anything",description:"Prototype REST and MCP contracts for Find Anything retrieval infrastructure."};

const endpoints=[["POST","/api/retrieval/search","Working against the repository sample corpus"],["POST","/api/retrieval/find-all","Working pagination contract against the sample corpus"],["GET","/api/retrieval/traces/:traceId","Prototype generated trace; not persisted"],["GET","/api/retrieval/receipts/:receiptId","Prototype generated record; not immutable"],["GET","/api/workspaces/:workspaceId/coverage","Prototype sample coverage"],["POST","/api/connectors/google-drive/connect","Planned; currently returns 501"],["POST","/api/connectors/google-drive/sync","Planned; currently returns 501"]];

const typescriptExample=`const response = await fetch("${publicUrls.api}/api/retrieval/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "air pollution Detroit",
    searchMode: "ranked",
    filters: { source: "google_drive" }
  })
});

const retrieval = await response.json();`;

const curlExample=`curl ${publicUrls.api}/api/retrieval/find-all \\
  -H "Content-Type: application/json" \\
  -d '{"query":"air pollution Detroit","page":1,"pageSize":25}'`;

const mcpExample=`{
  "mcpServers": {
    "find-anything": {
      "url": "${publicUrls.mcp}",
      "headers": { "Authorization": "Bearer fa_live_your_key_here" }
    }
  }
}`;

export default function DocsPage(){return <main className="content-page"><nav className="content-nav"><Link className="brand" href="/"><span className="brand-mark">F</span><span>Find Anything</span></Link><div><Link href="/">Product</Link><Link href="/trust">Trust</Link></div></nav><header className="content-hero"><span className="page-badge">Developer documentation · Prototype</span><h1>Retrieval API contract</h1><p>The routes below are deliberately split between working local sample behavior and planned production integrations. No API key shown here is live.</p></header><section className="content-section"><h2>REST endpoints</h2><div className="endpoint-list">{endpoints.map(([method,path,status])=><article key={path}><code>{method}</code><b>{path}</b><span>{status}</span></article>)}</div></section><section className="content-section two-column"><div><h2>TypeScript</h2><pre><code>{typescriptExample}</code></pre></div><div><h2>cURL</h2><pre><code>{curlExample}</code></pre></div></section><section className="content-section"><h2>MCP tools · Proposed</h2><p className="disclosure">These tools document the intended contract. No production MCP server is deployed by this repository.</p><div className="tool-grid">{["search_files","find_all_files","get_evidence","get_retrieval_trace","export_receipt","get_workspace_coverage"].map((tool)=><code key={tool}>{tool}<small>Planned</small></code>)}</div><pre><code>{mcpExample}</code></pre></section><section className="content-section"><h2>Current implementation boundary</h2><ul className="status-list"><li><b>Working:</b> deterministic full-text search over the repository sample corpus, filters, pagination, structural citation formatting, coverage calculation, generated traces, and JSON record export.</li><li><b>Simulated:</b> reranking and permission decisions use deterministic sample logic.</li><li><b>Planned:</b> Google OAuth, Drive synchronization, embeddings, live ACL enforcement, persistence, background jobs, and production MCP.</li></ul></section></main>}
