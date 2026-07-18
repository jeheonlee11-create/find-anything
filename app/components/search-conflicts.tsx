"use client";
import { useState } from "react";
import type { WorkspaceSearchResponse } from "@/lib/workspace-search/core";
export function SearchConflicts({ workspaceId, initial }: { workspaceId: string; initial: WorkspaceSearchResponse["conflicts"] }) {
  const [items, setItems] = useState(initial), [error, setError] = useState("");
  if (!items.length) return null;
  async function decide(id: string, status: "authoritative_source" | "expected_difference" | "resolved" | "false_positive", authoritativeFileId?: string) {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/conflicts`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ conflictId: id, status, authoritativeFileId }) });
    if (!response.ok) { setError("The conflict decision could not be saved."); return; }
    setItems((old) => old.map((item) => item.id === id ? { ...item, status } : item));
  }
  const unresolved = items.filter((item) => item.status === "unresolved").length;
  return <section className="conflict-panel" aria-label="Detected conflicts">
    <div><b>{items.length} deterministic conflict{items.length === 1 ? "" : "s"} detected · {unresolved} unresolved</b><p>Find Anything never hides conflicting evidence. Review both detected values and the stored source decision.</p></div>
    {error && <p role="alert">{error}</p>}
    {items.map((item) => <details key={item.id}>
      <summary>{item.conflictType.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</summary>
      <p><b>Detection:</b> {item.detectionMethod}</p><p><b>Detected values:</b> “{formatConflictValue(item.leftValue)}” versus “{formatConflictValue(item.rightValue)}”</p><p><b>Relationship inference:</b> {item.relationshipInference}</p>
      <div className="conflict-evidence"><article><b>{item.leftCitation.fileName ?? "Source A"}</b><blockquote>{item.leftCitation.excerpt}</blockquote>{item.leftCitation.sourceUrl && <a href={item.leftCitation.sourceUrl} target="_blank" rel="noreferrer">Open source A ↗</a>}</article><article><b>{item.rightCitation.fileName ?? "Source B"}</b><blockquote>{item.rightCitation.excerpt}</blockquote>{item.rightCitation.sourceUrl && <a href={item.rightCitation.sourceUrl} target="_blank" rel="noreferrer">Open source B ↗</a>}</article></div>
      <div className="conflict-actions"><button onClick={() => void decide(item.id, "authoritative_source", item.leftFileId)}>Source A is authoritative</button><button onClick={() => void decide(item.id, "authoritative_source", item.rightFileId)}>Source B is authoritative</button><button onClick={() => void decide(item.id, "expected_difference")}>Expected difference</button><button onClick={() => void decide(item.id, "resolved")}>Mark resolved</button><button onClick={() => void decide(item.id, "false_positive")}>False positive</button></div>
    </details>)}
  </section>;
}
function formatConflictValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return String(value);
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key.replaceAll("_", " ")}: ${typeof item === "number" ? item.toLocaleString("en-US") : String(item)}`)
    .join(" · ");
}
