const legend = [
  ["input", "Input"],
  ["ai_extract", "AI operation"],
  ["lookup", "Deterministic"],
  ["condition", "Decision"],
  ["approval", "Approval"],
  ["human_review", "Human review"],
] as const;

export function WorkflowLegend() {
  return (
    <div className="workflow-legend">
      <span className="mono-label">Node legend</span>
      <div>
        {legend.map(([type, label]) => (
          <span key={type}>
            <i className={`legend-dot legend-${type}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
