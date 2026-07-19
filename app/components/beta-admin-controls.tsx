"use client";
import { FormEvent, useState } from "react";

type Data = {
  accessRequests: { id: string; email: string; fullName: string; company: string; jobTitle: string; companySize: string; knowledgeTools: string[]; usesAiAgents: boolean; knowledgeProblem: string; willingLimitedFolder: boolean; intent: string; status: string; createdAt: string }[];
  users: { actorId: string; status: string; role: string; activatedAt: string; onboardingCompletedAt: string | null }[];
  feedback: { id: string; category: string; comment: string; status: string; createdAt: string }[];
  metrics: Record<string, number>;
  connectors: { id: string; workspaceId: string; status: string; lastSyncAt: string | null; lastErrorCode: string | null }[];
  jobs: { id: string; workspaceId: string; status: string; processedCount: number; discoveredCount: number; failedCount: number; lastErrorCode: string | null; deploymentVersion: string }[];
  failures: { category: string; retryable: boolean; count: number }[];
};

export function BetaAdminControls({ initialData }: { initialData: Data }) {
  const [data, setData] = useState(initialData), [email, setEmail] = useState(""), [message, setMessage] = useState("");
  async function reload() { const response = await fetch("/api/internal/beta", { cache: "no-store" }); if (response.ok) setData(await response.json()); }
  async function seedDemo() {
    if (!confirm("Create only ws_yc_demo_acme with the synthetic Acme AI fixture?")) return;
    const response = await fetch("/api/internal/acme-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmWorkspaceId: "ws_yc_demo_acme" }) }), body = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Acme AI demo ready: ${body.indexed} indexed, ${body.inaccessible} inaccessible.` : body.error?.message ?? "Demo seed failed.");
    await reload();
  }
  async function invite(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/internal/beta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }), body = await response.json().catch(() => ({})); setMessage(response.ok ? "Invitation approved. Send the tester your private site link." : body.error?.message ?? "Invite failed."); if (response.ok) setEmail(""); await reload(); }
  async function status(actorId: string, value: "active" | "disabled") { await fetch("/api/internal/beta", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ actorId, status: value }) }); await reload(); }
  async function jobAction(jobId: string, action: "retry" | "cancel" | "request_reauthorization") { await fetch("/api/internal/beta", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, action }) }); await reload(); }
  return <>
    <section className="content-section"><h2>Controlled Acme AI demo</h2><p>Creates only the dedicated <code>ws_yc_demo_acme</code> workspace. It does not reset or inspect any other workspace.</p><button className="button" onClick={seedDemo}>Seed Acme AI demo</button>{message && <p role="status">{message}</p>}</section>
    <section className="content-section"><h2>Access requests</h2>{data.accessRequests.length ? <div className="indexed-files">{data.accessRequests.map((request) => <article key={request.id}><div><b>{request.fullName} · {request.company}</b><small>{request.email} · {request.jobTitle} · {request.companySize}</small><small>{request.intent} · {request.status} · {new Date(request.createdAt).toLocaleString()}</small><p>{request.knowledgeProblem}</p><small>Tools: {request.knowledgeTools.join(", ")} · AI agents: {request.usesAiAgents ? "yes" : "no"} · Limited folder: {request.willingLimitedFolder ? "yes" : "no"}</small></div></article>)}</div> : <p>No access requests submitted.</p>}</section>
    <section className="content-section"><h2>Invite tester</h2><form className="workspace-form" onSubmit={invite}><label htmlFor="invite-email">ChatGPT account email</label><div><input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/><button className="button">Approve invite</button></div></form></section>
    <section className="content-section"><h2>Aggregate usage</h2><div className="trust-grid">{Object.entries(data.metrics).map(([event, count]) => <article key={event}><h3>{event.replaceAll("_", " ")}</h3><strong>{count}</strong></article>)}</div></section>
    <section className="content-section"><h2>Connector and job health</h2><div className="trust-grid"><article><h3>Connectors</h3><strong>{data.connectors.length}</strong></article><article><h3>Active jobs</h3><strong>{data.jobs.filter((job) => ["queued", "running", "stale"].includes(job.status)).length}</strong></article><article><h3>Unresolved failures</h3><strong>{data.failures.reduce((total, item) => total + item.count, 0)}</strong></article></div><div className="indexed-files">{data.jobs.slice(0, 20).map((job) => <article key={job.id}><div><b>{job.status} · {job.processedCount}/{job.discoveredCount || "?"}</b><small>{job.workspaceId} · deployment {job.deploymentVersion}</small>{job.lastErrorCode && <small>{job.lastErrorCode}</small>}</div><div><button onClick={() => jobAction(job.id, "retry")}>Retry</button><button onClick={() => jobAction(job.id, "cancel")}>Cancel</button><button onClick={() => jobAction(job.id, "request_reauthorization")}>Require reconnect</button></div></article>)}</div></section>
    <section className="content-section"><h2>Beta accounts</h2><div className="indexed-files">{data.users.map((user) => <article key={user.actorId}><div><b>{user.role} · {user.status}</b><small>{user.actorId}</small><small>Activated {new Date(user.activatedAt).toLocaleString()}</small></div><button onClick={() => status(user.actorId, user.status === "active" ? "disabled" : "active")}>{user.status === "active" ? "Disable" : "Enable"}</button></article>)}</div></section>
    <section className="content-section"><h2>Feedback</h2>{data.feedback.length ? <div className="indexed-files">{data.feedback.map((item) => <article key={item.id}><div><b>{item.category.replaceAll("_", " ")}</b><p>{item.comment}</p><small>{item.status} · {new Date(item.createdAt).toLocaleString()}</small></div></article>)}</div> : <p>No feedback submitted.</p>}</section>
  </>;
}
