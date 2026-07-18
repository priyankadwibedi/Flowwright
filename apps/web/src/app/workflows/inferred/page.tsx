"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import {
  API_CONFIGURED,
  API_URL,
  apiUnavailableMessage,
} from "../../../lib/config";
import {
  canCompileWorkflow,
  loadInferredWorkflow,
  saveInferredWorkflow,
  unresolvedRequiredClarifications,
  type CompileReadiness,
} from "../../../lib/workflowSession";
import {
  fetchCompileReadiness,
  withWorkflowSource,
} from "../../../lib/compileReadiness";
import { AnnouncementBar } from "../../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../../components/marketing/MarketingHeader";
import { BackLink } from "../../../components/navigation/BackLink";
import { routes } from "../../../lib/routes";
import { WorkflowCanvas } from "../../../components/workflow/WorkflowCanvas";
import { WorkflowInspector } from "../../../components/workflow/WorkflowInspector";
import { WorkflowLegend } from "../../../components/workflow/WorkflowLegend";
import { loadEvidenceCollection } from "../../../lib/evidenceStore";
import type { ProcessedDemonstration } from "../../../lib/validation";

async function describeApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string" && payload.detail) {
      return payload.detail;
    }
  } catch {
    // Keep fallback when body is not JSON.
  }
  return `${fallback} (${response.status})`;
}

export default function InferredWorkflowPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [uncertaintyMessage, setUncertaintyMessage] = useState<string | null>(
    null,
  );
  const [evidence, setEvidence] = useState<ProcessedDemonstration | null>(null);
  const [readiness, setReadiness] = useState<CompileReadiness | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [missing, setMissing] = useState(false);

  async function refreshReadiness(next: WorkflowIR) {
    const result = await fetchCompileReadiness(next);
    setReadiness(result);
  }

  useEffect(() => {
    const existing = loadInferredWorkflow();
    if (!existing) {
      setMissing(true);
      return;
    }
    setWorkflow(existing.workflow);
    setSelectedId(existing.workflow.steps[0]?.id ?? null);
    void refreshReadiness(existing.workflow);
    const demoId =
      existing.workflow.demonstration_id ||
      window.sessionStorage.getItem("flowwright.demonstration_id");
    if (demoId) {
      void loadEvidenceCollection(demoId).then(setEvidence);
    }
  }, []);

  const selectedStep = useMemo(
    () => workflow?.steps.find((step) => step.id === selectedId) ?? null,
    [workflow, selectedId],
  );
  const remainingRequired = useMemo(
    () => (workflow ? unresolvedRequiredClarifications(workflow) : []),
    [workflow],
  );
  const remainingOptional = useMemo(
    () =>
      workflow?.uncertainties.filter((item) => !item.required) ?? [],
    [workflow],
  );
  const isInvoice = workflow?.workflow_kind === "invoice_approval";
  const canCompile = canCompileWorkflow(
    workflow,
    readiness,
    API_CONFIGURED && Boolean(API_URL),
  );

  function persistWorkflow(next: WorkflowIR) {
    saveInferredWorkflow(next);
    setWorkflow(next);
    void refreshReadiness(next);
  }

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
      answers[questionId] || uncertainty.allowed_options[0] || "draft";
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
    persistWorkflow(resolved);
    const requiredLeft = (payload.remaining_required ?? []).length;
    setUncertaintyMessage(
      requiredLeft
        ? `${requiredLeft} required question(s) remain before generation.`
        : uncertainty.required
          ? "Required questions resolved. Generation is ready."
          : "Preference applied.",
    );
  }

  async function applyCorrection(action: string) {
    if (!workflow || !selectedStep || !API_CONFIGURED || !API_URL) return;
    if (action === "accidental") {
      const confirmed = window.confirm(
        `Mark "${selectedStep.name}" as accidental? Required invoice steps cannot be marked accidental.`,
      );
      if (!confirmed) return;
    }

    let corrections;
    if (action === "accidental") {
      corrections = [{ step_id: selectedStep.id, accidental: true }];
    } else if (action === "approval") {
      corrections = [{ step_id: selectedStep.id, require_human_approval: true }];
    } else {
      const nextName = window.prompt("Rename step", selectedStep.name)?.trim();
      if (!nextName || nextName === selectedStep.name) return;
      corrections = [{ step_id: selectedStep.id, rename: nextName }];
    }

    setCorrecting(true);
    setCorrectionStatus("Applying correction…");
    try {
      const response = await fetch(`${API_URL}/api/v1/workflows/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow, corrections }),
      });
      if (!response.ok) {
        throw new Error(
          await describeApiError(response, "Correction rejected"),
        );
      }
      const updated = workflowIRSchema.parse(await response.json());
      persistWorkflow(updated);
      setCorrectionStatus("Correction applied.");
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Correction failed.";
      if (/accidental|compiler|required/i.test(message)) {
        setCorrectionStatus(
          "This step is required by the invoice compiler and cannot be marked accidental.",
        );
      } else {
        setCorrectionStatus(message);
      }
    } finally {
      setCorrecting(false);
    }
  }

  const compileBlockedReason = !workflow
    ? null
    : !isInvoice
      ? "Compilation unavailable for unsupported workflows."
      : remainingRequired.length > 0
        ? `Resolve ${remainingRequired.length} required clarification${remainingRequired.length === 1 ? "" : "s"} before generating software.`
        : readiness && !readiness.ready
          ? readiness.blockers[0]?.message ??
            "The inferred workflow does not yet contain a valid exception path."
          : !API_CONFIGURED || !API_URL
            ? apiUnavailableMessage()
            : null;

  if (missing) {
    return (
      <main className="marketing-page">
        <AnnouncementBar />
        <MarketingHeader />
        <section className="workflow-page content-width">
          <BackLink href={routes.record} label="Back to recording" />
          <div className="eyebrow">AI-INFERRED WORKFLOW / INVOICE APPROVAL</div>
          <h1>Review the workflow Flowwright inferred.</h1>
          <p>
            No inferred workflow is available. Record and analyze a
            demonstration first.
          </p>
          <div className="workflow-actions">
            <Link className="button button-amber" href={routes.record}>
              Back to recording
            </Link>
            <Link className="button button-outline" href={routes.demo}>
              Open sample invoice workflow
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="workflow-page content-width">
        <BackLink href={routes.record} label="Back to recording" />
        <div className="workflow-heading">
          <div>
            <div className="eyebrow">AI-INFERRED WORKFLOW / INVOICE APPROVAL</div>
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
                <span className="mono-label">Origin</span>
                <strong>AI inferred</strong>
              </div>
              <div>
                <span className="mono-label">Required approvals</span>
                <strong>{workflow.approvals.length}</strong>
              </div>
              <div>
                <span className="mono-label">Compiler</span>
                <strong>
                  {readiness?.ready
                    ? "Ready"
                    : readiness
                      ? "Blocked"
                      : "Checking…"}
                </strong>
              </div>
            </div>
            <div className="workflow-layout">
              <div>
                <WorkflowCanvas
                  workflow={workflow}
                  origin="ai_inferred"
                  selectedStepId={selectedId}
                  onSelectStep={setSelectedId}
                />
              </div>
              <aside className="workflow-side">
                <WorkflowInspector
                  workflow={workflow}
                  step={selectedStep}
                  evidence={evidence}
                  origin="ai_inferred"
                  correcting={correcting}
                  onCorrect={applyCorrection}
                />
                <WorkflowLegend />
              </aside>
            </div>
            <p className="correction-status" aria-live="polite">
              {correctionStatus}
            </p>
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
            {remainingRequired.length > 0 && (
              <section className="workflow-uncertainties">
                <div className="eyebrow">Required clarification</div>
                {remainingRequired.map((uncertainty) => {
                  const options =
                    uncertainty.allowed_options.length > 0
                      ? uncertainty.allowed_options
                      : ["draft", "human_review"];
                  const value = answers[uncertainty.id] ?? options[0];
                  return (
                    <div className="uncertainty-card" key={uncertainty.id}>
                      <span className="mono-label">Required</span>
                      <h2>{uncertainty.question}</h2>
                      <p>{uncertainty.reason}</p>
                      <p className="mono-label">
                        Options: {options.join(", ")}
                      </p>
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
                          onClick={() => void resolveUncertainty(uncertainty.id)}
                        >
                          Resolve this question
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {remainingOptional.length > 0 && (
              <section className="workflow-uncertainties">
                <div className="eyebrow">Optional workflow preference</div>
                {remainingOptional.map((uncertainty) => {
                  const options =
                    uncertainty.allowed_options.length > 0
                      ? uncertainty.allowed_options
                      : ["draft", "human_review"];
                  const value = answers[uncertainty.id] ?? options[0];
                  return (
                    <div className="uncertainty-card" key={uncertainty.id}>
                      <span className="mono-label">Optional</span>
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
                          className="button button-outline"
                          onClick={() => void resolveUncertainty(uncertainty.id)}
                        >
                          Apply preference
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {uncertaintyMessage && (
              <p className="notice" aria-live="polite">
                {uncertaintyMessage}
              </p>
            )}
            {readiness && !readiness.ready && remainingRequired.length === 0 && (
              <div className="notice notice-error">
                <p>This workflow is not ready to compile.</p>
                <ul>
                  {readiness.blockers.map((blocker) => (
                    <li key={blocker.code}>{blocker.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="workflow-actions">
              {canCompile ? (
                <Link
                  className="button button-amber"
                  href={withWorkflowSource(routes.code, "inferred")}
                >
                  Generate and inspect code
                </Link>
              ) : (
                <button className="button button-amber" disabled>
                  Generate and inspect code
                </button>
              )}
              {canCompile ? (
                <Link
                  className="button button-outline"
                  href={withWorkflowSource(routes.tests, "inferred")}
                >
                  Run mandatory tests
                </Link>
              ) : (
                <button className="button button-outline" disabled>
                  Run mandatory tests
                </button>
              )}
              {canCompile ? (
                <Link
                  className="button button-outline"
                  href={withWorkflowSource(routes.generatedInvoice, "inferred")}
                >
                  Open invoice processor
                </Link>
              ) : (
                <button className="button button-outline" disabled>
                  Open invoice processor
                </button>
              )}
              <Link className="button button-outline" href={routes.demo}>
                Open sample invoice workflow
              </Link>
            </div>
            {compileBlockedReason && (
              <p className="action-prerequisite">{compileBlockedReason}</p>
            )}
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
