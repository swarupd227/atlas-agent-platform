/**
 * Behavioral gate tests for the shared tool dispatcher.
 *
 * Verifies the safety property the dispatcher exists for: a refused tool call
 * must never reach execution (no fetch), and execution must receive RAW args
 * while logs receive REDACTED args. Storage and MCP client are mocked — no
 * DB or network required, so this runs in the deterministic CI unit-test job.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    createAuditEvent: vi.fn().mockResolvedValue({}),
    getAgent: vi.fn().mockResolvedValue({ id: "agent-1", name: "Test Agent", riskTier: "LOW", autonomyMode: "autonomous", organizationId: null }),
    getAarConfig: vi.fn().mockResolvedValue(null),
    createAarActionDecision: vi.fn().mockResolvedValue({}),
    createApproval: vi.fn().mockResolvedValue({ id: "approval-1" }),
    getMcpServer: vi.fn().mockResolvedValue(null),
    getMcpServerTools: vi.fn().mockResolvedValue([]),
    // Warrant gate: no task classes means the gate is a no-op, same as the
    // real default for every agent that hasn't defined coveredTools.
    listAgentTaskClasses: vi.fn().mockResolvedValue([]),
    getActiveWarrant: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../server/mcp-client", () => ({
  isRealMcpServer: vi.fn().mockReturnValue(false),
  mcpListTools: vi.fn().mockResolvedValue([]),
  mcpCallTool: vi.fn(),
}));
vi.mock("../server/routes/helpers", () => ({
  resolvePolicyBundle: vi.fn(),
}));

import { dispatchToolCall, type AvailableTool } from "../server/tool-dispatcher";
import { storage } from "../server/storage";

const TOOL: AvailableTool = {
  serverId: "srv-1",
  serverName: "Test Server",
  serverUrl: "http://localhost:9999",
  toolName: "create_ticket",
  toolDescription: "Creates a ticket",
  toolInputSchema: {},
  toolEndpoint: "/tickets",
  toolMethod: "POST",
};

const emptyBundle = () => ({
  appliedPolicies: [] as any[],
  blockedTools: [] as string[],
  toolAllowlist: [] as string[],
  monitorBlockedTools: [] as string[],
  blockedToolsToPolicyIds: {} as Record<string, string[]>,
  redactPatterns: [] as string[],
  guardrails: [] as string[],
}) as any;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ created: true }),
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(storage.createAuditEvent).mockClear();
});

describe("dispatchToolCall gates", () => {
  it("policy-blocked tool never executes and logs a hard violation", async () => {
    const bundle = emptyBundle();
    bundle.blockedTools = ["create_ticket"];
    bundle.blockedToolsToPolicyIds = { create_ticket: ["pol-7"] };

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "x" }, policyBundle: bundle });

    expect(res.outcome).toBe("gate_blocked_policy");
    expect(res.ok).toBe(false);
    expect(res.policyIds).toEqual(["pol-7"]);
    expect(fetchMock).not.toHaveBeenCalled();
    const auditActions = vi.mocked(storage.createAuditEvent).mock.calls.map(c => (c[0] as any).action);
    expect(auditActions).toContain("hard_violation");
  });

  it("allowlist miss blocks dispatch", async () => {
    const bundle = emptyBundle();
    bundle.toolAllowlist = ["some_other_tool"];

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: bundle });

    expect(res.outcome).toBe("gate_blocked_policy");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skill allowlist gate refuses ungranted tools", async () => {
    const res = await dispatchToolCall({
      agentId: "agent-1",
      tool: TOOL,
      args: {},
      policyBundle: emptyBundle(),
      skillAllowlist: new Set(["different_tool"]),
    });

    expect(res.outcome).toBe("gate_blocked_skill");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AAR denied-tools list blocks dispatch", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValueOnce({ deniedTools: ["create_ticket"], allowedTools: [], requireApprovalTools: [] } as any);

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("gate_blocked_aar");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AAR require-approval returns the approval id without executing", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValueOnce({ deniedTools: [], allowedTools: [], requireApprovalTools: ["create_ticket"] } as any);

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("gate_requires_approval");
    expect(res.approvalId).toBe("approval-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shadow environment logs a dry run and never executes", async () => {
    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "x" }, policyBundle: emptyBundle(), shadow: true });

    expect(res.outcome).toBe("shadow_skipped");
    expect(res.ok).toBe(false);
    expect((res.result as any).status).toBe("dry_run");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowed call really executes and returns the tool result", async () => {
    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "hello" }, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("success");
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ created: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("execution receives RAW args while redactedArgs is masked for logging", async () => {
    const bundle = emptyBundle();
    bundle.redactPatterns = ["secret-\\d+"];

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { note: "token secret-123 end" }, policyBundle: bundle });

    expect(res.outcome).toBe("success");
    expect(res.redactedArgs.note).toBe("token [REDACTED] end");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.note).toBe("token secret-123 end"); // raw args reach the API
  });

  it("execution failure is a tool_error, not a crash", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, headers: { get: () => "" }, text: async () => "bad gateway" });

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("tool_error");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("502");
  });
});

describe("warrant gate", () => {
  it("is a no-op when no task class covers this tool (the default for every existing agent)", async () => {
    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "x" }, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("success");
    expect(res.warrantDecision).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AAR block short-circuits before the warrant gate is ever reached", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValueOnce({ deniedTools: ["create_ticket"], allowedTools: [], requireApprovalTools: [] } as any);
    vi.mocked(storage.listAgentTaskClasses).mockClear();

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("gate_blocked_aar");
    expect(storage.listAgentTaskClasses).not.toHaveBeenCalled();
  });

  it("blocks when a covering task class has no active warrant (expired or never issued)", async () => {
    vi.mocked(storage.listAgentTaskClasses).mockResolvedValueOnce([
      { id: "tc-1", name: "Wire Release", coveredTools: ["create_ticket"] } as any,
    ]);

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("gate_blocked_warrant");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks when the active warrant explicitly denies", async () => {
    vi.mocked(storage.listAgentTaskClasses).mockResolvedValueOnce([
      { id: "tc-1", name: "Wire Release", coveredTools: ["create_ticket"] } as any,
    ]);
    vi.mocked(storage.getActiveWarrant).mockResolvedValueOnce({ id: "w-1", grants: "denied" } as any);

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("gate_blocked_warrant");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires approval when the active warrant grants requires_approval, without executing", async () => {
    vi.mocked(storage.listAgentTaskClasses).mockResolvedValueOnce([
      { id: "tc-1", name: "Wire Release", coveredTools: ["create_ticket"] } as any,
    ]);
    vi.mocked(storage.getActiveWarrant).mockResolvedValueOnce({ id: "w-1", grants: "requires_approval" } as any);

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("gate_requires_approval");
    expect(res.approvalId).toBe("approval-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stamps the task class's requiredReviewerRole onto the approval it creates", async () => {
    vi.mocked(storage.listAgentTaskClasses).mockResolvedValueOnce([
      { id: "tc-1", name: "Wire Release", coveredTools: ["create_ticket"], requiredReviewerRole: "ops_sre" } as any,
    ]);
    vi.mocked(storage.getActiveWarrant).mockResolvedValueOnce({ id: "w-1", grants: "requires_approval" } as any);
    vi.mocked(storage.createApproval).mockClear();

    await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(vi.mocked(storage.createApproval).mock.calls[0][0]).toMatchObject({ requiredReviewerRole: "ops_sre" });
  });

  it("leaves requiredReviewerRole undefined when the task class doesn't set one", async () => {
    vi.mocked(storage.listAgentTaskClasses).mockResolvedValueOnce([
      { id: "tc-1", name: "Wire Release", coveredTools: ["create_ticket"], requiredReviewerRole: null } as any,
    ]);
    vi.mocked(storage.getActiveWarrant).mockResolvedValueOnce({ id: "w-1", grants: "requires_approval" } as any);
    vi.mocked(storage.createApproval).mockClear();

    await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: {}, policyBundle: emptyBundle() });

    expect(vi.mocked(storage.createApproval).mock.calls[0][0].requiredReviewerRole).toBeUndefined();
  });

  it("allows and executes when the active warrant grants autonomous", async () => {
    vi.mocked(storage.listAgentTaskClasses).mockResolvedValueOnce([
      { id: "tc-1", name: "Wire Release", coveredTools: ["create_ticket"] } as any,
    ]);
    vi.mocked(storage.getActiveWarrant).mockResolvedValueOnce({ id: "w-1", grants: "autonomous" } as any);

    const res = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "x" }, policyBundle: emptyBundle() });

    expect(res.outcome).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a human-approved call proceeds past a requires_approval warrant, same bypass as AAR", async () => {
    vi.mocked(storage.listAgentTaskClasses).mockResolvedValueOnce([
      { id: "tc-1", name: "Wire Release", coveredTools: ["create_ticket"] } as any,
    ]);
    vi.mocked(storage.getActiveWarrant).mockResolvedValueOnce({ id: "w-1", grants: "requires_approval" } as any);

    const res = await dispatchToolCall({
      agentId: "agent-1",
      tool: TOOL,
      args: { title: "x" },
      policyBundle: emptyBundle(),
      humanApprovedApprovalId: "approval-99",
    });

    expect(res.outcome).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("idempotency for side-effectful calls", () => {
  it("identical side-effectful call in the same scope is deduplicated, not re-executed", async () => {
    const scope = `test-scope-${Math.random()}`;
    const args = { title: "duplicate me" };

    const first = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args, policyBundle: emptyBundle(), idempotencyScope: scope });
    const second = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args, policyBundle: emptyBundle(), idempotencyScope: scope });

    expect(first.outcome).toBe("success");
    expect(second.outcome).toBe("deduplicated");
    expect(second.ok).toBe(true);
    expect(second.result).toEqual(first.result); // cached result reused
    expect(fetchMock).toHaveBeenCalledTimes(1);  // the effect happened exactly once
  });

  it("different args or different scopes execute independently", async () => {
    const scope = `test-scope-${Math.random()}`;

    await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "a" }, policyBundle: emptyBundle(), idempotencyScope: scope });
    await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "b" }, policyBundle: emptyBundle(), idempotencyScope: scope });
    await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "a" }, policyBundle: emptyBundle(), idempotencyScope: `other-${Math.random()}` });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("read-only tools are never deduplicated", async () => {
    const scope = `test-scope-${Math.random()}`;
    const readTool = { ...TOOL, toolName: "get_ticket", toolMethod: "GET", toolEndpoint: "/tickets" };

    await dispatchToolCall({ agentId: "agent-1", tool: readTool, args: { id: "1" }, policyBundle: emptyBundle(), idempotencyScope: scope });
    await dispatchToolCall({ agentId: "agent-1", tool: readTool, args: { id: "1" }, policyBundle: emptyBundle(), idempotencyScope: scope });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a failed attempt is not cached — retry re-executes (at-least-once)", async () => {
    const scope = `test-scope-${Math.random()}`;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => "" }, text: async () => "boom" });

    const first = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "retry" }, policyBundle: emptyBundle(), idempotencyScope: scope });
    const second = await dispatchToolCall({ agentId: "agent-1", tool: TOOL, args: { title: "retry" }, policyBundle: emptyBundle(), idempotencyScope: scope });

    expect(first.outcome).toBe("tool_error");
    expect(second.outcome).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
