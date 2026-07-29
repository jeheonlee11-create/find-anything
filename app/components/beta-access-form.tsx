"use client";
import { FormEvent, useState } from "react";
const tools = ["Google Drive", "Slack", "Notion", "Microsoft 365", "GitHub", "Jira", "Other"];
export function BetaAccessForm() {
  const [startedAt] = useState(() => Date.now()), [state, setState] = useState<"idle"|"submitting"|"success"|"error">("idle"), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("submitting");
    const form = new FormData(event.currentTarget), response = await fetch("/api/beta/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: form.get("fullName"), email: form.get("email"), company: form.get("company"), jobTitle: form.get("jobTitle"), companySize: form.get("companySize"), knowledgeTools: form.getAll("knowledgeTools"), usesAiAgents: form.get("usesAiAgents") === "yes", knowledgeProblem: form.get("knowledgeProblem"), willingLimitedFolder: form.get("willingLimitedFolder") === "yes", website: form.get("website"), intent: "beta", startedAt }) });
    const result = await response.json().catch(() => ({})) as { submitted?: boolean; saved?: boolean; message?: string; error?: { message?: string } };
    // Success is claimed only when the server confirms persistence with
    // `saved: true` on its 202. A 2xx alone is not enough: the bot-trap branch
    // also answers 202, and an accepted-but-unsaved request must never be shown
    // as stored. Nothing here reports whether this email was already known.
    const saved = response.status === 202 && result.saved === true;
    setMessage(saved ? result.message ?? "Request received." : result.error?.message ?? "We could not confirm your request was saved. Please try again."); setState(saved ? "success" : "error");
  }
  if (state === "success") return <div className="marketing-success" role="status"><h3>Request received.</h3><p>{message}</p></div>;
  return <form className="marketing-form" onSubmit={submit}>
    <div className="marketing-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <div className="marketing-form-row"><label>Full name<input name="fullName" autoComplete="name" required /></label><label>Work email<input name="email" type="email" autoComplete="email" required /></label></div>
    <div className="marketing-form-row"><label>Company<input name="company" autoComplete="organization" required /></label><label>Job title<input name="jobTitle" autoComplete="organization-title" required /></label></div>
    <label>Company size<select name="companySize" required defaultValue=""><option value="" disabled>Select size</option>{["1-10","11-50","51-200","201-1000","1001+"].map(value => <option key={value}>{value}</option>)}</select></label>
    <fieldset><legend>Current knowledge tools</legend><div className="marketing-checks">{tools.map(tool => <label key={tool}><input type="checkbox" name="knowledgeTools" value={tool}/>{tool}</label>)}</div></fieldset>
    <div className="marketing-form-row"><label>Do you use or build internal AI agents?<select name="usesAiAgents" required defaultValue=""><option value="" disabled>Select one</option><option value="yes">Yes</option><option value="no">No</option></select></label><label>Willing to test with a limited, non-sensitive folder?<select name="willingLimitedFolder" required defaultValue=""><option value="" disabled>Select one</option><option value="yes">Yes</option><option value="no">Not currently</option></select></label></div>
    <label>What retrieval or knowledge problem are you trying to solve?<textarea name="knowledgeProblem" minLength={20} maxLength={2500} required /></label>
    {state === "error" && <p className="marketing-form-error" role="alert">{message}</p>}
    <p className="marketing-form-privacy">Do not include credentials, document contents, or confidential information.</p>
    <button className="marketing-primary" disabled={state === "submitting"}>{state === "submitting" ? "Submitting…" : "Request beta access →"}</button>
  </form>;
}
