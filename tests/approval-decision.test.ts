/**
 * decideApproval (server/approval-decision.ts): deciding an outcome review or
 * a team-run approval gate outside the Approvals page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  approvals: new Map<string, any>(),
  outcomes: new Map<string, any>(),
  audit: [] as any[],
  runs: [] as any[],
  resumed: [] as string[],
  deployments: new Map<string, any>(),
  agents: new Map<string, any>(),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getApproval: vi.fn(async (id: string, orgId?: string) => {
      const a = db.approvals.get(id);
      return a && (!orgId || a.organizationId === orgId) ? { ...a } : undefined;
    }),
    updateApproval: vi.fn(async (id: string, data: any) => {
      const a = { ...db.approvals.get(id), ...data };
      db.approvals.set(id, a);
      return a;
    }),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
    getOutcome: vi.fn(async (id: string, orgId?: string) => {
      const o = db.outcomes.get(id);
      return o && (!orgId || o.organizationId === orgId) ? { ...o } : undefined;
    }),
    updateOutcome: vi.fn(async (id: string, data: any) => { db.outcomes.set(id, { ...db.outcomes.get(id), ...data }); return {}; }),
    listDagExecutionRunsByStatus: vi.fn(async () => db.runs),
    getDeployment: vi.fn(async (id: string) => (db.deployments.has(id) ? { ...db.deployments.get(id) } : undefined)),
    updateDeployment: vi.fn(async (id: string, data: any) => { db.deployments.set(id, { ...db.deployments.get(id), ...data }); return {}; }),
    getAgent: vi.fn(async (id: string) => (db.agents.has(id) ? { ...db.agents.get(id) } : undefined)),
    updateAgent: vi.fn(async (id: string, data: any) => { db.agents.set(id, { ...db.agents.get(id), ...data }); return {}; }),
  },
}));

vi.mock("../server/workspace-run", () => ({ resumeWorkspaceRun: vi.fn() }));
vi.mock("../server/services/screenshot-baseline", () => ({ promoteToBaseline: vi.fn() }));
vi.mock("../server/db", () => ({ db: {} }));

vi.mock("../server/dag-execution-engine", () => ({
  resumeTeamAgentDagRun: vi.fn(async (id: string) => { db.resumed.push(id); }),
}));

import { decideApproval, ApprovalDecisionError } from "../server/approval-decision";

const base = { orgId: "org-a", userId: "user-1", decidedBy: "admin", via: "test" };

beforeEach(() => {
  db.approvals.clear();
  db.outcomes.clear();
  db.audit.length = 0;
  db.runs.length = 0;
  db.resumed.length = 0;
  db.deployments.clear();
  db.agents.clear();
  db.outcomes.set("out-1", { id: "out-1", organizationId: "org-a", name: "Reduce DSO", status: "pending_review" });
  db.approvals.set("apr-review", { id: "apr-review", organizationId: "org-a", type: "outcome_review", objectType: "outcome_contract", objectId: "out-1", objectName: "Reduce DSO", status: "pending" });
  db.approvals.set("apr-gate", { id: "apr-gate", organizationId: "org-a", type: "hitl_gate", objectType: "pipeline_gate", objectName: "Manager Approval", status: "pending" });
  db.approvals.set("apr-patch", { id: "apr-patch", organizationId: "org-a", type: "patch", objectType: "patch", status: "pending" });
});

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return e instanceof ApprovalDecisionError ? e.code : String(e); }
};

describe("decideApproval", () => {
  it("approving an outcome review moves the outcome on, records the decider and audits it in the organization", async () => {
    const r = await decideApproval({ ...base, role: "admin", approvalId: "apr-review", decision: "approved", note: "Targets look right" });
    expect(r.outcomeStatus).toBe("awaiting_agent_plan");
    expect(db.approvals.get("apr-review")).toMatchObject({ status: "approved", decidedBy: "admin" });
    expect(db.outcomes.get("out-1").status).toBe("awaiting_agent_plan");
    expect(db.audit).toEqual([expect.objectContaining({ organizationId: "org-a", action: "approval_approved", actorId: "user-1", details: expect.stringContaining("Targets look right") })]);
  });

  it("rejecting an outcome review sends the outcome back to draft", async () => {
    await decideApproval({ ...base, role: "admin", approvalId: "apr-review", decision: "rejected" });
    expect(db.outcomes.get("out-1").status).toBe("draft");
  });

  it("deciding a gate resumes the team run waiting on it", async () => {
    db.runs.push({ id: "run-other", pendingApprovalId: "apr-x" }, { id: "run-1", pendingApprovalId: "apr-gate" });
    await decideApproval({ ...base, role: "admin", approvalId: "apr-gate", decision: "approved" });
    await vi.waitFor(() => expect(db.resumed).toEqual(["run-1"]));
  });

  it("refuses another organization's approval and one already decided", async () => {
    expect(await code(decideApproval({ ...base, orgId: "org-b", role: "admin", approvalId: "apr-review", decision: "approved" }))).toBe("not_found");
    db.approvals.set("apr-review", { ...db.approvals.get("apr-review"), status: "approved" });
    expect(await code(decideApproval({ ...base, role: "admin", approvalId: "apr-review", decision: "approved" }))).toBe("not_pending");
    expect(db.audit).toHaveLength(0);
  });

  it("applies the same per-kind effects as the Approvals page: approving a deployment activates it", async () => {
    db.approvals.set("apr-dep", { id: "apr-dep", organizationId: "org-a", type: "deployment_review", objectType: "deployment", objectId: "dep-1", objectName: "Invoice Agent", status: "pending" });
    db.deployments.set("dep-1", { id: "dep-1", agentName: "Invoice Agent", status: "pending", rolloutStrategy: "canary", canaryConfig: { startPercent: 10 } });
    await decideApproval({ ...base, role: "admin", approvalId: "apr-dep", decision: "approved" });
    expect(db.deployments.get("dep-1")).toMatchObject({ status: "canary", canaryPercent: 10, approvedBy: "admin" });
    expect(db.audit.map((e) => e.action)).toEqual(["approval_approved", "deployment_activated"]);
  });

  it("approving a retirement review retires the agent", async () => {
    db.approvals.set("apr-ret", { id: "apr-ret", organizationId: "org-a", type: "retirement_review", objectType: "agent", objectId: "ag-1", status: "pending" });
    db.agents.set("ag-1", { id: "ag-1", status: "retiring" });
    await decideApproval({ ...base, role: "admin", approvalId: "apr-ret", decision: "approved" });
    expect(db.agents.get("ag-1").status).toBe("retired");
  });

  it("follows review routing: a routed role may decide, others may not, even with approve_changes", async () => {
    db.approvals.set("apr-gate", { ...db.approvals.get("apr-gate"), requiredReviewerRole: "compliance_security" });
    expect(await code(decideApproval({ ...base, role: "expert_validator", approvalId: "apr-gate", decision: "approved" }))).toBe("not_allowed");
    expect(await code(decideApproval({ ...base, role: "compliance_security", approvalId: "apr-gate", decision: "approved" }))).toBe("ok");
  });

  it("without routing, needs approve_changes", async () => {
    expect(await code(decideApproval({ ...base, role: "agent_engineer", approvalId: "apr-review", decision: "approved" }))).toBe("not_allowed");
    expect(db.outcomes.get("out-1").status).toBe("pending_review");
  });
});
