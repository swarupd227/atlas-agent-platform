/**
 * The search_history tool through the shared dispatcher. It only READS this agent's own earlier runs, so
 * it is exempt from the allow-lists that predate it (an agent with a tool allowlist would otherwise
 * silently lose it), as read_skill is. Unlike the proposal tools it is NOT skipped in a shadow run: a
 * shadow run that got "[DRY RUN]" in place of what the live run saw would be comparing different things.
 * An explicit policy or AAR block that names it still refuses it. It is a read, so the dispatcher does
 * not deduplicate it the way it does a side-effectful call.
 *
 * The tool's own behaviour is covered in history-search.test.ts; here it is replaced so the gates can
 * be seen on their own.
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

const executeSearch = vi.hoisted(() => vi.fn());
vi.mock("../server/builtin-history-tools", () => ({
  isBuiltinHistoryTool: (t: { serverId: string }) => t.serverId === "builtin:history",
  executeBuiltinHistoryTool: executeSearch,
}));

import { dispatchToolCall, type AvailableTool } from "../server/tool-dispatcher";
import { storage } from "../server/storage";

const SEARCH_TOOL: AvailableTool = {
  serverId: "builtin:history",
  serverName: "History search",
  serverUrl: "",
  toolName: "search_history",
  toolDescription: "Search your own earlier runs",
  toolInputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

const emptyBundle = () => ({
  appliedPolicies: [] as any[], blockedTools: [] as string[], toolAllowlist: [] as string[], monitorBlockedTools: [] as string[],
  blockedToolsToPolicyIds: {} as Record<string, string[]>, redactPatterns: [] as string[], guardrails: [] as string[],
}) as any;

const ARGS = { query: "canary rollout" };
const call = (over: Record<string, unknown> = {}) =>
  dispatchToolCall({ agentId: "agent-1", orgId: "org-a", tool: SEARCH_TOOL, args: ARGS, policyBundle: emptyBundle(), traceId: "run-7", ...over } as any);

beforeEach(() => {
  executeSearch.mockReset().mockResolvedValue({ ok: true, found: 0, results: [] });
  vi.mocked(storage.getAarConfig).mockResolvedValue(null);
});

describe("the search_history tool through dispatchToolCall", () => {
  it("runs, and is given the org and the agent the dispatcher knows (the model's arguments do not carry them)", async () => {
    const res = await call();
    expect(res.outcome).toBe("success");
    expect(executeSearch).toHaveBeenCalledWith("search_history", ARGS, { orgId: "org-a", agentId: "agent-1" });
  });

  it("is not refused by a skill allowlist, a policy allowlist or an AAR allowlist that predate it", async () => {
    const bundle = emptyBundle();
    bundle.toolAllowlist = ["create_ticket"];
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: [], allowedTools: ["create_ticket"], requireApprovalTools: [] } as any);
    const res = await call({ policyBundle: bundle, skillAllowlist: new Set(["create_ticket"]) });
    expect(res.outcome).toBe("success");
    expect(executeSearch).toHaveBeenCalled();
  });

  it("is not asked to wait for an AAR approval, even for a high-risk supervised agent", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: [], allowedTools: [], requireApprovalTools: ["search_history"] } as any);
    expect((await call()).outcome).toBe("success");
  });

  it("is not refused by a scope the run declared before it wanted to look back", async () => {
    expect((await call({ declaredScope: new Set(["create_ticket"]) })).outcome).toBe("success");
  });

  it("is still refused by a policy that blocks it by name, and never runs", async () => {
    const bundle = emptyBundle();
    bundle.blockedTools = ["search_history"];
    expect((await call({ policyBundle: bundle })).outcome).toBe("gate_blocked_policy");
    expect(executeSearch).not.toHaveBeenCalled();
  });

  it("is still refused by an AAR deny that names it", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: ["search_history"], allowedTools: [], requireApprovalTools: [] } as any);
    expect((await call()).outcome).toBe("gate_blocked_aar");
    expect(executeSearch).not.toHaveBeenCalled();
  });

  it("DOES run in a shadow run: it only reads, and a dry run would hide what the live run saw", async () => {
    const res = await call({ shadow: true });
    expect(res.outcome).toBe("success");
    expect(executeSearch).toHaveBeenCalledTimes(1);
  });

  it("is a read, so the dispatcher does not deduplicate it: the same search twice runs twice and sees fresh data", async () => {
    const scope = `scope-${Math.random()}`;
    expect((await call({ idempotencyScope: scope })).outcome).toBe("success");
    expect((await call({ idempotencyScope: scope })).outcome).toBe("success");
    expect(executeSearch).toHaveBeenCalledTimes(2);
  });

  it("the redacted args kept for logs apply the policy's patterns to the query", async () => {
    const bundle = emptyBundle();
    bundle.redactPatterns = ["\\d{3}-\\d{2}-\\d{4}"];
    const res = await call({ policyBundle: bundle, args: { query: "claim 123-45-6789" } });
    expect(res.redactedArgs.query).toBe("claim [REDACTED]");
  });
});
