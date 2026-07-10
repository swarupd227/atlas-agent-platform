/**
 * Agent Lifecycle — Hybrid E2E across the three creation paths + deploy/run/monitor.
 *
 * Target:  http://localhost:5000  (set E2E_BASE_URL; demo mode — no auth)
 * Runner:  Playwright (`request` + `page` fixtures)
 *
 * Scenarios
 *   A. Outcome-builder path  — create outcome (API), verify the "create agent
 *      for this outcome" UI linkage navigates to the wizard carrying outcomeId,
 *      then create the bound agent and assert the binding persists.
 *   B. Direct creation       — drive the wizard UI end-to-end via the "Build
 *      from Scratch" path and assert the agent is persisted.
 *   C. Template-based        — drive the wizard UI via ?templateId= and assert
 *      the agent is persisted with sourceTemplateId.
 *   D. Deploy / Run / Monitor — create a runnable agent, execute it (sync run),
 *      read the trace back, and create a deployment.
 *
 * All artefacts prefixed [E2E] for cleanup. Every scenario is an independent
 * test() so one failure does not mask the others — this is a bug-finding pass.
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const TS = Date.now();
const tag = (s: string) => `[E2E] ${s} ${TS}`;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Pre-set industry so the workspace-selector overlay never blocks the page. */
async function primePage(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("almp-industry", "cross_industry");
  });
}

async function dismissOnboarding(page: Page) {
  try {
    const skip = page.getByTestId("button-skip-workspace");
    if (await skip.isVisible({ timeout: 2500 })) {
      await skip.click();
      await page.locator("[data-testid='industry-workspace-selector']").waitFor({ state: "hidden", timeout: 5000 });
    }
  } catch { /* overlay not shown — fine */ }
}

/** Find an agent by exact name via the public API (creation-completion check). */
async function findAgentByName(request: APIRequestContext, name: string): Promise<any | null> {
  const res = await request.get("/api/agents");
  if (!res.ok()) return null;
  const body = await res.json();
  const agents: any[] = Array.isArray(body) ? body : (body.agents ?? []);
  return agents.find((a) => a.name === name) ?? null;
}

/** Drive the wizard from its current step to creation. Next is only gated at
 *  step 0 (needs a name), so we can click Next until the create button shows. */
async function completeWizardToCreate(page: Page) {
  const createBtn = page.getByTestId("button-create-agent");
  for (let i = 0; i < 10; i++) {
    if (await createBtn.isVisible().catch(() => false)) break;
    const next = page.getByTestId("button-next-step");
    // If we just landed on the blueprint step, pick "Start Blank" for a valid agent.
    const blank = page.getByTestId("card-blueprint-blank");
    if (await blank.isVisible().catch(() => false)) {
      await blank.click().catch(() => {});
    }
    await next.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(350);
  }
  await expect(createBtn, "button-create-agent should be reachable at step 8").toBeVisible({ timeout: 10000 });
  await createBtn.click();
}

// ─── Scenario A — Outcome-builder path ──────────────────────────────────────

test("A. Outcome-builder path: outcome → agent linkage + binding persists", async ({ page, request }) => {
  test.setTimeout(120000);
  const outcomeName = tag("Refund Automation Outcome");

  // 1. Create the outcome (the "outcome builder" produces this via POST /api/outcomes).
  const created = await request.post("/api/outcomes", {
    data: {
      name: outcomeName,
      description: "E2E outcome for lifecycle testing. Safe to delete.",
      riskTier: "MEDIUM",
      pricingModel: "PER_OUTCOME_EVENT",
      pricePerUnit: 1.5,
      // The prominent "Create Agent" CTA banner only renders while the outcome
      // is awaiting its agent plan — mirror the state the outcome builder emits.
      status: "awaiting_agent_plan",
    },
  });
  expect(created.ok(), `POST /api/outcomes → ${created.status()}: ${await created.text()}`).toBeTruthy();
  const outcome = await created.json();
  expect(outcome.id, "outcome must have id").toBeTruthy();
  console.log(`  ✓ outcome created: ${outcome.id}`);

  // 2. UI linkage: the outcome detail page must offer "create agent for this outcome"
  //    and route to the wizard carrying outcomeId.
  await primePage(page);
  await page.goto(`/outcomes/${outcome.id}`);
  await dismissOnboarding(page);
  // Ensure the detail body actually rendered (it 500→blanks under DB load).
  await expect(page.getByRole("heading", { name: outcomeName }), "outcome detail must render its heading").toBeVisible({ timeout: 20000 });
  // The "create agent for this outcome" CTA appears once the async proposal query
  // resolves hasAgentPlan=false. Target the wizard Link by href — robust to the
  // banner button rendering slightly late and to button-in-link nesting.
  const wizardLink = page.locator(`a[href*="/agents/wizard?outcomeId=${outcome.id}"]`).first();
  await expect(wizardLink, "outcome detail must expose a create-agent-for-outcome link carrying outcomeId").toBeVisible({ timeout: 20000 });
  await wizardLink.click();
  await page.waitForURL(/\/agents\/wizard/, { timeout: 15000 });
  const url = page.url();
  expect(url, "wizard URL must carry the outcomeId from the outcome path").toContain(`outcomeId=${outcome.id}`);
  console.log(`  ✓ linkage navigates to wizard with outcomeId`);

  // 3. Create the bound agent (path's distinctive contract: outcomeId binding).
  const agentName = tag("Refund Agent");
  const agentRes = await request.post("/api/agents", {
    data: {
      name: agentName,
      description: "E2E outcome-bound agent.",
      agentType: "single",
      riskTier: "MEDIUM",
      autonomyMode: "assisted",
      outcomeId: outcome.id,
    },
  });
  expect(agentRes.ok(), `POST /api/agents → ${agentRes.status()}: ${await agentRes.text()}`).toBeTruthy();
  const agent = await agentRes.json();

  // 4. Binding must persist and be readable back.
  const readBack = await request.get(`/api/agents/${agent.id}`);
  expect(readBack.ok()).toBeTruthy();
  const persisted = await readBack.json();
  expect(persisted.outcomeId, "created agent must remain bound to the outcome").toBe(outcome.id);
  console.log(`  ✓ agent ${agent.id} bound to outcome ${outcome.id}`);
});

// ─── Scenario B — Direct creation via wizard UI ──────────────────────────────

test("B. Direct creation: wizard 'Build from Scratch' UI → agent persisted", async ({ page, request }) => {
  test.setTimeout(180000);
  const agentName = tag("Direct Wizard Agent");

  await primePage(page);
  await page.goto("/agents/wizard");
  await dismissOnboarding(page);
  await expect(page.getByTestId("page-agent-wizard"), "wizard page must render").toBeVisible({ timeout: 15000 });

  // Step 0 — Define Agent
  await page.getByTestId("input-agent-name").fill(agentName);
  await page.getByTestId("input-agent-description").fill("E2E direct-creation agent. Safe to delete.");
  await expect(page.getByTestId("button-next-step"), "Next must enable once a name is entered").toBeEnabled();
  await page.getByTestId("button-next-step").click();

  // Step 1 — choose the manual/direct path
  await expect(page.getByTestId("path-manual"), "manual path card must render").toBeVisible({ timeout: 10000 });
  await page.getByTestId("path-manual").click();
  await page.getByTestId("button-next-step").click();

  // Steps 2–8 → create
  await completeWizardToCreate(page);

  // Verify persistence via API (independent of post-create navigation).
  await expect
    .poll(async () => !!(await findAgentByName(request, agentName)), {
      message: "agent from wizard must appear via GET /api/agents",
      timeout: 30000,
      intervals: [1000, 2000, 3000],
    })
    .toBe(true);
  const agent = await findAgentByName(request, agentName);
  console.log(`  ✓ direct-created agent persisted: ${agent?.id}`);
});

// ─── Scenario C — Template-based creation via wizard UI ──────────────────────

test("C. Template-based creation: wizard ?templateId UI → agent persisted", async ({ page, request }) => {
  test.setTimeout(180000);

  // Pick a single-agent (non-team) template from the catalog.
  const tplRes = await request.get("/api/agent-templates");
  expect(tplRes.ok(), `GET /api/agent-templates → ${tplRes.status()}`).toBeTruthy();
  const tplBody = await tplRes.json();
  const templates: any[] = Array.isArray(tplBody) ? tplBody : (tplBody.templates ?? tplBody.items ?? []);
  expect(templates.length, "at least one agent template must exist").toBeGreaterThan(0);
  const single = templates.find((t) => (t.blueprintJson?.templateType ?? "single") !== "team") ?? templates[0];
  console.log(`  ✓ using template: ${single.name} (${single.id})`);

  // Snapshot existing agent IDs so we can detect the newly-created one regardless
  // of what name the template flow assigns (the ?templateId deep-link jumps past
  // the name step, so the agent keeps the template's prefilled name).
  const before = new Set<string>(((await (await request.get("/api/agents")).json()) as any[]).map((a) => a.id));

  await primePage(page);
  await page.goto(`/agents/wizard?templateId=${single.id}`);
  await dismissOnboarding(page);
  await expect(page.getByTestId("page-agent-wizard")).toBeVisible({ timeout: 15000 });

  // Ensure a name is present (deep-link should prefill from the template; if the
  // name field is reachable, tag it so the creation is traceable).
  const nameField = page.getByTestId("input-agent-name");
  const backBtn = page.getByTestId("button-back-step");
  for (let i = 0; i < 3 && !(await nameField.isVisible().catch(() => false)); i++) {
    if (await backBtn.isEnabled().catch(() => false)) { await backBtn.click(); await page.waitForTimeout(300); }
  }
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill(tag("Template Agent"));
  }

  await completeWizardToCreate(page);

  // Success = the wizard leaves the form (post-creation guidance or agent detail).
  await Promise.race([
    page.getByTestId("page-post-creation-guidance").waitFor({ state: "visible", timeout: 20000 }).catch(() => {}),
    page.waitForURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {}),
  ]);

  // Verify a brand-new agent appeared and inspect its template provenance.
  let created: any = null;
  await expect
    .poll(async () => {
      const all = (await (await request.get("/api/agents")).json()) as any[];
      created = all.find((a) => !before.has(a.id)) ?? null;
      return !!created;
    }, { message: "a new agent must be created from the template", timeout: 30000, intervals: [1000, 2000, 3000] })
    .toBe(true);

  const prov = (created?.runtimeConfig as any)?.sourceTemplateId ?? created?.sourceTemplateId ?? null;
  console.log(`  ✓ template-created agent: ${created?.id} name="${created?.name}" sourceTemplateId=${prov ?? "NOT SET"}`);
  // Provenance is expected to survive so "which template produced this agent" is answerable.
  expect(prov, "created agent should record its source template (runtimeConfig.sourceTemplateId)").toBe(single.id);
});

// ─── Scenario D — Deploy / Run / Monitor ─────────────────────────────────────

test("D. Lifecycle: run agent (sync) → monitor trace → deploy", async ({ request }) => {
  test.setTimeout(300000);

  // Create a runnable agent with an explicit task so the runtime has instructions.
  const agentName = tag("Runnable Agent");
  const createRes = await request.post("/api/agents", {
    data: {
      name: agentName,
      description: "E2E runnable agent.",
      agentType: "single",
      riskTier: "LOW",
      autonomyMode: "assisted",
      modelProvider: "anthropic",
      modelName: "claude-haiku-4-5-20251001",
      systemPrompt: "You are a concise operational assistant.",
      runtimeConfig: { prompt: "Respond helpfully to the operator's request." },
    },
  });
  expect(createRes.ok(), `POST /api/agents → ${createRes.status()}: ${await createRes.text()}`).toBeTruthy();
  const agent = await createRes.json();
  console.log(`  ✓ runnable agent: ${agent.id}`);

  // RUN — synchronous execution endpoint.
  const runRes = await request.post("/api/runtime/run", {
    data: { agentId: agent.id, input: "Say hello and confirm you are operational in one sentence." },
    timeout: 180000,
  });
  expect(runRes.ok(), `POST /api/runtime/run → ${runRes.status()}: ${await runRes.text()}`).toBeTruthy();
  const run = await runRes.json();
  expect(run.traceId, "run must return a traceId").toBeTruthy();
  expect(run.status, `run status should be completed, got ${run.status}`).toBe("completed");
  expect(String(run.output ?? "").length, "run must produce non-empty output").toBeGreaterThan(0);
  console.log(`  ✓ run completed: trace=${run.traceId} tools=${run.toolCalls ?? 0} cost=$${run.costUsd ?? 0}`);

  // MONITOR — read the trace back with its steps.
  const traceRes = await request.get(`/api/runtime/runs/${run.traceId}`);
  expect(traceRes.ok(), `GET /api/runtime/runs/:id → ${traceRes.status()}`).toBeTruthy();
  const trace = await traceRes.json();
  expect(trace.status, "trace status must be terminal").toMatch(/completed|failed|error/);
  const steps: any[] = trace.steps ?? [];
  expect(steps.length, "trace must contain execution steps").toBeGreaterThan(0);
  console.log(`  ✓ monitored trace: status=${trace.status} steps=${steps.length}`);

  // DEPLOY — create a deployment for the agent.
  const depRes = await request.post("/api/deployments", {
    data: { agentId: agent.id, environment: "staging", rolloutStrategy: "direct" },
  });
  expect(depRes.ok(), `POST /api/deployments → ${depRes.status()}: ${await depRes.text()}`).toBeTruthy();
  const dep = await depRes.json();
  expect(dep.id, "deployment must have an id").toBeTruthy();
  console.log(`  ✓ deployment created: ${dep.id} status=${dep.status}`);
});
