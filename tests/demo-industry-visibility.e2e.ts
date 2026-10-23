import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const credentialsPath = process.env.E2E_DEMO_CREDENTIALS_FILE;
const credentials: { accounts: { username: string; password: string }[] } = credentialsPath ? JSON.parse(readFileSync(credentialsPath, "utf8")) : { accounts: [] };
test.use({ storageState: { cookies: [], origins: [] }, trace: "off", video: "off", extraHTTPHeaders: {} });
test.skip(!credentialsPath, "Set E2E_DEMO_CREDENTIALS_FILE to the private Dev account artifact.");

for (const scenario of [
  { username: "hilti.demo1", expected: ["manufacturing", "custom"], stale: "financial_services" },
  { username: "hilti.demo2", expected: ["manufacturing"], stale: "financial_services" },
  { username: "finance.demo1", expected: ["financial_services", "custom"], stale: "manufacturing" },
]) {
  test(`${scenario.username} sees only assigned industries after signing in`, async ({ page }) => {
    const account = credentials.accounts.find(a => a.username === scenario.username)!;
    expect(account).toBeTruthy();
    const login = await page.request.post("/api/auth/login", { data: { username: account.username, password: account.password } });
    expect(login.status()).toBe(200);
    await page.addInitScript(stale => { localStorage.setItem("almp-industry", stale); localStorage.setItem("almp-role", "admin"); }, scenario.stale);
    await page.goto("/agents");
    await expect(page.getByTestId("text-current-user")).toContainText(`${scenario.username} (agent_engineer)`);
    await expect(page.getByTestId("button-industry-selector")).toContainText(scenario.username === "finance.demo1" ? "FinServ" : "Mfg");
    await page.getByTestId("button-industry-selector").click();
    const menu = page.getByTestId("menu-industry-selector");
    await expect(menu.locator('[data-testid^="menu-item-industry-"]')).toHaveCount(scenario.expected.length);
    for (const id of scenario.expected) await expect(menu.getByTestId(`menu-item-industry-${id}`)).toBeVisible();
    await expect(menu.getByTestId("menu-item-industry-insurance")).toHaveCount(0);
    const denied = await page.request.put("/api/admin/demo-users/settings", { data: { enabled: false } });
    expect(denied.status()).toBe(403);
    if (scenario.username === "hilti.demo2") {
      await page.keyboard.press("Escape");
      await page.goto("/knowledge-bases");
      await page.getByTestId("button-create-kb").click();
      await expect(page.getByTestId("select-kb-industry")).toContainText("Manufacturing");
      await page.getByTestId("select-kb-industry").click();
      await expect(page.getByRole("option")).toHaveCount(1);
      await expect(page.getByRole("option")).toContainText("Manufacturing");
    }
  });
}

test("administrator sees all industry choices and edits the existing real accounts", async ({ page }) => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, "Set E2E_ADMIN_PASSWORD for the existing Dev administrator.");
  const login = await page.request.post("/api/auth/login", { data: { username: process.env.E2E_ADMIN_USERNAME ?? "admin", password: process.env.E2E_ADMIN_PASSWORD } });
  expect(login.status()).toBe(200);
  await page.goto("/admin");
  await page.getByTestId("tab-demo-users").click();
  await expect(page.getByTestId("table-demo-users")).toContainText("hilti.demo1");
  const response = await page.request.get("/api/admin/demo-users");
  const { users } = await response.json();
  const user = users.find((u: any) => u.username === "hilti.demo1");
  await page.getByTestId(`button-edit-demo-user-${user.id}`).click();
  await expect(page.getByTestId("checkbox-demo-industry-manufacturing")).toBeChecked();
  await expect(page.getByTestId("checkbox-demo-industry-custom")).toBeChecked();
  await expect(page.getByTestId("checkbox-demo-industry-insurance")).toBeVisible();
  await expect(page.getByTestId("checkbox-demo-industry-insurance")).not.toBeChecked();
  await expect(page.getByTestId("dialog-demo-user").locator('[data-testid^="checkbox-demo-industry-"]')).toHaveCount(9);
  await page.getByTestId("button-cancel-demo-user").click();
  await page.getByTestId("button-create-demo-user").click();
  await expect(page.getByTestId("input-demo-username")).toBeVisible();
  await expect(page.getByTestId("input-demo-password")).toHaveAttribute("type", "password");
  await expect(page.getByTestId("button-save-demo-user")).toBeDisabled();
  await page.getByTestId("button-cancel-demo-user").click();
});
