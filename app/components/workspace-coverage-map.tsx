"use client";
import { useEffect, useState } from "react";
import type { CoverageSnapshot } from "@/lib/workspace-search/coverage-map";

export function WorkspaceCoverageMap({ workspaceId }: { workspaceId: string }) {
  const [coverage, setCoverage] = useState<CoverageSnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/coverage`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject())
      .then((value) => { if (active) setCoverage(value.snapshot ?? value); })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [workspaceId]);
  if (unavailable) return <p className="coverage-warning" role="alert">Coverage could not be verified right now. Search continues to fail closed when permissions cannot be checked.</p>;
  if (!coverage) return <div className="search-loading" role="status"><span className="spinner" aria-hidden="true"/>Checking observable coverage…</div>;
  const percent = (value: number | null) => value === null ? "Not observed" : `${Math.round(value * 100)}%`;
  return (
    <div className="coverage-card layer-panel">
      <div className="coverage-head"><div><b>Workspace coverage</b><span className="coverage-status">{coverage.status.replace("_", " ")}</span></div><span>{coverage.version}</span></div>
      <p>Calculated only from the connected inventory Find Anything can observe. Indexing, permissions, and known-source coverage are reported separately.</p>
      <div className="coverage-metrics">
        <span><b>{percent(coverage.metrics.knownSourceCoverage)}</b>Known-source coverage</span>
        <span><b>{percent(coverage.metrics.indexingSuccess)}</b>Indexing success</span>
        <span><b>{percent(coverage.metrics.permissionAccessibility)}</b>Permission accessibility</span>
        <span><b>{coverage.counts.failed}</b>Failed</span>
        <span><b>{coverage.freshness.status}</b>Freshness</span>
      </div>
      <details>
        <summary>How coverage was calculated</summary>
        <div className="definition-grid">
          <p><b>Known source</b>{coverage.counts.knownInventoryRows} stored of {coverage.counts.authorizedDiscovered} currently authorized.</p>
          <p><b>Indexing</b>{coverage.counts.indexed} succeeded of {coverage.counts.indexed + coverage.counts.failed} terminal supported files.</p>
          <p><b>Permissions</b>{coverage.counts.authorizedDiscovered} currently accessible; {coverage.counts.knownRemovedOrUnauthorized} previously known and unavailable.</p>
          <p><b>Incomplete</b>{coverage.counts.pending} pending · {coverage.counts.unsupported} unsupported · pagination {coverage.paginationComplete ? "complete" : "partial"}.</p>
          <p><b>Freshness</b>{coverage.freshness.lastSuccessfulSyncAt ? new Date(coverage.freshness.lastSuccessfulSyncAt).toLocaleString() : "No successful sync observed"}.</p>
        </div>
        {coverage.incompleteReasons.length > 0 && <p className="coverage-warning" role="alert">{coverage.incompleteReasons.join(" ")}</p>}
        <p className="coverage-limitations">{coverage.limitations.join(" ")}</p>
      </details>
    </div>
  );
}
