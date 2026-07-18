import { API_CONFIGURED, API_URL } from "./config";
import type { CompileReadiness } from "./workflowSession";
import type { WorkflowIR } from "@flowwright/workflow-schema";

export async function fetchCompileReadiness(
  workflow: WorkflowIR,
): Promise<CompileReadiness> {
  if (!API_CONFIGURED || !API_URL) {
    return {
      supported: false,
      ready: false,
      workflow_kind: workflow.workflow_kind,
      blockers: [
        {
          code: "api_unavailable",
          message: "Backend is not configured.",
        },
      ],
      warnings: [],
    };
  }
  const response = await fetch(`${API_URL}/api/v1/workflows/compile-readiness`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    return {
      supported: workflow.workflow_kind === "invoice_approval",
      ready: false,
      workflow_kind: workflow.workflow_kind,
      blockers: [
        {
          code: "readiness_request_failed",
          message:
            payload.detail ??
            `Compile readiness failed (${response.status})`,
        },
      ],
      warnings: [],
    };
  }
  return (await response.json()) as CompileReadiness;
}

export function withWorkflowSource(
  href: string,
  source: "sample" | "inferred",
): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}source=${source}`;
}
