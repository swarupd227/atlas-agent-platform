/**
 * Deciding a memory_write approval (server/approval-decision.ts) is what drives
 * the note: approve makes it live, reject keeps a record, and the note is
 * decided under the APPROVAL's organization, not whatever the request carried.
 * The note logic itself is covered in agent-memory.test.ts; here it is replaced
 * so the wiring can be seen on its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const memory = vi.hoisted(() => ({ applyMemoryDecision: vi.fn() }));

vi.mock("../server/agent-memory", () => memory);
vi.mock("../server/storage", () => ({
  storage: {
    getApproval: vi.fn(), updateApproval: vi.fn(), createAuditEvent: vi.fn(),
    getOutcome: vi.fn(), updateOutcome: vi.fn(), updateSkill: vi.fn(),
    listDagExecutionRunsByStatus: vi.fn(async () => []),
  },
}));
vi.mock("../server/workspace-run", () => ({ resumeWorkspaceRun: vi.fn() }));
vi.mock("../server/services/screenshot-baseline", () => ({ promoteToBaseline: vi.fn() }));
vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/dag-execution-engine", () => ({ resumeTeamAgentDagRun: vi.fn() }));

import { applyApprovalEffects, describeApprovalEffect } from "../server/approval-decision";

const approval = (over: Record<string, unknown> = {}) =>
  ({ id: "apr-1", organizationId: "org-a", type: "memory_write", objectType: "agent_memory_note", objectId: "note-1", objectName: "Closes at 18:00", status: "approved", ...over }) as any;
const ctx = { orgId: "org-request", requestOrgId: "org-request", decidedBy: "reviewer" };

beforeEach(() => { memory.applyMemoryDecision.mockReset().mockResolvedValue({ applied: true }); });

describe("deciding a memory_write approval", () => {
  it("approving makes the note live, under the approval's own organization", async () => {
    await applyApprovalEffects(approval(), "approved", ctx);
    expect(memory.applyMemoryDecision).toHaveBeenCalledWith({ orgId: "org-a", noteId: "note-1", decision: "approved", decidedBy: "reviewer" });
  });

  it("rejecting records the refusal", async () => {
    await applyApprovalEffects(approval({ status: "rejected" }), "rejected", ctx);
    expect(memory.applyMemoryDecision).toHaveBeenCalledWith({ orgId: "org-a", noteId: "note-1", decision: "rejected", decidedBy: "reviewer" });
  });

  it("does nothing for any other status, such as changes requested", async () => {
    await applyApprovalEffects(approval({ status: "changes_requested" }), "changes_requested", ctx);
    expect(memory.applyMemoryDecision).not.toHaveBeenCalled();
  });

  it("does nothing for another kind of approval", async () => {
    await applyApprovalEffects(approval({ type: "guardrail_review", objectType: "run" }), "approved", ctx);
    expect(memory.applyMemoryDecision).not.toHaveBeenCalled();
  });

  it("says in words what the decision does", () => {
    const a = { type: "memory_write", objectType: "agent_memory_note", objectName: "Closes at 18:00" };
    expect(describeApprovalEffect(a, "approve")).toMatch(/notes.*later runs will be shown the note/s);
    expect(describeApprovalEffect(a, "reject")).toMatch(/notes stay as they are/);
  });
});
