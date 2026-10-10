/**
 * The memory tool through the shared dispatcher. It only FILES A REQUEST that a
 * person must approve, so it is exempt from the allow-lists that predate it (an
 * agent with a tool allowlist would otherwise silently lose it), exactly as
 * read_skill is. Two things must still hold: an explicit block that names it
 * wins, and a shadow run must not file requests.
 *
 * The tool's own behaviour is covered in agent-memory.test.ts; here it is
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

const executeMemory = vi.hoisted(() => vi.fn());
vi.mock("../server/builtin-memory-tools", () => ({
  BUILTIN_MEMORY_SERVER_ID: "builtin:memory",
  isBuiltinMemoryTool: (t: { serverId: string }) => t.serverId === "builtin:memory",
  executeBuiltinMemoryTool: executeMemory,
}));

import { dispatchToolCall, type AvailableTool } from "../server/tool-dispatcher";
import { storage } from "../server/storage";

const MEMORY_TOOL: AvailableTool = {
  serverId: "builtin:memory",
  serverName: "Memory",
  serverUrl: "",
  toolName: "memory",
  toolDescription: "Propose a note",
  toolInputSchema: { type: "object", properties: { action: { type: "string" } }, required: ["action"] },
};

const emptyBundle = () => ({
  appliedPolicies: [] as any[], blockedTools: [] as string[], toolAllowlist: [] as string[], monitorBlockedTools: [] as string[],
  blockedToolsToPolicyIds: {} as Record<string, string[]>, redactPatterns: [] as string[], guardrails: [] as string[],
}) as any;

const call = (over: Record<string, unknown> = {}) =>
  dispatchToolCall({ agentId: "agent-1", orgId: "org-a", tool: MEMORY_TOOL, args: { action: "add", content: "A fact." }, policyBundle: emptyBundle(), traceId: "run-7", ...over } as any);

beforeEach(() => {
  executeMemory.mockReset().mockResolvedValue({ ok: true, status: "pending_approval", approvalId: "approval-1" });
  vi.mocked(storage.getAarConfig).mockResolvedValue(null);
});

describe("the memory tool through dispatchToolCall", () => {
  it("runs, and is given the org, the agent and the run it came from", async () => {
    const res = await call();
    expect(res.outcome).toBe("success");
    expect(executeMemory).toHaveBeenCalledWith("memory", { action: "add", content: "A fact." }, { orgId: "org-a", agentId: "agent-1", runId: "run-7" });
  });

  it("is not refused by a skill allowlist, a policy allowlist or an AAR allowlist that predate it", async () => {
    const bundle = emptyBundle();
    bundle.toolAllowlist = ["create_ticket"];
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: [], allowedTools: ["create_ticket"], requireApprovalTools: [] } as any);
    const res = await call({ policyBundle: bundle, skillAllowlist: new Set(["create_ticket"]) });
    expect(res.outcome).toBe("success");
    expect(executeMemory).toHaveBeenCalled();
  });

  it("is not asked to wait for an AAR approval, even for a high-risk supervised agent: its own approval is the gate", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: [], allowedTools: [], requireApprovalTools: ["memory"] } as any);
    const res = await call();
    expect(res.outcome).toBe("success");
  });

  it("is not refused by a scope the run declared before it wanted to keep a note", async () => {
    const res = await call({ declaredScope: new Set(["create_ticket"]) });
    expect(res.outcome).toBe("success");
  });

  it("is still refused by a policy that blocks it by name, and never runs", async () => {
    const bundle = emptyBundle();
    bundle.blockedTools = ["memory"];
    const res = await call({ policyBundle: bundle });
    expect(res.outcome).toBe("gate_blocked_policy");
    expect(executeMemory).not.toHaveBeenCalled();
  });

  it("is still refused by an AAR deny that names it", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: ["memory"], allowedTools: [], requireApprovalTools: [] } as any);
    const res = await call();
    expect(res.outcome).toBe("gate_blocked_aar");
    expect(executeMemory).not.toHaveBeenCalled();
  });

  it("does not run in a shadow run: a shadow run must not file requests", async () => {
    const res = await call({ shadow: true });
    expect(res.outcome).toBe("shadow_skipped");
    expect(executeMemory).not.toHaveBeenCalled();
  });

  it("an identical proposal in one run is deduplicated, not filed twice", async () => {
    const scope = `scope-${Math.random()}`;
    const first = await call({ idempotencyScope: scope });
    const second = await call({ idempotencyScope: scope });
    expect(first.outcome).toBe("success");
    expect(second.outcome).toBe("deduplicated");
    expect(executeMemory).toHaveBeenCalledTimes(1);
  });
});
