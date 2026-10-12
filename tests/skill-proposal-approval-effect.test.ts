/**
 * Deciding a skill_proposal approval (server/approval-decision.ts) is what drives
 * the skill: approve makes it exist, reject discards it, and it is decided under
 * the APPROVAL's organization, not whatever the request carried. The skill logic
 * itself is covered in agent-skill-proposals.test.ts; here it is replaced so the
 * wiring can be seen on its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const skills = vi.hoisted(() => ({ applySkillDecision: vi.fn() }));
const memory = vi.hoisted(() => ({ applyMemoryDecision: vi.fn() }));

vi.mock("../server/agent-skill-proposals", () => skills);
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
  ({ id: "apr-1", organizationId: "org-a", type: "skill_proposal", objectType: "agent_skill_proposal", objectId: "prop-1", objectName: "Loss Date Coverage", status: "approved", ...over }) as any;
const ctx = { orgId: "org-request", requestOrgId: "org-request", decidedBy: "reviewer" };

beforeEach(() => {
  skills.applySkillDecision.mockReset().mockResolvedValue({ applied: true });
  memory.applyMemoryDecision.mockReset().mockResolvedValue({ applied: true });
});

describe("deciding a skill_proposal approval", () => {
  it("approving makes the skill exist, under the approval's own organization", async () => {
    await applyApprovalEffects(approval(), "approved", ctx);
    expect(skills.applySkillDecision).toHaveBeenCalledWith({ orgId: "org-a", proposalId: "prop-1", decision: "approved", decidedBy: "reviewer" });
    expect(memory.applyMemoryDecision).not.toHaveBeenCalled();
  });

  it("rejecting discards it", async () => {
    await applyApprovalEffects(approval({ status: "rejected" }), "rejected", ctx);
    expect(skills.applySkillDecision).toHaveBeenCalledWith({ orgId: "org-a", proposalId: "prop-1", decision: "rejected", decidedBy: "reviewer" });
  });

  it("does nothing for any other status, such as changes requested", async () => {
    await applyApprovalEffects(approval({ status: "changes_requested" }), "changes_requested", ctx);
    expect(skills.applySkillDecision).not.toHaveBeenCalled();
  });

  it("does nothing for another kind of approval, including a memory one", async () => {
    await applyApprovalEffects(approval({ type: "guardrail_review", objectType: "run" }), "approved", ctx);
    await applyApprovalEffects(approval({ type: "memory_write", objectType: "agent_memory_note" }), "approved", ctx);
    expect(skills.applySkillDecision).not.toHaveBeenCalled();
    expect(memory.applyMemoryDecision).toHaveBeenCalledTimes(1);
  });

  it("says in words what the decision does, for a new skill and for a revision", () => {
    const fresh = { type: "skill_proposal", objectType: "agent_skill_proposal", objectName: "X", evidenceJson: { kind: "new" } };
    const revision = { ...fresh, evidenceJson: { kind: "revision" } };
    expect(describeApprovalEffect(fresh, "approve")).toMatch(/becomes active.*attached.*grants no tools/s);
    expect(describeApprovalEffect(revision, "approve")).toMatch(/replaced.*every agent that uses it.*previous version is kept/s);
    expect(describeApprovalEffect(fresh, "reject")).toMatch(/discarded/);
  });
});
