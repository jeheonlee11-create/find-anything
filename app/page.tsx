"use client";

import { FormEvent, useMemo, useState } from "react";
import { runSampleRetrieval } from "@/lib/retrieval/core";
import type { RetrievalFilters, RetrievalResponse, SearchMode } from "@/lib/retrieval/types";
import { publicUrls } from "@/lib/config/urls";

const initialQuery = "Find the document where I discussed air pollution and Detroit.";
const sourceNames = [{name:"Google Drive",status:"Sample corpus"},{name:"Microsoft 365",status:"Planned"},{name:"Notion",status:"Planned"},{name:"Dropbox",status:"Planned"}];
function mapMode(mode:"ranked"|"exhaustive"|"exact"|"newest"):SearchMode{return mode==="exhaustive"?"find_all":mode==="exact"?"exact_evidence":mode==="newest"?"newest_version":"ranked";}

export default function Home() {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(query);
  const [searching, setSearching] = useState(false);
  const [codeTab, setCodeTab] = useState<"mcp" | "typescript" | "curl">("mcp");
  const [copied, setCopied] = useState(false);
  const [searchMode, setSearchMode] = useState<"ranked" | "exhaustive" | "exact" | "newest">("ranked");
  const [activeLayer, setActiveLayer] = useState<"results"|"coverage"|"trace">("results");
  const [response, setResponse] = useState<RetrievalResponse>(()=>runSampleRetrieval({query:initialQuery,mode:"ranked"}));
  const [filters, setFilters] = useState<RetrievalFilters>({});

  const code = useMemo(() => {
    if (codeTab === "mcp") {
      return `{
  "mcpServers": {
    "find-anything": {
      "url": "${publicUrls.mcp}",
      "headers": { "Authorization": "Bearer fa_live_your_key_here" }
    }
  }
}`;
    }
    if (codeTab === "typescript") {
      return `import { FindAnything } from "@findanything/sdk";

const files = await find.search({
  query: "${submitted}",
  sources: ["google-drive"],
  search_mode: "exhaustive",
  completeness_policy: "fail_if_incomplete",
  include_coverage: true,
  include_exclusions: true
});`;
    }
    return `curl ${publicUrls.api}/api/retrieval/search \\
  -H "Authorization: Bearer fa_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"${submitted}","search_mode":"exhaustive","include_coverage":true}'`;
  }, [codeTab, submitted]);

  function runSearch(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setSearching(true);
    window.setTimeout(() => {
      setSubmitted(clean);
      setResponse(runSampleRetrieval({query:clean,mode:mapMode(searchMode),filters,page:1,pageSize:searchMode==="exhaustive"?25:3}));
      setActiveLayer("results");
      setSearching(false);
    }, 420);
  }

  async function copyKey() {
    await navigator.clipboard?.writeText("fa_live_your_key_here");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function exportReceipt() {
    const receipt = {
      ...response.receipt,
      notice: "Generated from the repository sample corpus. This record is exportable but is not persisted or immutable.",
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "find-anything-sample-search-receipt.json";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  function changePage(page:number){setResponse(runSampleRetrieval({query:submitted,mode:mapMode(searchMode),filters,page,pageSize:searchMode==="exhaustive"?25:3}));}

  return (
    <main>
      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Find Anything home">
          <span className="brand-mark">F</span>
          <span>Find Anything</span>
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#playground">Playground</a>
          <a href="/docs">API docs</a>
          <a href="/trust">Trust</a>
        </div>
        <a className="button button-small" href="#playground">
          Start building <span>↗</span>
        </a>
      </nav>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> Retrieval infrastructure for AI agents</div>
          <h1>The retrieval control plane for AI agents.</h1>
          <p className="hero-lede">
            Connect Google Drive once. Let any AI agent search your organization’s files with exact citations, permission checks, and proof of what was not searched.
          </p>
          <div className="hero-actions">
            <a className="button" href="#playground">Create a workspace <span>→</span></a>
            <a className="text-link" href="/docs">Read the API docs <span>↗</span></a>
          </div>
          <p className="microcopy">Prove what was searched · Report what was missed · Cite exact evidence</p>
        </div>

        <div className="agent-window" aria-label="Interactive prototype search result demonstration">
          <div className="window-bar">
            <div className="window-dots"><i /><i /><i /></div>
            <span>Interactive prototype · sample corpus</span>
            <span className="status"><i /> sample</span>
          </div>
          <div className="conversation">
            <div className="message user-message">
              <span className="avatar human">J</span>
              <p>Find the document where I discussed air pollution and Detroit.</p>
            </div>
            <div className="search-trace">
              <span>5 indexed sample files searched</span>
              <span className="trace-line" />
              <span>0.8s</span>
            </div>
            <div className="message agent-message">
              <span className="avatar agent">F</span>
              <div>
                <p className="found-label">Sample evidence · permission allowed</p>
                <h3>Environmental Justice Scholarship Essay</h3>
                <p className="snippet">“Detroit showed nearly 1,000 PM1 particles—ten times higher than surrounding areas.”</p>
                <div className="result-meta"><span>Google Docs</span><span>¶ 47–51</span><span>Prototype</span><button disabled>Source link planned</button></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="source-strip">
        <div className="shell source-inner">
          <span>Govern access across</span>
          <div className="source-logo"><b>△</b> Google Drive <small>Sample MVP</small></div>
          <div className="source-logo"><b>▦</b> Microsoft 365 <small>Planned</small></div>
          <div className="source-logo"><b>N</b> Notion <small>Planned</small></div>
          <div className="source-logo"><b>◇</b> Dropbox <small>Planned</small></div>
          <div className="source-logo"><b>●</b> Box <small>Planned</small></div>
        </div>
      </div>

      <section className="section shell" id="how">
        <div className="section-kicker">A control plane, not another search chatbot</div>
        <div className="section-heading-grid">
          <h2>Retrieval should be<br />inspectable evidence.</h2>
          <p>Most systems return a few plausible chunks and hide the rest of the process. Find Anything exposes corpus coverage, permission decisions, exclusions, exact citations, and the configuration behind every result.</p>
        </div>
        <div className="feature-grid">
          <article><span className="feature-number">01</span><h3>Coverage accounted</h3><p>Report accessible, indexed, searched, skipped, and failed files. Never claim completeness without evidence.</p></article>
          <article><span className="feature-number">02</span><h3>Retrieval traced</h3><p>Inspect query expansion, candidates, scores, filters, permission decisions, exclusions, and latency.</p></article>
          <article><span className="feature-number">03</span><h3>Evidence located</h3><p>Cite exact paragraphs, slides, speaker notes, sheet ranges, PDF pages, figures, and comments.</p></article>
          <article><span className="feature-number">04</span><h3>Records exported</h3><p>Export the query, corpus state, returned evidence, exclusions, and policy. Immutability is planned, not implemented.</p></article>
        </div>
        <div className="control-list"><p><b>Find Anything sits between an agent and private files to control:</b></p><ul><li>what may be searched;</li><li>which actor identity and permissions apply;</li><li>how retrieval is performed;</li><li>what was excluded or missed;</li><li>where exact evidence was found;</li><li>how the retrieval was logged.</li></ul><small>Current implementation: local sample corpus and typed contracts. Live source permissions and connectors are planned.</small></div>
      </section>

      <section className="playground-section" id="playground">
        <div className="shell">
          <div className="section-kicker light">Interactive prototype · Sample corpus</div>
          <div className="playground-heading"><h2>See what retrieval<br />usually hides.</h2><p>This prototype uses sample trace and coverage data. It demonstrates the product contract and does not represent a live corpus-wide retrieval backend.</p></div>
          <div className="console">
            <aside className="console-sidebar">
              <div className="workspace-name"><span>FA</span><div><b>My first workspace</b><small>ws_7Qx9N2kM</small></div></div>
              <div className="sidebar-label">Sources</div>
              {sourceNames.map((source) => (
                <button className={`source-button ${source.status === "Sample corpus" ? "connected" : ""}`} key={source.name} disabled title={source.status === "Planned" ? "Connector is planned and not implemented." : "Repository sample corpus; no live connector."}>
                  <span className="source-icon">{source.name.charAt(0)}</span><span>{source.name}</span><i>{source.status}</i>
                </button>
              ))}
              <div className="api-key-card"><small>API key example</small><code>fa_live_your_key_here</code><button onClick={copyKey}>{copied ? "Copied" : "Copy"}</button></div>
              <div className="sidebar-foot"><span className="green-dot" /> Local sample search operational</div>
            </aside>

            <div className="console-main">
              <div className="console-top"><div><span>Retrieval playground</span><small>Sample workspace · 6 local file records</small></div><span className="read-only">Not live Drive data</span></div>
              <form className="search-form" onSubmit={runSearch}>
                <div className="mode-selector" aria-label="Search mode">
                  {([['ranked','Best matches'],['exhaustive','Find all'],['exact','Exact evidence'],['newest','Newest version']] as const).map(([value, label]) => <button type="button" key={value} className={searchMode === value ? "active" : ""} onClick={() => setSearchMode(value)}>{label}</button>)}
                </div>
                <label htmlFor="agent-query">Search private files with evidence</label>
                <div className="search-box"><textarea id="agent-query" value={query} onChange={(event) => setQuery(event.target.value)} rows={3} /><button type="submit" disabled={searching}>{searching ? "Searching…" : "Run retrieval →"}</button></div>
                <div className="suggestions"><span>Try:</span><button type="button" onClick={() => setQuery("Which presentation had the chart about customer growth?")}>Find a forgotten slide</button><button type="button" onClick={() => setQuery("Show me the newest version of my climate research project.")}>Find the newest version</button></div>
                <div className="filter-row" aria-label="Prototype retrieval filters">
                  <label>Source<select value={filters.source ?? ""} onChange={(event)=>setFilters({...filters,source:event.target.value?"google_drive":undefined})}><option value="">All sample sources</option><option value="google_drive">Google Drive sample</option></select></label>
                  <label>File type<select value={filters.fileType ?? ""} onChange={(event)=>setFilters({...filters,fileType:event.target.value||undefined})}><option value="">All types</option><option value="document">Google Doc</option><option value="presentation">Slides</option><option value="pdf">PDF</option><option value="spreadsheet">Spreadsheet</option></select></label>
                  <label>Owner<select value={filters.owner ?? ""} onChange={(event)=>setFilters({...filters,owner:event.target.value||undefined})}><option value="">Any owner</option><option>Jordan Lee</option><option>Maya Chen</option></select></label>
                  <label>Folder<select value={filters.folder ?? ""} onChange={(event)=>setFilters({...filters,folder:event.target.value||undefined})}><option value="">Any folder</option><option>/Research</option><option>/Company</option><option>/Applications</option></select></label>
                </div>
              </form>
              <div className={`results ${searching ? "loading" : ""}`} aria-live="polite">
                <div className="layer-tabs" role="tablist" aria-label="Retrieval output layers">
                  <button className={activeLayer==="results"?"active":""} onClick={()=>setActiveLayer("results")}>1 · Search Results <span>{response.totalMatches}</span></button>
                  <button className={activeLayer==="coverage"?"active":""} onClick={()=>setActiveLayer("coverage")}>2 · Coverage Report <span>{response.coverage.completenessStatus}</span></button>
                  <button className={activeLayer==="trace"?"active":""} onClick={()=>setActiveLayer("trace")}>3 · Retrieval Trace <span>simulated</span></button>
                </div>
                {activeLayer==="results" && <div className="layer-panel">
                  <div className="results-head"><p><b>{response.totalMatches} matching sample file{response.totalMatches===1?"":"s"} found.</b> {response.totalMatches?`Showing ${response.results.length} on page ${response.page}.`:"Try a term from the sample corpus."}</p><span>{searchMode === "exhaustive" ? "Find All prototype" : searchMode === "exact" ? "Exact evidence prototype" : searchMode === "newest" ? "Newest-version prototype" : "Best Matches"}</span></div>
                  {!response.results.length && <div className="empty-state"><b>No matching sample files</b><p>The local sample corpus has air-quality research, customer-growth slides, and a revenue spreadsheet. Unrelated queries correctly return no results.</p></div>}
                  {response.results.map((result) => (
                    <article className="file-result" key={result.evidence.id}>
                      <div className="file-rank">{result.rank}</div>
                      <div className="file-body"><div className="file-title-row"><h3>{result.file.name}</h3><span className="confidence">{result.score}%</span><span className="permission-badge">Permission: allowed*</span></div><div className="file-meta"><span>Google Drive sample</span><span>{result.file.mimeType}</span><span>{result.citation}</span></div><p className="file-reason">{result.whyMatched}</p><blockquote>{result.evidence.text}</blockquote><small>*Local sample permission snapshot—not live Google Drive enforcement.</small></div>
                      <button className="open-result" disabled title="Source links are unavailable for repository sample files.">Prototype link</button>
                    </article>
                  ))}
                  {response.totalPages>1 && <div className="pagination"><button disabled={response.page<=1} onClick={()=>changePage(response.page-1)}>← Previous</button><span>Page {response.page} of {response.totalPages}</span><button disabled={response.page>=response.totalPages} onClick={()=>changePage(response.page+1)}>Next →</button></div>}
                </div>}
                {activeLayer==="coverage" && <div className="layer-panel coverage-card">
                  <div className="coverage-head"><div><span className={`coverage-status ${response.coverage.complete?"complete":""}`}>{response.coverage.completenessStatus}</span><b>Sample corpus coverage</b></div><button className="info-button" title="Complete means every eligible accessible file was successfully evaluated.">Definitions ⓘ</button></div>
                  {!response.coverage.complete && <p className="coverage-warning"><b>Results may be incomplete.</b> {response.coverage.warnings.slice(1).join(" ")}</p>}
                  <div className="coverage-metrics"><span title="The actor can theoretically access the file according to the connected source."><b>{response.coverage.accessibleFiles}</b>Accessible</span><span title="A searchable representation currently exists."><b>{response.coverage.indexedFiles}</b>Indexed</span><span title="The file was actually included in this retrieval execution."><b>{response.coverage.searchedFiles}</b>Searched</span><span title="The file met the declared matching criteria."><b>{response.coverage.matchedFiles}</b>Matches</span><span><b>{response.coverage.excludedByFilter}</b>Excluded by filters</span><span><b>{response.coverage.permissionDenied}</b>Permission denied</span><span><b>{response.coverage.extractionFailed}</b>Extraction failures</span><span><b>{response.coverage.awaitingIndex}</b>Awaiting index</span><span title="Complete means every eligible accessible file was successfully evaluated."><b>{response.coverage.complete?"Yes":"No"}</b>Complete</span></div>
                  <div className="definition-grid"><p><b>Accessible</b>The actor can theoretically access the file according to the source.</p><p><b>Indexed</b>A searchable representation currently exists.</p><p><b>Searched</b>The file was included in this execution.</p><p><b>Matched</b>The file met the declared matching criteria.</p><p><b>Complete</b>Every eligible accessible file was successfully evaluated.</p></div>
                  <div className="receipt-actions"><button onClick={exportReceipt}>Export sample retrieval record ↓</button></div>
                </div>}
                {activeLayer==="trace" && <div className="layer-panel trace-panel">
                  <div className="trace-disclosure"><span>Simulated trace</span>This trace combines executed local keyword stages with clearly marked planned or simulated production stages.</div>
                  <dl className="trace-summary"><div><dt>Trace ID</dt><dd>{response.trace.traceId}</dd></div><div><dt>Workspace</dt><dd>{response.trace.workspace}</dd></div><div><dt>Actor</dt><dd>{response.trace.actor}</dd></div><div><dt>Original query</dt><dd>{response.trace.originalQuery}</dd></div><div><dt>Interpreted query</dt><dd>{response.trace.interpretedQuery||"No searchable terms"}</dd></div><div><dt>Expanded terms</dt><dd>{response.trace.expandedTerms.join(", ")||"None"}</dd></div><div><dt>Search mode</dt><dd>{response.trace.searchMode}</dd></div><div><dt>Corpus snapshot</dt><dd>{response.trace.corpusSnapshotAt}</dd></div></dl>
                  <div className="trace-waterfall">{response.trace.stages.map((stage)=><div key={stage.name}><span>{stage.name} <em>{stage.status}</em></span><i style={{width:`${Math.max(5,stage.candidateCountAfter*12)}%`}}/><b>{stage.latencyMs} ms</b><small>{stage.detail}</small></div>)}</div>
                  <div className="trace-counts"><span><b>{response.trace.keywordCandidates}</b>Keyword candidates</span><span><b>{response.trace.semanticCandidates??"—"}</b>Semantic candidates</span><span><b>{response.trace.mergedCandidates}</b>Merged candidates</span><span><b>{response.trace.exclusions.length}</b>Exclusions</span><span><b>{response.trace.permissionDecisions.length}</b>Permission decisions</span><span><b>{response.trace.completenessStatus}</b>Completeness</span></div>
                </div>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="comparison-section shell" id="comparison">
        <div className="section-kicker">Product contract and implementation status</div>
        <div className="section-heading-grid"><h2>Typical AI search<br />versus a control plane.</h2><p>Status labels describe this repository today—not future marketing claims.</p></div>
        <div className="comparison-table" role="table" aria-label="Typical AI search compared with Find Anything">
          <div className="comparison-row comparison-head" role="row"><span>Capability</span><span>Typical AI search</span><span>Find Anything status</span></div>
          {[
            ["Returns likely matches","Common","Prototype: local sample corpus"],
            ["Reports total searchable corpus","Rare","Prototype: sample coverage"],
            ["Reports indexing failures","Rare","Prototype: sample index states"],
            ["Exact slide/page/paragraph citations","Varies","Prototype: structural sample units"],
            ["Search receipt","Rare","Prototype: exportable JSON record"],
            ["Model-independent API","Varies","Proposed REST and MCP contract"],
            ["Exhaustive matching mode","Uncommon","Prototype UI; production engine planned"],
            ["Query-time permission enforcement","Varies","Planned for Google Drive MVP"],
            ["Coverage and exclusion reporting","Uncommon","Prototype logic; live connectors planned"],
          ].map(([capability,typical,status])=><div className="comparison-row" role="row" key={capability}><span>{capability}</span><span>{typical}</span><span><i className={status.startsWith("Planned")||status.includes("planned")?"planned":"prototype"}>{status.startsWith("Planned")||status.includes("planned")?"Planned":"Prototype"}</i>{status}</span></div>)}
        </div>
      </section>

      <section className="developer-section shell" id="developers">
        <div>
          <div className="section-kicker">Model-neutral retrieval infrastructure</div>
          <h2>One policy layer.<br />Every agent framework.</h2>
          <p>Use REST, MCP, or an SDK without locking retrieval to one model provider. Every request can declare its search mode, completeness policy, actor identity, filters, and evidence requirements.</p>
          <ul><li><span>◌</span> Permission enforcement · Planned</li><li><span>◇</span> Coverage reporting · Prototype</li><li><span>◇</span> Structural citations · Prototype</li><li><span>◇</span> Exportable records · Prototype</li></ul>
        </div>
        <div className="code-card">
          <div className="code-tabs">{(["mcp", "typescript", "curl"] as const).map((tab) => <button key={tab} onClick={() => setCodeTab(tab)} className={codeTab === tab ? "active" : ""}>{tab === "mcp" ? "MCP" : tab === "typescript" ? "TypeScript" : "cURL"}</button>)}</div>
          <pre><code>{code}</code></pre>
          <div className="code-foot"><span><i /> Proposed API contract</span><button onClick={() => navigator.clipboard?.writeText(code)}>Copy code</button></div>
        </div>
      </section>

      <section className="cta-section">
        <div className="shell cta-inner"><div><div className="eyebrow dark"><span className="pulse" /> Verify retrieval before trusting the answer</div><h2>Know what your agent searched.<br />Prove what it found.</h2></div><a className="button button-light" href="#playground">Inspect the prototype <span>→</span></a></div>
      </section>

      <footer className="footer shell"><a className="brand" href="#top"><span className="brand-mark">F</span><span>Find Anything</span></a><p>Permission-aware retrieval control plane for AI agents.</p><div><a href="/docs">API docs</a><a href="#playground">Prototype</a><a href="/trust">Trust</a></div><span>© 2026</span></footer>
    </main>
  );
}
