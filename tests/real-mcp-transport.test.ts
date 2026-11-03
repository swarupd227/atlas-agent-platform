/**
 * The real-MCP-protocol connector route (server/real-mcp-transport.ts).
 * Storage, the policy bundle and the dispatcher are mocked -- no DB required.
 *
 * Two boundaries are under test:
 * - which mcp_servers row an agent key reaches: only one its own agent was
 *   linked to via "Assign MCP Server", in its organization, never any org
 *   integration ambiently;
 * - a tools/call from outside Astra goes through dispatchToolCall's gates
 *   (S0.3), never straight to the connector.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("../server/storage", () => ({
  storage: {
    getAgentMcpServers: vi.fn(),
    getMcpServer: vi.fn(),
    createAuditEvent: vi.fn(),
  },
}));
vi.mock("../server/routes/helpers", () => ({ resolvePolicyBundle: vi.fn() }));
vi.mock("../server/tool-dispatcher", () => ({ dispatchToolCall: vi.fn() }));

import { resolveAgentConnectorServer, callConnectorToolGoverned, toMcpToolResult, createMcpProtocolRouter } from "../server/real-mcp-transport";
import { RealMcpBase } from "../server/real-mcp-base";
import { storage } from "../server/storage";
import { resolvePolicyBundle } from "../server/routes/helpers";
import { dispatchToolCall } from "../server/tool-dispatcher";

const mockLinks = storage.getAgentMcpServers as ReturnType<typeof vi.fn>;
const mockServer = storage.getMcpServer as ReturnType<typeof vi.fn>;
const mockBundle = resolvePolicyBundle as ReturnType<typeof vi.fn>;
const mockDispatch = dispatchToolCall as ReturnType<typeof vi.fn>;

const ORG = "org-1";
const rows: Record<string, any> = {
  "pg-a": { id: "pg-a", name: "Postgres A", url: "https://x/api/integrations/postgres", integrationId: "postgres", organizationId: ORG, connectionId: "conn-a" },
  "pg-b": { id: "pg-b", name: "Postgres B", url: "https://x/api/integrations/postgres", integrationId: "postgres", organizationId: ORG, connectionId: "conn-b" },
  "pg-other-org": { id: "pg-other-org", name: "Postgres", url: "https://x/api/integrations/postgres", integrationId: "postgres", organizationId: "org-2", connectionId: "conn-z" },
  "pg-catalog": { id: "pg-catalog", name: "Postgres", url: "https://x/api/integrations/postgres", integrationId: "postgres", organizationId: null, connectionId: null },
  "mysql-a": { id: "mysql-a", name: "MySQL", url: "https://x/api/integrations/mysql", integrationId: "mysql", organizationId: ORG, connectionId: "conn-m" },
};
const linkTo = (...ids: string[]) => mockLinks.mockResolvedValue(ids.map((serverId, i) => ({ id: `link-${i}`, agentId: "agent-1", serverId })));

beforeEach(() => {
  mockLinks.mockReset();
  mockServer.mockReset().mockImplementation(async (id: string) => rows[id]);
  mockBundle.mockReset().mockResolvedValue({ blockedTools: [], toolAllowlist: [], appliedPolicies: [] });
  mockDispatch.mockReset();
});

describe("resolveAgentConnectorServer", () => {
  it("returns the row the agent is linked to for this integration", async () => {
    linkTo("mysql-a", "pg-b");
    await expect(resolveAgentConnectorServer("agent-1", "postgres", ORG)).resolves.toEqual({ server: rows["pg-b"] });
  });

  it("refuses an agent linked only to another integration", async () => {
    linkTo("mysql-a");
    await expect(resolveAgentConnectorServer("agent-1", "postgres", ORG)).resolves.toMatchObject({ status: 403 });
  });

  it("refuses an agent with no links", async () => {
    linkTo();
    await expect(resolveAgentConnectorServer("agent-1", "postgres", ORG)).resolves.toMatchObject({ status: 403 });
  });

  it("refuses a linked row owned by another organization", async () => {
    linkTo("pg-other-org");
    await expect(resolveAgentConnectorServer("agent-1", "postgres", ORG)).resolves.toMatchObject({ status: 403 });
  });

  it("accepts a platform catalog row (no organization)", async () => {
    linkTo("pg-catalog");
    await expect(resolveAgentConnectorServer("agent-1", "postgres", ORG)).resolves.toEqual({ server: rows["pg-catalog"] });
  });

  it("refuses two linked rows for one integration, since the URL cannot say which connection", async () => {
    linkTo("pg-a", "pg-b");
    await expect(resolveAgentConnectorServer("agent-1", "postgres", ORG)).resolves.toMatchObject({ status: 409 });
  });

  it("reads the asking agent's own links", async () => {
    linkTo();
    await resolveAgentConnectorServer("agent-2", "postgres", ORG);
    expect(mockLinks).toHaveBeenCalledWith("agent-2");
  });
});

describe("callConnectorToolGoverned", () => {
  const connectorResult = { content: [{ type: "text" as const, text: '{"rows":[{"n":1}]}' }] };
  const base = {
    tools: [{ name: "sql_execute_query", description: "Run SQL", inputSchema: { type: "object" } }],
    callTool: vi.fn(),
  } as any;
  const call = (name = "sql_execute_query") =>
    callConnectorToolGoverned(base, "postgres", rows["pg-b"], ORG, "agent-1", name, { sql: "select 1" });
  const dispatched = (over: Record<string, unknown>) => ({ ok: false, result: null, redactedArgs: {}, startedAt: "", completedAt: "", durationMs: 1, ...over });

  beforeEach(() => base.callTool.mockReset());

  it("dispatches through the gates with the agent's own row and connection", async () => {
    mockDispatch.mockResolvedValue(dispatched({ outcome: "success", ok: true, result: connectorResult }));
    await expect(call()).resolves.toEqual(connectorResult);
    expect(mockBundle).toHaveBeenCalledWith("agent-1", ORG);
    const req = mockDispatch.mock.calls[0][0];
    expect(req).toMatchObject({ agentId: "agent-1", orgId: ORG, args: { sql: "select 1" } });
    expect(req.policyBundle).toEqual(await mockBundle.mock.results[0].value);
    expect(req.tool).toMatchObject({ serverId: "pg-b", toolName: "sql_execute_query", enterpriseIntegration: "postgres", connectionId: "conn-b" });
  });

  it("never calls the connector itself", async () => {
    mockDispatch.mockResolvedValue(dispatched({ outcome: "success", ok: true, result: connectorResult }));
    await call();
    expect(base.callTool).not.toHaveBeenCalled();
  });

  it("returns a policy refusal as an MCP error carrying the gate's reason", async () => {
    const reason = 'Tool "sql_execute_query" is blocked by a strict/block-enforcement policy';
    mockDispatch.mockResolvedValue(dispatched({ outcome: "gate_blocked_policy", error: reason, reason }));
    await expect(call()).resolves.toEqual({ content: [{ type: "text", text: reason }], isError: true });
  });

  it("returns require-approval with the approval id", async () => {
    mockDispatch.mockResolvedValue(dispatched({ outcome: "gate_requires_approval", reason: "Needs a human", approvalId: "appr-9" }));
    const r = await call();
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("Approval required: Needs a human");
    expect(r.content[0].text).toContain("appr-9");
  });

  it("passes the connector's own error result through", async () => {
    const err = { content: [{ type: "text" as const, text: "relation does not exist" }], isError: true };
    mockDispatch.mockResolvedValue(dispatched({ outcome: "tool_error", result: err, error: "relation does not exist" }));
    await expect(call()).resolves.toEqual(err);
  });

  it("refuses an unknown tool without dispatching", async () => {
    const r = await call("drop_everything");
    expect(r.isError).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("refuses when the agent's policies cannot be read (fail-closed)", async () => {
    mockBundle.mockRejectedValue(new Error("db down"));
    const r = await call();
    expect(r.isError).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(base.callTool).not.toHaveBeenCalled();
  });
});

describe("toMcpToolResult", () => {
  it("names the outcome when a refusal carries no text", () => {
    const r = toMcpToolResult({ outcome: "rate_limited", ok: false, result: null, redactedArgs: {}, startedAt: "", completedAt: "", durationMs: 0 });
    expect(r).toEqual({ content: [{ type: "text", text: "Tool call refused (rate_limited)." }], isError: true });
  });
});

describe("the /mcp route", () => {
  const handlerFor = (method: "get" | "delete") => {
    const router = createMcpProtocolRouter({ tools: [] } as any, "probe") as any;
    const layer = router.stack.find((l: any) => l.route?.path === "/mcp" && l.route.methods[method]);
    return layer?.route.stack[0].handle;
  };

  it.each(["get", "delete"] as const)("answers %s with 405 and says POST is what it takes", (method) => {
    const res: any = { headers: {} as Record<string, string> };
    res.status = vi.fn(() => res);
    res.set = vi.fn((k: string, v: string) => { res.headers[k] = v; return res; });
    res.json = vi.fn(() => res);
    const handle = handlerFor(method);
    expect(handle, `no ${method} handler on /mcp`).toBeTypeOf("function");
    handle({}, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.headers.Allow).toBe("POST");
    expect(res.json.mock.calls[0][0]).toMatchObject({ jsonrpc: "2.0", id: null });
  });
});

describe("the connector's audit event", () => {
  class Probe extends RealMcpBase {
    readonly integrationId = "probe";
    readonly tools = [{ name: "ping", description: "", inputSchema: {} }];
    async handleTool() { return { content: [{ type: "text" as const, text: "ok" }] }; }
    protected async lookupCredentials() { return { credentials: {} }; }
  }
  const audit = storage.createAuditEvent as ReturnType<typeof vi.fn>;

  beforeEach(() => audit.mockReset().mockResolvedValue({}));

  it("names the agent that made the call", async () => {
    await new Probe().callTool("ping", {}, ORG, "agent-1");
    expect(audit.mock.calls[0][0]).toMatchObject({ actorType: "agent", actorId: "agent-1", action: "integration_tool_call" });
  });

  it("names the agent on a failed call too", async () => {
    const probe = new Probe();
    probe.handleTool = async () => ({ content: [{ type: "text" as const, text: "no" }], isError: true });
    await probe.callTool("ping", {}, ORG, "agent-1");
    expect(audit.mock.calls[0][0]).toMatchObject({ actorId: "agent-1", action: "integration_tool_error" });
  });
});

describe("the /mcp tools/call handler", () => {
  const src = readFileSync(join(__dirname, "..", "server", "real-mcp-transport.ts"), "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf("setRequestHandler(CallToolRequestSchema");
  const end = src.indexOf("new StreamableHTTPServerTransport(", start + 1);
  const handler = src.slice(start, end);

  it("is found", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
  });

  it("goes through the gates, not straight to the connector", () => {
    expect(handler).toContain("callConnectorToolGoverned(");
    expect(handler).not.toContain("base.callTool(");
  });
});
