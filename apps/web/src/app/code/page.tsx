"use client";

import { useEffect, useState } from "react";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { API_URL } from "../../lib/config";
import { sampleWorkflow } from "../../lib/sampleWorkflow";

type GeneratedFile = { path: string; language: string; content: string };

export default function CodePage() {
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selected, setSelected] = useState<string>("workflow.py");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v1/workflows/generate`, {
      body: JSON.stringify(sampleWorkflow),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Code generation failed (${response.status})`);
        const payload = (await response.json()) as { files: GeneratedFile[] };
        setFiles(payload.files);
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
  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="code-page content-width">
        <div className="eyebrow">Generate / trusted artifact</div>
        <h1>Inspect the generated workflow package.</h1>
        <p className="generated-lede">
          Only the allow-listed invoice template can be generated in this
          prototype. Model output is never executed as shell commands.
        </p>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}. Start the FastAPI backend to generate the artifact.
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
        <a
          className="button button-amber"
          href={`${API_URL}/api/v1/workflows/invoice-approval-demo/artifact`}
        >
          Download artifact zip →
        </a>
      </section>
    </main>
  );
}
