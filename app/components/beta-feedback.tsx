"use client";
import { FormEvent, useState } from "react";

export function BetaFeedback({ workspaceId, query = "", searchMode = "best", traceId = null, receiptId = null, resultIds = [], prompted = false }: { workspaceId: string; query?: string; searchMode?: string; traceId?: string | null; receiptId?: string | null; resultIds?: string[]; prompted?: boolean }) {
  const [open, setOpen] = useState(false), [category, setCategory] = useState("missing_file"), [comment, setComment] = useState(""), [status, setStatus] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("Sending…");
    const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, category, query, searchMode, traceId, receiptId, resultIds, comment, includeEvidenceExcerpt: false }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setStatus(body.error?.message ?? "We could not send that yet. Please try again.");
    else { setStatus("Thank you — your feedback was saved."); setComment(""); setOpen(false); }
  }
  function answer(value: "found_what_needed" | "did_not_find") { setCategory(value); setOpen(true); }
  return <div className={`feedback-panel ${prompted ? "feedback-prompt" : ""}`}>
    {prompted && <div><b>Did you find what you needed?</b><p>Help us improve search. We never include document contents in feedback.</p><button onClick={() => answer("found_what_needed")}>Yes</button><button onClick={() => answer("did_not_find")}>Not yet</button></div>}
    {!prompted && <button onClick={() => setOpen(!open)}>{open ? "Close feedback" : "Share feedback"}</button>}
    {open && <form onSubmit={submit}>
      <label>What happened? <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="found_what_needed">Found what I needed</option><option value="did_not_find">Did not find it</option><option value="missing_file">Missing file</option><option value="missing_match">Missing match</option><option value="incorrect_match">Wrong result</option><option value="poor_ranking">Bad ranking</option><option value="incorrect_evidence">Confusing evidence</option><option value="permission_concern">Permission concern</option><option value="indexing_problem">Indexing problem</option><option value="other">Other issue</option></select></label>
      <label>What were you trying to find?<textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} required placeholder="A short description is enough. Please do not paste private document text." /></label>
      <div><button className="button" type="submit">Send feedback</button><button type="button" onClick={() => setOpen(false)}>Cancel</button></div>{status && <p role="status">{status}</p>}
      <small>The report includes the search and trace IDs, but no tokens, secrets, or document contents.</small>
    </form>}
  </div>;
}
