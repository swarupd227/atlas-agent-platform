/**
 * Which Eval Studio runs an agent may be judged by.
 *
 * A repeated run (each golden answered several times) has no gate tag and a strict pass rate. The promote
 * route took "the latest completed run", so a consistency check could stand in for the gate:
 *   - a strict 50% read as "gate fails" and blocked a production promotion on a check that sets no gate;
 *   - a run with no tag is judged on its pass rate alone, without the per-metric checks, so a repeated run
 *     could wave a promotion through that the gate would have stopped.
 * These pin that the gate is decided by the latest completed ORDINARY run, that a repeated run is set aside
 * wherever it falls in time, and that an ordinary run is judged exactly as it was.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gradedRuns, isGradedRun, deriveServerGateStatus, type GateRun } from "../server/eval-run-scope";

let n = 0;
const run = (over: Partial<GateRun> & { id?: string } = {}): GateRun & { id: string } => ({
  id: over.id ?? `r${++n}`, status: "completed", passRate: 0.9, repeats: 1, tags: [],
  completedAt: "2026-10-01T00:00:00Z", ...over,
});

// The worker's own rule shape, recording what it was asked to judge.
const judged: number[] = [];
const evaluate = (passRate: number) => {
  judged.push(passRate);
  return passRate >= 0.85 ? "gate:pass" : passRate >= 0.7 ? "gate:warn" : "gate:fail";
};
const status = (runs: GateRun[]) => deriveServerGateStatus(runs, {}, evaluate);

describe("gradedRuns", () => {
  it("keeps ordinary runs and sets repeated runs aside, in order", () => {
    const a = run({ repeats: 1 }), b = run({ repeats: 3 }), c = run({ repeats: null }), d = run({ repeats: undefined }), e = run({ repeats: 5 });
    expect(gradedRuns([a, b, c, d, e]).map((r) => r.id)).toEqual([a.id, c.id, d.id]);
  });

  it("treats a run with no repeat count as an ordinary one", () => {
    expect(isGradedRun({})).toBe(true);
    expect(isGradedRun({ repeats: null })).toBe(true);
    expect(isGradedRun({ repeats: 1 })).toBe(true);
    expect(isGradedRun({ repeats: 2 })).toBe(false);
  });
});

describe("deriveServerGateStatus: the gate is decided by the latest completed ordinary run", () => {
  it("does not let a newer repeated run override the gate's real verdict", () => {
    const ordinary = run({ tags: ["gate:pass"], completedAt: "2026-10-01T00:00:00Z" });
    const repeated = run({ repeats: 3, passRate: 0.5, tags: [], completedAt: "2026-10-03T00:00:00Z" });
    const r = status([repeated, ordinary]);
    expect(r.status).toBe("pass"); // not "fail" from the repeated run's strict 50%
    expect(r.latestRun?.id).toBe(ordinary.id);
  });

  it("does not let a repeated run pass a gate that the ordinary run failed (no per-metric checks)", () => {
    const failed = run({ tags: ["gate:fail"], passRate: 0.6, completedAt: "2026-10-01T00:00:00Z" });
    const repeated = run({ repeats: 3, passRate: 0.95, tags: [], completedAt: "2026-10-03T00:00:00Z" });
    expect(status([repeated, failed]).status).toBe("fail");
  });

  it("is unknown for an agent whose only runs are repeated, as for one with no runs", () => {
    expect(status([run({ repeats: 3, passRate: 0.4 })])).toEqual({ status: "unknown", latestRun: null });
    expect(status([])).toEqual({ status: "unknown", latestRun: null });
  });

  it("never judges a repeated run's rate", () => {
    judged.length = 0;
    status([run({ repeats: 3, passRate: 0.4 }), run({ repeats: 2, passRate: 0.95 })]);
    expect(judged).toEqual([]);
  });
});

describe("deriveServerGateStatus: an ordinary run is judged exactly as before", () => {
  it("reads the persisted gate tag, newest completed run first", () => {
    const old = run({ tags: ["gate:fail"], completedAt: "2026-09-01T00:00:00Z" });
    const recent = run({ tags: ["gate:warn"], completedAt: "2026-10-02T00:00:00Z" });
    expect(status([old, recent]).status).toBe("warn");
    expect(status([recent, old]).status).toBe("warn");
  });

  it("orders by completion, falling back to start", () => {
    const a = run({ completedAt: null, startedAt: "2026-10-02T00:00:00Z", tags: ["gate:pass"] });
    const b = run({ completedAt: "2026-10-01T00:00:00Z", tags: ["gate:fail"] });
    expect(status([b, a]).status).toBe("pass");
  });

  it("judges an untagged run on its pass rate, through the worker's rule", () => {
    judged.length = 0;
    expect(status([run({ passRate: 0.9 })]).status).toBe("pass");
    expect(status([run({ passRate: 0.75 })]).status).toBe("warn");
    expect(status([run({ passRate: 0.5 })]).status).toBe("fail");
    expect(judged).toEqual([0.9, 0.75, 0.5]);
  });

  it("is unknown for an untagged run with no pass rate, and ignores unfinished runs", () => {
    expect(status([run({ passRate: null })]).status).toBe("unknown");
    expect(status([run({ status: "running", tags: ["gate:fail"] })])).toEqual({ status: "unknown", latestRun: null });
    expect(status([run({ status: "failed", tags: ["gate:fail"] })]).status).toBe("unknown");
  });

  it("trusts the persisted tag over the pass rate: a per-metric failure fails the gate at a high pass rate", () => {
    judged.length = 0;
    expect(status([run({ tags: ["gate:fail"], passRate: 0.97 })]).status).toBe("fail");
    expect(status([run({ tags: ["gate:warn"], passRate: 0.97 })]).status).toBe("warn");
    expect(status([run({ tags: ["gate:pass"], passRate: 0.3 })]).status).toBe("pass");
    expect(judged).toEqual([]); // a tagged run is never re-judged
  });

  it("reads a tag in any position of the list", () => {
    expect(status([run({ tags: ["nightly", "gate:warn", "x"] })]).status).toBe("warn");
  });
});

describe("the promote route", () => {
  const route = readFileSync(new URL("../server/routes/eval-studio.ts", import.meta.url), "utf8");

  it("takes the gate's state from deriveServerGateStatus and not from the newest run of any kind", () => {
    expect(route).toMatch(/import \{[^}]*\bderiveServerGateStatus\b[^}]*\} from "\.\.\/eval-run-scope";/);
    expect(route).toMatch(/deriveServerGateStatus\(\s*recentRuns,\s*gate,/);
    expect(route).not.toMatch(/completedRuns\[0\]/);
  });

  it("still judges an untagged run with the worker's rule and no per-metric data", () => {
    expect(route).toContain("evaluateGateTag(passRate, g, {})");
  });
});
