import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm build && pnpm start",
    env: { NEXT_PUBLIC_FLOWWRIGHT_API_URL: "http://localhost:8000" },
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
