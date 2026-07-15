"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { TestResultCard } from "../../components/testing/TestResultCard";
import { TestSummary } from "../../components/testing/TestSummary";
import { API_URL } from "../../lib/config";

export default function TestsPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v1/workflows/demo`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Workflow request failed (${response.status})`);
        return workflowIRSchema.parse(await response.json());
      })
      .then(setWorkflow)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load workflow",
        ),
      );
  }, []);
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
              Deterministic synthetic invoice cases show how expected and
              unexpected inputs are routed.
            </p>
          </div>
          <Link className="button button-outline" href="/workflows/demo">
            Inspect workflow ↗
          </Link>
        </div>
        {error && (
          <div className="notice notice-error">
            {error}. Start the FastAPI backend or use the mocked frontend test.
          </div>
        )}
        {!workflow && !error && (
          <div className="loading-state">Loading validated test data…</div>
        )}
        {workflow && (
          <>
            <TestSummary results={workflow.tests} />
            <div className="test-results-grid">
              {workflow.tests.map((result, index) => (
                <TestResultCard result={result} index={index} key={result.id} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
