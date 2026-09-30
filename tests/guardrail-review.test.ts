/**
 * Guardrail flags beyond the run monitor (Phase 3, item 9). A finished team
 * run whose flags are worth a person's attention raises one review in the
 * Approval Queue, when the platform setting asks for it; and a KPI can be
 * measured by guardrail flags per team run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const db = vi.hoisted(() => ({ setting: undefined as string | undefined, approvals: [] as any[], fail: false }));
vi.mock("../server/storage", () => ({
  storage: {
    getPlatformSetting: vi.fn(async (key: string) => (key === "GUARDRAIL_REVIEW" && db.setting !== undefined ? { key, value: db.setting } : undefined)),
    getAgent: vi.fn(async (id: string) => ({ id, name: "Campaign Planning Journey", organizationId: "org-a" })),
    createApproval: vi.fn(async (row: any) => { if (db.fail) throw new Error("db down"); const a = { id: `appr-${db.approvals.length + 1}`, ...row }; db.approvals.push(a); return a; }),
  },
}));

import { raiseGuardrailReview, reviewableFlags } from "../server/guardrail-review";
import { describeApprovalEffect } from "../server/approval-decision";
import { countGuardrailFlags, statisticValue, suggestMeasurement, RUN_STATISTICS, STATISTIC_UNIT } from "../shared/kpi-measurement";

const labels: Record<string, string> = { n1: "Market analysis", n2: "Campaign plan compliance", n3: "QA review" };
const labelOf = (id: string) => labels[id] ?? id;
const policy = (subject: string, ok: boolean, severity = "low", evidence = "as judged") => ({ kind: "policy", subject, ok, severity, evidence });
const waves = [
  { waveNumber: 1, nodes: [{ nodeId: "n1", judgments: [policy("Marketing Claims", true), policy("Budget Guardrails", false, "medium")] }] },
  { waveNumber: 2, nodes: [{ nodeId: "n2", judgments: [policy("Marketing Claims", false, "high", "Zero of 13 claims have evidence."), policy("Human Review", false, "high"), policy("Privacy", true)] }] },
  { waveNumber: 3, nodes: [{ nodeId: "n3", judgments: [{ kind: "facts", subject: "verdict vs facts", ok: false, evidence: "QA passed with ten overflows still present." }] }] },
];
const run = (waveResults: unknown = waves) => raiseGuardrailReview({ teamAgentId: "team-1", dagRunId: "run-1", waveResults, labelOf });

beforeEach(() => { db.setting = undefined; db.approvals.length = 0; db.fail = false; });

describe("which flags are worth a review", () => {
  it("a high-severity policy flag and a facts mismatch are; honoured and lower-severity ones are not", () => {
    expect(reviewableFlags(waves, labelOf)).toEqual([
      { step: "Campaign plan compliance", kind: "policy", subject: "Marketing Claims", severity: "high", evidence: "Zero of 13 claims have evidence." },
      { step: "Campaign plan compliance", kind: "policy", subject: "Human Review", severity: "high", evidence: "as judged" },
      { step: "QA review", kind: "facts", subject: "verdict vs facts", evidence: "QA passed with ten overflows still present." },
    ]);
  });
  it("a wave that was revised is judged as it finally stood", () => {
    const revised = [...waves, { waveNumber: 2, nodes: [{ nodeId: "n2", judgments: [policy("Marketing Claims", true), policy("Human Review", true), policy("Privacy", true)] }] }];
    expect(reviewableFlags(revised, labelOf).map((f) => f.step)).toEqual(["QA review"]);
  });
});

describe("raiseGuardrailReview", () => {
  it("is off by default", async () => {
    expect(await run()).toBeNull();
    db.setting = "off";
    expect(await run()).toBeNull();
    expect(db.approvals).toHaveLength(0);
  });

  it("raises one review for the run, with the flags as evidence", async () => {
    db.setting = "on";
    expect(await run()).toBe("appr-1");
    expect(db.approvals).toHaveLength(1);
    expect(db.approvals[0]).toMatchObject({
      organizationId: "org-a", type: "guardrail_review", objectType: "dag_run", objectId: "run-1", status: "pending",
      objectName: "Campaign Planning Journey: 3 guardrail flags", requestedBy: "team-1", requesterType: "agent", agentId: "team-1", riskScore: 0.75,
    });
    expect(db.approvals[0].evidenceJson.flags).toHaveLength(3);
    expect(db.approvals[0].description).toContain("2 high-severity policy flags and 1 verdict that disagree with the run's facts");
  });

  it("raises nothing when no flag warrants it, and never throws", async () => {
    db.setting = "on";
    expect(await run([waves[0]])).toBeNull();
    expect(await run(null)).toBeNull();
    db.fail = true;
    expect(await run()).toBeNull();
  });

  it("says what deciding it does: nothing to the run", () => {
    const a = { type: "guardrail_review", objectType: "dag_run", objectName: "Campaign Planning Journey: 3 guardrail flags" };
    expect(describeApprovalEffect(a, "approve")).toBe("The flags are acknowledged. The run has already finished; nothing about it changes.");
    expect(describeApprovalEffect(a, "reject")).toContain("dismissed");
  });
});

describe("guardrail flags as a KPI statistic", () => {
  it("counts a run's flags as it finally stood", () => {
    expect(countGuardrailFlags(waves)).toBe(4);
    expect(countGuardrailFlags([...waves, { nodes: [{ nodeId: "n2", judgments: [policy("Marketing Claims", true)] }] }])).toBe(2);
    expect(countGuardrailFlags(null)).toBe(0);
  });
  it("is flags per team run over the window, and unmeasured without a team run", () => {
    const window = { runs: 9, failed: 0, totalLatencyMs: 0, totalCostUsd: 0, events: 0 };
    const source = { kind: "agent_runs" as const, statistic: "guardrail_flags" as const, windowDays: 30 };
    expect(statisticValue(source, { ...window, teamRuns: 4, guardrailFlags: 6 }, "count")).toBe(1.5);
    expect(statisticValue(source, { ...window, teamRuns: 4, guardrailFlags: 0 }, "count")).toBe(0);
    expect(statisticValue(source, window, "count")).toBeNull();
    expect(RUN_STATISTICS).toContain("guardrail_flags");
    expect(STATISTIC_UNIT.guardrail_flags).toBe("count");
  });
  it("is suggested for a KPI named after policy breaches, as a guess to accept or not", () => {
    expect(suggestMeasurement({ name: "Policy violations per campaign" })?.source.statistic).toBe("guardrail_flags");
    expect(suggestMeasurement({ name: "Guardrail flags" })?.source.statistic).toBe("guardrail_flags");
    expect(suggestMeasurement({ name: "Exception rate" })?.source.statistic).toBe("failure_rate");
  });
});

describe("the seams that carry it", () => {
  it("the engine raises the review after a finished run without awaiting it, and the recompute reads team runs only when asked", () => {
    expect(read("server", "dag-execution-engine.ts")).toContain("void raiseGuardrailReview({ teamAgentId, dagRunId: dagRun.id, waveResults: result.waveResults, labelOf: (id) => wavePlan.nodeConfig[id]?.label || id });");
    const helpers = read("server", "routes", "helpers.ts");
    expect(helpers).toContain('if (declared.some((d) => d.source.statistic === "guardrail_flags")) {');
    expect(helpers).toContain("teamRuns.push({ startedAt: new Date(r.startedAt), flags: countGuardrailFlags(r.waveResults) });");
  });
  it("both approval pages name the type, and the setting is seeded off", () => {
    expect(read("client", "src", "pages", "approvals.tsx")).toContain('guardrail_review:      { label: "Guardrail Review",');
    expect(read("client", "src", "pages", "approvals-home.tsx")).toContain('case "guardrail_review": return "Acknowledge";');
    const seed = read("server", "seed.ts");
    expect(seed).toContain('key: "GUARDRAIL_REVIEW",\n        value: "off",');
  });
});
