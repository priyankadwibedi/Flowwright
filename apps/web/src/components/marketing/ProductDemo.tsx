"use client";

import { useEffect, useMemo, useState } from "react";
import {
  workflowIRSchema,
  type WorkflowIR,
  type WorkflowStep,
} from "@flowwright/workflow-schema";
import { API_URL } from "../../lib/config";
import { WorkflowCanvas } from "../workflow/WorkflowCanvas";
import { WorkflowInspector } from "../workflow/WorkflowInspector";
import { WorkflowLegend } from "../workflow/WorkflowLegend";

export function ProductDemo() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v1/workflows/demo`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Workflow request failed (${response.status})`);
        return workflowIRSchema.parse(await response.json());
      })
      .then((value) => {
        setWorkflow(value);
        setSelectedId(value.steps[0]?.id ?? null);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load demo",
        ),
      );
  }, []);
  const selectedStep = useMemo<WorkflowStep | null>(
    () => workflow?.steps.find((step) => step.id === selectedId) ?? null,
    [workflow, selectedId],
  );
  return (
    <section className="demo-section" id="demo">
      <div className="content-width">
        <div className="demo-heading">
          <div>
            <div className="eyebrow">Interactive invoice demo</div>
            <h2>See a process become a program.</h2>
          </div>
          <p>
            Real WorkflowIR data, rendered as an inspectable graph. Select a
            step to see its inputs, outputs, confidence, and safety boundary.
          </p>
        </div>
        <div className="demo-layout">
          <aside className="demo-sidebar">
            <div className="demo-input">
              <span className="mono-label">Example input</span>
              <strong>invoice_042.pdf</strong>
              <small>Supplier · total · purchase order</small>
            </div>
            <div className="demo-status">
              <span className="status-dot" />{" "}
              <span>
                <b>
                  {workflow
                    ? "Workflow compiled"
                    : error
                      ? "Demo unavailable"
                      : "Loading workflow"}
                </b>
                <small>
                  {error ?? "Validated against the WorkflowIR schema"}
                </small>
              </span>
            </div>
            <WorkflowInspector workflow={workflow} step={selectedStep} />
            <WorkflowLegend />
          </aside>
          <div className="demo-canvas">
            <WorkflowCanvas
              workflow={workflow}
              selectedStepId={selectedId}
              onSelectStep={setSelectedId}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
