/**
 * Skipping a gate, and lifting a freeze, are decisions to let something through. Both need
 * deploy_prod and are recorded against the signed-in person, not a name sent in the request.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => ({
  deployments: new Map<string, any>(),
  agents: new Map<string, any>(),
  suites: [] as any[],
  approvals: [] as any[],
  audit: [] as any[],
  n: 1,
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAuditEvents: vi.fn(async () => db.audit),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
    getAgent: vi.fn(async (id: string, orgId?: string) => { const a = db.agents.get(id); return a && (!orgId || a.organizationId === orgId) ? a : undefined; }),
    getBlueprints: vi.fn(async () => []),
    createDeployment: vi.fn(async (d: any) => { const row = { id: `dep-${db.n++}`, ...d, status: d.status ?? "pending" }; db.deployments.set(row.id, row); return row; }),
    getDeployment: vi.fn(async (id: string, orgId?: string) => { const d = db.deployments.get(id); return d && (!orgId || d.organizationId === orgId) ? { ...d } : undefined; }),
    updateDeployment: vi.fn(async (id: string, data: any) => { const d = { ...db.deployments.get(id), ...data }; db.deployments.set(id, d); return d; }),
    ensureAgentVersion: vi.fn(async () => {}),
    getEvalSuites: vi.fn(async () => db.suites),
    getTracesByAgent: vi.fn(async () => []),
    createApproval: vi.fn(async (a: any) => { const row = { id: `apr-${db.approvals.length + 1}`, ...a }; db.approvals.push(row); return row; }),
    getApprovals: vi.fn(async () => db.approvals),
    getKpisByOutcome: vi.fn(async () => []),
    getPolicies: vi.fn(async () => []),
    getOutcomes: vi.fn(async () => []),
    getInvoices: vi.fn(async () => []),
    getIncident: vi.fn(async () => undefined),
    getTeamBlueprintNodes: vi.fn(async () => []),
    getTeamBlueprintEdges: vi.fn(async () => []),
  },
}));
vi.mock("../server/routes/helpers", () => ({ resolveOntologyTags: () => [], resolvePolicyBundle: vi.fn(async () => ({ appliedPolicies: [] })) }));
vi.mock("../server/routes/aar", () => ({ ensureAarConfig: vi.fn(async () => {}) }));
vi.mock("../server/agent-runtime", () => ({ stopAgentRuntime: vi.fn(async () => {}) }));
vi.mock("../server/ontology-alignment", () => ({ assessToolAlignment: vi.fn(async () => ({ hasBlueprint: true, low: [{ tool: "weak_tool", alignment: 0.2 }] })) }));

import { createDeploymentAction, promoteDeploymentAction } from "../server/deployment-actions";
import { bypassRefusal, parseFreezeRequest } from "../server/deployment-lifecycle";

const engineer = { orgId: "org-a", actor: "erin", canDeployProd: false };
const releaseMgr = { orgId: "org-a", actor: "rae", canDeployProd: true };

beforeEach(() => {
  db.deployments.clear(); db.agents.clear(); db.suites.length = 0; db.approvals.length = 0; db.audit.length = 0; db.n = 1;
  db.agents.set("ag-1", { id: "ag-1", name: "Invoice Agent", organizationId: "org-a", riskTier: "LOW", runtimeConfig: {} });
  db.deployments.set("dep-p", { id: "dep-p", organizationId: "org-a", agentId: "ag-1", agentName: "Invoice Agent", environment: "pilot", status: "active", version: "1.0.0", approvedBy: "Earlier Approver" });
  db.suites.push({ id: "s1", agentId: "ag-1", name: "Weak", lastRunAt: new Date().toISOString(), passRate: 0.2 });
});

describe("skipping the eval gate", () => {
  it("needs deploy_prod, and changes nothing without it", async () => {
    const r = await promoteDeploymentAction(engineer, "dep-p", { bypassEvalGate: true });
    expect(r).toMatchObject({ status: 403, body: { reason: "deploy_prod_required" } });
    expect(db.deployments.get("dep-p").status).toBe("active");
    expect(db.deployments.size).toBe(1);
    expect(db.audit.filter((e) => /bypass/.test(e.action))).toEqual([]);
  });

  it("is recorded against the signed-in person, whatever name the body carries", async () => {
    const r = await promoteDeploymentAction(releaseMgr, "dep-p", { bypassEvalGate: true, bypassOntologyCheck: true, approvedBy: "the CEO" });
    expect(r.status).toBe(201);
    const evalBypass = db.audit.find((e) => e.action === "eval_gate_bypassed");
    const ontologyBypass = db.audit.find((e) => e.action === "ontology_alignment_bypass");
    expect(evalBypass.actorId).toBe("rae");
    expect(ontologyBypass.actorId).toBe("rae");
    expect(JSON.stringify(db.audit)).not.toContain("the CEO");
  });

  it("does not let the body name who approved the promoted deployment", async () => {
    const r = await promoteDeploymentAction(releaseMgr, "dep-p", { bypassEvalGate: true, bypassOntologyCheck: true, approvedBy: "the CEO" });
    expect((r.body as any).approvedBy).toBe("Earlier Approver");
  });

  it("is not asked for when the gate is not being skipped", async () => {
    const r = await promoteDeploymentAction(engineer, "dep-p", {});
    expect(r.status).toBe(400);                      // blocked by the gate itself, not refused for a bypass
    expect((r.body as any).evalGateBlocked).toBe(true);
  });
});

describe("skipping the ontology check", () => {
  it("needs deploy_prod to promote with it", async () => {
    const r = await promoteDeploymentAction(engineer, "dep-p", { bypassOntologyCheck: true });
    expect(r).toMatchObject({ status: 403, body: { reason: "deploy_prod_required" } });
  });

  it("needs deploy_prod to create with it, and creates nothing without it", async () => {
    const r = await createDeploymentAction(engineer, { agentId: "ag-1", environment: "staging", bypassOntologyCheck: true });
    expect(r.status).toBe(403);
    expect(db.deployments.size).toBe(1);
  });

  it("is recorded against the signed-in person when a production create is allowed through", async () => {
    const r = await createDeploymentAction(releaseMgr, { agentId: "ag-1", environment: "prod", bypassOntologyCheck: true });
    expect(r.status).toBe(201);
    expect(db.audit.find((e) => e.action === "ontology_alignment_bypass").actorId).toBe("rae");
  });

  it("a caller that has already checked the role (Astra) is not refused here", () => {
    expect(bypassRefusal({ orgId: "org-a" }, "eval gate")).toBeNull();
    expect(bypassRefusal({ orgId: "org-a", canDeployProd: true }, "eval gate")).toBeNull();
    expect(bypassRefusal({ orgId: "org-a", canDeployProd: false }, "eval gate")).toMatchObject({ status: 403 });
  });
});

describe("a freeze request", () => {
  it("must say freeze or unfreeze: anything else used to lift the freeze", () => {
    for (const action of [undefined, "", "FREEZE", "freeze ", "thaw", "unfreeze2", 1, null, {}]) {
      expect(parseFreezeRequest({ action, scope: "org" } as any), String(action)).toMatchObject({ ok: false, status: 400 });
    }
    expect(parseFreezeRequest({ action: "freeze", scope: "org" })).toMatchObject({ ok: true, action: "freeze" });
    expect(parseFreezeRequest({ action: "unfreeze", scope: "org" })).toMatchObject({ ok: true, action: "unfreeze" });
  });

  it("must be for the organization or an agent", () => {
    for (const scope of [undefined, "", "team", "ORG", "global", 3]) {
      expect(parseFreezeRequest({ action: "freeze", scope } as any), String(scope)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("an agent freeze needs the agent", () => {
    expect(parseFreezeRequest({ action: "freeze", scope: "agent" })).toMatchObject({ ok: false, status: 400 });
    expect(parseFreezeRequest({ action: "freeze", scope: "agent", targetId: "   " })).toMatchObject({ ok: false });
    expect(parseFreezeRequest({ action: "freeze", scope: "agent", targetId: " ag-1 ", reason: "audit" })).toEqual({ ok: true, action: "freeze", scope: "agent", targetId: "ag-1", reason: "audit" });
  });

  it("an organization freeze is recorded as the organization's, whatever target came with it", () => {
    // Recorded under another key, the freeze check would never have found it.
    expect(parseFreezeRequest({ action: "freeze", scope: "org", targetId: "ag-1" })).toMatchObject({ ok: true, scope: "org", targetId: "org" });
  });

  it("keeps a reason to a sane length and ignores one that is not text", () => {
    const long = parseFreezeRequest({ action: "freeze", scope: "org", reason: "x".repeat(900) }) as any;
    expect(long.reason).toHaveLength(500);
    expect((parseFreezeRequest({ action: "freeze", scope: "org", reason: { a: 1 } }) as any).reason).toBe("");
  });
});

describe("the freeze endpoint", () => {
  const src = readFileSync("server/routes/agents.ts", "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf('router.post("/api/deployments/freeze"');
  const handler = src.slice(start, src.indexOf("\n  router.", start + 10));

  it("needs deploy_prod to lift a freeze, before anything is written", () => {
    expect(handler).toContain('action === "unfreeze" && !hasPermission(getRequestRole(req), "deploy_prod")');
    expect(handler.indexOf("deploy_prod")).toBeLessThan(handler.indexOf("createAuditEvent"));
  });

  it("records the signed-in person and the organization, not a hardcoded 'operator'", () => {
    expect(handler).toContain("actorId: getRequestActorLabel(req)");
    expect(handler).toContain("organizationId: getOrgId(req)");
    expect(handler).not.toContain('"operator"');
  });

  it("freezes only an agent that exists in the caller's organization", () => {
    expect(handler).toContain("storage.getAgent(targetId, getOrgId(req))");
    expect(handler.indexOf("storage.getAgent")).toBeLessThan(handler.indexOf("createAuditEvent"));
  });
});
