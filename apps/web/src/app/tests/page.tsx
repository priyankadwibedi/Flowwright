"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { API_URL } from "../../lib/config";
import { runInvoiceTests } from "../../components/testing/results";

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
  const results = workflow ? runInvoiceTests(workflow.tests) : [];
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="mark" href="/">
          flowwright
        </Link>
        <Link href="/workflows/demo">Workflow graph →</Link>
      </nav>
      <div className="eyebrow">Verification</div>
      <h1>Test results</h1>
      <p>
        Deterministic synthetic invoice cases show how expected and unexpected
        inputs are routed.
      </p>
      {error && (
        <div className="notice">
          {error}. Start the FastAPI backend or use the mocked frontend test.
        </div>
      )}
      {!workflow && !error && <p>Loading validated test data…</p>}
      <div className="cards" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {results.map((result) => (
          <article className="card" key={result.id}>
            <div className={`status ${result.status}`}>
              {result.status.replace("_", " ")}
            </div>
            <h3>{result.name}</h3>
            <p>
              <strong>Input:</strong> {result.input_case.invoice_file}
            </p>
            <p>
              <strong>Expected:</strong> {result.expected_outcome}
            </p>
            <p>
              <strong>Actual:</strong> {result.actual_outcome}
            </p>
            <p>{result.explanation}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
