"use client";

import { FormEvent, useMemo, useState } from "react";

const demoFiles = [
  {
    title: "Environmental Justice Scholarship Essay",
    type: "Google Doc",
    location: "Paragraphs 4–6",
    score: 96,
    excerpt:
      "Detroit showed nearly 1,000 PM1 particles—ten times higher than surrounding areas. What looked random was actually systematic.",
    reason:
      "Discusses Detroit air pollution, atmospheric transport, and environmental justice.",
  },
  {
    title: "Air Quality Research Presentation",
    type: "Google Slides",
    location: "Slide 12",
    score: 88,
    excerpt:
      "Cross-border pollution follows atmospheric physics rather than political boundaries.",
    reason:
      "Contains a Detroit emissions chart and the same air-quality research theme.",
  },
  {
    title: "AGU Conference Research Notes",
    type: "PDF",
    location: "Page 3",
    score: 79,
    excerpt:
      "PM1 and formaldehyde correlations across states with varying combustion regulations.",
    reason: "Likely source material for the essay and presentation.",
  },
];

const sourceNames = ["Google Drive", "Microsoft 365", "Notion", "Dropbox"];

export default function Home() {
  const [query, setQuery] = useState(
    "Find the document where I discussed air pollution and Detroit.",
  );
  const [submitted, setSubmitted] = useState(query);
  const [searching, setSearching] = useState(false);
  const [connected, setConnected] = useState(["Google Drive"]);
  const [codeTab, setCodeTab] = useState<"mcp" | "typescript" | "curl">("mcp");
  const [copied, setCopied] = useState(false);
  const [searchMode, setSearchMode] = useState<"ranked" | "exhaustive" | "exact" | "newest">("ranked");
  const [showTrace, setShowTrace] = useState(false);

  const code = useMemo(() => {
    if (codeTab === "mcp") {
      return `{
  "mcpServers": {
    "find-anything": {
      "url": "https://mcp.findanything.dev/ws_7Qx9",
      "headers": { "Authorization": "Bearer fa_live_••••••" }
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
    return `curl https://api.findanything.dev/v1/search \\
  -H "Authorization: Bearer fa_live_••••••" \\
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
      setSearching(false);
    }, 650);
  }

  function toggleSource(source: string) {
    setConnected((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source],
    );
  }

  async function copyKey() {
    await navigator.clipboard?.writeText("fa_live_demo_7Qx9N2kM");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function exportReceipt() {
    const receipt = {
      receipt_id: "rcpt_demo_4F91",
      trace_id: "trace_demo_91AF",
      prototype: true,
      query: submitted,
      search_mode: searchMode,
      coverage: { accessible_files: 12842, indexed_files: 12791, files_searched: 12791, matches: 147, extraction_failures: 18, awaiting_indexing: 33, completeness_status: "incomplete" },
      returned_files: demoFiles.map((file) => file.title),
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "find-anything-sample-search-receipt.json";
    anchor.click();
    URL.revokeObjectURL(href);
  }

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
          <a href="#developers">Developers</a>
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
            Connect every workspace once. Give any agent permission-aware,
            coverage-accounted, and verifiable access to private files.
          </p>
          <div className="hero-actions">
            <a className="button" href="#playground">Create a workspace <span>→</span></a>
            <a className="text-link" href="#developers">Read the API docs <span>↗</span></a>
          </div>
          <p className="microcopy">Prove what was searched · Report what was missed · Cite exact evidence</p>
        </div>

        <div className="agent-window" aria-label="Search result demonstration">
          <div className="window-bar">
            <div className="window-dots"><i /><i /><i /></div>
            <span>retrieval receipt · trace_91AF</span>
            <span className="status"><i /> audited</span>
          </div>
          <div className="conversation">
            <div className="message user-message">
              <span className="avatar human">J</span>
              <p>Find the document where I discussed air pollution and Detroit.</p>
            </div>
            <div className="search-trace">
              <span>12,791 of 12,842 accessible files searched</span>
              <span className="trace-line" />
              <span>0.8s</span>
            </div>
            <div className="message agent-message">
              <span className="avatar agent">F</span>
              <div>
                <p className="found-label">Evidence 1 · 96% confidence · permission allowed</p>
                <h3>Environmental Justice Scholarship Essay</h3>
                <p className="snippet">“Detroit showed nearly 1,000 PM1 particles—ten times higher than surrounding areas.”</p>
                <div className="result-meta"><span>Google Docs</span><span>¶ 47–51</span><span>18 extraction failures</span><button>View trace ↗</button></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="source-strip">
        <div className="shell source-inner">
          <span>Govern access across</span>
          <div className="source-logo"><b>△</b> Google Drive</div>
          <div className="source-logo"><b>▦</b> Microsoft 365</div>
          <div className="source-logo"><b>N</b> Notion</div>
          <div className="source-logo"><b>◇</b> Dropbox</div>
          <div className="source-logo"><b>●</b> Box</div>
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
          <article><span className="feature-number">04</span><h3>Receipts exported</h3><p>Create an immutable record of the query, corpus state, returned evidence, exclusions, and policy.</p></article>
        </div>
      </section>

      <section className="playground-section" id="playground">
        <div className="shell">
          <div className="section-kicker light">Interactive product contract</div>
          <div className="playground-heading"><h2>See what retrieval<br />usually hides.</h2><p>This prototype uses sample trace and coverage data. It demonstrates the product contract; it does not represent a live corpus-wide retrieval backend.</p></div>
          <div className="console">
            <aside className="console-sidebar">
              <div className="workspace-name"><span>FA</span><div><b>My first workspace</b><small>ws_7Qx9N2kM</small></div></div>
              <div className="sidebar-label">Sources</div>
              {sourceNames.map((source) => (
                <button className={`source-button ${connected.includes(source) ? "connected" : ""}`} key={source} onClick={() => toggleSource(source)}>
                  <span className="source-icon">{source.charAt(0)}</span><span>{source}</span><i>{connected.includes(source) ? "Connected" : "+ Connect"}</i>
                </button>
              ))}
              <div className="api-key-card"><small>Workspace key</small><code>fa_live_••••••••</code><button onClick={copyKey}>{copied ? "Copied" : "Copy"}</button></div>
              <div className="sidebar-foot"><span className="green-dot" /> All systems operational</div>
            </aside>

            <div className="console-main">
              <div className="console-top"><div><span>Retrieval playground</span><small>Sample workspace · {connected.length} source{connected.length === 1 ? "" : "s"} connected</small></div><span className="read-only">Prototype data</span></div>
              <form className="search-form" onSubmit={runSearch}>
                <div className="mode-selector" aria-label="Search mode">
                  {([['ranked','Best matches'],['exhaustive','Find all'],['exact','Exact evidence'],['newest','Newest version']] as const).map(([value, label]) => <button type="button" key={value} className={searchMode === value ? "active" : ""} onClick={() => setSearchMode(value)}>{label}</button>)}
                </div>
                <label htmlFor="agent-query">Search private files with evidence</label>
                <div className="search-box"><textarea id="agent-query" value={query} onChange={(event) => setQuery(event.target.value)} rows={3} /><button type="submit" disabled={searching}>{searching ? "Searching…" : "Run retrieval →"}</button></div>
                <div className="suggestions"><span>Try:</span><button type="button" onClick={() => setQuery("Which presentation had the chart about customer growth?")}>Find a forgotten slide</button><button type="button" onClick={() => setQuery("Show me the newest version of my climate research project.")}>Find the newest version</button></div>
              </form>
              <div className={`results ${searching ? "loading" : ""}`} aria-live="polite">
                <div className="coverage-card">
                  <div className="coverage-head"><div><span className="coverage-status">Incomplete</span><b>Coverage-accounted result</b></div><span>trace_demo_91AF</span></div>
                  <p>147 matches found across 12,791 indexed files. Results may be incomplete because 51 accessible files were not successfully indexed.</p>
                  <div className="coverage-metrics"><span><b>12,842</b>Accessible</span><span><b>12,791</b>Indexed</span><span><b>12,791</b>Searched</span><span><b>147</b>Matches</span><span><b>18</b>Extraction failures</span><span><b>33</b>Awaiting index</span></div>
                  <div className="receipt-actions"><button onClick={() => setShowTrace((value) => !value)}>{showTrace ? "Hide retrieval trace" : "View retrieval trace"}</button><button onClick={exportReceipt}>Export sample receipt ↓</button></div>
                  {showTrace && <div className="trace-waterfall"><div><span>Query understanding</span><i style={{width:'6%'}} /><b>18 ms</b></div><div><span>Keyword retrieval</span><i style={{width:'14%'}} /><b>42 ms</b></div><div><span>Semantic retrieval</span><i style={{width:'30%'}} /><b>91 ms</b></div><div><span>Permission filtering</span><i style={{width:'12%'}} /><b>37 ms</b></div><div><span>Reranking</span><i style={{width:'22%'}} /><b>67 ms</b></div><div><span>Coverage calculation</span><i style={{width:'5%'}} /><b>15 ms</b></div></div>}
                </div>
                <div className="results-head"><p><b>147 matches</b> for “{submitted}” · showing 3 sample results</p><span>{searchMode === "exhaustive" ? "Coverage-accounted mode" : searchMode === "exact" ? "Structural evidence mode" : searchMode === "newest" ? "Version intelligence preview" : "Ranked in 0.8s"}</span></div>
                {demoFiles.map((file, index) => (
                  <article className="file-result" key={file.title}>
                    <div className="file-rank">{index + 1}</div>
                    <div className="file-body"><div className="file-title-row"><h3>{file.title}</h3><span className="confidence">{file.score}%</span></div><div className="file-meta"><span>{file.type}</span><span>{file.location}</span></div><p className="file-reason">{file.reason}</p><blockquote>{file.excerpt}</blockquote></div>
                    <button className="open-result" aria-label={`Open ${file.title}`}>↗</button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="developer-section shell" id="developers">
        <div>
          <div className="section-kicker">Model-neutral retrieval infrastructure</div>
          <h2>One policy layer.<br />Every agent framework.</h2>
          <p>Use REST, MCP, or an SDK without locking retrieval to one model provider. Every request can declare its search mode, completeness policy, actor identity, filters, and evidence requirements.</p>
          <ul><li><span>✓</span> Query-time permission enforcement</li><li><span>✓</span> Coverage and exclusion reporting</li><li><span>✓</span> Exact structural citations</li><li><span>✓</span> Search receipts and trace IDs</li></ul>
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

      <footer className="footer shell"><a className="brand" href="#top"><span className="brand-mark">F</span><span>Find Anything</span></a><p>Permission-aware retrieval control plane for AI agents.</p><div><a href="#developers">API contract</a><a href="#playground">Prototype</a><a href="#top">Privacy</a></div><span>© 2026</span></footer>
    </main>
  );
}
