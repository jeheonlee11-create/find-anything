"use client";
import { FormEvent, useState } from "react";

export function BetaFeedback({ workspaceId, query = "", searchMode = "best", traceId = null, receiptId = null, resultIds = [] }: { workspaceId: string; query?: string; searchMode?: string; traceId?: string | null; receiptId?: string | null; resultIds?: string[] }) {
  const [open, setOpen] = useState(false), [category, setCategory] = useState("missing_file"), [comment, setComment] = useState(""), [status, setStatus] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("Sending…");
    const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, category, query, searchMode, traceId, receiptId, resultIds, comment, includeEvidenceExcerpt: false }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setStatus(body.error?.message ?? "Feedback could not be sent.");
    else { setStatus("Thank you — feedback received."); setComment(""); }
  }
  return <div className="feedback-panel"><button onClick={() => setOpen(!open)}>{open ? "Close feedback" : "Share feedback"}</button>{open && <form onSubmit={submit}><label>What happened? <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="missing_file">Missing file</option><option value="missing_match">Missing match</option><option value="incorrect_match">Incorrect match</option><option value="poor_ranking">Poor ranking</option><option value="incorrect_evidence">Incorrect evidence</option><option value="confusing_interface">Confusing interface</option><option value="permission_concern">Permission concern</option><option value="indexing_problem">Indexing problem</option><option value="performance_problem">Performance problem</option><option value="other">Other issue</option></select></label><label>Tell us what you expected<textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} required /></label><button className="button" type="submit">Send feedback</button>{status && <p role="status">{status}</p>}<small>The report includes workspace, query, mode, trace, receipt, and result IDs—not tokens or document contents. Evidence excerpts are not included.</small></form>}</div>;
}
