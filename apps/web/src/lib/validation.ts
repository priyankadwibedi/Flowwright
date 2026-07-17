export {
  workflowIRSchema,
  workflowTestSchema,
  type WorkflowIR,
  type WorkflowTest,
} from "@flowwright/workflow-schema";

import { z } from "zod";

export const capturedFrameSchema = z.object({
  id: z.string(),
  frame_index: z.number(),
  timestamp_seconds: z.number(),
  width: z.number(),
  height: z.number(),
  mime_type: z.literal("image/jpeg"),
  image_base64: z.string().min(1),
});

export const transcriptSegmentSchema = z.object({
  id: z.string(),
  start_seconds: z.number(),
  end_seconds: z.number(),
  text: z.string(),
});

export const browserEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  elapsed_ms: z.number(),
  tab_id: z.number(),
  url: z.string(),
  type: z.enum(["click", "input", "navigation", "submit"]),
  selector: z.string(),
  element_role: z.string().nullable(),
  label: z.string().nullable(),
  value_policy: z.enum(["omitted", "masked", "captured"]),
  value: z.string().nullable(),
  description: z.string().nullable(),
});

export const evidenceItemSchema = z.object({
  id: z.string(),
  timestamp_seconds: z.number(),
  source: z.enum(["frame", "browser_event", "speech"]),
  content: z.string(),
  frame_id: z.string().nullable().optional(),
  image_base64: z.string().nullable().optional(),
  metadata: z.array(z.object({ key: z.string(), value: z.string() })),
  observation_kind: z.enum(["direct", "inferred"]).default("direct"),
  confidence: z.number().min(0).max(1).default(1),
});

export const processedDemonstrationSchema = z.object({
  demonstration_id: z.string().optional().default(""),
  duration_seconds: z.number(),
  frames: z.array(capturedFrameSchema),
  transcript: z.string(),
  transcript_segments: z.array(transcriptSegmentSchema),
  transcription_status: z.enum([
    "available",
    "unavailable",
    "not_requested",
    "failed",
    "rate_limited",
    "timeout",
    "invalid_response",
    "missing_audio",
    "missing_api_key",
  ]),
  audio_status: z.enum(["available", "missing", "unavailable", "not_checked"]),
  browser_events: z.array(browserEventSchema),
  evidence_timeline: z.array(evidenceItemSchema),
});

export type ProcessedDemonstration = z.infer<
  typeof processedDemonstrationSchema
>;

export const testExecutionSchema = z.object({
  test_id: z.string(),
  name: z.string(),
  input_case: z.record(z.string(), z.string()),
  expected_outcome: z.string(),
  actual_outcome: z.string(),
  status: z.enum(["passed", "failed", "human_review"]),
  duration_ms: z.number(),
  explanation: z.string(),
  logs: z.array(z.string()),
});

export const artifactExecutionSchema = z
  .object({
    exit_code: z.number(),
    duration_ms: z.number(),
    stdout: z.string(),
    stderr: z.string(),
    timed_out: z.boolean(),
    artifact_paths: z.array(z.string()),
  })
  .nullable()
  .optional();

export const testRunResponseSchema = z.object({
  workflow_id: z.string(),
  started_at: z.string(),
  completed_at: z.string(),
  executions: z.array(testExecutionSchema),
  passed: z.number(),
  failed: z.number(),
  human_review_count: z.number(),
  unsafe_actions_executed: z.number(),
  artifact_execution: artifactExecutionSchema,
  generator_version: z.string().nullable().optional(),
  compiler_fingerprint: z.string().nullable().optional(),
});

export type TestRunResponse = z.infer<typeof testRunResponseSchema>;
export type TestExecution = z.infer<typeof testExecutionSchema>;
