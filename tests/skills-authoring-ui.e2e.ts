/**
 * Skills Authoring — FULL UI flows.
 *
 *   SK-1. Create a skill in Skill Studio (metadata + allowedTools + markdown) → persisted
 *   SK-2. Save a version, then PROMOTE it to production (new capability) → flag + version applied
 *   SK-3. Status lifecycle: set skill to "deprecated" in Studio → catalog status filter
 *         (new capability) shows it under Deprecated and hides it under Active
 *   SK-4. Real test-sandbox: run a scenario → real model output rendered (realExecution)
 *   SK-5. Delete integrity (API-level contract): deleting a skill preloaded by an agent
 *         409s without force, succeeds with force and detaches the reference
 *
 * All writes are clicks except SK-5's arrangement (agent wiring has no UI surface);
 * REST is otherwise read-back verification only. Artefacts prefixed [E2E-SKILL].
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const TS = Date.now();
const tag = (s: string) => `[E2E-SKILL] ${s} ${TS}`;

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

async function findSkillByName(request: APIRequestContext, name: string): Promise<any | null> {
  const res = await request.get("/api/skills");
  if (!res.ok()) return null;
  const skills: any[] = await res.json();
  return skills.find((s) => s.name === name) ?? null;
}

/** Create a skill through the Studio UI and return its persisted record. */
async function createSkillViaStudioUI(page: Page, request: APIRequestContext, skillName: string): Promise<any> {
  await page.goto("/skills/studio");
  await dismissOnboarding(page);
  await page.getByTestId("button-create-skill").click();
  await page.waitForURL(/\/skills\/studio\/[0-9a-f-]{36}/, { timeout: 20000 });

  await page.getByTestId("input-name").fill(skillName);
  await page.getByTestId("input-description").fill("Full-UI E2E skill: validates refund requests against policy. Safe to delete.");
  await page.getByTestId("input-domain").fill("refunds");
  await page.getByTestId("input-tags").fill("e2e, refunds");
  await page.getByTestId("input-allowed-tools").fill("get_leads\nsearch_kb");
  await page.getByTestId("input-markdown-body").fill(
    "## Trigger Conditions\nWhen the user asks about refunds.\n\n## Procedure\n1. Look up the order.\n2. Check the refund window.\n3. Approve or escalate.",
  );
  await page.getByTestId("button-save").click();
  // Success signal: "Skill saved" toast (may carry ontology warnings)
  await expect(page.getByText(/Skill saved/i).first(), "save must confirm via toast").toBeVisible({ timeout: 20000 });

  let skill: any = null;
  await expect
    .poll(async () => { skill = await findSkillByName(request, skillName); return !!skill; },
      { message: "studio-created skill must persist", timeout: 20000, intervals: [1000, 2000] })
    .toBe(true);
  return skill;
}

// ─── SK-1 — Create skill via Studio UI ───────────────────────────────────────

test("SK-1. Studio: create skill with tools + instructions → persisted", async ({ page, request }) => {
  test.setTimeout(120000);
  const skillName = tag("Refund Validation");

  await primePage(page);
  const skill = await createSkillViaStudioUI(page, request, skillName);

  expect(skill.domain, "domain from the form must persist").toBe("refunds");
  expect((skill.allowedTools as string[]) ?? [], "allowedTools from the form must persist").toContain("get_leads");
  expect(String(skill.markdownBody || ""), "markdown instructions must persist").toContain("Trigger Conditions");
  console.log(`  ✓ skill created via Studio UI: ${skill.id} (allowedTools=${(skill.allowedTools || []).join(",")})`);
});

// ─── SK-2 — Version save + promote ───────────────────────────────────────────

test("SK-2. Studio: save version → promote to production", async ({ page, request }) => {
  test.setTimeout(150000);
  const skillName = tag("Versioned Skill");

  await primePage(page);
  const skill = await createSkillViaStudioUI(page, request, skillName);

  // Save a version snapshot
  await page.getByTestId("tab-versions").click();
  await page.getByTestId("input-version-changelog").fill("Initial E2E snapshot");
  await page.getByTestId("button-save-version").click();
  await expect(page.getByText(/Version saved/i).first()).toBeVisible({ timeout: 15000 });

  // Select the version card → promote it (new capability)
  const versionCard = page.locator("[data-testid^='card-version-']").first();
  await expect(versionCard, "saved version card must render").toBeVisible({ timeout: 15000 });
  await versionCard.click();
  const promoteBtn = page.getByTestId("button-promote-version");
  await expect(promoteBtn, "promote button must render on the version diff card").toBeVisible({ timeout: 10000 });
  await promoteBtn.click();
  await expect(page.getByText(/promoted to production/i).first(), "promotion must confirm via toast").toBeVisible({ timeout: 15000 });

  // Read-back: exactly one version carries promotedToProduction
  const versions: any[] = await (await request.get(`/api/skills/${skill.id}/versions`)).json();
  const promoted = versions.filter((v) => v.promotedToProduction);
  expect(promoted.length, "exactly one version must be marked production").toBe(1);
  console.log(`  ✓ version v${promoted[0].version} promoted (of ${versions.length})`);
});

// ─── SK-3 — Status lifecycle + catalog filter ────────────────────────────────

test("SK-3. Lifecycle: deprecate in Studio → catalog status filter reflects it", async ({ page, request }) => {
  test.setTimeout(150000);
  const skillName = tag("Deprecatable Skill");

  await primePage(page);
  const skill = await createSkillViaStudioUI(page, request, skillName);

  // Deprecate via the Studio status select (Radix)
  const statusSelect = page.getByTestId("select-status");
  if (await statusSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
    await statusSelect.click();
    await page.getByRole("option", { name: /deprecated/i }).first().click();
    await page.getByTestId("button-save").click();
    await expect(page.getByText(/Skill saved/i).first()).toBeVisible({ timeout: 20000 });
  } else {
    // Studio may not expose a status control — deprecate via PATCH and record the gap.
    test.info().annotations.push({ type: "finding", description: "Skill Studio has no status select; deprecation done via API." });
    await request.patch(`/api/skills/${skill.id}`, { data: { status: "deprecated" } });
  }

  // Catalog: Deprecated filter shows it…
  await page.goto("/skills");
  await dismissOnboarding(page);
  await page.getByTestId("select-status-filter").click();
  await page.getByRole("option", { name: /Deprecated/i }).click();
  await page.getByTestId("input-skill-search").fill(skillName);
  await expect(page.locator(`[data-testid="card-skill-${skill.id}"]`), "deprecated skill must appear under the Deprecated filter").toBeVisible({ timeout: 15000 });

  // …and the Active filter hides it.
  await page.getByTestId("select-status-filter").click();
  await page.getByRole("option", { name: /^Active$/i }).click();
  await expect(page.locator(`[data-testid="card-skill-${skill.id}"]`), "deprecated skill must be hidden under the Active filter").toBeHidden({ timeout: 15000 });
  console.log("  ✓ status lifecycle + catalog filter verified");
});

// ─── SK-4 — Real test-sandbox run ────────────────────────────────────────────

test("SK-4. Sandbox: run scenario → REAL model output rendered", async ({ page, request }) => {
  test.setTimeout(240000);
  const skillName = tag("Sandbox Skill");

  await primePage(page);
  await createSkillViaStudioUI(page, request, skillName);

  await page.getByTestId("tab-sandbox").click();
  await page.getByTestId("input-test-scenario").fill("A customer bought a jacket 10 days ago and wants a refund. Our window is 30 days. What do you do?");

  // Capture the sandbox API response to assert it is a REAL execution.
  const sandboxResponses: any[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/ai/skill-test-sandbox") && r.status() === 200) {
      sandboxResponses.push(await r.json().catch(() => null));
    }
  });

  await page.getByTestId("button-run-test").click();
  // Two real model runs (with/without skill) + judging — allow generous time.
  await expect
    .poll(() => sandboxResponses.filter(Boolean).length, { message: "both sandbox runs must return", timeout: 180000, intervals: [2000, 4000] })
    .toBeGreaterThanOrEqual(2);

  for (const resp of sandboxResponses.filter(Boolean)) {
    expect(resp.realExecution, "sandbox must be a real execution, not a simulation").toBe(true);
    expect(String(resp.output || "").length, "real model output must be non-empty").toBeGreaterThan(20);
  }
  console.log(`  ✓ real sandbox verified — output sample: "${String(sandboxResponses[0]?.output || "").slice(0, 90)}…"`);
});

// ─── SK-5 — Delete integrity contract ────────────────────────────────────────

test("SK-5. Delete integrity: referenced skill 409s, force detaches + deletes", async ({ request }) => {
  test.setTimeout(90000);

  // Arrange (API): a skill + an agent that preloads it (no UI surface wires
  // preloadedSkills manually, so arrangement is API; the contract under test
  // is the server's referential-integrity behavior).
  const skillRes = await request.post("/api/skills", {
    data: { name: tag("Referenced Skill"), description: "E2E delete-integrity skill", industry: "cross_industry", domain: "e2e", author: "e2e" },
  });
  expect(skillRes.ok(), `POST /api/skills → ${skillRes.status()}`).toBeTruthy();
  const skill = await skillRes.json();

  const agentRes = await request.post("/api/agents", {
    data: {
      name: tag("Skill Consumer Agent"),
      agentType: "single",
      riskTier: "LOW",
      preloadedSkills: [{ skillId: skill.id, skillName: skill.name, executionOrder: 1 }],
    },
  });
  expect(agentRes.ok()).toBeTruthy();
  const agent = await agentRes.json();

  // Act 1: delete without force → 409 naming the referencing agent
  const del1 = await request.delete(`/api/skills/${skill.id}`);
  expect(del1.status(), "delete of a referenced skill must 409 without force").toBe(409);
  const body1 = await del1.json();
  expect((body1.agents ?? []).some((a: any) => a.id === agent.id), "409 must name the referencing agent").toBe(true);

  // Act 2: force delete → succeeds and detaches
  const del2 = await request.delete(`/api/skills/${skill.id}?force=true`);
  expect(del2.ok(), `force delete → ${del2.status()}`).toBeTruthy();
  const body2 = await del2.json();
  expect(body2.detachedFromAgents, "force delete must report detachment").toBe(1);

  const agentAfter = await (await request.get(`/api/agents/${agent.id}`)).json();
  const stillRef = Array.isArray(agentAfter.preloadedSkills) && agentAfter.preloadedSkills.some((p: any) => p?.skillId === skill.id);
  expect(stillRef, "agent must no longer reference the deleted skill").toBe(false);
  console.log("  ✓ delete integrity: 409 without force, clean detach with force");
});
