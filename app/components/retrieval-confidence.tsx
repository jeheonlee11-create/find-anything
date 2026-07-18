import type { RetrievalConfidence } from "@/lib/workspace-search/confidence";

export function RetrievalConfidencePanel({
  confidence,
}: {
  confidence: RetrievalConfidence;
}) {
  return (
    <section className="retrieval-confidence" aria-labelledby="retrieval-confidence-title">
      <div className="retrieval-confidence-head">
        <div>
          <small>Evidence-quality assessment</small>
          <h3 id="retrieval-confidence-title">{confidence.label}</h3>
          <p>{confidence.disclosure}</p>
        </div>
        <strong aria-label={`Retrieval confidence score ${confidence.score} out of 100`}>
          {confidence.score}<span>/100</span>
        </strong>
      </div>
      <div className="confidence-factor-summary">
        {confidence.factors.slice(0, 4).map((factor) => (
          <span key={factor.key} data-status={factor.status}>
            <b>{factor.points}/{factor.maxPoints}</b>
            {factor.label}
          </span>
        ))}
      </div>
      <details>
        <summary>How this score was calculated</summary>
        <div className="confidence-factor-list">
          {confidence.factors.map((factor) => (
            <article key={factor.key} data-status={factor.status}>
              <div><b>{factor.label}</b><span>{factor.status === "unknown" ? "Not measured" : `${factor.points} / ${factor.maxPoints}`}</span></div>
              <p>{factor.explanation}</p>
            </article>
          ))}
        </div>
        <p className="confidence-version">Scoring {confidence.scoringVersion} · configuration {confidence.configurationVersion}</p>
      </details>
    </section>
  );
}
