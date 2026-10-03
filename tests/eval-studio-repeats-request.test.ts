/**
 * Asking Eval Studio for a repeated run: the request and what it stores.
 *
 * Eval Studio's own runner (the eval_test_run job) answers each golden once. To
 * let it answer each N times, the request has to carry the count, the run has
 * to remember it, and a count that would be too large has to be refused before
 * anything exists. These tests pin that:
 *   - a run that asks for no repeats stores 1 and queues 1, exactly as before;
 *   - a repeat count is stored on the run and carried in the job payload;
 *   - a bad count, or one that would pass the attempt limit for the dataset, is
 *     refused with the numbers;
 *   - the route refuses before it starts a run;
 *   - the storage the runner will write to is added at boot, with defaults, so
 *     a run created before this change reads as one attempt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_STUDIO_ATTEMPTS } from "../shared/eval-stability";

const state: any = { runs: [] as any[], jobs: [] as any[] };

vi.mock("../server/storage", () => ({
  storage: {
    createEvalTestRun: vi.fn(async (r: any) => { const run = { ...r, id: `run${state.runs.length + 1}` }; state.runs.push(run); return run; }),
    createJob: vi.fn(async (j: any) => { const job = { ...j, id: `job${state.jobs.length + 1}` }; state.jobs.push(job); return job; }),
  },
}));

const { startEvalRun, resolveStudioRepeats } = await import("../server/eval-runs");

const dataset = (goldenCount = 10) => ({ id: "d1", version: 3, goldenCount }) as any;
const start = (extra: any = {}) => startEvalRun({ orgId: "org1", agentId: "a1", dataset: dataset(), ...extra });

beforeEach(() => { state.runs = []; state.jobs = []; });

describe("startEvalRun and repeats", () => {
  it("stores 1 and queues 1 when no repeat count is asked for", async () => {
    await start();
    expect(state.runs[0].repeats).toBe(1);
    expect(state.jobs[0].payload.repeats).toBe(1);
    expect(state.runs[0]).toMatchObject({ status: "pending", totalGoldens: 10, passedCount: 0, failedCount: 0 });
  });

  it("stores the count on the run and carries it in the job payload", async () => {
    await start({ repeats: 4 });
    expect(state.runs[0].repeats).toBe(4);
    expect(state.jobs[0].payload).toMatchObject({ runId: "run1", agentId: "a1", datasetId: "d1", repeats: 4, organizationId: "org1" });
    expect(state.jobs[0].type).toBe("eval_test_run");
  });

  it("leaves everything else about the run as it was", async () => {
    await start({ metricIds: ["m1"], parallelism: 7, tags: ["t"], triggeredBy: "user" });
    expect(state.runs[0]).toMatchObject({ metricIds: ["m1"], parallelism: 7, tags: ["t"], triggeredBy: "user", agentVersion: "latest", datasetVersion: 3 });
    expect(state.jobs[0].payload).toMatchObject({ metricIds: ["m1"], parallelism: 7 });
  });
});

describe("resolveStudioRepeats", () => {
  it("defaults to one answer per golden", () => {
    for (const raw of [undefined, null, ""]) expect(resolveStudioRepeats(raw, 50)).toEqual({ ok: true, repeats: 1 });
  });

  it("accepts a count up to 10, as a number or a numeric string", () => {
    expect(resolveStudioRepeats(5, 20)).toEqual({ ok: true, repeats: 5 });
    expect(resolveStudioRepeats("3", 20)).toEqual({ ok: true, repeats: 3 });
    expect(resolveStudioRepeats(10, 20)).toEqual({ ok: true, repeats: 10 });
  });

  it("refuses a count that is not a whole number from 1 to 10", () => {
    for (const raw of [0, -2, 11, 2.5, "many", NaN, {}, true]) {
      const r = resolveStudioRepeats(raw, 20);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("1 to 10");
    }
  });

  it("allows a larger run than a suite run does, up to the Studio limit", () => {
    expect(MAX_STUDIO_ATTEMPTS).toBe(300);
    expect(resolveStudioRepeats(3, 100)).toEqual({ ok: true, repeats: 3 });
    expect(resolveStudioRepeats(10, 30)).toEqual({ ok: true, repeats: 10 });
  });

  it("refuses a run past the limit, with the numbers", () => {
    const r = resolveStudioRepeats(3, 101);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("101 cases x 3 repeats is 303 attempts; a run is limited to 300");
  });

  it("never refuses a run that asks for no repeats, however large the dataset", () => {
    expect(resolveStudioRepeats(undefined, 5000)).toEqual({ ok: true, repeats: 1 });
    expect(resolveStudioRepeats(1, 5000)).toEqual({ ok: true, repeats: 1 });
  });

  it("accepts an empty dataset", () => {
    expect(resolveStudioRepeats(5, 0)).toEqual({ ok: true, repeats: 5 });
  });
});

describe("the run route", () => {
  const route = readFileSync("server/routes/eval-studio.ts", "utf8");
  const post = route.slice(route.indexOf('router.post("/api/eval/runs"'), route.indexOf('router.get("/api/eval/runs/:id"'));

  it("checks the count before it starts a run, and answers 400 with the reason", () => {
    expect(post).toContain("resolveStudioRepeats(body.repeats, dataset.goldenCount || 0)");
    expect(post).toMatch(/if \(!repeats\.ok\) return res\.status\(400\)\.json\(\{ message: repeats\.error \}\)/);
    expect(post.indexOf("resolveStudioRepeats")).toBeLessThan(post.indexOf("startEvalRun("));
  });

  it("passes the checked count on, not the raw one", () => {
    expect(post).toContain("repeats: repeats.repeats");
    expect(post).not.toMatch(/repeats: body\.repeats/);
  });

  it("checks the count after the caller is known to own the dataset and the agent", () => {
    expect(post.indexOf("resolveStudioRepeats")).toBeGreaterThan(post.indexOf("assertOrgOwnership(targetAgent.organizationId, orgId)"));
  });
});

describe("storage", () => {
  const db = readFileSync("server/db.ts", "utf8");
  const schema = readFileSync("shared/schema.ts", "utf8");

  it("adds the columns at boot with defaults, so an earlier run reads as one attempt", () => {
    expect(db).toMatch(/ALTER TABLE eval_test_runs\s+ADD COLUMN IF NOT EXISTS repeats INTEGER DEFAULT 1;/);
    expect(db).toMatch(/ALTER TABLE eval_test_runs\s+ADD COLUMN IF NOT EXISTS flaky_count INTEGER DEFAULT 0;/);
    expect(db).toMatch(/ALTER TABLE eval_test_runs\s+ADD COLUMN IF NOT EXISTS consistency REAL;/);
    expect(db).toMatch(/ALTER TABLE eval_traces\s+ADD COLUMN IF NOT EXISTS attempt INTEGER DEFAULT 1;/);
  });

  it("declares the same columns in the schema", () => {
    expect(schema).toContain('repeats: integer("repeats").default(1)');
    expect(schema).toContain('flakyCount: integer("flaky_count").default(0)');
    expect(schema).toContain('consistency: real("consistency")');
    expect(schema).toContain('attempt: integer("attempt").default(1)');
  });
});
