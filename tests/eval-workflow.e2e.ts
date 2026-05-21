/**
 * Eval Workflow — Hybrid E2E test against production
 *
 * Target:  https://atlas-agent-platform.replit.app
 * Auth:    demo mode — no login required
 * Runner:  Playwright (both `request` + `page` fixtures)
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Phase 1  API Setup      — discover metrics, dataset, 3 goldens  │
 * │  Phase 2  UI Execution   — navigate, configure, start run        │
 * │  Phase 3  API Verify     — poll to completion; traces + reasoning │
 * │  Phase 4  UI Read-back   — run row + detail page                 │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * All test artefacts are prefixed [E2E] for easy identification.
 * Dataset capped at 3 goldens to minimise LLM cost.
 * No direct DB mutations — everything goes through the public REST API.
 *
 * IMPORTANT: Metrics are DISCOVERED (GET /api/eval/metrics), not created.
 * The LLM judge stores its reasoning in the `metric:*` span's
 * `attributes.reason` field (NOT at the trace top-level).  Phase 3 asserts
 * this field is present and non-empty for every evaluated trace.
 */

import { test, expect } from "@playwright/test";

const TS = Date.now();
const DATASET_NAME = `[E2E] AQEWS Assessment Report Generator — ${TS}`;

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Suppress the industry-workspace-selector overlay.
 *
 * Two-pronged:
 *  1. addInitScript (called once before first navigation) pre-sets the
 *     localStorage key so the React provider starts with isSelected=true
 *     and never renders the overlay.
 *  2. Fallback: click button-skip-workspace if the overlay still shows.
 */
async function dismissOnboarding(page: import("@playwright/test").Page) {
  try {
    const skip = page.getByTestId("button-skip-workspace");
    if (await skip.isVisible({ timeout: 3_000 })) {
      await skip.click();
      await page.locator("[data-testid='industry-workspace-selector']").waitFor({
        state: "hidden",
        timeout: 5_000,
      });
    }
  } catch { /* overlay not shown — that is fine */ }
}

/** Wait up to maxMs, polling every intervalMs, until fn returns truthy. */
async function pollUntil<T>(
  fn: () => Promise<T | null | undefined>,
  { intervalMs, maxMs }: { intervalMs: number; maxMs: number },
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil: timed out after ${maxMs / 1000}s`);
}

// ─── test ────────────────────────────────────────────────────────────────────

test("Eval Workflow: full E2E smoke test against production", async ({ page, request }) => {
  test.setTimeout(10 * 60 * 1000);

  // state populated incrementally
  let agentId   = "";
  let agentName = "";
  let metricIds: string[]  = [];
  let metricCollectionId: string | undefined;
  let datasetId = "";
  let runId     = "";

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1 — API Setup
  // ═══════════════════════════════════════════════════════════════════════════

  await test.step("1.1 — Discover a live active agent", async () => {
    const res   = await request.get("/api/agents");
    expect(res.ok(), `GET /api/agents → ${res.status()}`).toBeTruthy();
    const body  = await res.json();
    const agents: any[] = Array.isArray(body) ? body : (body.agents ?? []);
    const live  = agents.filter((a) => ["active", "deployed"].includes(a.status));
    expect(live.length, "No active/deployed agents found in production").toBeGreaterThan(0);
    agentId   = live[0].id;
    agentName = live[0].name;
    console.log(`  ✓ agent: "${agentName}" (${agentId})`);
  });

  await test.step("1.2 — Discover evaluation metrics (GET /api/eval/metrics)", async () => {
    const res     = await request.get("/api/eval/metrics");
    expect(res.ok(), `GET /api/eval/metrics → ${res.status()}`).toBeTruthy();
    const body    = await res.json();
    const all: any[] = Array.isArray(body) ? body : (body.metrics ?? body.items ?? []);

    // Filter to "general" category, exclude any [E2E] artefacts from previous runs.
    const general = all.filter(
      (m) => m.category === "general" && !m.name.startsWith("[E2E]"),
    );
    expect(general.length, "No general-category metrics found in production").toBeGreaterThan(0);

    // For credit/financial domain evaluation, prefer metrics that judge answer
    // quality holistically: GEval (LLM-as-judge), InstructionFollowing, and
    // SemanticSimilarity are more meaningful than CodeCorrectness or DAGMetric.
    const PREFERRED_NAMES = ["GEval", "InstructionFollowing", "SemanticSimilarity", "NonContradiction"];
    const preferred = PREFERRED_NAMES
      .map((n) => general.find((m: any) => m.name === n))
      .filter(Boolean) as any[];

    const pool  = preferred.length > 0 ? preferred : general;
    metricIds = pool.slice(0, 3).map((m: any) => m.id as string);
    const names = pool.slice(0, 3).map((m: any) => m.name);
    console.log(`  ✓ metrics selected (${metricIds.length}): ${names.join(", ")}`);
  });

  await test.step("1.3 — Check for metric collections (GET /api/eval/metric-collections)", async () => {
    const res = await request.get("/api/eval/metric-collections");
    if (res.ok()) {
      const body = await res.json();
      const cols: any[] = Array.isArray(body) ? body : (body.collections ?? body.items ?? []);
      if (cols.length > 0) {
        metricCollectionId = cols[0].id as string;
        console.log(`  ✓ metric collection: "${cols[0].name}" (${metricCollectionId})`);
      } else {
        console.log("  ~ no metric collections; will use individual metricIds");
      }
    } else {
      console.log("  ~ metric-collections endpoint not available; using individual metricIds");
    }
  });

  await test.step("1.4 — Create eval dataset (POST /api/eval/datasets)", async () => {
    const res = await request.post("/api/eval/datasets", {
      data: {
        name: DATASET_NAME,
        description:
          "Automated E2E test dataset for the AQEWS Assessment Report Generator — " +
          "covers SVB advance warning identification, watchlist recommendation logic, " +
          "and full quarterly package assembly. Safe to delete.",
        agentId,
        tags: ["e2e", "automated", "aqews", "credit-assessment"],
      },
    });
    expect(res.ok(), `POST /api/eval/datasets → ${res.status()}: ${await res.text()}`).toBeTruthy();
    const ds  = await res.json();
    datasetId = ds.id;
    expect(datasetId, "Dataset must have an id").toBeTruthy();
    console.log(`  ✓ dataset: "${ds.name}" (${datasetId})`);
  });

  await test.step("1.5 — Seed 3 agent-specific golden test cases (POST .../goldens/bulk)", async () => {
    // These goldens exercise the actual capabilities of the Assessment Report
    // Generator — Fitch's AQEWS system for credit risk early warning.
    // They cover: (a) SVB advance-warning identification, (b) watchlist
    // recommendation logic, and (c) full quarterly assessment package assembly.
    const res = await request.post(`/api/eval/datasets/${datasetId}/goldens/bulk`, {
      data: {
        goldens: [
          // ── Golden 1: SVB advance-warning identification ─────────────────
          // Tests that the agent correctly identifies and interprets the 182-day
          // advance warning the AQEWS model produced before SVB's March 2023
          // collapse — a core proof-point of Fitch's early detection capability.
          {
            input:
              "Analyse Silicon Valley Bank's AQEWS composite score trajectory from " +
              "Q1 2022 through March 2023. Identify where the model first flagged " +
              "deteriorating asset quality and explain what the advance warning timeline " +
              "indicates about Fitch's early detection capability.",
            expectedOutput:
              "The AQEWS model flagged Silicon Valley Bank's deteriorating credit quality " +
              "approximately 182 days before its collapse in March 2023. The composite score " +
              "trajectory shows a progressive decline beginning in mid-2022, crossing the " +
              "watchlist threshold well ahead of the bank's failure. The svbComparison section " +
              "of the assessment package should include the quarterly score timeline with " +
              "labeled events, parallelsFound narratives for current watchlist banks, and a " +
              "recommendation of Active Monitor or Immediate Review for institutions showing " +
              "similar early-warning patterns.",
            tags: ["svb-backtest", "advance-warning", "e2e", "aqews"],
          },

          // ── Golden 2: Watchlist recommendation logic ─────────────────────
          // Tests the agent's recommendation tier selection given a deteriorating
          // regional bank profile with elevated CRE concentration — a common
          // stress pattern in the post-SVB environment.
          {
            input:
              "A regional bank on the AQEWS watchlist shows a composite score declining " +
              "from 74 in Q1 2023 to 51 in Q3 2023 — three consecutive quarters of " +
              "deterioration. CRE concentration stands at 360% of Tier 1 capital and " +
              "uninsured deposit share has risen to 62%. Assemble the credit assessment " +
              "package and provide the appropriate recommendation tier.",
            expectedOutput:
              "Given three consecutive quarters of score decline (74→51), CRE concentration " +
              "at 360% of Tier 1 (above the 300% stress threshold), and uninsured deposit share " +
              "at 62%, the assessment package should assign an Immediate Review recommendation. " +
              "The ratioHighlights section should flag CRE concentration as CRITICAL severity " +
              "and deposit concentration as HIGH. The executiveSummary should note the score " +
              "trajectory, the SVB parallels in the svbComparison section should identify " +
              "similarities to SVB's pre-collapse profile, and the watchList should include " +
              "this institution with the Immediate Review tier.",
            tags: ["watchlist", "recommendation", "cre-concentration", "e2e", "aqews"],
          },

          // ── Golden 3: Full quarterly assessment package assembly ──────────
          // Tests the core output capability: assembling a complete structured
          // JSON package with all required sections — the primary deliverable
          // of this agent in the AQEWS pipeline.
          {
            input:
              "Assemble the Q3 2023 AQEWS quarterly assessment package. Include the " +
              "executive summary covering current watchlist composition and key risks, " +
              "ratio highlights with severity levels for flagged banks, NLP signals from " +
              "recent earnings transcripts and filings, and SVB backtest comparisons for " +
              "institutions showing early-warning parallels.",
            expectedOutput:
              "The Q3 2023 AQEWS quarterly assessment package should be a complete JSON " +
              "structure with reportGenerated: true. The assessmentPackage must contain: " +
              "an executiveSummary (2-3 sentences covering watchlist composition and top risks), " +
              "ratioHighlights array with ratio IDs, finding text, and CRITICAL/HIGH/MEDIUM " +
              "severity labels, and nlpHighlights with bank name, signal text, and source type " +
              "(transcript, filing, or news). The svbComparison section must include the " +
              "quarterly composite score timeline and parallelsFound narratives for any " +
              "flagged institutions. The top-level recommendation field should reflect the " +
              "highest-risk institution's tier: Watch, Active Monitor, or Immediate Review.",
            tags: ["package-assembly", "quarterly", "full-output", "e2e", "aqews"],
          },
        ],
      },
    });
    expect(res.ok(), `POST .../goldens/bulk → ${res.status()}: ${await res.text()}`).toBeTruthy();

    const check = await request.get(`/api/eval/datasets/${datasetId}`);
    const ds    = await check.json();
    expect(ds.goldenCount, "Dataset should report 3 goldens after bulk insert").toBe(3);
    console.log(`  ✓ goldens seeded — dataset goldenCount: ${ds.goldenCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2 — UI Execution (Playwright browser)
  // ═══════════════════════════════════════════════════════════════════════════

  await test.step("2.1 — Navigate to Eval Runs page (/evals/runs)", async () => {
    // Pre-set the industry localStorage key so the workspace-selector overlay
    // never renders.  addInitScript runs before every page load (including
    // Phase 4 reloads) so we only need to call it once per page context.
    await page.addInitScript(() => {
      localStorage.setItem("almp-industry", "cross_industry");
    });

    await page.goto("/evals/runs");
    await dismissOnboarding(page);
    await expect(
      page.getByTestId("heading-eval-runs"),
      "heading-eval-runs should be visible after navigation",
    ).toBeVisible({ timeout: 15_000 });
    console.log("  ✓ /evals/runs page loaded");
  });

  await test.step("2.2 — Open the New Run configuration panel", async () => {
    await page.getByTestId("button-new-run").click();
    await expect(
      page.getByTestId("card-run-config"),
      "card-run-config should expand after clicking button-new-run",
    ).toBeVisible({ timeout: 10_000 });
    console.log("  ✓ New Run panel open");
  });

  await test.step("2.3 — Select the target agent", async () => {
    await page.getByTestId("select-run-agent").click();
    // Use .first() — Radix UI can briefly render two matching option elements
    // (highlighted + unhighlighted) which would trigger a strict-mode violation.
    await page.getByRole("option", { name: agentName }).first().click();
    console.log(`  ✓ Agent selected: ${agentName}`);
  });

  await test.step("2.4 — Select the E2E dataset", async () => {
    await page.getByTestId("select-run-dataset").click();
    // Option text: "{name} · v1 · 3 goldens"
    await page.getByRole("option").filter({ hasText: DATASET_NAME }).click();
    console.log(`  ✓ Dataset selected: ${DATASET_NAME}`);
  });

  await test.step("2.5 — Select metric collection or toggle individual metrics", async () => {
    if (metricCollectionId) {
      const collSelect = page.getByTestId("select-metric-collection");
      if (await collSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await collSelect.click();
        await page.getByRole("option").first().click();
        console.log(`  ✓ Metric collection selected: ${metricCollectionId}`);
      } else {
        console.log("  ~ select-metric-collection not visible; falling back to individual toggles");
      }
    }

    // Toggle the first two discovered metrics (if their toggles are rendered)
    let toggled = 0;
    for (const id of metricIds.slice(0, 2)) {
      const toggle = page.getByTestId(`toggle-metric-${id}`);
      if (await toggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await toggle.click();
        toggled++;
      }
    }
    if (toggled > 0) {
      console.log(`  ✓ Toggled ${toggled} metric(s)`);
    } else {
      console.log("  ~ No metric toggles visible; run will use default LLM judge (metric:overall)");
    }
  });

  await test.step("2.6 — Start the run and capture run ID from the URL", async () => {
    // After a successful run creation the UI calls navigate(`/evals/runs/${data.id}`)
    // (see eval-runs.tsx onSuccess handler) — so we wait for that navigation,
    // then extract the run ID from the URL rather than from a table row.
    await Promise.all([
      page.waitForURL(/\/evals\/runs\/[0-9a-f-]{36}$/, { timeout: 20_000 }),
      page.getByTestId("button-start-run").click(),
    ]);
    console.log("  ✓ Start Run clicked — navigated to detail page");

    const urlMatch = page.url().match(/\/evals\/runs\/([0-9a-f-]{36})$/);
    runId = urlMatch?.[1] ?? "";
    expect(runId, "Run ID should be extractable from the detail page URL").toBeTruthy();
    console.log(`  ✓ Run ID captured from URL: ${runId}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3 — API Verification (polling + assertions)
  // ═══════════════════════════════════════════════════════════════════════════

  let finalRun: any;
  let completedTraces: any[] = [];

  await test.step("3.1 — Poll run until terminal status (max 5 min)", async () => {
    let attempt = 0;
    finalRun = await pollUntil(
      async () => {
        const res = await request.get(`/api/eval/runs/${runId}`);
        expect(res.ok()).toBeTruthy();
        const run = await res.json();
        console.log(
          `  poll ${++attempt}: status=${run.status}  ` +
          `passed=${run.passedCount ?? 0}  failed=${run.failedCount ?? 0}  ` +
          `pending=${run.pendingCount ?? 0}/${run.totalGoldens}`,
        );
        return ["completed", "failed", "error"].includes(run.status) ? run : null;
      },
      { intervalMs: 5_000, maxMs: 5 * 60 * 1000 },
    );
    console.log(`  ✓ Terminal status reached: ${finalRun.status}`);
  });

  await test.step("3.2 — Assert run completed: 3/3 goldens evaluated", async () => {
    expect(
      finalRun.status,
      `Expected "completed" but got "${finalRun.status}". ` +
      `${finalRun.failedCount ?? 0} failed / ${finalRun.passedCount ?? 0} passed`,
    ).toBe("completed");

    expect(finalRun.totalGoldens, "totalGoldens must be 3").toBe(3);

    const evaluated = (finalRun.passedCount ?? 0) + (finalRun.failedCount ?? 0);
    expect(evaluated, "passedCount + failedCount must equal 3").toBe(3);

    const pct = Math.round(((finalRun.passedCount ?? 0) / 3) * 100);
    console.log(`  ✓ run completed — pass rate: ${pct}%  (${finalRun.passedCount}/3)`);
  });

  await test.step("3.3 — Fetch and validate traces + judge reasoning", async () => {
    // Step A: get the trace list (bulk endpoint — no spans included)
    const listRes  = await request.get(`/api/eval/runs/${runId}/traces`);
    expect(listRes.ok(), `GET .../traces → ${listRes.status()}`).toBeTruthy();

    const body     = await listRes.json();
    const traces: any[] = Array.isArray(body) ? body : (body.traces ?? body.items ?? []);
    expect(traces.length, "Must have exactly 3 traces (one per golden)").toBe(3);

    // Step B: for each trace, fetch individual detail (includes spans + attributes)
    for (const [i, traceRef] of traces.entries()) {
      // ── bulk-level outcome & latency ───────────────────────────────────
      expect(
        typeof traceRef.passFail,
        `Trace[${i}] passFail must be boolean, got ${typeof traceRef.passFail}`,
      ).toBe("boolean");

      const latency = traceRef.latencyMs ?? traceRef.latency_ms ?? 0;
      expect(latency, `Trace[${i}] latencyMs must be > 0`).toBeGreaterThan(0);

      // ── bulk-level scores — judge outcome recorded ─────────────────────
      const scores    = traceRef.scores ?? {};
      const scoreKeys = Object.keys(scores);
      expect(
        scoreKeys.length,
        `Trace[${i}] scores must be non-empty — LLM judge must have run`,
      ).toBeGreaterThan(0);

      // ── individual trace — fetch spans to assert judge reasoning ───────
      // The LLM judge's reasoning string is stored in span.attributes.reason
      // on the "metric:*" span (e.g. "metric:overall").  It is NOT exposed at
      // the trace top-level.  Fetching GET /api/eval/traces/:id returns the
      // full span tree including this field.
      const detailRes = await request.get(`/api/eval/traces/${traceRef.id}`);
      expect(
        detailRes.ok(),
        `GET /api/eval/traces/${traceRef.id} → ${detailRes.status()}`,
      ).toBeTruthy();

      const detail = await detailRes.json();
      const spans: any[] = detail.spans ?? [];
      expect(
        spans.length,
        `Trace[${i}] must have at least one span (agent_invocation + metric span)`,
      ).toBeGreaterThan(0);

      // Find the metric span (named "metric:overall" or "metric:<name>")
      const metricSpan = spans.find(
        (s) => typeof s.name === "string" && s.name.startsWith("metric:"),
      );
      expect(
        metricSpan,
        `Trace[${i}] must contain a "metric:*" span confirming the judge ran.  ` +
        `Spans present: [${spans.map((s: any) => s.name).join(", ")}]`,
      ).toBeTruthy();

      // Assert the judge produced a non-empty reasoning string
      const reason = metricSpan?.attributes?.reason ?? metricSpan?.attributes?.reasoning ?? "";
      expect(
        typeof reason === "string" && reason.trim().length > 0,
        `Trace[${i}] metric span must have a non-empty attributes.reason (LLM judge reasoning).  ` +
        `Got: ${JSON.stringify(reason)}`,
      ).toBeTruthy();

      const outcome = traceRef.passFail ? "passed" : "failed";
      console.log(
        `  trace[${i}]: ${outcome}  latency=${latency}ms  ` +
        `scores=[${scoreKeys.join(",")}]  reason="${reason.slice(0, 80)}…"`,
      );

      completedTraces.push(detail);
    }
    console.log(`  ✓ all ${traces.length} traces verified — LLM reasoning confirmed per trace`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4 — UI Read-back
  //   4.1  Navigate back to /evals/runs → assert run row is visible
  //   4.2  Click link-run-detail → assert run detail page content
  //   4.3  API: verify run metadata
  // ═══════════════════════════════════════════════════════════════════════════

  await test.step("4.1 — Navigate back to /evals/runs; run row visible in table", async () => {
    // After Phase 2.6 we are on /evals/runs/:id (detail page).
    // Navigate back to the list to verify the row appears there too.
    await page.goto("/evals/runs");
    await dismissOnboarding(page);
    await expect(page.getByTestId("heading-eval-runs")).toBeVisible({ timeout: 15_000 });

    const runRow = page.getByTestId(`row-run-${runId}`);
    await expect(runRow, `row-run-${runId} must be visible in the runs table`).toBeVisible({
      timeout: 15_000,
    });
    const rowText = await runRow.textContent();
    console.log(`  run row content: "${rowText?.replace(/\s+/g, " ").trim()}"`);
    console.log("  ✓ run row visible in Eval Runs table");
  });

  await test.step("4.2 — Click link-run-detail → run detail page renders trace rows", async () => {
    // link-run-detail-${id} is a <Button> wrapped in <Link href="/evals/runs/:id">
    const detailLink = page.getByTestId(`link-run-detail-${runId}`);
    await expect(detailLink, `link-run-detail-${runId} must be visible`).toBeVisible({
      timeout: 10_000,
    });

    // Track JS errors before clicking
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await Promise.all([
      page.waitForURL(/\/evals\/runs\/[0-9a-f-]{36}$/, { timeout: 15_000 }),
      detailLink.click(),
    ]);

    // heading-run-detail confirms the detail page loaded
    await expect(
      page.getByTestId("heading-run-detail"),
      "heading-run-detail must be visible on the detail page",
    ).toBeVisible({ timeout: 15_000 });

    // card-run-summary contains the pass rate badge
    await expect(
      page.getByTestId("card-run-summary"),
      "card-run-summary (pass rate badge) must be visible",
    ).toBeVisible({ timeout: 10_000 });

    const summaryText = await page.getByTestId("card-run-summary").textContent();
    expect(
      summaryText?.toLowerCase(),
      "card-run-summary must mention pass rate",
    ).toMatch(/pass rate/i);

    // card-run-traces contains the per-golden row-trace-* rows
    await expect(
      page.getByTestId("card-run-traces"),
      "card-run-traces must be visible on the detail page",
    ).toBeVisible({ timeout: 15_000 });

    await page.waitForSelector("[data-testid^='row-trace-']", { timeout: 15_000 });
    const traceRowCount = await page.locator("[data-testid^='row-trace-']").count();
    expect(traceRowCount, "At least one trace row must be rendered").toBeGreaterThan(0);
    console.log(`  ✓ ${traceRowCount} trace row(s) visible on detail page`);

    // Confirm no critical JS errors
    await page.waitForTimeout(1_500);
    const critical = jsErrors.filter(
      (e) => !e.toLowerCase().includes("warning") && !e.includes("ResizeObserver"),
    );
    expect(critical, `JS errors on run detail: ${critical.join("; ")}`).toHaveLength(0);
    console.log("  ✓ run detail page loaded without JS errors");
  });

  await test.step("4.3 — API: run metadata consistent", async () => {
    const res = await request.get(`/api/eval/runs/${runId}`);
    expect(res.ok()).toBeTruthy();
    const run = await res.json();
    expect(run.agentId).toBe(agentId);
    expect(run.datasetId).toBe(datasetId);
    expect(run.totalGoldens).toBe(3);
    expect(run.status).toBe("completed");
    if (run.passRate != null) {
      expect(run.passRate).toBeGreaterThanOrEqual(0);
      expect(run.passRate).toBeLessThanOrEqual(1);
    }
    console.log(
      `  ✓ run metadata: agentId=${run.agentId.slice(0, 8)}…  ` +
      `passRate=${run.passRate != null ? Math.round(run.passRate * 100) + "%" : "n/a"}`,
    );
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  E2E EVAL WORKFLOW — ALL PHASES COMPLETE");
  console.log(`  Agent:    ${agentName} (${agentId.slice(0, 8)}…)`);
  console.log(`  Metrics:  ${metricIds.length} discovered`);
  console.log(`  Dataset:  ${DATASET_NAME}  (${datasetId.slice(0, 8)}…)`);
  console.log(`  Run:      ${runId}`);
  console.log(`  Result:   ${finalRun?.passedCount ?? "?"}/${3} passed`);
  console.log("══════════════════════════════════════════════════════════\n");
});
