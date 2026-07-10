/**
 * Agent Workspace — the consumption loop, end to end (permanent regression).
 *
 *   WS-1. Ask → watch live → outcome   (UI: real streamed run with cost + signed trace)
 *   WS-2. Role-gated agent access      (API: two roles see different agents)
 *   WS-3. Pause → approve-with-edit → continue  (API: the governed human-in-the-loop engine)
 *
 * Target: local build (E2E_BASE_URL=http://localhost:5000, demo mode).
 * WS-1/WS-3 use a real LLM, so they retry where the model's tool choice varies.
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function primePage(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("almp-industry", "cross_industry");
    localStorage.setItem("almp-role", "admin");
  });
}

/** GET with a couple of retries — the long-running local server can transiently
 *  drop a connection under E2E load; that's environmental, not a real failure. */
async function getJson(request: APIRequestContext, url: string, role = "admin"): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await request.get(url, { headers: { "X-Role": role } });
      if (res.ok()) return res.json();
      lastErr = new Error(`${res.status()} ${url}`);
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 800));
  }
  throw lastErr;
}

async function firstRunnableAgent(request: APIRequestContext): Promise<any | null> {
  const list = await getJson(request, "/api/workspace/agents").catch(() => null);
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

// ─── WS-1 — Ask → watch it work → outcome (real streamed run) ─────────────────
test("WS-1. Workspace: ask an agent → live activity → outcome with cost + signed trace", async ({ page, request }) => {
  test.setTimeout(120000);
  await primePage(page);
  await page.goto("/workspace");
  await expect(page.getByTestId("page-workspace")).toBeVisible({ timeout: 20000 });

  const agent = await firstRunnableAgent(request);
  test.skip(!agent, "no runnable agent available in this environment");

  // pick the agent
  await page.getByTestId("select-workspace-agent").click();
  await page.getByTestId(`option-agent-${agent.id}`).click();

  await page.getByTestId("input-workspace-ask").fill("In one sentence, what kind of work can you help me with?");
  await page.getByTestId("button-workspace-send").click();

  // the live timeline appears, then a final answer card with cost + trace
  await expect(page.getByTestId("workspace-timeline")).toBeVisible({ timeout: 20000 });
  const answer = page.getByTestId("workspace-answer").first();
  await expect(answer, "a final answer card must render").toBeVisible({ timeout: 90000 });
  await expect(answer).toContainText("$");                       // cost line
  await expect(answer.getByText(/signed trace/i)).toBeVisible(); // auditable record
  console.log("  ✓ WS-1: ask → live timeline → answer with cost + signed trace");
});

// ─── WS-2 — Role-gated agent access ──────────────────────────────────────────
test("WS-2. Workspace: two roles see different agents (audience gating)", async ({ request }) => {
  test.setTimeout(60000);
  const agents = await getJson(request, "/api/workspace/agents");
  test.skip(!Array.isArray(agents) || agents.length === 0, "no agents to gate");
  const target = agents[0].id;

  // Publish the agent to outcome_owner only.
  const patch = await request.patch(`/api/agents/${target}`, {
    headers: { "X-Role": "admin" }, data: { workspaceAudience: ["outcome_owner"] },
  });
  expect(patch.ok()).toBeTruthy();

  try {
    const seenBy = async (role: string) => {
      const list = await getJson(request, "/api/workspace/agents", role);
      return Array.isArray(list) && list.some((a: any) => a.id === target);
    };
    expect(await seenBy("outcome_owner"), "audience role sees the agent").toBe(true);
    expect(await seenBy("agent_engineer"), "other role does NOT see the agent").toBe(false);
    expect(await seenBy("admin"), "admin always sees the agent").toBe(true);
    console.log("  ✓ WS-2: outcome_owner sees it, agent_engineer does not, admin always does");
  } finally {
    await request.patch(`/api/agents/${target}`, { headers: { "X-Role": "admin" }, data: { workspaceAudience: [] } });
  }
});

// ─── WS-3 — Pause → approve-with-edit → continue (governed HITL engine) ───────
test("WS-3. Workspace: gated tool pauses, human approves with edited args, run continues", async ({ request }) => {
  test.setTimeout(300000);
  const H = { "X-Role": "admin" };
  const res = await request.get("/api/agents", { headers: H });
  const agents: any[] = await res.json();
  // Candidate = single, non-archived agent with a configured tool. We then
  // PROVE it can pause (its gated tool is actually offered + called) before
  // committing — different agents wire tools differently.
  const candidates = agents.filter(a => Array.isArray(a.toolsConfig) && a.toolsConfig.length > 0
    && a.status !== "archived" && a.agentType !== "team").slice(0, 6);

  let gatedAgentId: string | null = null, toolName = "", runId: string | null = null;
  for (const c of candidates) {
    const name = c.toolsConfig[0].name;
    const gate = await request.patch(`/api/agents/${c.id}/aar`, { headers: H, data: { requireApprovalTools: [name] } });
    if (!gate.ok()) continue;                          // no AAR config → not gateable
    // One forceful ask: does it pause on the gated tool?
    const start = await request.post("/api/workspace/runs", {
      headers: H, data: { agentId: c.id, input: `Immediately call the ${name} tool now. Do not explain — just call it.` },
    });
    const run = await start.json();
    if (run.status === "awaiting_approval") { gatedAgentId = c.id; toolName = name; runId = run.id; break; }
    await request.patch(`/api/agents/${c.id}/aar`, { headers: H, data: { requireApprovalTools: [] } });  // reset & try next
  }
  test.skip(!runId, "no candidate agent paused on a gated tool in this environment");

  try {
    // Approve WITH an edit + a note — exercises the full human-in-the-loop path.
    const resume = await request.post(`/api/workspace/runs/${runId}/resume`, {
      headers: H, data: { decision: "approve", edits: { _e2e_marker: "approved-with-edit" }, note: "E2E approval note." },
    });
    const final = await resume.json();
    expect(final.status, "run continues past the gate to completion").toBe("completed");
    console.log(`  ✓ WS-3: paused on ${toolName}, approved-with-edit, run completed (cost $${final.costUsd})`);
  } finally {
    await request.patch(`/api/agents/${gatedAgentId}/aar`, { headers: H, data: { requireApprovalTools: [] } });
  }
});
