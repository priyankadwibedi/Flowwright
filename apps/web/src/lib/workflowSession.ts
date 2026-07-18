import {
  workflowIRSchema,
  type WorkflowIR,
} from "@flowwright/workflow-schema";
import { sampleWorkflow } from "./sampleWorkflow";

export type WorkflowOrigin = "sample" | "ai_inferred";
export type WorkflowSource = "sample" | "inferred";

export type StoredWorkflow = {
  workflow: WorkflowIR;
  origin: WorkflowOrigin;
  savedAt: string;
};

export type WorkflowSession = {
  workflow: WorkflowIR;
  origin: WorkflowOrigin;
};

const SAMPLE_WORKFLOW_KEY = "flowwright.workflow.sample";
const INFERRED_WORKFLOW_KEY = "flowwright.workflow.inferred";

/** Legacy shared keys — migrated once into the namespaced stores. */
const LEGACY_WORKFLOW_KEY = "flowwright.workflow";
const LEGACY_ORIGIN_KEY = "flowwright.workflow_origin";
const LEGACY_SESSION_KEY = "flowwright.workflow_session";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.sessionStorage);
}

function isSampleWorkflow(workflow: {
  id?: string;
  demonstration_id?: string | null;
}): boolean {
  if (workflow.demonstration_id) return false;
  return (
    workflow.id === sampleWorkflow.id || workflow.id === "invoice-approval-demo"
  );
}

export function resolveWorkflowOrigin(
  workflow: WorkflowIR,
  storedOrigin?: string | null,
): WorkflowOrigin {
  if (workflow.demonstration_id) return "ai_inferred";
  if (isSampleWorkflow(workflow)) return "sample";
  if (storedOrigin === "ai_inferred") return "ai_inferred";
  if (storedOrigin === "sample") return "sample";
  return "sample";
}

export function parseWorkflowSource(
  value: string | null | undefined,
): WorkflowSource | null {
  if (value === "sample" || value === "inferred") return value;
  return null;
}

export function sourceToOrigin(source: WorkflowSource): WorkflowOrigin {
  return source === "sample" ? "sample" : "ai_inferred";
}

export function originToSource(origin: WorkflowOrigin): WorkflowSource {
  return origin === "sample" ? "sample" : "inferred";
}

function coerceWorkflow(raw: unknown): WorkflowIR | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = { ...(raw as Record<string, unknown>) };

  // Pydantic may emit datetimes without a timezone; Zod offset-datetime rejects those.
  if (typeof candidate.created_at === "string") {
    const value = candidate.created_at.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
      candidate.created_at = `${value}Z`;
    }
  }

  const strict = workflowIRSchema.safeParse(candidate);
  if (strict.success) return strict.data;

  // Last-resort salvage: keep continuity for already-analyzed sessions.
  try {
    const loose = candidate as WorkflowIR;
    if (
      typeof loose.id === "string" &&
      Array.isArray(loose.steps) &&
      loose.steps.length > 0 &&
      typeof loose.workflow_kind === "string"
    ) {
      return loose;
    }
  } catch {
    return null;
  }
  return null;
}

function readStored(key: string): StoredWorkflow | null {
  if (!canUseStorage()) return null;
  const packed = window.sessionStorage.getItem(key);
  if (!packed) return null;
  try {
    const parsed = JSON.parse(packed) as {
      workflow?: unknown;
      origin?: unknown;
      savedAt?: unknown;
    };
    const workflow = coerceWorkflow(parsed.workflow);
    if (!workflow) return null;
    const origin = resolveWorkflowOrigin(
      workflow,
      typeof parsed.origin === "string" ? parsed.origin : null,
    );
    return {
      workflow,
      origin,
      savedAt:
        typeof parsed.savedAt === "string"
          ? parsed.savedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeStored(key: string, workflow: WorkflowIR, origin: WorkflowOrigin) {
  if (!canUseStorage()) return;
  const payload: StoredWorkflow = {
    workflow,
    origin,
    savedAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(key, JSON.stringify(payload));
}

function migrateLegacySession(): void {
  if (!canUseStorage()) return;
  if (
    window.sessionStorage.getItem(SAMPLE_WORKFLOW_KEY) ||
    window.sessionStorage.getItem(INFERRED_WORKFLOW_KEY)
  ) {
    return;
  }

  const packed = window.sessionStorage.getItem(LEGACY_SESSION_KEY);
  if (packed) {
    try {
      const parsed = JSON.parse(packed) as {
        workflow?: unknown;
        origin?: unknown;
      };
      const workflow = coerceWorkflow(parsed.workflow);
      if (workflow) {
        const origin = resolveWorkflowOrigin(
          workflow,
          typeof parsed.origin === "string" ? parsed.origin : null,
        );
        if (origin === "sample") {
          writeStored(SAMPLE_WORKFLOW_KEY, workflow, "sample");
        } else {
          writeStored(INFERRED_WORKFLOW_KEY, workflow, "ai_inferred");
        }
        return;
      }
    } catch {
      // Fall through to legacy raw key.
    }
  }

  const legacy = window.sessionStorage.getItem(LEGACY_WORKFLOW_KEY);
  if (!legacy) return;
  try {
    const workflow = coerceWorkflow(JSON.parse(legacy));
    if (!workflow) return;
    const storedOrigin = window.sessionStorage.getItem(LEGACY_ORIGIN_KEY);
    const origin = resolveWorkflowOrigin(workflow, storedOrigin);
    if (origin === "sample") {
      writeStored(SAMPLE_WORKFLOW_KEY, workflow, "sample");
    } else {
      writeStored(INFERRED_WORKFLOW_KEY, workflow, "ai_inferred");
    }
  } catch {
    // Ignore corrupt legacy session.
  }
}

export function saveSampleWorkflow(workflow: WorkflowIR): void {
  writeStored(SAMPLE_WORKFLOW_KEY, workflow, "sample");
}

export function loadSampleWorkflow(): StoredWorkflow | null {
  migrateLegacySession();
  const stored = readStored(SAMPLE_WORKFLOW_KEY);
  if (!stored) return null;
  return { ...stored, origin: "sample" };
}

export function saveInferredWorkflow(workflow: WorkflowIR): void {
  writeStored(INFERRED_WORKFLOW_KEY, workflow, "ai_inferred");
}

export function loadInferredWorkflow(): StoredWorkflow | null {
  migrateLegacySession();
  const stored = readStored(INFERRED_WORKFLOW_KEY);
  if (!stored) return null;
  return { ...stored, origin: "ai_inferred" };
}

export function clearInferredWorkflow(): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(INFERRED_WORKFLOW_KEY);
}

export function loadWorkflowBySource(
  source: WorkflowSource,
): StoredWorkflow | null {
  return source === "sample" ? loadSampleWorkflow() : loadInferredWorkflow();
}

export function saveWorkflowBySource(
  source: WorkflowSource,
  workflow: WorkflowIR,
): void {
  if (source === "sample") {
    saveSampleWorkflow(workflow);
  } else {
    saveInferredWorkflow(workflow);
  }
}

/** @deprecated Prefer saveSampleWorkflow / saveInferredWorkflow. */
export function saveWorkflowSession(
  workflow: WorkflowIR,
  origin: WorkflowOrigin,
): void {
  const resolved = resolveWorkflowOrigin(workflow, origin);
  if (resolved === "sample") {
    saveSampleWorkflow(workflow);
  } else {
    saveInferredWorkflow(workflow);
  }
}

/** @deprecated Prefer loadSampleWorkflow / loadInferredWorkflow. */
export function loadWorkflowSession(): WorkflowSession | null {
  migrateLegacySession();
  const inferred = loadInferredWorkflow();
  if (inferred) {
    return { workflow: inferred.workflow, origin: "ai_inferred" };
  }
  const sample = loadSampleWorkflow();
  if (sample) {
    return { workflow: sample.workflow, origin: "sample" };
  }
  return null;
}

export function updateWorkflowSession(workflow: WorkflowIR): WorkflowSession | null {
  const inferred = loadInferredWorkflow();
  if (inferred && !isSampleWorkflow(workflow)) {
    saveInferredWorkflow(workflow);
    return { workflow, origin: "ai_inferred" };
  }
  if (workflow.demonstration_id) {
    saveInferredWorkflow(workflow);
    return { workflow, origin: "ai_inferred" };
  }
  saveSampleWorkflow(workflow);
  return { workflow, origin: "sample" };
}

export function clearWorkflowSession(): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(SAMPLE_WORKFLOW_KEY);
  window.sessionStorage.removeItem(INFERRED_WORKFLOW_KEY);
  window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
  window.sessionStorage.removeItem(LEGACY_WORKFLOW_KEY);
  window.sessionStorage.removeItem(LEGACY_ORIGIN_KEY);
}

export function unresolvedRequiredClarifications(workflow: WorkflowIR) {
  return workflow.uncertainties.filter(
    (item) => item.required && !item.resolved,
  );
}

export type CompileReadiness = {
  supported: boolean;
  ready: boolean;
  workflow_kind: string;
  blockers: Array<{ code: string; message: string }>;
  warnings: string[];
};

export function canCompileWorkflow(
  workflow: WorkflowIR | null,
  readiness: CompileReadiness | null,
  apiConfigured: boolean,
): boolean {
  if (!workflow || !apiConfigured) return false;
  if (workflow.workflow_kind !== "invoice_approval") return false;
  if (unresolvedRequiredClarifications(workflow).length > 0) return false;
  if (!readiness?.ready) return false;
  return true;
}
