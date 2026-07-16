import type { TestExecution } from "../../lib/validation";
import { ReadinessIndicator } from "./ReadinessIndicator";

export function TestSummary({ results }: { results: TestExecution[] }) {
  const passed = results.filter((result) => result.status === "passed").length;
  const review = results.filter(
    (result) => result.status === "human_review",
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;
  return (
    <div className="test-summary">
      <div className="summary-stat">
        <span className="mono-label">Total tests</span>
        <strong>{results.length}</strong>
        <small>synthetic cases</small>
      </div>
      <div className="summary-stat success">
        <span className="mono-label">Passed</span>
        <strong>{passed}</strong>
        <small>deterministic matches</small>
      </div>
      <div className="summary-stat review">
        <span className="mono-label">Human review</span>
        <strong>{review}</strong>
        <small>safe exception paths</small>
      </div>
      <div className="summary-stat failure">
        <span className="mono-label">Failed</span>
        <strong>{failed}</strong>
        <small>blocked outcomes</small>
      </div>
      <ReadinessIndicator passed={passed} review={review} failed={failed} />
    </div>
  );
}
