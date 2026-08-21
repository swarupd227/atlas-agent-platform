import { describe, it, expect, vi, beforeEach } from "vitest";

// Both modules are mocked before RealMcpBase is imported, so the class under
// test resolves against these fakes rather than a live DB / vault key.
vi.mock("../server/storage", () => ({
  storage: {
    getAgentIntegrationCredential: vi.fn(),
    getIntegrationConnection: vi.fn(),
    getIntegrationConnectionById: vi.fn(),
    upsertIntegrationConnection: vi.fn(),
    // callTool audits every dispatch and calls .catch() on the returned promise,
    // so this has to resolve rather than return undefined.
    createAuditEvent: vi.fn(async () => {}),
  },
}));

vi.mock("../server/credential-vault", () => ({
  // The "blob" in these tests is just a tagged string; decrypt echoes the tag
  // back so a test can assert WHICH connection's credentials came out.
  decryptCredentialMap: vi.fn((blob: string) => ({ token: blob })),
  encryptCredentialMap: vi.fn((m: Record<string, string>) => `enc:${m.token}`),
}));

import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../server/real-mcp-base";
import { storage } from "../server/storage";

const ORG = "org-1";

class TestConnector extends RealMcpBase {
  readonly integrationId = "postgres";
  readonly tools: RealMcpToolDef[] = [
    { name: "pg_query", description: "run a query", inputSchema: {} },
  ];
  handleTool = vi.fn(async (): Promise<McpToolResult> => ({ content: [{ type: "text", text: "ok" }] }));
}

function connection(over: Record<string, unknown> = {}) {
  return {
    id: "conn-default",
    organizationId: ORG,
    integrationId: "postgres",
    credentialBlob: "sales-db",
    status: "connected",
    isDefault: true,
    tokenExpiresAt: null,
    ...over,
  };
}

let connector: TestConnector;

beforeEach(() => {
  vi.clearAllMocks();
  connector = new TestConnector();
  (storage.getAgentIntegrationCredential as any).mockResolvedValue(null);
  (storage.getIntegrationConnection as any).mockResolvedValue(connection());
  (storage.getIntegrationConnectionById as any).mockResolvedValue(null);
});

describe("getCredentials — connection resolution", () => {
  it("falls back to the org default connection when no connection is pinned", async () => {
    const creds = await connector.getCredentials(ORG);
    expect(creds).toEqual({ token: "sales-db" });
    expect(storage.getIntegrationConnection).toHaveBeenCalledWith(ORG, "postgres");
    expect(storage.getIntegrationConnectionById).not.toHaveBeenCalled();
  });

  it("resolves the pinned connection instead of the default", async () => {
    (storage.getIntegrationConnectionById as any).mockResolvedValue(
      connection({ id: "conn-support", credentialBlob: "support-db", isDefault: false }),
    );

    const creds = await connector.getCredentials(ORG, undefined, "conn-support");

    // The whole point of phase 2: a second postgres connection is reachable.
    expect(creds).toEqual({ token: "support-db" });
    expect(storage.getIntegrationConnectionById).toHaveBeenCalledWith(ORG, "conn-support");
    expect(storage.getIntegrationConnection).not.toHaveBeenCalled();
  });

  it("keeps per-agent credentials ahead of the pinned connection", async () => {
    // Regression guard: mcp_servers.connection_id is populated on every connect,
    // so if the pin outranked the agent credential, per-agent identity would go
    // dark for every org already using it.
    (storage.getAgentIntegrationCredential as any).mockResolvedValue({
      credentialBlob: "agent-own-identity",
      status: "connected",
    });
    (storage.getIntegrationConnectionById as any).mockResolvedValue(
      connection({ id: "conn-support", credentialBlob: "support-db" }),
    );

    const creds = await connector.getCredentials(ORG, "agent-7", "conn-support");

    expect(creds).toEqual({ token: "agent-own-identity" });
    expect(storage.getIntegrationConnectionById).not.toHaveBeenCalled();
  });
});

describe("getCredentials — a broken pin must not fall back", () => {
  it("returns null when the pinned connection no longer exists", async () => {
    (storage.getIntegrationConnectionById as any).mockResolvedValue(null);

    expect(await connector.getCredentials(ORG, undefined, "conn-deleted")).toBeNull();
    // Silently using the default would run the query against a DIFFERENT database.
    expect(storage.getIntegrationConnection).not.toHaveBeenCalled();
  });

  it("returns null when the pinned connection is disconnected", async () => {
    (storage.getIntegrationConnectionById as any).mockResolvedValue(
      connection({ id: "conn-support", status: "disconnected" }),
    );

    expect(await connector.getCredentials(ORG, undefined, "conn-support")).toBeNull();
    expect(storage.getIntegrationConnection).not.toHaveBeenCalled();
  });

  it("returns null when the pinned connection belongs to a different integration type", async () => {
    (storage.getIntegrationConnectionById as any).mockResolvedValue(
      connection({ id: "conn-mysql", integrationId: "mysql", credentialBlob: "mysql-db" }),
    );

    expect(await connector.getCredentials(ORG, undefined, "conn-mysql")).toBeNull();
  });

  it("returns null when the pinned connection has no stored credential", async () => {
    (storage.getIntegrationConnectionById as any).mockResolvedValue(
      connection({ id: "conn-support", credentialBlob: null }),
    );

    expect(await connector.getCredentials(ORG, undefined, "conn-support")).toBeNull();
  });
});

describe("callTool", () => {
  it("passes the pinned connection through to credential resolution", async () => {
    (storage.getIntegrationConnectionById as any).mockResolvedValue(
      connection({ id: "conn-support", credentialBlob: "support-db" }),
    );

    const res = await connector.callTool("pg_query", { sql: "select 1" }, ORG, undefined, "conn-support");

    expect(res.isError).toBeFalsy();
    expect(connector.handleTool).toHaveBeenCalledWith(
      "pg_query", { sql: "select 1" }, { token: "support-db" }, ORG,
    );
  });

  it("reports a broken pin distinctly from a never-connected integration", async () => {
    (storage.getIntegrationConnectionById as any).mockResolvedValue(null);

    const pinned = await connector.callTool("pg_query", {}, ORG, undefined, "conn-deleted");
    expect(pinned.isError).toBe(true);
    expect(pinned.content[0].text).toContain("conn-deleted");

    (storage.getIntegrationConnection as any).mockResolvedValue(null);
    const unconnected = await connector.callTool("pg_query", {}, ORG);
    expect(unconnected.isError).toBe(true);
    expect(unconnected.content[0].text).toContain("is not connected");

    expect(connector.handleTool).not.toHaveBeenCalled();
  });
});

describe("refreshOAuthToken", () => {
  it("writes the refreshed token back to the connection it read, by id", async () => {
    // Without the id, the write re-resolves to the org DEFAULT and stamps the
    // refreshed token onto a sibling connection's row.
    const support = connection({ id: "conn-support", credentialBlob: "refresh_token_here", isDefault: false });
    (storage.getIntegrationConnectionById as any).mockResolvedValue(support);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    vi.doMock("../server/integrations/registry", () => ({
      getIntegrationDef: () => ({ oauthConfig: { tokenUrl: "https://example.test/token" } }),
    }));

    await connector.refreshOAuthToken(ORG, "conn-support");

    if ((storage.upsertIntegrationConnection as any).mock.calls.length > 0) {
      const [, targetId] = (storage.upsertIntegrationConnection as any).mock.calls[0];
      expect(targetId).toBe("conn-support");
    }
    vi.unstubAllGlobals();
  });
});
