"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import {
  API_CONFIGURED,
  API_URL,
  apiUnavailableMessage,
} from "../../../lib/config";
import { sampleWorkflow } from "../../../lib/sampleWorkflow";
import { AnnouncementBar } from "../../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../../components/marketing/MarketingHeader";
import { WorkflowCanvas } from "../../../components/workflow/WorkflowCanvas";
import { WorkflowInspector } from "../../../components/workflow/WorkflowInspector";
import { WorkflowLegend } from "../../../components/workflow/WorkflowLegend";
import { loadEvidenceCollection } from "../../../lib/evidenceStore";
import type { ProcessedDemonstration } from "../../../lib/validation";

export default function DemoWorkflowPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [usingStaticSample, setUsingStaticSample] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [uncertaintyMessage, setUncertaintyMessage] = useState<string | null>(
    null,
  );
  const [evidence, setEvidence] = useState<ProcessedDemonstration | null>(null);
  const [generationReady, setGenerationReady] = useState(false);

  useEffect(() => {
    const storedWorkflow = window.sessionStorage.getItem("flowwright.workflow");
    if (storedWorkflow) {
      try {
        const parsed = workflowIRSchema.parse(JSON.parse(storedWorkflow));
        setWorkflow(parsed);
        setSelectedId(parsed.steps[0]?.id ?? null);
        setGenerationReady(
          parsed.workflow_kind === "invoice_approval" &&
            !parsed.uncertainties.some((item) => item.required),
        );
        const demoId =
          parsed.demonstration_id ||
          window.sessionStorage.getItem("flowwright.demonstration_id");
        if (demoId) {
          void loadEvidenceCollection(demoId).then(setEvidence);
        }
        return;
      } catch {
        window.sessionStorage.removeItem("flowwright.workflow");
      }
    }
    if (!API_CONFIGURED || !API_URL) {
      setWorkflow(sampleWorkflow);
      setSelectedId(sampleWorkflow.steps[0]?.id ?? null);
      setUsingStaticSample(true);
      setGenerationReady(true);
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
        setGenerationReady(
          value.workflow_kind === "invoice_approval" &&
            !value.uncertainties.some((item) => item.required),
        );
      })
      .catch(() => {
        setWorkflow(sampleWorkflow);
        setSelectedId(sampleWorkflow.steps[0]?.id ?? null);
        setUsingStaticSample(true);
        setGenerationReady(true);
      });
  }, []);

  const selectedStep = useMemo(
    () => workflow?.steps.find((step) => step.id === selectedId) ?? null,
    [workflow, selectedId],
  );
  const remainingRequired = useMemo(
    () => workflow?.uncertainties.filter((item) => item.required) ?? [],
    [workflow],
  );
  const isInvoice = workflow?.workflow_kind === "invoice_approval";
  const headingEyebrow = isInvoice
    ? "Compiled workflow / invoice approval"
    : "Compiled workflow / unsupported for generation";

  async function resolveUncertainty(questionId: string) {
    if (!workflow || !API_CONFIGURED || !API_URL) {
      setUncertaintyMessage(
        "Connect the backend to resolve an inferred uncertainty.",
      );
      return;
    }
    const uncertainty = workflow.uncertainties.find(
      (item) => item.id === questionId,
    );
    if (!uncertainty) return;
    const answer =
      answers[questionId] ||
      uncertainty.allowed_options[0] ||
      "draft";
    const response = await fetch(`${API_URL}/api/v1/workflows/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow,
        answers: [{ question_id: questionId, answer }],
      }),
    });
    if (!response.ok) {
      setUncertaintyMessage(`Resolution failed (${response.status}).`);
      return;
    }
    const payload = await response.json();
    const resolved = workflowIRSchema.parse(payload.workflow);
    setWorkflow(resolved);
    window.sessionStorage.setItem(
      "flowwright.workflow",
      JSON.stringify(resolved),
    );
    setGenerationReady(Boolean(payload.generation_ready));
    const requiredLeft = (payload.remaining_required ?? []).length;
    setUncertaintyMessage(
      requiredLeft
        ? `${requiredLeft} required question(s) remain before generation.`
        : "Required questions resolved. Generation is ready.",
    );
  }

  async function applyCorrection(action: string) {
    if (!workflow || !selectedStep || !API_CONFIGURED || !API_URL) return;
    let corrections;
    if (action === "accidental") {
      corrections = [{ step_id: selectedStep.id, accidental: true }];
    } else if (action === "approval") {
      corrections = [{ step_id: selectedStep.id, require_human_approval: true }];
    } else {
      const nextName = window
        .prompt("Rename step", selectedStep.name)
        ?.trim();
      if (!nextName || nextName === selectedStep.name) return;
      corrections = [{ step_id: selectedStep.id, rename: nextName }];
    }
    const response = await fetch(`${API_URL}/api/v1/workflows/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow, corrections }),
    });
    if (!response.ok) return;
    const updated = workflowIRSchema.parse(await response.json());
    setWorkflow(updated);
    window.sessionStorage.setItem(
      "flowwright.workflow",
      JSON.stringify(updated),
    );
  }

  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="workflow-page content-width">
        <div className="workflow-heading">
          <div>
            <div className="eyebrow">{headingEyebrow}</div>
            <h1>Review the workflow Flowwright inferred.</h1>
            <p>
              {workflow
                ? `${workflow.name}${workflow.description ? ` — ${workflow.description}` : ""}`
                : "Validating the workflow contract before rendering the graph."}
            </p>
          </div>
          <div className="workflow-confidence">
            <span className="mono-label">Confidence</span>
            <strong>
              {workflow ? `${Math.round(workflow.confidence * 100)}%` : "—"}
            </strong>
          </div>
        </div>
        {usingStaticSample && (
          <div className="notice">
            The live backend is unavailable. You are viewing the static sample
            workflow. AI analysis, tests, and artifact download remain disabled
            until a backend is configured.
          </div>
        )}
        {!isInvoice && workflow && (
          <div className="notice notice-error">
            This workflow is marked <code>unsupported</code> for compilation.
            You can inspect the graph, but generation, tests, and the invoice
            mini-application are disabled.
          </div>
        )}
        {workflow && (
          <>
            <div className="workflow-meta">
              <div>
                <span className="mono-label">Kind</span>
                <strong>{workflow.workflow_kind}</strong>
              </div>
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
                <WorkflowInspector
                  workflow={workflow}
                  step={selectedStep}
                  evidence={evidence}
                  onCorrect={applyCorrection}
                />
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
            {remainingRequired.length > 0 && (
              <div className="notice">
                {remainingRequired.length} required clarification
                {remainingRequired.length === 1 ? "" : "s"} must be resolved
                before generation.
              </div>
            )}
            {workflow.uncertainties.length > 0 && (
              <section className="workflow-uncertainties">
                <div className="eyebrow">Clarification required</div>
                {workflow.uncertainties.map((uncertainty) => {
                  const options =
                    uncertainty.allowed_options.length > 0
                      ? uncertainty.allowed_options
                      : ["draft", "human_review"];
                  const value = answers[uncertainty.id] ?? options[0];
                  return (
                    <div className="uncertainty-card" key={uncertainty.id}>
                      <span className="mono-label">
                        {uncertainty.required ? "Required" : "Optional"}
                      </span>
                      <h2>{uncertainty.question}</h2>
                      <p>{uncertainty.reason}</p>
                      <div className="button-row">
                        <select
                          aria-label={`Answer for ${uncertainty.id}`}
                          value={value}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [uncertainty.id]: event.target.value,
                            }))
                          }
                        >
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <button
                          className="button button-amber"
                          onClick={() =>
                            void resolveUncertainty(uncertainty.id)
                          }
                        >
                          Resolve this question
                        </button>
                      </div>
                    </div>
                  );
                })}
                {uncertaintyMessage && (
                  <p className="notice">{uncertaintyMessage}</p>
                )}
              </section>
            )}
            <div className="workflow-actions">
              {API_CONFIGURED && API_URL && isInvoice && generationReady ? (
                <Link
                  className="button button-amber"
                  href="/code"
                >
                  Inspect and download artifact
                </Link>
              ) : (
                <button className="button button-amber" disabled>
                  {isInvoice
                    ? generationReady
                      ? apiUnavailableMessage()
                      : "Resolve required questions first"
                    : "Compilation unavailable"}
                </button>
              )}
              {isInvoice ? (
                <>
                  <Link className="button button-outline" href="/code">
                    Inspect generated code
                  </Link>
                  <Link
                    className="button button-outline"
                    href="/generated/invoice-processor"
                  >
                    Open invoice processor
                  </Link>
                  <Link className="button button-outline" href="/tests">
                    Run generated tests
                  </Link>
                </>
              ) : null}
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
