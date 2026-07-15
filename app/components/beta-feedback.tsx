"use client";
import { FormEvent, useState } from "react";

export function BetaFeedback({ workspaceId, query = "", traceId = null, resultIds = [] }: { workspaceId: string; query?: string; traceId?: string | null; resultIds?: string[] }) {
  const [open, setOpen] = useState(false), [category, setCategory] = useState("missing_file"), [comment, setComment] = useState(""), [status, setStatus] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("Sending…");
    const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, category, query, traceId, resultIds, comment }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setStatus(body.error?.message ?? "Feedback could not be sent.");
    else { setStatus("Thank you — feedback received."); setComment(""); }
  }
  return <div className="feedback-panel"><button onClick={() => setOpen(!open)}>{open ? "Close feedback" : "Share feedback"}</button>{open && <form onSubmit={submit}><label>What happened? <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="missing_file">Missing file</option><option value="wrong_result">Wrong result</option><option value="missing_match">Missing match</option><option value="bad_ranking">Bad ranking</option><option value="confusing_evidence">Confusing evidence</option><option value="permission_concern">Permission concern</option><option value="other">Other issue</option></select></label><label>Tell us what you expected<textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} required /></label><button className="button" type="submit">Send feedback</button>{status && <p role="status">{status}</p>}<small>The report includes workspace, query, trace, and result IDs—not tokens or document contents.</small></form>}</div>;
}
