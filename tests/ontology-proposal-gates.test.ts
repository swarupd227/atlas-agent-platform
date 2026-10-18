/**
 * The propose_ontology_concept tool through the shared dispatcher. It only FILES A REQUEST
 * that a person must approve, so it is exempt from the allow-lists that predate it (an agent
 * with a tool allowlist would otherwise silently lose it), exactly as the skill and memory
 * tools are. Two things must still hold: an explicit block that names it wins, and a shadow
 * run must not file requests.
 *
 * The tool's own behaviour is covered in agent-ontology-proposals.test.ts; here it is
 * replaced so the gates can be seen on their own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createAuditEvent: vi.fn().mockResolvedValue({}),
    getAgent: vi.fn().mockResolvedValue({ id: "agent-1", name: "Test Agent", riskTier: "HIGH", autonomyMode: "supervised", organizationId: null }),
    getAarConfig: vi.fn().mockResolvedValue(null),
    createAarActionDecision: vi.fn().mockResolvedValue({}),
    createApproval: vi.fn().mockResolvedValue({ id: "approval-1" }),
    getLatestApprovalDecision: vi.fn().mockResolvedValue(undefined),
    getMcpServer: vi.fn().mockResolvedValue(null),
    getMcpServerTools: vi.fn().mockResolvedValue([]),
    listAgentTaskClasses: vi.fn().mockResolvedValue([]),
    getActiveWarrant: vi.fn().mockResolvedValue(undefined),
    getAgentTeamMembers: vi.fn().mockResolvedValue([]),
    getSkillsByIds: vi.fn().mockResolvedValue([]),
    updateSkill: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../server/mcp-client", () => ({
  isRealMcpServer: vi.fn().mockReturnValue(false),
  mcpListTools: vi.fn().mockResolvedValue([]),
  mcpCallTool: vi.fn(),
}));
vi.mock("../server/routes/helpers", () => ({ resolvePolicyBundle: vi.fn() }));

const executeProposal = vi.hoisted(() => vi.fn());
vi.mock("../server/builtin-ontology-proposal-tools", () => ({
  isBuiltinOntologyProposalTool: (t: { serverId: string }) => t.serverId === "builtin:ontology-proposals",
  executeBuiltinOntologyProposalTool: executeProposal,
}));

import { dispatchToolCall, type AvailableTool } from "../server/tool-dispatcher";
import { storage } from "../server/storage";

const PROPOSE_TOOL: AvailableTool = {
  serverId: "builtin:ontology-proposals",
  serverName: "Ontology proposals",
  serverUrl: "",
  toolName: "propose_ontology_concept",
  toolDescription: "Propose a concept",
  toolInputSchema: { type: "object", properties: { action: { type: "string" } }, required: ["action"] },
};

const emptyBundle = () => ({
  appliedPolicies: [] as any[], blockedTools: [] as string[], toolAllowlist: [] as string[], monitorBlockedTools: [] as string[],
  blockedToolsToPolicyIds: {} as Record<string, string[]>, redactPatterns: [] as string[], guardrails: [] as string[],
}) as any;

const ARGS = { action: "create", label: "Self-Insured Excess", category: "Term", description: "The excess an insured bears on a single loss before the policy pays." };
const call = (over: Record<string, unknown> = {}) =>
  dispatchToolCall({ agentId: "agent-1", orgId: "org-a", tool: PROPOSE_TOOL, args: ARGS, policyBundle: emptyBundle(), traceId: "run-7", ...over } as any);

beforeEach(() => {
  executeProposal.mockReset().mockResolvedValue({ ok: true, status: "pending_approval", approvalId: "approval-1" });
  vi.mocked(storage.getAarConfig).mockResolvedValue(null);
});

describe("the propose_ontology_concept tool through dispatchToolCall", () => {
  it("runs, and is given the org, the agent and the run it came from", async () => {
    const res = await call();
    expect(res.outcome).toBe("success");
    expect(executeProposal).toHaveBeenCalledWith("propose_ontology_concept", ARGS, { orgId: "org-a", agentId: "agent-1", runId: "run-7" });
  });

  it("is not refused by a skill allowlist, a policy allowlist or an AAR allowlist that predate it", async () => {
    const bundle = emptyBundle();
    bundle.toolAllowlist = ["create_ticket"];
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: [], allowedTools: ["create_ticket"], requireApprovalTools: [] } as any);
    const res = await call({ policyBundle: bundle, skillAllowlist: new Set(["create_ticket"]) });
    expect(res.outcome).toBe("success");
    expect(executeProposal).toHaveBeenCalled();
  });

  it("is not asked to wait for an AAR approval, even for a high-risk supervised agent: its own approval is the gate", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: [], allowedTools: [], requireApprovalTools: ["propose_ontology_concept"] } as any);
    expect((await call()).outcome).toBe("success");
  });

  it("is not refused by a scope the run declared before it wanted to propose a concept", async () => {
    expect((await call({ declaredScope: new Set(["create_ticket"]) })).outcome).toBe("success");
  });

  it("is still refused by a policy that blocks it by name, and never runs", async () => {
    const bundle = emptyBundle();
    bundle.blockedTools = ["propose_ontology_concept"];
    expect((await call({ policyBundle: bundle })).outcome).toBe("gate_blocked_policy");
    expect(executeProposal).not.toHaveBeenCalled();
  });

  it("is still refused by an AAR deny that names it", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: ["propose_ontology_concept"], allowedTools: [], requireApprovalTools: [] } as any);
    expect((await call()).outcome).toBe("gate_blocked_aar");
    expect(executeProposal).not.toHaveBeenCalled();
  });

  it("does not run in a shadow run: a shadow run must not file requests", async () => {
    expect((await call({ shadow: true })).outcome).toBe("shadow_skipped");
    expect(executeProposal).not.toHaveBeenCalled();
  });

  it("an identical proposal in one run is deduplicated, not filed twice", async () => {
    const scope = `scope-${Math.random()}`;
    expect((await call({ idempotencyScope: scope })).outcome).toBe("success");
    expect((await call({ idempotencyScope: scope })).outcome).toBe("deduplicated");
    expect(executeProposal).toHaveBeenCalledTimes(1);
  });
});
