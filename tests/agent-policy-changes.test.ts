/**
 * Changing an agent's chosen policies after creation (server/agent-policy-changes.ts):
 * adding or tightening applies now; removing or loosening needs a reason and an
 * approval routed to compliance_security, decided by someone other than the requester.
 *
 * MOCKED: storage. REAL: the classification, the bindings arithmetic, the
 * approval request, the decision effect and the self-approval rule.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(),
    getPolicies: vi.fn(),
    updateAgent: vi.fn(),
    createAuditEvent: vi.fn(),
    createApproval: vi.fn(),
  },
}));

import {
  applyPolicyChangeDecision, applyToBindings, classifyChange, enforcementRank, refusalForBindingPatch,
  requestPolicyChanges, selfApprovalRefusal, PolicyChangeError, POLICY_CHANGE_APPROVAL_TYPE, POLICY_CHANGE_REVIEWER_ROLE,
} from "../server/agent-policy-changes";
import { storage } from "../server/storage";

const m = vi.mocked(storage as any);

const LIB = [
  { id: "osha", name: "OSHA Safety", domain: "tool_permissions", description: "", status: "active" },
  { id: "itar", name: "ITAR Data", domain: "data_handling", description: "", status: "active" },
  { id: "pii", name: "No PII", domain: "data_handling", description: "", status: "active" },
  { id: "old", name: "Retired rule", domain: "data_handling", description: "", status: "inactive" },
];
const actor = { label: "dev", userId: "u-dev" };

function agentWith(policyBindings: unknown[]) {
  m.getAgent.mockResolvedValue({ id: "a1", name: "Agent One", organizationId: "o1", policyBindings });
  m.getPolicies.mockResolvedValue(LIB);
  m.createApproval.mockImplementation(async (a: any) => ({ id: "ap-1", ...a }));
}
const savedBindings = () => m.updateAgent.mock.calls.at(-1)?.[1]?.policyBindings;

beforeEach(() => {
  for (const fn of Object.values(storage as any)) vi.mocked(fn as any).mockReset();
});

describe("classification", () => {
  it("orders enforcement advisory < soft < hard", () => {
    expect(enforcementRank("advisory")).toBeLessThan(enforcementRank("soft"));
    expect(enforcementRank("soft")).toBe(enforcementRank("monitor"));
    expect(enforcementRank("hard")).toBe(enforcementRank("block"));
    expect(enforcementRank(undefined)).toBe(enforcementRank("soft"));
  });

  it("names each change by direction", () => {
    const b = [{ policyId: "osha", enforcement: "soft" }];
    const osha = { id: "osha", name: "OSHA Safety" };
    expect(classifyChange(b, { policyId: "itar", action: "add", enforcement: "hard" }, { id: "itar", name: "ITAR Data" }).kind).toBe("add");
    expect(classifyChange(b, { policyId: "osha", action: "set_enforcement", enforcement: "hard" }, osha).kind).toBe("stricter");
    expect(classifyChange(b, { policyId: "osha", action: "set_enforcement", enforcement: "advisory" }, osha).kind).toBe("weaker");
    expect(classifyChange(b, { policyId: "osha", action: "remove" }, osha).kind).toBe("remove");
    expect(classifyChange([], { policyId: "osha", action: "remove" }, osha).kind).toBe("unchanged");
  });

  it("finds a binding the demo seeds made by name", () => {
    const c = classifyChange([{ policyName: "OSHA Safety", enforcement: "hard" }], { policyId: "osha", action: "remove" }, { id: "osha", name: "OSHA Safety" });
    expect(c.kind).toBe("remove");
    const next = applyToBindings([{ policyName: "OSHA Safety", enforcement: "hard" }], [c], new Map([["osha", { id: "osha", name: "OSHA Safety" }]]));
    expect(next).toEqual([]);
  });
});

describe("requestPolicyChanges", () => {
  it("applies an addition and a tightening at once, audited per policy", async () => {
    agentWith([{ policyId: "osha", enforcement: "soft" }]);
    const r = await requestPolicyChanges({
      orgId: "o1", agentId: "a1", actor,
      changes: [{ policyId: "itar", action: "add", enforcement: "hard" }, { policyId: "osha", action: "set_enforcement", enforcement: "hard" }],
    });
    expect(r.applied.map((c) => c.kind)).toEqual(["add", "stricter"]);
    expect(r.pending).toBeNull();
    expect(savedBindings()).toEqual([
      { policyId: "osha", policyName: "OSHA Safety", enforcement: "hard" },
      expect.objectContaining({ policyId: "itar", enforcement: "hard" }),
    ]);
    const actions = m.createAuditEvent.mock.calls.map((c: any[]) => c[0].action);
    expect(actions).toEqual(["policy_binding_added", "policy_binding_tightened"]);
    expect(m.createAuditEvent.mock.calls[0][0].details).toMatch(/added "ITAR Data" \(hard\)/);
    expect(m.createApproval).not.toHaveBeenCalled();
  });

  it("refuses to remove or loosen without a reason, and changes nothing", async () => {
    agentWith([{ policyId: "osha", enforcement: "hard" }]);
    await expect(requestPolicyChanges({ orgId: "o1", agentId: "a1", actor, changes: [{ policyId: "osha", action: "remove" }] }))
      .rejects.toMatchObject({ code: "reason_required" });
    expect(m.updateAgent).not.toHaveBeenCalled();
    expect(m.createApproval).not.toHaveBeenCalled();
  });

  it("files a removal as an approval routed to compliance, and leaves the binding in force", async () => {
    agentWith([{ policyId: "osha", enforcement: "hard" }, { policyId: "pii", enforcement: "hard" }]);
    const r = await requestPolicyChanges({
      orgId: "o1", agentId: "a1", actor, reason: "Agent no longer touches equipment",
      changes: [{ policyId: "osha", action: "remove" }, { policyId: "pii", action: "set_enforcement", enforcement: "advisory" }],
    });
    expect(r.applied).toEqual([]);
    expect(r.pending?.changes.map((c) => c.kind)).toEqual(["remove", "weaker"]);
    expect(m.updateAgent).not.toHaveBeenCalled();
    const approval = m.createApproval.mock.calls[0][0];
    expect(approval).toMatchObject({
      type: POLICY_CHANGE_APPROVAL_TYPE, objectType: "agent", objectId: "a1", agentId: "a1",
      status: "pending", requiredReviewerRole: POLICY_CHANGE_REVIEWER_ROLE, requestedBy: "dev",
    });
    expect(approval.evidenceJson).toMatchObject({ reason: "Agent no longer touches equipment", requesterLabel: "dev", requesterUserId: "u-dev" });
    expect(approval.description).toMatch(/removed "OSHA Safety".*loosened "No PII" from hard to advisory/);
    expect(m.createAuditEvent.mock.calls[0][0].action).toBe("policy_binding_change_requested");
  });

  it("applies the tighter half of a mixed change now and files the looser half", async () => {
    agentWith([{ policyId: "osha", enforcement: "hard" }]);
    const r = await requestPolicyChanges({
      orgId: "o1", agentId: "a1", actor, reason: "swap",
      changes: [{ policyId: "itar", action: "add" }, { policyId: "osha", action: "remove" }],
    });
    expect(r.applied.map((c) => c.policyId)).toEqual(["itar"]);
    expect(r.pending?.changes.map((c) => c.policyId)).toEqual(["osha"]);
    expect(savedBindings().map((b: any) => b.policyId)).toEqual(["osha", "itar"]);
  });

  it("refuses unknown policies and inactive ones", async () => {
    agentWith([]);
    await expect(requestPolicyChanges({ orgId: "o1", agentId: "a1", actor, changes: [{ policyId: "nope", action: "add" }] })).rejects.toBeInstanceOf(PolicyChangeError);
    await expect(requestPolicyChanges({ orgId: "o1", agentId: "a1", actor, changes: [{ policyId: "old", action: "add" }] })).rejects.toThrow(/not active/);
  });
});

describe("deciding a policy change", () => {
  const approval = (extra: Record<string, unknown> = {}) => ({
    id: "ap-1", type: POLICY_CHANGE_APPROVAL_TYPE, objectId: "a1", organizationId: "o1",
    evidenceJson: {
      reason: "no longer needed", requesterLabel: "dev", requesterUserId: "u-dev",
      changes: [
        { policyId: "osha", policyName: "OSHA Safety", kind: "remove", from: "hard", to: null },
        { policyId: "pii", policyName: "No PII", kind: "weaker", from: "hard", to: "advisory" },
      ],
    },
    ...extra,
  }) as any;

  it("approved: removes and loosens as requested, audited with the approver", async () => {
    agentWith([{ policyId: "osha", enforcement: "hard" }, { policyId: "pii", enforcement: "hard" }]);
    await applyPolicyChangeDecision(approval(), "approved", "compliance-lead", "o1");
    expect(savedBindings()).toEqual([{ policyId: "pii", policyName: "No PII", enforcement: "advisory" }]);
    const audits = m.createAuditEvent.mock.calls.map((c: any[]) => c[0]);
    expect(audits.map((a: any) => a.action)).toEqual(["policy_binding_removed", "policy_binding_loosened"]);
    expect(audits[0].details).toMatch(/approved by compliance-lead/);
  });

  it("rejected: changes nothing", async () => {
    agentWith([{ policyId: "osha", enforcement: "hard" }]);
    await applyPolicyChangeDecision(approval(), "rejected", "compliance-lead", "o1");
    expect(m.updateAgent).not.toHaveBeenCalled();
  });

  it("the requester cannot decide their own request", () => {
    expect(selfApprovalRefusal(approval(), { label: "dev", userId: "u-dev" })).toMatch(/someone else/);
    expect(selfApprovalRefusal(approval(), { label: "someone", userId: "u-dev" })).toMatch(/someone else/);
    expect(selfApprovalRefusal(approval(), { label: "compliance-lead", userId: "u-cl" })).toBeNull();
    expect(selfApprovalRefusal(approval({ type: "memory_write" }), { label: "dev", userId: "u-dev" })).toBeNull();
  });
});

describe("PATCH /api/agents/:id cannot remove or loosen policies", () => {
  const current = [{ policyId: "osha", policyName: "OSHA Safety", enforcement: "hard" }];

  it("refuses a removal or a loosening, and points to the approval route", () => {
    expect(refusalForBindingPatch(current, [])).toMatch(/removes "OSHA Safety".*policy-changes/);
    expect(refusalForBindingPatch(current, [{ policyId: "osha", enforcement: "soft" }])).toMatch(/loosens "OSHA Safety"/);
  });

  it("allows adding and tightening", () => {
    expect(refusalForBindingPatch(current, [...current, { policyId: "itar", enforcement: "soft" }])).toBeNull();
    expect(refusalForBindingPatch([{ policyId: "osha", enforcement: "soft" }], [{ policyId: "osha", enforcement: "hard" }])).toBeNull();
  });
});
