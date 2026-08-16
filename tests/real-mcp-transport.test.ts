/**
 * Authorization boundary for the real-MCP-protocol connector route
 * (server/real-mcp-transport.ts). Storage is mocked -- no DB required.
 *
 * The behavior under test: a leaked/misused agent API key can only reach the
 * specific MCP servers its own agent was explicitly granted via "Assign MCP
 * Server", never any org integration ambiently. This is the last line of
 * defense after authMiddleware's own auth/scope check.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getMcpServerByIntegrationId: vi.fn(),
    getAgentMcpServers: vi.fn(),
  },
}));

import { isAgentAuthorizedForIntegration } from "../server/real-mcp-transport";
import { storage } from "../server/storage";

const mockGetServer = storage.getMcpServerByIntegrationId as ReturnType<typeof vi.fn>;
const mockGetAgentServers = storage.getAgentMcpServers as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetServer.mockReset();
  mockGetAgentServers.mockReset();
});

describe("isAgentAuthorizedForIntegration", () => {
  it("authorizes when the agent is linked to this integration's mcp_servers row", async () => {
    mockGetServer.mockResolvedValue({ id: "server-1", integrationId: "postgres" });
    mockGetAgentServers.mockResolvedValue([{ id: "link-1", agentId: "agent-1", serverId: "server-1" }]);
    await expect(isAgentAuthorizedForIntegration("agent-1", "postgres")).resolves.toBe(true);
  });

  it("rejects when the agent is linked to a different server (not this integration)", async () => {
    mockGetServer.mockResolvedValue({ id: "server-1", integrationId: "postgres" });
    mockGetAgentServers.mockResolvedValue([{ id: "link-1", agentId: "agent-1", serverId: "server-OTHER" }]);
    await expect(isAgentAuthorizedForIntegration("agent-1", "postgres")).resolves.toBe(false);
  });

  it("rejects when the agent has no MCP server links at all", async () => {
    mockGetServer.mockResolvedValue({ id: "server-1", integrationId: "postgres" });
    mockGetAgentServers.mockResolvedValue([]);
    await expect(isAgentAuthorizedForIntegration("agent-1", "postgres")).resolves.toBe(false);
  });

  it("fails closed when this integration has no registered mcp_servers row", async () => {
    mockGetServer.mockResolvedValue(undefined);
    await expect(isAgentAuthorizedForIntegration("agent-1", "postgres")).resolves.toBe(false);
    expect(mockGetAgentServers).not.toHaveBeenCalled();
  });

  it("does not authorize a different agent's link to the same server", async () => {
    mockGetServer.mockResolvedValue({ id: "server-1", integrationId: "postgres" });
    mockGetAgentServers.mockResolvedValue([]); // agent-2 has no links of its own
    await expect(isAgentAuthorizedForIntegration("agent-2", "postgres")).resolves.toBe(false);
    expect(mockGetAgentServers).toHaveBeenCalledWith("agent-2");
  });
});
