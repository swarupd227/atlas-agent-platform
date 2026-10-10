/**
 * Connector credentials with the external secret store (AWS Secrets Manager) switched on: connections, the
 * organization's OAuth app, the tokens an OAuth callback and the refresh daemon store, and the calls that read them.
 * tests/connector-credentials-pins.test.ts and tests/connector-routes-pins.test.ts pin the same behaviour with it off.
 *
 * The real routes, storage and AWS SDK run against a column-aware stand-in database (tests/support/fake-drizzle.ts)
 * and a stand-in Secrets Manager that speaks the real wire protocol (tests/support/mock-secrets-manager.ts).
 */
import express from "express";
import { getTableName } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./support/fake-drizzle";
import { startMockSecretsManager, type MockSecretsManager } from "./support/mock-secrets-manager";

vi.mock("../server/db", async () => {
  const { makeFakeDb } = await import("./support/fake-drizzle");
  const G = globalThis as any;
  G.__storePinsFake ??= makeFakeDb();
  const live = () => (globalThis as any).__storePinsFake.db;
  return { pool: {}, db: new Proxy({}, { get: (_t, prop) => (...args: any[]) => live()[prop](...args) }) };
});
vi.mock("../server/connector-connection-test", () => ({
  testConnectionHealth: (...args: any[]) => (globalThis as any).__storePinsHealth(...args),
}));
vi.mock("../server/connector-targets", async (orig) => ({
  ...(await orig<typeof import("../server/connector-targets")>()),
  vetConnectorCredentials: async () => ({ ok: true }),
}));

const G = globalThis as any;
const fake = (): FakeDb => G.__storePinsFake;
const TABLES = ["integration_connections", "integration_oauth_apps", "agent_integration_credentials", "mcp_server_auth"];
const ENV_KEYS = [
  "INTEGRATION_VAULT_KEY", "ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT",
  "ASTRA_SECRETS_MANAGER_CACHE_SECONDS", "ASTRA_SECRETS_MANAGER_KINDS", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "OAUTH_MSGRAPH_CLIENT_ID", "OAUTH_MSGRAPH_CLIENT_SECRET",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
const realFetch = globalThis.fetch;

let sm: MockSecretsManager;
let server: Server | null = null;
let base = "";
let healthCalls: any[][] = [];
let providerCalls: Array<{ url: string; body: Record<string, string> }> = [];
let providerReply: (body: Record<string, string>) => { ok?: boolean; json: any } = () => ({ json: {} });
let graphCalls: Array<{ url: string; auth: string | undefined }> = [];
let graphReply: (auth: string | undefined) => Response = () => new Response("{}", { status: 200 });

const storeEnv = (extra: Record<string, string> = {}) => {
  process.env.ASTRA_SECRETS_MANAGER_PREFIX = "astra/test/";
  process.env.ASTRA_SECRETS_MANAGER_REGION = sm.region;
  process.env.ASTRA_SECRETS_MANAGER_ENDPOINT = sm.endpoint;
  process.env.ASTRA_SECRETS_MANAGER_CACHE_SECONDS = "60";
  Object.assign(process.env, extra);
};

beforeEach(async () => {
  vi.resetModules();
  G.__storePinsFake = makeFakeDb({ strict: TABLES });
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.INTEGRATION_VAULT_KEY = "store-test-vault-key";
  process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE"; process.env.AWS_SECRET_ACCESS_KEY = "example-secret";
  sm = await startMockSecretsManager();
  storeEnv();
  healthCalls = [];
  G.__storePinsHealth = async (...args: any[]) => { healthCalls.push(args); return { ok: true, latencyMs: 5 }; };
  providerCalls = [];
  providerReply = () => ({ json: {} });
  graphCalls = [];
  graphReply = () => new Response("{}", { status: 200 });
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    if (String(url).startsWith("http://127.0.0.1")) return realFetch(url, init);
    if (String(url).includes("graph.microsoft.com/")) {
      const auth = init?.headers?.Authorization;
      graphCalls.push({ url: String(url), auth });
      return graphReply(auth);
    }
    const body = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    providerCalls.push({ url: String(url), body });
    const r = providerReply(body);
    return { ok: r.ok ?? true, status: r.ok === false ? 400 : 200, json: async () => r.json } as any;
  });
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  await sm.close();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

async function start() {
  const router = (await import("../server/routes/enterprise-integrations")).default;
  const admin = (await import("../server/routes/credential-store")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).authUser = { username: "tester", role: req.headers["x-test-role"] ?? "admin", organizationId: req.headers["x-organization-id"] };
    next();
  });
  app.use(router);
  app.use(admin);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  const vault = await import("../server/credential-vault");
  const { storage } = await import("../server/storage");
  return { vault, storage: storage as any };
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method, redirect: "manual",
    headers: { "content-type": "application/json", "x-organization-id": "org-1", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, location: res.headers.get("location"), text };
}

const rows = (table = "integration_connections") => fake().rows(table);
const PG = { host: "db.example.com", port: "5432", database: "sales", user: "app", password: "p@ss-1" };
const refOf = (blob: string) => JSON.parse(blob) as { v: number; store: string; name: string };
const secretOf = (name: string) => JSON.parse(sm.secrets.get(name)!.value);
const everythingInTheDatabase = () => JSON.stringify(fake().tables);
const live = () => [...sm.secrets.values()].filter((s) => !s.deletedAt);

const makeProbe = async (integrationId = "msgraph") => {
  const { RealMcpBase } = await import("../server/real-mcp-base");
  class P extends (RealMcpBase as any) {
    integrationId = integrationId;
    tools = [{ name: "ping", description: "", inputSchema: {} }];
    seen: any[] = [];
    async handleTool(name: string, args: any, creds: any) { this.seen.push({ name, args, creds }); return (this as any).ok("pong"); }
  }
  return new (P as any)() as any;
};

describe("connect, edit, test", () => {
  it("keeps the credentials in the store and only a reference in the database", async () => {
    await start();
    const res = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "Sales" });
    expect(res.status).toBe(200);
    const ref = refOf(rows()[0].credentialBlob);
    expect(ref).toMatchObject({ v: 2, store: "aws-sm" });
    expect(ref.name).toMatch(/^astra\/test\/connection\//);
    expect(secretOf(ref.name)).toEqual(PG);
    expect(everythingInTheDatabase()).not.toContain("p@ss-1");
    expect(healthCalls[0][1]).toEqual(PG);
    expect(rows()[0].lastTestResult).toBe("ok");
    expect(res.text).not.toContain("p@ss-1");
  });

  it("connecting again updates the same secret; a sibling gets its own", async () => {
    await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    const first = rows()[0].credentialBlob;
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: { ...PG, password: "second" } });
    expect(rows().length).toBe(1);
    expect(rows()[0].credentialBlob).toBe(first);
    expect(secretOf(refOf(first).name).password).toBe("second");
    expect(live().length).toBe(1);

    const sib = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: { ...PG, database: "support" }, name: "Support", createNew: true });
    expect(live().length).toBe(2);
    expect(refOf(rows().find((r) => r.id === sib.json.id).credentialBlob).name).not.toBe(refOf(first).name);
  });

  it("settings are read from the store and a change goes to the same secret; the secret fields never leave", async () => {
    await start();
    const c = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    const blob = rows()[0].credentialBlob;
    const got = await call("GET", `/api/enterprise-integrations/connections/${c.json.id}/config`);
    expect(got.json.values).toEqual({ host: PG.host, port: PG.port, database: PG.database, user: PG.user });

    healthCalls = [];
    expect((await call("PATCH", `/api/enterprise-integrations/connections/${c.json.id}/config`, { credentials: { database: "other" } })).status).toBe(200);
    expect(rows()[0].credentialBlob).toBe(blob);
    expect(secretOf(refOf(blob).name)).toEqual({ ...PG, database: "other" });
    expect(healthCalls[0][1]).toEqual({ ...PG, database: "other" });

    const hint = await call("GET", "/api/enterprise-integrations/postgres/credentials-hint");
    expect(hint.json.keys.map((k: any) => k.key).sort()).toEqual(Object.keys(PG).sort());
    expect(hint.text).not.toContain("p@ss-1");
    healthCalls = [];
    expect((await call("POST", "/api/enterprise-integrations/postgres/test")).json).toMatchObject({ ok: true });
    expect(healthCalls[0][1]).toEqual({ ...PG, database: "other" });
    expect((await call("POST", "/api/integrations/postgres/test")).json).toMatchObject({ ok: true });
  });

  it("a kind that is not switched on stays a vault blob and the store is never called", async () => {
    storeEnv({ ASTRA_SECRETS_MANAGER_KINDS: "mcp-auth" });
    const { vault } = await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    expect(vault.decryptCredentialMap(rows()[0].credentialBlob)).toEqual(PG);
    expect(sm.calls.length).toBe(0);
  });

  it("when the store refuses, nothing is saved and the answer is an error", async () => {
    await start();
    sm.deny.add("CreateSecret");
    const res = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    expect(res.status).toBe(500);
    expect(rows().length).toBe(0);
    expect(everythingInTheDatabase()).not.toContain("p@ss-1");
    expect(sm.secrets.size).toBe(0);
  });

  it("when the database write fails after the secret was made, the secret is removed, not left behind", async () => {
    await start();
    const db = fake().db, insert = db.insert;
    db.insert = (t: any) => { if (getTableName(t) === "integration_connections") throw new Error("db down"); return insert(t); };
    const res = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    db.insert = insert;
    expect(res.status).toBe(500);
    expect(sm.secrets.size).toBe(0);
    expect(rows().length).toBe(0);
  });

  it("a connection saved before the store was on becomes a reference the next time it is saved", async () => {
    const { vault, storage } = await start();
    await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "postgres", status: "connected", credentialBlob: vault.encryptCredentialMap(PG) });
    expect(rows()[0].credentialBlob).not.toContain("astra/");
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: { ...PG, password: "new" } });
    expect(rows().length).toBe(1);
    expect(refOf(rows()[0].credentialBlob).store).toBe("aws-sm");
    expect(secretOf(refOf(rows()[0].credentialBlob).name).password).toBe("new");
  });
});

describe("disconnect and delete let go of the secret", () => {
  it("disconnecting a type, and one connection, mark their secrets for deletion; a reconnect makes a new one", async () => {
    await start();
    const a = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "A" });
    const b = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "B", createNew: true });
    const nameA = refOf(rows().find((r) => r.id === a.json.id).credentialBlob).name;
    const nameB = refOf(rows().find((r) => r.id === b.json.id).credentialBlob).name;

    await call("POST", `/api/enterprise-integrations/connections/${b.json.id}/disconnect`);
    expect(sm.secrets.get(nameB)!.deletedAt).toBeInstanceOf(Date);
    expect(sm.secrets.get(nameA)!.deletedAt).toBeUndefined();
    expect(rows().find((r) => r.id === b.json.id).credentialBlob).toBeNull();

    await call("POST", "/api/enterprise-integrations/postgres/disconnect");
    expect(sm.secrets.get(nameA)!.deletedAt).toBeInstanceOf(Date);
    expect(live().length).toBe(0);

    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    expect(live().length).toBe(1);
    expect(refOf(rows().find((r) => r.id === a.json.id).credentialBlob).name).not.toBe(nameA);
  });

  it("deleting a connection releases its secret and no other", async () => {
    await start();
    const a = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "A" });
    const b = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "B", createNew: true });
    const nameA = refOf(rows().find((r) => r.id === a.json.id).credentialBlob).name;
    await call("DELETE", `/api/enterprise-integrations/connections/${a.json.id}`);
    expect(sm.secrets.get(nameA)!.deletedAt).toBeInstanceOf(Date);
    expect(live().length).toBe(1);
    expect(rows().map((r) => r.id)).toEqual([b.json.id]);
  });

  it("a failure to release is logged, not an error: the row is already gone", async () => {
    await start();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    sm.deny.add("DeleteSecret");
    expect((await call("DELETE", `/api/enterprise-integrations/connections/${a.json.id}`)).status).toBe(200);
    expect(rows().length).toBe(0);
    expect(warn.mock.calls.some((c) => String(c[0]).includes("could not release a secret"))).toBe(true);
  });
});

describe("the organization's OAuth app", () => {
  it("keeps the client secret in the store; GET shows only that there is one; a save without one keeps it; DELETE releases it", async () => {
    await start();
    const path = "/api/enterprise-integrations/msgraph/oauth-app";
    const put = await call("PUT", path, { clientId: "cid", clientSecret: "s3cret-value", tenantId: "contoso.onmicrosoft.com" });
    expect(put.status).toBe(200);
    const blob = rows("integration_oauth_apps")[0].clientSecretEncrypted;
    expect(refOf(blob).name).toMatch(/^astra\/test\/oauth-app\//);
    expect(secretOf(refOf(blob).name)).toEqual({ client_secret: "s3cret-value" });
    expect(everythingInTheDatabase()).not.toContain("s3cret-value");

    const got = await call("GET", path);
    expect(got.json).toMatchObject({ configured: true, hasSecret: true, clientId: "cid" });
    expect(got.text).not.toContain("s3cret-value");

    await call("PUT", path, { clientId: "cid-2" });
    expect(rows("integration_oauth_apps")[0].clientSecretEncrypted).toBe(blob);
    await call("PUT", path, { clientId: "cid-2", clientSecret: "rotated" });
    expect(rows("integration_oauth_apps")[0].clientSecretEncrypted).toBe(blob);
    expect(secretOf(refOf(blob).name).client_secret).toBe("rotated");
    expect(live().length).toBe(1);

    expect((await call("DELETE", path)).json).toEqual({ ok: true, removed: true });
    expect(sm.secrets.get(refOf(blob).name)!.deletedAt).toBeInstanceOf(Date);
  });

  it("an app whose secret cannot be read is an error, never an empty secret and never the platform's own app", async () => {
    const { storage } = await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    await call("PUT", "/api/enterprise-integrations/msgraph/oauth-app", { clientId: "org-id", clientSecret: "org-secret" });
    storeEnv({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    vi.resetModules();
    const { resolveOAuthApp } = await import("../server/integrations/oauth-app");
    expect(await resolveOAuthApp("org-1", "msgraph")).toMatchObject({ clientId: "org-id", clientSecret: "org-secret", source: "organization" });
    sm.deny.add("GetSecretValue");
    await expect(resolveOAuthApp("org-1", "msgraph")).rejects.toThrow(/Secrets Manager could not read a secret/);
    void storage;
  });
});

describe("the OAuth callback and token refresh", () => {
  const connectViaOAuth = async () => {
    await call("PUT", "/api/enterprise-integrations/msgraph/oauth-app", { clientId: "cid", clientSecret: "org-secret" });
    const started = await call("GET", "/api/integrations/oauth/start/msgraph");
    providerReply = () => ({ json: { access_token: "AT-1", refresh_token: "RT-1", expires_in: 3600 } });
    return call("GET", `/api/integrations/oauth/callback?state=${started.json.state}&code=the-code`);
  };

  it("the callback keeps the tokens in the store, using the client secret read from it", async () => {
    await start();
    const cb = await connectViaOAuth();
    expect(cb.location).toBe("/integrations?oauth_success=msgraph");
    expect(providerCalls[0].body).toMatchObject({ client_id: "cid", client_secret: "org-secret", code: "the-code" });
    const blob = rows()[0].credentialBlob;
    expect(secretOf(refOf(blob).name)).toEqual({ access_token: "AT-1", refresh_token: "RT-1", token_type: "Bearer" });
    expect(everythingInTheDatabase()).not.toContain("AT-1");
    expect(healthCalls[0][1]).toMatchObject({ access_token: "AT-1" });
  });

  it("a refresh from a connector call updates the same secret and leaves the row's reference as it was", async () => {
    await start();
    await connectViaOAuth();
    const blob = rows()[0].credentialBlob;
    providerReply = () => ({ json: { access_token: "AT-2", refresh_token: "RT-2", expires_in: 3600 } });
    const out = await (await makeProbe()).refreshOAuthToken("org-1");
    expect(out).toMatchObject({ access_token: "AT-2", refresh_token: "RT-2" });
    expect(rows()[0].credentialBlob).toBe(blob);
    expect(secretOf(refOf(blob).name)).toMatchObject({ access_token: "AT-2", refresh_token: "RT-2" });
    expect(live().length).toBe(2); // the client secret and the tokens
  });

  it("a refresh the store cannot save still hands the new token to the call that needs it, and says so", async () => {
    await start();
    await connectViaOAuth();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    providerReply = () => ({ json: { access_token: "AT-3", expires_in: 3600 } });
    sm.deny.add("PutSecretValue");
    const out = await (await makeProbe()).refreshOAuthToken("org-1");
    expect(out).toMatchObject({ access_token: "AT-3" });
    expect(secretOf(refOf(rows()[0].credentialBlob).name).access_token).toBe("AT-1");
    expect(warn.mock.calls.some((c) => String(c[0]).includes("could not save it"))).toBe(true);
  });

  it("a vault-blob connection becomes a reference when its token is refreshed", async () => {
    const { vault, storage } = await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: vault.encryptCredentialMap({ access_token: "OLD", refresh_token: "R1" }) });
    providerReply = () => ({ json: { access_token: "NEW" } });
    await (await makeProbe()).refreshOAuthToken("org-1");
    expect(refOf(rows()[0].credentialBlob).store).toBe("aws-sm");
    expect(secretOf(refOf(rows()[0].credentialBlob).name)).toMatchObject({ access_token: "NEW", refresh_token: "R1" });
  });

  // Runs the daemon twice. The work after each tick uses real sockets, which advancing the fake clock does not wait for, so
  // each tick is followed by waiting until nothing more is asked of the store or the provider. Returns the store requests
  // seen after each tick, so a test can tell that the second tick really did something.
  const tick = async (): Promise<number[]> => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const mod = await import("../server/routes/enterprise-integrations");
    mod.startTokenRefreshDaemon();
    const seen: number[] = [];
    for (const ms of [4 * 60 * 1000 + 10, 4 * 60 * 1000]) {
      await vi.advanceTimersByTimeAsync(ms);
      let last = -1;
      while (last !== sm.calls.length + providerCalls.length) { last = sm.calls.length + providerCalls.length; await new Promise((r) => setTimeout(r, 120)); }
      seen.push(sm.calls.length);
    }
    return seen;
  };

  it("the daemon refreshes connections kept in the store, each in its own secret", async () => {
    const { storage } = await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    const { sealCredentialMap } = await import("../server/credential-store");
    const soon = new Date(Date.now() + 60_000);
    const a = await storage.createIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", name: "A", status: "connected", tokenExpiresAt: soon, credentialBlob: await sealCredentialMap({ access_token: "A-OLD", refresh_token: "RA" }, { kind: "connection" }) });
    const b = await storage.createIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", name: "B", status: "connected", tokenExpiresAt: soon, credentialBlob: await sealCredentialMap({ access_token: "B-OLD", refresh_token: "RB" }, { kind: "connection" }) });
    const blobs = { a: a.credentialBlob, b: b.credentialBlob };
    providerReply = (body) => ({ json: { access_token: `NEW-${body.refresh_token}`, expires_in: 3600 } });
    await tick();
    vi.useRealTimers();
    expect(rows().find((r) => r.id === a.id).credentialBlob).toBe(blobs.a);
    expect(rows().find((r) => r.id === b.id).credentialBlob).toBe(blobs.b);
    expect(secretOf(refOf(blobs.a).name).access_token).toBe("NEW-RA");
    expect(secretOf(refOf(blobs.b).name).access_token).toBe("NEW-RB");
  });

  it("a connection the store cannot be read for is skipped, and said once, not every four minutes", async () => {
    const { storage } = await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    storeEnv({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    vi.resetModules();
    const { storage: st2 } = await import("../server/storage");
    const { sealCredentialMap } = await import("../server/credential-store");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await (st2 as any).createIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", tokenExpiresAt: new Date(Date.now() + 60_000), credentialBlob: await sealCredentialMap({ access_token: "A-OLD", refresh_token: "RA" }, { kind: "connection" }) });
    sm.deny.add("GetSecretValue");
    const seen = await tick();
    vi.useRealTimers();
    expect(providerCalls.length).toBe(0);
    expect(secretOf(refOf(a.credentialBlob).name).access_token).toBe("A-OLD");
    // Two ticks really ran (the second asked the store again), and the connection was still only mentioned once.
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[1]).toBeGreaterThan(seen[0]);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("cannot read the credentials of msgraph")).length).toBe(1);
    void storage;
  });
});

describe("a connector call", () => {
  it("reads the credentials from the store", async () => {
    const { storage } = await start();
    const { sealCredentialMap } = await import("../server/credential-store");
    await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: await sealCredentialMap({ access_token: "T" }, { kind: "connection" }) });
    const p = await makeProbe();
    const ok = await p.callTool("ping", {}, "org-1");
    expect(ok.isError).toBeUndefined();
    expect(p.seen[0].creds).toEqual({ access_token: "T" });
  });

  it("when the store cannot be read it says so, instead of saying the integration is not connected", async () => {
    const { storage } = await start();
    storeEnv({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    vi.resetModules();
    const { storage: st2 } = await import("../server/storage");
    const { sealCredentialMap } = await import("../server/credential-store");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await (st2 as any).upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: await sealCredentialMap({ access_token: "T" }, { kind: "connection" }) });
    sm.deny.add("GetSecretValue");
    const p = await makeProbe();
    const res = await p.callTool("ping", {}, "org-1");
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("external secret store");
    expect(res.content[0].text).not.toContain("is not connected");
    expect(p.seen.length).toBe(0);
    expect(await p.getCredentials("org-1")).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("could not be read from the secret store"))).toBe(true);
    void storage;
  });

  it("an agent's own credential that cannot be read does not fall through to the organization's", async () => {
    const { storage } = await start();
    storeEnv({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    vi.resetModules();
    const { storage: st2 } = await import("../server/storage");
    const { sealCredentialMap } = await import("../server/credential-store");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The organization's credential is a vault blob, readable whatever the store does, so falling through to it would succeed.
    const org = (await import("../server/credential-vault")).encryptCredentialMap({ access_token: "ORG" });
    const agent = await sealCredentialMap({ access_token: "AGENT" }, { kind: "agent-connection" });
    await (st2 as any).upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: org });
    await (st2 as any).upsertAgentIntegrationCredential({ agentId: "agent-1", integrationId: "msgraph", status: "connected", credentialBlob: agent });
    const p = await makeProbe();
    expect((await p.callTool("ping", {}, "org-1", "agent-1")).isError).toBeUndefined();
    expect(p.seen.at(-1).creds.access_token).toBe("AGENT");

    sm.deny.add("GetSecretValue");
    p.seen.length = 0;
    const res = await p.callTool("ping", {}, "org-1", "agent-1");
    expect(res.isError).toBe(true);
    expect(p.seen.length).toBe(0);
    void storage;
  });

  it("a reference with no store configured is an error that says so, not a missing connection", async () => {
    const { storage } = await start();
    const { sealCredentialMap } = await import("../server/credential-store");
    await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: await sealCredentialMap({ access_token: "T" }, { kind: "connection" }) });
    for (const k of ["ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT"]) delete process.env[k];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await (await makeProbe()).callTool("ping", {}, "org-1");
    expect(res.content[0].text).toContain("external secret store");
  });
});

describe("moving existing credentials", () => {
  const seed = async () => {
    const vault = await import("../server/credential-vault");
    const v = (m: Record<string, string>) => vault.encryptCredentialMap(m);
    const db = fake().db;
    const { integrationConnections, agentIntegrationCredentials, integrationOAuthApps, mcpServerAuth } = await import("../shared/schema");
    await db.insert(integrationConnections).values({ organizationId: "org-1", integrationId: "postgres", name: "A", credentialBlob: v({ password: "pw-A" }), status: "connected" });
    await db.insert(integrationConnections).values({ organizationId: "org-1", integrationId: "postgres", name: "B", isDefault: false, credentialBlob: v({ password: "pw-B" }), status: "connected" });
    await db.insert(integrationConnections).values({ organizationId: "org-1", integrationId: "mysql", name: "gone", credentialBlob: null, status: "disconnected" });
    await db.insert(agentIntegrationCredentials).values({ agentId: "agent-1", integrationId: "postgres", credentialBlob: v({ password: "pw-agent" }), status: "connected" });
    await db.insert(integrationOAuthApps).values({ organizationId: "org-1", integrationId: "msgraph", clientId: "cid", clientSecretEncrypted: v({ client_secret: "cs" }) });
    await db.insert(mcpServerAuth).values({ serverId: "srv-1", authType: "bearer", configEncrypted: v({ token: "tok" }) });
    return { vault };
  };
  const mod = () => import("../server/credential-migration");

  it("status counts what is where without reading any secret", async () => {
    await start(); await seed();
    const st = await (await mod()).credentialStoreStatus();
    expect(st.configured).toBe(true);
    expect(st.counts.connection).toEqual({ database: 2, store: 0, unrecognized: 0 });
    expect(st.counts["agent-connection"].database).toBe(1);
    expect(st.counts["oauth-app"].database).toBe(1);
    expect(st.counts["mcp-auth"].database).toBe(1);
    expect(sm.calls.length).toBe(0);
  });

  it("a dry run of the move back changes nothing either: the rows stay references and the secrets stay live", async () => {
    await start(); await seed();
    const { migrateCredentials } = await mod();
    await migrateCredentials({ direction: "to-store", dryRun: false });
    const before = everythingInTheDatabase();
    const report = await migrateCredentials({ direction: "to-database", dryRun: true });
    expect(everythingInTheDatabase()).toBe(before);
    expect(live().length).toBe(5);
    expect(report.byKind.connection).toMatchObject({ eligible: 2, moved: 0, wouldFail: 0 });
    sm.deny.add("GetSecretValue");
    const failing = await migrateCredentials({ direction: "to-database", dryRun: true });
    expect(failing.byKind.connection!.wouldFail).toBe(2);
    expect(everythingInTheDatabase()).toBe(before);
  });

  it("a dry run changes nothing, and tells what a real run would do and what would fail", async () => {
    await start(); await seed();
    rows()[1].credentialBlob = "garbage-not-a-blob";
    const before = everythingInTheDatabase();
    const report = await (await mod()).migrateCredentials({ direction: "to-store", dryRun: true });
    expect(everythingInTheDatabase()).toBe(before);
    expect(sm.secrets.size).toBe(0);
    expect(report.dryRun).toBe(true);
    expect(report.byKind.connection).toMatchObject({ eligible: 1, wouldFail: 0, moved: 0 });
    expect(report.byKind["oauth-app"]).toMatchObject({ eligible: 1, moved: 0 });
  });

  it("moves every kind to the store, leaves no secret in the database, and everything still reads", async () => {
    const { vault } = await start(); await seed();
    const report = await (await mod()).migrateCredentials({ direction: "to-store", dryRun: false });
    expect(Object.values(report.byKind).map((k) => k!.moved)).toEqual([1, 2, 1, 1]);
    expect(report.remaining).toBe(0);
    expect(report.failures).toEqual([]);
    const db = everythingInTheDatabase();
    for (const secret of ["pw-A", "pw-B", "pw-agent", "cs", "tok"]) expect(db, secret).not.toContain(`"${secret}"`);
    expect(db).not.toContain("ciphertext");
    expect(live().length).toBe(5);
    const after = await (await mod()).credentialStoreStatus();
    expect(after.counts.connection).toEqual({ database: 0, store: 2, unrecognized: 0 });
    expect(after.counts["oauth-app"]).toEqual({ database: 0, store: 1, unrecognized: 0 });

    const { openCredentialMap } = await import("../server/credential-store");
    expect(await openCredentialMap(rows()[0].credentialBlob)).toEqual({ password: "pw-A" });
    expect(await openCredentialMap(rows("integration_oauth_apps")[0].clientSecretEncrypted)).toEqual({ client_secret: "cs" });
    void vault;
    // The second request has nothing left to do.
    const again = await (await mod()).migrateCredentials({ direction: "to-store", dryRun: false });
    expect(Object.values(again.byKind).every((k) => k!.moved === 0 && k!.eligible === 0)).toBe(true);
    expect(live().length).toBe(5);
  });

  it("moves back, with the same credentials, and releases the secrets", async () => {
    const { vault } = await start(); await seed();
    const { migrateCredentials } = await mod();
    await migrateCredentials({ direction: "to-store", dryRun: false });
    const names = live().map((s) => s.name);
    const back = await migrateCredentials({ direction: "to-database", dryRun: false });
    expect(Object.values(back.byKind).map((k) => k!.moved)).toEqual([1, 2, 1, 1]);
    expect(back.releaseFailed).toBe(0);
    expect(vault.decryptCredentialMap(rows()[0].credentialBlob)).toEqual({ password: "pw-A" });
    expect(vault.decryptCredentialMap(rows()[1].credentialBlob)).toEqual({ password: "pw-B" });
    expect(vault.decryptCredentialMap(rows("integration_oauth_apps")[0].clientSecretEncrypted)).toEqual({ client_secret: "cs" });
    expect(names.every((n) => sm.secrets.get(n)!.deletedAt instanceof Date)).toBe(true);
    expect(live().length).toBe(0);
  });

  it("changes at most `limit` rows a run, and the next run continues", async () => {
    await start(); await seed();
    const { migrateCredentials } = await mod();
    const first = await migrateCredentials({ direction: "to-store", dryRun: false, limit: 2 });
    expect(Object.values(first.byKind).reduce((n, k) => n + k!.moved, 0)).toBe(2);
    expect(first.remaining).toBe(3);
    const second = await migrateCredentials({ direction: "to-store", dryRun: false, limit: 10 });
    expect(Object.values(second.byKind).reduce((n, k) => n + k!.moved, 0)).toBe(3);
    expect(second.remaining).toBe(0);
  });

  it("a row someone saved during the move keeps what they saved, and the secret made for the lost race is removed", async () => {
    await start(); const { vault } = await seed();
    const db = fake().db, update = db.update;
    db.update = (t: any) => {
      if (getTableName(t) === "integration_connections") rows()[0].credentialBlob = vault.encryptCredentialMap({ password: "saved-meanwhile" });
      return update(t);
    };
    const report = await (await mod()).migrateCredentials({ direction: "to-store", dryRun: false, kinds: ["connection"] });
    db.update = update;
    expect(report.byKind.connection).toMatchObject({ moved: 1, skipped: 1 });
    expect(vault.decryptCredentialMap(rows()[0].credentialBlob)).toEqual({ password: "saved-meanwhile" });
    expect(live().length).toBe(1);
  });

  it("a credential that cannot be decrypted is reported and does not stop the rest", async () => {
    await start(); await seed();
    rows()[0].credentialBlob = JSON.stringify({ v: 1, iv: "00", tag: "00", ciphertext: "00" });
    const report = await (await mod()).migrateCredentials({ direction: "to-store", dryRun: false, kinds: ["connection"] });
    expect(report.byKind.connection).toMatchObject({ moved: 1, failed: 1 });
    expect(report.failures[0]).toMatchObject({ kind: "connection", reason: expect.stringContaining("cannot be decrypted") });
    expect(JSON.stringify(report)).not.toContain("pw-");
  });

  it("a store that is down stops the run after a few failures instead of being asked for every row", async () => {
    await start(); await seed();
    const { vault } = await import("../server/credential-vault").then((vault) => ({ vault }));
    const { integrationConnections } = await import("../shared/schema");
    for (let i = 0; i < 40; i++) await fake().db.insert(integrationConnections).values({ organizationId: "org-1", integrationId: `t${i}`, credentialBlob: vault.encryptCredentialMap({ p: `${i}` }), status: "connected" });
    sm.deny.add("CreateSecret");
    const report = await (await mod()).migrateCredentials({ direction: "to-store", dryRun: false, kinds: ["connection"] });
    expect(report.byKind.connection!.failed).toBe(25);
    expect(report.stoppedEarly).toMatch(/stopped after 25 rows failed/);
    expect(sm.calls.filter((c) => c.op === "CreateSecret").length).toBe(25);
  });

  it("refuses to move to a store that is not configured or a kind that is not switched on, and two at once", async () => {
    await start(); await seed();
    const { migrateCredentials } = await mod();
    storeEnv({ ASTRA_SECRETS_MANAGER_KINDS: "mcp-auth" });
    vi.resetModules();
    const m2 = await mod();
    await expect(m2.migrateCredentials({ direction: "to-store", dryRun: true, kinds: ["connection"] })).rejects.toMatchObject({ status: 409 });
    vi.resetModules();
    for (const k of ["ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT"]) delete process.env[k];
    await expect((await mod()).migrateCredentials({ direction: "to-store", dryRun: true })).rejects.toMatchObject({ status: 409 });
    void migrateCredentials;
  });

  it("only one run at a time", async () => {
    await start(); await seed();
    const { migrateCredentials } = await mod();
    sm.hang = false; sm.delayMs = 40;
    const one = migrateCredentials({ direction: "to-store", dryRun: false });
    await new Promise((r) => setTimeout(r, 10));
    await expect(migrateCredentials({ direction: "to-store", dryRun: true })).rejects.toMatchObject({ status: 409 });
    await one;
  });
});

describe("the administrator's routes", () => {
  it("a request without dryRun is a rehearsal; it takes an explicit false to change anything", async () => {
    const { vault } = await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    rows()[0].credentialBlob = vault.encryptCredentialMap(PG);
    sm.secrets.clear();
    const dry = await call("POST", "/api/admin/credential-store/migrate", { direction: "to-store" });
    expect(dry.status).toBe(200);
    expect(dry.json).toMatchObject({ dryRun: true });
    expect(sm.secrets.size).toBe(0);
    const real = await call("POST", "/api/admin/credential-store/migrate", { direction: "to-store", dryRun: false });
    expect(real.json.byKind.connection.moved).toBe(1);
    expect(refOf(rows()[0].credentialBlob).store).toBe("aws-sm");
  });

  it("is for platform administrators only, and says what is wrong with a bad request", async () => {
    await start();
    expect((await call("GET", "/api/admin/credential-store/status", undefined, { "x-test-role": "agent_engineer" })).status).toBe(403);
    expect((await call("POST", "/api/admin/credential-store/migrate", { direction: "to-store", dryRun: false }, { "x-test-role": "agent_engineer" })).status).toBe(403);
    expect((await call("POST", "/api/admin/credential-store/migrate", { direction: "sideways" })).status).toBe(400);
    expect((await call("POST", "/api/admin/credential-store/migrate", { direction: "to-store", surprise: 1 })).status).toBe(400);
    expect((await call("POST", "/api/admin/credential-store/migrate", { direction: "to-store", limit: 5000 })).status).toBe(400);
    const st = await call("GET", "/api/admin/credential-store/status");
    expect(st.status).toBe(200);
    expect(st.json).toMatchObject({ configured: true, prefix: "astra/test/" });
  });

  it("reports a real migration in the audit trail without naming a credential", async () => {
    const { vault, storage } = await start();
    const audit = vi.spyOn(storage, "createAuditEvent").mockResolvedValue({} as any);
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    audit.mockClear();
    rows()[0].credentialBlob = vault.encryptCredentialMap(PG);
    await call("POST", "/api/admin/credential-store/migrate", { direction: "to-store", dryRun: false });
    const ev = audit.mock.calls.map((c) => c[0] as any).find((e) => e.action === "credential_store_migrate");
    expect(ev).toMatchObject({ objectType: "credential_store", objectId: "to-store", organizationId: "org-1" });
    expect(ev.details).not.toContain("p@ss-1");
    audit.mockClear();
    await call("POST", "/api/admin/credential-store/migrate", { direction: "to-database" });
    expect(audit.mock.calls.some((c) => (c[0] as any).action === "credential_store_migrate")).toBe(false);
  });
});

describe("the Microsoft Graph connector, end to end", () => {
  // The path the SharePoint / Teams / Exchange demos run on: a connector tool call that finds its token in the
  // connection, is told it has expired, refreshes it, and carries on. It must behave the same with the store off and on.
  for (const mode of ["off", "on"] as const) {
    it(`a tool call with an expired token refreshes it and succeeds, with the store ${mode}`, async () => {
      if (mode === "off") for (const k of ["ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT"]) delete process.env[k];
      const { vault, storage } = await start();
      process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
      const { sealCredentialMap, openCredentialMap } = await import("../server/credential-store");
      const conn = await storage.upsertIntegrationConnection({
        organizationId: "org-1", integrationId: "msgraph", status: "connected",
        credentialBlob: await sealCredentialMap({ access_token: "AT-OLD", refresh_token: "RT-1" }, { kind: "connection" }),
      });
      expect(conn.credentialBlob.includes("aws-sm")).toBe(mode === "on");

      graphReply = (auth) => auth === "Bearer AT-NEW"
        ? new Response(JSON.stringify({ value: [{ id: "u1", displayName: "Ada Lovelace", mail: "ada@example.com", department: "Eng" }] }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response("{\"error\":{\"code\":\"InvalidAuthenticationToken\"}}", { status: 401, headers: { "content-type": "application/json" } });
      providerReply = () => ({ json: { access_token: "AT-NEW", expires_in: 3600 } });

      const { microsoftGraphMcpServer } = await import("../server/integrations/msgraph/mcp-server");
      const res = await microsoftGraphMcpServer.callTool("graph_list_users", { top: 3 }, "org-1");
      expect(res.isError, res.content[0].text).toBeUndefined();
      expect(res.content[0].text).toContain("Ada Lovelace");
      expect(graphCalls.map((c) => c.auth)).toEqual(["Bearer AT-OLD", "Bearer AT-NEW"]);
      expect(providerCalls.length).toBe(1);
      expect(providerCalls[0].body).toMatchObject({ grant_type: "refresh_token", refresh_token: "RT-1" });

      const row = rows()[0];
      expect(await openCredentialMap(row.credentialBlob)).toMatchObject({ access_token: "AT-NEW", refresh_token: "RT-1" });
      if (mode === "on") {
        expect(row.credentialBlob).toBe(conn.credentialBlob);
        expect(everythingInTheDatabase()).not.toContain("AT-NEW");
      } else {
        expect(vault.decryptCredentialMap(row.credentialBlob).access_token).toBe("AT-NEW");
        expect(sm.calls.length).toBe(0);
      }

      // The next call already carries the new token and needs no refresh.
      graphCalls.length = 0;
      const again = await microsoftGraphMcpServer.callTool("graph_list_users", {}, "org-1");
      expect(again.isError).toBeUndefined();
      expect(graphCalls.map((c) => c.auth)).toEqual(["Bearer AT-NEW"]);
      expect(providerCalls.length).toBe(1);
    });
  }
});

describe("writes are serialized per connection type", () => {
  // Two writers at once, each reading the row and each making a secret, would leave one secret that nothing refers to
  // (real Postgres is where the lock is proven to hold: .workbench/outbound/check-real-connectors.mts); here it is
  // pinned that every write takes the lock, for the right key, before it reads the row it is about to replace.
  const locks = () => fake().ops.filter((o) => o.includes("pg_advisory_xact_lock") && /\[integration_/.test(o));
  const firstRead = (table: string) => fake().ops.findIndex((o) => o === `select ${table}`);
  const lockAt = (key: string) => fake().ops.findIndex((o) => o.includes("pg_advisory_xact_lock") && o.endsWith(`[${key}]`));

  it("connect, edit, refresh and the OAuth app save each lock their own key before reading the row", async () => {
    await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    const c = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    expect(lockAt("integration_connection:org-1:postgres")).toBeGreaterThanOrEqual(0);
    expect(lockAt("integration_connection:org-1:postgres")).toBeLessThan(firstRead("integration_connections"));

    fake().ops.length = 0;
    await call("PATCH", `/api/enterprise-integrations/connections/${c.json.id}/config`, { credentials: { database: "x" } });
    expect(lockAt("integration_connection:org-1:postgres")).toBeGreaterThanOrEqual(0);
    const ops = fake().ops;
    const lockIdx = ops.findIndex((o) => o.includes("pg_advisory_xact_lock"));
    // (the route reads the row once to validate the request; the write reads it again under the lock)
    expect(ops.slice(lockIdx).filter((o) => o === "select integration_connections").length).toBeGreaterThanOrEqual(1);

    fake().ops.length = 0;
    await call("PUT", "/api/enterprise-integrations/msgraph/oauth-app", { clientId: "cid", clientSecret: "s" });
    expect(lockAt("integration_oauth_app:org-1:msgraph")).toBeGreaterThanOrEqual(0);
    // (the route reads the app once to check a secret was given; the write reads it again, under the lock)
    expect(fake().ops.slice(lockAt("integration_oauth_app:org-1:msgraph")).includes("select integration_oauth_apps")).toBe(true);

    const { storage } = await import("../server/storage");
    const { sealCredentialMap } = await import("../server/credential-store");
    await (storage as any).upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: await sealCredentialMap({ access_token: "OLD", refresh_token: "R" }, { kind: "connection" }) });
    fake().ops.length = 0;
    providerReply = () => ({ json: { access_token: "NEW" } });
    await (await makeProbe()).refreshOAuthToken("org-1");
    expect(lockAt("integration_connection:org-1:msgraph")).toBeGreaterThanOrEqual(0);
  });

  it("a different organization or type locks a different key, so they never wait for each other", async () => {
    await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG }, { "x-organization-id": "org-2" });
    await call("POST", "/api/enterprise-integrations/mysql/connect", { credentials: PG });
    const keys = locks().map((o) => o.slice(o.lastIndexOf("[")));
    expect(new Set(keys).size).toBe(2);
    expect(keys).toEqual(["[integration_connection:org-2:postgres]", "[integration_connection:org-1:mysql]"]);
  });
});

describe("every path that changes a credential cleans up after itself", () => {
  const failUpdate = (table = "integration_connections") => {
    const db = fake().db, update = db.update;
    db.update = (t: any) => { if (getTableName(t) === table) throw new Error("db down"); return update(t); };
    return () => { db.update = update; };
  };
  const vaultConnection = async (storage: any, vault: any, creds: Record<string, string>) =>
    storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "postgres", status: "connected", credentialBlob: vault.encryptCredentialMap(creds) });

  it("editing a vault-blob connection whose write then fails leaves no secret behind and the row as it was", async () => {
    const { vault, storage } = await start();
    const c = await vaultConnection(storage, vault, PG);
    const restore = failUpdate();
    const res = await call("PATCH", `/api/enterprise-integrations/connections/${c.id}/config`, { credentials: { database: "other" } });
    restore();
    expect(res.status).toBe(500);
    expect(live().length).toBe(0);
    expect(vault.decryptCredentialMap(rows()[0].credentialBlob)).toEqual(PG);
  });

  it("a failed write over a secret that already exists does not remove that secret", async () => {
    await start();
    const c = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    const blob = rows()[0].credentialBlob;
    const restore = failUpdate();
    const res = await call("PATCH", `/api/enterprise-integrations/connections/${c.json.id}/config`, { credentials: { database: "other" } });
    restore();
    expect(res.status).toBe(500);
    expect(live().length).toBe(1);
    expect(rows()[0].credentialBlob).toBe(blob);
    expect(secretOf(refOf(blob).name).password).toBe(PG.password);
  });

  it("Salesforce's own token refresh updates the connection's secret in place", async () => {
    await start();
    process.env.OAUTH_SALESFORCE_CLIENT_ID = "sf-id"; process.env.OAUTH_SALESFORCE_CLIENT_SECRET = "sf-secret";
    try {
      const { storage } = await import("../server/storage");
      const { sealCredentialMap } = await import("../server/credential-store");
      const blob = await sealCredentialMap({ access_token: "OLD", refresh_token: "R1", sandbox: "true" }, { kind: "connection" });
      await (storage as any).upsertIntegrationConnection({ organizationId: "org-1", integrationId: "salesforce", status: "connected", credentialBlob: blob });
      providerReply = () => ({ json: { access_token: "NEW", instance_url: "https://new.example", expires_in: 3600 } });
      const { SalesforceMcpServer } = await import("../server/integrations/salesforce/mcp-server");
      const out = await new SalesforceMcpServer().refreshOAuthToken("org-1");
      expect(out).toMatchObject({ access_token: "NEW", instance_url: "https://new.example", sandbox: "true" });
      expect(providerCalls[0].url).toBe("https://test.salesforce.com/services/oauth2/token");
      expect(rows()[0].credentialBlob).toBe(blob);
      expect(secretOf(refOf(blob).name)).toMatchObject({ access_token: "NEW", refresh_token: "R1" });
      expect(live().length).toBe(1);
    } finally { delete process.env.OAUTH_SALESFORCE_CLIENT_ID; delete process.env.OAUTH_SALESFORCE_CLIENT_SECRET; }
  });

  it("a refresh that finishes after the connection was disconnected does not bring it back, and leaves no secret", async () => {
    const { storage } = await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    const { sealCredentialMap } = await import("../server/credential-store");
    const c = await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: await sealCredentialMap({ access_token: "OLD", refresh_token: "R1" }, { kind: "connection" }) });
    const { saveRefreshedConnectionCredentials } = await import("../server/connection-credentials");
    await storage.disconnectIntegration("org-1", "msgraph", c.id);
    expect(await saveRefreshedConnectionCredentials(c.id, { access_token: "NEW", refresh_token: "R1" })).toBe(false);
    expect(rows()[0].credentialBlob).toBeNull();
    expect(rows()[0].status).toBe("disconnected");
    expect(live().length).toBe(0);
    expect(await saveRefreshedConnectionCredentials("no-such-id", { access_token: "NEW" })).toBe(false);
  });

  it("a token refresh whose save fails leaves no secret behind, and still returns the token", async () => {
    const { vault, storage } = await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "msgraph", status: "connected", credentialBlob: vault.encryptCredentialMap({ access_token: "OLD", refresh_token: "R1" }) });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    providerReply = () => ({ json: { access_token: "NEW" } });
    const restore = failUpdate();
    const out = await (await makeProbe()).refreshOAuthToken("org-1");
    restore();
    expect(out).toMatchObject({ access_token: "NEW" });
    expect(live().length).toBe(0);
    expect(vault.decryptCredentialMap(rows()[0].credentialBlob).access_token).toBe("OLD");
  });

  it("the OAuth app save whose write fails leaves no secret behind", async () => {
    await start();
    const db = fake().db, insert = db.insert;
    db.insert = (t: any) => { if (getTableName(t) === "integration_oauth_apps") throw new Error("db down"); return insert(t); };
    const res = await call("PUT", "/api/enterprise-integrations/msgraph/oauth-app", { clientId: "cid", clientSecret: "s" });
    db.insert = insert;
    expect(res.status).toBe(500);
    expect(sm.secrets.size).toBe(0);
  });

  it("the OAuth callback whose save fails leaves no secret behind", async () => {
    await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    const started = await call("GET", "/api/integrations/oauth/start/msgraph");
    providerReply = () => ({ json: { access_token: "AT", refresh_token: "RT" } });
    const db = fake().db, insert = db.insert;
    db.insert = (t: any) => { if (getTableName(t) === "integration_connections") throw new Error("db down"); return insert(t); };
    const cb = await call("GET", `/api/integrations/oauth/callback?state=${started.json.state}&code=c`);
    db.insert = insert;
    expect(cb.location).toContain("oauth_error");
    expect(sm.secrets.size).toBe(0);
  });

  it("replacing a reference with something that does not refer to the secret releases it, for each kind", async () => {
    const { vault, storage } = await start();
    const { sealCredentialMap } = await import("../server/credential-store");
    const v1 = (m: Record<string, string>) => vault.encryptCredentialMap(m);
    const conn = await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "postgres", status: "connected", credentialBlob: await sealCredentialMap(PG, { kind: "connection" }) });
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "c", clientSecretEncrypted: await sealCredentialMap({ client_secret: "s" }, { kind: "oauth-app" }) });
    await storage.upsertAgentIntegrationCredential({ agentId: "a1", integrationId: "postgres", status: "connected", credentialBlob: await sealCredentialMap(PG, { kind: "agent-connection" }) });
    expect(live().length).toBe(3);

    await storage.upsertIntegrationConnection({ ...conn, credentialBlob: v1(PG) }, conn.id);
    expect(live().length).toBe(2);
    await storage.upsertIntegrationOAuthApp("org-1", "msgraph", { clientId: "c", clientSecretEncrypted: v1({ client_secret: "s" }) });
    expect(live().length).toBe(1);
    await storage.upsertAgentIntegrationCredential({ agentId: "a1", integrationId: "postgres", status: "connected", credentialBlob: v1(PG) });
    expect(live().length).toBe(0);
  });

  it("saving the same reference again releases nothing", async () => {
    const { storage } = await start();
    const { sealCredentialMap } = await import("../server/credential-store");
    const conn = await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "postgres", status: "connected", credentialBlob: await sealCredentialMap(PG, { kind: "connection" }) });
    await storage.upsertIntegrationConnection({ ...conn, status: "error" }, conn.id);
    await storage.upsertIntegrationConnection({ ...conn, credentialBlob: conn.credentialBlob }, conn.id);
    expect(live().length).toBe(1);
  });

  it("deleting an agent's own credential releases its secret", async () => {
    const { storage } = await start();
    const { sealCredentialMap } = await import("../server/credential-store");
    await storage.upsertAgentIntegrationCredential({ agentId: "a1", integrationId: "postgres", status: "connected", credentialBlob: await sealCredentialMap(PG, { kind: "agent-connection" }) });
    await storage.upsertAgentIntegrationCredential({ agentId: "a2", integrationId: "postgres", status: "connected", credentialBlob: await sealCredentialMap(PG, { kind: "agent-connection" }) });
    await storage.deleteAgentIntegrationCredential("a1", "postgres");
    expect(live().length).toBe(1);
    expect(rows("agent_integration_credentials").map((r) => r.agentId)).toEqual(["a2"]);
  });

  it("the health scan's connection test reads a credential kept in the store", async () => {
    const { storage } = await start();
    const { sealCredentialMap } = await import("../server/credential-store");
    const c = await storage.upsertIntegrationConnection({ organizationId: "org-1", integrationId: "postgres", status: "connected", credentialBlob: await sealCredentialMap(PG, { kind: "connection" }) });
    const { vendorConnectionTest } = await import("../server/connector-health-scan");
    const out = await vendorConnectionTest("postgres", "org-1", c.id);
    expect(out.probed).toBe(true);
    expect(healthCalls[0][1]).toEqual(PG);
  });
});

describe("moving credentials: the cases that need care", () => {
  const seedConn = async (creds: Record<string, string>) => {
    const vault = await import("../server/credential-vault");
    const { integrationConnections } = await import("../shared/schema");
    await fake().db.insert(integrationConnections).values({ organizationId: "org-1", integrationId: "postgres", credentialBlob: vault.encryptCredentialMap(creds), status: "connected" });
    return vault;
  };

  it("a store that returns something other than what was written is caught before the database is changed", async () => {
    await start(); const vault = await seedConn(PG);
    const before = rows()[0].credentialBlob;
    sm.corruptReads = true;
    const { migrateCredentials } = await import("../server/credential-migration");
    const report = await migrateCredentials({ direction: "to-store", dryRun: false, kinds: ["connection"] });
    expect(report.byKind.connection).toMatchObject({ moved: 0, failed: 1 });
    expect(report.failures[0].reason).toContain("read back");
    expect(rows()[0].credentialBlob).toBe(before);
    expect(vault.decryptCredentialMap(before)).toEqual(PG);
    expect(sm.secrets.size).toBe(0);
  });

  it("moving back does not overwrite a credential saved during the move, and keeps its secret", async () => {
    await start(); await seedConn(PG);
    const { migrateCredentials } = await import("../server/credential-migration");
    await migrateCredentials({ direction: "to-store", dryRun: false });
    const db = fake().db, update = db.update;
    let racing: string | null = null;
    db.update = (t: any) => {
      if (getTableName(t) === "integration_connections") { racing = rows()[0].credentialBlob = JSON.stringify({ v: 2, store: "aws-sm", name: "astra/test/connection/someone-elses" }); }
      return update(t);
    };
    const report = await migrateCredentials({ direction: "to-database", dryRun: false, kinds: ["connection"] });
    db.update = update;
    expect(report.byKind.connection).toMatchObject({ moved: 0, skipped: 1 });
    expect(rows()[0].credentialBlob).toBe(racing);
    expect(live().length).toBe(1);
  });

  it("moving back with no store configured fails each row with a reason and changes nothing", async () => {
    await start(); await seedConn(PG);
    const { migrateCredentials } = await import("../server/credential-migration");
    await migrateCredentials({ direction: "to-store", dryRun: false });
    const refBlob = rows()[0].credentialBlob;
    vi.resetModules();
    for (const k of ["ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT"]) delete process.env[k];
    const m2 = await import("../server/credential-migration");
    const report = await m2.migrateCredentials({ direction: "to-database", dryRun: false });
    expect(report.byKind.connection).toMatchObject({ moved: 0, failed: 1 });
    expect(report.failures[0].reason).toContain("not configured");
    expect(rows()[0].credentialBlob).toBe(refBlob);
  });
});
