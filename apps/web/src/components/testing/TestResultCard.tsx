import type { WorkflowTest } from "@flowwright/workflow-schema";

export function TestResultCard({
  result,
  index,
}: {
  result: WorkflowTest & { duration?: string; confidence?: string };
  index: number;
}) {
  const statusLabel = result.status.replace("_", " ");
  const evidence = result.input_case.invoice_file
    ? `Input fixture: ${String(result.input_case.invoice_file)}`
    : "Synthetic input fixture";
  return (
    <article className={`test-result-card status-card-${result.status}`}>
      <div className="test-card-top">
        <span className="test-index">0{index + 1}</span>
        <span className={`status-badge ${result.status}`}>{statusLabel}</span>
      </div>
      <h2>{result.name}</h2>
      <div className="result-outcomes">
        <div>
          <span className="mono-label">Expected</span>
          <strong>{result.expected_outcome}</strong>
        </div>
        <div>
          <span className="mono-label">Actual</span>
          <strong>{result.actual_outcome ?? "pending"}</strong>
        </div>
      </div>
      <p className="result-explanation">{result.explanation}</p>
      <div className="result-evidence">
        <span>{evidence}</span>
        <span>{result.duration ?? "deterministic"}</span>
        <span>{result.confidence ?? "schema validated"}</span>
      </div>
    </article>
  );
}
