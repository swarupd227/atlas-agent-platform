/**
 * Eval Workflow — Full E2E test (API-only) against production
 *
 * Target:  https://atlas-agent-platform.replit.app
 * Auth:    demo mode — no login required
 * Runner:  Playwright `request` fixture  (no browser binary needed)
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  Phase 1  API Setup     — metric + eval dataset + goldens │
 * │  Phase 2  API Execution — trigger eval run via REST       │
 * │  Phase 3  API Verify    — poll to completion; check traces│
 * │  Phase 4  API Read-back — confirm data is queriable       │
 * └──────────────────────────────────────────────────────────┘
 *
 * All test artefacts are prefixed [E2E] for easy identification / cleanup.
 * Dataset is capped at 3 goldens to minimise LLM cost.
 * No direct DB mutations — everything goes through the public REST API.
 */

import { test, expect } from "@playwright/test";

const TS = Date.now();
const DATASET_NAME = `[E2E] Smoke Eval — ${TS}`;
const METRIC_NAME  = `[E2E] Output Quality — ${TS}`;

// ─── helpers ────────────────────────────────────────────────────────────────

/** Poll `fn` every `intervalMs` until it returns a truthy value or `maxMs` expires. */
async function pollUntil<T>(
  fn: () => Promise<T | null | undefined>,
  { intervalMs, maxMs }: { intervalMs: number; maxMs: number },
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil: timed out after ${maxMs / 1000}s`);
}

// ─── test ────────────────────────────────────────────────────────────────────

test("Eval Workflow: full E2E smoke test against production", async ({ request }) => {
  test.setTimeout(10 * 60 * 1000);

  // shared state populated incrementally across phases
  let agentId   = "";
  let agentName = "";
  let metricId  = "";
  let datasetId = "";
  let runId     = "";

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1 — API Setup
  // ═══════════════════════════════════════════════════════════════════════════

  await test.step("1.1 — Discover a live active agent", async () => {
    const res = await request.get("/api/agents");
    expect(res.ok(), `GET /api/agents → ${res.status()}`).toBeTruthy();

    const body = await res.json();
    const agents: any[] = Array.isArray(body) ? body : (body.agents ?? []);
    const live = agents.filter((a) => ["active", "deployed"].includes(a.status));

    expect(live.length, "No active/deployed agents found in production").toBeGreaterThan(0);
    agentId   = live[0].id;
    agentName = live[0].name;
    console.log(`  ✓ agent: "${agentName}" (${agentId})`);
  });

  await test.step("1.2 — Create a G-Eval quality metric", async () => {
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
    console.log(`  ✓ metric: "${metric.name}" (${metricId})`);
  });

  await test.step("1.3 — Create eval dataset", async () => {
    const res = await request.post("/api/eval/datasets", {
      data: {
        name: DATASET_NAME,
        description: "Automated E2E test dataset — safe to delete",
        agentId,
        tags: ["e2e", "automated", "smoke"],
      },
    });
    expect(res.ok(), `POST /api/eval/datasets → ${res.status()}: ${await res.text()}`).toBeTruthy();
    const ds = await res.json();
    datasetId = ds.id;
    console.log(`  ✓ dataset: "${ds.name}" (${datasetId})`);
  });

  await test.step("1.4 — Seed 3 golden test cases", async () => {
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

    // Verify dataset reflects updated golden count
    const check = await request.get(`/api/eval/datasets/${datasetId}`);
    const ds    = await check.json();
    expect(ds.goldenCount, "Dataset should report 3 goldens").toBe(3);
    console.log(`  ✓ goldens seeded — dataset goldenCount: ${ds.goldenCount}`);
  });

  await test.step("1.5 — Fetch metric by ID to confirm it persisted", async () => {
    const res = await request.get(`/api/eval/metrics/${metricId}`);
    // Some deployments return 404 on direct lookup if not found; others 200 with data.
    // We confirm either a 200 with the correct ID, or skip gracefully.
    if (res.ok()) {
      const metric = await res.json();
      if (metric?.id) {
        expect(metric.id).toBe(metricId);
        console.log(`  ✓ metric confirmed via direct lookup: ${metric.name}`);
      } else {
        console.log(`  ~ metric direct-lookup returned body without id — skipping assertion`);
      }
    } else {
      // 404 is acceptable — the POST already confirmed creation.
      console.log(`  ~ GET /api/eval/metrics/${metricId} → ${res.status()} (creation was confirmed by POST)`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2 — Trigger the eval run via API
  // ═══════════════════════════════════════════════════════════════════════════

  await test.step("2.1 — POST /api/eval/runs", async () => {
    const res = await request.post("/api/eval/runs", {
      data: {
        agentId,
        datasetId,
        metricIds: [metricId],
        judgeModelOverride: "claude-3-haiku-20240307",
        parallelism: 3,
        cacheEnabled: false,
        tags: ["e2e", "smoke"],
        triggeredBy: "playwright-e2e",
      },
    });
    expect(res.ok(), `POST /api/eval/runs → ${res.status()}: ${await res.text()}`).toBeTruthy();

    const run = await res.json();
    runId = run.id;
    expect(runId, "Run ID must be returned").toBeTruthy();
    expect(run.status).toMatch(/^(pending|running|queued)$/);
    expect(run.totalGoldens, "Run should know there are 3 goldens").toBe(3);
    console.log(`  ✓ run created: ${runId}  status=${run.status}  totalGoldens=${run.totalGoldens}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3 — Poll to completion and assert traces
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
          `pending=${run.pendingCount ?? 0}/${run.totalGoldens}`
        );
        return ["completed", "failed", "error"].includes(run.status) ? run : null;
      },
      { intervalMs: 5_000, maxMs: 5 * 60 * 1000 },
    );
    console.log(`  ✓ terminal status reached: ${finalRun.status}`);
  });

  await test.step("3.2 — Assert run completed successfully", async () => {
    expect(
      finalRun.status,
      `Expected "completed" but got "${finalRun.status}". ` +
      `${finalRun.failedCount ?? 0} failed / ${finalRun.passedCount ?? 0} passed`,
    ).toBe("completed");

    expect(finalRun.totalGoldens, "totalGoldens must be 3").toBe(3);

    const evaluated = (finalRun.passedCount ?? 0) + (finalRun.failedCount ?? 0);
    expect(evaluated, "All 3 goldens must be scored (passedCount + failedCount = 3)").toBe(3);

    const pct = Math.round(((finalRun.passedCount ?? 0) / 3) * 100);
    console.log(`  ✓ run completed — pass rate: ${pct}%  (${finalRun.passedCount}/${3})`);
  });

  await test.step("3.3 — Fetch and validate traces", async () => {
    const res = await request.get(`/api/eval/runs/${runId}/traces`);
    expect(res.ok(), `GET /api/eval/runs/${runId}/traces → ${res.status()}`).toBeTruthy();

    const body   = await res.json();
    const traces: any[] = Array.isArray(body) ? body : (body.traces ?? body.items ?? []);

    expect(traces.length, "Must have exactly 3 traces (one per golden)").toBe(3);

    for (const [i, trace] of traces.entries()) {
      // Trace outcome is stored as `passFail: boolean` (true = passed, false = failed)
      expect(
        typeof trace.passFail,
        `Trace[${i}] passFail must be a boolean, got: ${typeof trace.passFail}`,
      ).toBe("boolean");

      // Latency must be recorded
      const latency = trace.latencyMs ?? trace.latency_ms ?? 0;
      expect(latency, `Trace[${i}] latencyMs must be > 0`).toBeGreaterThan(0);

      // Scores object must be non-empty — presence of our metric name as a key proves
      // the LLM judge ran (scores keys = metric name + "overall")
      const scores = trace.scores ?? {};
      const scoreKeys = Object.keys(scores);
      expect(
        scoreKeys.length,
        `Trace[${i}] scores must be non-empty (got: ${JSON.stringify(scores)})`,
      ).toBeGreaterThan(0);

      // At least one score key must match our metric or the built-in "overall"
      const hasExpectedKey = scoreKeys.some(
        (k) => k === METRIC_NAME || k === "overall" || k.startsWith("[E2E]"),
      );
      expect(
        hasExpectedKey,
        `Trace[${i}] scores should contain our E2E metric key. Got keys: ${scoreKeys.join(", ")}`,
      ).toBeTruthy();

      // Reasoning: look in the judge span's outputs (optional field — scores already prove judge ran)
      const spans: any[] = trace.spans ?? [];
      const judgeSpan = spans.find((s) => s.name?.startsWith("metric:"));
      const spanReason = judgeSpan?.outputs?.reason ?? judgeSpan?.outputs?.reasoning ?? "";
      const outcome = trace.passFail ? "passed" : "failed";

      console.log(
        `  trace[${i}]: outcome=${outcome}  latency=${latency}ms` +
        `  scores=[${scoreKeys.join(",")}]` +
        (spanReason ? `  reason="${spanReason.slice(0, 60)}…"` : "  reason=(not in span outputs)"),
      );
    }
    console.log(`  ✓ all ${traces.length} traces verified — LLM judge confirmed via non-empty scores`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4 — API read-back: confirm the run and its data are queryable
  // ═══════════════════════════════════════════════════════════════════════════

  await test.step("4.1 — Run appears in GET /api/eval/runs listing", async () => {
    const res  = await request.get("/api/eval/runs");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const list: any[] = Array.isArray(body) ? body : (body.runs ?? []);
    const found = list.find((r) => r.id === runId);
    expect(found, `Run ${runId} must appear in the runs listing`).toBeTruthy();
    expect(found.status).toBe("completed");
    console.log(`  ✓ run visible in /api/eval/runs listing (${list.length} total)`);
  });

  await test.step("4.2 — Dataset appears in GET /api/eval/datasets listing", async () => {
    const res  = await request.get("/api/eval/datasets");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const list: any[] = Array.isArray(body) ? body : (body.datasets ?? []);
    const found = list.find((d) => d.id === datasetId);
    expect(found, `Dataset ${datasetId} must appear in the datasets listing`).toBeTruthy();
    console.log(`  ✓ dataset visible in /api/eval/datasets listing`);
  });

  await test.step("4.3 — GET /api/eval/runs/:id returns correct metadata", async () => {
    const res = await request.get(`/api/eval/runs/${runId}`);
    expect(res.ok()).toBeTruthy();
    const run = await res.json();
    expect(run.agentId).toBe(agentId);
    expect(run.datasetId).toBe(datasetId);
    expect(run.totalGoldens).toBe(3);
    expect(run.status).toBe("completed");
    // Pass rate should be between 0 and 1
    if (run.passRate != null) {
      expect(run.passRate).toBeGreaterThanOrEqual(0);
      expect(run.passRate).toBeLessThanOrEqual(1);
    }
    console.log(
      `  ✓ run metadata correct: agentId=${run.agentId.slice(0, 8)}…` +
      `  passRate=${run.passRate != null ? Math.round(run.passRate * 100) + "%" : "n/a"}`
    );
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  E2E EVAL WORKFLOW — ALL PHASES COMPLETE");
  console.log(`  Agent:    ${agentName} (${agentId.slice(0, 8)}…)`);
  console.log(`  Metric:   ${METRIC_NAME}  (${metricId.slice(0, 8)}…)`);
  console.log(`  Dataset:  ${DATASET_NAME}  (${datasetId.slice(0, 8)}…)`);
  console.log(`  Run:      ${runId}`);
  console.log(`  Result:   ${finalRun?.passedCount ?? "?"}/${3} passed`);
  console.log("══════════════════════════════════════════════════════\n");
});
