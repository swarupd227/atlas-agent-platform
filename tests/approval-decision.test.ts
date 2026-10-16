/**
 * decideApproval (server/approval-decision.ts): deciding an outcome review or
 * a team-run approval gate outside the Approvals page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const db = vi.hoisted(() => ({
  approvals: new Map<string, any>(),
  outcomes: new Map<string, any>(),
  audit: [] as any[],
  runs: [] as any[],
  resumed: [] as string[],
  deployments: new Map<string, any>(),
  agents: new Map<string, any>(),
  dagRuns: new Map<string, any>(),
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
    getApprovals: vi.fn(async () => [...db.approvals.values()].map((a: any) => ({ ...a }))),
    getOpenGateApprovalsForRun: vi.fn(async (runId: string) =>
      [...db.approvals.values()].filter((a: any) =>
        a.objectType === "pipeline_gate" &&
        ["pending", "changes_requested", "expired"].includes(a.status) &&
        (a.evidenceJson || {}).runId === runId).map((a: any) => ({ ...a }))),
    getOutcome: vi.fn(async (id: string, orgId?: string) => {
      const o = db.outcomes.get(id);
      return o && (!orgId || o.organizationId === orgId) ? { ...o } : undefined;
    }),
    updateOutcome: vi.fn(async (id: string, data: any) => { db.outcomes.set(id, { ...db.outcomes.get(id), ...data }); return {}; }),
    listDagExecutionRunsByStatus: vi.fn(async () => db.runs),
    getDagExecutionRun: vi.fn(async (id: string) => (db.dagRuns.has(id) ? { ...db.dagRuns.get(id) } : undefined)),
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

import { decideApproval, ApprovalDecisionError, closeMootGatesForRun, sweepMootGates } from "../server/approval-decision";

const base = { orgId: "org-a", userId: "user-1", decidedBy: "admin", via: "test" };

beforeEach(() => {
  db.approvals.clear();
  db.outcomes.clear();
  db.audit.length = 0;
  db.runs.length = 0;
  db.resumed.length = 0;
  db.deployments.clear();
  db.agents.clear();
  db.dagRuns.clear();
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

  // An expired gate stays decidable on purpose, so a run still waiting can be
  // rescued. But the rescue only reaches a run in `waiting_approval`, and the
  // run's own pendingApprovalId is cleared when it stops -- so a decision on a
  // finished run's gate used to flip the row to "approved", write an
  // approval_approved audit event, and resume nothing. The audit trail then
  // claimed a human had approved a gate whose run declined hours earlier.
  describe("a gate whose run has already finished", () => {
    const expiredGateOn = (runId: string) => {
      db.approvals.set("apr-gate", {
        ...db.approvals.get("apr-gate"), status: "expired", evidenceJson: { runId },
      });
    };

    it("cannot be decided, and nothing is written", async () => {
      db.dagRuns.set("run-done", { id: "run-done", status: "completed_with_skips" });
      expiredGateOn("run-done");
      expect(await code(decideApproval({ ...base, role: "admin", approvalId: "apr-gate", decision: "approved" }))).toBe("not_pending");
      expect(db.approvals.get("apr-gate").status).toBe("expired"); // not flipped
      expect(db.audit).toHaveLength(0); // and no approval_approved event
    });

    it("is refused for every finished status, not just the happy one", async () => {
      for (const status of ["completed", "completed_with_skips", "failed", "cancelled"]) {
        db.dagRuns.set("run-done", { id: "run-done", status });
        expiredGateOn("run-done");
        expect(await code(decideApproval({ ...base, role: "admin", approvalId: "apr-gate", decision: "approved" }))).toBe("not_pending");
      }
    });

    it("is still decidable while the run is genuinely waiting, and resumes it", async () => {
      db.dagRuns.set("run-1", { id: "run-1", status: "waiting_approval" });
      db.runs.push({ id: "run-1", pendingApprovalId: "apr-gate" });
      expiredGateOn("run-1");
      expect(await code(decideApproval({ ...base, role: "admin", approvalId: "apr-gate", decision: "approved" }))).toBe("ok");
      await vi.waitFor(() => expect(db.resumed).toEqual(["run-1"]));
    });

    // Fails open: a gate we cannot trace to a run must stay decidable, or a
    // lookup gap would block legitimate approvals.
    it("stays decidable when the gate records no run, or the run is unknown", async () => {
      expiredGateOn("");
      expect(await code(decideApproval({ ...base, role: "admin", approvalId: "apr-gate", decision: "approved" }))).toBe("ok");
      db.approvals.set("apr-gate", { ...db.approvals.get("apr-gate"), status: "expired" });
      expiredGateOn("run-never-stored");
      expect(await code(decideApproval({ ...base, role: "admin", approvalId: "apr-gate", decision: "approved" }))).toBe("ok");
    });
  });

  /**
   * The guard above refuses the click. That is correct but late: the gate was
   * still sitting in "Needs a decision" days after its run died, so someone
   * read the whole case before being told. Measured on Azure 2026-10-14:
   * approval 5c7b2b72 pending on run 8b5ee6f3, which failed two days earlier.
   * Cancelling a run already closed its gate; failing and completing did not.
   */
  describe("closing a gate whose run ended without it", () => {
    const openGateOn = (runId: string, status = "pending") => {
      db.approvals.set("apr-gate", { ...db.approvals.get("apr-gate"), status, evidenceJson: { runId } });
    };

    it("closes the gate as moot, with the reason and the run's status", async () => {
      openGateOn("run-done");
      const closed = await closeMootGatesForRun("run-done", "failed");
      expect(closed).toHaveLength(1);
      const a = db.approvals.get("apr-gate");
      expect(a.status).toBe("moot");
      // Not "rejected": nobody refused it, which is the false record the whole
      // guard exists to prevent.
      expect(a.status).not.toBe("rejected");
      expect(a.decidedBy).toBe("system");
      expect(String(a.evidenceJson.mootReason)).toContain('ended as "failed"');
      expect(a.evidenceJson.mootRunStatus).toBe("failed");
      // The runId it was found by must survive, or nothing can trace it back.
      expect(a.evidenceJson.runId).toBe("run-done");
    });

    it("records one audit event naming what it closed", async () => {
      openGateOn("run-done");
      await closeMootGatesForRun("run-done", "failed");
      const ev = db.audit.filter((e: any) => e.action === "approval_moot");
      expect(ev).toHaveLength(1);
      expect(ev[0].objectId).toBe("run-done");
      expect(String(ev[0].details)).toContain("apr-gate");
    });

    it("leaves a decided gate alone", async () => {
      // Only open gates are returned by the lookup; an approved one must not be
      // rewritten to moot, which would erase a real decision.
      openGateOn("run-done", "approved");
      const closed = await closeMootGatesForRun("run-done", "failed");
      expect(closed).toHaveLength(0);
      expect(db.approvals.get("apr-gate").status).toBe("approved");
    });

    it("writes nothing when the run has no open gate", async () => {
      const closed = await closeMootGatesForRun("run-with-no-gate", "completed");
      expect(closed).toHaveLength(0);
      expect(db.audit.filter((e: any) => e.action === "approval_moot")).toHaveLength(0);
    });

    it("the sweep closes a gate whose run finished, and spares one still waiting", async () => {
      db.dagRuns.set("run-done", { id: "run-done", status: "failed" });
      db.dagRuns.set("run-waiting", { id: "run-waiting", status: "waiting_approval" });
      openGateOn("run-done");
      expect((await sweepMootGates()).closed).toBe(1);
      expect(db.approvals.get("apr-gate").status).toBe("moot");

      db.approvals.set("apr-gate", { ...db.approvals.get("apr-gate"), status: "pending" });
      openGateOn("run-waiting");
      expect((await sweepMootGates()).closed).toBe(0);
      expect(db.approvals.get("apr-gate").status).toBe("pending");
    });

    it("the sweep is idempotent, so running it on every boot is safe", async () => {
      db.dagRuns.set("run-done", { id: "run-done", status: "failed" });
      openGateOn("run-done");
      expect((await sweepMootGates()).closed).toBe(1);
      expect((await sweepMootGates()).closed).toBe(0);
      expect(db.audit.filter((e: any) => e.action === "approval_moot")).toHaveLength(1);
    });
  });

  /**
   * The tests above mock storage, so they prove closeMootGatesForRun's logic
   * but not the query it depends on. A mock that filtered differently from the
   * real one would keep them green while production closed the wrong rows.
   */
  describe("the queries behind it", () => {
    const storageSrc = readFileSync(join(__dirname, "..", "server", "storage.ts"), "utf8");

    /**
     * Declaration to next declaration, never a fixed character count: this tree
     * stores LF and a clean Windows checkout materialises CRLF, which moved a
     * slice window far enough to fail CI on the very commit that added it.
     */
    function methodBody(src: string, declaration: string): string {
      const at = src.indexOf(declaration);
      if (at < 0) return "";
      const next = src.indexOf("\n  async ", at + declaration.length);
      return next < 0 ? src.slice(at) : src.slice(at, next);
    }

    it("only ever returns OPEN gates, for THIS run", () => {
      expect(storageSrc.indexOf("async getOpenGateApprovalsForRun"), "not found").toBeGreaterThan(-1);
      const body = methodBody(storageSrc, "async getOpenGateApprovalsForRun");
      expect(body).toContain('eq(approvals.objectType, "pipeline_gate")');
      expect(body).toContain('inArray(approvals.status, ["pending", "changes_requested", "expired"])');
      // By the run id on the approval, NOT the run's pendingApprovalId, which
      // is cleared exactly when the run stops.
      expect(body).toContain("evidence_json->>'runId'");
      expect(body).not.toContain("pendingApprovalId");
    });

    it("fires the close only when a run reaches a terminal status", () => {
      const body = methodBody(storageSrc, "async updateDagExecutionRun");
      expect(body).toContain("FINISHED_DAG_RUN_STATUSES.has(String(data.status))");
      expect(body).toContain("closeMootGatesForRun");
      // Never fail the run's own write because a gate could not be closed.
      expect(body).toMatch(/catch\s*\{/);
    });

    it("agrees with approval-decision.ts about which statuses are finished", () => {
      const ad = readFileSync(join(__dirname, "..", "server", "approval-decision.ts"), "utf8");
      const set = (src: string, name: string) => src.slice(src.indexOf(name), src.indexOf("]", src.indexOf(name)) + 1);
      // Two copies of one rule drift. If they ever disagree, a run could finish
      // by one definition and leave its gate open by the other.
      expect(set(storageSrc, "FINISHED_DAG_RUN_STATUSES")).toContain('"completed", "completed_with_skips", "failed", "cancelled"');
      expect(set(ad, "FINISHED_RUN_STATUSES")).toContain('"completed", "completed_with_skips", "failed", "cancelled"');
    });
  });

  it("without routing, needs approve_changes", async () => {
    expect(await code(decideApproval({ ...base, role: "agent_engineer", approvalId: "apr-review", decision: "approved" }))).toBe("not_allowed");
    expect(db.outcomes.get("out-1").status).toBe("pending_review");
  });
});
