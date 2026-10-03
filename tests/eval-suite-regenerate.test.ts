/**
 * Regenerating a generated eval suite.
 *
 * Fixing the KPI generator could not refresh what it had already produced:
 * all five call sites are guarded by "no suite yet" or "outcome newly bound",
 * so a corrected generator left the old cases standing and the promotion gate
 * kept scoring them. On the live app that meant 146 cases carrying pairs no
 * agent could satisfy, with the code fix deployed and inert.
 *
 * The cases below pin the parts that are easy to get wrong rather than the
 * happy path alone: that a hand-authored suite is refused instead of having
 * its work destroyed, that a generator producing nothing leaves the existing
 * cases ALONE, and that a stored pass rate measured against replaced cases is
 * cleared rather than left to read as a result.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";

const state: any = {
  suite: null,
  agent: { id: "a1", name: "E&S Orchestrator", outcomeId: "o-agent", ontologyTags: [] },
  outcome: { id: "o1", name: "MGA Lifecycle" },
  kpis: [],
  cases: [],
  suiteUpdates: [],
  createdSuites: [],
  createdCases: [],
  deletedCaseIds: [],
  audits: [],
};

vi.mock("../server/storage", () => ({
  storage: {
    getEvalSuite: vi.fn(async (id: string) => (state.suite && state.suite.id === id ? state.suite : null)),
    getAgent: vi.fn(async () => state.agent),
    getOutcome: vi.fn(async () => state.outcome),
    getKpisByOutcome: vi.fn(async () => state.kpis),
    getOntologyConcept: vi.fn(async () => null),
    getEvalTestCases: vi.fn(async () => state.cases),
    deleteEvalTestCase: vi.fn(async (id: string) => { state.deletedCaseIds.push(id); return true; }),
    createEvalTestCase: vi.fn(async (c: any) => { state.createdCases.push(c); return { ...c, id: `n${state.createdCases.length}` }; }),
    createEvalSuite: vi.fn(async (s: any) => { const n = { ...s, id: "brand-new" }; state.createdSuites.push(n); return n; }),
    updateEvalSuite: vi.fn(async (id: string, patch: any) => { state.suiteUpdates.push({ id, patch }); return { ...state.suite, ...patch }; }),
    createAuditEvent: vi.fn(async (e: any) => { state.audits.push(e); return e; }),
    getEvalRuns: vi.fn(async () => []),
  },
}));
vi.mock("../server/auth", () => ({ getOrgId: () => "org1", getDefaultOrgId: () => "org1" }));
vi.mock("../server/permissions", () => ({
  checkPermission: () => (_req: any, _res: any, next: any) => next(),
  getRequestRole: () => "admin",
}));
vi.mock("../server/claude", () => ({
  callClaude: vi.fn(async () => "{}"),
  callClaudeWithUsage: vi.fn(async () => ({ text: "{}", model: "m", latencyMs: 1, inputTokens: 1, costUsd: 0 })),
  stripJsonFences: (s: string) => s,
  getAnthropicClient: vi.fn(() => ({})),
}));
vi.mock("../server/decision-provider", () => ({ decideMany: vi.fn(async () => ({})), knownIncumbent: vi.fn() }));

const { default: createEvaluationsRouter } = await import("../server/routes/evaluations");

let server: Server;
let base = "";
const post = async (path: string, body: any = {}) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const existingCases = () => [
  { id: "old1", name: "Below SLA Boundary (0percent)", status: "active" },
  { id: "old2", name: "At SLA Threshold (0percent)", status: "active" },
];

beforeEach(async () => {
  state.suite = { id: "s1", name: "E&S - KPI-Aligned Suite", type: "kpi_aligned", agentId: "a1", passRate: 0, lastRunAt: new Date(), ontologyTags: { outcomeId: "o1" } };
  state.kpis = [{ id: "k1", name: "Treaty breach detection rate", slaThreshold: 95, target: 99, unit: "percent" }];
  state.cases = existingCases();
  state.suiteUpdates = []; state.createdSuites = []; state.createdCases = []; state.deletedCaseIds = []; state.audits = [];
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use(createEvaluationsRouter({}));
    await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res(); }); });
  }
});

describe("POST /api/evals/:id/regenerate", () => {
  it("replaces the old cases with freshly generated ones", async () => {
    const r = await post("/api/evals/s1/regenerate");
    expect(r.status).toBe(200);
    expect(r.body.casesBefore).toBe(2);
    expect(r.body.casesRemoved).toBe(2);
    expect(r.body.casesAfter).toBeGreaterThan(0);
    expect(state.deletedCaseIds.sort()).toEqual(["old1", "old2"]);
    expect(state.createdCases.length).toBe(r.body.casesAfter);
  });

  it("regenerates IN PLACE rather than creating a second suite", async () => {
    // A new suite alongside the old one would leave both feeding the gate,
    // and there is no delete route for eval suites.
    await post("/api/evals/s1/regenerate");
    expect(state.createdSuites).toHaveLength(0);
    expect(state.suiteUpdates[0].id).toBe("s1");
  });

  it("clears the stored passRate and lastRunAt, which measured the replaced cases", async () => {
    const r = await post("/api/evals/s1/regenerate");
    expect(state.suiteUpdates[0].patch.passRate).toBeNull();
    expect(state.suiteUpdates[0].patch.lastRunAt).toBeNull();
    expect(r.body.note).toMatch(/never evaluated/i);
  });

  it("deletes the old cases BEFORE writing the new ones", async () => {
    // Otherwise the suite briefly holds both generations and could be scored
    // against the contradictions it was regenerated to remove.
    const order: string[] = [];
    const { storage } = await import("../server/storage");
    (storage.deleteEvalTestCase as any).mockImplementation(async (id: string) => { order.push(`del:${id}`); return true; });
    (storage.createEvalTestCase as any).mockImplementation(async (c: any) => { order.push("add"); return { ...c, id: "x" }; });
    await post("/api/evals/s1/regenerate");
    expect(order.filter(o => o.startsWith("del")).length).toBe(2);
    expect(order.indexOf("add")).toBeGreaterThan(order.lastIndexOf("del:old2"));
  });

  it("files a distinct regenerated audit event, not a second 'generated'", async () => {
    await post("/api/evals/s1/regenerate");
    const a = state.audits.find((x: any) => String(x.action).includes("kpi_suite"));
    expect(a.action).toBe("eval.kpi_suite_regenerated");
    const details = JSON.parse(a.details);
    expect(details.regenerated).toBe(true);
    expect(details.removedCases).toBe(2);
  });

  it("refuses a hand-authored suite rather than destroying its cases", async () => {
    state.suite.type = "manual";
    const r = await post("/api/evals/s1/regenerate");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/would be lost|kpi_aligned/i);
    expect(state.deletedCaseIds).toHaveLength(0);
  });

  it("leaves the existing cases untouched when the generator produces nothing", async () => {
    // An outcome with no KPIs returns null. Deleting first and discovering
    // that afterwards would empty a suite and replace it with nothing.
    state.kpis = [];
    const r = await post("/api/evals/s1/regenerate");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/left untouched/i);
    expect(state.deletedCaseIds).toHaveLength(0);
    expect(state.createdCases).toHaveLength(0);
    expect(state.suiteUpdates).toHaveLength(0);
  });

  it("prefers the outcome the suite was built from over the agent's current one", async () => {
    state.agent.outcomeId = "o-agent";
    state.suite.ontologyTags = { outcomeId: "o-suite" };
    const r = await post("/api/evals/s1/regenerate");
    expect(r.body.outcomeId).toBe("o-suite");
  });

  it("falls back to the agent's outcome when the suite names none", async () => {
    state.suite.ontologyTags = {};
    const r = await post("/api/evals/s1/regenerate");
    expect(r.body.outcomeId).toBe("o-agent");
  });

  it("refuses when neither suite nor agent names an outcome", async () => {
    state.suite.ontologyTags = {};
    state.agent.outcomeId = null;
    const r = await post("/api/evals/s1/regenerate");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/outcome/i);
    expect(state.deletedCaseIds).toHaveLength(0);
  });

  it("404s on a suite that does not exist, and 400s on one with no agent", async () => {
    expect((await post("/api/evals/nope/regenerate")).status).toBe(404);
    state.suite.agentId = null;
    expect((await post("/api/evals/s1/regenerate")).status).toBe(400);
  });

  it("reports skipped boundaries so absent coverage is visible, not inferred", async () => {
    // threshold 0 has nothing below it; the case is absent by design.
    state.kpis = [{ id: "k1", name: "Treaty breach detection rate", slaThreshold: 0, target: 100, unit: "percent" }];
    const r = await post("/api/evals/s1/regenerate");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.skippedBoundaries)).toBe(true);
    expect(r.body.skippedBoundaries.some((s: any) => s.scenario === "below_threshold")).toBe(true);
  });
});
