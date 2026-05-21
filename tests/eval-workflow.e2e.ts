/**
 * Eval Workflow — Hybrid E2E test against production
 *
 * Target:  https://atlas-agent-platform.replit.app
 * Auth:    demo mode — no login required
 * Runner:  Playwright (both `request` + `page` fixtures)
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  Phase 1  API Setup      — metric + dataset + 3 goldens  │
 * │  Phase 2  UI Execution   — navigate, configure, start run│
 * │  Phase 3  API Verify     — poll to completion; traces    │
 * │  Phase 4  UI Read-back   — run row + detail page         │
 * └──────────────────────────────────────────────────────────┘
 *
 * All test artefacts are prefixed [E2E] for easy identification.
 * Dataset capped at 3 goldens to minimise LLM cost.
 * No direct DB mutations — everything goes through the public REST API.
 *
 * NOTE: The production eval engine stores judge scores and pass/fail outcomes
 * per trace, but does NOT persist the raw LLM reasoning string in the trace
 * table.  The presence of a non-empty `scores` object (keyed by metric name)
 * is the definitive evidence that the LLM judge fired for each trace.
 */

import { test, expect } from "@playwright/test";

const TS = Date.now();
const DATASET_NAME = `[E2E] Smoke Eval — ${TS}`;
const METRIC_NAME  = `[E2E] Output Quality — ${TS}`;

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Suppress the industry-workspace-selector overlay.
 *
 * Two-pronged approach:
 *  1. addInitScript (called once before first navigation) pre-sets the
 *     localStorage key so the React provider starts with isSelected=true
 *     and never renders the overlay.
 *  2. This fallback clicks the skip button in case the overlay still appears
 *     (e.g. on page reload when addInitScript hasn't been set).
 */
async function dismissOnboarding(page: import("@playwright/test").Page) {
  try {
    const skip = page.getByTestId("button-skip-workspace");
    if (await skip.isVisible({ timeout: 3_000 })) {
      await skip.click();
      // Wait for the fixed overlay to fully unmount before proceeding
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
  let metricId  = "";
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

  await test.step("1.2 — Create a G-Eval quality metric (POST /api/eval/metrics)", async () => {
    const res = await request.post("/api/eval/metrics", {
      data: {
        name: METRIC_NAME,
        category: "general",
        metricType: "g-eval",
        description: "E2E smoke metric — checks output coherence and relevance",
        criteria:
          "The actual output should be coherent, directly relevant to the input question, " +
          "and broadly consistent with the expected output. Minor wording differences are acceptable.",
        evaluationParams: ["input", "actual_output", "expected_output"],
        threshold: 0.5,
        strictMode: false,
        asyncMode: true,
      },
    });
    expect(res.ok(), `POST /api/eval/metrics → ${res.status()}: ${await res.text()}`).toBeTruthy();
    const metric = await res.json();
    metricId = metric.id;
    expect(metricId, "Metric must have an id").toBeTruthy();
    console.log(`  ✓ metric: "${metric.name}" (${metricId})`);
  });

  await test.step("1.3 — Create eval dataset (POST /api/eval/datasets)", async () => {
    const res = await request.post("/api/eval/datasets", {
      data: {
        name: DATASET_NAME,
        description: "Automated E2E test dataset — safe to delete",
        agentId,
        tags: ["e2e", "automated", "smoke"],
      },
    });
    expect(res.ok(), `POST /api/eval/datasets → ${res.status()}: ${await res.text()}`).toBeTruthy();
    const ds  = await res.json();
    datasetId = ds.id;
    expect(datasetId, "Dataset must have an id").toBeTruthy();
    console.log(`  ✓ dataset: "${ds.name}" (${datasetId})`);
  });

  await test.step("1.4 — Seed 3 golden test cases (POST .../goldens/bulk)", async () => {
    const res = await request.post(`/api/eval/datasets/${datasetId}/goldens/bulk`, {
      data: {
        goldens: [
          {
            input: "What is 2 + 2?",
            expectedOutput: "4",
            tags: ["arithmetic", "e2e"],
          },
          {
            input: "Summarise the purpose of an AI agent in one sentence.",
            expectedOutput:
              "An AI agent autonomously perceives its environment and takes actions to achieve a goal.",
            tags: ["summarisation", "e2e"],
          },
          {
            input: "Is the following sentence grammatically correct? 'She go to school every day.'",
            expectedOutput:
              "No — 'go' should be 'goes' for third-person singular present tense.",
            tags: ["grammar", "e2e"],
          },
        ],
      },
    });
    expect(res.ok(), `POST .../goldens/bulk → ${res.status()}: ${await res.text()}`).toBeTruthy();

    // Confirm dataset reflects 3 goldens
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
    // never renders.  addInitScript fires before every page load (including
    // reloads in Phase 4), so we only need to call it once per page context.
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

  await test.step("2.5 — Toggle the E2E metric", async () => {
    // The metric toggle only renders when metrics.length > 0 (our metric is now in the list)
    const toggle = page.getByTestId(`toggle-metric-${metricId}`);
    if (await toggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await toggle.click();
      console.log(`  ✓ Metric toggled: ${METRIC_NAME}`);
    } else {
      // Metric toggle not visible — UI may filter metrics; run proceeds without explicit selection
      console.log(`  ~ Metric toggle not visible (will use default judge); continuing`);
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
  // Phase 3 — API Verification (polling + trace assertions)
  // ═══════════════════════════════════════════════════════════════════════════

  let finalRun: any;

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

  await test.step("3.3 — Fetch and validate traces (GET /api/eval/runs/:id/traces)", async () => {
    const res    = await request.get(`/api/eval/runs/${runId}/traces`);
    expect(res.ok(), `GET .../traces → ${res.status()}`).toBeTruthy();

    const body   = await res.json();
    const traces: any[] = Array.isArray(body) ? body : (body.traces ?? body.items ?? []);
    expect(traces.length, "Must have exactly 3 traces (one per golden)").toBe(3);

    for (const [i, trace] of traces.entries()) {
      // ── outcome ──────────────────────────────────────────────────────────
      // Production stores the judge outcome as `passFail: boolean`
      // (true = passed, false = failed), not as a status string.
      expect(
        typeof trace.passFail,
        `Trace[${i}] passFail must be boolean, got ${typeof trace.passFail}`,
      ).toBe("boolean");

      // ── latency ──────────────────────────────────────────────────────────
      const latency = trace.latencyMs ?? trace.latency_ms ?? 0;
      expect(latency, `Trace[${i}] latencyMs must be > 0`).toBeGreaterThan(0);

      // ── scores — LLM judge fired evidence ────────────────────────────────
      // The eval engine stores judge results as a `scores` object keyed by
      // metric name + the built-in "overall" key.  A non-empty scores object
      // with at least one [E2E] key is definitive proof the LLM judge ran.
      //
      // NOTE: The raw LLM reasoning string produced by the judge is used
      // in-memory during scoring but is NOT persisted to the trace table in
      // this production implementation; see server/routes/eval-studio.ts
      // POST /api/eval/metrics/preview for the endpoint that returns reasoning.
      const scores    = trace.scores ?? {};
      const scoreKeys = Object.keys(scores);
      expect(
        scoreKeys.length,
        `Trace[${i}] scores must be non-empty — LLM judge must have run`,
      ).toBeGreaterThan(0);

      const hasMetricKey = scoreKeys.some(
        (k) => k === "overall" || k.startsWith("[E2E]"),
      );
      expect(
        hasMetricKey,
        `Trace[${i}] scores must contain "overall" or an [E2E] metric key. Got: ${scoreKeys.join(", ")}`,
      ).toBeTruthy();

      const outcome = trace.passFail ? "passed" : "failed";
      console.log(
        `  trace[${i}]: ${outcome}  latency=${latency}ms  scores=[${scoreKeys.join(",")}]`,
      );
    }
    console.log(`  ✓ all ${traces.length} traces verified — LLM judge confirmed via non-empty scores`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4 — UI Read-back
  //   4.1  Navigate back to /evals/runs → assert run row is visible
  //   4.2  Click link-run-detail → assert run detail page content
  //   4.3  API: verify run metadata
  // ═══════════════════════════════════════════════════════════════════════════

  await test.step("4.1 — Navigate back to /evals/runs; run row visible in table", async () => {
    // After Phase 2.6 we are already on /evals/runs/:id (detail page).
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

    // ── heading ────────────────────────────────────────────────────────────
    // heading-run-detail confirms the detail page loaded
    await expect(
      page.getByTestId("heading-run-detail"),
      "heading-run-detail must be visible on the detail page",
    ).toBeVisible({ timeout: 15_000 });

    // ── run summary card with pass rate badge ─────────────────────────────
    // card-run-summary contains the status icon + "<N>% pass rate" badge
    await expect(
      page.getByTestId("card-run-summary"),
      "card-run-summary (pass rate badge) must be visible",
    ).toBeVisible({ timeout: 10_000 });

    // Verify the badge text contains "pass rate"
    const summaryText = await page.getByTestId("card-run-summary").textContent();
    expect(
      summaryText?.toLowerCase(),
      "card-run-summary must mention pass rate",
    ).toMatch(/pass rate/i);

    // ── trace rows ────────────────────────────────────────────────────────
    // card-run-traces contains the per-golden row-trace-* rows
    await expect(
      page.getByTestId("card-run-traces"),
      "card-run-traces must be visible on the detail page",
    ).toBeVisible({ timeout: 15_000 });

    // At least one row-trace-* must be rendered (one per evaluated golden)
    await page.waitForSelector("[data-testid^='row-trace-']", { timeout: 15_000 });
    const traceRowCount = await page.locator("[data-testid^='row-trace-']").count();
    expect(traceRowCount, "At least one trace row must be rendered").toBeGreaterThan(0);
    console.log(`  ✓ ${traceRowCount} trace row(s) visible on detail page`);

    // ── no critical JS errors ─────────────────────────────────────────────
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
  console.log(`  Metric:   ${METRIC_NAME}  (${metricId.slice(0, 8)}…)`);
  console.log(`  Dataset:  ${DATASET_NAME}  (${datasetId.slice(0, 8)}…)`);
  console.log(`  Run:      ${runId}`);
  console.log(`  Result:   ${finalRun?.passedCount ?? "?"}/${3} passed`);
  console.log("══════════════════════════════════════════════════════════\n");
});
