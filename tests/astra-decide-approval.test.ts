/**
 * decide_approval through the Astra confirm loop, with fake services.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { decideApprovalTool } from "../server/astra/tools/decide-approval";
import { canDecideApproval, hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "user-1", role });

function setup(steps: Parameters<typeof scriptedComplete>[0], approval: Record<string, any>) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const decisions: any[] = [];
  const services = {
    getApprovalForDecision: vi.fn(async (org: string, role: RoleId, id: string) =>
      org === ORG && id === approval.id ? { ...approval, canDecide: canDecideApproval(role, approval.requiredReviewerRole) } : null),
    decideApprovalAs: vi.fn(async (...args: any[]) => {
      decisions.push(args);
      approval.status = args[5];
      return { approval: { ...approval }, outcomeStatus: approval.objectType === "outcome_contract" ? (args[5] === "approved" ? "awaiting_agent_plan" : "draft") : null };
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, decideApprovalTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, decisions, onEvent: () => {} };
}

const review = () => ({
  id: "apr-1", type: "outcome_review", objectType: "outcome_contract", objectName: "Reduce DSO", status: "pending",
  description: null, requestedBy: "admin", createdAt: "2026-09-14T08:00:00.000Z", requiredReviewerRole: null,
  outcome: { id: "out-1", name: "Reduce DSO", status: "pending_review" },
});
const decide = (decision = "approve") => ({ toolCalls: [{ name: "decide_approval", arguments: { approvalId: "apr-1", decision } }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);

describe("decide_approval", () => {
  it("shows what approving unlocks, and on Confirm approves and reports the outcome's new status", async () => {
    const t = setup([decide(), (m) => { expect(lastTool(m).result).toMatchObject({ decided: true, decision: "approved", outcome: { status: "awaiting_agent_plan" } }); return done("Approved."); }], review());
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Approve it", t.onEvent)).toBe("awaiting_confirmation");
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe("Approve outcome review: Reduce DSO");
    expect(action.details!.join(" ")).toContain("ready for its agent plan");
    expect(t.services.decideApprovalAs).not.toHaveBeenCalled();

    expect(await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent)).toBe("idle");
    expect(t.decisions[0]).toEqual([ORG, "admin", "user-1", "admin", "apr-1", "approved", undefined]);
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.proof!.compliance).toMatchObject({ summary: expect.stringContaining("Approved as admin") });
  });

  it("Not now decides nothing", async () => {
    const t = setup([decide(), (m) => { expect(lastTool(m)).toMatchObject({ declined: true }); return done("Left pending."); }], review());
    await runTurn(t.deps, as("admin"), t.threadId, "Approve it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "cancel", t.onEvent);
    expect(t.services.decideApprovalAs).not.toHaveBeenCalled();
  });

  it("refuses without a card when the role can't decide, it's already decided, or it's another kind of approval", async () => {
    for (const [role, approval, expected] of [
      ["agent_engineer", review(), "can't decide this approval"],
      ["admin", { ...review(), status: "approved" }, "already approved"],
      ["admin", { ...review(), objectType: "patch", type: "patch" }, "Approvals page"],
      ["expert_validator", { ...review(), requiredReviewerRole: "compliance_security" }, "routed to the compliance_security role"],
    ] as Array<[RoleId, any, string]>) {
      const t = setup([decide(), (m) => { expect(lastTool(m).error, role).toContain(expected); return done("Can't."); }], approval);
      expect(await runTurn(t.deps, as(role), t.threadId, "Approve it", t.onEvent)).toBe("idle");
      expect(t.services.decideApprovalAs).not.toHaveBeenCalled();
    }
  });

  it("says a rejected gate stops the team run", async () => {
    const gate = { ...review(), id: "apr-1", type: "hitl_gate", objectType: "pipeline_gate", objectName: "Manager Approval", outcome: null };
    const t = setup([decide("reject")], gate);
    await runTurn(t.deps, as("admin"), t.threadId, "Reject it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe("Reject approval gate: Manager Approval");
    expect(action.details!.join(" ")).toContain("stops at this step");
  });
});
