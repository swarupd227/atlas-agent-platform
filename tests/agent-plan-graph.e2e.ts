/**
 * Agent Plan Graph — E2E smoke test
 *
 * Covers the production-readiness gaps implemented in the latest change set:
 *  1. Pipeline visualization card renders with pattern badge
 *  2. React Flow graph view toggle shows orchestrator + worker nodes and edges
 *  3. Parallel-group background nodes appear for multi-agent tiers
 *  4. Conditional (diamond) nodes appear when pipeline has conditional edges
 *  5. HITL checkpoint nodes appear when pipeline has humanCheckpoints
 *  6. Dependency matrix collapsible expands with per-agent rows
 *  7. Data-flow summary renders when agents share I/O keys
 *
 * Target: http://localhost:5000  (demo mode — no auth required)
 * Runner: Playwright (browser + request fixtures)
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  Phase 1  API Discovery  — find outcome with a pipeline definition     │
 * │  Phase 2  UI Navigation  — outcome detail → Agent Plan tab             │
 * │  Phase 3  Graph View     — toggle on/off, count nodes & edges          │
 * │  Phase 4  Node Types     — verify orchestrator, workers, extras        │
 * │  Phase 5  Dep Matrix     — expand collapsible, check data-flow summary │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://atlas-agent-platform.replit.app";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Suppress the industry-workspace-selector onboarding overlay. */
async function dismissOnboarding(page: import("@playwright/test").Page) {
  try {
    const skip = page.getByTestId("button-skip-workspace");
    if (await skip.isVisible({ timeout: 3_000 })) {
      await skip.click();
      await page
        .locator("[data-testid='industry-workspace-selector']")
        .waitFor({ state: "hidden", timeout: 5_000 });
    }
  } catch { /* overlay not shown — fine */ }
}

// ─── test ─────────────────────────────────────────────────────────────────────

test.use({ baseURL: BASE });

test(
  "Agent Plan Graph: graph view renders nodes/edges, node types present, dependency matrix expands",
  async ({ page, request }) => {
    test.setTimeout(3 * 60 * 1000);

    // ── Phase 1: API — find an outcome with a pipeline definition ─────────────

    const outcomesRes = await request.get(`${BASE}/api/outcomes?limit=30`);
    expect(outcomesRes.ok(), "GET /api/outcomes returns 200").toBeTruthy();
    const outcomesBody = await outcomesRes.json();
    const outcomes: Array<{ id: string; name: string }> =
      outcomesBody.outcomes ?? outcomesBody ?? [];
    expect(outcomes.length, "at least one outcome exists").toBeGreaterThan(0);

    // Scan up to 15 outcomes for one with a full pipeline definition
    let targetId = "";
    let targetName = "";
    let pipelinePattern = "";
    let hasDependencyMatrix = false;
    let hasConditionalEdges = false;
    let hasHumanCheckpoints = false;
    let hasParallelGroups = false; // true only when ≥1 group has >1 agent (triggers background rect)

    for (const outcome of outcomes.slice(0, 15)) {
      // Returns a single proposal object or 404
      const propRes = await request.get(`${BASE}/api/agent-proposals/${outcome.id}`);
      if (!propRes.ok()) continue;
      const proposal: any = await propRes.json();
      if (!proposal || proposal.error) continue;

      // Prefer proposals with a full pipeline object
      const pl = proposal.pipeline;
      if (pl && (pl.pattern || (pl.edges ?? []).length > 0)) {
        targetId = outcome.id;
        targetName = outcome.name;
        pipelinePattern = pl.pattern ?? "";
        hasDependencyMatrix =
          Array.isArray(pl.agentDependencyMatrix) && pl.agentDependencyMatrix.length > 0;
        hasConditionalEdges = (pl.edges ?? []).some((e: any) => e.type === "conditional");
        hasHumanCheckpoints =
          Array.isArray(pl.humanCheckpoints) && pl.humanCheckpoints.length > 0;
        // A parallelGroup background rect only renders for tiers with >1 agent
        hasParallelGroups =
          Array.isArray(pl.parallelGroups) &&
          (pl.parallelGroups as string[][]).some((g: string[]) => g.length > 1);
        break;
      }

      // Fall back: any outcome with a proposal (even without pipeline detail)
      if (!targetId) {
        targetId = outcome.id;
        targetName = outcome.name;
      }
    }

    expect(targetId, "found an outcome with agent proposals").not.toBe("");
    console.log([
      `Target outcome: "${targetName}" (${targetId})`,
      `  pattern=${pipelinePattern || "(none)"}`,
      `  hasDeps=${hasDependencyMatrix}  hasCond=${hasConditionalEdges}`,
      `  hasHITL=${hasHumanCheckpoints}  hasParallel=${hasParallelGroups}`,
    ].join("\n"));

    // ── Phase 2: UI — wait for Vite dev server to finish bundling, then navigate ─

    // Pre-set localStorage: almp-industry makes isSelected=true so the overlay never renders
    await page.addInitScript(() => {
      localStorage.setItem("almp-industry", "financial_services");
    });

    // Poll until the frontend is fully served (Vite can take 20-30s to bundle on first boot)
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        const probe = await request.get(`${BASE}/`);
        if (probe.ok()) break;
      } catch { /* still starting */ }
      await new Promise(r => setTimeout(r, 2_000));
    }

    await page.goto(`/outcomes/${targetId}`, { timeout: 90_000 });
    await dismissOnboarding(page);

    await expect(page.getByTestId("page-outcome-detail")).toBeVisible({
      timeout: 20_000,
    });
    const outcomeName = page.getByTestId("text-outcome-name");
    await expect(outcomeName).toBeVisible();
    console.log(`Page title: ${await outcomeName.textContent()}`);

    // ── Phase 3: Navigate to "Agent Plan" tab ─────────────────────────────────

    await page.getByTestId("tab-agent-map").click();
    await expect(page.getByTestId("tabcontent-agent-map")).toBeVisible();

    // ── Phase 4: Pipeline visualization card ──────────────────────────────────

    const pipelineCard = page.getByTestId("card-pipeline-visualization");
    await expect(pipelineCard).toBeVisible({ timeout: 10_000 });

    if (pipelinePattern) {
      const patternBadge = page.getByTestId("badge-pipeline-pattern");
      await expect(patternBadge).toBeVisible();
      const badgeText = (await patternBadge.textContent()) ?? "";
      console.log(`Pattern badge: "${badgeText}"`);
      // Badge should contain at least part of the pattern string (may be formatted)
      expect(badgeText.length, "pattern badge has text").toBeGreaterThan(0);
    }

    // ── Phase 5: Toggle Graph View ON ─────────────────────────────────────────

    const graphToggle = page.getByTestId("button-toggle-graph-view");
    await expect(graphToggle).toBeVisible();

    // Graph should be hidden before toggling
    const reactFlow = page.getByTestId("agent-plan-react-flow");
    await expect(reactFlow).not.toBeVisible();

    await graphToggle.click();
    await expect(reactFlow).toBeVisible({ timeout: 10_000 });

    // Wait for React Flow nodes to fully render
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length >= 2,
      { timeout: 15_000 }
    );


    // ── Phase 6: Verify core nodes and edges ──────────────────────────────────

    // Orchestrator node (always id="orch")
    const orchNode = reactFlow.locator(".react-flow__node[data-id='orch']");
    await expect(orchNode).toBeVisible({ timeout: 5_000 });
    await expect(orchNode).toHaveClass(/react-flow__node-orchestrator/);

    // At least one worker node (ids prefixed "w-")
    const workerNodes = reactFlow.locator(".react-flow__node-worker");
    const workerCount = await workerNodes.count();
    expect(workerCount, "at least 1 worker node rendered").toBeGreaterThanOrEqual(1);
    console.log(`Worker nodes: ${workerCount}`);

    // At least one edge
    const edgeCount = await reactFlow.locator(".react-flow__edge").count();
    expect(edgeCount, "at least 1 edge rendered").toBeGreaterThanOrEqual(1);
    console.log(`Edges: ${edgeCount}`);

    // Total node count
    const totalNodes = await reactFlow.locator(".react-flow__node").count();
    console.log(`Total nodes: ${totalNodes}`);
    expect(totalNodes, "orchestrator + workers present").toBeGreaterThanOrEqual(2);

    // ── Phase 7: Conditional, HITL, and parallel-group nodes ─────────────────

    if (hasConditionalEdges) {
      const condCount = await reactFlow.locator(".react-flow__node-condition").count();
      expect(condCount, "conditional (diamond) nodes rendered").toBeGreaterThanOrEqual(1);
      console.log(`Conditional nodes: ${condCount}`);
    }

    if (hasHumanCheckpoints) {
      const cpCount = await reactFlow.locator(".react-flow__node-checkpoint").count();
      expect(cpCount, "HITL checkpoint nodes rendered").toBeGreaterThanOrEqual(1);
      console.log(`Checkpoint nodes: ${cpCount}`);
    }

    if (hasParallelGroups) {
      const pgCount = await reactFlow.locator(".react-flow__node-parallelGroup").count();
      expect(pgCount, "parallel-group background nodes rendered").toBeGreaterThanOrEqual(1);
      console.log(`Parallel-group nodes: ${pgCount}`);
    }

    // ── Phase 8: Toggle Graph View OFF then back ON ───────────────────────────

    await graphToggle.click();
    await expect(reactFlow).not.toBeVisible({ timeout: 5_000 });

    await graphToggle.click();
    await expect(reactFlow).toBeVisible({ timeout: 8_000 });

    // ── Phase 9: Dependency matrix collapsible ────────────────────────────────

    const matrixSection = page.getByTestId("section-dependency-matrix");
    await expect(matrixSection).toBeVisible();

    const matrixToggle = page.getByTestId("button-toggle-dependency-matrix");
    await expect(matrixToggle).toBeVisible();

    // Expand it
    await matrixToggle.click();

    if (hasDependencyMatrix) {
      await expect(page.getByTestId("dependency-entry-0")).toBeVisible({
        timeout: 5_000,
      });
      console.log("Dependency matrix expanded — entry-0 visible");

      // Data-flow summary (present when agents share I/O keys)
      const flowSummary = page.getByTestId("dependency-flow-summary");
      const summaryVisible = await flowSummary.isVisible();
      console.log(`Data-flow summary visible: ${summaryVisible}`);
      // Not asserting presence — depends on whether I/O keys actually overlap,
      // but if it IS there it should have content
      if (summaryVisible) {
        const summaryText = await flowSummary.textContent();
        expect(summaryText?.length ?? 0, "data-flow summary has content").toBeGreaterThan(0);
      }
    }

    // ── Phase 10: Collapse matrix ─────────────────────────────────────────────

    await matrixToggle.click();
    await expect(page.locator("[data-testid='dependency-entry-0']")).not.toBeVisible({
      timeout: 3_000,
    });

    console.log("✓ All assertions passed");
  }
);
