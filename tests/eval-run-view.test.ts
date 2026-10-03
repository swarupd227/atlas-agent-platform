/**
 * The run page's reading of a repeated run.
 *
 * A repeated run stores several traces per golden. These pin how they read:
 *   - one row per golden, with the runner's own verdict: pass only if every answer passed, mixed is flaky;
 *   - a golden whose answers so far agree is pending while the run is going, one that already disagrees is flaky;
 *   - the same trace fetched twice counts once (pages shift while a run writes);
 *   - comparing two runs uses one verdict and one score per golden, so a repeated run is not read as its last answer;
 *   - the Failed filter includes flaky goldens, as the run's failed count does;
 *   - the page asks for every trace of a repeated run, and an ordinary run is fetched and shown as before;
 *   - the Studio home sets a run's pass rate only beside a run measured the same way, since a repeated
 *     run's strict rate is not an ordinary run's, and says why a repeated run set no gate verdict;
 *   - the run list marks a repeated run and its flaky goldens.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  groupTracesByGolden, collapseByGolden, filterGoldenRows, isRepeatedRun, meanScore, previousComparableRun, type TraceLike,
} from "../shared/eval-run-view";

let n = 0;
const tr = (goldenId: string, attempt: number | null, passFail: boolean | null, scores?: unknown): TraceLike =>
  ({ id: `t${++n}`, goldenId, attempt, passFail, scores });
const statusOf = (traces: TraceLike[], expected: number) =>
  Object.fromEntries(groupTracesByGolden(traces, expected).map(r => [r.goldenId, r.status]));

describe("groupTracesByGolden: one row per golden with the runner's verdict", () => {
  it("passes only when every answer passed, fails when none did, and calls a mix flaky", () => {
    const traces = [
      tr("a", 1, true), tr("a", 2, true), tr("a", 3, true),
      tr("b", 1, false), tr("b", 2, false), tr("b", 3, false),
      tr("c", 1, true), tr("c", 2, false), tr("c", 3, true),
    ];
    expect(statusOf(traces, 3)).toEqual({ a: "pass", b: "fail", c: "flaky" });
  });

  it("reports how many answers passed, for '2 of 3'", () => {
    const [row] = groupTracesByGolden([tr("c", 1, true), tr("c", 2, false), tr("c", 3, true)], 3);
    expect(row.stability.passedAttempts).toBe(2);
    expect(row.finished).toBe(3);
    expect(row.expected).toBe(3);
  });

  it("keeps a golden's answers in attempt order whatever order they arrived in", () => {
    const [row] = groupTracesByGolden([tr("a", 3, true), tr("a", 1, true), tr("a", 2, true)], 3);
    expect(row.attempts.map(a => a.attempt)).toEqual([1, 2, 3]);
  });

  it("keeps goldens in the order they first appear", () => {
    const rows = groupTracesByGolden([tr("z", 1, true), tr("m", 1, true), tr("z", 2, true)], 2);
    expect(rows.map(r => r.goldenId)).toEqual(["z", "m"]);
  });

  it("reads a run from before repeats (no attempt number, one answer) exactly as one pass or fail", () => {
    expect(statusOf([tr("a", null, true), tr("b", null, false)], 1)).toEqual({ a: "pass", b: "fail" });
  });

  it("counts a trace fetched on two pages once", () => {
    const t = tr("a", 1, true);
    const [row] = groupTracesByGolden([t, { ...t }, tr("a", 2, true)], 2);
    expect(row.attempts).toHaveLength(2);
    expect(row.status).toBe("pass");
  });
});

describe("groupTracesByGolden: a run still going", () => {
  it("is pending while the answers so far agree but some are missing", () => {
    expect(statusOf([tr("a", 1, true), tr("a", 2, true)], 5)).toEqual({ a: "pending" });
    expect(statusOf([tr("a", 1, false)], 3)).toEqual({ a: "pending" });
  });

  it("is pending while an answer is still being evaluated", () => {
    expect(statusOf([tr("a", 1, true), tr("a", 2, null)], 2)).toEqual({ a: "pending" });
  });

  it("is flaky as soon as the answers disagree, since nothing left can undo that", () => {
    expect(statusOf([tr("a", 1, true), tr("a", 2, false)], 5)).toEqual({ a: "flaky" });
  });

  it("is pending when nothing has a result yet", () => {
    expect(statusOf([tr("a", 1, null)], 3)).toEqual({ a: "pending" });
  });
});

describe("collapseByGolden: one verdict and score per golden for a comparison", () => {
  it("takes the golden's verdict, not the last answer's", () => {
    const traces = [tr("a", 1, true), tr("a", 2, false), tr("a", 3, true)];
    expect(collapseByGolden(traces, 3).get("a")?.passFail).toBe(false); // flaky is not a pass
    expect(collapseByGolden([tr("a", 1, true), tr("a", 2, true)], 2).get("a")?.passFail).toBe(true);
  });

  it("averages the answers' scores", () => {
    const traces = [tr("a", 1, true, { overall: 1 }), tr("a", 2, true, { overall: 0.5 })];
    expect(collapseByGolden(traces, 2).get("a")?.avg).toBeCloseTo(0.75);
  });

  it("is the single trace's own result for an ordinary run", () => {
    const m = collapseByGolden([tr("a", null, true, { x: 0.8, y: 0.6 }), tr("b", null, false), tr("c", null, null)], 1);
    expect(m.get("a")).toEqual({ passFail: true, avg: expect.closeTo(0.7) });
    expect(m.get("b")).toEqual({ passFail: false, avg: null });
    expect(m.get("c")?.passFail).toBeNull();
  });
});

describe("filterGoldenRows", () => {
  const rows = groupTracesByGolden([
    tr("p", 1, true), tr("p", 2, true),
    tr("f", 1, false), tr("f", 2, false),
    tr("x", 1, true), tr("x", 2, false),
    tr("w", 1, true),
  ], 2);
  const ids = (f: any) => filterGoldenRows(rows, f).map(r => r.goldenId);

  it("lists passed, failed (flaky included, as the run's failed count is), flaky only, and all", () => {
    expect(ids("pass")).toEqual(["p"]);
    expect(ids("fail")).toEqual(["f", "x"]);
    expect(ids("flaky")).toEqual(["x"]);
    expect(ids("all")).toEqual(["p", "f", "x", "w"]);
  });
});

describe("helpers", () => {
  it("isRepeatedRun is true only above one answer per golden", () => {
    expect(isRepeatedRun({ repeats: 3 })).toBe(true);
    expect(isRepeatedRun({ repeats: 1 })).toBe(false);
    expect(isRepeatedRun({ repeats: null })).toBe(false);
    expect(isRepeatedRun(undefined)).toBe(false);
  });

  it("meanScore ignores non-numbers and says nothing when there are none", () => {
    expect(meanScore({ a: 1, b: 0, c: "x" })).toBe(0.5);
    expect(meanScore({})).toBeNull();
    expect(meanScore(null)).toBeNull();
  });
});

describe("previousComparableRun: what 'points since the run before' may be set against", () => {
  const r = (id: string, passRate: number | null, repeats = 1) => ({ id, passRate, repeats });

  it("is the next earlier ordinary run that has a rate", () => {
    expect(previousComparableRun([r("now", 0.8), r("blank", null), r("then", 0.7)])?.id).toBe("then");
  });

  it("skips a repeated run, whose strict rate is a different measure", () => {
    expect(previousComparableRun([r("now", 0.8), r("rep", 0.4, 3), r("then", 0.7)])?.id).toBe("then");
  });

  it("compares nothing when the latest run is itself repeated", () => {
    expect(previousComparableRun([r("rep", 0.4, 3), r("then", 0.7)])).toBeUndefined();
  });

  it("has nothing to compare when there is one run or none", () => {
    expect(previousComparableRun([r("only", 0.8)])).toBeUndefined();
    expect(previousComparableRun([])).toBeUndefined();
  });
});

describe("the run list and the Studio home", () => {
  const list = readFileSync(new URL("../client/src/pages/eval-runs.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../client/src/pages/eval-studio-home.tsx", import.meta.url), "utf8");

  it("the list marks a repeated run and its flaky goldens", () => {
    expect(list).toContain("badge-run-repeats-");
    expect(list).toContain("text-run-flaky-");
  });

  it("the home page compares only like with like and explains why a repeated run set no gate verdict", () => {
    expect(home).toContain("previousComparableRun(runs)");
    expect(home).toContain("text-gate-repeated");
    expect(home).toContain("text-last-run-flaky");
  });
});

describe("the run page", () => {
  const page = readFileSync(new URL("../client/src/pages/eval-run-detail.tsx", import.meta.url), "utf8");

  it("fetches every trace of a repeated run, in pages, and an ordinary run in one request as before", () => {
    expect(page).toContain("const repeated = isRepeatedRun(run);");
    expect(page).toContain("fetchTraces(id!, serverFilter, repeated)");
    expect(page).toMatch(/params\.set\("page", String\(pageNo\)\)/);
  });

  it("shows the repeated-run figures and the flaky filter only for a repeated run", () => {
    expect(page).toContain("card-run-stability");
    expect(page).toContain("select-traces-filter");
    expect(page).toMatch(/value="flaky"/);
  });

  it("exports the attempt number", () => {
    expect(page).toMatch(/"attempt"/);
  });
});
