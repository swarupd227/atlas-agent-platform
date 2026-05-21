import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for API-only E2E tests.
 *
 * Tests use the `request` fixture exclusively — no browser binary is required.
 * All eval-workflow assertions go through the production REST API.
 *
 * Target: https://atlas-agent-platform.replit.app  (demo mode, no auth)
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  timeout: 10 * 60 * 1000,  // 10 min: LLM eval + polling
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "https://atlas-agent-platform.replit.app",
    extraHTTPHeaders: { "Content-Type": "application/json" },
    // No browser project — pure API testing via request fixture
  },
});
