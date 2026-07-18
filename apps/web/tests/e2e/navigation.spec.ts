import { expect, test } from "@playwright/test";
import { externalLinks, primaryNavItems, routes } from "../../src/lib/routes";

function navHref(label: string) {
  const item = primaryNavItems.find((entry) => entry.label === label);
  if (!item) throw new Error(`Missing nav item: ${label}`);
  return item.href;
}

function primaryNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

async function expectHref(
  locator: import("@playwright/test").Locator,
  href: string,
) {
  await expect(locator).toHaveAttribute("href", new RegExp(`${href}/?$`));
}

test("primary navigation routes Architecture and Demo separately", async ({
  page,
}) => {
  await page.goto("/");
  const architectureHref = navHref("Architecture");
  const demoHref = navHref("Demo");
  expect(architectureHref).toBe(routes.architecture);
  expect(demoHref).toBe(routes.demo);
  expect(architectureHref).not.toBe(demoHref);

  const architectureLink = primaryNav(page).getByRole("link", {
    name: "Architecture",
  });
  const demoLink = primaryNav(page).getByRole("link", {
    name: "Demo",
    exact: true,
  });
  await expectHref(architectureLink, routes.architecture);
  await expectHref(demoLink, routes.demo);
});

test("architecture page renders system content and active nav", async ({
  page,
}) => {
  await page.goto(routes.architecture);
  await expect(
    page.getByRole("heading", {
      name: "How Flowwright turns a demonstration into tested software.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Where AI stops and deterministic software begins",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(
    primaryNav(page).getByRole("link", { name: "Architecture" }),
  ).toHaveAttribute("aria-current", "page");
});

test("demo page renders workflow content and active nav", async ({ page }) => {
  await page.route("**/api/v1/workflows/demo", async (route) =>
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
        tests: [],
        confidence: 0.9,
        created_at: "2026-07-15T00:00:00Z",
      }),
    }),
  );
  await page.route("**/api/v1/workflows/compile-readiness", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        supported: true,
        ready: true,
        workflow_kind: "invoice_approval",
        blockers: [],
        warnings: [],
      }),
    }),
  );
  await page.goto(routes.demo);
  await expect(
    page.getByRole("heading", {
      name: "Explore the sample invoice workflow.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(
    primaryNav(page).getByRole("link", { name: "Demo", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    primaryNav(page).getByRole("link", { name: "Architecture" }),
  ).not.toHaveAttribute("aria-current", "page");
});

test("internal pages expose meaningful back destinations on direct open", async ({
  page,
}) => {
  await page.goto(routes.record);
  await expectHref(
    page.getByRole("link", { name: "Back to home" }),
    routes.home,
  );

  await page.goto(routes.code);
  await expectHref(
    page.getByRole("link", { name: "Back to workflow" }),
    routes.demo,
  );

  await page.goto(routes.tests);
  await expectHref(
    page.getByRole("link", { name: "Back to workflow" }),
    routes.demo,
  );
});

test("mobile navigation includes Architecture and Demo without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /toggle navigation/i }).click();
  await expect(
    primaryNav(page).getByRole("link", { name: "Architecture" }),
  ).toBeVisible();
  await expect(
    primaryNav(page).getByRole("link", { name: "Demo", exact: true }),
  ).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows).toBe(false);
});

test("header navigation flow across architecture, demo, record, and home", async ({
  page,
}) => {
  await page.route("**/api/v1/workflows/demo", async (route) =>
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
        tests: [],
        confidence: 0.9,
        created_at: "2026-07-15T00:00:00Z",
      }),
    }),
  );
  await page.route("**/api/v1/workflows/compile-readiness", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        supported: true,
        ready: true,
        workflow_kind: "invoice_approval",
        blockers: [],
        warnings: [],
      }),
    }),
  );

  await page.goto("/");
  await primaryNav(page).getByRole("link", { name: "Architecture" }).click();
  await expect(
    page.getByRole("heading", {
      name: "How Flowwright turns a demonstration into tested software.",
    }),
  ).toBeVisible();

  await primaryNav(page).getByRole("link", { name: "Demo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Explore the sample invoice workflow.",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Turn a browser task into tested software.",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Try Flowwright" }).click();
  await expect(
    page.getByRole("heading", { name: "Record the task once." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Turn a browser task into tested software.",
    }),
  ).toBeVisible();
});

test("footer includes architecture and readable links", async ({ page }) => {
  await page.goto("/");
  await expectHref(
    page.getByRole("navigation", { name: "Footer" }).getByRole("link", {
      name: "Architecture",
    }),
    routes.architecture,
  );
  await expect(
    page.getByRole("navigation", { name: "Footer" }).getByRole("link", {
      name: "Security",
    }),
  ).toHaveAttribute("href", externalLinks.security);
});
