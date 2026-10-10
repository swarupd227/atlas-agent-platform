/**
 * SCIM 2.0 provisioning from Microsoft Entra ID: the identity provider creates, updates and deactivates the
 * people who sign in with Microsoft (server/sso.ts), so removing someone in Entra removes them here without
 * anyone remembering to.
 *
 * Off unless ASTRA_SCIM_TOKEN (or ASTRA_SCIM_TOKEN_FILE) is set, and it refuses to start without single sign-on:
 * a provisioned person is tied to their sign-in by the tenant and their Entra object id. ASTRA_SCIM_TOKEN_NEXT
 * is a second token accepted beside the first, so a token can be rotated without a gap.
 *
 * What it can touch is deliberately narrow. Only people who sign in through SSO in the configured tenant and
 * organization exist as far as SCIM is concerned: a local account is not listed, cannot be read, changed or
 * deactivated, and is never matched by name or e-mail. A person is their Entra object id (externalId), so
 * provisioning someone whose user name is already taken by another account is refused (409), not merged.
 *
 * Deactivating (active=false, or DELETE) keeps the row, because the audit trail points at it, so that bringing
 * someone back is the same account. It refuses their next sign-in and ends the sessions they already have
 * (server/session-revocation.ts).
 *
 * The handlers are pure functions over a store, so the whole of it can be exercised without a database.
 */
import crypto from "node:crypto";
import { getSso, readText, roleFor, type SsoConfig } from "./sso";

export const SCIM_BASE_PATH = "/scim/v2";
export const SCIM_CONTENT_TYPE = "application/scim+json";
/** What a provisioned person gets when no mapped app role says otherwise: the least privileged role. */
export const SCIM_FALLBACK_ROLE = "domain_expert";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE = 200;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ScimConfig {
  /** One or two bearer tokens that are accepted. */
  tokens: string[];
  sso: SsoConfig;
  /** The organization provisioned people belong to (the SSO one, or the platform's default). */
  organizationId: string | null;
  /** Where this API is, for `meta.location`. */
  baseUrl: string;
}

/** Null when SCIM is not configured; throws with a plain message when it is configured wrongly. */
export function readScimConfig(env: NodeJS.ProcessEnv = process.env): ScimConfig | null {
  const first = readText(env, "ASTRA_SCIM_TOKEN");
  const second = readText(env, "ASTRA_SCIM_TOKEN_NEXT");
  if (!first && !second) return null;
  if (!first) throw new Error("ASTRA_SCIM_TOKEN_NEXT is set without ASTRA_SCIM_TOKEN");
  const tokens = [first, second].filter((t): t is string => !!t);
  if (tokens.some((t) => t.length < 32)) throw new Error("a SCIM token must be at least 32 characters (generate one with: openssl rand -hex 32)");
  if (tokens.length === 2 && first === second) throw new Error("ASTRA_SCIM_TOKEN and ASTRA_SCIM_TOKEN_NEXT must differ");
  const sso = getSso();
  if (!sso) throw new Error("SCIM needs single sign-on: set ASTRA_SSO as well (a provisioned person is tied to their sign-in by the tenant)");
  return { tokens, sso, organizationId: sso.organizationId, baseUrl: `${new URL(sso.redirectUri).origin}${SCIM_BASE_PATH}` };
}

let cachedKey: string | null = null;
let cached: ScimConfig | null = null;
/** The configuration in force, read from the environment once and then served from memory. */
export function getScim(): ScimConfig | null {
  const key = ["ASTRA_SCIM_TOKEN", "ASTRA_SCIM_TOKEN_FILE", "ASTRA_SCIM_TOKEN_NEXT", "ASTRA_SCIM_TOKEN_NEXT_FILE", "ASTRA_SSO", "ASTRA_SSO_FILE", "ASTRA_SSO_CLIENT_SECRET", "ASTRA_SSO_CLIENT_SECRET_FILE"]
    .map((k) => process.env[k] ?? "").join("\u0001");
  if (cachedKey === key) return cached;
  cached = readScimConfig();
  cachedKey = key;
  return cached;
}

/** getScim() for a caller that must not fail on a bad configuration (boot already refused it). */
export function scimOrNull(): ScimConfig | null {
  try {
    return getScim();
  } catch {
    return null;
  }
}

export function validateScimEnv(): string[] {
  try {
    getScim();
    return [];
  } catch (e: any) {
    return [`SCIM provisioning is misconfigured: ${e.message}`];
  }
}

/** A line for the startup log. Never a token. */
export function describeScim(): string {
  try {
    return getScim() ? "scim=on" : "scim=off";
  } catch {
    return "scim=invalid";
  }
}

/** Compares the presented token with each accepted one, in constant time. */
export function tokenValid(cfg: ScimConfig, presented: string): boolean {
  const digest = (s: string) => crypto.createHash("sha256").update(s).digest();
  const p = digest(presented);
  let ok = false;
  for (const t of cfg.tokens) if (crypto.timingSafeEqual(p, digest(t))) ok = true;
  return ok;
}

// ─── The people SCIM can see ─────────────────────────────────────────────────

export interface ScimUserRow {
  id: string;
  username: string;
  email: string | null;
  role: string | null;
  organizationId: string | null;
  externalId: string | null;
  authSource: string | null;
  active: boolean;
}

export interface ScimPatch { username?: string; email?: string | null; role?: string; active?: boolean; sessionsValidAfter?: Date }

/** The few things SCIM needs from the database. `list` returns only what is in scope; the others return any row. */
export interface ScimStore {
  list(scope: { organizationId: string; tenantId: string }, filter: { userName?: string; externalId?: string } | null, startIndex: number, count: number): Promise<{ rows: ScimUserRow[]; total: number }>;
  get(id: string): Promise<ScimUserRow | undefined>;
  findByExternalId(externalId: string): Promise<ScimUserRow | undefined>;
  findByUserName(username: string): Promise<ScimUserRow | undefined>;
  create(row: { username: string; email: string | null; role: string; organizationId: string; externalId: string; active: boolean }): Promise<ScimUserRow>;
  update(id: string, patch: ScimPatch): Promise<ScimUserRow>;
  defaultOrganizationId(): Promise<string | null>;
}

export interface ScimDeps {
  cfg: ScimConfig;
  store: ScimStore;
  audit: (action: string, row: ScimUserRow | null, details: Record<string, unknown>) => void;
  /** Drop what is remembered about a person's session, so a deprovisioning bites on this instance at once. */
  forget: (userId: string) => void;
  now?: () => Date;
}

export interface ScimResult { status: number; body?: unknown; headers?: Record<string, string> }

// ─── Answers ─────────────────────────────────────────────────────────────────

type ScimType = "invalidFilter" | "uniqueness" | "mutability" | "invalidSyntax" | "invalidPath" | "invalidValue" | "noTarget";
const fail = (status: number, detail: string, scimType?: ScimType): ScimResult => ({
  status, body: { schemas: [ERROR_SCHEMA], status: String(status), ...(scimType ? { scimType } : {}), detail },
});

const ok = (status: number, body: unknown, headers?: Record<string, string>): ScimResult => ({ status, body, headers });

const SERVICE_PROVIDER_CONFIG = {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
  documentationUri: "https://learn.microsoft.com/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups",
  patch: { supported: true },
  bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
  filter: { supported: true, maxResults: MAX_PAGE },
  changePassword: { supported: false },
  sort: { supported: false },
  etag: { supported: false },
  authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", description: "A long secret token shared with the identity provider", primary: true }],
};

const RESOURCE_TYPES = [{
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
  id: "User", name: "User", endpoint: "/Users", schema: USER_SCHEMA, description: "A person who signs in with Microsoft",
}];

const SCHEMAS = [{ id: USER_SCHEMA, name: "User", description: "A person who signs in with Microsoft" }];

const tenantPrefix = (cfg: ScimConfig) => `${cfg.sso.tenantId}:`;

function resource(cfg: ScimConfig, row: ScimUserRow) {
  const prefix = tenantPrefix(cfg);
  return {
    schemas: [USER_SCHEMA],
    id: row.id,
    externalId: row.externalId?.startsWith(prefix) ? row.externalId.slice(prefix.length) : row.externalId,
    userName: row.username,
    ...(row.email ? { emails: [{ value: row.email, type: "work", primary: true }] } : {}),
    active: row.active !== false,
    meta: { resourceType: "User", location: `${cfg.baseUrl}/Users/${row.id}` },
  };
}

// ─── Reading what the identity provider sent ─────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

class Bad extends Error {
  constructor(readonly status: number, readonly detail: string, readonly scimType: ScimType) { super(detail); }
}

function parseBool(v: unknown, name: string): boolean {
  if (typeof v === "boolean") return v;
  // Entra sends booleans as the words "True" and "False" in some patches.
  if (typeof v === "string" && /^(true|false)$/i.test(v.trim())) return v.trim().toLowerCase() === "true";
  throw new Bad(400, `${name} must be true or false`, "invalidValue");
}

function parseUserName(v: unknown): string {
  if (typeof v !== "string") throw new Bad(400, "userName is required", "invalidValue");
  const name = v.trim();
  if (name.length < 1 || name.length > 200 || /[\u0000-\u001f]/.test(name)) throw new Bad(400, "userName must be 1 to 200 characters", "invalidValue");
  return name;
}

/** The person's Entra object id, lower case. Anything else cannot be tied to their sign-in. */
function parseExternalId(v: unknown): string {
  if (typeof v !== "string" || !GUID.test(v.trim())) {
    throw new Bad(400, "externalId must be the person's Entra object id (a GUID). In the provisioning attribute mappings, map externalId from objectId.", "invalidValue");
  }
  return v.trim().toLowerCase();
}

function emailOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const list = Array.isArray(v) ? v : [v];
  const entries = list.map((e) => (typeof e === "string" ? { value: e } : isRecord(e) ? e : null)).filter((e): e is Record<string, unknown> => !!e && typeof e.value === "string");
  if (entries.length === 0) return null;
  const pick = entries.find((e) => e.primary === true) ?? entries.find((e) => String(e.type ?? "").toLowerCase() === "work") ?? entries[0];
  const value = String(pick.value).trim().toLowerCase();
  if (value === "") return null;
  if (value.length > 254 || !value.includes("@")) throw new Bad(400, "emails must hold an e-mail address", "invalidValue");
  return value;
}

/** App role values from a SCIM `roles` attribute (a list of { value }). */
function appRolesOf(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map((e) => (typeof e === "string" ? e : isRecord(e) && typeof e.value === "string" ? e.value : null)).filter((x): x is string => !!x).slice(0, 50);
}

const roleFromApp = (cfg: ScimConfig, appRoles: string[]): string => roleFor(cfg.sso, appRoles) ?? SCIM_FALLBACK_ROLE;

// ─── Filters ─────────────────────────────────────────────────────────────────

function parseFilter(raw: unknown): { userName?: string; externalId?: string } | null {
  if (raw === undefined || raw === "") return null;
  if (typeof raw !== "string") throw new Bad(400, "filter must be a string", "invalidFilter");
  const m = /^\s*(userName|externalId)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(raw);
  if (!m) throw new Bad(400, 'Only filters of the form userName eq "..." or externalId eq "..." are supported', "invalidFilter");
  const value = m[2].replace(/\\(.)/g, "$1");
  return m[1].toLowerCase() === "username" ? { userName: value } : { externalId: value };
}

function intParam(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "string" && /^-?\d+$/.test(raw) ? Number(raw) : fallback;
  return Math.min(max, Math.max(min, n));
}

const isUniqueViolation = (e: any) => /unique|duplicate/i.test(String(e?.message ?? e));

// ─── The handlers ────────────────────────────────────────────────────────────

/** A row is SCIM's to touch only if it is an SSO person in this tenant and organization. */
function inScope(cfg: ScimConfig, orgId: string, row: ScimUserRow | undefined): row is ScimUserRow {
  return !!row && row.authSource === "sso" && !!row.externalId?.startsWith(tenantPrefix(cfg)) && row.organizationId === orgId;
}

const notFound = (id: string) => fail(404, `User ${id.slice(0, 64)} not found`);

export async function handleScim(d: ScimDeps, method: string, rawPath: string, query: Record<string, unknown>, body: unknown): Promise<ScimResult> {
  const path = rawPath.replace(/\/+$/, "") || "/";
  const verb = method.toUpperCase();
  try {
    if (path === "/ServiceProviderConfig") return verb === "GET" ? ok(200, SERVICE_PROVIDER_CONFIG) : fail(405, "Method not allowed");
    if (path === "/ResourceTypes") return verb === "GET" ? ok(200, { schemas: [LIST_SCHEMA], totalResults: 1, startIndex: 1, itemsPerPage: 1, Resources: RESOURCE_TYPES }) : fail(405, "Method not allowed");
    if (path === "/Schemas") return verb === "GET" ? ok(200, { schemas: [LIST_SCHEMA], totalResults: 1, startIndex: 1, itemsPerPage: 1, Resources: SCHEMAS }) : fail(405, "Method not allowed");
    if (path === "/Groups" || path.startsWith("/Groups/")) return fail(404, "Groups are not supported: assign the app role to people instead");

    const idMatch = /^\/Users\/([^/]+)$/.exec(path);
    if (path !== "/Users" && !idMatch) return fail(404, "Not found");

    const orgId = d.cfg.organizationId ?? (await d.store.defaultOrganizationId());
    if (!orgId) return fail(500, "No organization to provision into");

    if (path === "/Users") {
      if (verb === "GET") return await listUsers(d, orgId, query);
      if (verb === "POST") return await createUser(d, orgId, body);
      return fail(405, "Method not allowed");
    }

    const id = idMatch![1];
    const row = /^[\w-]{1,64}$/.test(id) ? await d.store.get(id) : undefined;
    if (!inScope(d.cfg, orgId, row)) return notFound(id);
    if (verb === "GET") return ok(200, resource(d.cfg, row));
    if (verb === "PUT") return await replaceUser(d, row, body);
    if (verb === "PATCH") return await patchUser(d, row, body);
    if (verb === "DELETE") {
      await deactivate(d, row, "scim.user_deprovisioned");
      return { status: 204 };
    }
    return fail(405, "Method not allowed");
  } catch (e: any) {
    if (e instanceof Bad) return fail(e.status, e.detail, e.scimType);
    if (isUniqueViolation(e)) return fail(409, "That user name or object id is already in use", "uniqueness");
    console.error("[scim] request failed:", e?.message ?? e);
    return fail(500, "The request could not be completed");
  }
}

async function listUsers(d: ScimDeps, orgId: string, query: Record<string, unknown>): Promise<ScimResult> {
  const filter = parseFilter(query.filter);
  const startIndex = intParam(query.startIndex, 1, 1, 1_000_000);
  const count = intParam(query.count, 100, 0, MAX_PAGE);
  const normalised = filter?.externalId !== undefined ? { externalId: `${tenantPrefix(d.cfg)}${filter.externalId.trim().toLowerCase()}` } : filter;
  const { rows, total } = count === 0 ? { rows: [], total: (await d.store.list({ organizationId: orgId, tenantId: d.cfg.sso.tenantId }, normalised, 1, 1)).total }
    : await d.store.list({ organizationId: orgId, tenantId: d.cfg.sso.tenantId }, normalised, startIndex, count);
  return ok(200, { schemas: [LIST_SCHEMA], totalResults: total, startIndex, itemsPerPage: rows.length, Resources: rows.map((r) => resource(d.cfg, r)) });
}

async function createUser(d: ScimDeps, orgId: string, body: unknown): Promise<ScimResult> {
  if (!isRecord(body)) return fail(400, "A JSON user is required", "invalidSyntax");
  const username = parseUserName(body.userName);
  const ext = parseExternalId(body.externalId);
  const externalId = `${tenantPrefix(d.cfg)}${ext}`;
  const active = body.active === undefined ? true : parseBool(body.active, "active");
  const email = emailOf(body.emails);
  const role = roleFromApp(d.cfg, appRolesOf(body.roles));

  if (await d.store.findByExternalId(externalId)) return fail(409, "This person is already provisioned", "uniqueness");
  if (await d.store.findByUserName(username)) return fail(409, "That user name belongs to another account", "uniqueness");
  const created = await d.store.create({ username, email, role, organizationId: orgId, externalId, active });
  d.audit("scim.user_created", created, { active, role });
  return ok(201, resource(d.cfg, created), { Location: `${d.cfg.baseUrl}/Users/${created.id}` });
}

/** The change a request asks for, before it is applied. */
interface Wanted { username?: string; email?: string | null; active?: boolean; appRoles?: string[] }

async function applyWanted(d: ScimDeps, row: ScimUserRow, wanted: Wanted): Promise<ScimResult> {
  const patch: ScimPatch = {};
  const changes: string[] = [];
  if (wanted.username !== undefined && wanted.username !== row.username) {
    const other = await d.store.findByUserName(wanted.username);
    if (other && other.id !== row.id) return fail(409, "That user name belongs to another account", "uniqueness");
    patch.username = wanted.username; changes.push("userName");
  }
  if (wanted.email !== undefined && wanted.email !== row.email) { patch.email = wanted.email; changes.push("email"); }
  if (wanted.appRoles !== undefined) {
    const role = roleFromApp(d.cfg, wanted.appRoles);
    if (role !== row.role) { patch.role = role; changes.push("role"); }
  }
  let transition: "deactivated" | "reactivated" | null = null;
  if (wanted.active === false && row.active !== false) {
    patch.active = false; patch.sessionsValidAfter = (d.now ?? (() => new Date()))(); transition = "deactivated";
  } else if (wanted.active === true && row.active === false) {
    patch.active = true; transition = "reactivated";
  }
  if (Object.keys(patch).length === 0) return ok(200, resource(d.cfg, row));
  const updated = await d.store.update(row.id, patch);
  // Both ways: a person brought back must not be held out by what was remembered while they were inactive.
  if (transition) d.forget(row.id);
  d.audit(transition ? `scim.user_${transition}` : "scim.user_updated", updated, { changed: changes });
  return ok(200, resource(d.cfg, updated));
}

async function deactivate(d: ScimDeps, row: ScimUserRow, action: string): Promise<void> {
  if (row.active === false) return;
  const updated = await d.store.update(row.id, { active: false, sessionsValidAfter: (d.now ?? (() => new Date()))() });
  d.forget(row.id);
  d.audit(action, updated, {});
}

async function replaceUser(d: ScimDeps, row: ScimUserRow, body: unknown): Promise<ScimResult> {
  if (!isRecord(body)) return fail(400, "A JSON user is required", "invalidSyntax");
  const wanted: Wanted = { username: parseUserName(body.userName), email: emailOf(body.emails) };
  if (body.externalId !== undefined && `${tenantPrefix(d.cfg)}${parseExternalId(body.externalId)}` !== row.externalId) {
    return fail(400, "externalId cannot be changed", "mutability");
  }
  if (body.active !== undefined) wanted.active = parseBool(body.active, "active");
  if (body.roles !== undefined) wanted.appRoles = appRolesOf(body.roles);
  return applyWanted(d, row, wanted);
}

async function patchUser(d: ScimDeps, row: ScimUserRow, body: unknown): Promise<ScimResult> {
  const ops = isRecord(body) ? (body.Operations ?? body.operations) : undefined;
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 50) return fail(400, "Operations must be a list of 1 to 50 operations", "invalidSyntax");
  const wanted: Wanted = {};
  const setAttribute = (name: string, value: unknown, op: string) => {
    const key = name.trim().toLowerCase();
    if (key === "active") { if (op !== "remove") wanted.active = parseBool(value, "active"); return; }
    if (key === "username") { if (op !== "remove") wanted.username = parseUserName(value); return; }
    if (key === "externalid") {
      if (op !== "remove" && `${tenantPrefix(d.cfg)}${parseExternalId(value)}` !== row.externalId) throw new Bad(400, "externalId cannot be changed", "mutability");
      return;
    }
    if (key === "emails" || key.startsWith("emails[") || key === "emails.value") {
      if (op === "remove") { wanted.email = null; return; }
      // A value for a path like emails[type eq "work"].value is the address itself.
      wanted.email = emailOf(isRecord(value) || Array.isArray(value) ? value : { value });
      return;
    }
    if (key === "roles") { wanted.appRoles = op === "remove" ? [] : appRolesOf(value); return; }
    if (key.startsWith("roles[")) { if (op !== "remove") wanted.appRoles = appRolesOf(value); return; }
    // Anything else (display name, title, manager, ...) is not kept here, and ignoring it is what the standard allows.
  };
  for (const raw of ops) {
    if (!isRecord(raw) || typeof raw.op !== "string") return fail(400, "Every operation needs an op", "invalidSyntax");
    const op = raw.op.trim().toLowerCase();
    if (!["add", "replace", "remove"].includes(op)) return fail(400, `Unsupported op "${raw.op.slice(0, 20)}"`, "invalidSyntax");
    if (typeof raw.path === "string" && raw.path.trim() !== "") {
      setAttribute(raw.path, raw.value, op);
    } else if (isRecord(raw.value)) {
      for (const [k, v] of Object.entries(raw.value)) setAttribute(k, v, op);
    } else {
      return fail(400, "An operation without a path needs an object value", "invalidSyntax");
    }
  }
  return applyWanted(d, row, wanted);
}
