import { workflowIRSchema, type WorkflowIR } from "@flowwright/workflow-schema";
import fixture from "../../../../packages/sample-workflows/invoice-approval.json";

export const sampleWorkflow: WorkflowIR = workflowIRSchema.parse(fixture);
