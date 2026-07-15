import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import { API_URL } from "./config";

export async function getDemoWorkflow(): Promise<WorkflowIR> {
  const response = await fetch(`${API_URL}/api/v1/workflows/demo`, {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Workflow request failed (${response.status})`);
  return workflowIRSchema.parse(await response.json());
}
