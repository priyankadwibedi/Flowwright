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
          workflow_kind: "invoice_approval",
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
          uncertainties: [],
          tests: [
            {
              id: "exact",
              name: "Matching invoice",
              input_case: { invoice_file: "invoice-exact-match.json" },
              expected_outcome: "approval_required",
              actual_outcome: "approval_required",
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
  await page.route(
    "http://localhost:8000/api/v1/workflows/test",
    async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workflow_id: "invoice-approval-demo",
          started_at: "2026-07-15T00:00:00Z",
          completed_at: "2026-07-15T00:00:01Z",
          executions: [
            {
              test_id: "exact",
              name: "Matching invoice",
              input_case: { invoice_file: "invoice-exact-match.json" },
              expected_outcome: "approval_required",
              actual_outcome: "approval_required",
              status: "passed",
              duration_ms: 4,
              explanation: "Approval gate reached.",
              logs: [],
            },
            {
              test_id: "mismatch",
              name: "Amount mismatch",
              input_case: { invoice_file: "invoice-amount-mismatch.json" },
              expected_outcome: "exception",
              actual_outcome: "exception",
              status: "passed",
              duration_ms: 4,
              explanation: "Mismatch routed to exception.",
              logs: [],
            },
            {
              test_id: "missing",
              name: "Missing purchase order",
              input_case: { invoice_file: "invoice-missing-po.json" },
              expected_outcome: "human_review",
              actual_outcome: "human_review",
              status: "human_review",
              duration_ms: 4,
              explanation: "Missing PO requires review.",
              logs: [],
            },
            {
              test_id: "unreadable",
              name: "Unreadable invoice number",
              input_case: { invoice_file: "invoice-unreadable-number.json" },
              expected_outcome: "human_review",
              actual_outcome: "human_review",
              status: "human_review",
              duration_ms: 4,
              explanation: "Unreadable number requires review.",
              logs: [],
            },
          ],
          passed: 2,
          failed: 0,
          human_review_count: 2,
          unsafe_actions_executed: 0,
        }),
      }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Turn a browser task into tested software.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Watch the demo" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Review the workflow Flowwright inferred.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Invoice approval/i).first()).toBeVisible();
  await expect(page.locator(".workflow-canvas")).toBeVisible();
  await page.goto("/tests");
  await expect(page.getByText("Matching invoice")).toBeVisible();
  await expect(page.getByText("Unreadable invoice number")).toBeVisible();
});

test("mobile navigation and layout stay usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /toggle navigation/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /toggle navigation/i }).click();
  await expect(
    page.getByRole("link", { name: "Try Flowwright" }),
  ).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows).toBe(false);
});

test("record page uses centered layout without horizontal overflow", async ({
  page,
}) => {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/record");
    await expect(
      page.getByRole("heading", { name: "Record the task once." }),
    ).toBeVisible();
    await expect(page.locator(".record-layout")).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows, `${viewport.width}x${viewport.height}`).toBe(false);
  }
});
