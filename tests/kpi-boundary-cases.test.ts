/**
 * KPI boundary cases that an agent can actually satisfy.
 *
 * Every branch of the generator derived its boundary values by nudging the
 * threshold (+-1, or +-10%) and clamping at 0. Several real KPIs carry
 * slaThreshold 0 -- and two of the MGA ones carry target 0 -- so the nudge
 * collapsed onto the threshold itself and produced PAIRS OF CASES WITH THE
 * SAME simulatedValue ASSERTING OPPOSITE VERDICTS:
 *
 *   Below SLA Boundary (0percent)  value 0  ->  slaBreached true
 *   At SLA Threshold   (0percent)  value 0  ->  slaBreached false
 *
 * No agent can satisfy both, and the suite recorded it as the agent's failure.
 * Measured live: 3 of 5 failures in the E&S KPI suite were this, plus an
 * expectedAction enum the agent was never shown.
 *
 * The sweep at the end is the real guard: it asserts the invariant across many
 * threshold/target combinations rather than only the ones that happened to
 * break, so a future branch cannot reintroduce the contradiction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: any = { outcome: { id: "o1", name: "MGA Lifecycle" }, kpis: [], agent: { id: "a1", name: "E&S Orchestrator", ontologyTags: [] }, suite: null, created: [] };

vi.mock("../server/storage", () => ({
  storage: {
    getOutcome: vi.fn(async () => state.outcome),
    getKpisByOutcome: vi.fn(async () => state.kpis),
    getAgent: vi.fn(async () => state.agent),
    getOntologyConcept: vi.fn(async () => null),
    createEvalSuite: vi.fn(async (s: any) => { state.suite = { ...s, id: "s1" }; return state.suite; }),
    createEvalTestCase: vi.fn(async (c: any) => { state.created.push(c); return { ...c, id: `c${state.created.length}` }; }),
    createAuditEvent: vi.fn(async () => ({})),
  },
}));

const { generateKpiAlignedEvalSuite } = await import("../server/routes/helpers");

const kpi = (over: any = {}) => ({ id: "k1", name: "Treaty breach detection rate", slaThreshold: 0, target: 100, unit: "percent", ...over });

const run = async () => {
  state.created = [];
  state.suite = null;
  const r = await generateKpiAlignedEvalSuite("a1", "o1");
  return { result: r, cases: state.created, suite: state.suite };
};

/** Cases that assert different things about the same KPI at the same value. */
const contradictionsIn = (cases: any[]) => {
  const groups = new Map<string, any[]>();
  for (const c of cases) {
    const i = c.inputData ?? {};
    if (i.type !== "kpi_boundary_test") continue;
    const key = `${i.kpiId}|${i.simulatedValue}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const bad: string[] = [];
  for (const [key, g] of groups) {
    const assertions = new Set(g.map(c => JSON.stringify(
      Object.fromEntries(Object.entries(c.expectedOutput ?? {}).filter(([k]) => k !== "kpiName" && k !== "threshold" && k !== "target")),
    )));
    if (assertions.size > 1) bad.push(`${key}: ${[...assertions].join(" VS ")}`);
  }
  return bad;
};

beforeEach(() => { state.kpis = [kpi()]; state.agent.ontologyTags = []; });

describe("percentage KPI boundaries", () => {
  it("does not generate a breach and a non-breach at the same value when the threshold is 0", async () => {
    state.kpis = [kpi({ slaThreshold: 0, target: 100 })];
    const { cases } = await run();
    expect(contradictionsIn(cases)).toEqual([]);
  });

  it("skips 'below threshold' when the threshold is 0, and says why", async () => {
    state.kpis = [kpi({ slaThreshold: 0, target: 100 })];
    const { cases, suite } = await run();
    expect(cases.find((c: any) => c.inputData.scenario === "below_threshold")).toBeUndefined();
    // Not silent: a missing case and a passing case must not look alike.
    const skipped = (suite.ontologyTags as any).skippedBoundaries;
    expect(skipped).toBeDefined();
    expect(skipped.some((s: any) => s.scenario === "below_threshold" && /nothing is below/i.test(s.reason))).toBe(true);
  });

  it("puts the 'above target' case at or past the TARGET, not at threshold + 1", async () => {
    state.kpis = [kpi({ slaThreshold: 0, target: 100 })];
    const { cases } = await run();
    const above = cases.find((c: any) => c.inputData.scenario === "above_target");
    expect(above).toBeDefined();
    // The old code produced 1 here and still asserted withinTarget: true.
    expect(above.inputData.simulatedValue).toBeGreaterThanOrEqual(100);
    expect(above.expectedOutput.withinTarget).toBe(true);
  });

  it("generates three distinct values for a normal KPI", async () => {
    state.kpis = [kpi({ slaThreshold: 95, target: 99 })];
    const { cases } = await run();
    const vals = cases.filter((c: any) => c.inputData.type === "kpi_boundary_test").map((c: any) => c.inputData.simulatedValue);
    expect(new Set(vals).size).toBe(vals.length);
    const below = cases.find((c: any) => c.inputData.scenario === "below_threshold");
    expect(below.inputData.simulatedValue).toBeLessThan(95);
    expect(below.expectedOutput.slaBreached).toBe(true);
  });

  it("skips 'above target' when the target is 0 rather than asserting withinTarget on 1", async () => {
    state.kpis = [kpi({ name: "Bordereau reconciliation accuracy", slaThreshold: 0, target: 0 })];
    const { cases, suite } = await run();
    expect(cases.find((c: any) => c.inputData.scenario === "above_target")).toBeUndefined();
    expect((suite.ontologyTags as any).skippedBoundaries.some((s: any) => s.scenario === "above_target")).toBe(true);
    expect(contradictionsIn(cases)).toEqual([]);
  });
});

describe("the expectedAction enum is disclosed", () => {
  it("tells the agent the allowed actions whenever it asserts one", async () => {
    state.kpis = [kpi({ slaThreshold: 95, target: 99 })];
    const { cases } = await run();
    const asserting = cases.filter((c: any) => c.expectedOutput?.expectedAction);
    expect(asserting.length).toBeGreaterThan(0);
    for (const c of asserting) {
      // Previously 0 of these carried the vocabulary, so a correct decision
      // phrased as prose was scored wrong.
      expect(Array.isArray(c.inputData.allowedActions)).toBe(true);
      expect(c.inputData.allowedActions).toContain(c.expectedOutput.expectedAction);
    }
  });
});

describe("latency, volume and generic branches", () => {
  it("latency: 'exceeds' is strictly past a 0 threshold, and 'within' is skipped", async () => {
    state.kpis = [{ id: "k2", name: "Binding response latency", slaThreshold: 0, target: 0, unit: "ms" }];
    const { cases, suite } = await run();
    const exceeds = cases.find((c: any) => c.inputData.scenario === "exceeds_threshold");
    const at = cases.find((c: any) => c.inputData.scenario === "at_threshold");
    expect(exceeds.inputData.simulatedValue).toBeGreaterThan(at.inputData.simulatedValue);
    expect(cases.find((c: any) => c.inputData.scenario === "within_target")).toBeUndefined();
    expect((suite.ontologyTags as any).skippedBoundaries.some((s: any) => s.scenario === "within_target")).toBe(true);
    expect(contradictionsIn(cases)).toEqual([]);
  });

  it("volume: a 0 target skips 'below target' instead of claiming a gap of 0", async () => {
    state.kpis = [{ id: "k3", name: "Submissions processed volume", slaThreshold: 0, target: 0, unit: "count" }];
    const { cases } = await run();
    expect(cases.find((c: any) => c.inputData.scenario === "below_target")).toBeUndefined();
    expect(cases.find((c: any) => c.inputData.scenario === "at_target")).toBeDefined();
    expect(contradictionsIn(cases)).toEqual([]);
  });

  it("volume: a real target gives a below-target case with a non-zero gap", async () => {
    state.kpis = [{ id: "k3", name: "Submissions processed volume", slaThreshold: 0, target: 400, unit: "count" }];
    const { cases } = await run();
    const below = cases.find((c: any) => c.inputData.scenario === "below_target");
    expect(below.expectedOutput.gap).toBeGreaterThan(0);
    expect(below.inputData.simulatedValue).toBeLessThan(400);
  });

  it("generic: a 0 threshold does not assert a breach at the boundary value", async () => {
    state.kpis = [{ id: "k4", name: "Binder quality index", slaThreshold: 0, target: 0, unit: "index" }];
    const { cases } = await run();
    expect(contradictionsIn(cases)).toEqual([]);
    expect(cases.find((c: any) => c.inputData.scenario === "below_threshold")).toBeUndefined();
  });

  it("skips a KPI with no numeric threshold or target at all", async () => {
    state.kpis = [{ id: "k5", name: "Unscored rate", slaThreshold: null, target: null, unit: "percent" }];
    const { cases, suite } = await run();
    expect(cases.filter((c: any) => c.inputData?.type === "kpi_boundary_test")).toHaveLength(0);
    expect((suite.ontologyTags as any).skippedBoundaries.some((s: any) => /neither a numeric/i.test(s.reason))).toBe(true);
  });
});

describe("the invariant holds across thresholds and targets", () => {
  it("never emits two conflicting assertions at one value, for any combination", async () => {
    const shapes = [
      { name: "Treaty breach detection rate", unit: "percent" },
      { name: "Binding response latency", unit: "ms" },
      { name: "Submissions processed volume", unit: "count" },
      { name: "Binder quality index", unit: "index" },
    ];
    const failures: string[] = [];
    for (const shape of shapes) {
      for (const slaThreshold of [0, 1, 2, 50, 95, 100]) {
        for (const target of [0, 1, 99, 100, 400]) {
          state.kpis = [{ id: "kx", slaThreshold, target, ...shape }];
          const { cases } = await run();
          const bad = contradictionsIn(cases);
          if (bad.length) failures.push(`${shape.name} t=${slaThreshold} g=${target}: ${bad.join(" | ")}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("every case's asserted breach agrees with its own numbers", async () => {
    // A breach case must sit outside the threshold and a non-breach inside it,
    // for the percentage shape where "higher is better".
    const failures: string[] = [];
    for (const slaThreshold of [1, 2, 50, 95]) {
      state.kpis = [{ id: "kx", name: "Treaty breach detection rate", unit: "percent", slaThreshold, target: 100 }];
      const { cases } = await run();
      for (const c of cases.filter((x: any) => x.inputData?.type === "kpi_boundary_test")) {
        const v = c.inputData.simulatedValue;
        const breached = c.expectedOutput.slaBreached;
        if (breached === true && !(v < slaThreshold)) failures.push(`${c.name}: asserts breach at ${v} with threshold ${slaThreshold}`);
        if (breached === false && v < slaThreshold) failures.push(`${c.name}: asserts no breach at ${v} below threshold ${slaThreshold}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
