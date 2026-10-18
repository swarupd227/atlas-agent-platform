/**
 * Deciding an ontology_proposal approval (server/approval-decision.ts) is what drives the
 * concept: approve makes it exist in the approval's own organization, reject discards it,
 * and it is decided under the APPROVAL's organization, not whatever the request carried.
 * The ontology logic itself is covered in agent-ontology-proposals.test.ts; here it is
 * replaced so the wiring can be seen on its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ontology = vi.hoisted(() => ({ applyOntologyDecision: vi.fn() }));
const skills = vi.hoisted(() => ({ applySkillDecision: vi.fn() }));
const memory = vi.hoisted(() => ({ applyMemoryDecision: vi.fn() }));

vi.mock("../server/agent-ontology-proposals", () => ontology);
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
  ({ id: "apr-1", organizationId: "org-a", type: "ontology_proposal", objectType: "agent_ontology_proposal", objectId: "prop-1", objectName: "Self-Insured Excess", status: "approved", ...over }) as any;
const ctx = { orgId: "org-request", requestOrgId: "org-request", decidedBy: "reviewer" };

beforeEach(() => {
  ontology.applyOntologyDecision.mockReset().mockResolvedValue({ applied: true });
  skills.applySkillDecision.mockReset().mockResolvedValue({ applied: true });
  memory.applyMemoryDecision.mockReset().mockResolvedValue({ applied: true });
});

describe("deciding an ontology_proposal approval", () => {
  it("approving makes the concept exist, under the approval's own organization", async () => {
    await applyApprovalEffects(approval(), "approved", ctx);
    expect(ontology.applyOntologyDecision).toHaveBeenCalledWith({ orgId: "org-a", proposalId: "prop-1", decision: "approved", decidedBy: "reviewer" });
    expect(skills.applySkillDecision).not.toHaveBeenCalled();
    expect(memory.applyMemoryDecision).not.toHaveBeenCalled();
  });

  it("rejecting discards it", async () => {
    await applyApprovalEffects(approval({ status: "rejected" }), "rejected", ctx);
    expect(ontology.applyOntologyDecision).toHaveBeenCalledWith({ orgId: "org-a", proposalId: "prop-1", decision: "rejected", decidedBy: "reviewer" });
  });

  it("falls back to the request's organization only when the approval names none", async () => {
    await applyApprovalEffects(approval({ organizationId: null }), "approved", ctx);
    expect(ontology.applyOntologyDecision).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-request" }));
  });

  it("does nothing for any other status, such as changes requested", async () => {
    await applyApprovalEffects(approval({ status: "changes_requested" }), "changes_requested", ctx);
    expect(ontology.applyOntologyDecision).not.toHaveBeenCalled();
  });

  it("does nothing for another kind of approval, including skill and memory ones", async () => {
    await applyApprovalEffects(approval({ type: "guardrail_review", objectType: "run" }), "approved", ctx);
    await applyApprovalEffects(approval({ type: "skill_proposal", objectType: "agent_skill_proposal" }), "approved", ctx);
    await applyApprovalEffects(approval({ type: "memory_write", objectType: "agent_memory_note" }), "approved", ctx);
    expect(ontology.applyOntologyDecision).not.toHaveBeenCalled();
    expect(skills.applySkillDecision).toHaveBeenCalledTimes(1);
    expect(memory.applyMemoryDecision).toHaveBeenCalledTimes(1);
  });

  it("says in words what the decision does, for a new concept and for a revision, naming whose ontology it is", () => {
    const fresh = { type: "ontology_proposal", objectType: "agent_ontology_proposal", objectName: "X", evidenceJson: { kind: "add" } };
    const revision = { ...fresh, evidenceJson: { kind: "revise" } };
    expect(describeApprovalEffect(fresh, "approve")).toMatch(/your organization's ontology only.*no other organization does/s);
    expect(describeApprovalEffect(revision, "approve")).toMatch(/your organization added.*previous version is kept/s);
    expect(describeApprovalEffect(fresh, "reject")).toMatch(/discarded/);
  });
});
