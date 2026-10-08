/**
 * The deployment lifecycle (server/deployment-lifecycle.ts), through the shared actions that the
 * routes and Astra's tools call: a deployment is created pending, goes live only through the
 * checks, and a freeze never holds back the way out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

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
    createDeployment: vi.fn(async (d: any) => { const row = { id: `dep-${db.n++}`, ...d, status: d.status ?? "pending" }; db.deployments.set(row.id, row); return row; }),
    getDeployment: vi.fn(async (id: string, orgId?: string) => { const d = db.deployments.get(id); return d && (!orgId || d.organizationId === orgId) ? { ...d } : undefined; }),
    updateDeployment: vi.fn(async (id: string, data: any) => { const d = { ...db.deployments.get(id), ...data }; db.deployments.set(id, d); return d; }),
    ensureAgentVersion: vi.fn(async () => {}),
    getEvalSuites: vi.fn(async () => []),
    getTracesByAgent: vi.fn(async () => []),
    createApproval: vi.fn(async (a: any) => { const row = { id: `apr-${db.approvals.length + 1}`, createdAt: new Date(2026, 9, 1, 12, db.approvals.length), ...a }; db.approvals.push(row); return row; }),
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
vi.mock("../server/agent-runtime", () => ({ stopAgentRuntime: vi.fn(async (id: string) => { db.stopped.push(id); }) }));
// The production ontology gate has its own tests; here the agent has no blueprint to assess.
vi.mock("../server/ontology-alignment", () => ({ assessToolAlignment: vi.fn(async () => ({ hasBlueprint: false, low: [] })) }));

import { changeRoutingAction, createDeploymentAction, rollbackDeploymentAction } from "../server/deployment-actions";
import { checkMayGoLive, isProdEnv, sanitizeCreateBody } from "../server/deployment-lifecycle";

const ctx = { orgId: "org-a", actor: "dana", canDeployProd: true };
const noProd = { ...ctx, canDeployProd: false };

const dep = (over: Record<string, unknown>) => {
  const row = { id: "dep-x", organizationId: "org-a", agentId: "ag-1", agentName: "Invoice Agent", environment: "staging", status: "pending", version: "1.0.0", rolloutStrategy: "canary", ...over };
  db.deployments.set(row.id as string, row);
  return row;
};
const approval = (over: Record<string, unknown>) => {
  const row = { id: `apr-${db.approvals.length + 1}`, objectType: "deployment", objectId: "dep-x", type: "launch_readiness", status: "pending", createdAt: new Date(2026, 9, 1, 12, db.approvals.length), ...over };
  db.approvals.push(row);
  return row;
};

beforeEach(() => {
  db.deployments.clear(); db.agents.clear();
  db.approvals.length = 0; db.audit.length = 0; db.stopped.length = 0; db.n = 1;
  db.agents.set("ag-1", { id: "ag-1", name: "Invoice Agent", organizationId: "org-a", riskTier: "LOW", runtimeConfig: {} });
});

describe("what a client may set when it creates a deployment", () => {
  it("is created pending whatever status was asked for the default", async () => {
    const r = await createDeploymentAction(ctx, { agentId: "ag-1", agentName: "Invoice Agent", environment: "staging", version: "1.0.0" });
    expect(r).toMatchObject({ status: 201, body: { status: "pending" } });
    const r2 = await createDeploymentAction(ctx, { agentId: "ag-1", environment: "staging", status: "pending" });
    expect(r2.status).toBe(201);
  });

  for (const status of ["deployed", "active", "canary", "shadow", "promoted", "inactive"]) {
    it(`refuses a deployment created as "${status}", and writes nothing`, async () => {
      const r = await createDeploymentAction(ctx, { agentId: "ag-1", environment: "staging", status });
      expect(r.status).toBe(400);
      expect((r.body as any).message).toContain("created pending");
      expect(db.deployments.size).toBe(0);
      expect(db.approvals).toEqual([]);
    });
  }

  it("takes the fields the server owns from the server, not the body, and says which it dropped", async () => {
    const r = await createDeploymentAction(ctx, {
      agentId: "ag-1", environment: "staging", version: "1.0.0",
      approvedBy: "ceo", signatureHash: "sig", promotedFrom: "dep-9", deployedAt: "2026-01-01", completedAt: "2026-01-02",
      pipelineComplete: true, incidentId: "inc-1", patchId: "p-1", canaryPercent: 100, shadowEnabled: true, organizationId: "org-b",
    });
    expect(r.status).toBe(201);
    const row = db.deployments.get((r.body as any).id);
    for (const k of ["approvedBy", "signatureHash", "promotedFrom", "deployedAt", "completedAt", "pipelineComplete", "incidentId", "patchId", "canaryPercent", "shadowEnabled"]) {
      expect(row[k], k).toBeUndefined();
    }
    expect(row.organizationId).toBe("org-a");
    expect((r.body as any).ignoredFields).toEqual(expect.arrayContaining(["approvedBy", "signatureHash", "promotedFrom", "pipelineComplete"]));
  });

  it("records who created it", async () => {
    const r = await createDeploymentAction(ctx, { agentId: "ag-1", environment: "staging" });
    const evt = db.audit.find((e) => e.action === "deployment_created");
    expect(evt).toMatchObject({ actorId: "dana", objectId: (r.body as any).id, organizationId: "org-a" });
  });
});

describe("production is production under either spelling", () => {
  it("knows both", () => {
    for (const e of ["prod", "production", "PROD", " Production "]) expect(isProdEnv(e), e).toBe(true);
    for (const e of ["staging", "pilot", "preprod", "product", "", null, undefined]) expect(isProdEnv(e as any), String(e)).toBe(false);
  });

  for (const env of ["prod", "production"]) {
    it(`"${env}" files a launch readiness approval and starts pending`, async () => {
      const r = await createDeploymentAction(ctx, { agentId: "ag-1", environment: env, version: "1.0.0" });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ status: "pending", approval: { type: "launch_readiness" } });
    });

    it(`"${env}" needs deploy_prod to create`, async () => {
      const r = await createDeploymentAction(noProd, { agentId: "ag-1", environment: env });
      expect(r).toMatchObject({ status: 403 });
      expect(db.deployments.size).toBe(0);
    });
  }

  it("staging does not", async () => {
    const r = await createDeploymentAction(noProd, { agentId: "ag-1", environment: "staging" });
    expect(r).toMatchObject({ status: 201, body: { approval: null } });
  });

  it("a caller that has already checked the role (Astra) leaves it unset", async () => {
    const r = await createDeploymentAction({ orgId: "org-a" }, { agentId: "ag-1", environment: "prod" });
    expect(r.status).toBe(201);
  });
});

describe("taking a deployment live through routing", () => {
  const LIVE_ACTIONS = ["shadow_on", "canary_start", "canary_increase", "full_rollout"];

  for (const action of LIVE_ACTIONS) {
    it(`${action} is held while the approval is waiting`, async () => {
      dep({ environment: "pilot" });
      approval({ type: "deployment_review" });
      const r = await changeRoutingAction(ctx, "dep-x", { action });
      expect(r).toMatchObject({ status: 409, body: { blocked: true, reason: "awaiting_approval", approvalId: expect.any(String) } });
      expect(db.deployments.get("dep-x").status).toBe("pending");
    });
  }

  it("a manual traffic share is held the same way", async () => {
    dep({ environment: "pilot" });
    approval({ type: "deployment_review" });
    expect((await changeRoutingAction(ctx, "dep-x", { canaryPercent: 50 })).status).toBe(409);
    expect((await changeRoutingAction(ctx, "dep-x", { shadowEnabled: true })).status).toBe(409);
  });

  it("is refused after the approval was declined", async () => {
    dep({ environment: "pilot" });
    approval({ type: "deployment_review", status: "rejected" });
    expect(await changeRoutingAction(ctx, "dep-x", { action: "canary_start" })).toMatchObject({ status: 409, body: { reason: "approval_not_granted" } });
  });

  it("goes ahead once the newest approval is granted, even if an older one was declined", async () => {
    dep({ environment: "pilot" });
    approval({ type: "deployment_review", status: "rejected" });
    approval({ type: "deployment_review", status: "approved" });
    expect(await changeRoutingAction(ctx, "dep-x", { action: "canary_start" })).toMatchObject({ status: 200, body: { status: "canary" } });
  });

  it("a staging deployment that never needed an approval can be started", async () => {
    dep({});
    expect(await changeRoutingAction(ctx, "dep-x", { action: "canary_start" })).toMatchObject({ status: 200, body: { status: "canary" } });
  });

  it("only an approval filed against THIS deployment, in this organization's list, counts", async () => {
    dep({ environment: "pilot" });
    approval({ type: "deployment_review", objectId: "dep-other" });
    expect((await changeRoutingAction(ctx, "dep-x", { action: "canary_start" })).status).toBe(200);
  });

  it("a finished deployment cannot be started again", async () => {
    for (const status of ["rolled_back", "promoted", "superseded", "retired"]) {
      dep({ status });
      expect(await changeRoutingAction(ctx, "dep-x", { action: "canary_start" }), status).toMatchObject({ status: 409, body: { reason: "deployment_finished" } });
    }
  });

  it("records who changed the status", async () => {
    dep({});
    await changeRoutingAction(ctx, "dep-x", { action: "canary_start" });
    expect(db.audit.find((e) => e.action === "deployment_status_changed")).toMatchObject({ actorId: "dana", objectId: "dep-x" });
    expect(JSON.parse(db.audit.find((e) => e.action === "deployment_status_changed").details)).toMatchObject({ from: "pending", to: "canary", via: "routing:canary_start" });
  });
});

describe("production going live", () => {
  it("needs deploy_prod, even for a deployment already approved", async () => {
    dep({ environment: "prod" });
    approval({ status: "approved" });
    expect(await changeRoutingAction(noProd, "dep-x", { action: "full_rollout" })).toMatchObject({ status: 403, body: { reason: "deploy_prod_required" } });
    expect(await changeRoutingAction(ctx, "dep-x", { action: "full_rollout" })).toMatchObject({ status: 200, body: { status: "active" } });
  });

  it("files a launch readiness approval when there is none, and still says no", async () => {
    dep({ environment: "production" });
    const r = await changeRoutingAction(ctx, "dep-x", { action: "canary_start" });
    expect(r).toMatchObject({ status: 409, body: { reason: "awaiting_approval", approvalFiled: true } });
    expect(db.approvals).toEqual([expect.objectContaining({ type: "launch_readiness", objectType: "deployment", objectId: "dep-x", status: "pending", requestedBy: "dana", organizationId: "org-a" })]);
    expect(db.deployments.get("dep-x").status).toBe("pending");
    expect(db.audit.some((e) => e.action === "deployment_approval_requested")).toBe(true);
  });

  it("does not file a second one when asked again", async () => {
    dep({ environment: "prod" });
    await changeRoutingAction(ctx, "dep-x", { action: "canary_start" });
    const again = await changeRoutingAction(ctx, "dep-x", { action: "canary_start" });
    expect(again).toMatchObject({ status: 409, body: { reason: "awaiting_approval" } });
    expect(again.body.approvalFiled).toBeUndefined();
    expect(db.approvals).toHaveLength(1);
  });

  it("goes live after the approval is granted", async () => {
    dep({ environment: "prod" });
    await changeRoutingAction(ctx, "dep-x", { action: "canary_start" });
    db.approvals[0].status = "approved";
    expect(await changeRoutingAction(ctx, "dep-x", { action: "canary_start" })).toMatchObject({ status: 200, body: { status: "canary" } });
  });

  it("a stopped production deployment that was live before can be restarted without a new approval", async () => {
    dep({ environment: "prod", status: "inactive" });
    expect((await checkMayGoLive(db.deployments.get("dep-x"), ctx)).ok).toBe(true);
    expect(db.approvals).toEqual([]);
  });
});

describe("a freeze", () => {
  const freeze = () => db.audit.push({ action: "deployment_freeze", details: JSON.stringify({ scope: "org", reason: "Quarter close" }) });

  it("holds back everything that puts a deployment in front of traffic", async () => {
    dep({});
    freeze();
    for (const action of ["shadow_on", "canary_start", "canary_increase", "full_rollout"]) {
      expect(await changeRoutingAction(ctx, "dep-x", { action }), action).toMatchObject({ status: 423, body: { frozen: true } });
    }
    expect(db.deployments.get("dep-x").status).toBe("pending");
  });

  it("never holds back the way out: rollback and shadow off still work", async () => {
    dep({ status: "canary", environment: "prod" });
    freeze();
    expect(await changeRoutingAction(ctx, "dep-x", { action: "shadow_off" })).toMatchObject({ status: 200 });
    expect(await changeRoutingAction(ctx, "dep-x", { action: "rollback" })).toMatchObject({ status: 200, body: { status: "rolled_back" } });
  });

  it("does not hold back the rollback action either", async () => {
    dep({ status: "active" });
    freeze();
    expect(await rollbackDeploymentAction(ctx, "dep-x", { reason: "bad release" })).toMatchObject({ status: 200, body: { status: "rolled_back" } });
    expect(db.stopped).toContain("dep-x");
  });
});

describe("sanitizeCreateBody", () => {
  it("keeps what a client sets and names what it drops", () => {
    const s = sanitizeCreateBody({ agentId: "a", environment: "staging", canaryConfig: { startPercent: 5 }, approvedBy: "x", status: "pending", bypassOntologyCheck: true, organizationId: "o" });
    expect(s.fields).toEqual({ agentId: "a", environment: "staging", canaryConfig: { startPercent: 5 } });
    expect(s.ignored).toEqual(["approvedBy"]);
    expect(s.refusal).toBeUndefined();
  });

  it("refuses any status but pending", () => {
    expect(sanitizeCreateBody({ agentId: "a", status: "active" }).refusal).toMatch(/created pending/);
    expect(sanitizeCreateBody({ agentId: "a", status: "pending" }).refusal).toBeUndefined();
    expect(sanitizeCreateBody({ agentId: "a", status: null as any }).refusal).toBeUndefined();
  });
});

describe("where the lifecycle is applied", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const handler = (src: string, route: string) => {
    const start = src.indexOf(route);
    expect(start, route).toBeGreaterThan(-1);
    const next = src.indexOf("\n  router.", start + 10);
    return src.slice(start, next === -1 ? undefined : next);
  };

  it("start-runtime checks before it starts anything, and is a 404 for an unknown deployment", () => {
    const h = handler(read("server/routes/shadow-canary.ts"), 'router.post("/api/deployments/:id/start-runtime"');
    expect(h).toContain("checkMayGoLive(dep, lifecycle)");
    expect(h.indexOf("checkMayGoLive")).toBeLessThan(h.indexOf("startAgentRuntime"));
    expect(h).toContain('res.status(404)');
  });

  it("run-pipeline checks before it runs a stage or takes the deployment live", () => {
    const h = handler(read("server/routes/shadow-canary.ts"), 'router.post("/api/deployments/:id/run-pipeline"');
    expect(h).toContain("checkMayGoLive(deployment, lifecycle)");
    expect(h.indexOf("checkMayGoLive")).toBeLessThan(h.indexOf("for (let index = 0"));
    expect(h.indexOf("checkMayGoLive")).toBeLessThan(h.indexOf('status: "deployed"'));
  });

  it("execute-now and deploy-and-run check before they run the agent", () => {
    const src = read("server/routes/shadow-canary.ts");
    const exec = handler(src, 'router.post("/api/deployments/:id/execute-now"');
    expect(exec.indexOf("checkMayGoLive")).toBeGreaterThan(-1);
    expect(exec.indexOf("checkMayGoLive")).toBeLessThan(exec.indexOf("executePromptWithMcp"));
    const dar = handler(src, 'router.post("/api/agents/:id/deploy-and-run"');
    expect(dar.indexOf("checkMayGoLive")).toBeGreaterThan(-1);
    expect(dar.indexOf("checkMayGoLive")).toBeLessThan(dar.indexOf("startAgentRuntime"));
  });

  it("a manual run is recorded in the deployment's own environment, not always production", () => {
    const h = handler(read("server/routes/shadow-canary.ts"), 'router.post("/api/deployments/:id/execute-now"');
    expect(h).toContain('environment: isProdEnv(deployment.environment) ? "prod" : (deployment.environment || "staging")');
    expect(h).not.toMatch(/environment: "prod",/);
  });

  it("stop-runtime is recorded and is never held back by the lifecycle checks", () => {
    const h = handler(read("server/routes/shadow-canary.ts"), 'router.post("/api/deployments/:id/stop-runtime"');
    expect(h).toContain("recordLifecycleEvent");
    expect(h).not.toContain("checkMayGoLive");
    expect(h).not.toContain("checkDeploymentFreeze");
  });

  it("an edit cannot set the fields the server owns, or any status but live or stopped", () => {
    const h = handler(read("server/routes/agents.ts"), 'router.patch("/api/deployments/:id"');
    const editable = /const EDITABLE = \[([^\]]*)\]/.exec(h)?.[1] ?? "";
    for (const forbidden of ["approvedBy", "signatureHash", "promotedFrom", "promotedAt", "deployedAt", "completedAt", "pipelineStages", "pipelineComplete", "evidencePackage", "incidentId", "patchId", "organizationId", "agentId"]) {
      expect(editable, forbidden).not.toContain(forbidden);
    }
    expect(h).toContain("LIVE_STATUSES.has(String(data.status))");
    expect(h).toContain("checkMayGoLive(existing, ctx)");
    expect(h.indexOf("EDITABLE")).toBeLessThan(h.indexOf("storage.updateDeployment"));
  });

  it("create, promote, routing and rollback hand the signed-in person to the action", () => {
    const src = read("server/routes/agents.ts");
    for (const call of ["createDeploymentAction(lifecycleContext(req)", "promoteDeploymentAction(lifecycleContext(req)", "changeRoutingAction(lifecycleContext(req)", "rollbackDeploymentAction(lifecycleContext(req)"]) {
      expect(src).toContain(call);
    }
    expect(read("server/deployment-request-context.ts")).toContain('hasPermission(getRequestRole(req), "deploy_prod")');
  });
});
