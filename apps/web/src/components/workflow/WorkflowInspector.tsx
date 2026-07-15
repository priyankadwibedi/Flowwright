import type { WorkflowIR, WorkflowStep } from "@flowwright/workflow-schema";

export function WorkflowInspector({
  workflow,
  step,
}: {
  workflow: WorkflowIR | null;
  step: WorkflowStep | null;
}) {
  if (!workflow || !step)
    return (
      <div className="workflow-inspector empty">
        <span className="mono-label">Selected step</span>
        <p>Select a node to inspect its contract.</p>
      </div>
    );
  return (
    <div className="workflow-inspector">
      <span className="mono-label">Selected step</span>
      <h3>{step.name}</h3>
      <p>{step.description}</p>
      <div className="inspector-grid">
        <div>
          <span>Type</span>
          <b>{step.type.replace("_", " ")}</b>
        </div>
        <div>
          <span>Confidence</span>
          <b>{Math.round(workflow.confidence * 100)}%</b>
        </div>
        <div>
          <span>AI required</span>
          <b>{step.requires_ai ? "Yes" : "No"}</b>
        </div>
        <div>
          <span>Approval</span>
          <b>{step.requires_approval ? "Required" : "None"}</b>
        </div>
      </div>
      <div className="inspector-refs">
        <span>Inputs</span>
        <p>
          {step.input_refs.length
            ? step.input_refs.join(", ")
            : "Workflow context"}
        </p>
        <span>Outputs</span>
        <p>
          {step.output_refs.length
            ? step.output_refs.join(", ")
            : "No persisted output"}
        </p>
      </div>
    </div>
  );
}
