"use client";

import { useEffect, useMemo, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { API_URL } from "../../../lib/config";
import { AnnouncementBar } from "../../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../../components/marketing/MarketingHeader";
import { WorkflowCanvas } from "../../../components/workflow/WorkflowCanvas";
import { WorkflowInspector } from "../../../components/workflow/WorkflowInspector";
import { WorkflowLegend } from "../../../components/workflow/WorkflowLegend";

export default function DemoWorkflowPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const storedWorkflow = window.sessionStorage.getItem("flowwright.workflow");
    if (storedWorkflow) {
      try {
        const parsed = workflowIRSchema.parse(JSON.parse(storedWorkflow));
        setWorkflow(parsed);
        setSelectedId(parsed.steps[0]?.id ?? null);
        return;
      } catch {
        window.sessionStorage.removeItem("flowwright.workflow");
      }
    }
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
          reason instanceof Error ? reason.message : "Unable to load workflow",
        ),
      );
  }, []);
  const selectedStep = useMemo(
    () => workflow?.steps.find((step) => step.id === selectedId) ?? null,
    [workflow, selectedId],
  );
  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="workflow-page content-width">
        <div className="workflow-heading">
          <div>
            <div className="eyebrow">Compiled workflow / invoice approval</div>
            <h1>{workflow?.name ?? "Loading workflow"}</h1>
            <p>
              {workflow?.description ??
                "Validating the workflow contract before rendering the graph."}
            </p>
          </div>
          <div className="workflow-confidence">
            <span className="mono-label">Confidence</span>
            <strong>
              {workflow ? `${Math.round(workflow.confidence * 100)}%` : "—"}
            </strong>
          </div>
        </div>
        {error && (
          <div className="notice notice-error">
            {error}. Start the FastAPI backend or use the mocked frontend test.
          </div>
        )}
        {workflow && (
          <>
            <div className="workflow-meta">
              <div>
                <span className="mono-label">Variables</span>
                <strong>
                  {workflow.variables
                    .filter((variable) => !variable.constant)
                    .map((variable) => variable.name)
                    .join(", ")}
                </strong>
              </div>
              <div>
                <span className="mono-label">Decision rules</span>
                <strong>{workflow.decisions.length}</strong>
              </div>
              <div>
                <span className="mono-label">Required approvals</span>
                <strong>{workflow.approvals.length}</strong>
              </div>
            </div>
            <div className="workflow-layout">
              <div>
                <WorkflowCanvas
                  workflow={workflow}
                  selectedStepId={selectedId}
                  onSelectStep={setSelectedId}
                />
              </div>
              <aside className="workflow-side">
                <WorkflowInspector workflow={workflow} step={selectedStep} />
                <WorkflowLegend />
              </aside>
            </div>
            <section className="workflow-decisions">
              <div className="eyebrow">Decision rules</div>
              <div className="decision-grid">
                {workflow.decisions.map((decision) => (
                  <article key={decision.id}>
                    <span className="mono-label">{decision.name}</span>
                    <p>{decision.condition}</p>
                    <div>
                      <span>True → {decision.true_step_id}</span>
                      <span>False → {decision.false_step_id}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <details className="raw-json">
              <summary>Raw WorkflowIR JSON</summary>
              <pre>{JSON.stringify(workflow, null, 2)}</pre>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
