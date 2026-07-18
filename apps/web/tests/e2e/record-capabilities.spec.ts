import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function mockSettings(
  page: Page,
  payload: {
    demo_mode: boolean;
    openai_configured: boolean;
    transcription_enabled: boolean;
    ai_analysis_enabled: boolean;
  },
) {
  const body = JSON.stringify(payload);
  await page.route("**/api/v1/settings", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    }),
  );
  await page.route("http://localhost:8000/api/v1/settings", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    }),
  );
}

async function seedLocalRecording(page: Page) {
  const filePath = join(tmpdir(), `flowwright-demo-${Date.now()}.webm`);
  writeFileSync(filePath, Buffer.from("flowwright-fake-webm"));
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload existing recording" }).click(),
  ]);
  await chooser.setFiles(filePath);
  await expect(
    page.getByRole("heading", { name: "Describe what should repeat." }),
  ).toBeVisible();
}

test("demo mode shows Sample mode without environment-variable names", async ({
  page,
}) => {
  await mockSettings(page, {
    demo_mode: true,
    openai_configured: false,
    transcription_enabled: false,
    ai_analysis_enabled: false,
  });
  await page.goto("/record");
  await expect(
    page.getByRole("heading", { name: "Sample mode" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Live AI inference is currently disabled/i),
  ).toBeVisible();
  await expect(page.getByText("OPENAI_API_KEY")).toHaveCount(0);
  await expect(page.getByText("OPENAI_MODEL")).toHaveCount(0);
  await expect(page.getByText("FLOWWRIGHT_DEMO_MODE")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open sample invoice workflow" }),
  ).toBeVisible();
});

test("AI-ready capabilities show AI mode ready", async ({ page }) => {
  await mockSettings(page, {
    demo_mode: false,
    openai_configured: true,
    transcription_enabled: true,
    ai_analysis_enabled: true,
  });
  await page.goto("/record");
  await expect(
    page.getByRole("heading", { name: "AI mode ready" }),
  ).toBeVisible();
  await expect(
    page.getByText(/workflow inference are available/i),
  ).toBeVisible();
  await expect(page.getByText("AI workflow inference")).toBeVisible();
  await expect(page.getByText("Ready").first()).toBeVisible();
});

test("microphone choice is visible before recording", async ({ page }) => {
  await mockSettings(page, {
    demo_mode: true,
    openai_configured: false,
    transcription_enabled: false,
    ai_analysis_enabled: false,
  });
  await page.goto("/record");
  await expect(page.getByText(/Include microphone narration/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start recording/i }),
  ).toBeVisible();
});

test("process evidence enforces description and consent", async ({ page }) => {
  await mockSettings(page, {
    demo_mode: true,
    openai_configured: false,
    transcription_enabled: false,
    ai_analysis_enabled: false,
  });
  await page.goto("/record");
  await expect(
    page.getByRole("heading", { name: "Sample mode" }),
  ).toBeVisible();
  await seedLocalRecording(page);

  const processButton = page.getByRole("button", { name: "Process evidence" });
  await expect(processButton).toBeDisabled();
  await expect(
    page.getByText("Add a short description of the workflow."),
  ).toBeVisible();

  await page
    .getByLabel("Workflow description")
    .fill("Approve matching invoice totals");
  await expect(processButton).toBeDisabled();
  await expect(
    page.getByText("Confirm the processing disclosure."),
  ).toBeVisible();

  await page
    .getByText("I understand this upload and consent to process evidence")
    .click();
  await expect(page.getByText("Ready to process evidence.")).toBeVisible();
  await expect(processButton).toBeEnabled();
});

test("infer workflow is disabled before evidence processing", async ({
  page,
}) => {
  await mockSettings(page, {
    demo_mode: false,
    openai_configured: true,
    transcription_enabled: true,
    ai_analysis_enabled: true,
  });
  await page.goto("/record");
  await expect(
    page.getByRole("heading", { name: "AI mode ready" }),
  ).toBeVisible();
  await seedLocalRecording(page);
  const inferButton = page.getByRole("button", {
    name: "Infer workflow with AI",
  });
  await expect(inferButton).toBeDisabled();
  await expect(
    page.getByText("Process evidence before requesting AI inference."),
  ).toBeVisible();
});

test("sample invoice workflow remains accessible and AI label does not silent-start sample", async ({
  page,
}) => {
  await mockSettings(page, {
    demo_mode: true,
    openai_configured: false,
    transcription_enabled: false,
    ai_analysis_enabled: false,
  });
  await page.goto("/record");
  await expect(
    page.getByRole("heading", { name: "Sample mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open sample invoice workflow" }).first(),
  ).toBeVisible();
  await seedLocalRecording(page);
  const inferButton = page.getByRole("button", {
    name: "Infer workflow with AI",
  });
  await expect(inferButton).toBeDisabled();
  await expect(
    page.getByText(/Live AI inference is unavailable on this deployment/i),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open sample invoice workflow" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Review the workflow Flowwright inferred.",
    }),
  ).toBeVisible();
});

test("record page has no horizontal overflow at key viewports", async ({
  page,
}) => {
  await mockSettings(page, {
    demo_mode: true,
    openai_configured: false,
    transcription_enabled: false,
    ai_analysis_enabled: false,
  });
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/record");
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows, `${viewport.width}x${viewport.height}`).toBe(false);
  }
});
