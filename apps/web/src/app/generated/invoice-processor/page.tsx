"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { AnnouncementBar } from "../../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../../components/marketing/MarketingHeader";
import {
  API_CONFIGURED,
  API_URL,
  apiUnavailableMessage,
} from "../../../lib/config";

const cases = [
  ["invoice-exact-match.json", "Exact match"],
  ["invoice-amount-mismatch.json", "Amount mismatch"],
  ["invoice-missing-po.json", "Missing purchase order"],
  ["invoice-unreadable-number.json", "Unreadable invoice number"],
  ["invoice-fifth-live-case.json", "One-cent difference"],
] as const;
type InvoiceCase = (typeof cases)[number][0];

type Result = {
  invoice_file: string;
  status: "approval_required" | "exception" | "human_review";
  reason: string;
  expected_total?: number | string | null;
  actual_total?: number | string | null;
  protected_action_executed: boolean;
  compiler_fingerprint?: string | null;
};

type ApprovalResponse = {
  invoice_file: string;
  status: "approved";
  message: string;
  approval_record_id: string;
  compiled_workflow_id: string;
  compiler_hash: string;
  decision: "approved";
  timestamp: string;
  protected_action_executed: false;
};

export default function GeneratedInvoiceProcessorPage() {
  const workflowState = useMemo<
    | { ok: true; workflow: WorkflowIR }
    | { ok: false; error: string }
  >(() => {
    if (typeof window === "undefined") {
      return { ok: false, error: "Workflow state is not available yet." };
    }
    const stored = window.sessionStorage.getItem("flowwright.workflow");
    if (!stored) {
      return {
        ok: false,
        error: "No workflow is loaded. Open an invoice workflow before running the generated application.",
      };
    }
    try {
      const workflow = workflowIRSchema.parse(JSON.parse(stored));
      if (workflow.workflow_kind !== "invoice_approval") {
        return {
          ok: false,
          error:
            "Unsupported workflow kind. The invoice processor only runs invoice_approval workflows.",
        };
      }
      return { ok: true, workflow };
    } catch {
      return {
        ok: false,
        error: "Saved workflow state is corrupted. Re-open the workflow before running the generated application.",
      };
    }
  }, []);
  const [invoiceFile, setInvoiceFile] = useState<InvoiceCase>(cases[0][0]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approval, setApproval] = useState<ApprovalResponse | null>(null);

  if (!API_CONFIGURED || !API_URL) {
    return (
      <main className="marketing-page">
        <AnnouncementBar />
        <MarketingHeader />
        <section className="generated-page content-width">
          <div className="eyebrow">Generated application / unavailable</div>
          <h1>Invoice processor unavailable</h1>
          <p className="generated-lede">{apiUnavailableMessage()}</p>
        </section>
      </main>
    );
  }

  async function process() {
    setRunning(true);
    setError(null);
    setApproval(null);
    setApprovalConfirmed(false);
    try {
      if (!workflowState.ok) throw new Error(workflowState.error);
      const response = await fetch(`${API_URL}/api/v1/invoices/process`, {
        body: JSON.stringify({
          invoice_file: invoiceFile,
          workflow: workflowState.workflow,
        }),
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

  async function approve() {
    if (!approvalConfirmed || result?.status !== "approval_required") return;
    setApproving(true);
    setError(null);
    try {
      if (!workflowState.ok) throw new Error(workflowState.error);
      if (!result.compiler_fingerprint) {
        throw new Error("Cannot approve without a compiler hash from the processed workflow.");
      }
      const response = await fetch(`${API_URL}/api/v1/invoices/approve`, {
        body: JSON.stringify({
          confirm: true,
          invoice_file: invoiceFile,
          workflow: workflowState.workflow,
          compiled_workflow_id: workflowState.workflow.id,
          compiler_hash: result.compiler_fingerprint,
          decision: "approved",
          timestamp: new Date().toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as
        | { detail?: string }
        | ApprovalResponse;
      if (!response.ok) {
        throw new Error(
          "detail" in payload && payload.detail
            ? payload.detail
            : `Approval failed (${response.status})`,
        );
      }
      setApproval(payload as ApprovalResponse);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  function formatMoney(value: number | string | null | undefined) {
    if (value == null) return "";
    return String(value);
  }

  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="generated-page content-width">
        <div className="eyebrow">Generated application / invoice processor</div>
        <h1>Run the compiled workflow.</h1>
        <p className="generated-lede">
          This mini-application uses the same InvoiceCompilerConfig interpreter
          as generated source and artifact tests.
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
              disabled={running || !workflowState.ok}
            >
              {running ? "Processing…" : "Process invoice →"}
            </button>
            {!workflowState.ok && (
              <div className="notice notice-error" role="alert">
                {workflowState.error}
              </div>
            )}
            {error && (
              <div className="notice notice-error" role="alert">
                {error}
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
                    PO total {formatMoney(result.expected_total)} · invoice
                    total {formatMoney(result.actual_total)}
                  </p>
                )}
                {result.compiler_fingerprint && (
                  <p className="mono-label">
                    fingerprint {result.compiler_fingerprint}
                  </p>
                )}
                <strong>
                  {result.protected_action_executed
                    ? "Protected action executed"
                    : "Protected actions were not executed"}
                </strong>
                {result.status === "approval_required" && !approval && (
                  <div className="approval-panel">
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={approvalConfirmed}
                        onChange={(event) =>
                          setApprovalConfirmed(event.target.checked)
                        }
                      />
                      <span className="toggle-ui" />
                      <span>
                        I reviewed this synthetic invoice and approve it.
                      </span>
                    </label>
                    <button
                      className="button button-amber"
                      onClick={() => void approve()}
                      disabled={!approvalConfirmed || approving}
                    >
                      {approving
                        ? "Recording approval…"
                        : "Record human approval"}
                    </button>
                    <small>
                      No external approval or payment action will be executed.
                    </small>
                  </div>
                )}
                {approval && (
                  <div className="approval-confirmation" role="status">
                    <strong>Approval recorded</strong>
                    <span>{approval.approval_record_id}</span>
                    <span>{approval.compiled_workflow_id}</span>
                    <span>{approval.compiler_hash}</span>
                    <small>{approval.message}</small>
                  </div>
                )}
              </div>
            )}
          </section>
          <aside className="studio-note">
            <span className="mono-label">Artifact boundary</span>
            <h2>Shared compiler config.</h2>
            <p>
              Runtime behavior is driven by InvoiceCompilerConfig extracted from
              WorkflowIR, matching the generated artifact.
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
