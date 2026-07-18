import { Handle, Position } from "@xyflow/react";
import type { WorkflowOrigin } from "../../lib/workflowSession";

type WorkflowNodeData = {
  label: string;
  type: string;
  description: string;
  selected?: boolean;
  confidence?: number;
  evidenceIds?: string[];
  origin?: WorkflowOrigin;
  observed?: boolean;
};

const typeLabels: Record<string, string> = {
  input: "INPUT",
  ai_extract: "AI EXTRACT",
  lookup: "LOOKUP",
  condition: "CONDITION",
  transform: "TRANSFORM",
  write: "WRITE",
  draft: "DRAFT",
  approval: "APPROVAL",
  human_review: "HUMAN REVIEW",
};

export function WorkflowNode({ data }: { data: WorkflowNodeData }) {
  const meta =
    data.origin === "sample"
      ? "Sample definition"
      : data.observed
        ? "Observed"
        : `confidence ${Math.round((data.confidence ?? 0) * 100)}% · evidence ${(data.evidenceIds ?? []).length}`;

  return (
    <div
      className={`flow-node flow-node-${data.type}${data.selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <span className="flow-node-type">
        {typeLabels[data.type] ?? data.type}
      </span>
      <strong>{data.label}</strong>
      <small>{data.description}</small>
      <small className="flow-node-confidence">{meta}</small>
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}
