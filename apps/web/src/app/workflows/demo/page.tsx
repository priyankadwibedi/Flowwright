"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { API_CONFIGURED, API_URL } from "../../../lib/config";
import { sampleWorkflow } from "../../../lib/sampleWorkflow";
import { AnnouncementBar } from "../../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../../components/marketing/MarketingHeader";
import { WorkflowCanvas } from "../../../components/workflow/WorkflowCanvas";
import { WorkflowInspector } from "../../../components/workflow/WorkflowInspector";
import { WorkflowLegend } from "../../../components/workflow/WorkflowLegend";

export default function DemoWorkflowPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingStaticSample, setUsingStaticSample] = useState(false);
  const [uncertaintyAnswer, setUncertaintyAnswer] = useState("draft");
  const [uncertaintyMessage, setUncertaintyMessage] = useState<string | null>(
    null,
  );
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
    if (!API_CONFIGURED || !API_URL) {
      setWorkflow(sampleWorkflow);
      setSelectedId(sampleWorkflow.steps[0]?.id ?? null);
      setUsingStaticSample(true);
      return;
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
      .catch(() => {
        setWorkflow(sampleWorkflow);
        setSelectedId(sampleWorkflow.steps[0]?.id ?? null);
        setUsingStaticSample(true);
      });
  }, []);
  const selectedStep = useMemo(
    () => workflow?.steps.find((step) => step.id === selectedId) ?? null,
    [workflow, selectedId],
  );
  async function resolveUncertainty() {
    if (!workflow || !API_CONFIGURED || !API_URL) {
      setUncertaintyMessage(
        "Connect the backend to resolve an inferred uncertainty.",
      );
      return;
    }
    const answer = workflow.uncertainties[0];
    if (!answer) return;
    const response = await fetch(`${API_URL}/api/v1/workflows/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow,
        answers: [{ question_id: answer.id, answer: uncertaintyAnswer }],
      }),
    });
    if (!response.ok) {
      setUncertaintyMessage(`Resolution failed (${response.status}).`);
      return;
    }
    const payload = await response.json();
    const resolved = workflowIRSchema.parse(payload.workflow);
    setWorkflow(resolved);
    setUncertaintyMessage(
      "Question resolved. The workflow can now be generated.",
    );
  }
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
        {usingStaticSample && (
          <div className="notice">
            The live backend is unavailable. You are viewing the static sample
            workflow.
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
            {workflow.uncertainties.length > 0 && (
              <section className="workflow-uncertainties">
                <div className="eyebrow">Clarification required</div>
                {workflow.uncertainties.map((uncertainty) => (
                  <div className="uncertainty-card" key={uncertainty.id}>
                    <span className="mono-label">
                      {uncertainty.required ? "Required" : "Open question"}
                    </span>
                    <h2>{uncertainty.question}</h2>
                    <p>{uncertainty.reason}</p>
                    <div className="button-row">
                      <select
                        aria-label="Clarification answer"
                        value={uncertaintyAnswer}
                        onChange={(event) =>
                          setUncertaintyAnswer(event.target.value)
                        }
                      >
                        <option value="draft">Save as a draft</option>
                        <option value="review">Send for human review</option>
                      </select>
                      <button
                        className="button button-amber"
                        onClick={() => void resolveUncertainty()}
                      >
                        Resolve question
                      </button>
                    </div>
                  </div>
                ))}
                {uncertaintyMessage && (
                  <p className="notice">{uncertaintyMessage}</p>
                )}
              </section>
            )}
            <div className="workflow-actions">
              <a
                className="button button-amber"
                href={`${API_URL}/api/v1/workflows/${workflow.id}/artifact`}
              >
                Download trusted artifact
              </a>
              <Link className="button button-outline" href="/code">
                Inspect generated code
              </Link>
              <Link
                className="button button-outline"
                href="/generated/invoice-processor"
              >
                Open invoice processor
              </Link>
            </div>
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
