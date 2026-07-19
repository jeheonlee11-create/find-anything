"use client";

import { FormEvent, useRef, useState } from "react";

const tools = ["Google Drive", "Slack", "Notion", "Microsoft 365", "GitHub", "Jira", "Other"];
type Intent = "beta" | "demo";

function marketingEvent(event: "demo_viewed" | "beta_access_clicked" | "demo_booking_clicked", intent?: Intent) {
  try {
    const key = "find-anything-marketing-id";
    let anonymousId = sessionStorage.getItem(key);
    if (!anonymousId) { anonymousId = crypto.randomUUID(); sessionStorage.setItem(key, anonymousId); }
    void fetch("/api/marketing/events", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ event, anonymousId, intent }) });
  } catch { /* Analytics never blocks the public experience. */ }
}

export default function Home() {
  const [intent, setIntent] = useState<Intent>("beta");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const viewed = useRef(false);

  function chooseIntent(next: Intent) {
    setIntent(next);
    marketingEvent(next === "demo" ? "demo_booking_clicked" : "beta_access_clicked", next);
    document.getElementById("request-access")?.scrollIntoView({ behavior: "smooth" });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("submitting"); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      fullName: form.get("fullName"), email: form.get("email"), company: form.get("company"), jobTitle: form.get("jobTitle"), companySize: form.get("companySize"),
      knowledgeTools: form.getAll("knowledgeTools"), usesAiAgents: form.get("usesAiAgents") === "yes", knowledgeProblem: form.get("knowledgeProblem"), willingLimitedFolder: form.get("willingLimitedFolder") === "yes",
      website: form.get("website"), intent, startedAt,
    };
    const response = await fetch("/api/beta/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
    if (response.ok) { setStatus("success"); setMessage(result.message ?? "Your request was received."); event.currentTarget.reset(); }
    else { setStatus("error"); setMessage(result.error?.message ?? "We couldn’t save your request. Please try again."); }
  }

  return <main className="marketing-page">
    <nav className="marketing-nav marketing-shell" aria-label="Main navigation">
      <a className="marketing-brand" href="#top" aria-label="Find Anything home"><span>F</span>Find Anything</a>
      <div><a href="#product">Product</a><a href="#design-partners">Design partners</a><a href="/trust">Security</a></div>
      <button onClick={() => chooseIntent("beta")}>Request Beta Access</button>
    </nav>

    <section className="marketing-hero marketing-shell" id="top">
      <div className="marketing-eyebrow">Retrieval evidence for AI agents</div>
      <h1>Your AI agents don’t know what they missed.</h1>
      <p>Find Anything detects conflicting and outdated knowledge, accounts for inaccessible or excluded sources, and shows exactly why an agent trusted one answer over another.</p>
      <div className="marketing-actions"><button className="marketing-primary" onClick={() => chooseIntent("beta")}>Request Beta Access <span>→</span></button><a href="#demo">Watch the 56-second demo <span>↓</span></a></div>
      <p className="marketing-boundary">Controlled design-partner beta · Google Drive available now · Additional connectors planned</p>
      <div className="marketing-proofline" aria-label="Product proof sequence"><span>Conflict detected</span><i>→</i><span>Permissions enforced</span><i>→</i><span>Evidence accounted</span></div>
    </section>

    <section className="marketing-demo marketing-shell" id="demo" aria-labelledby="demo-title">
      <div className="marketing-section-head"><div><span>56 seconds</span><h2 id="demo-title">See the retrieval gap.</h2></div><p>Two prices. One approved source. One inaccessible record. Every known source accounted for.</p></div>
      <div className="marketing-video-frame">
        <video controls preload="metadata" poster="/find-anything-demo-poster.png" playsInline onPlay={() => { if (!viewed.current) { viewed.current = true; marketingEvent("demo_viewed"); } }}>
          <source src="/find-anything-demo.mp4" type="video/mp4" />
          <track default kind="captions" src="/find-anything-demo-captions.vtt" srcLang="en" label="English" />
          Your browser does not support the demo video.
        </video>
      </div>
      <details className="marketing-transcript"><summary>Read the demo description</summary><p>An agent finds two enterprise prices: an approved final at $120,000 per year plus $25,000 implementation, and an older draft at $95,000 plus $20,000. Find Anything keeps both visible, ranks the explicitly authoritative final first, excludes an unavailable Finance record without exposing its contents, and records citations, confidence, coverage, trace, replay, receipt, and diff.</p></details>
    </section>

    <section className="marketing-problem marketing-shell" id="product">
      <div className="marketing-kicker">The problem</div><h2>An answer can look certain while its evidence is not.</h2>
      <div className="marketing-conflict">
        <article className="is-final"><header><span>Approved final</span><small>Newest · authoritative</small></header><h3>Pricing Final.pdf</h3><strong>$120,000/year</strong><p>$25,000 implementation</p></article>
        <div className="marketing-conflict-mark" aria-label="Conflicts with">≠</div>
        <article className="is-draft"><header><span>Working draft</span><small>Older</small></header><h3>Pricing Draft.pdf</h3><strong>$95,000/year</strong><p>$20,000 implementation</p></article>
      </div>
      <p className="marketing-explanation">Ordinary retrieval may quote whichever file ranks first. Find Anything preserves the contradiction, cites both sources, and explains that the final ranked highest because it is newer, approved, and explicitly authoritative.</p>
    </section>

    <section className="marketing-accounting">
      <div className="marketing-shell">
        <div className="marketing-kicker">The difference</div><h2>Nothing is silently missed.</h2><p className="marketing-accounting-lede">For sources already known to the indexed workspace, Find Anything shows what was searched, trusted, inaccessible, excluded, failed, or otherwise unavailable. It does not claim knowledge of undiscovered systems.</p>
        <div className="marketing-accounting-flow"><div><strong>8</strong><span>known sources</span></div><b>→</b><div><strong>7</strong><span>accessible and searched</span></div><i>+</i><div className="unavailable"><strong>1</strong><span>unavailable and excluded</span></div></div>
        <div className="marketing-accounting-meta"><span>Confidence <b>65/100</b></span><span>Exact citations and source links</span><span>Every known source accounted for</span></div>
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
      <div><div className="marketing-kicker">Design-partner beta</div><h2>For teams building agents over messy internal knowledge.</h2><p>We are onboarding a small number of AI platform, knowledge, security, and operations teams. Begin with a limited, non-sensitive Google Drive folder and evaluate retrieval quality with the founder.</p><ul><li>Guided setup and retrieval review</li><li>Direct input into the retrieval contract and developer API</li><li>Clear deletion and disconnect controls</li></ul></div>
      <div className="marketing-connectors"><div><b>Google Drive</b><span>Available now</span></div>{["Notion", "Microsoft 365", "Slack", "GitHub", "Jira", "Dropbox", "Box"].map(name => <div key={name}><b>{name}</b><span>Planned</span></div>)}</div>
    </section>

    <section className="marketing-request" id="request-access">
      <div className="marketing-shell marketing-request-grid">
        <div><div className="marketing-kicker">{intent === "demo" ? "Book a product walkthrough" : "Request beta access"}</div><h2>{intent === "demo" ? "Bring us your hardest retrieval failure." : "Help define trustworthy retrieval."}</h2><p>Access is reviewed individually. Submitting this form does not create an account or enable Google Drive access.</p><div className="marketing-intent-switch" aria-label="Request type"><button className={intent === "beta" ? "active" : ""} onClick={() => setIntent("beta")}>Beta access</button><button className={intent === "demo" ? "active" : ""} onClick={() => setIntent("demo")}>Book a demo</button></div></div>
        {status === "success" ? <div className="marketing-success" role="status"><span>Request received</span><h3>Thank you.</h3><p>{message}</p><button onClick={() => { setStatus("idle"); setStartedAt(Date.now()); }}>Submit another request</button></div> : <form className="marketing-form" onSubmit={submit} aria-describedby="request-privacy">
          <div className="marketing-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <div className="marketing-form-row"><label>Full name<input name="fullName" autoComplete="name" maxLength={120} required /></label><label>Work email<input name="email" type="email" autoComplete="email" maxLength={320} required /></label></div>
          <div className="marketing-form-row"><label>Company<input name="company" autoComplete="organization" maxLength={160} required /></label><label>Job title<input name="jobTitle" autoComplete="organization-title" maxLength={160} required /></label></div>
          <label>Company size<select name="companySize" required defaultValue=""><option value="" disabled>Select size</option><option>1-10</option><option>11-50</option><option>51-200</option><option>201-1000</option><option>1001+</option></select></label>
          <fieldset><legend>Current knowledge tools</legend><div className="marketing-checks">{tools.map(tool => <label key={tool}><input type="checkbox" name="knowledgeTools" value={tool} />{tool}</label>)}</div></fieldset>
          <div className="marketing-form-row"><label>Do you use or build internal AI agents?<select name="usesAiAgents" required defaultValue=""><option value="" disabled>Select one</option><option value="yes">Yes</option><option value="no">No</option></select></label><label>Willing to test with a limited, non-sensitive folder?<select name="willingLimitedFolder" required defaultValue=""><option value="" disabled>Select one</option><option value="yes">Yes</option><option value="no">Not currently</option></select></label></div>
          <label>What retrieval or knowledge problem are you trying to solve?<textarea name="knowledgeProblem" minLength={20} maxLength={2500} required /></label>
          {status === "error" && <p className="marketing-form-error" role="alert">{message}</p>}
          <p id="request-privacy" className="marketing-form-privacy">Stored securely for beta evaluation. Never include credentials, document contents, or confidential information.</p>
          <button className="marketing-primary" disabled={status === "submitting"}>{status === "submitting" ? "Submitting…" : intent === "demo" ? "Request a demo →" : "Request beta access →"}</button>
        </form>}
      </div>
    </section>

    <footer className="marketing-footer marketing-shell"><div><a className="marketing-brand" href="#top"><span>F</span>Find Anything</a><p>Trusted knowledge for AI agents. Private beta.</p></div><nav aria-label="Legal and trust"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/trust">Security</a><a href="mailto:security@findanything.dev">Security contact</a><a href="mailto:hello@findanything.dev">Contact</a></nav></footer>
  </main>;
}
