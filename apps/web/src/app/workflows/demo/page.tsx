"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { API_URL } from "../../../lib/config";
import { WorkflowGraph } from "../../../components/workflow/WorkflowGraph";

export default function DemoWorkflowPage() {
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const storedWorkflow = window.sessionStorage.getItem("flowwright.workflow");
    if (storedWorkflow) {
      try {
        setWorkflow(workflowIRSchema.parse(JSON.parse(storedWorkflow)));
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
      .then(setWorkflow)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load workflow",
        ),
      );
  }, []);
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="mark" href="/">
          flowwright
        </Link>
        <div className="navlinks">
          <Link href="/record">Record</Link>
          <Link href="/tests">Tests</Link>
        </div>
      </nav>
      {error && (
        <div className="notice">
          {error}. Start the FastAPI backend or use the mocked frontend test.
        </div>
      )}
      {!workflow && !error && <p>Loading validated WorkflowIR...</p>}
      {workflow && (
        <>
          <div className="eyebrow">Compiled workflow</div>
          <h1>{workflow.name}</h1>
          <p>{workflow.description}</p>
          <div className="cards">
            <div className="card">
              <strong>Confidence</strong>
              <p>{Math.round(workflow.confidence * 100)}%</p>
            </div>
            <div className="card">
              <strong>Variables</strong>
              <p>
                {workflow.variables
                  .filter((variable) => !variable.constant)
                  .map((variable) => variable.name)
                  .join(", ")}
              </p>
            </div>
            <div className="card">
              <strong>Approvals</strong>
              <p>{workflow.approvals.length} human gates</p>
            </div>
          </div>
          <section className="section">
            <h2>Workflow graph</h2>
            <WorkflowGraph workflow={workflow} />
          </section>
          <section className="section">
            <h2>Decision rules</h2>
            <div className="cards">
              {workflow.decisions.map((decision) => (
                <div className="card" key={decision.id}>
                  <strong>{decision.name}</strong>
                  <p>{decision.condition}</p>
                </div>
              ))}
            </div>
          </section>
          <details className="panel">
            <summary>
              <strong>Raw WorkflowIR JSON</strong>
            </summary>
            <pre style={{ overflow: "auto", fontSize: ".78rem" }}>
              {JSON.stringify(workflow, null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
