"use client";

import Link from "next/link";
import { useState } from "react";
import { AnnouncementBar } from "../../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../../components/marketing/MarketingHeader";
import { API_URL } from "../../../lib/config";

const cases = [
  ["invoice-exact-match.json", "Exact match"],
  ["invoice-amount-mismatch.json", "Amount mismatch"],
  ["invoice-missing-po.json", "Missing purchase order"],
  ["invoice-unreadable-number.json", "Unreadable invoice number"],
] as const;
type InvoiceCase = (typeof cases)[number][0];

type Result = {
  invoice_file: string;
  status: "approval_required" | "exception" | "human_review";
  reason: string;
  expected_total?: number | null;
  actual_total?: number | null;
  protected_action_executed: boolean;
};

export default function GeneratedInvoiceProcessorPage() {
  const [invoiceFile, setInvoiceFile] = useState<InvoiceCase>(cases[0][0]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function process() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/invoices/process`, {
        body: JSON.stringify({ invoice_file: invoiceFile }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok)
        throw new Error(`Processor request failed (${response.status})`);
      setResult((await response.json()) as Result);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Processor unavailable",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="generated-page content-width">
        <div className="eyebrow">Generated application / invoice processor</div>
        <h1>Run the compiled invoice workflow.</h1>
        <p className="generated-lede">
          This inspectable mini-application uses only the synthetic fixtures and
          the trusted runtime. A matching invoice stops at a human approval
          gate.
        </p>
        <div className="generated-layout">
          <section className="studio-card generated-card">
            <span className="mono-label">Synthetic input</span>
            <label htmlFor="invoice-case">Invoice case</label>
            <select
              id="invoice-case"
              value={invoiceFile}
              onChange={(event) =>
                setInvoiceFile(event.target.value as InvoiceCase)
              }
            >
              {cases.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              className="button button-amber"
              onClick={() => void process()}
              disabled={running}
            >
              {running ? "Processing…" : "Process invoice →"}
            </button>
            {error && (
              <div className="notice notice-error" role="alert">
                {error}. Start the FastAPI backend to run the generated app.
              </div>
            )}
            {result && (
              <div className={`generated-result result-${result.status}`}>
                <span className="status-badge">
                  {result.status.replace("_", " ")}
                </span>
                <h2>{result.reason}</h2>
                <p>Invoice: {result.invoice_file}</p>
                {result.expected_total != null && (
                  <p>
                    PO total ${result.expected_total.toFixed(2)} · invoice total
                    ${result.actual_total?.toFixed(2)}
                  </p>
                )}
                <strong>
                  {result.protected_action_executed
                    ? "Protected action executed"
                    : "Protected actions were not executed"}
                </strong>
              </div>
            )}
          </section>
          <aside className="studio-note">
            <span className="mono-label">Artifact boundary</span>
            <h2>Trusted template only.</h2>
            <p>
              The generated artifact is deterministic, reviewable Python. It
              does not execute arbitrary model output, shell commands, or
              browser side effects.
            </p>
            <Link className="button button-outline" href="/workflows/demo">
              Inspect workflow IR
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
