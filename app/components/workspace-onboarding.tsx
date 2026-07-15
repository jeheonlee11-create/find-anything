/* eslint-disable react-hooks/set-state-in-effect -- loading state follows API requests */
"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Workspace = { id: string; name: string; role: string; createdAt: string };

export function WorkspaceOnboarding({ onboardingComplete }: { onboardingComplete: boolean }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(onboardingComplete);
  const [consent, setConsent] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/workspaces", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.message ?? "Workspaces could not be loaded.");
    else setWorkspaces(body.workspaces);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function finishOnboarding() {
    setError("");
    const response = await fetch("/api/beta/onboarding", { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error?.message ?? "Onboarding could not be completed.");
      return;
    }
    setReady(true);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.message ?? "Workspace could not be created."); return; }
    router.push(`/app/workspaces/${body.workspace.id}`);
  }

  return <>
    {!ready && <section className="content-section onboarding-card">
      <span className="page-badge">Private beta · 2 minute setup</span>
      <h2>Find exact evidence in your Google Drive.</h2>
      <p>Find Anything requests read-only access. It inventories only files your connected Google account can access, extracts searchable structure, and never edits or deletes Drive files.</p>
      <div className="trust-grid">
        <article><h3>Structured extraction</h3><p>Preserves locations such as document paragraphs, sheet cells, and slide numbers.</p></article>
        <article><h3>Evidence</h3><p>Shows the exact matched excerpt and a source link back to Drive.</p></article>
        <article><h3>Traces and receipts</h3><p>Explain what was searched, why results ranked, and how complete the answer is.</p></article>
      </div>
      <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I understand Drive access is read-only and I can disconnect at any time.</label>
      <p><button className="button" disabled={!consent} onClick={finishOnboarding}>Continue to my workspace →</button></p>
    </section>}
    {ready && <section className="content-section"><h2>1 · Create or choose a workspace</h2><p>Create a workspace, connect Drive, click Index now, then search for a phrase you remember.</p><form className="workspace-form" onSubmit={create}><label htmlFor="workspace-name">Workspace name</label><div><input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} placeholder="My research" required/><button className="button" type="submit">Create workspace →</button></div></form></section>}
    {error && <p className="disclosure" role="alert">{error}</p>}
    {ready && <section className="content-section"><h2>Your workspaces</h2>{loading ? <p>Loading workspaces…</p> : workspaces.length ? <div className="workspace-list">{workspaces.map((workspace) => <button key={workspace.id} onClick={() => router.push(`/app/workspaces/${workspace.id}`)}><span><b>{workspace.name}</b><small>{workspace.id}</small></span><em>{workspace.role}</em></button>)}</div> : <p>No workspaces yet. Create the first one above.</p>}</section>}
  </>;
}
