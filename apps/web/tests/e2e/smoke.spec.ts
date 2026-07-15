import { expect, test } from "@playwright/test";

test("home, invoice demo, graph, and test results are reachable", async ({
  page,
}) => {
  await page.route(
    "http://localhost:8000/api/v1/workflows/demo",
    async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "invoice-approval-demo",
          name: "Invoice approval",
          description: "Synthetic invoice workflow",
          version: "0.1.0",
          inputs: [],
          variables: [],
          steps: [
            {
              id: "invoice_upload",
              name: "Invoice upload",
              type: "input",
              description: "",
              depends_on: [],
              input_refs: [],
              output_refs: [],
              configuration: {},
              requires_ai: false,
              requires_approval: false,
            },
          ],
          decisions: [],
          approvals: [],
          tests: [
            {
              id: "exact",
              name: "Matching invoice",
              input_case: { invoice_file: "invoice-exact-match.json" },
              expected_outcome: "approved",
              actual_outcome: "approved",
              status: "passed",
              explanation: "",
            },
            {
              id: "mismatch",
              name: "Amount mismatch",
              input_case: { invoice_file: "invoice-amount-mismatch.json" },
              expected_outcome: "exception",
              actual_outcome: "exception",
              status: "passed",
              explanation: "",
            },
            {
              id: "missing",
              name: "Missing purchase order",
              input_case: { invoice_file: "invoice-missing-po.json" },
              expected_outcome: "human_review",
              actual_outcome: "human_review",
              status: "human_review",
              explanation: "",
            },
            {
              id: "unreadable",
              name: "Unreadable invoice number",
              input_case: { invoice_file: "invoice-unreadable-number.json" },
              expected_outcome: "human_review",
              actual_outcome: "human_review",
              status: "human_review",
              explanation: "",
            },
          ],
          confidence: 0.9,
          created_at: "2026-07-15T00:00:00Z",
        }),
      }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Turn the way you work into software."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Load invoice demo" }).click();
  await expect(page.getByText("Workflow graph")).toBeVisible();
  await page.goto("/tests");
  await expect(page.getByText("Matching invoice")).toBeVisible();
  await expect(page.getByText("Unreadable invoice number")).toBeVisible();
});
