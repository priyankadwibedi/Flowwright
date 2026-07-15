export function ReadinessIndicator({
  passed,
  review,
  failed,
}: {
  passed: number;
  review: number;
  failed: number;
}) {
  const ready = failed === 0 && passed > 0;
  return (
    <div className={`readiness-indicator ${ready ? "is-ready" : "is-review"}`}>
      <span className="readiness-icon">{ready ? "✓" : "!"}</span>
      <div>
        <span className="mono-label">Workflow readiness</span>
        <strong>{ready ? "Ready for human review" : "Needs attention"}</strong>
        <small>
          {failed
            ? `${failed} failed case${failed > 1 ? "s" : ""}`
            : review
              ? `${review} human review gate${review > 1 ? "s" : ""}`
              : "All deterministic checks passed"}
        </small>
      </div>
    </div>
  );
}
