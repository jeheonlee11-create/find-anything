"use client";
import { useEffect, useState } from "react";
export function AuditViewer({
  kind,
  id,
}: {
  kind: "receipt" | "trace";
  id: string;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState("");
  const path =
    kind === "receipt"
      ? `/api/search-receipts/${encodeURIComponent(id)}`
      : `/api/retrieval-traces/${encodeURIComponent(id)}`;
  useEffect(() => {
    fetch(path, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message ?? "Audit record unavailable.");
        setData(body);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Audit record unavailable.",
        ),
      );
  }, [path]);
  return (
    <section className="content-section">
      <span className="page-badge">
        {kind === "receipt" ? "Search receipt" : "Developer retrieval trace"}
      </span>
      <h1>{kind === "receipt" ? "Search receipt" : "Retrieval trace"}</h1>
      <p>
        This record reflects the stored runtime search execution. It is not
        described as immutable or cryptographically signed.
      </p>
      {error && <p className="disclosure">{error}</p>}
      {data && (
        <>
          <div className="trust-grid">
            {Object.entries(data)
              .filter(([key]) =>
                [
                  "totalMatches",
                  "totalReturned",
                  "finalResultCount",
                  "completenessStatus",
                  "searchDurationMs",
                  "correlationId",
                ].includes(key),
              )
              .map(([key, value]) => (
                <article key={key}>
                  <div>
                    <h2>{key.replace(/([A-Z])/g, " $1")}</h2>
                    <span>{String(value)}</span>
                  </div>
                </article>
              ))}
          </div>
          <div className="audit-actions">
            <button onClick={() => navigator.clipboard.writeText(id)}>
              Copy {kind} ID
            </button>
            {kind === "receipt" && (
              <>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(window.location.href)
                  }
                >
                  Copy read-only link
                </button>
                <a href={`${path}?format=json`}>Export JSON</a>
                <a href={`${path}?format=csv`}>Export CSV</a>
              </>
            )}
          </div>
          <details className="citation-preview">
            <summary>Complete stored JSON record</summary>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
