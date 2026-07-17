"use client";

import { useEffect, useState } from "react";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { API_CONFIGURED, API_URL, apiUnavailableMessage } from "../../lib/config";
import { sampleWorkflow } from "../../lib/sampleWorkflow";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";

type GeneratedFile = { path: string; language: string; content: string };

export default function CodePage() {
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selected, setSelected] = useState<string>("workflow.py");
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if (!API_CONFIGURED || !API_URL) {
      setError(apiUnavailableMessage());
      return;
    }
    let workflow: WorkflowIR = sampleWorkflow;
    const stored = window.sessionStorage.getItem("flowwright.workflow");
    if (stored) {
      try {
        workflow = workflowIRSchema.parse(JSON.parse(stored));
      } catch {
        workflow = sampleWorkflow;
      }
    }
    if (workflow.workflow_kind !== "invoice_approval") {
      setUnsupported(true);
      setError(
        "This workflow is unsupported for compilation. Only invoice_approval workflows can generate trusted artifacts.",
      );
      return;
    }
    fetch(`${API_URL}/api/v1/workflows/generate`, {
      body: JSON.stringify(workflow),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Code generation failed (${response.status})`);
        const payload = (await response.json()) as {
          files: GeneratedFile[];
          compiler_fingerprint?: string;
        };
        setFiles(payload.files);
        setFingerprint(payload.compiler_fingerprint ?? null);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Code generation unavailable",
        ),
      );
  }, []);

  const current = files.find((file) => file.path === selected) ?? files[0];
  const canDownload =
    API_CONFIGURED &&
    Boolean(API_URL) &&
    !unsupported &&
    files.length > 0;

  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="code-page content-width">
        <div className="eyebrow">Generate / trusted artifact</div>
        <h1>Inspect the generated software.</h1>
        <p className="generated-lede">
          Source is compiled from InvoiceCompilerConfig derived from WorkflowIR.
          Model output is never executed as shell commands.
        </p>
        {fingerprint && (
          <p className="mono-label">Compiler fingerprint: {fingerprint}</p>
        )}
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        {files.length > 0 && (
          <div className="code-viewer">
            <nav aria-label="Generated files">
              {files.map((file) => (
                <button
                  className={file.path === current?.path ? "is-active" : ""}
                  key={file.path}
                  onClick={() => setSelected(file.path)}
                >
                  {file.path}
                </button>
              ))}
            </nav>
            <div>
              <span className="mono-label">{current?.language}</span>
              <pre>
                <code>{current?.content}</code>
              </pre>
            </div>
          </div>
        )}
        {canDownload ? (
          <a
            className="button button-amber"
            href={`${API_URL}/api/v1/workflows/invoice-approval-demo/artifact`}
          >
            Download artifact zip →
          </a>
        ) : (
          <button className="button button-amber" disabled>
            Download unavailable
          </button>
        )}
      </section>
    </main>
  );
}
