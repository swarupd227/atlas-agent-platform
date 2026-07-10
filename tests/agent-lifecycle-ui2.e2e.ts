/**
 * Agent Lifecycle — extended FULL-UI coverage (round 2).
 *
 *   UI-4. Outcome CTA regression — Quick-Create outcome (pending_review) must
 *         now show the "Create agents for this outcome" CTA (fix for finding #4/#7).
 *   UI-5. HIGH-risk deploy — wizard-created HIGH-risk agent → Deploy; exercise
 *         the strategy-recommendation dialog (canary) when it appears.
 *   UI-6. Use Template from catalog — /templates → "Use This Template" →
 *         wizard/team flow through the UI.
 *
 * All writes are clicks; REST is read-back verification only.
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const TS = Date.now();
const tag = (s: string) => `[E2E-UI2] ${s} ${TS}`;

async function primePage(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("almp-industry", "cross_industry");
    localStorage.setItem("almp-role", "admin");
  });
}

async function dismissOnboarding(page: Page) {
  try {
    const skip = page.getByTestId("button-skip-workspace");
    if (await skip.isVisible({ timeout: 2500 })) {
      await skip.click();
      await page.locator("[data-testid='industry-workspace-selector']").waitFor({ state: "hidden", timeout: 5000 });
    }
  } catch { /* not shown */ }
}

async function findAgentByName(request: APIRequestContext, name: string): Promise<any | null> {
  const res = await request.get("/api/agents");
  if (!res.ok()) return null;
  const body = await res.json();
  const agents: any[] = Array.isArray(body) ? body : (body.agents ?? []);
  return agents.find((a) => a.name === name) ?? null;
}

/** Advance the wizard from the current step until Create, choosing Start Blank when offered. */
async function finishWizard(page: Page) {
  const createBtn = page.getByTestId("button-create-agent");
  for (let i = 0; i < 10; i++) {
    if (await createBtn.isVisible().catch(() => false)) break;
    const blank = page.getByTestId("card-blueprint-blank");
    if (await blank.isVisible().catch(() => false)) await blank.click().catch(() => {});
    await page.getByTestId("button-next-step").click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await expect(createBtn, "wizard must reach Review & Create").toBeVisible({ timeout: 10000 });
  await createBtn.click();
}

// ─── UI-4 — Outcome CTA regression (fix #4/#7) ──────────────────────────────

test("UI-4. Outcome CTA: quick-create (pending_review) outcome shows Create-Agent CTA", async ({ page }) => {
  test.setTimeout(150000);
  const outcomeName = tag("CTA Regression Outcome");

  await primePage(page);
  await page.goto("/outcomes");
  await dismissOnboarding(page);
  const entry = page.getByTestId("button-create-outcome")
    .or(page.getByTestId("button-start-outcome"))
    .or(page.getByTestId("button-create-first-outcome"));
  await entry.first().click();
  await page.waitForURL(/\/outcomes\/discover/, { timeout: 15000 });

  await page.getByTestId("button-mode-form").click();
  await page.getByTestId("card-form-blank").click();
  await page.getByTestId("input-form-name").fill(outcomeName);
  await page.getByTestId("button-form-create").click();
  await expect(page.getByTestId("text-form-success")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("button-form-continue-to-agents").click();
  await page.waitForURL(/\/outcomes\/[0-9a-f-]{36}/, { timeout: 15000 });

  // THE regression assertion: before the fix, pending_review outcomes never
  // showed the CTA banner; now every pre-plan status must.
  await expect(
    page.getByTestId("button-create-agent-for-outcome"),
    "pending_review outcome must show the Create-Agent CTA (regression for finding #4/#7)",
  ).toBeVisible({ timeout: 20000 });
  console.log("  ✓ CTA banner visible on pending_review outcome (fix verified)");
});

// ─── UI-5 — HIGH-risk deploy exercises the strategy dialog ──────────────────

test("UI-5. Deploy HIGH-risk agent: strategy-recommendation dialog path", async ({ page, request }) => {
  test.setTimeout(240000);
  const agentName = tag("High Risk Agent");

  await primePage(page);
  await page.goto("/agents/wizard");
  await dismissOnboarding(page);
  await expect(page.getByTestId("page-agent-wizard")).toBeVisible({ timeout: 15000 });

  await page.getByTestId("input-agent-name").fill(agentName);
  await page.getByTestId("input-agent-description").fill("High-risk E2E agent for canary-dialog coverage.");
  // Set risk tier to HIGH via the Radix select
  await page.getByTestId("select-risk-tier").click();
  await page.getByRole("option", { name: /HIGH/i }).first().click();
  await page.getByTestId("button-next-step").click();

  await page.getByTestId("path-manual").click();
  await page.getByTestId("button-next-step").click();
  await finishWizard(page);

  let agent: any = null;
  await expect
    .poll(async () => { agent = await findAgentByName(request, agentName); return !!agent; },
      { timeout: 30000, intervals: [1000, 2000, 3000] })
    .toBe(true);
  expect(agent.riskTier, "wizard must persist the HIGH risk tier").toBe("HIGH");
  console.log(`  ✓ HIGH-risk agent created via UI: ${agent.id}`);

  await page.goto(`/agents/${agent.id}`);
  await dismissOnboarding(page);
  const deployBtn = page.getByTestId("button-deploy").or(page.getByTestId("button-new-deployment-version"));
  await expect(deployBtn.first()).toBeVisible({ timeout: 20000 });
  await deployBtn.first().click();

  // Fail-closed gate (fix #10): the strategy dialog MUST appear for HIGH risk,
  // even if the recommendation query is still resolving when Deploy is clicked.
  const canaryBtn = page.getByTestId("button-deploy-canary-recommended");
  await expect(canaryBtn, "HIGH-risk deploy must surface the canary strategy dialog (fail-closed gate)").toBeVisible({ timeout: 10000 });
  await canaryBtn.click();
  console.log("  ✓ canary-recommended dialog exercised");

  await page.waitForURL(/\/deployments\/[0-9a-f-]{36}/, { timeout: 30000 });
  const deploymentId = page.url().match(/\/deployments\/([0-9a-f-]{36})/)?.[1] ?? "";
  const dep = ((await (await request.get("/api/deployments")).json()) as any[]).find((d) => d.id === deploymentId);
  expect(dep, "deployment must persist").toBeTruthy();
  expect(dep.rolloutStrategy, "choosing the recommended strategy must produce a canary rollout").toBe("canary");
  console.log(`  ✓ deployed: ${deploymentId} strategy=${dep?.rolloutStrategy} status=${dep?.status}`);
});

// ─── UI-6 — Use Template from the catalog ────────────────────────────────────

test("UI-6. Templates catalog: 'Use This Template' → wizard/team flow", async ({ page, request }) => {
  test.setTimeout(240000);

  const before = new Set<string>(((await (await request.get("/api/agents")).json()) as any[]).map((a: any) => a.id));

  // Pick a single-agent template (read-only) and use its DETAIL page — the
  // catalog's Use-Template button lives inside a detail panel, and the detail
  // route exposes the same button-use-template directly.
  const tpls: any[] = await (await request.get("/api/agent-templates")).json();
  const single = tpls.find((t) => (t.blueprintJson?.templateType ?? "single") !== "team") ?? tpls[0];
  expect(single, "a template must exist in the catalog").toBeTruthy();

  await primePage(page);
  await page.goto(`/templates/${single.id}`);
  await dismissOnboarding(page);

  const useBtn = page.getByTestId("button-use-template").first();
  await expect(useBtn, "template detail must expose the Use-Template action").toBeVisible({ timeout: 20000 });
  const label = (await useBtn.innerText()).trim();
  await useBtn.click();

  if (/team/i.test(label)) {
    // Team template path routes to the teams surface
    await page.waitForURL(/\/agents\/teams/, { timeout: 20000 });
    console.log(`  ✓ team template routed to /agents/teams ("${label}")`);
    return;
  }

  // Single-agent path: wizard opens prefilled from the template
  await page.waitForURL(/\/agents\/wizard\?templateId=/, { timeout: 20000 });
  console.log(`  ✓ catalog routed to wizard with templateId ("${label}")`);
  await finishWizard(page);

  let created: any = null;
  await expect
    .poll(async () => {
      const all = (await (await request.get("/api/agents")).json()) as any[];
      created = all.find((a) => !before.has(a.id)) ?? null;
      return !!created;
    }, { message: "catalog Use-Template must create an agent", timeout: 30000, intervals: [1000, 2000, 3000] })
    .toBe(true);

  // Fix #3 verification: provenance is now a first-class column.
  console.log(`  ✓ agent created from catalog: ${created.id} sourceTemplateId=${created.sourceTemplateId ?? "NOT SET"}`);
  expect(created.sourceTemplateId, "agent must persist first-class sourceTemplateId (fix #3)").toBeTruthy();
});
