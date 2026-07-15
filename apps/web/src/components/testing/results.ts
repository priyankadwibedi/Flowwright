import type { WorkflowTest } from "@flowwright/workflow-schema";

export function runInvoiceTests(tests: WorkflowTest[]) {
  return tests.map((test) => ({
    id: test.id,
    name: test.name,
    input_case: { invoice_file: String(test.input_case.invoice_file ?? "") },
    expected_outcome: test.expected_outcome,
    actual_outcome: test.actual_outcome ?? "pending",
    status: test.status,
    explanation: test.explanation,
  }));
}
