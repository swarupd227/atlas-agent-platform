/**
 * SCIM provisioning from Microsoft Entra ID (server/scim.ts, server/routes/scim.ts) and the ending of a
 * deprovisioned person's session (server/session-revocation.ts, server/auth.ts).
 *
 * Four parts: configuration and the token; the handlers over an in-memory people table with the real
 * uniqueness rules; the real HTTP surface (Express, a bearer token, application/scim+json); and revocation
 * through the real authMiddleware. What it proves above all: SCIM can only ever see and change people who sign
 * in through SSO in the configured tenant, never a local account; removing someone ends their sessions and
 * their next sign-in; and a password session still costs no database query (tests/auth-session.test.ts pins
 * that, written before this existed).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({ audit: [] as any[], queries: 0 }));
vi.mock("../server/db", () => {
  const ask = () => { h.queries++; return Promise.resolve([]); };
  const chain: any = { from: () => chain, where: () => chain, then: (res: any, rej: any) => ask().then(res, rej) };
  return { pool: {}, db: { select: () => chain, insert: () => ({ values: () => ({ returning: ask }) }), update: () => ({ set: () => ({ where: ask }) }) } };
});
vi.mock("../server/storage", () => ({
  storage: {
    seedDefaultOrganization: vi.fn(async () => ({ id: "org-1" })),
    createAuditEvent: vi.fn(async (e: any) => { h.audit.push(e); return e; }),
  },
}));

import scimRouter, { setScimStoreForTests } from "../server/routes/scim";
import { authMiddleware, generateToken, setDefaultOrgId } from "../server/auth";
import { SESSION_CACHE_MS, checkSession, forgetSession, scimSwitchedOn, setSessionLoaderForTests, type SessionState } from "../server/session-revocation";
import { NO_PASSWORD, resolveUser, readSsoConfig, type SsoUser, type SsoUserStore } from "../server/sso";
import {
  SCIM_FALLBACK_ROLE, describeScim, handleScim, readScimConfig, scimOrNull, tokenValid, validateScimEnv,
  type ScimConfig, type ScimDeps, type ScimPatch, type ScimStore, type ScimUserRow,
} from "../server/scim";
import { ROLE_IDS } from "../server/permissions";

const TENANT = "11111111-2222-3333-4444-555555555555";
const TOKEN = "t".repeat(20) + "o".repeat(20);
const NEXT = "n".repeat(20) + "e".repeat(20);
const oid = (n: number) => `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`;
const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";

const ENV_KEYS = ["ASTRA_SSO", "ASTRA_SSO_FILE", "ASTRA_SSO_CLIENT_SECRET", "ASTRA_SSO_CLIENT_SECRET_FILE", "ASTRA_SCIM_TOKEN", "ASTRA_SCIM_TOKEN_FILE", "ASTRA_SCIM_TOKEN_NEXT", "ASTRA_SCIM_TOKEN_NEXT_FILE", "SECURITY_MODE", "JWT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

const ssoJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  tenantId: TENANT, clientId: "client-1", redirectUri: "https://astra.example.com/api/auth/sso/callback",
  roles: { map: { "Astra.Admin": "admin", "Astra.Finance": "finance", "Astra.Engineer": "agent_engineer" } },
  ...over,
});
const configure = (over: Record<string, unknown> = {}, tokens: { first?: string | null; next?: string | null } = {}) => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SECURITY_MODE = "production";
  process.env.JWT_SECRET = "scim-test-jwt-secret";
  process.env.ASTRA_SSO = ssoJson(over);
  process.env.ASTRA_SSO_CLIENT_SECRET = "s3cret";
  if (tokens.first !== null) process.env.ASTRA_SCIM_TOKEN = tokens.first ?? TOKEN;
  if (tokens.next) process.env.ASTRA_SCIM_TOKEN_NEXT = tokens.next;
};
afterAll(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

// ── An in-memory people table with the real uniqueness rules ────────────────
let rows: ScimUserRow[] = [];
let stamps = new Map<string, Date>();
let nextId = 1;
const dup = (what: string) => new Error(`duplicate key value violates unique constraint "${what}"`);
const memStore: ScimStore = {
  async list(scope, filter, start, count) {
    let r = rows.filter((x) => x.authSource === "sso" && x.externalId?.startsWith(`${scope.tenantId}:`) && x.organizationId === scope.organizationId);
    if (filter?.userName !== undefined) r = r.filter((x) => x.username.toLowerCase() === filter.userName!.toLowerCase());
    if (filter?.externalId !== undefined) r = r.filter((x) => x.externalId === filter.externalId);
    r = r.sort((a, b) => (a.externalId ?? "").localeCompare(b.externalId ?? ""));
    return { rows: r.slice(start - 1, start - 1 + count), total: r.length };
  },
  async get(id) { return rows.find((x) => x.id === id); },
  async findByExternalId(e) { return rows.find((x) => x.externalId === e); },
  async findByUserName(n) { return rows.find((x) => x.username.toLowerCase() === n.toLowerCase()); },
  async create(row) {
    if (rows.some((x) => x.username === row.username)) throw dup("users_username_unique");
    if (rows.some((x) => x.externalId === row.externalId)) throw dup("idx_users_external_id");
    const u: ScimUserRow = { id: `u${nextId++}`, authSource: "sso", ...row };
    rows.push(u);
    return { ...u };
  },
  async update(id, patch: ScimPatch) {
    const u = rows.find((x) => x.id === id)!;
    const { sessionsValidAfter, ...rest } = patch;
    Object.assign(u, rest);
    if (sessionsValidAfter) stamps.set(id, sessionsValidAfter);
    return { ...u };
  },
  async defaultOrganizationId() { return "org-1"; },
};
const local = (over: Partial<ScimUserRow> = {}): ScimUserRow => ({ id: `local${nextId++}`, username: "ana@hilti.example", email: "ana@hilti.example", role: "admin", organizationId: "org-1", externalId: null, authSource: "local", active: true, ...over });

const NOW = new Date("2026-10-10T10:00:00Z");
let forgot: string[] = [];
let cfg: ScimConfig;
const deps = (): ScimDeps => ({ cfg, store: memStore, audit: (action, row, details) => h.audit.push({ action, objectId: row?.id, details }), forget: (id) => forgot.push(id), now: () => NOW });
const call = (method: string, p: string, body?: unknown, query: Record<string, unknown> = {}) => handleScim(deps(), method, p, query, body);
const person = (n: number, over: Record<string, unknown> = {}) => ({
  schemas: [USER_SCHEMA], userName: `user${n}@hilti.example`, externalId: oid(n), active: true,
  emails: [{ value: `user${n}@hilti.example`, type: "work", primary: true }], ...over,
});
const provision = async (n: number, over: Record<string, unknown> = {}) => {
  const r = await call("POST", "/Users", person(n, over));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return (r.body as any).id as string;
};
const active = (id: string) => rows.find((r) => r.id === id)!.active;
const patchOps = (...Operations: unknown[]) => ({ schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations });

beforeEach(() => {
  configure();
  cfg = readScimConfig()!;
  rows = []; stamps = new Map(); nextId = 1; forgot = []; h.audit.length = 0; h.queries = 0;
});

// ═══ Configuration ═══════════════════════════════════════════════════════════

describe("configuration", () => {
  it("is off unless a token is set", () => {
    configure({}, { first: null });
    expect(readScimConfig()).toBeNull();
    expect(scimOrNull()).toBeNull();
    expect(validateScimEnv()).toEqual([]);
    expect(describeScim()).toBe("scim=off");
  });

  it("is on with a token and single sign-on, tied to the tenant and the sign-in host", () => {
    const c = readScimConfig()!;
    expect(c.tokens).toEqual([TOKEN]);
    expect(c.sso.tenantId).toBe(TENANT);
    expect(c.baseUrl).toBe("https://astra.example.com/scim/v2");
    expect(c.organizationId).toBeNull();
    expect(describeScim()).toBe("scim=on");
    expect(validateScimEnv()).toEqual([]);
  });

  it("takes the organization from the SSO settings", () => {
    configure({ organizationId: "org-hilti" });
    expect(readScimConfig()!.organizationId).toBe("org-hilti");
  });

  it("refuses to start with a token and no single sign-on", () => {
    delete process.env.ASTRA_SSO; delete process.env.ASTRA_SSO_CLIENT_SECRET;
    expect(() => readScimConfig()).toThrow(/needs single sign-on/);
    expect(validateScimEnv()[0]).toMatch(/SCIM provisioning is misconfigured: SCIM needs single sign-on/);
    expect(describeScim()).toBe("scim=invalid");
    expect(scimOrNull()).toBeNull();
  });

  it("refuses a token that is too short to be a secret", () => {
    configure({}, { first: "short" });
    expect(() => readScimConfig()).toThrow(/at least 32 characters/);
    configure({}, { next: "short" });
    expect(() => readScimConfig()).toThrow(/at least 32 characters/);
  });

  it("refuses two identical tokens, and a second one without a first", () => {
    configure({}, { next: TOKEN });
    expect(() => readScimConfig()).toThrow(/must differ/);
    configure({}, { first: null });
    process.env.ASTRA_SCIM_TOKEN_NEXT = NEXT;
    expect(() => readScimConfig()).toThrow(/ASTRA_SCIM_TOKEN_NEXT is set without ASTRA_SCIM_TOKEN/);
  });

  it("reads a token from a mounted file, and refuses both a value and a file", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "scim-"));
    const file = path.join(dir, "token");
    writeFileSync(file, `${NEXT}\n`);
    configure({}, { first: null });
    process.env.ASTRA_SCIM_TOKEN_FILE = file;
    expect(readScimConfig()!.tokens).toEqual([NEXT]);
    process.env.ASTRA_SCIM_TOKEN = TOKEN;
    expect(() => readScimConfig()).toThrow(/ASTRA_SCIM_TOKEN or ASTRA_SCIM_TOKEN_FILE, not both/);
  });

  it("never puts a token in what it says about itself", () => {
    configure({}, { next: NEXT });
    expect(describeScim()).not.toContain(TOKEN);
    expect(describeScim()).not.toContain(NEXT);
    configure({}, { first: "short" });
    expect(validateScimEnv().join(" ")).not.toContain("short");
  });

  it("scimSwitchedOn follows the token, by value or by file", () => {
    expect(scimSwitchedOn({})).toBe(false);
    expect(scimSwitchedOn({ ASTRA_SCIM_TOKEN: "  " })).toBe(false);
    expect(scimSwitchedOn({ ASTRA_SCIM_TOKEN: TOKEN })).toBe(true);
    expect(scimSwitchedOn({ ASTRA_SCIM_TOKEN_FILE: "/run/secrets/scim" })).toBe(true);
    expect(scimSwitchedOn({ ASTRA_SCIM_TOKEN_NEXT: NEXT })).toBe(false);
  });
});

describe("the token", () => {
  it("is accepted when it is exactly one of the configured ones", () => {
    configure({}, { next: NEXT });
    const c = readScimConfig()!;
    expect(tokenValid(c, TOKEN)).toBe(true);
    expect(tokenValid(c, NEXT)).toBe(true);
    for (const wrong of ["", " ", TOKEN.slice(1), TOKEN.slice(0, -1), TOKEN + "x", TOKEN.toUpperCase(), "x".repeat(40), TOKEN + NEXT]) {
      expect(tokenValid(c, wrong), wrong).toBe(false);
    }
  });
});

// ═══ The handlers ════════════════════════════════════════════════════════════

describe("discovery", () => {
  it("says what it supports: patch and filters, no bulk, no passwords, a bearer token", async () => {
    const r = await call("GET", "/ServiceProviderConfig");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ patch: { supported: true }, bulk: { supported: false }, filter: { supported: true }, changePassword: { supported: false }, sort: { supported: false } });
    expect((r.body as any).authenticationSchemes[0].type).toBe("oauthbearertoken");
    expect(((await call("GET", "/ResourceTypes")).body as any).Resources[0]).toMatchObject({ name: "User", endpoint: "/Users" });
    expect(((await call("GET", "/Schemas")).body as any).Resources[0].id).toBe(USER_SCHEMA);
  });

  it("has no groups, and nothing else", async () => {
    for (const p of ["/Groups", "/Groups/abc", "/Nothing", "/", "/Users/a/b"]) expect((await call("GET", p)).status, p).toBe(404);
    expect(((await call("GET", "/Groups")).body as any).detail).toMatch(/Groups are not supported/);
  });

  it("answers a wrong method with 405", async () => {
    expect((await call("DELETE", "/Users")).status).toBe(405);
    expect((await call("POST", "/ServiceProviderConfig")).status).toBe(405);
    expect((await call("PUT", "/Users")).status).toBe(405);
    const id = await provision(1);
    expect((await call("POST", `/Users/${id}`, {})).status).toBe(405);
  });

  it("ignores a trailing slash and the case of the method", async () => {
    expect((await call("get", "/Users/")).status).toBe(200);
    expect((await call("GET", "/ServiceProviderConfig/")).status).toBe(200);
  });
});

describe("provisioning a person", () => {
  it("creates them, tied to their Entra object id, with no password that could match", async () => {
    const r = await call("POST", "/Users", person(1));
    expect(r.status).toBe(201);
    const b = r.body as any;
    expect(b).toMatchObject({ schemas: [USER_SCHEMA], externalId: oid(1), userName: "user1@hilti.example", active: true, emails: [{ value: "user1@hilti.example", type: "work", primary: true }] });
    expect(b.meta).toEqual({ resourceType: "User", location: `https://astra.example.com/scim/v2/Users/${b.id}` });
    expect(r.headers).toEqual({ Location: b.meta.location });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ authSource: "sso", externalId: `${TENANT}:${oid(1)}`, organizationId: "org-1", active: true, email: "user1@hilti.example" });
    expect(JSON.stringify(b)).not.toMatch(/password|!sso-no-password/i);
    expect(NO_PASSWORD).toBe("!sso-no-password");
  });

  it("files them under the SSO organization when there is one", async () => {
    configure({ organizationId: "org-hilti" });
    cfg = readScimConfig()!;
    await provision(1);
    expect(rows[0].organizationId).toBe("org-hilti");
  });

  it("lower-cases the object id, so it is the same key whichever way it was written", async () => {
    const id = await provision(1, { externalId: oid(1).toUpperCase() });
    expect(rows.find((r) => r.id === id)!.externalId).toBe(`${TENANT}:${oid(1)}`);
    expect(((await call("POST", "/Users", person(1))).body as any).scimType).toBe("uniqueness");
  });

  it("needs a user name, and an object id that is a GUID (the default Entra mapping sends mailNickname)", async () => {
    for (const body of [person(1, { userName: undefined }), person(1, { userName: "" }), person(1, { userName: 7 }), person(1, { userName: "x".repeat(201) }), person(1, { userName: "a\u0000b" })]) {
      expect(await call("POST", "/Users", body)).toMatchObject({ status: 400, body: { scimType: "invalidValue" } });
    }
    for (const externalId of [undefined, "", "ana", "ana.example", 123, "not-a-guid", `${oid(1)}-extra`]) {
      const r = await call("POST", "/Users", person(1, { externalId }));
      expect(r, String(externalId)).toMatchObject({ status: 400, body: { scimType: "invalidValue" } });
      expect((r.body as any).detail).toMatch(/objectId/);
    }
    expect(rows).toHaveLength(0);
  });

  it("refuses a body that is not a JSON object", async () => {
    for (const body of [undefined, null, "x", 5, [], [person(1)]]) expect((await call("POST", "/Users", body)).status, JSON.stringify(body)).toBe(400);
  });

  it("refuses the same person twice (409), and does not change the first", async () => {
    const id = await provision(1);
    const r = await call("POST", "/Users", person(1, { userName: "someone.else@hilti.example" }));
    expect(r).toMatchObject({ status: 409, body: { scimType: "uniqueness" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, username: "user1@hilti.example" });
  });

  it("refuses a user name that belongs to another account, a local one included, and never merges with it", async () => {
    rows.push(local({ username: "user1@hilti.example", email: "user1@hilti.example", role: "admin" }));
    const before = JSON.stringify(rows[0]);
    for (const userName of ["user1@hilti.example", "USER1@Hilti.Example"]) {
      expect(await call("POST", "/Users", person(1, { userName }))).toMatchObject({ status: 409, body: { scimType: "uniqueness" } });
    }
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).toBe(before);
  });

  it("turns a uniqueness failure from the database into 409 too", async () => {
    const racing: ScimStore = { ...memStore, async create() { throw dup("idx_users_external_id"); } };
    const r = await handleScim({ ...deps(), store: racing }, "POST", "/Users", {}, person(1));
    expect(r).toMatchObject({ status: 409, body: { scimType: "uniqueness" } });
  });

  it("can create someone inactive, and reads active as a word too", async () => {
    expect(active(await provision(1, { active: false }))).toBe(false);
    expect(active(await provision(2, { active: "False" }))).toBe(false);
    expect(active(await provision(3, { active: "true" }))).toBe(true);
    expect(active(await provision(4, { active: undefined }))).toBe(true);
    expect(await call("POST", "/Users", person(5, { active: "maybe" }))).toMatchObject({ status: 400, body: { scimType: "invalidValue" } });
  });

  it("picks the e-mail: primary, then work, then the first; none is fine; a non-address is refused", async () => {
    const mail = (emails: unknown, n: number) => provision(n, { emails }).then((id) => rows.find((r) => r.id === id)!.email);
    expect(await mail([{ value: "a@x.io" }, { value: "B@X.IO", primary: true }], 1)).toBe("b@x.io");
    expect(await mail([{ value: "a@x.io", type: "home" }, { value: "w@x.io", type: "work" }], 2)).toBe("w@x.io");
    expect(await mail([{ value: "first@x.io" }, { value: "second@x.io" }], 3)).toBe("first@x.io");
    expect(await mail(undefined, 4)).toBeNull();
    expect(await mail([], 5)).toBeNull();
    expect(await call("POST", "/Users", person(6, { emails: [{ value: "not-an-address" }] }))).toMatchObject({ status: 400 });
    expect(await call("POST", "/Users", person(7, { emails: [{ value: `${"a".repeat(250)}@x.io` }] }))).toMatchObject({ status: 400 });
  });

  it("works out the role from the app roles, the most privileged winning, the least privileged when there is none", async () => {
    const roleOf = (n: number, roles?: unknown) => provision(n, { roles }).then((id) => rows.find((r) => r.id === id)!.role);
    expect(await roleOf(1, [{ value: "Astra.Finance" }])).toBe("finance");
    expect(await roleOf(2, [{ value: "Astra.Finance" }, { value: "Astra.Admin" }, { value: "Astra.Engineer" }])).toBe("admin");
    expect(await roleOf(3, [{ value: "Something.Else" }])).toBe(SCIM_FALLBACK_ROLE);
    expect(await roleOf(4, undefined)).toBe(SCIM_FALLBACK_ROLE);
    expect(await roleOf(5, [])).toBe(SCIM_FALLBACK_ROLE);
    expect(await roleOf(6, ["Astra.Admin"])).toBe("admin");
    expect(ROLE_IDS).toContain(SCIM_FALLBACK_ROLE);
    // Spelled out, because a constant compared with itself proves nothing: the role nobody was asked about is the least privileged.
    expect(SCIM_FALLBACK_ROLE).toBe("domain_expert");
    expect(rows.filter((r) => r.role === "admin").map((r) => r.externalId)).toEqual([`${TENANT}:${oid(2)}`, `${TENANT}:${oid(6)}`]);
  });

  it("uses the SSO default role when no mapped role applies", async () => {
    configure({ roles: { map: { "Astra.Admin": "admin" }, default: "finance" } });
    cfg = readScimConfig()!;
    const id = await provision(1, { roles: [{ value: "Nothing.Mapped" }] });
    expect(rows.find((r) => r.id === id)!.role).toBe("finance");
  });

  it("a role is never taken from the request as an Astra role, only through the map", async () => {
    const id = await provision(1, { roles: [{ value: "admin" }] });
    expect(rows.find((r) => r.id === id)!.role).toBe(SCIM_FALLBACK_ROLE);
  });

  it("records who was provisioned without recording their address", async () => {
    await provision(1, { roles: [{ value: "Astra.Admin" }] });
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({ action: "scim.user_created", details: { active: true, role: "admin" } });
    expect(JSON.stringify(h.audit)).not.toContain("hilti.example");
  });
});

describe("finding people", () => {
  beforeEach(async () => {
    for (const n of [3, 1, 2]) await provision(n);
    rows.push(local({ username: "user1-local@hilti.example" }));
    rows.push({ ...local(), username: "other-tenant", authSource: "sso", externalId: `99999999-0000-0000-0000-000000000000:${oid(9)}` });
    rows.push({ ...local(), username: "other-org", authSource: "sso", externalId: `${TENANT}:${oid(8)}`, organizationId: "org-2" });
  });

  it("lists only the SSO people of this tenant and organization, in a steady order", async () => {
    const r = (await call("GET", "/Users")).body as any;
    expect(r).toMatchObject({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: 3, startIndex: 1, itemsPerPage: 3 });
    expect(r.Resources.map((u: any) => u.externalId)).toEqual([oid(1), oid(2), oid(3)]);
  });

  it("finds one by user name (any case) or by object id, and an unknown one is an empty list, not an error", async () => {
    expect(((await call("GET", "/Users", undefined, { filter: 'userName eq "USER2@hilti.example"' })).body as any).Resources.map((u: any) => u.externalId)).toEqual([oid(2)]);
    expect(((await call("GET", "/Users", undefined, { filter: `externalId eq "${oid(3).toUpperCase()}"` })).body as any).Resources.map((u: any) => u.userName)).toEqual(["user3@hilti.example"]);
    expect(await call("GET", "/Users", undefined, { filter: 'userName eq "nobody"' })).toMatchObject({ status: 200, body: { totalResults: 0, itemsPerPage: 0, Resources: [] } });
  });

  it("does not find a local account, or someone in another tenant or organization, by name or by id", async () => {
    expect(((await call("GET", "/Users", undefined, { filter: 'userName eq "user1-local@hilti.example"' })).body as any).totalResults).toBe(0);
    expect(((await call("GET", "/Users", undefined, { filter: 'userName eq "other-tenant"' })).body as any).totalResults).toBe(0);
    expect(((await call("GET", "/Users", undefined, { filter: 'userName eq "other-org"' })).body as any).totalResults).toBe(0);
    expect(((await call("GET", "/Users", undefined, { filter: `externalId eq "${oid(9)}"` })).body as any).totalResults).toBe(0);
  });

  it("reads a quoted filter value the way it was written", async () => {
    await provision(7, { userName: 'o"brien@hilti.example' });
    expect(((await call("GET", "/Users", undefined, { filter: 'userName eq "o\\"brien@hilti.example"' })).body as any).totalResults).toBe(1);
  });

  it("refuses every filter it does not understand", async () => {
    for (const filter of ['userName co "x"', 'userName eq "a" and active eq true', "active eq true", 'emails.value eq "a@x.io"', "userName eq x", 'displayName eq "x"', 5, ['userName eq "a"']]) {
      expect(await call("GET", "/Users", undefined, { filter }), String(filter)).toMatchObject({ status: 400, body: { scimType: "invalidFilter" } });
    }
  });

  it("pages: startIndex from 1, count up to 200, count 0 just the total, junk falls back", async () => {
    const page = async (query: Record<string, unknown>) => (await call("GET", "/Users", undefined, query)).body as any;
    expect((await page({ startIndex: "2", count: "1" })).Resources.map((u: any) => u.externalId)).toEqual([oid(2)]);
    expect(await page({ count: "0" })).toMatchObject({ totalResults: 3, itemsPerPage: 0, Resources: [] });
    expect((await page({ startIndex: "0", count: "-5" })).startIndex).toBe(1);
    expect((await page({ startIndex: "10" })).Resources).toEqual([]);
    expect((await page({ count: "abc" })).itemsPerPage).toBe(3);
    expect((await page({ count: "100000" })).itemsPerPage).toBe(3);
  });

  it("asks the store for at most 200 at a time, from the start index it was given, in this tenant and organization", async () => {
    const asked: Array<{ scope: unknown; filter: unknown; start: number; count: number }> = [];
    const spy: ScimStore = { ...memStore, async list(scope, filter, start, count) { asked.push({ scope, filter, start, count }); return memStore.list(scope, filter, start, count); } };
    const ask = (query: Record<string, unknown>) => handleScim({ ...deps(), store: spy }, "GET", "/Users", query, undefined);
    await ask({ count: "100000", startIndex: "3" });
    await ask({});
    await ask({ count: "0" });
    expect(asked.map((a) => [a.start, a.count])).toEqual([[3, 200], [1, 100], [1, 1]]);
    expect(asked[0].scope).toEqual({ organizationId: "org-1", tenantId: TENANT });
    expect(asked[0].filter).toBeNull();
  });

  it("gets one by id, and a local, foreign or odd id is simply not there", async () => {
    const id = rows.find((r) => r.externalId === `${TENANT}:${oid(2)}`)!.id;
    expect(await call("GET", `/Users/${id}`)).toMatchObject({ status: 200, body: { id, externalId: oid(2) } });
    const localId = rows.find((r) => r.authSource === "local")!.id;
    const foreign = rows.find((r) => r.username === "other-tenant")!.id;
    const foreignOrg = rows.find((r) => r.username === "other-org")!.id;
    for (const bad of [localId, foreign, foreignOrg, "nope", "x".repeat(200), "a%20b", ".."]) expect((await call("GET", `/Users/${bad}`)).status, bad).toBe(404);
  });
});

describe("a local account is out of reach", () => {
  it("cannot be read, replaced, patched or deleted, and is left exactly as it was", async () => {
    const mine = local({ username: "admin", role: "admin", email: "admin@hilti.example" });
    rows.push(mine);
    const before = JSON.stringify(rows);
    const attempts: Array<[string, unknown?]> = [
      ["GET"], ["PUT", person(1, { userName: "admin" })], ["PATCH", patchOps({ op: "replace", path: "active", value: false })],
      ["PATCH", patchOps({ op: "replace", path: "userName", value: "hacked" })], ["DELETE"],
    ];
    for (const [m, body] of attempts) expect((await call(m, `/Users/${mine.id}`, body)).status, m).toBe(404);
    expect(JSON.stringify(rows)).toBe(before);
    expect(forgot).toEqual([]);
    expect(h.audit).toEqual([]);
  });

  it("stays out of reach even if it somehow carries an object id of this tenant: the way it signs in decides, not the id", async () => {
    const odd = local({ username: "odd", authSource: "local", externalId: `${TENANT}:${oid(77)}`, role: "admin" });
    rows.push(odd);
    const before = JSON.stringify(rows);
    for (const [m, body] of [["GET"], ["PUT", person(77, { userName: "odd" })], ["PATCH", patchOps({ op: "replace", path: "active", value: false })], ["DELETE"]] as Array<[string, unknown?]>) {
      expect((await call(m, `/Users/${odd.id}`, body)).status, m).toBe(404);
    }
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("is not made an SSO person by sending its object id or e-mail", async () => {
    rows.push(local({ username: "admin", email: "ana@hilti.example", role: "admin" }));
    const r = await call("POST", "/Users", person(1, { userName: "ana@hilti.example", emails: [{ value: "ana@hilti.example", primary: true }] }));
    expect(r.status).toBe(201);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ username: "admin", authSource: "local", role: "admin", externalId: null });
  });
});

describe("changing a person", () => {
  it("replaces what they hold, and keeps what the request does not mention", async () => {
    const id = await provision(1, { roles: [{ value: "Astra.Finance" }] });
    const r = await call("PUT", `/Users/${id}`, person(1, { userName: "renamed@hilti.example", emails: [{ value: "new@hilti.example", primary: true }], active: undefined, roles: undefined }));
    expect(r.status).toBe(200);
    expect(rows[0]).toMatchObject({ username: "renamed@hilti.example", email: "new@hilti.example", role: "finance", active: true });
    expect(h.audit.at(-1)).toMatchObject({ action: "scim.user_updated", details: { changed: ["userName", "email"] } });
  });

  it("will not change who they are: another object id is refused", async () => {
    const id = await provision(1);
    expect(await call("PUT", `/Users/${id}`, person(1, { externalId: oid(2) }))).toMatchObject({ status: 400, body: { scimType: "mutability" } });
    expect(await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "externalId", value: oid(2) }))).toMatchObject({ status: 400, body: { scimType: "mutability" } });
    expect(rows[0].externalId).toBe(`${TENANT}:${oid(1)}`);
  });

  it("will not take another account's user name", async () => {
    const id = await provision(1);
    await provision(2);
    rows.push(local({ username: "taken" }));
    for (const name of ["user2@hilti.example", "USER2@HILTI.EXAMPLE", "taken"]) {
      expect(await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "userName", value: name })), name).toMatchObject({ status: 409, body: { scimType: "uniqueness" } });
    }
    expect(rows[0].username).toBe("user1@hilti.example");
    expect((await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "userName", value: "USER1@hilti.example" }))).status).toBe(200);
  });

  it("applies the operations Entra sends: by path, as an object without a path, with words for booleans, the op in any case", async () => {
    const id = await provision(1);
    expect((await call("PATCH", `/Users/${id}`, patchOps({ op: "Replace", path: "emails[type eq \"work\"].value", value: "Work@Hilti.example" }))).status).toBe(200);
    expect(rows[0].email).toBe("work@hilti.example");
    expect((await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", value: { userName: "obj@hilti.example", active: "False" } }))).status).toBe(200);
    expect(rows[0]).toMatchObject({ username: "obj@hilti.example", active: false });
    expect((await call("PATCH", `/Users/${id}`, { Operations: [{ op: "add", path: "active", value: "True" }] })).status).toBe(200);
    expect(rows[0].active).toBe(true);
    expect((await call("PATCH", `/Users/${id}`, { operations: [{ op: "remove", path: "emails" }] })).status).toBe(200);
    expect(rows[0].email).toBeNull();
  });

  it("ignores attributes it does not keep, without failing the request", async () => {
    const id = await provision(1);
    const r = await call("PATCH", `/Users/${id}`, patchOps(
      { op: "replace", path: "displayName", value: "Ana" }, { op: "replace", path: "name.givenName", value: "Ana" },
      { op: "add", path: "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager", value: "m" },
    ));
    expect(r.status).toBe(200);
    expect(h.audit.filter((a) => a.action === "scim.user_updated")).toEqual([]);
  });

  it("changes the role through the same map, and a remove falls back to the least privileged", async () => {
    const id = await provision(1, { roles: [{ value: "Astra.Admin" }] });
    await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "roles", value: [{ value: "Astra.Finance" }] }));
    expect(rows[0].role).toBe("finance");
    await call("PATCH", `/Users/${id}`, patchOps({ op: "remove", path: "roles" }));
    expect(rows[0].role).toBe(SCIM_FALLBACK_ROLE);
    await call("PATCH", `/Users/${id}`, patchOps({ op: "add", path: 'roles[value eq "Astra.Admin"]', value: [{ value: "Astra.Admin" }] }));
    expect(rows[0].role).toBe("admin");
    await call("PATCH", `/Users/${id}`, patchOps({ op: "remove", path: 'roles[value eq "Astra.Admin"]' }));
    expect(rows[0].role).toBe("admin");
  });

  it("refuses a malformed patch", async () => {
    const id = await provision(1);
    for (const body of [undefined, {}, { Operations: [] }, { Operations: "x" }, patchOps({ op: "move", path: "active" }), patchOps({ path: "active", value: false }), patchOps({ op: "replace", value: "x" }), patchOps({ op: "replace", path: "active", value: "perhaps" }), patchOps(5), { Operations: Array.from({ length: 51 }, () => ({ op: "replace", path: "displayName", value: "x" })) }]) {
      expect((await call("PATCH", `/Users/${id}`, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(rows[0].active).toBe(true);
  });

  it("makes no change, and says nothing, when nothing differs", async () => {
    const id = await provision(1);
    h.audit.length = 0;
    expect((await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "active", value: true }, { op: "replace", path: "userName", value: "user1@hilti.example" }))).status).toBe(200);
    expect(h.audit).toEqual([]);
    expect(forgot).toEqual([]);
  });
});

describe("removing a person", () => {
  it("deactivating (patch) stamps the moment, ends what is remembered of their session, and is written down", async () => {
    const id = await provision(1);
    h.audit.length = 0;
    const r = await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "active", value: "False" }));
    expect(r).toMatchObject({ status: 200, body: { active: false } });
    expect(rows[0].active).toBe(false);
    expect(stamps.get(id)).toEqual(NOW);
    expect(forgot).toEqual([id]);
    expect(h.audit).toEqual([{ action: "scim.user_deactivated", objectId: id, details: { changed: [] } }]);
  });

  it("deactivating by PUT does the same", async () => {
    const id = await provision(1);
    await call("PUT", `/Users/${id}`, person(1, { active: false }));
    expect(rows[0].active).toBe(false);
    expect(stamps.get(id)).toEqual(NOW);
    expect(forgot).toEqual([id]);
  });

  it("DELETE deactivates and keeps the row, answers 204, and repeating it changes nothing more", async () => {
    const id = await provision(1);
    h.audit.length = 0;
    expect(await call("DELETE", `/Users/${id}`)).toEqual({ status: 204 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ active: false, authSource: "sso", externalId: `${TENANT}:${oid(1)}` });
    expect(stamps.get(id)).toEqual(NOW);
    expect(forgot).toEqual([id]);
    expect(h.audit).toEqual([{ action: "scim.user_deprovisioned", objectId: id, details: {} }]);
    expect(await call("DELETE", `/Users/${id}`)).toEqual({ status: 204 });
    expect(forgot).toEqual([id]);
    expect(h.audit).toHaveLength(1);
  });

  it("DELETE of someone who is not there is 404", async () => {
    expect((await call("DELETE", "/Users/nobody")).status).toBe(404);
  });

  it("deactivating twice does not move the stamp", async () => {
    const id = await provision(1);
    await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "active", value: false }));
    const later = { ...deps(), now: () => new Date("2026-10-11T00:00:00Z") };
    await handleScim(later, "PATCH", `/Users/${id}`, {}, patchOps({ op: "replace", path: "active", value: false }));
    expect(stamps.get(id)).toEqual(NOW);
  });

  it("bringing them back is the same account, and leaves the stamp so older sessions stay ended", async () => {
    const id = await provision(1, { roles: [{ value: "Astra.Admin" }] });
    await call("DELETE", `/Users/${id}`);
    const r = await call("PATCH", `/Users/${id}`, patchOps({ op: "replace", path: "active", value: true }));
    expect(r).toMatchObject({ status: 200, body: { id, active: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, active: true, role: "admin" });
    expect(stamps.get(id)).toEqual(NOW);
    // What was remembered while they were inactive must not hold them out once they are back.
    expect(forgot).toEqual([id, id]);
    expect(h.audit.at(-1)).toMatchObject({ action: "scim.user_reactivated" });
    expect(((await call("GET", "/Users", undefined, { filter: `externalId eq "${oid(1)}"` })).body as any).Resources[0]).toMatchObject({ id, active: true });
  });

  it("an inactive person is still found by the filter Entra uses to match, so it reactivates rather than duplicates", async () => {
    const id = await provision(1);
    await call("DELETE", `/Users/${id}`);
    const found = ((await call("GET", "/Users", undefined, { filter: 'userName eq "user1@hilti.example"' })).body as any);
    expect(found.totalResults).toBe(1);
    expect(found.Resources[0]).toMatchObject({ id, active: false });
    expect((await call("POST", "/Users", person(1))).status).toBe(409);
  });
});

describe("what an error looks like", () => {
  it("is a SCIM error with the status as a string", async () => {
    expect((await call("GET", "/Users/nobody")).body).toEqual({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "404", detail: "User nobody not found" });
    expect((await call("GET", "/Users", undefined, { filter: "x" })).body).toMatchObject({ status: "400", scimType: "invalidFilter" });
  });

  it("does not echo a long id back", async () => {
    expect(((await call("GET", `/Users/${"z".repeat(500)}`)).body as any).detail.length).toBeLessThan(100);
  });

  it("an unexpected failure is a 500 that says nothing about why", async () => {
    const broken: ScimStore = { ...memStore, async list() { throw new Error("connection to 10.0.0.5 refused: password=hunter2"); } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await handleScim({ ...deps(), store: broken }, "GET", "/Users", {}, undefined);
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/10\.0\.0\.5|hunter2/);
  });
});

// ═══ The HTTP surface ════════════════════════════════════════════════════════

describe("over HTTP", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use(cookieParser());
    app.use(scimRouter);
    app.use("/api", authMiddleware);
    app.get("/api/protected", (_req, res) => res.json({ ok: true }));
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    setScimStoreForTests(memStore);
    setDefaultOrgId("org-1");
  });
  afterAll(async () => { setScimStoreForTests(null); await new Promise<void>((r) => server.close(() => r())); });

  const http = async (method: string, p: string, opts: { token?: string | null; body?: string; type?: string; auth?: string } = {}) => {
    const headers: Record<string, string> = {};
    const token = opts.token === undefined ? TOKEN : opts.token;
    if (opts.auth) headers.Authorization = opts.auth; else if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers["Content-Type"] = opts.type ?? "application/scim+json";
    const r = await fetch(base + p, { method, headers, body: opts.body });
    const text = await r.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* none */ }
    return { status: r.status, body, type: r.headers.get("content-type"), www: r.headers.get("www-authenticate"), location: r.headers.get("location"), cache: r.headers.get("cache-control"), text };
  };

  it("refuses a request with no token, a wrong one, or another scheme, and says how to ask", async () => {
    for (const o of [{ token: null }, { token: "x".repeat(40) }, { token: TOKEN.slice(1) }, { auth: `Basic ${Buffer.from(`a:${TOKEN}`).toString("base64")}` }, { auth: TOKEN }, { auth: "Bearer" }, { auth: "Bearer " }]) {
      const r = await http("GET", "/scim/v2/Users", o);
      expect(r.status, JSON.stringify(o)).toBe(401);
      expect(r.www).toBe('Bearer realm="scim"');
      expect(r.body).toMatchObject({ status: "401" });
    }
    expect(rows).toEqual([]);
  });

  it("accepts either configured token, and the scheme in any case", async () => {
    configure({}, { next: NEXT });
    expect((await http("GET", "/scim/v2/Users", { token: NEXT })).status).toBe(200);
    expect((await http("GET", "/scim/v2/Users", { token: TOKEN })).status).toBe(200);
    expect((await http("GET", "/scim/v2/Users", { auth: `bearer ${TOKEN}` })).status).toBe(200);
  });

  it("answers in application/scim+json and never lets a response be kept", async () => {
    const r = await http("GET", "/scim/v2/ServiceProviderConfig");
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/^application\/scim\+json/);
    expect(r.cache).toBe("no-store");
  });

  it("provisions, finds, deactivates and removes a person end to end, with scim+json and plain json bodies", async () => {
    const created = await http("POST", "/scim/v2/Users", { body: JSON.stringify(person(1, { roles: [{ value: "Astra.Admin" }] })) });
    expect(created.status).toBe(201);
    expect(created.location).toBe(`https://astra.example.com/scim/v2/Users/${created.body.id}`);
    expect(rows[0]).toMatchObject({ role: "admin", authSource: "sso" });
    const second = await http("POST", "/scim/v2/Users", { body: JSON.stringify(person(2)), type: "application/json" });
    expect(second.status).toBe(201);
    const list = await http("GET", `/scim/v2/Users?filter=${encodeURIComponent('userName eq "user1@hilti.example"')}`);
    expect(list.body.Resources.map((u: any) => u.id)).toEqual([created.body.id]);
    const off = await http("PATCH", `/scim/v2/Users/${created.body.id}`, { body: JSON.stringify(patchOps({ op: "Replace", path: "active", value: "False" })) });
    expect(off.status).toBe(200);
    expect(rows[0].active).toBe(false);
    expect((await http("DELETE", `/scim/v2/Users/${second.body.id}`)).status).toBe(204);
    expect(rows.map((r) => r.active)).toEqual([false, false]);
  });

  it("removing someone ends their session on the next request, and bringing them back lets a new one work at once", async () => {
    setSessionLoaderForTests(async (id) => { const r = rows.find((x) => x.id === id); return r ? { active: r.active, validAfter: stamps.get(id) ?? null } : null; });
    try {
      const created = await http("POST", "/scim/v2/Users", { body: JSON.stringify(person(1)) });
      const id = created.body.id as string;
      const session = () => `auth_token=${generateToken({ userId: id, username: "user1@hilti.example", role: "admin", email: null, organizationId: "org-1", src: "sso" })}`;
      const protectedCall = async (ck: string) => (await fetch(`${base}/api/protected`, { headers: { Cookie: ck } })).status;
      const first = session();
      expect(await protectedCall(first)).toBe(200);
      expect((await http("DELETE", `/scim/v2/Users/${id}`)).status).toBe(204);
      expect(await protectedCall(first)).toBe(401);
      await new Promise((r) => setTimeout(r, 1100));
      expect((await http("PATCH", `/scim/v2/Users/${id}`, { body: JSON.stringify(patchOps({ op: "replace", path: "active", value: true })) })).status).toBe(200);
      expect(await protectedCall(session()), "a session issued after they came back").toBe(200);
      expect(await protectedCall(first), "a session from before they were removed").toBe(401);
    } finally {
      setSessionLoaderForTests(null);
    }
  });

  it("a malformed body is a 400 in SCIM terms, not a stack trace", async () => {
    const r = await http("POST", "/scim/v2/Users", { body: "{not json" });
    expect(r).toMatchObject({ status: 400, body: { scimType: "invalidSyntax" } });
    expect(r.text).not.toMatch(/SyntaxError|at \w+ \(/);
  });

  it("a body that is too large is refused", async () => {
    const r = await http("POST", "/scim/v2/Users", { body: JSON.stringify(person(1, { displayName: "x".repeat(300_000) })) });
    expect(r.status).toBe(400);
    expect(rows).toEqual([]);
  });

  it("is a 404 when SCIM is not configured, or in demo mode, however good the token", async () => {
    configure({}, { first: null });
    expect((await http("GET", "/scim/v2/Users")).status).toBe(404);
    expect((await http("GET", "/scim/v2/Users", { token: null })).status).toBe(404);
    configure();
    process.env.SECURITY_MODE = "demo";
    expect((await http("GET", "/scim/v2/Users")).status).toBe(404);
  });

  it("sits outside the session check: the same token is no use on the rest of the API", async () => {
    expect((await http("GET", "/api/protected")).status).toBe(401);
  });
});

// ═══ Ending a session ════════════════════════════════════════════════════════

describe("checkSession", () => {
  let reads: string[] = [];
  let state: Record<string, SessionState | null> = {};
  let failing = false;
  beforeEach(() => {
    reads = []; state = { u1: { active: true, validAfter: null } }; failing = false;
    setSessionLoaderForTests(async (id) => { reads.push(id); if (failing) throw new Error("db down"); return state[id] ?? null; });
  });
  afterAll(() => setSessionLoaderForTests(null));

  const sso = (extra: Record<string, unknown> = {}) => ({ userId: "u1", src: "sso" as const, iat: Math.floor(NOW.getTime() / 1000), ...extra });

  it("reads nothing for a password session, whatever the database says", async () => {
    state.u1 = null; failing = true;
    expect(await checkSession({ userId: "u1" })).toBe("ok");
    expect(await checkSession({ userId: "u1", src: undefined, iat: 1 })).toBe("ok");
    expect(await checkSession({ userId: "u1", src: "other" as any })).toBe("ok");
    expect(reads).toEqual([]);
  });

  it("reads nothing for an SSO session while SCIM is off", async () => {
    configure({}, { first: null });
    state.u1 = null;
    expect(await checkSession(sso())).toBe("ok");
    expect(reads).toEqual([]);
  });

  it("stands while the person is active, and ends when they are inactive or gone", async () => {
    expect(await checkSession(sso())).toBe("ok");
    forgetSession();
    state.u1 = { active: false, validAfter: null };
    expect(await checkSession(sso())).toBe("revoked");
    forgetSession();
    state.u1 = null;
    expect(await checkSession(sso())).toBe("revoked");
  });

  it("ends a session issued before the revocation, and not one issued after it", async () => {
    const t = Math.floor(NOW.getTime() / 1000);
    state.u1 = { active: true, validAfter: NOW };
    expect(await checkSession(sso({ iat: t - 1 }))).toBe("revoked");
    expect(await checkSession(sso({ iat: t }))).toBe("ok");
    expect(await checkSession(sso({ iat: t + 60 }))).toBe("ok");
    expect(await checkSession(sso({ iat: undefined }))).toBe("revoked");
  });

  it("an inactive person stays out even with a session issued after the revocation", async () => {
    state.u1 = { active: false, validAfter: new Date(NOW.getTime() - 3600_000) };
    expect(await checkSession(sso())).toBe("revoked");
  });

  it("remembers for 30 seconds, no longer, and forgetting is immediate", async () => {
    const t0 = NOW.getTime();
    await checkSession(sso(), t0);
    await checkSession(sso(), t0 + SESSION_CACHE_MS - 1);
    expect(reads).toEqual(["u1"]);
    state.u1 = { active: false, validAfter: null };
    expect(await checkSession(sso(), t0 + SESSION_CACHE_MS - 1)).toBe("ok");
    expect(await checkSession(sso(), t0 + SESSION_CACHE_MS)).toBe("revoked");
    expect(reads).toEqual(["u1", "u1"]);
    state.u1 = { active: true, validAfter: null };
    forgetSession("u1");
    expect(await checkSession(sso(), t0 + SESSION_CACHE_MS + 1)).toBe("ok");
    expect(reads).toHaveLength(3);
    expect(SESSION_CACHE_MS).toBe(30_000);
  });

  it("when the row cannot be read it refuses, and tries again next time instead of remembering the failure", async () => {
    failing = true;
    expect(await checkSession(sso())).toBe("unavailable");
    failing = false;
    expect(await checkSession(sso())).toBe("ok");
    expect(reads).toHaveLength(2);
  });

  it("asks about each person once, not once for everyone", async () => {
    state.u2 = { active: false, validAfter: null };
    expect(await checkSession(sso())).toBe("ok");
    expect(await checkSession(sso({ userId: "u2" }))).toBe("revoked");
    expect(await checkSession(sso({ userId: "u3" }))).toBe("revoked");
    expect(reads.sort()).toEqual(["u1", "u2", "u3"]);
  });
});

describe("through the real middleware", () => {
  let server: Server;
  let base = "";
  let reads = 0;
  let state: SessionState | null = { active: true, validAfter: null };
  let failing = false;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api", authMiddleware);
    app.get("/api/protected", (req, res) => res.json({ user: req.authUser }));
    app.get("/api/auth/mode", (req, res) => res.json({ user: req.authUser ?? null }));
    app.post("/api/auth/register", (req, res) => res.json({ user: req.authUser ?? null }));
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { setSessionLoaderForTests(null); await new Promise<void>((r) => server.close(() => r())); });
  beforeEach(() => {
    reads = 0; state = { active: true, validAfter: null }; failing = false;
    setSessionLoaderForTests(async () => { reads++; if (failing) throw new Error("db down"); return state; });
  });

  const claims = { userId: "u1", username: "ana@hilti.example", role: "admin", email: "ana@hilti.example", organizationId: "org-1" };
  const cookie = (c: Record<string, unknown>) => `auth_token=${generateToken(c as any)}`;
  const get = async (p: string, ck?: string, method = "GET") => {
    const r = await fetch(base + p, { method, headers: ck ? { Cookie: ck } : {} });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };

  it("lets a signed-in SSO person in, and a password session without a single read", async () => {
    expect((await get("/api/protected", cookie({ ...claims, src: "sso" }))).status).toBe(200);
    expect(reads).toBe(1);
    reads = 0; failing = true; state = null;
    for (let i = 0; i < 3; i++) expect((await get("/api/protected", cookie(claims))).status).toBe(200);
    expect(reads).toBe(0);
    expect(h.queries).toBe(0);
  });

  it("ends a deprovisioned person's session at once, with the same answer every time", async () => {
    state = { active: false, validAfter: new Date() };
    for (let i = 0; i < 2; i++) {
      expect(await get("/api/protected", cookie({ ...claims, src: "sso" })), `request ${i + 1}`).toMatchObject({ status: 401, body: { message: "Session ended" } });
    }
  });

  it("answers 503 when it cannot tell, and does not let them in", async () => {
    failing = true;
    expect(await get("/api/protected", cookie({ ...claims, src: "sso" }))).toMatchObject({ status: 503, body: { message: "Could not confirm the session. Try again." } });
  });

  it("does not let a revoked administrator keep adding people through the open sign-in routes", async () => {
    const ck = cookie({ ...claims, src: "sso" });
    expect((await get("/api/auth/register", ck, "POST")).body.user).toMatchObject({ role: "admin" });
    forgetSession();
    state = { active: false, validAfter: null };
    expect(await get("/api/auth/register", ck, "POST")).toMatchObject({ status: 200, body: { user: null } });
    expect((await get("/api/auth/mode", ck)).body.user).toBeNull();
  });

  it("does not touch any of it while SCIM is off", async () => {
    configure({}, { first: null });
    state = null;
    expect((await get("/api/protected", cookie({ ...claims, src: "sso" }))).status).toBe(200);
    expect(reads).toBe(0);
  });
});

describe("signing in again", () => {
  const cfg0 = () => readSsoConfig()!;
  const claims = { tenantId: TENANT, oid: oid(1), email: "ana@hilti.example", upn: "ana@hilti.example", name: "Ana", roles: ["Astra.Admin"], amr: ["mfa"] };
  const make = (existing: Partial<SsoUser> | null) => {
    const updates: unknown[] = [];
    const store: SsoUserStore = {
      // Only the exact key finds them, as in the database: a lookup under a different spelling of the id finds nobody.
      async findByExternalId(key: string) { return existing && key === `${TENANT}:${oid(1)}` ? ({ id: "u1", username: "ana@hilti.example", role: "admin", email: "ana@hilti.example", organizationId: "org-1", externalId: `${TENANT}:${oid(1)}`, authSource: "sso", ...existing } as SsoUser) : undefined; },
      async usernameTaken() { return false; },
      async create(row) { return { id: "new", authSource: "sso", ...row }; },
      async update(id, patch) { updates.push(patch); return { id, ...patch } as any; },
      async defaultOrganizationId() { return "org-1"; },
    };
    return { store, updates };
  };

  it("is refused for a person who has been deprovisioned, however well Entra vouches for them, and nothing is changed", async () => {
    const { store, updates } = make({ active: false, role: "finance" });
    expect(await resolveUser(cfg0(), claims, store)).toEqual({ ok: false, code: "account_disabled" });
    expect(updates).toEqual([]);
  });

  it("is allowed for an active one, and for one whose row says nothing about it", async () => {
    for (const active of [true, undefined]) expect((await resolveUser(cfg0(), claims, make({ active }).store)).ok).toBe(true);
  });

  it("finds a person SCIM provisioned, by the same key, whichever way the object id is written", async () => {
    const { store } = make({});
    const r = await resolveUser(cfg0(), { ...claims, oid: oid(1).toUpperCase() }, store);
    expect(r).toMatchObject({ ok: true, created: false });
  });
});

// ═══ How it is wired ═════════════════════════════════════════════════════════

describe("wiring", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("the SCIM router is mounted before the session check, so the identity provider needs no session", () => {
    const index = src("server/index.ts");
    const mount = index.indexOf("app.use(scimRouter)");
    const gate = index.indexOf('app.use("/api", authMiddleware)');
    expect(mount).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(mount);
  });

  it("SCIM is validated and reported at boot, beside single sign-on", () => {
    const c = src("server/config.ts");
    expect(c).toContain("errors.push(...validateScimEnv())");
    expect(c).toContain("${describeScim()}");
  });

  it("the SCIM routes are not router.post/patch/put/delete lines, which the authorization ratchet counts as unguarded", () => {
    expect(src("server/routes/scim.ts")).not.toMatch(/\brouter\.(post|patch|put|delete)\(/);
  });

  it("the columns exist in the schema and in the additive startup migration, and no existing person is changed", () => {
    expect(src("shared/schema.ts")).toMatch(/active: boolean\("active"\)\.notNull\(\)\.default\(true\)/);
    expect(src("shared/schema.ts")).toContain('sessionsValidAfter: timestamp("sessions_valid_after")');
    const db = src("server/db.ts");
    expect(db).toContain("ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;");
    expect(db).toContain("ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_after TIMESTAMP;");
  });

  it("the database store only ever reaches SSO people of this tenant and organization, and gives them no password", () => {
    const r = src("server/routes/scim.ts");
    const list = r.slice(r.indexOf("async list("), r.indexOf("async get("));
    for (const needle of ['eq(users.authSource, "sso")', "like(users.externalId, `${scope.tenantId}:%`)", "eq(users.organizationId, scope.organizationId)"]) expect(list).toContain(needle);
    expect(r).toContain('password: NO_PASSWORD, authSource: "sso"');
    expect(r).toContain("active: r.active !== false");
  });

  it("the people table the session check reads is the same one SCIM writes, and a missing row ends the session", () => {
    const v = src("server/session-revocation.ts");
    expect(v).toContain("active: row.active !== false, validAfter: row.sessionsValidAfter ?? null");
    expect(v).toContain(".from(users).where(eq(users.id, userId))");
  });

  it("only an SSO session is marked revocable: the password routes do not set src", () => {
    expect(src("server/routes/auth.ts")).not.toMatch(/\bsrc\b/);
    expect(src("server/routes/sso.ts")).toContain('src: "sso"');
  });

  it("session-revocation imports nothing that imports auth (no cycle), and the middleware asks it in both places", () => {
    expect(src("server/session-revocation.ts")).not.toMatch(/from "\.\/(sso|scim|auth)"/);
    expect((src("server/auth.ts").match(/await checkSession\(payload\)/g) ?? []).length).toBe(2);
  });

  it("the setup guide exists and says to map externalId from objectId", () => {
    const doc = src("docs/ENTRA_SCIM.md");
    expect(doc).toContain("objectId");
    expect(doc).toContain("/scim/v2");
    expect(doc).toContain("ASTRA_SCIM_TOKEN");
  });
});
