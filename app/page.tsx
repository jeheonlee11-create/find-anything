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
        <div className="marketing-eyebrow">Public beta</div>
        <h1>Retrieval evidence for AI agents.</h1>
        <p>Find Anything searches the Google Drive files you share with it, keeps conflicting sources visible, and shows exactly what was found, missed, or off-limits.</p>
        <div className="marketing-actions">
          <a className="marketing-primary" href="/connect" onClick={() => marketingEvent("beta_access_clicked")}>Connect Google Drive <span>→</span></a>
          <a className="marketing-secondary" href="#demo">Watch the film</a>
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
      <p className="marketing-kicker">Product film · 45 seconds · synthetic example data</p>
      <h2 id="demo-title">Evidence, not vibes.</h2>
      <div className="marketing-video-frame">
        <video controls preload="metadata" poster="/find-anything-promo-poster.png" playsInline onPlay={() => { if (!viewed.current) { viewed.current = true; marketingEvent("demo_viewed"); } }}>
          <source src="/find-anything-promo.mp4" type="video/mp4" />
          Your browser does not support the video.
        </video>
      </div>
      <p className="marketing-boundary">An animated product film. Every file and figure in it is an invented example — not customer data. There is no narration.</p>
      <details className="marketing-transcript"><summary>What the film shows</summary><p>An agent finds two conflicting enterprise prices: an approved final at $120,000 per year and an older draft at $95,000. Find Anything keeps both visible, ranks the authoritative final first with the reasons stated, excludes a restricted Finance record without reading it, and accounts for 7 of 8 known sources in a deterministic receipt.</p></details>
    </section>

    <footer className="marketing-footer marketing-shell">
      <div><a className="marketing-brand" href="#top"><span>F</span>Find Anything</a><p>Trusted knowledge for AI agents. Public beta.</p></div>
      <nav aria-label="Legal and trust"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/trust">Security</a><a href="mailto:hello@findanything.dev">Contact</a></nav>
    </footer>
  </main>;
}
