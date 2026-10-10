/**
 * What the connector routes do TODAY with a connection's credentials, pinned before they learn to keep those
 * anywhere but the database (server/credential-store.ts): connect, edit settings, test, the masked hint, the
 * organization's OAuth app, the OAuth callback that stores the tokens, the daemon that refreshes them, and
 * disconnect/delete.
 *
 * The real router and real storage run against a column-aware stand-in database (tests/support/fake-drizzle.ts);
 * only the outbound health test, the address vetting and the provider's token endpoint are replaced. With no
 * external secret store configured every one of these must keep passing unchanged.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./support/fake-drizzle";

vi.mock("../server/db", async () => {
  const { makeFakeDb } = await import("./support/fake-drizzle");
  const G = globalThis as any;
  G.__routePinsFake ??= makeFakeDb();
  const live = () => (globalThis as any).__routePinsFake.db;
  return { pool: {}, db: new Proxy({}, { get: (_t, prop) => (...args: any[]) => live()[prop](...args) }) };
});
vi.mock("../server/connector-connection-test", () => {
  const G = globalThis as any;
  return { testConnectionHealth: (...args: any[]) => G.__routePinsHealth(...args) };
});
vi.mock("../server/connector-targets", async (orig) => ({
  ...(await orig<typeof import("../server/connector-targets")>()),
  vetConnectorCredentials: async () => ({ ok: true }),
}));

const G = globalThis as any;
const fake = (): FakeDb => G.__routePinsFake;
const TABLES = ["integration_connections", "integration_oauth_apps", "agent_integration_credentials"];

const ENV_KEYS = ["INTEGRATION_VAULT_KEY", "ASTRA_SECRETS_MANAGER_PREFIX", "OAUTH_MSGRAPH_CLIENT_ID", "OAUTH_MSGRAPH_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
const realFetch = globalThis.fetch;

let server: Server | null = null;
let base = "";
let healthCalls: any[][] = [];
let providerCalls: Array<{ url: string; body: Record<string, string> }> = [];
let providerReply: (body: Record<string, string>) => { ok?: boolean; json: any } = () => ({ json: {} });

beforeEach(() => {
  vi.resetModules();
  G.__routePinsFake = makeFakeDb({ strict: TABLES });
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.INTEGRATION_VAULT_KEY = "route-pins-test-vault-key";
  healthCalls = [];
  G.__routePinsHealth = async (...args: any[]) => { healthCalls.push(args); return { ok: true, latencyMs: 5 }; };
  providerCalls = [];
  providerReply = () => ({ json: {} });
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    if (String(url).startsWith("http://127.0.0.1")) return realFetch(url, init);
    const body = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    providerCalls.push({ url: String(url), body });
    const r = providerReply(body);
    return { ok: r.ok ?? true, status: r.ok === false ? 400 : 200, json: async () => r.json } as any;
  });
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

async function start() {
  const router = (await import("../server/routes/enterprise-integrations")).default;
  const app = express();
  app.use(express.json());
  // The server runs in production security mode unless told otherwise, where the organization and role come from the
  // signed-in user; the test stands in for the sign-in.
  app.use((req, _res, next) => {
    (req as any).authUser = { username: "tester", role: "admin", organizationId: req.headers["x-organization-id"] };
    next();
  });
  app.use(router);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  const vault = await import("../server/credential-vault");
  const { storage } = await import("../server/storage");
  return { vault, storage: storage as any };
}

async function call(method: string, path: string, body?: unknown, org = "org-1") {
  const res = await fetch(`${base}${path}`, {
    method, redirect: "manual",
    headers: { "content-type": "application/json", "x-organization-id": org },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, location: res.headers.get("location"), text };
}

const rows = () => fake().rows("integration_connections");
const decrypt = (vault: any, blob: string) => vault.decryptCredentialMap(blob);
const PG = { host: "db.example.com", port: "5432", database: "sales", user: "app", password: "p@ss-1" };

describe("connect", () => {
  it("stores the credentials vault-encrypted, tests them in plaintext, records the result, and never echoes them", async () => {
    const { vault } = await start();
    const res = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "Sales DB" });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("p@ss-1");
    expect(res.json).toMatchObject({ integrationId: "postgres", name: "Sales DB", isDefault: true, status: "connected", immediateTest: { ok: true } });

    expect(rows().length).toBe(1);
    expect(rows()[0].organizationId).toBe("org-1");
    expect(decrypt(vault, rows()[0].credentialBlob)).toEqual(PG);
    expect(rows()[0].credentialBlob).not.toContain("p@ss-1");
    expect(healthCalls[0][0]).toBe("postgres");
    expect(healthCalls[0][1]).toEqual(PG);
    expect(rows()[0].lastTestResult).toBe("ok");
    expect(rows()[0].status).toBe("connected");
  });

  it("connecting again re-authenticates the default connection; createNew adds a sibling that is not the default", async () => {
    const { vault } = await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: { ...PG, password: "second" } });
    expect(rows().length).toBe(1);
    expect(decrypt(vault, rows()[0].credentialBlob).password).toBe("second");

    const sib = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: { ...PG, database: "support" }, name: "Support DB", createNew: true });
    expect(sib.json.isDefault).toBe(false);
    expect(rows().length).toBe(2);
    expect(decrypt(vault, rows().find((r) => r.id === sib.json.id).credentialBlob).database).toBe("support");
    expect(decrypt(vault, rows().find((r) => r.id !== sib.json.id).credentialBlob).database).toBe("sales");
  });

  it("connecting with a connection id re-authenticates that connection, not the default, and a made-up id adds one", async () => {
    const { vault } = await start();
    const a = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "A" });
    const b = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "B", createNew: true });
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: { ...PG, password: "b-new" }, connectionId: b.json.id });
    expect(rows().length).toBe(2);
    expect(decrypt(vault, rows().find((r) => r.id === b.json.id).credentialBlob).password).toBe("b-new");
    expect(decrypt(vault, rows().find((r) => r.id === a.json.id).credentialBlob).password).toBe(PG.password);

    const other = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, connectionId: "no-such-connection" });
    expect(other.status).toBe(200);
    expect(rows().length).toBe(3);
  });

  it("a connector that cannot be verified does not overwrite the status, and a failing test is recorded as an error", async () => {
    await start();
    G.__routePinsHealth = async () => ({ ok: false, status: "not_verifiable" });
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    expect(rows()[0].lastTestResult).toBeNull();
    expect(rows()[0].status).toBe("connected");
    G.__routePinsHealth = async () => ({ ok: false, error: "refused" });
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    expect(rows()[0].lastTestResult).toBe("error");
    expect(rows()[0].lastError).toBe("refused");
  });

  it("an unknown integration is a 404 and a malformed body a 400, and neither stores anything", async () => {
    await start();
    expect((await call("POST", "/api/enterprise-integrations/nope/connect", { credentials: {} })).status).toBe(404);
    expect((await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: "x" })).status).toBe(400);
    expect(rows().length).toBe(0);
  });
});

describe("editing a connection's settings", () => {
  const connect = async () => {
    const ctx = await start();
    const c = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    return { ...ctx, id: c.json.id as string };
  };

  it("GET returns only the fields the integration does not mark as passwords", async () => {
    const { id } = await connect();
    const res = await call("GET", `/api/enterprise-integrations/connections/${id}/config`);
    expect(res.json.values).toEqual({ host: PG.host, port: PG.port, database: PG.database, user: PG.user });
    expect(res.text).not.toContain("p@ss-1");
  });

  it("PATCH changes a non-secret field in place, keeps every secret, and re-tests with the merged credentials", async () => {
    const { vault, id } = await connect();
    healthCalls = [];
    const res = await call("PATCH", `/api/enterprise-integrations/connections/${id}/config`, { credentials: { database: "other" } });
    expect(res.status).toBe(200);
    expect(decrypt(vault, rows()[0].credentialBlob)).toEqual({ ...PG, database: "other" });
    expect(healthCalls[0][1]).toEqual({ ...PG, database: "other" });
    expect(rows().length).toBe(1);
  });

  it("PATCH refuses a secret field and an unknown field, and changes nothing", async () => {
    const { id } = await connect();
    const before = rows()[0].credentialBlob;
    const secret = await call("PATCH", `/api/enterprise-integrations/connections/${id}/config`, { credentials: { password: "x" } });
    expect(secret.status).toBe(400); expect(secret.json.error).toContain("password");
    const unknown = await call("PATCH", `/api/enterprise-integrations/connections/${id}/config`, { credentials: { nope: "x" } });
    expect(unknown.status).toBe(400);
    expect(rows()[0].credentialBlob).toBe(before);
  });

  it("another organization cannot read or change a connection", async () => {
    const { id } = await connect();
    expect((await call("GET", `/api/enterprise-integrations/connections/${id}/config`, undefined, "org-2")).status).toBe(404);
    expect((await call("PATCH", `/api/enterprise-integrations/connections/${id}/config`, { credentials: { database: "x" } }, "org-2")).status).toBe(404);
  });
});

describe("testing a connection and the masked hint", () => {
  it("test decrypts the stored credentials, runs the health test and records the result", async () => {
    await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    healthCalls = [];
    G.__routePinsHealth = async (...a: any[]) => { healthCalls.push(a); return { ok: false, error: "bad password" }; };
    const res = await call("POST", "/api/enterprise-integrations/postgres/test");
    expect(res.json).toMatchObject({ ok: false, error: "bad password" });
    expect(healthCalls[0][1]).toEqual(PG);
    expect(rows()[0].lastTestResult).toBe("error");
  });

  it("test with nothing connected is a 404, and with a blob the vault cannot read a 500 that says so", async () => {
    await start();
    expect((await call("POST", "/api/enterprise-integrations/postgres/test")).status).toBe(404);
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    rows()[0].credentialBlob = "garbage-not-a-blob";
    const res = await call("POST", "/api/enterprise-integrations/postgres/test");
    expect(res.status).toBe(500);
    expect(res.json.error).toBe("Failed to decrypt credentials");
  });

  it("the second test route (/api/integrations/:id/test) behaves the same for a good blob", async () => {
    await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    healthCalls = [];
    expect((await call("POST", "/api/integrations/postgres/test")).json).toMatchObject({ ok: true });
    expect(healthCalls[0][1]).toEqual(PG);
    expect((await call("POST", "/api/integrations/mysql/test")).status).toBe(404);
  });

  it("credentials-hint lists the keys with masked values and never a full value", async () => {
    await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: { ...PG, password: "a-very-long-password-1234" } });
    const res = await call("GET", "/api/enterprise-integrations/postgres/credentials-hint");
    expect(res.json.keys.map((k: any) => k.key).sort()).toEqual(Object.keys(PG).sort());
    expect(res.json.keys.find((k: any) => k.key === "password").hint).toBe("••••••••1234");
    expect(res.text).not.toContain("a-very-long-password");
    expect((await call("GET", "/api/enterprise-integrations/mysql/credentials-hint")).json).toEqual({ keys: [] });
  });
});

describe("the organization's OAuth app", () => {
  it("the first save needs a secret; the secret is stored vault-encrypted and never returned; a later save without one keeps it", async () => {
    const { vault } = await start();
    const path = "/api/enterprise-integrations/msgraph/oauth-app";
    expect((await call("PUT", path, { clientId: "cid" })).status).toBe(400);
    const put = await call("PUT", path, { clientId: "cid", clientSecret: "s3cret-value", tenantId: "contoso.onmicrosoft.com" });
    expect(put.status).toBe(200);
    expect(put.text).not.toContain("s3cret-value");
    const row = fake().rows("integration_oauth_apps")[0];
    expect(decrypt(vault, row.clientSecretEncrypted)).toEqual({ client_secret: "s3cret-value" });

    const got = await call("GET", path);
    expect(got.json).toMatchObject({ configured: true, source: "organization", clientId: "cid", tenantId: "contoso.onmicrosoft.com", hasSecret: true });
    expect(got.text).not.toContain("s3cret-value");

    await call("PUT", path, { clientId: "cid-2" });
    const after = fake().rows("integration_oauth_apps")[0];
    expect(after.clientId).toBe("cid-2");
    expect(decrypt(vault, after.clientSecretEncrypted).client_secret).toBe("s3cret-value");
  });

  it("DELETE removes it and says whether there was one; an integration without OAuth is a 400", async () => {
    await start();
    const path = "/api/enterprise-integrations/msgraph/oauth-app";
    await call("PUT", path, { clientId: "cid", clientSecret: "s" });
    expect((await call("DELETE", path)).json).toEqual({ ok: true, removed: true });
    expect((await call("DELETE", path)).json).toEqual({ ok: true, removed: false });
    expect(fake().rows("integration_oauth_apps").length).toBe(0);
    expect((await call("PUT", "/api/enterprise-integrations/postgres/oauth-app", { clientId: "x", clientSecret: "y" })).status).toBe(400);
  });
});

describe("the OAuth callback", () => {
  it("exchanges the code with the organization's app and stores the tokens vault-encrypted on the connection", async () => {
    const { vault } = await start();
    await call("PUT", "/api/enterprise-integrations/msgraph/oauth-app", { clientId: "cid", clientSecret: "org-secret", tenantId: "contoso.onmicrosoft.com" });
    const started = await call("GET", "/api/integrations/oauth/start/msgraph");
    expect(started.status).toBe(200);
    expect(new URL(started.json.authUrl).searchParams.get("client_id")).toBe("cid");

    providerReply = () => ({ json: { access_token: "AT-1", refresh_token: "RT-1", expires_in: 3600 } });
    const cb = await call("GET", `/api/integrations/oauth/callback?state=${started.json.state}&code=the-code`);
    expect(cb.status).toBe(302);
    expect(cb.location).toBe("/integrations?oauth_success=msgraph");

    expect(providerCalls[0].url).toContain("login.microsoftonline.com/contoso.onmicrosoft.com/");
    expect(providerCalls[0].body).toMatchObject({ grant_type: "authorization_code", code: "the-code", client_id: "cid", client_secret: "org-secret" });
    expect(rows().length).toBe(1);
    expect(decrypt(vault, rows()[0].credentialBlob)).toEqual({ access_token: "AT-1", refresh_token: "RT-1", token_type: "Bearer" });
    expect(rows()[0].tokenExpiresAt).toBeInstanceOf(Date);
    expect(rows()[0].status).toBe("connected");
    expect(healthCalls[0][1]).toMatchObject({ access_token: "AT-1" });
  });

  it("a refused exchange or an unknown state stores nothing and redirects with the reason", async () => {
    await start();
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    const started = await call("GET", "/api/integrations/oauth/start/msgraph");
    providerReply = () => ({ ok: false, json: { error: "invalid_grant", error_description: "code expired" } });
    const cb = await call("GET", `/api/integrations/oauth/callback?state=${started.json.state}&code=x`);
    expect(cb.location).toBe("/integrations?oauth_error=code%20expired");
    expect((await call("GET", "/api/integrations/oauth/callback?state=unknown&code=x")).location).toBe("/integrations?oauth_error=state_expired");
    expect(rows().length).toBe(0);
  });
});

describe("the token refresh daemon", () => {
  const seed = async (vault: any, storage: any) => {
    process.env.OAUTH_MSGRAPH_CLIENT_ID = "env-id"; process.env.OAUTH_MSGRAPH_CLIENT_SECRET = "env-secret";
    const soon = new Date(Date.now() + 60_000), later = new Date(Date.now() + 3_600_000);
    const mk = (name: string, creds: Record<string, string> | string, exp: Date) => storage.createIntegrationConnection({
      organizationId: "org-1", integrationId: "msgraph", name, status: "connected", tokenExpiresAt: exp,
      credentialBlob: typeof creds === "string" ? creds : vault.encryptCredentialMap(creds),
    });
    return {
      a: await mk("A", { access_token: "A-OLD", refresh_token: "RA" }, soon),
      b: await mk("B", { access_token: "B-OLD", refresh_token: "RB" }, soon),
      c: await mk("C", { access_token: "C-OLD", refresh_token: "RC" }, later),
      d: await mk("D", "garbage-not-a-blob", soon),
    };
  };

  it("refreshes every expiring connection with its own refresh token, writes each back to itself, and leaves the others alone", async () => {
    const { vault, storage } = await start();
    const { a, b, c, d } = await seed(vault, storage);
    const cBefore = rows().find((r) => r.id === c.id).credentialBlob;
    const dBefore = rows().find((r) => r.id === d.id).credentialBlob;
    providerReply = (body) => ({ json: { access_token: `NEW-${body.refresh_token}`, expires_in: 3600 } });

    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const mod = await import("../server/routes/enterprise-integrations");
    mod.startTokenRefreshDaemon();
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000 + 10);
    vi.useRealTimers();

    const by = (id: string) => rows().find((r) => r.id === id);
    expect(decrypt(vault, by(a.id).credentialBlob)).toEqual({ access_token: "NEW-RA", refresh_token: "RA", token_type: "Bearer" });
    expect(decrypt(vault, by(b.id).credentialBlob)).toEqual({ access_token: "NEW-RB", refresh_token: "RB", token_type: "Bearer" });
    expect(by(c.id).credentialBlob).toBe(cBefore);
    expect(by(d.id).credentialBlob).toBe(dBefore);
    expect(providerCalls.map((p) => p.body.refresh_token).sort()).toEqual(["RA", "RB"]);
    expect(providerCalls[0].body).toMatchObject({ grant_type: "refresh_token", client_id: "env-id", client_secret: "env-secret" });
    expect(by(a.id).isDefault).toBe(true);
    expect(by(b.id).isDefault).toBe(false);
  });

  it("a refusal for one connection leaves its blob as it was and does not stop the next", async () => {
    const { vault, storage } = await start();
    const { a, b } = await seed(vault, storage);
    const aBefore = rows().find((r) => r.id === a.id).credentialBlob;
    providerReply = (body) => body.refresh_token === "RA" ? { ok: false, json: {} } : { json: { access_token: "NEW-RB" } };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const mod = await import("../server/routes/enterprise-integrations");
    mod.startTokenRefreshDaemon();
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000 + 10);
    vi.useRealTimers();

    expect(rows().find((r) => r.id === a.id).credentialBlob).toBe(aBefore);
    expect(decrypt(vault, rows().find((r) => r.id === b.id).credentialBlob).access_token).toBe("NEW-RB");
  });
});

describe("disconnect and delete", () => {
  it("disconnecting a type empties its blob and marks it disconnected; another organization's connection is untouched", async () => {
    await start();
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG });
    await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG }, "org-2");
    expect((await call("POST", "/api/enterprise-integrations/postgres/disconnect")).json).toEqual({ ok: true });
    const mine = rows().find((r) => r.organizationId === "org-1"), theirs = rows().find((r) => r.organizationId === "org-2");
    expect(mine.credentialBlob).toBeNull(); expect(mine.status).toBe("disconnected");
    expect(theirs.credentialBlob).not.toBeNull(); expect(theirs.status).toBe("connected");
    expect((await call("GET", "/api/enterprise-integrations/postgres/credentials-hint")).json).toEqual({ keys: [] });
  });

  it("disconnecting one connection empties that one only", async () => {
    await start();
    const a = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "A" });
    const b = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "B", createNew: true });
    expect((await call("POST", `/api/enterprise-integrations/connections/${b.json.id}/disconnect`)).json).toMatchObject({ ok: true, wasDefault: false });
    expect(rows().find((r) => r.id === b.json.id).credentialBlob).toBeNull();
    expect(rows().find((r) => r.id === a.json.id).credentialBlob).not.toBeNull();
  });

  it("deleting a connection removes its row, and the survivor becomes the default when the default was deleted", async () => {
    await start();
    const a = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "A" });
    const b = await call("POST", "/api/enterprise-integrations/postgres/connect", { credentials: PG, name: "B", createNew: true });
    const del = await call("DELETE", `/api/enterprise-integrations/connections/${a.json.id}`);
    expect(del.json).toMatchObject({ ok: true, deletedConnectionId: a.json.id, newDefaultConnectionId: b.json.id });
    expect(rows().map((r) => r.id)).toEqual([b.json.id]);
    expect(rows()[0].isDefault).toBe(true);
    expect((await call("DELETE", `/api/enterprise-integrations/connections/${a.json.id}`)).status).toBe(404);
  });
});
