import { Handle, Position } from "@xyflow/react";

type WorkflowNodeData = {
  label: string;
  type: string;
  description: string;
  selected?: boolean;
  confidence?: number;
  evidenceIds?: string[];
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
  return (
    <div
      className={`flow-node flow-node-${data.type}${data.selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <span className="flow-node-type">
        {typeLabels[data.type] ?? data.type}
      </span>
      <strong>{data.label}</strong>
      <small>{data.description}</small>
      <small className="flow-node-confidence">
        confidence {Math.round((data.confidence ?? 0) * 100)}% · evidence{" "}
        {(data.evidenceIds ?? []).length}
      </small>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}
