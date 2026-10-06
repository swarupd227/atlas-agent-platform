/**
 * The Dashboard's "Overall Health" figure.
 *
 * It read **47.7%** on the live platform and meant nothing. The calculation
 * scored an outcome with NO KPIs as 100, and 28 of 69 outcomes had none — so
 * 85% of the number (2,800 of 3,291 points) came from outcomes with nothing to
 * measure. Meanwhile 145 of 166 KPIs had never been recorded and were averaged
 * in as real zeroes. Excluding the unmeasured gives 11.9% over the outcomes
 * that have KPIs, and 57% over the 21 KPIs anyone has actually measured.
 *
 * The worst property was the direction: adding a KPI to an outcome LOWERED the
 * score, so the way to look healthy was to measure nothing. That is the same
 * failure as a run reporting `completed_with_skips` as success, on the default
 * landing page for every role without Cowork.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { kpiHealth, failingKpis } from "../client/src/pages/overview";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const kpi = (over: Partial<Parameters<typeof kpiHealth>[0][number]["kpis"][number]> = {}) => ({
  id: "k1", name: "A KPI", unit: "%", current: 50, target: 100, progress: 50,
  slaThreshold: null, breachLevel: null, trend: null,
  measuredAt: "2026-09-30T00:00:00.000Z", valueSource: "manual",
  ...over,
} as any);

describe("an outcome with nothing measured is not counted as healthy", () => {
  it("does not score an outcome with no KPIs as 100", () => {
    const r = kpiHealth([{ kpis: [] }, { kpis: [] }, { kpis: [kpi({ progress: 20 })] }]);
    // The old calculation returned (100 + 100 + 20) / 3 = 73.3 here.
    expect(r.value).toBe(20);
    expect(r.measured).toBe(1);
    expect(r.total).toBe(1);
  });

  it("answers null when nothing has been measured at all, rather than 0% or 100%", () => {
    const r = kpiHealth([{ kpis: [kpi({ measuredAt: null }), kpi({ measuredAt: null })] }]);
    expect(r.value).toBeNull();
    expect(r.measured).toBe(0);
    expect(r.total).toBe(2);
  });

  it("answers null for no outcomes at all", () => {
    expect(kpiHealth([]).value).toBeNull();
  });
});

describe("a KPI nobody measured is left out, not counted as zero", () => {
  it("averages only the measured ones", () => {
    const r = kpiHealth([{ kpis: [kpi({ progress: 80 }), kpi({ progress: 60, measuredAt: null })] }]);
    // Counting the unmeasured one as zero would give 40.
    expect(r.value).toBe(80);
    expect(r.measured).toBe(1);
    expect(r.total).toBe(2);
  });

  it("does not move when an unmeasured KPI is added — the old number fell", () => {
    const before = kpiHealth([{ kpis: [kpi({ progress: 80 })] }]);
    const after = kpiHealth([{ kpis: [kpi({ progress: 80 }), kpi({ progress: 0, measuredAt: null })] }]);
    expect(after.value).toBe(before.value);
    // The coverage is what changes, and the tile shows it.
    expect(after.total).toBe(before.total + 1);
    expect(after.measured).toBe(before.measured);
  });
});

describe("saying when the figure rests on proxies", () => {
  it("flags values that all came from run statistics", () => {
    const r = kpiHealth([{ kpis: [kpi({ valueSource: "agent_runs" }), kpi({ valueSource: "agent_runs" })] }]);
    expect(r.proxyOnly).toBe(true);
  });

  it("does not flag when a person recorded any of them", () => {
    const r = kpiHealth([{ kpis: [kpi({ valueSource: "agent_runs" }), kpi({ valueSource: "manual" })] }]);
    expect(r.proxyOnly).toBe(false);
  });

  it("does not flag when nothing is measured", () => {
    expect(kpiHealth([{ kpis: [kpi({ measuredAt: null })] }]).proxyOnly).toBe(false);
  });
});

describe("the live shape it was built for", () => {
  it("reproduces the platform's own numbers", () => {
    // 69 outcomes: 28 with no KPIs, and 166 KPIs of which 21 are measured.
    const measured = Array.from({ length: 21 }, () => kpi({ progress: 57, valueSource: "agent_runs" }));
    const unmeasured = Array.from({ length: 145 }, () => kpi({ measuredAt: null, progress: 0 }));
    const outcomes = [
      ...Array.from({ length: 28 }, () => ({ kpis: [] })),
      { kpis: [...measured, ...unmeasured] },
    ];
    const r = kpiHealth(outcomes);
    expect(r.value).toBe(57);
    expect(r.measured).toBe(21);
    expect(r.total).toBe(166);
    expect(r.proxyOnly).toBe(true);
  });
});

/**
 * What the Dashboard shows before anyone clicks.
 *
 * Measured live 2026-10-06: the whole page came to 401 characters of text —
 * four numbers, three at-risk outcomes, and five headings. Every section was
 * collapsed, so "Agents At Risk 10" said there was a problem and not what it
 * was, and "Attention 45" was three unlike things added together.
 */
describe("the Dashboard shows its state without being asked", () => {
  const page = read("client", "src", "pages", "overview.tsx");

  it("opens its sections by default", () => {
    expect(page).toContain("defaultOpen = true");
    expect(page).not.toContain("defaultOpen = false");
  });

  it("keeps collapsing available for a reader who wants it shut", () => {
    // The point is what you ARRIVE at, not removing the control.
    expect(page).toContain("const [open, setOpen] = useState(defaultOpen)");
  });

  it("breaks the attention count into its parts, not just a sum", () => {
    // 45 overdue approvals and 45 bored agents were the same number before.
    const card = page.slice(page.indexOf('label="Attention"'));
    expect(card.slice(0, 900)).toContain("outcomesAtRisk ? `${outcomesAtRisk} outcome");
    expect(card.slice(0, 900)).toContain("overdueApprovals ? `${overdueApprovals} approval");
    expect(card.slice(0, 900)).toContain("agentsWithIncidents ? `${agentsWithIncidents} agent");
  });

  it("still says all clear when there is nothing", () => {
    const card = page.slice(page.indexOf('label="Attention"'));
    expect(card.slice(0, 900)).toContain('attentionCount === 0');
    expect(card.slice(0, 900)).toContain('"all clear"');
  });
});

/**
 * "At Risk" and the Attention count.
 *
 * Measured live 2026-10-06: 43 of 71 outcomes read At Risk, and 39 of them only
 * because a KPI had never been measured — an unrecorded KPI has progress 0, and
 * the rule was `progress < 80`. 21 of 173 KPIs have ever been recorded. Four
 * outcomes had a genuinely measured KPI below target.
 *
 * kpiHealth was fixed for exactly this and this second rule on the same page
 * was not, so the Dashboard treated "not measured" correctly in one number and
 * as failure in another.
 */
describe("failingKpis", () => {
  const k = (over: Partial<{ progress: number; measuredAt: string | null }> = {}) =>
    ({ progress: 50, measuredAt: "2026-10-01T00:00:00Z", ...over });

  it("counts a measured KPI below target", () => {
    expect(failingKpis([k({ progress: 40 })])).toHaveLength(1);
  });

  it("does not count a KPI nobody has measured, however low its progress reads", () => {
    // The whole bug: progress 0 means "no value recorded", not "failing".
    expect(failingKpis([k({ progress: 0, measuredAt: null })])).toEqual([]);
  });

  it("does not count a measured KPI that is on target", () => {
    expect(failingKpis([k({ progress: 95 })])).toEqual([]);
  });

  it("defining a KPI does not put an outcome at risk", () => {
    // The direction that mattered: before, adding an unmeasured KPI to a
    // healthy outcome made it At Risk, so the way to look healthy was to
    // define nothing.
    const before = failingKpis([k({ progress: 90 })]);
    const after = failingKpis([k({ progress: 90 }), k({ progress: 0, measuredAt: null })]);
    expect(after.length).toBe(before.length);
  });

  it("the live shape: 39 unmeasured-only outcomes drop out, 4 real ones remain", () => {
    const unmeasuredOnly = Array.from({ length: 39 }, () => [k({ progress: 0, measuredAt: null }), k({ progress: 90 })]);
    const reallyFailing = Array.from({ length: 4 }, () => [k({ progress: 30 })]);
    const atRisk = [...unmeasuredOnly, ...reallyFailing].filter((kpis) => failingKpis(kpis).length > 0);
    expect(atRisk).toHaveLength(4);
  });
});
