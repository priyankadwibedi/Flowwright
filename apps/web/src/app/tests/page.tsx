"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { BackLink } from "../../components/navigation/BackLink";
import { TestResultCard } from "../../components/testing/TestResultCard";
import { TestSummary } from "../../components/testing/TestSummary";
import { API_CONFIGURED, API_URL, apiUnavailableMessage } from "../../lib/config";
import { routes } from "../../lib/routes";
import {
  testRunResponseSchema,
  type TestRunResponse,
} from "../../lib/validation";

export default function TestsPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [run, setRun] = useState<TestRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const executeTests = useCallback(async (workflowData: WorkflowIR) => {
    if (!API_CONFIGURED || !API_URL) {
      throw new Error(apiUnavailableMessage());
    }
    if (workflowData.workflow_kind !== "invoice_approval") {
      throw new Error(
        "Unsupported workflow kind. Generated artifact tests run only for invoice_approval.",
      );
    }
    const response = await fetch(`${API_URL}/api/v1/workflows/test`, {
      body: JSON.stringify(workflowData),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Test execution failed (${response.status})`);
    }
    return testRunResponseSchema.parse(await response.json());
  }, []);

  const loadAndRun = useCallback(async () => {
    if (!API_CONFIGURED || !API_URL) {
      setError(apiUnavailableMessage());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const stored = window.sessionStorage.getItem("flowwright.workflow");
      let workflowData: WorkflowIR;
      if (stored) {
        workflowData = workflowIRSchema.parse(JSON.parse(stored));
      } else {
        const response = await fetch(`${API_URL}/api/v1/workflows/demo`);
        if (!response.ok) {
          throw new Error(`Workflow request failed (${response.status})`);
        }
        workflowData = workflowIRSchema.parse(await response.json());
      }
      setWorkflow(workflowData);
      setRun(await executeTests(workflowData));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to execute workflow tests",
      );
    } finally {
      setLoading(false);
    }
  }, [executeTests]);

  useEffect(() => {
    void loadAndRun();
  }, [loadAndRun]);

  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="tests-page content-width">
        <BackLink href={routes.demo} label="Back to workflow" />
        <div className="tests-heading">
          <div>
            <div className="eyebrow">Verification / 04</div>
            <h1>Prove the workflow on new inputs.</h1>
            <p>
              Each run writes trusted `workflow.py` and `test_workflow.py`, then
              executes those generated tests in an isolated temporary directory.
            </p>
          </div>
          <div className="button-row">
            <button
              className="button button-primary"
              onClick={() => void loadAndRun()}
              disabled={!API_CONFIGURED}
            >
              {loading ? "Running…" : "Rerun tests"}
            </button>
            <Link className="button button-outline" href="/workflows/demo">
              Inspect workflow →
            </Link>
          </div>
        </div>
        {!API_CONFIGURED && (
          <div className="notice notice-error" role="alert">
            {apiUnavailableMessage()} Test execution is disabled without a
            configured backend.
          </div>
        )}
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        {loading && !run && (
          <div className="loading-state">Executing generated artifact tests…</div>
        )}
        {run && (
          <>
            <TestSummary results={run.executions} />
            <div className="test-run-meta mono-label">
              Run completed {new Date(run.completed_at).toLocaleTimeString()} ·
              unsafe actions executed: {run.unsafe_actions_executed}
              {run.compiler_fingerprint
                ? ` · fingerprint ${run.compiler_fingerprint}`
                : ""}
              {run.artifact_execution
                ? ` · artifact exit ${run.artifact_execution.exit_code}`
                : ""}
            </div>
            <div className="test-results-grid">
              {run.executions.map((result, index) => (
                <TestResultCard
                  result={result}
                  index={index}
                  key={result.test_id}
                />
              ))}
            </div>
          </>
        )}
        {workflow && !run && !loading && API_CONFIGURED && (
          <div className="notice">
            Workflow loaded, but no test result was returned.
          </div>
        )}
      </section>
    </main>
  );
}
