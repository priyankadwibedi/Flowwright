"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorkflowIR } from "@flowwright/workflow-schema";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { BackLink } from "../../components/navigation/BackLink";
import { API_CONFIGURED, API_URL, apiUnavailableMessage } from "../../lib/config";
import { routes } from "../../lib/routes";
import {
  loadWorkflowForSource,
  readWorkflowSourceFromWindow,
} from "../../lib/workflowSource";
import type { WorkflowSource } from "../../lib/workflowSession";

type GeneratedFile = { path: string; language: string; content: string };

export default function CodePage() {
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selected, setSelected] = useState<string>("workflow.py");
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<
    Array<{ code: string; message: string }>
  >([]);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowIR | null>(null);
  const [source, setSource] = useState<WorkflowSource | null>(null);
  const [reviewHref, setReviewHref] = useState<string>(routes.demo);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!API_CONFIGURED || !API_URL) {
      setError(apiUnavailableMessage());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sourceParam =
          new URLSearchParams(window.location.search).get("source") ??
          readWorkflowSourceFromWindow();
        const loaded = await loadWorkflowForSource(sourceParam);
        if (cancelled) return;
        if (!loaded.ok) {
          setSource(loaded.source);
          setError(loaded.error);
          setBlockers(loaded.blockers ?? []);
          setReviewHref(loaded.reviewHref);
          return;
        }
        setSource(loaded.source);
        setWorkflow(loaded.workflow);
        setReviewHref(
          loaded.source === "sample" ? routes.demo : routes.inferred,
        );
        const response = await fetch(`${API_URL}/api/v1/workflows/generate`, {
          body: JSON.stringify(loaded.workflow),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            detail?: string;
          };
          throw new Error(
            payload.detail ?? `Code generation failed (${response.status})`,
          );
        }
        const payload = (await response.json()) as {
          files: GeneratedFile[];
          compiler_fingerprint?: string;
          workflow_source?: string;
        };
        if (cancelled) return;
        setFiles(payload.files);
        setFingerprint(payload.compiler_fingerprint ?? null);
      } catch (reason: unknown) {
        if (cancelled) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Code generation unavailable",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function downloadArtifact() {
    if (!workflow || !API_URL || !source) return;
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/workflows/artifact`, {
        body: JSON.stringify(workflow),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        throw new Error(
          payload.detail ?? `Artifact download failed (${response.status})`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `flowwright-${source}-${workflow.id}-workflow.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Artifact download failed",
      );
    } finally {
      setDownloading(false);
    }
  }

  const current = files.find((file) => file.path === selected) ?? files[0];
  const canDownload =
    API_CONFIGURED && Boolean(API_URL) && files.length > 0;

  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="code-page content-width">
        <BackLink href={reviewHref} label="Back to workflow" />
        <div className="eyebrow">Generate / trusted artifact</div>
        <h1>Inspect the generated software.</h1>
        <p className="generated-lede">
          Source is compiled from InvoiceCompilerConfig derived from WorkflowIR.
          Model output is never executed as shell commands.
          {source ? ` Workflow source: ${source}.` : ""}
        </p>
        {fingerprint && (
          <p className="mono-label">Compiler fingerprint: {fingerprint}</p>
        )}
        {error && (
          <div className="notice notice-error" role="alert">
            <p>{error}</p>
            {blockers.length > 0 && (
              <ul>
                {blockers.map((blocker) => (
                  <li key={blocker.code}>{blocker.message}</li>
                ))}
              </ul>
            )}
            <Link href={reviewHref}>Return to workflow review</Link>
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
          <button
            className="button button-amber"
            onClick={() => void downloadArtifact()}
            disabled={downloading}
          >
            {downloading ? "Preparing zip…" : "Download artifact zip →"}
          </button>
        ) : (
          <button className="button button-amber" disabled>
            Download unavailable
          </button>
        )}
      </section>
    </main>
  );
}
