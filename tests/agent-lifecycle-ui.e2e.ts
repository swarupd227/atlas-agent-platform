/**
 * Agent Lifecycle — FULL UI flows (no API writes).
 *
 * Complements agent-lifecycle.e2e.ts: every state-changing action here is a
 * real click/keystroke in the browser. The REST API is used ONLY for read-back
 * verification (GET), never to create/act.
 *
 *   UI-1. Outcome Builder form  — /outcomes → Quick Create form → outcome persisted
 *   UI-2. Deploy button         — wizard-created agent → agent-detail Deploy → deployment persisted
 *   UI-3. Run via Playground    — wizard-created agent → chat session → live LLM reply rendered
 *
 * Target: local build (E2E_BASE_URL=http://localhost:5000, demo mode).
 * All artefacts prefixed [E2E-UI].
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const TS = Date.now();
const tag = (s: string) => `[E2E-UI] ${s} ${TS}`;

// ─── shared helpers ──────────────────────────────────────────────────────────

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
  } catch { /* overlay not shown */ }
}

async function findAgentByName(request: APIRequestContext, name: string): Promise<any | null> {
  const res = await request.get("/api/agents");
  if (!res.ok()) return null;
  const body = await res.json();
  const agents: any[] = Array.isArray(body) ? body : (body.agents ?? []);
  return agents.find((a) => a.name === name) ?? null;
}

/** Create an agent entirely through the wizard UI ("Build from Scratch" + Start Blank). */
async function createAgentViaWizardUI(page: Page, request: APIRequestContext, agentName: string): Promise<any> {
  await page.goto("/agents/wizard");
  await dismissOnboarding(page);
  await expect(page.getByTestId("page-agent-wizard")).toBeVisible({ timeout: 15000 });

  await page.getByTestId("input-agent-name").fill(agentName);
  await page.getByTestId("input-agent-description").fill("Full-UI E2E agent. Safe to delete.");
  await page.getByTestId("button-next-step").click();

  await expect(page.getByTestId("path-manual")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("path-manual").click();
  await page.getByTestId("button-next-step").click();

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

  let agent: any = null;
  await expect
    .poll(async () => { agent = await findAgentByName(request, agentName); return !!agent; },
      { message: `wizard-created agent "${agentName}" must persist`, timeout: 30000, intervals: [1000, 2000, 3000] })
    .toBe(true);
  return agent;
}

// ─── UI-1 — Outcome Builder form ─────────────────────────────────────────────

test("UI-1. Outcome Builder: Quick Create form → outcome persisted", async ({ page, request }) => {
  test.setTimeout(150000);
  const outcomeName = tag("Invoice Dispute Resolution");

  await primePage(page);
  await page.goto("/outcomes");
  await dismissOnboarding(page);

  // Entry point (admin header button, with business/empty-state fallbacks)
  const entry = page.getByTestId("button-create-outcome")
    .or(page.getByTestId("button-start-outcome"))
    .or(page.getByTestId("button-create-first-outcome"));
  await expect(entry.first(), "outcomes page must expose a create-outcome entry point").toBeVisible({ timeout: 15000 });
  await entry.first().click();
  await page.waitForURL(/\/outcomes\/discover/, { timeout: 15000 });

  // Choose the manual "Quick Create" builder, blank template
  await page.getByTestId("button-mode-form").click();
  await expect(page.getByTestId("card-form-blank"), "blank template card must render").toBeVisible({ timeout: 10000 });
  await page.getByTestId("card-form-blank").click();

  // Fill the form
  await expect(page.getByTestId("form-step-configure"), "configure step must render").toBeVisible({ timeout: 10000 });
  await page.getByTestId("input-form-name").fill(outcomeName);
  await page.getByTestId("input-form-description").fill("Full-UI E2E outcome. Safe to delete.");

  // Add one KPI through the UI
  await page.getByTestId("button-form-add-kpi").click().catch(() => {});
  if (await page.getByTestId("input-form-kpi-name-0").isVisible().catch(() => false)) {
    await page.getByTestId("input-form-kpi-name-0").fill("Resolution Rate");
    await page.getByTestId("input-form-kpi-target-0").fill("90");
    await page.getByTestId("input-form-kpi-unit-0").fill("percent");
  }

  // Submit
  await expect(page.getByTestId("button-form-create"), "Launch This Plan must enable once named").toBeEnabled({ timeout: 5000 });
  await page.getByTestId("button-form-create").click();

  // Success screen → continue to the outcome detail
  await expect(page.getByTestId("text-form-success"), "success screen must confirm creation").toBeVisible({ timeout: 30000 });
  await page.getByTestId("button-form-continue-to-agents").click();
  await page.waitForURL(/\/outcomes\/[0-9a-f-]{36}/, { timeout: 15000 });
  const outcomeId = page.url().match(/\/outcomes\/([0-9a-f-]{36})/)?.[1] ?? "";
  console.log(`  ✓ outcome created via UI: ${outcomeId}`);

  // Read-back verification only (GET)
  const res = await request.get(`/api/outcomes/${outcomeId}`);
  expect(res.ok(), `GET /api/outcomes/${outcomeId} → ${res.status()}`).toBeTruthy();
  const outcome = await res.json();
  expect(outcome.name, "persisted outcome must carry the form name").toBe(outcomeName);
  console.log(`  ✓ persisted: name ok, status=${outcome.status}, riskTier=${outcome.riskTier}`);
});

// ─── UI-2 — Deploy via agent-detail button ───────────────────────────────────

test("UI-2. Deploy: agent-detail Deploy button → deployment persisted", async ({ page, request }) => {
  test.setTimeout(240000);
  const agentName = tag("Deployable Agent");

  await primePage(page);
  const agent = await createAgentViaWizardUI(page, request, agentName);
  console.log(`  ✓ agent created via wizard UI: ${agent.id}`);

  await page.goto(`/agents/${agent.id}`);
  await dismissOnboarding(page);

  // Header deploy control (first deploy vs. new-version variants)
  const deployBtn = page.getByTestId("button-deploy").or(page.getByTestId("button-new-deployment-version"));
  await expect(deployBtn.first(), "agent detail must expose a Deploy control").toBeVisible({ timeout: 20000 });
  await deployBtn.first().click();

  // Strategy-recommendation dialog may or may not appear
  const fullOverride = page.getByTestId("button-deploy-full-override");
  const canary = page.getByTestId("button-deploy-canary-recommended");
  if (await fullOverride.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fullOverride.click();
    console.log("  ✓ strategy dialog → Full rollout chosen");
  } else if (await canary.isVisible().catch(() => false)) {
    await canary.click();
    console.log("  ✓ strategy dialog → Canary (recommended) chosen");
  } else {
    console.log("  ~ direct deploy (no strategy dialog)");
  }

  // Success signal: navigation to the new deployment's detail page
  await page.waitForURL(/\/deployments\/[0-9a-f-]{36}/, { timeout: 30000 });
  const deploymentId = page.url().match(/\/deployments\/([0-9a-f-]{36})/)?.[1] ?? "";
  expect(deploymentId, "deploy must navigate to /deployments/:id").toBeTruthy();
  console.log(`  ✓ deployed via UI: deployment ${deploymentId}`);

  // Read-back verification only (GET)
  const res = await request.get("/api/deployments");
  expect(res.ok()).toBeTruthy();
  const deployments: any[] = await res.json();
  const dep = deployments.find((d) => d.id === deploymentId);
  expect(dep, "deployment must be persisted").toBeTruthy();
  expect(dep.agentId, "deployment must reference the UI-created agent").toBe(agent.id);
  console.log(`  ✓ persisted: env=${dep.environment} strategy=${dep.rolloutStrategy} status=${dep.status}`);
});

// ─── UI-3 — Run via Playground chat ──────────────────────────────────────────

test("UI-3. Run: Playground chat → live LLM reply rendered in UI", async ({ page, request }) => {
  test.setTimeout(300000);
  const agentName = tag("Playground Agent");

  await primePage(page);
  const agent = await createAgentViaWizardUI(page, request, agentName);
  console.log(`  ✓ agent created via wizard UI: ${agent.id}`);

  await page.goto(`/agents/${agent.id}/playground`);
  await dismissOnboarding(page);

  // Start a session (empty-state or sidebar button)
  const startSession = page.getByTestId("button-start-session").or(page.getByTestId("button-new-session"));
  await expect(startSession.first(), "playground must offer a session start control").toBeVisible({ timeout: 20000 });
  await startSession.first().click();

  // Send a prompt
  const input = page.getByTestId("input-chat-message").last();
  await expect(input, "chat input must render after session start").toBeVisible({ timeout: 15000 });
  await input.fill("In one short sentence, confirm you are operational.");
  const send = page.getByTestId("button-send-message").last();
  await send.click();
  console.log("  ✓ prompt sent via UI");

  // Completion: an assistant message renders and streaming finishes. The SEND
  // button is not a valid completion signal (it stays disabled while the input
  // is empty); the TEXTAREA is disabled only while isStreaming — so it
  // re-enabling marks stream completion.
  const assistantMsg = page.getByTestId("message-assistant").last();
  await expect(assistantMsg, "assistant reply must render (live LLM)").toBeVisible({ timeout: 180000 });
  await expect(input, "chat input must re-enable once streaming completes").toBeEnabled({ timeout: 180000 });

  const replyText = (await assistantMsg.innerText()).trim();
  expect(replyText.length, "assistant reply must be non-empty").toBeGreaterThan(0);
  console.log(`  ✓ live reply rendered (${replyText.length} chars): "${replyText.slice(0, 100)}${replyText.length > 100 ? "…" : ""}"`);

  // Read-back verification only (GET): a playground session exists for this agent
  const sess = await request.get(`/api/agents/${agent.id}/playground/sessions`);
  if (sess.ok()) {
    const sessions: any[] = await sess.json();
    expect(sessions.length, "a playground session must be persisted").toBeGreaterThan(0);
    console.log(`  ✓ persisted: ${sessions.length} playground session(s)`);
  } else {
    console.log(`  ~ sessions read-back endpoint returned ${sess.status()} (non-blocking)`);
  }
});
