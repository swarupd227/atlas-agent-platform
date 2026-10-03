import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The promotion eval gate already blocked production on a low pass rate. What
 * it could not do was tell "scored below the bar" apart from "nobody ever ran
 * it": a suite that has never run reports passRate 0, so it was listed as a
 * failing suite at "0.0%". Measured on this platform, every suite covering the
 * two MGA journeys was in that state, so the gate's own explanation was wrong
 * about all of them.
 */
const suites: any[] = [];
const auditEvents: any[] = [];

vi.mock("../server/storage", () => ({
  storage: {
    getDeployment: vi.fn(async () => ({
      id: "dep1", agentId: "agent1", environment: "pilot", agentName: "Binder Period Close Orchestrator", version: "1",
    })),
    getAgent: vi.fn(async () => ({ id: "agent1", runtimeConfig: {} })),
    getEvalSuites: vi.fn(async () => suites),
    getAuditEvents: vi.fn(async () => auditEvents),
    createAuditEvent: vi.fn(async (e: any) => { auditEvents.push(e); return e; }),
    createDeployment: vi.fn(async (d: any) => ({ ...d, id: "dep2" })),
    updateDeployment: vi.fn(async (_id: string, d: any) => ({ ...d, id: "dep1" })),
    getApprovals: vi.fn(async () => []),
    createApproval: vi.fn(async (a: any) => a),
    getOntologyConcepts: vi.fn(async () => []),
    getTracesByAgent: vi.fn(async () => []),
    getEvalRunsBySuite: vi.fn(async () => []),
    // Reached only once the eval gate PASSES, by the ontology alignment check
    // further down promoteDeploymentAction.
    getBlueprints: vi.fn(async () => []),
    getAgentMcpServers: vi.fn(async () => []),
    getOntologyConcept: vi.fn(async () => null),
  },
}));
vi.mock("../server/deployment-freeze", () => ({ checkDeploymentFreeze: vi.fn(async () => ({ frozen: false })) }));

const { promoteDeploymentAction } = await import("../server/deployment-actions");

const suite = (over: Partial<any> = {}) => ({ id: "s1", agentId: "agent1", name: "Close Pack Assembler - Baseline Suite", passRate: 0, lastRunAt: null, ...over });

beforeEach(() => { suites.length = 0; auditEvents.length = 0; });

describe("promotion eval gate: never-run vs failed", () => {
  it("says a suite was never evaluated rather than calling it a 0% failure", async () => {
    suites.push(suite({ lastRunAt: null, passRate: 0 }));
    const r = await promoteDeploymentAction({ orgId: "org1" } as any, "dep1", {});
    expect(r.status).toBe(400);
    expect(r.body.evalGateBlocked).toBe(true);
    expect(r.body.message).toMatch(/never been evaluated/i);
    expect(r.body.unevaluatedSuites).toHaveLength(1);
    // The decisive assertion: it must NOT be reported as a failing pass rate.
    expect(r.body.failingSuites).toHaveLength(0);
  });

  it("still reports a genuinely low pass rate as a failure", async () => {
    suites.push(suite({ lastRunAt: new Date().toISOString(), passRate: 12 }));
    const r = await promoteDeploymentAction({ orgId: "org1" } as any, "dep1", {});
    expect(r.status).toBe(400);
    expect(r.body.failingSuites).toHaveLength(1);
    expect(r.body.failingSuites[0].passRate).toBe(12);
    expect(r.body.unevaluatedSuites).toHaveLength(0);
    expect(r.body.message).toMatch(/pass rate too low/i);
  });

  it("names both when a run has both problems", async () => {
    suites.push(suite({ id: "a", name: "Ran And Failed", lastRunAt: new Date().toISOString(), passRate: 5 }));
    suites.push(suite({ id: "b", name: "Never Ran", lastRunAt: null, passRate: 0 }));
    const r = await promoteDeploymentAction({ orgId: "org1" } as any, "dep1", {});
    expect(r.body.failingSuites.map((s: any) => s.name)).toEqual(["Ran And Failed"]);
    expect(r.body.unevaluatedSuites.map((s: any) => s.name)).toEqual(["Never Ran"]);
    expect(r.body.message).toMatch(/too low, and some suites have never been evaluated/i);
  });

  it("lets a measured, passing agent through", async () => {
    suites.push(suite({ lastRunAt: new Date().toISOString(), passRate: 95 }));
    const r = await promoteDeploymentAction({ orgId: "org1" } as any, "dep1", {});
    expect(r.status).not.toBe(400);
  });

  it("files an audit event when a bypass covers only never-run suites", async () => {
    // Splitting unevaluated out of failingSuites would otherwise let this
    // bypass happen with no audit trail at all.
    suites.push(suite({ lastRunAt: null, passRate: 0 }));
    await promoteDeploymentAction({ orgId: "org1" } as any, "dep1", { bypassEvalGate: true, approvedBy: "swarupd" });
    const bypass = auditEvents.find((e) => e.action === "eval_gate_bypassed");
    expect(bypass).toBeDefined();
    expect(bypass.actorId).toBe("swarupd");
    expect(JSON.parse(bypass.details).unevaluatedSuites).toHaveLength(1);
  });

  it("records the threshold it actually applied, not a hardcoded 80", async () => {
    // Promoting pilot -> prod, so the applied default is 80. Assert against the
    // threshold the response reports rather than a literal, so this keeps
    // testing the invariant if the defaults are ever retuned.
    suites.push(suite({ lastRunAt: new Date().toISOString(), passRate: 10 }));
    const r = await promoteDeploymentAction({ orgId: "org1" } as any, "dep1", {});
    const blocked = auditEvents.find((e) => e.action === "eval_gate_blocked");
    expect(blocked).toBeDefined();
    expect(JSON.parse(blocked.details).threshold).toBe(r.body.threshold);
  });

  it("applies the agent's configured threshold when it sets one", async () => {
    const { storage } = await import("../server/storage");
    (storage.getAgent as any).mockResolvedValueOnce({
      id: "agent1", runtimeConfig: { promotionGateOverrides: { minEvalPassRate: 40 } },
    });
    suites.push(suite({ lastRunAt: new Date().toISOString(), passRate: 50 }));
    const r = await promoteDeploymentAction({ orgId: "org1" } as any, "dep1", {});
    // 50 clears a 40 threshold, so the gate must not block.
    expect(r.body.evalGateBlocked).toBeUndefined();
  });
});
