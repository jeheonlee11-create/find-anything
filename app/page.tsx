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
      <div><a href="/docs">Docs</a><a href="/pricing">Pricing</a><a href="/trust">Security</a></div>
      <a className="marketing-nav-action" href="/connect" onClick={() => marketingEvent("beta_access_clicked")}>Connect Google Drive</a>
    </nav>

    <section className="marketing-hero marketing-shell" id="top">
      <div className="marketing-hero-copy">
        <div className="marketing-eyebrow">Invite-only beta</div>
        <h1>Retrieval evidence for AI agents.</h1>
        <p>Find Anything searches the Google Drive files you share with it, keeps conflicting sources visible, and shows exactly what was found, missed, or off-limits.</p>
        <div className="marketing-actions">
          <a className="marketing-primary" href="/connect" onClick={() => marketingEvent("beta_access_clicked")}>Connect Google Drive <span>→</span></a>
          <a className="marketing-secondary" href="#demo">Watch the demo</a>
        </div>
        <p className="marketing-returning">Already set up? <a href="/app">Continue with Google</a></p>
        <p className="marketing-boundary">Find Anything sees only the Drive files you choose in Google’s picker — the rest of your Drive stays invisible to it. Google has not verified or approved this application; brand verification is pending.</p>
      </div>
      <div className="marketing-illustration" role="group" aria-labelledby="illustration-label">
        <p className="marketing-kicker" id="illustration-label">Illustration · synthetic example, not measured product output</p>
        <div className="marketing-conflict">
          <article className="is-final"><header><span>Approved final</span><small>Newest · authoritative</small></header><h3>Pricing Final.pdf</h3><strong>$120,000/year</strong></article>
          <div className="marketing-conflict-mark" aria-label="Conflicts with">≠</div>
          <article className="is-draft"><header><span>Working draft</span><small>Older</small></header><h3>Pricing Draft.pdf</h3><strong>$95,000/year</strong></article>
        </div>
        <div className="marketing-conflict-footer"><span>Both sources cited</span><span>1 known source unavailable · excluded</span></div>
        <p className="marketing-boundary">Invented files and figures, drawn to show the shape of a conflict.</p>
      </div>
    </section>

    <section className="marketing-demo marketing-shell" id="demo" aria-labelledby="demo-title">
      <p className="marketing-kicker">Recorded demonstration · Synthetic data, not a customer workspace</p>
      <h2 id="demo-title">See it in 56 seconds.</h2>
      <div className="marketing-video-frame">
        <video controls preload="metadata" poster="/find-anything-demo-poster.png" playsInline onPlay={() => { if (!viewed.current) { viewed.current = true; marketingEvent("demo_viewed"); } }}>
          <source src="/find-anything-demo.mp4" type="video/mp4" />
          <track default kind="captions" src="/find-anything-demo-captions.vtt" srcLang="en" label="English" />
          Your browser does not support the demo video.
        </video>
      </div>
      <p className="marketing-boundary">A screen recording of the product on a synthetic Google Drive folder built for the demonstration. Every file, price, and figure in it was invented for the recording.</p>
      <details className="marketing-transcript"><summary>Read the demo description</summary><p>An agent finds two enterprise prices: an approved final at $120,000 per year plus $25,000 implementation, and an older draft at $95,000 plus $20,000. Find Anything keeps both visible, ranks the explicitly authoritative final first, excludes an unavailable Finance record without exposing its contents, and records citations, confidence, coverage, trace, replay, receipt, and diff.</p></details>
    </section>

    <footer className="marketing-footer marketing-shell">
      <div><a className="marketing-brand" href="#top"><span>F</span>Find Anything</a><p>Trusted knowledge for AI agents. Private beta.</p></div>
      <nav aria-label="Legal and trust"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/trust">Security</a><a href="/beta/access-required">Request access</a><a href="mailto:hello@findanything.dev">Contact</a></nav>
    </footer>
  </main>;
}
