/**
 * Unit tests for the policy decision point (server/policy-decision.ts) -- what
 * the characterization matrix cannot cover because today's dispatcher has no
 * such behaviour: the arg-level policy_rule gate, the one rate limiter, the
 * bundle's blockRules, the mapping to dispatcher fields, and the read-only deps.
 * Parity with today's dispatcher is tests/pdp-decide-parity.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createAuditEvent: vi.fn(),
    getAgent: vi.fn(),
    getAarConfig: vi.fn(),
    createAarActionDecision: vi.fn(),
    createApproval: vi.fn(),
    getLatestApprovalDecision: vi.fn(),
    getMcpServer: vi.fn(),
    listAgentTaskClasses: vi.fn(),
    getActiveWarrant: vi.fn(),
    getPolicies: vi.fn(),
  },
}));
vi.mock("../server/approval-risk-shadow", () => ({ shadowApprovalRisk: vi.fn() }));

import {
  decide, enforce, applyEffects, toDispatchFields, readOnlyPdpDeps, resetPdpRateLimits, matchesPolicyRule,
  type PdpRequest,
} from "../server/policy-decision";
import { resolvePolicyBundle } from "../server/routes/helpers";
import { storage } from "../server/storage";
import type { AvailableTool } from "../server/tool-dispatcher";

const m = vi.mocked(storage as any);
const TOOL: AvailableTool = {
  serverId: "srv-1", serverName: "Ticketing", serverUrl: "http://localhost:9999", toolName: "create_ticket",
  toolDescription: "Creates a ticket", toolInputSchema: {}, toolEndpoint: "/tickets", toolMethod: "POST",
};
const SKILL_READ: AvailableTool = { serverId: "builtin:skills", serverName: "Skills", serverUrl: "", toolName: "read_skill", toolDescription: "", toolInputSchema: {} };

const bundle = (over: Record<string, unknown> = {}) => ({
  appliedPolicies: [], blockedTools: [], toolAllowlist: [], monitorBlockedTools: [], blockedToolsToPolicyIds: {},
  redactPatterns: [], guardrails: [], blockRules: [], agentConfig: null, ...over,
}) as any;
const rule = (r: Record<string, unknown>, policyId = "pol-r1") => ({ policyId, policyName: "Claims Limits", rule: { block: true, ...r } });
const req = (over: Partial<PdpRequest["ctx"]> = {}, tool = TOOL, args: Record<string, unknown> = { priority: "P1", amount: 1200 }, agentId = "agent-1"): PdpRequest => ({
  actor: { kind: "native", agentId, orgId: "org-1" }, tool, args, ctx: { policyBundle: bundle(), traceId: "t-1", iteration: 1, ...over },
});

beforeEach(() => {
  for (const fn of Object.values(storage as any)) vi.mocked(fn as any).mockReset();
  m.getAgent.mockResolvedValue({ id: "agent-1", name: "Claims Agent", riskTier: "MEDIUM", autonomyMode: "autonomous", organizationId: "org-1" });
  m.getAarConfig.mockResolvedValue(null);
  m.listAgentTaskClasses.mockResolvedValue([]);
  m.getMcpServer.mockResolvedValue(null);
  m.createAuditEvent.mockResolvedValue({});
  m.createAarActionDecision.mockResolvedValue({});
  m.createApproval.mockResolvedValue({ id: "approval-9" });
  resetPdpRateLimits();
  delete process.env.ASTRA_LOCKDOWN;
});

describe("policy_rule gate (arg-level block rules)", () => {
  it("blocks by tool name, names the policy, and audits a hard violation with the organization", async () => {
    const d = await enforce(req({ policyBundle: bundle({ blockRules: [rule({ name: "no-tickets", condition: { toolName: "create_ticket" } })] }) }));
    expect(d).toMatchObject({ decision: "BLOCK", gate: "policy_rule", outcome: "gate_blocked_policy", policyIds: ["pol-r1"], rulesTriggered: ["no-tickets"] });
    const ev = m.createAuditEvent.mock.calls.map((c: any[]) => c[0]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ action: "hard_violation", organizationId: "org-1" });
    expect(JSON.parse(ev[0].details)).toMatchObject({ enforcementMode: "rule", rule: { policyId: "pol-r1", name: "no-tickets" } });
    expect(m.getAarConfig).not.toHaveBeenCalled(); // decided before the AAR lists
  });

  it("matches a tool-name array, an arg value, and compares args as strings", () => {
    expect(matchesPolicyRule({ condition: { toolName: ["a", "create_ticket"] } }, "create_ticket", {})).toBe(true);
    expect(matchesPolicyRule({ condition: { toolName: "create_ticket", args: { priority: "P1" } } }, "create_ticket", { priority: "P1" })).toBe(true);
    expect(matchesPolicyRule({ condition: { toolName: "create_ticket", args: { priority: "P1" } } }, "create_ticket", { priority: "P3" })).toBe(false);
    expect(matchesPolicyRule({ condition: { args: { amount: "1200" } } }, "create_ticket", { amount: 1200 })).toBe(true);
    expect(matchesPolicyRule({ condition: { toolName: "delete_ticket" } }, "create_ticket", {})).toBe(false);
    expect(matchesPolicyRule({}, "anything", {})).toBe(true);
  });

  it("an arg rule that does not match lets the call through", async () => {
    const d = await decide(req({ policyBundle: bundle({ blockRules: [rule({ name: "no-p1", condition: { args: { priority: "P1" } } })] }) }, TOOL, { priority: "P3" }));
    expect(d).toMatchObject({ decision: "ALLOW", gate: null, outcome: "passed" });
  });

  it("an unconditional rule blocks an ordinary tool but not a built-in skill read", async () => {
    const b = bundle({ blockRules: [rule({ name: "freeze" })] });
    expect((await decide(req({ policyBundle: b }))).gate).toBe("policy_rule");
    expect((await decide(req({ policyBundle: b }, SKILL_READ))).outcome).toBe("passed");
  });

  it("a rule that names a built-in tool still blocks it, like any explicit block", async () => {
    const d = await decide(req({ policyBundle: bundle({ blockRules: [rule({ name: "no-skills", condition: { toolName: "read_skill" } })] }) }, SKILL_READ));
    expect(d.gate).toBe("policy_rule");
  });

  it("a strict bundle block is decided before a rule", async () => {
    const d = await decide(req({ policyBundle: bundle({ blockedTools: ["create_ticket"], blockRules: [rule({ name: "no-tickets" })] }) }));
    expect(d.gate).toBe("policy_bundle");
  });

  it("a rule block beats AAR require-approval: no approval is filed", async () => {
    m.getAarConfig.mockResolvedValue({ allowedTools: [], deniedTools: [], requireApprovalTools: ["create_ticket"] });
    const d = await enforce(req({ policyBundle: bundle({ blockRules: [rule({ name: "no-tickets" })] }) }));
    expect(d.gate).toBe("policy_rule");
    expect(m.createApproval).not.toHaveBeenCalled();
  });

  it("keeps the monitor flag when a rule then blocks", async () => {
    const d = await decide(req({ policyBundle: bundle({ monitorBlockedTools: ["create_ticket"], blockRules: [rule({ name: "no-tickets" })] }) }));
    expect(d).toMatchObject({ gate: "policy_rule", monitorFlagged: true });
    expect(toDispatchFields(d).monitorFlagged).toBe(true);
  });
});

describe("one rate limiter", () => {
  it("defaults to 100 a burst: the 101st enforced call is limited", async () => {
    for (let i = 0; i < 100; i++) expect((await enforce(req())).outcome).toBe("passed");
    const d = await enforce(req());
    expect(d).toMatchObject({ decision: "BLOCK", gate: "rate_limit", outcome: "rate_limited" });
  });

  it("decide() only peeks: 150 decisions consume nothing", async () => {
    for (let i = 0; i < 150; i++) await decide(req());
    for (let i = 0; i < 100; i++) expect((await enforce(req())).outcome).toBe("passed");
  });

  it("aarConfig.rateLimits sets the bucket, globally and per tool", async () => {
    m.getAarConfig.mockResolvedValue({ rateLimits: { requestsPerMinute: 1, burstCapacity: 2 } });
    expect((await enforce(req())).outcome).toBe("passed");
    expect((await enforce(req())).outcome).toBe("passed");
    expect((await enforce(req())).outcome).toBe("rate_limited");
    m.getAarConfig.mockResolvedValue({ rateLimits: { requestsPerMinute: 600, burstCapacity: 50, create_ticket: { requestsPerMinute: 1, burstCapacity: 1 } } });
    expect((await enforce(req({}, TOOL, {}, "agent-2"))).outcome).toBe("passed");
    expect((await enforce(req({}, TOOL, {}, "agent-2"))).outcome).toBe("rate_limited");
  });

  it("a call refused by an earlier gate spends no token", async () => {
    m.getAarConfig.mockResolvedValue({ deniedTools: ["create_ticket"], rateLimits: { requestsPerMinute: 1, burstCapacity: 1 } });
    for (let i = 0; i < 5; i++) expect((await enforce(req())).outcome).toBe("gate_blocked_aar");
    m.getAarConfig.mockResolvedValue({ deniedTools: [], rateLimits: { requestsPerMinute: 1, burstCapacity: 1 } });
    expect((await enforce(req())).outcome).toBe("passed");
  });
});

describe("resolvePolicyBundle().blockRules", () => {
  it("collects block rules from the agent's own active policies only", async () => {
    m.getAgent.mockResolvedValue({ id: "agent-1", organizationId: "org-1", policyBindings: [] });
    const blockA = { name: "a", condition: { toolName: "create_ticket" }, block: true };
    m.getPolicies.mockResolvedValue([
      { id: "p-own", name: "Own", status: "active", scopeType: "agent", scopeId: "agent-1", policyJson: { rules: [blockA, { name: "watch", block: false }, { name: "b", block: true }] } },
      { id: "p-draft", name: "Draft", status: "draft", scopeType: "agent", scopeId: "agent-1", policyJson: { rules: [{ name: "c", block: true }] } },
      { id: "p-org", name: "Org-wide", status: "active", scopeType: "org", scopeId: "org-1", policyJson: { rules: [{ name: "d", block: true }] } },
      { id: "p-other", name: "Other agent", status: "active", scopeType: "agent", scopeId: "agent-2", policyJson: { rules: [{ name: "e", block: true }] } },
      { id: "p-norules", name: "No rules", status: "active", scopeType: "agent", scopeId: "agent-1", policyJson: { blockedTools: ["x"] } },
    ]);
    const b = await resolvePolicyBundle("agent-1", "org-1");
    expect(b.blockRules).toEqual([
      { policyId: "p-own", policyName: "Own", rule: blockA },
      { policyId: "p-own", policyName: "Own", rule: { name: "b", block: true } },
    ]);
  });
});

describe("mapping and effects", () => {
  it("a passed decision carries only the monitor flag; an early refusal carries none", async () => {
    expect(toDispatchFields(await decide(req()))).toEqual({ outcome: "passed", monitorFlagged: false });
    const f = toDispatchFields(await decide(req({ skillAllowlist: new Set(["other"]) })));
    expect(f).toMatchObject({ outcome: "gate_blocked_skill" });
    expect("monitorFlagged" in f).toBe(false);
  });

  it("a failed read is a named, audited block with the caller's organization", async () => {
    m.getAgent.mockRejectedValue(new Error("db down"));
    const d = await enforce(req());
    expect(toDispatchFields(d)).toEqual({ outcome: "gate_blocked_pdp_error", reason: "Policy could not be evaluated: db down", error: "Policy could not be evaluated: db down" });
    expect(m.createAuditEvent.mock.calls[0][0]).toMatchObject({ action: "tool_blocked_pdp_error", organizationId: "org-1" });
  });

  it("applyEffects files the approval and links the AAR row to it", async () => {
    m.getAarConfig.mockResolvedValue({ allowedTools: [], deniedTools: [], requireApprovalTools: ["create_ticket"] });
    const d = await decide(req());
    expect(d.approvalId).toBeUndefined();
    const applied = await applyEffects(d, req());
    expect(applied.approvalId).toBe("approval-9");
    expect(m.createApproval.mock.calls[0][0]).toMatchObject({ agentId: "agent-1", organizationId: "org-1", riskScore: 0.65 });
    expect(m.createAarActionDecision.mock.calls[0][0]).toMatchObject({ decision: "REQUIRE_APPROVAL", approvalId: "approval-9" });
  });

  it("readOnlyPdpDeps refuses every write", async () => {
    const ro = readOnlyPdpDeps();
    await expect(ro.createAuditEvent({} as any)).rejects.toThrow(/read-only/);
    await expect(ro.createApproval({} as any)).rejects.toThrow(/read-only/);
    await expect(ro.createAarActionDecision({} as any)).rejects.toThrow(/read-only/);
    await expect(ro.shadowApprovalRisk({} as any)).rejects.toThrow(/read-only/);
  });
});
