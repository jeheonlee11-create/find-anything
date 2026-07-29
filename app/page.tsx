"use client";

import { useRef } from "react";

function marketingEvent(event: "demo_viewed" | "beta_access_clicked") {
  try {
    const key = "find-anything-marketing-id";
    let anonymousId = sessionStorage.getItem(key);
    if (!anonymousId) { anonymousId = crypto.randomUUID(); sessionStorage.setItem(key, anonymousId); }
    void fetch("/api/marketing/events", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ event, anonymousId }) });
  } catch { /* Analytics never blocks the public experience. */ }
}

export default function Home() {
  const viewed = useRef(false);

  return <main className="marketing-page">
    <nav className="marketing-nav marketing-shell" aria-label="Main navigation">
      <a className="marketing-brand" href="#top" aria-label="Find Anything home"><span>F</span>Find Anything</a>
      <div><a href="#product">Product</a><a href="#design-partners">Design partners</a><a href="/trust">Security</a></div>
      <a className="marketing-nav-action" href="/connect" onClick={() => marketingEvent("beta_access_clicked")}>Connect Google Drive</a>
    </nav>

    <section className="marketing-hero marketing-shell" id="top">
      <div className="marketing-eyebrow">Retrieval evidence for AI agents</div>
      <h1>Your AI agents don’t know what they missed.</h1>
      <p>Find Anything detects conflicting and outdated knowledge, accounts for inaccessible or excluded sources, and shows exactly why an agent trusted one answer over another.</p>
      <div className="marketing-actions"><a className="marketing-primary" href="/connect" onClick={() => marketingEvent("beta_access_clicked")}>Connect Google Drive <span>→</span></a><a href="#demo">Watch the 56-second demo <span>↓</span></a></div>
      <p className="marketing-returning">Already set up? <a href="/app">Continue with Google</a></p>
      <p className="marketing-boundary">Controlled design-partner beta · Access is invite-only · Google Drive available now · Additional connectors planned</p>
      <div className="marketing-proofline" aria-label="Product proof sequence"><span>Conflict detected</span><i>→</i><span>Permissions enforced</span><i>→</i><span>Evidence accounted</span></div>
    </section>

    <section className="marketing-demo marketing-shell" id="demo" aria-labelledby="demo-title">
      <div className="marketing-section-head"><div><span>56 seconds</span><h2 id="demo-title">See the retrieval gap.</h2></div><p>Two prices. One approved source. One inaccessible record. Every known source accounted for.</p></div>
      <p className="marketing-kicker">Recorded demonstration · Synthetic data, not a customer workspace</p>
      <div className="marketing-video-frame">
        <video controls preload="metadata" poster="/find-anything-demo-poster.png" playsInline onPlay={() => { if (!viewed.current) { viewed.current = true; marketingEvent("demo_viewed"); } }}>
          <source src="/find-anything-demo.mp4" type="video/mp4" />
          <track default kind="captions" src="/find-anything-demo-captions.vtt" srcLang="en" label="English" />
          Your browser does not support the demo video.
        </video>
      </div>
      <p className="marketing-boundary">This is a screen recording of the product running against a synthetic Google Drive folder built for the demonstration. Every file, price, and figure in it was invented for the recording.</p>
      <details className="marketing-transcript"><summary>Read the demo description</summary><p>An agent finds two enterprise prices: an approved final at $120,000 per year plus $25,000 implementation, and an older draft at $95,000 plus $20,000. Find Anything keeps both visible, ranks the explicitly authoritative final first, excludes an unavailable Finance record without exposing its contents, and records citations, confidence, coverage, trace, replay, receipt, and diff.</p></details>
    </section>

    <section className="marketing-problem marketing-shell" id="product">
      <div className="marketing-kicker">The problem</div><h2>An answer can look certain while its evidence is not.</h2>
      <div className="marketing-illustration" role="group" aria-labelledby="illustration-label">
        <p className="marketing-kicker" id="illustration-label">Illustration · synthetic example, not measured product output</p>
        <div className="marketing-conflict">
          <article className="is-final"><header><span>Approved final</span><small>Newest · authoritative</small></header><h3>Pricing Final.pdf</h3><strong>$120,000/year</strong><p>$25,000 implementation</p></article>
          <div className="marketing-conflict-mark" aria-label="Conflicts with">≠</div>
          <article className="is-draft"><header><span>Working draft</span><small>Older</small></header><h3>Pricing Draft.pdf</h3><strong>$95,000/year</strong><p>$20,000 implementation</p></article>
        </div>
        <p className="marketing-boundary">Invented file names and figures, drawn to show the shape of a conflict. Nothing here was measured from a real workspace.</p>
      </div>
      <p className="marketing-explanation">Ordinary retrieval may quote whichever file ranks first. Find Anything preserves the contradiction, cites both sources, and explains that the final ranked highest because it is newer, approved, and explicitly authoritative.</p>
    </section>

    <section className="marketing-accounting">
      <div className="marketing-shell">
        <div className="marketing-kicker">The difference</div><h2>Nothing is silently missed.</h2><p className="marketing-accounting-lede">For sources already known to the indexed workspace, Find Anything shows what was searched, trusted, inaccessible, excluded, failed, or otherwise unavailable. It does not claim knowledge of undiscovered systems.</p>
        <div className="marketing-illustration" role="group" aria-labelledby="accounting-illustration-label">
          <p className="marketing-kicker" id="accounting-illustration-label">Illustration · synthetic example, not measured product output</p>
          <div className="marketing-accounting-flow"><div><strong>8</strong><span>known sources</span></div><b>→</b><div><strong>7</strong><span>accessible and searched</span></div><i>+</i><div className="unavailable"><strong>1</strong><span>unavailable and excluded</span></div></div>
          <p className="marketing-boundary">Invented counts from the same synthetic example. Your own numbers come from your own indexed workspace and are reported per search.</p>
        </div>
        <div className="marketing-accounting-meta"><span>Exact citations and source links</span><span>Every known source accounted for</span><span>Coverage reported per search</span></div>
      </div>
    </section>

    <section className="marketing-capabilities marketing-shell">
      <div className="marketing-section-head"><div><span>Evidence, not confidence theater</span><h2>Inspect the retrieval decision.</h2></div><p>Start with the answer and evidence. Open the technical record only when you need it.</p></div>
      <div className="marketing-capability-grid">
        <article><span>01</span><h3>Conflicts and authority</h3><p>Keep contradictory sources visible and show the deterministic signals behind ranking.</p></article>
        <article><span>02</span><h3>Permissions and coverage</h3><p>Search only authorized records and disclose inaccessible or excluded known sources.</p></article>
        <article><span>03</span><h3>Exact citations</h3><p>Return evidence locations and source links instead of unsupported summaries.</p></article>
        <article><span>04</span><h3>Trace, replay, receipt, diff</h3><p>Inspect execution, reproduce its stages, preserve its record, and see what changed.</p></article>
      </div>
    </section>

    <section className="marketing-partners marketing-shell" id="design-partners">
      <div><div className="marketing-kicker">Design-partner beta</div><h2>For teams building agents over messy internal knowledge.</h2><p>We are onboarding a small number of AI platform, knowledge, security, and operations teams. Begin with a limited, non-sensitive Google Drive folder and evaluate retrieval quality with the founder.</p><ul><li>Guided setup and retrieval review</li><li>Direct input into the retrieval contract and developer API</li><li>Clear deletion and disconnect controls</li></ul><p className="marketing-boundary">Access is invite-only today. Connecting Google Drive checks your invitation first; if you are not yet approved, you can request access instead. Google Drive access is requested read-only, and the application is still awaiting Google’s restricted-scope verification — it has not been verified or approved by Google.</p><p><a className="marketing-primary" href="/connect" onClick={() => marketingEvent("beta_access_clicked")}>Connect Google Drive <span>→</span></a></p></div>
      <div className="marketing-connectors"><div><b>Google Drive</b><span>Available now</span></div>{["Notion", "Microsoft 365", "Slack", "GitHub", "Jira", "Dropbox", "Box"].map(name => <div key={name}><b>{name}</b><span>Planned</span></div>)}</div>
    </section>

    <footer className="marketing-footer marketing-shell"><div><a className="marketing-brand" href="#top"><span>F</span>Find Anything</a><p>Trusted knowledge for AI agents. Private beta.</p></div><nav aria-label="Legal and trust"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/trust">Security</a><a href="/beta/access-required">Request access</a><a href="mailto:security@findanything.dev">Security contact</a><a href="mailto:hello@findanything.dev">Contact</a></nav></footer>
  </main>;
}
