/**
 * The start-run card's numbers for a repeated run.
 *
 * The card tells someone, before they start, how many answers a run comes to,
 * whether the server will refuse it, and about what it will cost. These pin:
 *   - the count is goldens times repeats, and one answer per golden is never over the limit;
 *   - the over-limit warning agrees with the server's rule (it is the same constant);
 *   - the cost is taken from an earlier run of the SAME agent and dataset, per answer,
 *     so a run that was itself repeated does not inflate the estimate;
 *   - with nothing to base it on there is no figure, not an invented one;
 *   - the card sends the count, shows the figures, and will not start a run the server would refuse.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { estimateRepeatedRun, type PriorRunForEstimate } from "../shared/eval-repeat-estimate";
import { MAX_STUDIO_ATTEMPTS } from "../shared/eval-stability";

const run = (over: Partial<PriorRunForEstimate> = {}): PriorRunForEstimate => ({
  id: "r1", status: "completed", agentId: "a1", datasetId: "d1", costUsd: 0.3, totalGoldens: 100, repeats: 1,
  completedAt: "2026-10-01T00:00:00Z", ...over,
});
const est = (over: any = {}) => estimateRepeatedRun({ goldenCount: 40, repeats: 3, agentId: "a1", datasetId: "d1", priorRuns: [], ...over });

describe("estimateRepeatedRun: the count and the limit", () => {
  it("is goldens times repeats", () => {
    expect(est({ goldenCount: 40, repeats: 3 }).attempts).toBe(120);
    expect(est({ goldenCount: 7, repeats: 1 }).attempts).toBe(7);
  });

  it("is over the limit exactly when a repeated run passes it, using the server's constant", () => {
    expect(est({ goldenCount: 100, repeats: 3 }).overLimit).toBe(false);
    expect(est({ goldenCount: 101, repeats: 3 }).overLimit).toBe(true);
    expect(est().limit).toBe(MAX_STUDIO_ATTEMPTS);
  });

  it("never calls a run of one answer per golden over the limit, however large the dataset", () => {
    expect(est({ goldenCount: 5000, repeats: 1 }).overLimit).toBe(false);
  });

  it("treats a missing or odd input as the smallest sensible run, not NaN", () => {
    const e = est({ goldenCount: NaN, repeats: 0 });
    expect(e.attempts).toBe(0);
    expect(e.overLimit).toBe(false);
    expect(est({ goldenCount: -5, repeats: 2 }).attempts).toBe(0);
  });
});

describe("estimateRepeatedRun: the cost", () => {
  it("scales an earlier run's cost per answer to this run's answers", () => {
    // $0.30 for 100 answers = $0.003 each; 120 answers = $0.36.
    const e = est({ priorRuns: [run()] });
    expect(e.estimatedCostUsd).toBeCloseTo(0.36, 4);
    expect(e.basedOnRunId).toBe("r1");
  });

  it("counts an earlier repeated run's answers as goldens times its repeats", () => {
    // $0.90 for 100 goldens x 3 = 300 answers = $0.003 each, the same rate.
    const e = est({ priorRuns: [run({ costUsd: 0.9, repeats: 3 })] });
    expect(e.estimatedCostUsd).toBeCloseTo(0.36, 4);
  });

  it("uses the most recent earlier run", () => {
    const e = est({ priorRuns: [run({ id: "old", costUsd: 3, completedAt: "2026-09-01T00:00:00Z" }), run({ id: "new" })] });
    expect(e.basedOnRunId).toBe("new");
  });

  it("uses only runs of the same agent on the same dataset that completed with a cost", () => {
    const e = est({ priorRuns: [
      run({ id: "other-agent", agentId: "a2" }),
      run({ id: "other-dataset", datasetId: "d2" }),
      run({ id: "failed", status: "failed" }),
      run({ id: "free", costUsd: 0 }),
      run({ id: "empty", totalGoldens: 0 }),
      run({ id: "no-cost", costUsd: null }),
    ] });
    expect(e.estimatedCostUsd).toBeNull();
    expect(e.basedOnRunId).toBeNull();
  });

  it("gives no figure, rather than an invented one, when there is no earlier run", () => {
    expect(est().estimatedCostUsd).toBeNull();
  });
});

describe("the start-run card", () => {
  const page = readFileSync("client/src/pages/eval-runs.tsx", "utf8");

  it("asks how many times each golden is answered, from 1 to 10", () => {
    expect(page).toContain('data-testid="select-run-repeats"');
    expect(page).toMatch(/MAX_REPEATS/);
  });

  it("sends the count only when it is above one, so a normal run is requested exactly as before", () => {
    expect(page).toMatch(/repeats: runRepeats > 1 \? runRepeats : undefined/);
  });

  it("shows the answers the run comes to and, when there is a basis, the cost estimate and where it came from", () => {
    expect(page).toContain('data-testid="text-run-repeats-summary"');
    expect(page).toContain('data-testid="text-run-repeats-cost"');
    expect(page).toContain("estimateRepeatedRun(");
  });

  it("warns, and will not start, a run the server would refuse", () => {
    expect(page).toContain('data-testid="text-run-repeats-over-limit"');
    expect(page).toMatch(/disabled=\{!canStartRun \|\| repeatEstimate\.overLimit \|\| startRunMutation\.isPending\}/);
  });

  it("is told what a repeated run is for: a consistency check that does not move the gate", () => {
    expect(page).toMatch(/does not set a gate/i);
  });
});
