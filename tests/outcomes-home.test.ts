/**
 * The outcomes list, rebuilt. It leads with where each outcome stands,
 * because most never start: live, 55 of 67 are waiting for a team or a
 * review. The old page led with attainment percentages, "value generated",
 * an always-green compliance light and benchmarks attributed to research
 * nobody has, which made every outcome look under way.
 *
 * A KPI's value comes from matching its name against run statistics, so each
 * one says that, or says it isn't measured.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { STAGE_LABEL, kpiLine, nextStep, outcomeCounts, outcomeOrder, stageOf } from "../client/src/pages/outcomes-home";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const page = read("client", "src", "pages", "outcomes-home.tsx");

describe("where an outcome stands", () => {
  it("reads the status as a stage a person understands", () => {
    expect(stageOf("active")).toBe("live");
    expect(stageOf("agents_assigned")).toBe("live");
    expect(stageOf("pending_review")).toBe("waiting_for_review");
    expect(stageOf("awaiting_agent_plan")).toBe("waiting_for_a_team");
    expect(stageOf("paused")).toBe("paused");
    expect(stageOf(null)).toBe("waiting_for_a_team");
    expect(STAGE_LABEL.waiting_for_a_team).toBe("Waiting for a team");
  });

  it("counts each stage, and how many have a measured KPI", () => {
    const outcomes = [
      { id: "o1", status: "active" },
      { id: "o2", status: "awaiting_agent_plan" },
      { id: "o3", status: "pending_review" },
      { id: "o4", status: "awaiting_agent_plan" },
    ] as any[];
    const kpis = [
      { outcomeId: "o1", currentValue: 12 },
      { outcomeId: "o2", currentValue: null },
    ] as any[];
    expect(outcomeCounts(outcomes, kpis)).toEqual({ live: 1, waitingForTeam: 2, waitingForReview: 1, measured: 1 });
  });

  it("puts live first, then what's waiting on a person", () => {
    const o = (id: string, status: string, createdAt: string) => ({ id, status, createdAt }) as any;
    const list = [o("plan", "awaiting_agent_plan", "2026-09-01"), o("live", "active", "2026-08-01"), o("review", "pending_review", "2026-09-10")];
    expect(list.sort(outcomeOrder).map((x) => x.id)).toEqual(["live", "review", "plan"]);
  });
});

describe("what a KPI says about itself", () => {
  it("says when it isn't measured", () => {
    expect(kpiLine({ name: "Effort Reduction", unit: "%", target: 30, currentValue: null, valueSource: null } as any)).toBe("target 30 % · not measured yet");
  });

  it("says its value came from runs, which is a proxy", () => {
    expect(kpiLine({ name: "Automation Rate", unit: "%", target: 80, currentValue: 100, valueSource: "agent_runs" } as any))
      .toBe("100 % against target 80 % (from agent runs, a proxy)");
  });

  it("says when no target was set, rather than treating it as met", () => {
    expect(kpiLine({ name: "Volume", unit: "count", target: 0, currentValue: 5, valueSource: "agent_runs" } as any)).toContain("no target set");
  });
});

describe("what to do next", () => {
  it("names the thing standing in the way", () => {
    expect(nextStep("waiting_for_review", 0)).toContain("approve its review");
    expect(nextStep("waiting_for_a_team", 0)).toContain("No team yet");
    expect(nextStep("paused", 3)).toContain("paused");
    expect(nextStep("live", 0)).toContain("no agent is bound");
    expect(nextStep("live", 2)).toBe("");
  });
});

describe("the page", () => {
  it("carries nothing the old one invented", () => {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/getIndustryBenchmark|Policy Compliance|deliveredValue|attainment|Value generated/i);
  });

  it("says plainly when nothing measures an outcome", () => {
    expect(page).toContain("No KPI is attached, so nothing measures whether it works.");
  });

  it("is /outcomes, with the old page as classic and the detail page untouched", () => {
    const app = read("client", "src", "App.tsx");
    expect(app).toContain('<Route path="/outcomes" component={OutcomesHome} />');
    expect(app).toContain('<Route path="/outcomes/classic" component={Outcomes} />');
    expect(app).toContain('<Route path="/outcomes/:id" component={OutcomeDetail} />');
    expect(app.indexOf('path="/outcomes/classic"')).toBeLessThan(app.indexOf('path="/outcomes/:id"'));
  });

  it("selects with state, the way the agents registry had to", () => {
    expect(page).toContain("const [selectedId, setSelectedId] = useState<string | null>(");
    expect(page).toContain("onClick={() => select(o.id)}");
  });
});
