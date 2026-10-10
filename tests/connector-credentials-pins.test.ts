/**
 * What the connector credential stores do TODAY, pinned before they learn to keep secrets anywhere else
 * (server/credential-store.ts): the connection, per-agent connection and OAuth app rows, how a connector call finds
 * its credentials, and how an OAuth token is refreshed and written back.
 *
 * These use the real vault, the real storage code and a column-aware stand-in database (tests/support/fake-drizzle.ts),
 * so a sibling row, another organization's row or the wrong connection shows up as a wrong answer. With no external
 * secret store configured every one of them must keep passing unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./support/fake-drizzle";

// The mocked module may be built once and kept across vi.resetModules(), so the db it hands out looks the current
// fake up on every call instead of capturing one.
vi.mock("../server/connector-connection-test", () => ({
  testConnectionHealth: (...args: any[]) => (globalThis as any).__pinsHealth(...args),
}));

vi.mock("../server/db", async () => {
  const { makeFakeDb } = await import("./support/fake-drizzle");
  const G = globalThis as any;
  G.__pinsFake ??= makeFakeDb();
  const live = () => (globalThis as any).__pinsFake.db;
  const db = new Proxy({}, { get: (_t, prop) => (...args: any[]) => live()[prop](...args) });
  return { pool: {}, db };
});

const fake = (): FakeDb => (globalThis as any).__pinsFake;
const resetFake = () => { (globalThis as any).__pinsFake = makeFakeDb(); };

const ENV_KEYS = ["INTEGRATION_VAULT_KEY", "ASTRA_SECRETS_MANAGER_PREFIX", "OAUTH_MSGRAPH_CLIENT_ID", "OAUTH_MSGRAPH_CLIENT_SECRET", "ASTRA_OUTBOUND_POLICY"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

beforeEach(() => {
  vi.resetModules();
  resetFake();
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.INTEGRATION_VAULT_KEY = "connector-pins-test-vault-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const load = async () => {
  const vault = await import("../server/credential-vault");
  const { storage } = await import("../server/storage");
  return { vault, storage: storage as any };
};
const blobOf = (vault: any, map: Record<string, string>) => vault.encryptCredentialMap(map);
const conn = (storage: any, over: Record<string, unknown> = {}) =>
  storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", ...over });

describe("integration connections", () => {
  it("a first save creates the default connection and keeps the blob exactly as given", async () => {
    const { vault, storage } = await load();
    const blob = blobOf(vault, { access_token: "T1" });
    const row = await conn(storage, { credentialBlob: blob });
    expect(row.isDefault).toBe(true);
    expect(row.credentialBlob).toBe(blob);
    expect(fake().rows("integration_connections").length).toBe(1);
  });

  it("a second save for the same type updates that row, not another, and leaves other organizations alone", async () => {
    const { vault, storage } = await load();
    await conn(storage, { organizationId: "org-2", credentialBlob: blobOf(vault, { access_token: "OTHER-ORG" }) });
    await conn(storage, { credentialBlob: blobOf(vault, { access_token: "T1" }) });
    const second = blobOf(vault, { access_token: "T2" });
    await conn(storage, { credentialBlob: second });
    const mine = fake().rows("integration_connections").filter((r) => r.organizationId === "org-1");
    expect(mine.length).toBe(1);
    expect(mine[0].credentialBlob).toBe(second);
    expect(vault.decryptCredentialMap(fake().rows("integration_connections").find((r) => r.organizationId === "org-2").credentialBlob).access_token).toBe("OTHER-ORG");
  });

  it("a save naming a connection updates that connection and not its default sibling", async () => {
    const { vault, storage } = await load();
    const a = await conn(storage, { name: "A", credentialBlob: blobOf(vault, { access_token: "A1" }) });
    const b = await storage.createIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", name: "B", credentialBlob: blobOf(vault, { access_token: "B1" }), status: "connected" });
    expect(b.isDefault).toBe(false);
    await storage.upsertIntegrationConnection({ ...b, credentialBlob: blobOf(vault, { access_token: "B2" }) }, b.id);
    const rows = fake().rows("integration_connections");
    expect(vault.decryptCredentialMap(rows.find((r) => r.id === a.id).credentialBlob).access_token).toBe("A1");
    expect(vault.decryptCredentialMap(rows.find((r) => r.id === b.id).credentialBlob).access_token).toBe("B2");
  });

  it("disconnecting one connection empties its blob only; disconnecting the type empties every connection of the type in that organization only", async () => {
    const { vault, storage } = await load();
    const blob = () => blobOf(vault, { access_token: "x" });
    const a = await conn(storage, { credentialBlob: blob() });
    const b = await storage.createIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", credentialBlob: blob(), status: "connected" });
    const slack = await conn(storage, { integrationId: "slack", credentialBlob: blob() });
    const other = await conn(storage, { organizationId: "org-2", credentialBlob: blob() });

    await storage.disconnectIntegration("org-1", "msgraph", b.id);
    const by = (id: string) => fake().rows("integration_connections").find((r) => r.id === id);
    expect(by(b.id).credentialBlob).toBeNull();
    expect(by(b.id).status).toBe("disconnected");
    expect(by(a.id).credentialBlob).not.toBeNull();

    await storage.disconnectIntegration("org-1", "msgraph");
    expect(by(a.id).credentialBlob).toBeNull();
    expect(by(slack.id).credentialBlob).not.toBeNull();
    expect(by(other.id).credentialBlob).not.toBeNull();
  });

  it("deleting a connection removes that row only, is scoped to the organization, and says whether it found one", async () => {
    const { vault, storage } = await load();
    const a = await conn(storage, { credentialBlob: blobOf(vault, { access_token: "x" }) });
    expect(await storage.deleteIntegrationConnection("org-2", a.id)).toBe(false);
    expect(fake().rows("integration_connections").length).toBe(1);
    expect(await storage.deleteIntegrationConnection("org-1", a.id)).toBe(true);
    expect(fake().rows("integration_connections").length).toBe(0);
  });

  it("recording a test result touches the status columns and leaves the blob alone", async () => {
    const { vault, storage } = await load();
    const blob = blobOf(vault, { access_token: "x" });
    const a = await conn(storage, { credentialBlob: blob });
    await storage.recordIntegrationTestResult(a.id, false, "nope");
    const row = fake().rows("integration_connections")[0];
    expect(row.credentialBlob).toBe(blob);
    expect(row.lastTestResult).toBe("error");
    expect(row.status).toBe("error");
  });
});

describe("per-agent connections", () => {
  const base = { agentId: "agent-1", integrationId: "msgraph", status: "connected" };

  it("saves, finds by (agent, integration), updates in place and deletes only that pair", async () => {
    const { vault, storage } = await load();
    const one = blobOf(vault, { access_token: "A1" });
    await storage.upsertAgentIntegrationCredential({ ...base, credentialBlob: one });
    await storage.upsertAgentIntegrationCredential({ ...base, agentId: "agent-2", credentialBlob: blobOf(vault, { access_token: "OTHER-AGENT" }) });
    expect((await storage.getAgentIntegrationCredential("agent-1", "msgraph")).credentialBlob).toBe(one);

    const two = blobOf(vault, { access_token: "A2" });
    await storage.upsertAgentIntegrationCredential({ ...base, credentialBlob: two });
    expect(fake().rows("agent_integration_credentials").filter((r) => r.agentId === "agent-1").length).toBe(1);
    expect((await storage.getAgentIntegrationCredential("agent-1", "msgraph")).credentialBlob).toBe(two);

    await storage.deleteAgentIntegrationCredential("agent-1", "msgraph");
    expect(await storage.getAgentIntegrationCredential("agent-1", "msgraph")).toBeNull();
    expect(await storage.getAgentIntegrationCredential("agent-2", "msgraph")).not.toBeNull();
  });
});

describe("organization OAuth apps", () => {
  it("a save without a secret keeps the stored secret; a value replaces it; null clears it", async () => {
    const { vault, storage } = await load();
    const secret = blobOf(vault, { client_secret: "S1" });
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "cid", clientSecretEncrypted: secret, tenantId: "t" });
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "cid-2", tenantId: "t" });
    let row = fake().rows("integration_oauth_apps")[0];
    expect(row.clientId).toBe("cid-2");
    expect(row.clientSecretEncrypted).toBe(secret);

    const replaced = blobOf(vault, { client_secret: "S2" });
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "cid-2", clientSecretEncrypted: replaced });
    row = fake().rows("integration_oauth_apps")[0];
    expect(row.clientSecretEncrypted).toBe(replaced);

    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "cid-2", clientSecretEncrypted: null });
    expect(fake().rows("integration_oauth_apps")[0].clientSecretEncrypted).toBeNull();
    expect(fake().rows("integration_oauth_apps").length).toBe(1);
  });

  it("deleting removes that (organization, integration) only and says whether it found one", async () => {
    const { storage } = await load();
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "a" });
    await storage.upsertIntegrationOAuthApp("org-2", "msgraph", { clientId: "b" });
    expect(await storage.deleteIntegrationOAuthApp("org-1", "msgraph")).toBe(true);
    expect(await storage.deleteIntegrationOAuthApp("org-1", "msgraph")).toBe(false);
    expect(fake().rows("integration_oauth_apps").map((r) => r.organizationId)).toEqual(["org-2"]);
  });
});

describe("resolveOAuthApp", () => {
  it("the organization's own app wins and its secret is read from the vault", async () => {
    const { vault, storage } = await load();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "org-id", clientSecretEncrypted: blobOf(vault, { client_secret: "org-secret" }), tenantId: "tenant-9" });
    const { resolveOAuthApp } = await import("../server/integrations/oauth-app");
    expect(await resolveOAuthApp("org-1", "msgraph")).toEqual({ clientId: "org-id", clientSecret: "org-secret", tenantId: "tenant-9", source: "organization" });
  });

  it("an organization with no app of its own gets the environment's, and one with neither gets 'none'", async () => {
    const { resolveOAuthApp } = await import("../server/integrations/oauth-app");
    expect((await resolveOAuthApp("org-1", "msgraph")).source).toBe("none");
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    expect(await resolveOAuthApp("org-1", "msgraph")).toEqual({ clientId: "env-id", clientSecret: "env-secret", source: "environment" });
  });

  it("an app saved with no secret resolves to an empty secret, still the organization's", async () => {
    const { storage } = await load();
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "org-id" });
    const { resolveOAuthApp } = await import("../server/integrations/oauth-app");
    expect(await resolveOAuthApp("org-1", "msgraph")).toMatchObject({ clientId: "org-id", clientSecret: "", source: "organization" });
  });

  it("a secret the vault cannot read is treated as unset (as before), not an error", async () => {
    const { storage } = await load();
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "org-id", clientSecretEncrypted: "garbage-not-a-blob" });
    const { resolveOAuthApp } = await import("../server/integrations/oauth-app");
    expect(await resolveOAuthApp("org-1", "msgraph")).toMatchObject({ clientId: "org-id", clientSecret: "", source: "organization" });
  });
});

describe("RealMcpBase: finding the credentials for a call", () => {
  const makeProbe = async (integrationId = "msgraph") => {
    const { RealMcpBase } = await import("../server/real-mcp-base");
    class P extends (RealMcpBase as any) {
      integrationId = integrationId;
      tools = [{ name: "ping", description: "", inputSchema: {} }];
      seen: any[] = [];
      async handleTool(name: string, args: any, creds: any, orgId: string) {
        this.seen.push({ name, args, creds, orgId });
        if (args.boom) throw new Error("kaboom");
        return (this as any).ok("pong");
      }
    }
    return new (P as any)() as any;
  };

  const seedConn = async (storage: any, vault: any, creds: Record<string, string> | null, over: Record<string, unknown> = {}) =>
    conn(storage, { credentialBlob: creds ? blobOf(vault, creds) : null, ...over });

  it("an organization connection is found by type and decrypted", async () => {
    const { vault, storage } = await load();
    await seedConn(storage, vault, { access_token: "ORG" });
    expect(await (await makeProbe()).getCredentials("org-1")).toEqual({ access_token: "ORG" });
  });

  it("another organization's connection is never returned", async () => {
    const { vault, storage } = await load();
    await seedConn(storage, vault, { access_token: "THEIRS" }, { organizationId: "org-2" });
    expect(await (await makeProbe()).getCredentials("org-1")).toBeNull();
  });

  it("an agent's own credential outranks the organization's, and a disconnected one does not", async () => {
    const { vault, storage } = await load();
    await seedConn(storage, vault, { access_token: "ORG" });
    await storage.upsertAgentIntegrationCredential({ agentId: "agent-1", integrationId: "msgraph", status: "connected", credentialBlob: blobOf(vault, { access_token: "AGENT" }) });
    const p = await makeProbe();
    expect(await p.getCredentials("org-1", "agent-1")).toEqual({ access_token: "AGENT" });
    expect(await p.getCredentials("org-1", "agent-2")).toEqual({ access_token: "ORG" });
    await storage.upsertAgentIntegrationCredential({ agentId: "agent-1", integrationId: "msgraph", status: "disconnected", credentialBlob: blobOf(vault, { access_token: "AGENT" }) });
    expect(await p.getCredentials("org-1", "agent-1")).toEqual({ access_token: "ORG" });
  });

  it("an agent credential the vault cannot read falls through to the organization's (as before)", async () => {
    const { vault, storage } = await load();
    await seedConn(storage, vault, { access_token: "ORG" });
    await storage.upsertAgentIntegrationCredential({ agentId: "agent-1", integrationId: "msgraph", status: "connected", credentialBlob: "garbage-not-a-blob" });
    expect(await (await makeProbe()).getCredentials("org-1", "agent-1")).toEqual({ access_token: "ORG" });
  });

  it("a pinned connection is used even when it is not the default, and never falls back to the default when it is missing", async () => {
    const { vault, storage } = await load();
    await seedConn(storage, vault, { access_token: "DEFAULT" }, { name: "A" });
    const b = await storage.createIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", name: "B", credentialBlob: blobOf(vault, { access_token: "PINNED" }), status: "connected" });
    const p = await makeProbe();
    expect(await p.getCredentials("org-1", undefined, b.id)).toEqual({ access_token: "PINNED" });
    expect(await p.getCredentials("org-1", undefined, "no-such-id")).toBeNull();
  });

  it("a pinned connection of a different integration type resolves to nothing", async () => {
    const { vault, storage } = await load();
    const s = await seedConn(storage, vault, { access_token: "SLACK" }, { integrationId: "slack" });
    await seedConn(storage, vault, { access_token: "DEFAULT" });
    expect(await (await makeProbe()).getCredentials("org-1", undefined, s.id)).toBeNull();
  });

  it("a disconnected connection, one with no blob and one the vault cannot read all resolve to nothing", async () => {
    const { vault, storage } = await load();
    const p = await makeProbe();
    const c = await seedConn(storage, vault, { access_token: "x" }, { status: "disconnected" });
    expect(await p.getCredentials("org-1")).toBeNull();
    await storage.disconnectIntegration("org-1", "msgraph", c.id);
    expect(await p.getCredentials("org-1")).toBeNull();
    await storage.upsertIntegrationConnection({ ...c, credentialBlob: "garbage-not-a-blob", status: "connected" }, c.id);
    expect(await p.getCredentials("org-1")).toBeNull();
  });

  it("callTool: says which of the two ways a call can have no credentials, and passes the decrypted ones to the tool", async () => {
    const { vault, storage } = await load();
    const p = await makeProbe();
    const none = await p.callTool("ping", {}, "org-1");
    expect(none.isError).toBe(true);
    expect(none.content[0].text).toBe("Integration 'msgraph' is not connected for this organization.");
    const pinned = await p.callTool("ping", {}, "org-1", undefined, "gone");
    expect(pinned.content[0].text).toContain("has no usable connection 'gone'");

    await seedConn(storage, vault, { access_token: "ORG", region: "eu" });
    const ok = await p.callTool("ping", { a: 1 }, "org-1");
    expect(ok.isError).toBeUndefined();
    expect(p.seen.at(-1)).toMatchObject({ name: "ping", args: { a: 1 }, orgId: "org-1", creds: { access_token: "ORG", region: "eu" } });

    const failed = await p.callTool("ping", { boom: true }, "org-1");
    expect(failed.isError).toBe(true);
    expect(failed.content[0].text).toBe("Tool 'ping' failed: kaboom");
  });

  describe("refreshing an OAuth token", () => {
    const tokenReply = (body: any, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as any);

    it("posts the stored refresh token with the organization's app, and writes the new tokens back to the same connection, merged with what was there", async () => {
      const { vault, storage } = await load();
      await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "org-id", clientSecretEncrypted: blobOf(vault, { client_secret: "org-secret" }), tenantId: "tenant-9" });
      const a = await seedConn(storage, vault, { access_token: "OLD", refresh_token: "R1", region: "eu" }, { name: "A" });
      const b = await storage.createIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", name: "B", status: "connected", credentialBlob: blobOf(vault, { access_token: "B-OLD", refresh_token: "RB", region: "us" }) });
      const f = tokenReply({ access_token: "NEW", expires_in: 3600 });
      vi.stubGlobal("fetch", f);

      const out = await (await makeProbe()).refreshOAuthToken("org-1", b.id);
      expect(out).toEqual({ access_token: "NEW", refresh_token: "RB", region: "us", token_type: "Bearer" });

      const [url, init] = f.mock.calls[0] as any;
      expect(url).toContain("login.microsoftonline.com/tenant-9/");
      const sent = new URLSearchParams(init.body);
      expect(Object.fromEntries(sent)).toEqual({ grant_type: "refresh_token", refresh_token: "RB", client_id: "org-id", client_secret: "org-secret" });

      const rows = fake().rows("integration_connections");
      expect(vault.decryptCredentialMap(rows.find((r) => r.id === b.id).credentialBlob)).toEqual(out);
      expect(rows.find((r) => r.id === b.id).tokenExpiresAt).toBeInstanceOf(Date);
      expect(vault.decryptCredentialMap(rows.find((r) => r.id === a.id).credentialBlob).access_token).toBe("OLD");
    });

    it("a rotated refresh token replaces the old one; one not sent keeps the old one", async () => {
      const { vault, storage } = await load();
      process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
      await seedConn(storage, vault, { access_token: "OLD", refresh_token: "R1" });
      vi.stubGlobal("fetch", tokenReply({ access_token: "N1", refresh_token: "R2" }));
      expect((await (await makeProbe()).refreshOAuthToken("org-1"))?.refresh_token).toBe("R2");
      vi.stubGlobal("fetch", tokenReply({ access_token: "N2" }));
      expect((await (await makeProbe()).refreshOAuthToken("org-1"))?.refresh_token).toBe("R2");
    });

    it("a refusal by the provider, an error body, or no refresh token returns null and writes nothing", async () => {
      const { vault, storage } = await load();
      process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
      const c = await seedConn(storage, vault, { access_token: "OLD", refresh_token: "R1" });
      const before = fake().rows("integration_connections")[0].credentialBlob;
      const p = await makeProbe();
      vi.stubGlobal("fetch", tokenReply({}, false));
      expect(await p.refreshOAuthToken("org-1")).toBeNull();
      vi.stubGlobal("fetch", tokenReply({ error: "invalid_grant" }));
      expect(await p.refreshOAuthToken("org-1")).toBeNull();
      expect(fake().rows("integration_connections")[0].credentialBlob).toBe(before);

      await storage.upsertIntegrationConnection({ ...c, credentialBlob: blobOf(vault, { access_token: "OLD" }) }, c.id);
      const f = tokenReply({ access_token: "N" }); vi.stubGlobal("fetch", f);
      expect(await p.refreshOAuthToken("org-1")).toBeNull();
      expect(f).not.toHaveBeenCalled();
    });

    it("an integration with no OAuth configuration returns null without calling anyone", async () => {
      const { vault, storage } = await load();
      await seedConn(storage, vault, { access_token: "x", refresh_token: "r" }, { integrationId: "jira" });
      const f = tokenReply({ access_token: "N" }); vi.stubGlobal("fetch", f);
      const { getIntegrationDef } = await import("../server/integrations/registry");
      expect(getIntegrationDef("jira")?.oauthConfig).toBeUndefined();
      expect(await (await makeProbe("jira")).refreshOAuthToken("org-1")).toBeNull();
      expect(f).not.toHaveBeenCalled();
    });
  });
});

describe("Salesforce refreshes against the right endpoint and writes back to the connection", () => {
  const tokenReply = (body: any) => vi.fn(async () => ({ ok: true, json: async () => body }) as any);

  it("a sandbox connection refreshes at test.salesforce.com, keeps what it had, takes a new instance_url, and is written back vault-encrypted", async () => {
    const { vault, storage } = await load();
    process.env.OAUTH_SALESFORCE_CLIENT_ID = "sf-id"; process.env.OAUTH_SALESFORCE_CLIENT_SECRET = "sf-secret";
    try {
      const c = await conn(storage, { integrationId: "salesforce", credentialBlob: blobOf(vault, { access_token: "OLD", refresh_token: "R1", sandbox: "true", instance_url: "https://old.example" }) });
      const f = tokenReply({ access_token: "NEW", instance_url: "https://new.example", expires_in: 7200 });
      vi.stubGlobal("fetch", f);
      const { SalesforceMcpServer } = await import("../server/integrations/salesforce/mcp-server");
      const out = await new SalesforceMcpServer().refreshOAuthToken("org-1");
      expect(out).toEqual({ access_token: "NEW", refresh_token: "R1", sandbox: "true", instance_url: "https://new.example", token_type: "Bearer" });
      expect((f.mock.calls[0] as any)[0]).toBe("https://test.salesforce.com/services/oauth2/token");
      expect(Object.fromEntries(new URLSearchParams((f.mock.calls[0] as any)[1].body))).toMatchObject({ client_id: "sf-id", client_secret: "sf-secret", refresh_token: "R1" });
      const row = fake().rows("integration_connections").find((r) => r.id === c.id);
      expect(vault.decryptCredentialMap(row.credentialBlob)).toEqual(out);
      expect(row.tokenExpiresAt).toBeInstanceOf(Date);
    } finally { delete process.env.OAUTH_SALESFORCE_CLIENT_ID; delete process.env.OAUTH_SALESFORCE_CLIENT_SECRET; }
  });

  it("a refusal returns null and writes nothing", async () => {
    const { vault, storage } = await load();
    process.env.OAUTH_SALESFORCE_CLIENT_ID = "sf-id"; process.env.OAUTH_SALESFORCE_CLIENT_SECRET = "sf-secret";
    try {
      const blob = blobOf(vault, { access_token: "OLD", refresh_token: "R1" });
      await conn(storage, { integrationId: "salesforce", credentialBlob: blob });
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as any));
      const { SalesforceMcpServer } = await import("../server/integrations/salesforce/mcp-server");
      expect(await new SalesforceMcpServer().refreshOAuthToken("org-1")).toBeNull();
      expect(fake().rows("integration_connections")[0].credentialBlob).toBe(blob);
    } finally { delete process.env.OAUTH_SALESFORCE_CLIENT_ID; delete process.env.OAUTH_SALESFORCE_CLIENT_SECRET; }
  });
});

describe("the connector health scan's own connection test", () => {
  it("tests with the decrypted credentials and records the result; says the credentials cannot be read when they cannot; skips a disconnected one", async () => {
    const { vault, storage } = await load();
    const seen: any[] = [];
    (globalThis as any).__pinsHealth = async (...a: any[]) => { seen.push(a); return { ok: true, status: "ok", latencyMs: 3 }; };
    const c = await conn(storage, { integrationId: "postgres", credentialBlob: blobOf(vault, { host: "h", password: "pw" }) });
    const { vendorConnectionTest } = await import("../server/connector-health-scan");

    const good = await vendorConnectionTest("postgres", "org-1", c.id);
    expect(seen[0][1]).toEqual({ host: "h", password: "pw" });
    expect(good.probed).toBe(true);
    expect(fake().rows("integration_connections")[0].lastTestResult).toBe("ok");

    await storage.upsertIntegrationConnection({ ...c, credentialBlob: "garbage-not-a-blob" }, c.id);
    const bad = await vendorConnectionTest("postgres", "org-1", c.id);
    expect(bad).toMatchObject({ healthy: false, probed: true });
    expect(bad.detail).toContain("cannot be read");

    await storage.disconnectIntegration("org-1", "postgres", c.id);
    const none = await vendorConnectionTest("postgres", "org-1", c.id);
    expect(none.probed).toBe(false);
    expect(seen.length).toBe(1);
  });
});
