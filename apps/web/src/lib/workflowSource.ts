import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { API_CONFIGURED, API_URL } from "./config";
import { fetchCompileReadiness } from "./compileReadiness";
import { sampleWorkflow } from "./sampleWorkflow";
import {
  loadInferredWorkflow,
  loadSampleWorkflow,
  parseWorkflowSource,
  saveSampleWorkflow,
  unresolvedRequiredClarifications,
  type CompileReadiness,
  type WorkflowSource,
} from "./workflowSession";
import { routes } from "./routes";

export type LoadedWorkflowSource =
  | {
      ok: true;
      source: WorkflowSource;
      workflow: WorkflowIR;
      readiness: CompileReadiness;
    }
  | {
      ok: false;
      source: WorkflowSource | null;
      error: string;
      blockers?: CompileReadiness["blockers"];
      reviewHref: string;
    };

export function readWorkflowSourceFromWindow(): WorkflowSource | null {
  if (typeof window === "undefined") return null;
  return parseWorkflowSource(
    new URLSearchParams(window.location.search).get("source"),
  );
}

async function loadSampleOrRefetch(): Promise<WorkflowIR> {
  const stored = loadSampleWorkflow();
  if (stored) return stored.workflow;
  if (API_CONFIGURED && API_URL) {
    try {
      const response = await fetch(`${API_URL}/api/v1/workflows/demo`);
      if (response.ok) {
        const workflow = workflowIRSchema.parse(await response.json());
        saveSampleWorkflow(workflow);
        return workflow;
      }
    } catch {
      // Fall through to bundled sample.
    }
  }
  saveSampleWorkflow(sampleWorkflow);
  return sampleWorkflow;
}

export async function loadWorkflowForSource(
  sourceParam: string | null,
): Promise<LoadedWorkflowSource> {
  const source = parseWorkflowSource(sourceParam);
  if (!source) {
    return {
      ok: false,
      source: null,
      error:
        'Unknown workflow source. Use ?source=sample or ?source=inferred.',
      reviewHref: routes.demo,
    };
  }

  if (source === "sample") {
    const workflow = await loadSampleOrRefetch();
    const readiness = await fetchCompileReadiness(workflow);
    if (
      unresolvedRequiredClarifications(workflow).length > 0 ||
      !readiness.ready
    ) {
      return {
        ok: false,
        source,
        error: "This workflow is not ready to compile.",
        blockers: readiness.blockers.length
          ? readiness.blockers
          : unresolvedRequiredClarifications(workflow).map((item) => ({
              code: "unresolved_required_clarification",
              message: `Resolve the ${item.id} question.`,
            })),
        reviewHref: routes.demo,
      };
    }
    return { ok: true, source, workflow, readiness };
  }

  const inferred = loadInferredWorkflow();
  if (!inferred) {
    return {
      ok: false,
      source,
      error:
        "No inferred workflow is available. Record and analyze a demonstration first.",
      reviewHref: routes.record,
    };
  }
  const readiness = await fetchCompileReadiness(inferred.workflow);
  if (
    unresolvedRequiredClarifications(inferred.workflow).length > 0 ||
    !readiness.ready
  ) {
    return {
      ok: false,
      source,
      error: "This workflow is not ready to compile.",
      blockers: readiness.blockers.length
        ? readiness.blockers
        : unresolvedRequiredClarifications(inferred.workflow).map((item) => ({
            code: "unresolved_required_clarification",
            message: `Resolve the ${item.id} question.`,
          })),
      reviewHref: routes.inferred,
    };
  }
  return {
    ok: true,
    source,
    workflow: inferred.workflow,
    readiness,
  };
}
