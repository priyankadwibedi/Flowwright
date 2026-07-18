import { expect, test, type Page } from "@playwright/test";
import fixture from "../../../../packages/sample-workflows/invoice-approval.json";
import { routes } from "../../src/lib/routes";

const sampleWorkflow = structuredClone(fixture);

/** Clear session once per page; do not wipe on later navigations. */
function clearSessionOnce(page: Page) {
  return page.addInitScript(() => {
    const marker = "__flowwright_e2e_cleared";
    if (!window.sessionStorage.getItem(marker)) {
      window.sessionStorage.clear();
      window.sessionStorage.setItem(marker, "1");
    }
  });
}

function seedInferred(
  page: Page,
  workflow: unknown,
) {
  return page.addInitScript(
    ({ workflow: nextWorkflow }) => {
      window.sessionStorage.clear();
      window.sessionStorage.setItem(
        "flowwright.workflow.inferred",
        JSON.stringify({
          workflow: nextWorkflow,
          origin: "ai_inferred",
          savedAt: new Date().toISOString(),
        }),
      );
      window.sessionStorage.setItem("__flowwright_e2e_cleared", "1");
    },
    { workflow },
  );
}

function seedSample(page: Page, workflow: unknown = sampleWorkflow) {
  return page.addInitScript(
    ({ workflow: nextWorkflow }) => {
      window.sessionStorage.clear();
      window.sessionStorage.setItem(
        "flowwright.workflow.sample",
        JSON.stringify({
          workflow: nextWorkflow,
          origin: "sample",
          savedAt: new Date().toISOString(),
        }),
      );
      window.sessionStorage.setItem("__flowwright_e2e_cleared", "1");
    },
    { workflow },
  );
}

async function mockReadyApis(page: Page, workflow: unknown = sampleWorkflow) {
  await page.route("**/api/v1/workflows/demo", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workflow),
    }),
  );
  await page.route("**/api/v1/workflows/compile-readiness", async (route) => {
    const body = route.request().postDataJSON() as {
      workflow?: { uncertainties?: Array<{ required?: boolean; resolved?: boolean }> };
    };
    const unresolved =
      body.workflow?.uncertainties?.filter(
        (item) => item.required && !item.resolved,
      ) ?? [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        supported: true,
        ready: unresolved.length === 0,
        workflow_kind: "invoice_approval",
        blockers: unresolved.map(() => ({
          code: "unresolved_required_clarification",
          message: "Resolve required clarifications before compiling.",
        })),
        warnings: [],
      }),
    });
  });
  await page.route("**/api/v1/workflows/generate", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workflow_id: (workflow as { id: string }).id,
        workflow_source: "sample",
        compiler_fingerprint: "a".repeat(64),
        files: [
          {
            path: "workflow.py",
            language: "python",
            content: "print('ok')",
          },
        ],
      }),
    }),
  );
}

test("fresh demo session persists workflow into code and invoice processor", async ({
  page,
}) => {
  await clearSessionOnce(page);
  await mockReadyApis(page);

  await page.goto(routes.demo);
  await expect(
    page.getByRole("heading", { name: "Explore the sample invoice workflow." }),
  ).toBeVisible();
  await expect(
    page.locator(".eyebrow").filter({ hasText: /SAMPLE WORKFLOW/i }),
  ).toBeVisible();
  await expect(page.getByText("Confidence 94%")).toHaveCount(0);
  await expect(page.getByText("Sample definition").first()).toBeVisible();
  await expect(page.getByText(/confidence 0%/i)).toHaveCount(0);

  await page.getByRole("link", { name: "Generate and inspect code" }).click();
  await expect(page).toHaveURL(/source=sample/);
  await expect(
    page.getByRole("heading", { name: "Inspect the generated software." }),
  ).toBeVisible();
  await expect(page.getByText("print('ok')")).toBeVisible();

  await page.getByRole("link", { name: "Back to workflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Explore the sample invoice workflow." }),
  ).toBeVisible();

  await page.goto(`${routes.generatedInvoice}?source=sample`);
  await expect(
    page.getByRole("heading", { name: "Run the compiled workflow." }),
  ).toBeVisible();
  await expect(page.getByText(/No workflow is loaded/i)).toHaveCount(0);
});

test("sample journey labels and footer trademark", async ({ page }) => {
  await clearSessionOnce(page);
  await mockReadyApis(page);
  await page.goto(routes.demo);
  await expect(
    page.getByRole("heading", { name: "Explore the sample invoice workflow." }),
  ).toBeVisible();
  await expect(
    page.getByText(/Review the workflow Flowwright inferred/i),
  ).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator(".footer-wordmark")).toHaveText("flowwright");
  await expect(page.locator(".footer-wordmark")).not.toContainText("®");
  await expect(page.getByText("Sample WorkflowIR loaded")).toBeVisible();
});

test("sample and inferred routes stay isolated after Demo navigation", async ({
  page,
}) => {
  const inferred = {
    ...structuredClone(sampleWorkflow),
    id: "ai-inferred-invoice",
    confidence: 0.94,
    demonstration_id: "demo-1",
    name: "AI inferred invoice approval",
  };
  await seedInferred(page, inferred);
  await mockReadyApis(page);

  await page.goto(routes.inferred);
  await expect(
    page.getByRole("heading", {
      name: "Review the workflow Flowwright inferred.",
    }),
  ).toBeVisible();
  await expect(
    page.locator(".eyebrow").filter({ hasText: /AI-INFERRED WORKFLOW/i }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Demo", exact: true }).click();
  await expect(page).toHaveURL(/\/workflows\/demo\/?$/);
  await expect(
    page.getByRole("heading", { name: "Explore the sample invoice workflow." }),
  ).toBeVisible();
  await expect(
    page.locator(".eyebrow").filter({ hasText: /SAMPLE WORKFLOW/i }),
  ).toBeVisible();
  await expect(
    page.locator(".eyebrow").filter({ hasText: /AI-INFERRED/i }),
  ).toHaveCount(0);

  await page.goto(routes.inferred);
  await expect(
    page.getByRole("heading", {
      name: "Review the workflow Flowwright inferred.",
    }),
  ).toBeVisible();
  await expect(page.getByText("94%").first()).toBeVisible();
});

test("required clarifications block downstream actions", async ({ page }) => {
  const blocked = {
    ...structuredClone(sampleWorkflow),
    demonstration_id: "demo-blocked",
    uncertainties: [
      {
        id: "exception-delivery",
        question: "How should mismatches be delivered?",
        reason: "Needed for compiler config",
        required: true,
        allowed_options: ["draft", "human_review"],
        affected_step_ids: ["flag_exception"],
        answer_type: "single_select",
        resolution_target: "exception-delivery",
        resolved: false,
      },
    ],
  };
  await seedInferred(page, blocked);
  await mockReadyApis(page, blocked);
  await page.goto(routes.inferred);
  await expect(
    page.locator(".eyebrow").filter({ hasText: "Required clarification" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How should mismatches be delivered?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate and inspect code" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Run mandatory tests" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Open invoice processor" }),
  ).toBeDisabled();
});

test("deep inferred routes show readiness blockers", async ({ page }) => {
  const blocked = {
    ...structuredClone(sampleWorkflow),
    demonstration_id: "demo-deep",
    uncertainties: [
      {
        id: "exception-delivery",
        question: "How should mismatches be delivered?",
        reason: "Needed for compiler config",
        required: true,
        allowed_options: ["draft", "human_review"],
        affected_step_ids: ["flag_exception"],
        answer_type: "single_select",
        resolution_target: "exception-delivery",
        resolved: false,
      },
    ],
  };
  await seedInferred(page, blocked);
  await mockReadyApis(page, blocked);

  for (const path of [
    `${routes.code}?source=inferred`,
    `${routes.tests}?source=inferred`,
    `${routes.generatedInvoice}?source=inferred`,
  ]) {
    await page.goto(path);
    await expect(page.getByText(/not ready to compile/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Return to workflow review" }).first(),
    ).toBeVisible();
  }
});

test("optional questions do not block generation", async ({ page }) => {
  const optional = structuredClone(sampleWorkflow) as typeof sampleWorkflow & {
    uncertainties: Array<Record<string, unknown>>;
  };
  optional.uncertainties = [
    {
      id: "naming-preference",
      question: "Preferred exception label?",
      reason: "Cosmetic preference",
      required: false,
      allowed_options: ["exception", "mismatch"],
      affected_step_ids: [],
      answer_type: "single_select",
      resolution_target: "display",
      resolved: false,
    },
  ];
  await seedSample(page, optional);
  await mockReadyApis(page, optional);
  await page.goto(routes.demo);
  await expect(
    page.locator(".eyebrow").filter({ hasText: "Optional workflow preference" }),
  ).toBeVisible();
  await expect(page.getByText("Clarification required")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply preference" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Generate and inspect code" }),
  ).toBeVisible();
});

test("correction failures are visible", async ({ page }) => {
  await seedSample(page, sampleWorkflow);
  await mockReadyApis(page);
  await page.route("**/api/v1/workflows/correct", async (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        detail:
          "This step is required by the invoice compiler and cannot be marked accidental.",
      }),
    }),
  );
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(routes.demo);
  await page.getByRole("button", { name: "Mark accidental" }).click();
  await expect(
    page.getByText(
      "This step is required by the invoice compiler and cannot be marked accidental.",
    ),
  ).toBeVisible();
});

test("synthetic receipt wording is correct", async ({ page }) => {
  await seedSample(page, sampleWorkflow);
  await mockReadyApis(page);
  await page.route("**/api/v1/invoices/process", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        invoice_file: "invoice-exact-match.json",
        status: "approval_required",
        reason: "Human approval required",
        message: "Human approval required",
        compiler_fingerprint: "b".repeat(64),
        protected_action_executed: false,
      }),
    }),
  );
  await page.route("**/api/v1/invoices/approve", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        invoice_file: "invoice-exact-match.json",
        status: "approved",
        message: "Synthetic receipt only",
        approval_record_id: "synthetic-receipt-test",
        compiled_workflow_id: sampleWorkflow.id,
        compiler_fingerprint: "b".repeat(64),
        decision: "approved",
        recorded_at: "2026-07-18T12:00:00+00:00",
        protected_action_executed: false,
        persistent: false,
        payment_executed: false,
      }),
    }),
  );
  await page.goto(`${routes.generatedInvoice}?source=sample`);
  await page.getByRole("button", { name: /Process invoice/i }).click();
  await page.locator(".toggle-row").click();
  await page.getByRole("button", { name: /Record human approval/i }).click();
  await expect(
    page.getByText("Synthetic approval receipt generated"),
  ).toBeVisible();
  await expect(page.getByText(/Approval recorded/i)).toHaveCount(0);
  await expect(page.getByText(/Non-persistent/i)).toBeVisible();
});

test("graph and inspector have no horizontal overflow", async ({ page }) => {
  await seedSample(page, sampleWorkflow);
  await mockReadyApis(page);
  await page.goto(routes.demo);
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      page: doc.scrollWidth > doc.clientWidth + 1,
      layout: (() => {
        const el = document.querySelector(".workflow-layout");
        if (!el) return false;
        return el.scrollWidth > el.clientWidth + 1;
      })(),
    };
  });
  expect(overflow.page).toBe(false);
  expect(overflow.layout).toBe(false);
});

test("full sample journey from home through receipt copy", async ({ page }) => {
  await clearSessionOnce(page);
  await mockReadyApis(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Watch the demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Explore the sample invoice workflow." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Generate and inspect code" }).click();
  await expect(page.getByText("print('ok')")).toBeVisible();
  await page.goto(`${routes.tests}?source=sample`);
  await expect(
    page.getByRole("heading", { name: "Prove the workflow on new inputs." }),
  ).toBeVisible();
  await page.goto(`${routes.generatedInvoice}?source=sample`);
  await expect(
    page.getByRole("heading", { name: "Run the compiled workflow." }),
  ).toBeVisible();
});
