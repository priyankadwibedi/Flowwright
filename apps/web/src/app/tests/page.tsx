"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { TestResultCard } from "../../components/testing/TestResultCard";
import { TestSummary } from "../../components/testing/TestSummary";
import { API_URL } from "../../lib/config";
import {
  testRunResponseSchema,
  type TestRunResponse,
} from "../../lib/validation";

export default function TestsPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [run, setRun] = useState<TestRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const executeTests = useCallback(async (workflowData: WorkflowIR) => {
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
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/workflows/demo`);
      if (!response.ok) {
        throw new Error(`Workflow request failed (${response.status})`);
      }
      const workflowData = workflowIRSchema.parse(await response.json());
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
        <div className="tests-heading">
          <div>
            <div className="eyebrow">Verification / 04</div>
            <h1>Test the workflow before it runs.</h1>
            <p>
              Each synthetic invoice case is executed by the restricted runtime.
              Protected approval actions are never performed.
            </p>
          </div>
          <div className="button-row">
            <button
              className="button button-primary"
              onClick={() => void loadAndRun()}
            >
              {loading ? "Running…" : "Rerun tests"}
            </button>
            <Link className="button button-outline" href="/workflows/demo">
              Inspect workflow →
            </Link>
          </div>
        </div>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}. Start the FastAPI backend to execute the real test run.
          </div>
        )}
        {loading && !run && (
          <div className="loading-state">Executing validated test data…</div>
        )}
        {run && (
          <>
            <TestSummary results={run.executions} />
            <div className="test-run-meta mono-label">
              Run completed {new Date(run.completed_at).toLocaleTimeString()} ·
              unsafe actions executed: {run.unsafe_actions_executed}
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
        {workflow && !run && !loading && (
          <div className="notice">
            Workflow loaded, but no test result was returned.
          </div>
        )}
      </section>
    </main>
  );
}
