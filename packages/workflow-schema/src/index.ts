import { z } from "zod";

export const stepTypeSchema = z.enum([
  "input",
  "ai_extract",
  "lookup",
  "condition",
  "transform",
  "write",
  "draft",
  "approval",
  "human_review",
]);

export const workflowInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  data_type: z.string().min(1),
  required: z.boolean(),
  example: z.unknown().optional(),
});

export const workflowVariableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  data_type: z.string().min(1),
  source: z.string().min(1),
  sensitive: z.boolean(),
  constant: z.boolean(),
  confidence: z.number().min(0).max(1).default(0),
  evidence_ids: z.array(z.string()).default([]),
});

export const workflowStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: stepTypeSchema,
  description: z.string(),
  depends_on: z.array(z.string()),
  input_refs: z.array(z.string()),
  output_refs: z.array(z.string()),
  configuration: z.record(z.string(), z.unknown()),
  requires_ai: z.boolean(),
  requires_approval: z.boolean(),
  confidence: z.number().min(0).max(1).default(0),
  evidence_ids: z.array(z.string()).default([]),
});

export const workflowDecisionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  condition: z.string().min(1),
  true_step_id: z.string().min(1),
  false_step_id: z.string().min(1),
  source_step_id: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0),
  evidence_ids: z.array(z.string()).default([]),
});

export const workflowApprovalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  trigger: z.string().min(1),
  step_id: z.string().min(1),
  evidence_ids: z.array(z.string()).default([]),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source_step_id: z.string().min(1),
  target_step_id: z.string().min(1),
  kind: z.enum(["success", "failure", "true", "false", "review", "approval"]),
  condition: z.string().nullable().optional(),
  label: z.string().min(1),
});

export const workflowUncertaintySchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  reason: z.string().min(1),
  affected_step_ids: z.array(z.string()),
  required: z.boolean(),
});

export const workflowTestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input_case: z.record(z.string(), z.unknown()),
  expected_outcome: z.string().min(1),
  actual_outcome: z.string().nullable(),
  status: z.enum(["pending", "passed", "failed", "human_review"]),
  explanation: z.string(),
});

export const workflowIRSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  inputs: z.array(workflowInputSchema),
  variables: z.array(workflowVariableSchema),
  steps: z.array(workflowStepSchema).min(1),
  decisions: z.array(workflowDecisionSchema),
  approvals: z.array(workflowApprovalSchema),
  edges: z.array(workflowEdgeSchema).default([]),
  uncertainties: z.array(workflowUncertaintySchema).default([]),
  tests: z.array(workflowTestSchema),
  confidence: z.number().min(0).max(1),
  created_at: z.iso.datetime({ offset: true }),
});

export type WorkflowIR = z.infer<typeof workflowIRSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowTest = z.infer<typeof workflowTestSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowUncertainty = z.infer<typeof workflowUncertaintySchema>;
