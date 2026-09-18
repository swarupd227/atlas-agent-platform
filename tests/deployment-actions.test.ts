/**
 * server/deployment-actions.ts: the deployment create / promote / routing /
 * rollback logic moved out of the routes. Gates behave as before, and the
 * approvals each hop creates now carry the organization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  deployments: new Map<string, any>(),
  agents: new Map<string, any>(),
  approvals: [] as any[],
  audit: [] as any[],
  stopped: [] as string[],
  n: 1,
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAuditEvents: vi.fn(async () => db.audit),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
    getAgent: vi.fn(async (id: string, orgId?: string) => { const a = db.agents.get(id); return a && (!orgId || a.organizationId === orgId) ? a : undefined; }),
    getBlueprints: vi.fn(async () => []),
    createDeployment: vi.fn(async (d: any) => { const row = { id: `dep-${db.n++}`, status: "pending", ...d }; db.deployments.set(row.id, row); return row; }),
    getDeployment: vi.fn(async (id: string, orgId?: string) => { const d = db.deployments.get(id); return d && (!orgId || d.organizationId === orgId) ? { ...d } : undefined; }),
    updateDeployment: vi.fn(async (id: string, data: any) => { const d = { ...db.deployments.get(id), ...data }; db.deployments.set(id, d); return d; }),
    ensureAgentVersion: vi.fn(async () => {}),
    getEvalSuites: vi.fn(async () => []),
    getTracesByAgent: vi.fn(async () => []),
    createApproval: vi.fn(async (a: any) => { db.approvals.push(a); return { id: `apr-${db.approvals.length}`, ...a }; }),
    getKpisByOutcome: vi.fn(async () => []),
    getPolicies: vi.fn(async () => []),
    getApprovals: vi.fn(async () => []),
    getOutcomes: vi.fn(async () => []),
    getInvoices: vi.fn(async () => []),
    getIncident: vi.fn(async () => undefined),
  },
}));
vi.mock("../server/routes/helpers", () => ({ resolveOntologyTags: () => [], resolvePolicyBundle: vi.fn(async () => ({ appliedPolicies: [] })) }));
vi.mock("../server/routes/aar", () => ({ ensureAarConfig: vi.fn(async () => {}) }));
vi.mock("../server/agent-runtime", () => ({ stopAgentRuntime: vi.fn(async (id: string) => { db.stopped.push(id); }) }));

import { changeRoutingAction, createDeploymentAction, promoteDeploymentAction, rollbackDeploymentAction } from "../server/deployment-actions";

const ctx = { orgId: "org-a" };

beforeEach(() => {
  db.deployments.clear(); db.agents.clear();
  db.approvals.length = 0; db.audit.length = 0; db.stopped.length = 0; db.n = 1;
  db.agents.set("ag-1", { id: "ag-1", name: "Invoice Agent", organizationId: "org-a", riskTier: "MEDIUM", autonomyMode: "assisted", runtimeConfig: {} });
});

describe("createDeploymentAction", () => {
  it("refuses while deployments are frozen", async () => {
    db.audit.push({ action: "deployment_freeze", details: JSON.stringify({ scope: "org", reason: "Quarter close" }) });
    const r = await createDeploymentAction(ctx, { agentId: "ag-1", agentName: "Invoice Agent", environment: "pilot" });
    expect(r).toMatchObject({ status: 423, body: { frozen: true, message: expect.stringContaining("Quarter close") } });
  });

  it("creates the deployment in the organization and a deployment review carrying the organization", async () => {
    const r = await createDeploymentAction(ctx, { agentId: "ag-1", agentName: "Invoice Agent", environment: "pilot", version: "1.0.0" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ organizationId: "org-a", environment: "pilot", status: "pending", approval: { type: "deployment_review", organizationId: "org-a" } });
  });
});

describe("promoteDeploymentAction", () => {
  it("staging to pilot: the source is marked promoted, a pending pilot deployment and its review are created in the organization", async () => {
    db.deployments.set("dep-s", { id: "dep-s", organizationId: "org-a", agentId: "ag-1", agentName: "Invoice Agent", environment: "staging", status: "active", version: "1.0.0" });
    const r = await promoteDeploymentAction(ctx, "dep-s", {});
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ environment: "pilot", status: "pending", promotedFrom: "dep-s", organizationId: "org-a" });
    expect(db.deployments.get("dep-s").status).toBe("promoted");
    expect(db.approvals).toEqual([expect.objectContaining({ type: "deployment_review", organizationId: "org-a", objectId: r.body.id })]);
  });

  it("can't promote past production, or another organization's deployment", async () => {
    db.deployments.set("dep-p", { id: "dep-p", organizationId: "org-a", agentId: "ag-1", environment: "prod", status: "active" });
    expect((await promoteDeploymentAction(ctx, "dep-p", {})).status).toBe(400);
    db.deployments.set("dep-b", { id: "dep-b", organizationId: "org-b", agentId: "ag-1", environment: "staging" });
    expect((await promoteDeploymentAction(ctx, "dep-b", {})).status).toBe(404);
  });
});

describe("routing and rollback", () => {
  it("starts a canary at the configured percentage, and rolls back stopping the runtime", async () => {
    db.deployments.set("dep-c", { id: "dep-c", organizationId: "org-a", agentId: "ag-1", agentName: "Invoice Agent", environment: "pilot", status: "active", canaryConfig: { startPercent: 15 } });
    const c = await changeRoutingAction(ctx, "dep-c", { action: "canary_start" });
    expect(c).toMatchObject({ status: 200, body: { status: "canary", canaryPercent: 15 } });
    const r = await rollbackDeploymentAction(ctx, "dep-c", { reason: "Error rate up" });
    expect(r).toMatchObject({ status: 200, body: { status: "rolled_back" } });
    expect(db.stopped).toEqual(["dep-c"]);
    expect(db.audit.find((e) => e.action === "deployment_rollback_incident").details).toContain("Error rate up");
  });
});
