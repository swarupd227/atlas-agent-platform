/**
 * Auth setup for the E2E suite. Runs once before every *.e2e.ts spec and
 * saves a logged-in browser storage state that all of them reuse.
 *
 * The suite was originally written only against demo-mode targets (no real
 * auth), so this is a no-op there. Against a production-mode target (e.g.
 * the Azure deployment) it performs a real login via the UI using
 * E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD.
 */
import { test as setup } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, ".auth", "admin.json");

setup("authenticate", async ({ page, request }) => {
  const modeRes = await request.get("/api/auth/mode");
  const { mode } = await modeRes.json();

  if (mode !== "production") {
    // Demo mode auto-authenticates client-side -- nothing to persist.
    await page.context().storageState({ path: authFile });
    return;
  }

  const username = process.env.E2E_ADMIN_USERNAME || "admin";
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "E2E_ADMIN_PASSWORD env var is required — the target (E2E_BASE_URL) is running in production security mode.",
    );
  }

  await page.goto("/dashboard");
  await page.getByTestId("input-username").fill(username);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login-submit").click();
  await page.getByTestId("page-login").waitFor({ state: "detached", timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
