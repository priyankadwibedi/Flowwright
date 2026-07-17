"use client";

import type { WorkflowIR, WorkflowStep } from "@flowwright/workflow-schema";
import type { ProcessedDemonstration } from "../../lib/validation";
import { resolveFrameImage } from "../../lib/evidenceStore";

export function WorkflowInspector({
  workflow,
  step,
  evidence,
  onCorrect,
}: {
  workflow: WorkflowIR | null;
  step: WorkflowStep | null;
  evidence?: ProcessedDemonstration | null;
  onCorrect?: (action: string) => void;
}) {
  if (!workflow || !step)
    return (
      <div className="workflow-inspector empty">
        <span className="mono-label">Selected step</span>
        <p>Select a node to inspect its contract.</p>
      </div>
    );

  const supporting = (evidence?.evidence_timeline ?? []).filter((item) =>
    step.evidence_ids.includes(item.id),
  );
  const frameSrc =
    supporting.find((item) => item.source === "frame")?.frame_id ||
    supporting.find((item) => item.frame_id)?.frame_id;
  const image =
    evidence && frameSrc ? resolveFrameImage(evidence, frameSrc) : null;

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
          <b>{Math.round(step.confidence * 100)}%</b>
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
        <span>Evidence</span>
        {supporting.length === 0 ? (
          <p>No linked evidence for this step.</p>
        ) : (
          <ul className="provenance-list">
            {supporting.map((item) => (
              <li key={item.id}>
                <b>{item.source}</b> @ {item.timestamp_seconds.toFixed(1)}s ·{" "}
                {item.observation_kind} · conf{" "}
                {Math.round((item.confidence ?? 1) * 100)}%
                <p>{item.content}</p>
              </li>
            ))}
          </ul>
        )}
        {image && (
          <figure className="inspector-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Supporting demonstration frame" />
          </figure>
        )}
      </div>
      {onCorrect && (
        <div className="button-row">
          <button
            className="button button-outline"
            onClick={() => onCorrect("accidental")}
          >
            Mark accidental
          </button>
          <button
            className="button button-outline"
            onClick={() => onCorrect("rename")}
          >
            Rename step
          </button>
          <button
            className="button button-outline"
            onClick={() => onCorrect("approval")}
          >
            Require approval
          </button>
        </div>
      )}
    </div>
  );
}
