/**
 * Single sign-on with Microsoft Entra ID (OpenID Connect, authorization code flow with PKCE).
 *
 * It is a second way in beside the user name and password, never a replacement: the sign-in form, its
 * cookie and its rate limit are untouched. A person who signs in here ends up with exactly the cookie a
 * person who signed in with a password gets, so nothing after sign-in knows or cares which way they came.
 *
 * Off unless ASTRA_SSO (JSON) or ASTRA_SSO_FILE is set; the client secret is ASTRA_SSO_CLIENT_SECRET or
 * ASTRA_SSO_CLIENT_SECRET_FILE and is never part of the JSON. It fails closed like the lockdown: a value
 * that cannot be used stops the server at boot instead of quietly leaving sign-in half configured.
 *
 * What is verified on the way back: the state (against a sealed cookie), the PKCE verifier (at the token
 * endpoint), and in the ID token its RS256 signature against the tenant's keys, issuer, audience, expiry,
 * nonce and tenant. Who a person is comes from the stable object id Entra gives them (oid) in this tenant,
 * not from their e-mail address, and an SSO sign-in is never linked to an existing local account by
 * e-mail. Their Astra role is worked out again at every sign-in from the app roles Entra assigned them, so
 * taking a role away in Entra takes effect at the next sign-in.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { policyFetch } from "./url-safety";
import { ROLE_IDS } from "./permissions";
import { deriveSecret } from "./auth";

export const SSO_CALLBACK_PATH = "/api/auth/sso/callback";
export const SSO_LOGIN_PATH = "/api/auth/sso/login";
/** The stored password of a person who signs in through SSO: not salt:hash, so no password ever matches it. */
export const NO_PASSWORD = "!sso-no-password";

// ─── Configuration ───────────────────────────────────────────────────────────

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roleId = z.string().refine((r) => ROLE_IDS.includes(r), { message: "is not an Astra role" });

const isLoopbackHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
const httpsOrLoopback = (u: string): boolean => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || (x.protocol === "http:" && isLoopbackHost(x.hostname));
  } catch {
    return false;
  }
};

const ssoSchema = z
  .object({
    /** The Entra tenant (directory) id: a GUID. "common" and "organizations" are not accepted. */
    tenantId: z.string().regex(GUID, "must be the tenant's GUID"),
    /** The application (client) id of the app registration. */
    clientId: z.string().min(1).max(200),
    /** The sign-in host. Default https://login.microsoftonline.com; a sovereign cloud has its own. */
    authority: z.string().url().refine(httpsOrLoopback, "must be https").optional(),
    /** Where Entra sends the person back. Must be registered on the app and end in /api/auth/sso/callback. */
    redirectUri: z.string().url().refine(httpsOrLoopback, "must be https (http only for localhost)"),
    /** Extra scopes beyond openid, profile and email. */
    scopes: z.array(z.string().min(1).max(200)).max(10).optional(),
    roles: z
      .object({
        /** App role value (the `roles` claim) to Astra role. */
        map: z.record(z.string().min(1).max(200), roleId).default({}),
        /** The role for a person with none of the mapped app roles. Without it they are refused. */
        default: roleId.optional(),
      })
      .strict(),
    /** The organization new people join. Default: the platform's default organization. */
    organizationId: z.string().min(1).max(100).optional(),
    /** "on" keeps the user name and password form for everyone; "admins-only" leaves it to administrators (a break-glass account). */
    localLogin: z.enum(["on", "admins-only"]).optional(),
    /** How long an SSO sign-in lasts, 1 to 24 hours. Default 8. */
    sessionHours: z.number().int().min(1).max(24).optional(),
    /** Refuse a sign-in whose token does not show multi-factor authentication was done (the `amr` claim). */
    requireMfa: z.boolean().optional(),
    /** Only people whose e-mail is in one of these domains. */
    allowedEmailDomains: z.array(z.string().min(3).max(200)).max(50).optional(),
    /** The text of the sign-in button. */
    buttonLabel: z.string().min(1).max(60).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    try {
      if (new URL(c.redirectUri).pathname !== SSO_CALLBACK_PATH) ctx.addIssue({ code: "custom", path: ["redirectUri"], message: `must end in ${SSO_CALLBACK_PATH}` });
    } catch { /* reported by the url check */ }
    if (Object.keys(c.roles.map).length === 0 && !c.roles.default) ctx.addIssue({ code: "custom", path: ["roles"], message: "map at least one app role, or set a default role: otherwise nobody could sign in" });
  });

export interface SsoConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  authority: string;
  redirectUri: string;
  scopes: string[];
  roleMap: Record<string, string>;
  defaultRole: string | null;
  organizationId: string | null;
  localLogin: "on" | "admins-only";
  sessionHours: number;
  requireMfa: boolean;
  allowedEmailDomains: string[] | null;
  buttonLabel: string;
}

export function readText(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const inline = env[name];
  const file = env[`${name}_FILE`];
  if (inline && file) throw new Error(`set ${name} or ${name}_FILE, not both`);
  if (file) {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch (e: any) {
      throw new Error(`cannot read ${name}_FILE (${file}): ${e.message}`);
    }
  }
  return inline && inline.trim() !== "" ? inline.trim() : undefined;
}

/** Null when single sign-on is not configured; throws with a plain message when it is configured wrongly. */
export function readSsoConfig(env: NodeJS.ProcessEnv = process.env): SsoConfig | null {
  const raw = readText(env, "ASTRA_SSO");
  if (raw === undefined) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`ASTRA_SSO is not valid JSON (${e.message})`);
  }
  const parsed = ssoSchema.safeParse(json);
  if (!parsed.success) throw new Error(`ASTRA_SSO: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`);
  const clientSecret = readText(env, "ASTRA_SSO_CLIENT_SECRET");
  if (!clientSecret) throw new Error("ASTRA_SSO is set but ASTRA_SSO_CLIENT_SECRET (or ASTRA_SSO_CLIENT_SECRET_FILE) is not");
  const c = parsed.data;
  return {
    tenantId: c.tenantId.toLowerCase(),
    clientId: c.clientId,
    clientSecret,
    authority: (c.authority ?? "https://login.microsoftonline.com").replace(/\/+$/, ""),
    redirectUri: c.redirectUri,
    scopes: Array.from(new Set(["openid", "profile", "email", ...(c.scopes ?? [])])),
    roleMap: c.roles.map,
    defaultRole: c.roles.default ?? null,
    organizationId: c.organizationId ?? null,
    localLogin: c.localLogin ?? "on",
    sessionHours: c.sessionHours ?? 8,
    requireMfa: c.requireMfa ?? false,
    allowedEmailDomains: c.allowedEmailDomains ? c.allowedEmailDomains.map((d) => d.trim().toLowerCase().replace(/^@/, "")) : null,
    buttonLabel: c.buttonLabel ?? "Sign in with Microsoft",
  };
}

let cachedKey: string | null = null;
let cached: SsoConfig | null = null;
/** The configuration in force, read from the environment once and then served from memory. */
export function getSso(): SsoConfig | null {
  const key = ["ASTRA_SSO", "ASTRA_SSO_FILE", "ASTRA_SSO_CLIENT_SECRET", "ASTRA_SSO_CLIENT_SECRET_FILE"].map((k) => process.env[k] ?? "").join("\u0001");
  if (cachedKey === key) return cached;
  cached = readSsoConfig();
  cachedKey = key;
  return cached;
}

/** getSso() for a caller that must not fail on a bad configuration (boot already refused it). */
export function ssoOrNull(): SsoConfig | null {
  try {
    return getSso();
  } catch {
    return null;
  }
}

export function validateSsoEnv(): string[] {
  try {
    getSso();
    return [];
  } catch (e: any) {
    return [`Single sign-on is misconfigured: ${e.message}`];
  }
}

/** A line for the startup log. Never the secret. */
export function describeSso(): string {
  try {
    const c = getSso();
    if (!c) return "sso=off";
    return `sso=entra tenant=${c.tenantId.slice(0, 8)}… local-login=${c.localLogin} session=${c.sessionHours}h${c.requireMfa ? " mfa-required" : ""}`;
  } catch {
    return "sso=invalid";
  }
}

/** What the sign-in page may know. */
export function ssoPublicView(): { enabled: true; loginUrl: string; label: string; localLogin: "on" | "admins-only" } | null {
  const c = ssoOrNull();
  return c ? { enabled: true, loginUrl: SSO_LOGIN_PATH, label: c.buttonLabel, localLogin: c.localLogin } : null;
}

// ─── The three endpoints ─────────────────────────────────────────────────────

export const authorizeUrl = (c: SsoConfig) => `${c.authority}/${c.tenantId}/oauth2/v2.0/authorize`;
export const tokenUrl = (c: SsoConfig) => `${c.authority}/${c.tenantId}/oauth2/v2.0/token`;
export const jwksUrl = (c: SsoConfig) => `${c.authority}/${c.tenantId}/discovery/v2.0/keys`;
export const issuerOf = (c: SsoConfig) => `${c.authority}/${c.tenantId}/v2.0`;

// ─── The transaction cookie ──────────────────────────────────────────────────

const TXN_LIFETIME_MS = 10 * 60_000;
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const rand = (n: number) => crypto.randomBytes(n).toString("base64url");
const sealKey = () => deriveSecret("sso-transaction");

interface Transaction { s: string; n: string; v: string; r: string; exp: number }

/** Signed, not secret: what the callback needs to recognise its own sign-in, with no server-side state. */
export function seal(t: Transaction): string {
  const body = b64u(JSON.stringify(t));
  return `${body}.${crypto.createHmac("sha256", sealKey()).update(body).digest("base64url")}`;
}

export function unseal(value: string | undefined): Transaction | null {
  if (!value || value.length > 2000) return null;
  const [body, mac, extra] = value.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = crypto.createHmac("sha256", sealKey()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Transaction;
    if (typeof t.s !== "string" || typeof t.n !== "string" || typeof t.v !== "string" || typeof t.r !== "string" || typeof t.exp !== "number") return null;
    return t.exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

/** Where to go after sign-in: a path on this site, never an address someone else supplied. */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return "/";
  if (raw === SSO_LOGIN_PATH || raw.startsWith("/api/auth/sso") || raw === "/login") return "/";
  return raw;
}

export function beginSignIn(cfg: SsoConfig, returnTo: unknown): { url: string; transaction: string } {
  const state = rand(24);
  const nonce = rand(24);
  const verifier = rand(48);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(authorizeUrl(cfg));
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: cfg.scopes.join(" "),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), transaction: seal({ s: state, n: nonce, v: verifier, r: safeReturnTo(returnTo), exp: Date.now() + TXN_LIFETIME_MS }) };
}

// ─── Coming back ─────────────────────────────────────────────────────────────

export type SsoErrorCode =
  | "not_enabled" | "invalid_state" | "idp_error" | "token_exchange_failed" | "invalid_token" | "mfa_required"
  | "no_role" | "domain_not_allowed" | "provisioning_failed" | "account_disabled";

export interface SsoClaims {
  tenantId: string;
  oid: string;
  email: string | null;
  upn: string | null;
  name: string | null;
  roles: string[];
  amr: string[];
}

export type Outcome<T> = ({ ok: true } & T) | { ok: false; code: SsoErrorCode; detail?: string };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const text = (v: unknown, max = 320): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
const clean = (s: string) => s.replace(/[\u0000-\u001f]+/g, " ").slice(0, 200);

// The tenant's signing keys, kept for an hour and refetched (at most every five minutes) for a key id we have not seen.
interface KeyCache { at: number; fetchedAt: number; keys: Array<Record<string, any>> }
const jwksCache = new Map<string, KeyCache>();
const KEYS_TTL_MS = 60 * 60_000;
const KEYS_REFETCH_MS = 5 * 60_000;
export function resetSsoForTests(): void { jwksCache.clear(); cachedKey = null; cached = null; }

async function signingKey(cfg: SsoConfig, kid: string): Promise<crypto.KeyObject | null> {
  const url = jwksUrl(cfg);
  const now = Date.now();
  const find = (c: KeyCache | undefined) => c?.keys.find((k) => k.kid === kid && k.kty === "RSA" && (k.use === undefined || k.use === "sig") && (k.alg === undefined || k.alg === "RS256"));
  let entry = jwksCache.get(url);
  if (!entry || now - entry.at > KEYS_TTL_MS || (!find(entry) && now - entry.fetchedAt > KEYS_REFETCH_MS)) {
    const res = await policyFetch("sso:keys")(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`the tenant's signing keys could not be fetched (HTTP ${res.status})`);
    const body = (await res.json().catch(() => null)) as { keys?: unknown } | null;
    if (!body || !Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 50) throw new Error("the tenant's signing keys are not in the expected form");
    entry = { at: now, fetchedAt: now, keys: body.keys as Array<Record<string, any>> };
    jwksCache.set(url, entry);
  }
  const jwk = find(entry);
  return jwk ? crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" }) : null;
}

async function exchangeCode(cfg: SsoConfig, code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: verifier,
  });
  const res = await policyFetch("sso:token")(tokenUrl(cfg), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(), redirect: "manual", signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || typeof json.error === "string") {
    const why = json && typeof json.error === "string" ? `${clean(json.error)}${typeof json.error_description === "string" ? ` (${clean(String(json.error_description).split(/\r?\n/)[0])})` : ""}` : `HTTP ${res.status}`;
    throw new Error(`token endpoint: ${why}`);
  }
  if (typeof json.id_token !== "string" || json.id_token.length > 16_384) throw new Error("token endpoint answered without an ID token");
  return json.id_token;
}

/** Checks the ID token and returns who it is about. Everything wrong is a refusal, with the reason for the log. */
export async function verifyIdToken(cfg: SsoConfig, idToken: string, nonce: string): Promise<Outcome<{ claims: SsoClaims }>> {
  const decoded = jwt.decode(idToken, { complete: true });
  const header = decoded && typeof decoded === "object" ? (decoded as { header?: { alg?: string; kid?: string } }).header : undefined;
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string") return { ok: false, code: "invalid_token", detail: "unsupported algorithm or no key id" };
  let key: crypto.KeyObject | null;
  try {
    key = await signingKey(cfg, header.kid);
  } catch (e: any) {
    return { ok: false, code: "invalid_token", detail: clean(String(e?.message ?? e)) };
  }
  if (!key) return { ok: false, code: "invalid_token", detail: "signed with a key the tenant does not publish" };
  let payload: Record<string, unknown>;
  try {
    payload = jwt.verify(idToken, key, { algorithms: ["RS256"], issuer: issuerOf(cfg), audience: cfg.clientId, clockTolerance: 60 }) as Record<string, unknown>;
  } catch (e: any) {
    return { ok: false, code: "invalid_token", detail: clean(String(e?.message ?? e)) };
  }
  if (payload.nonce !== nonce) return { ok: false, code: "invalid_token", detail: "nonce does not match" };
  if (String(payload.tid ?? "").toLowerCase() !== cfg.tenantId) return { ok: false, code: "invalid_token", detail: "token is for another tenant" };
  const oid = text(payload.oid, 100);
  if (!oid) return { ok: false, code: "invalid_token", detail: "no object id" };
  const claims: SsoClaims = {
    tenantId: cfg.tenantId, oid,
    email: text(payload.email)?.toLowerCase() ?? null, upn: text(payload.preferred_username)?.toLowerCase() ?? null,
    name: text(payload.name, 200), roles: strings(payload.roles), amr: strings(payload.amr),
  };
  if (cfg.requireMfa && !claims.amr.includes("mfa")) return { ok: false, code: "mfa_required", detail: "token does not show multi-factor authentication" };
  return { ok: true, claims };
}

export async function completeSignIn(
  cfg: SsoConfig,
  query: { code?: unknown; state?: unknown; error?: unknown; error_description?: unknown },
  transactionCookie: string | undefined,
): Promise<Outcome<{ claims: SsoClaims; returnTo: string }>> {
  const txn = unseal(transactionCookie);
  if (!txn) return { ok: false, code: "invalid_state", detail: "no valid sign-in in progress" };
  if (typeof query.error === "string") return { ok: false, code: "idp_error", detail: clean(`${query.error}${typeof query.error_description === "string" ? `: ${query.error_description}` : ""}`) };
  const state = typeof query.state === "string" ? query.state : "";
  if (state.length !== txn.s.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(txn.s))) return { ok: false, code: "invalid_state", detail: "state does not match" };
  const code = typeof query.code === "string" ? query.code : "";
  if (!code || code.length > 4096) return { ok: false, code: "invalid_state", detail: "no authorization code" };
  let idToken: string;
  try {
    idToken = await exchangeCode(cfg, code, txn.v);
  } catch (e: any) {
    return { ok: false, code: "token_exchange_failed", detail: clean(String(e?.message ?? e)) };
  }
  const verified = await verifyIdToken(cfg, idToken, txn.n);
  return verified.ok ? { ok: true, claims: verified.claims, returnTo: txn.r } : verified;
}

// ─── Who they are in Astra ───────────────────────────────────────────────────

/** Highest first: a person holding several mapped app roles gets the most privileged. */
const PRIORITY = ["admin", "compliance_security", "outcome_owner", "agent_engineer", "ops_sre", "expert_validator", "finance", "domain_expert"];
const rank = (r: string) => { const i = PRIORITY.indexOf(r); return i === -1 ? PRIORITY.length : i; };

export function roleFor(cfg: SsoConfig, appRoles: string[]): string | null {
  const mapped = appRoles.map((r) => (Object.prototype.hasOwnProperty.call(cfg.roleMap, r) ? cfg.roleMap[r] : null)).filter((r): r is string => !!r);
  if (mapped.length > 0) return mapped.sort((a, b) => rank(a) - rank(b))[0];
  return cfg.defaultRole;
}

export function emailAllowed(cfg: SsoConfig, claims: SsoClaims): boolean {
  if (!cfg.allowedEmailDomains) return true;
  const address = claims.email ?? claims.upn;
  const domain = address && address.includes("@") ? address.slice(address.lastIndexOf("@") + 1) : null;
  return !!domain && cfg.allowedEmailDomains.includes(domain);
}

export interface SsoUser { id: string; username: string; role: string | null; email: string | null; organizationId: string | null; externalId: string | null; authSource: string | null; active?: boolean }

/** The few things single sign-on needs from the database, so it can be exercised without one. */
export interface SsoUserStore {
  findByExternalId(externalId: string): Promise<SsoUser | undefined>;
  usernameTaken(username: string): Promise<boolean>;
  create(row: { username: string; email: string | null; role: string; organizationId: string | null; externalId: string }): Promise<SsoUser>;
  update(id: string, patch: { role?: string; email?: string | null }): Promise<SsoUser>;
  defaultOrganizationId(): Promise<string | null>;
}

const isUniqueViolation = (e: any) => /unique|duplicate/i.test(String(e?.message ?? e));

/** The account for a person who has just proved who they are, created on their first sign-in. */
export async function resolveUser(cfg: SsoConfig, claims: SsoClaims, store: SsoUserStore): Promise<Outcome<{ user: SsoUser; created: boolean }>> {
  if (!emailAllowed(cfg, claims)) return { ok: false, code: "domain_not_allowed" };
  const role = roleFor(cfg, claims.roles);
  if (!role) return { ok: false, code: "no_role" };
  // Lower case, so the key is the same whichever way the object id was written (SCIM provisions by the same key).
  const externalId = `${claims.tenantId}:${claims.oid.toLowerCase()}`;
  const email = claims.email ?? (claims.upn && claims.upn.includes("@") ? claims.upn : null);

  const existing = await store.findByExternalId(externalId);
  if (existing) {
    // Deprovisioned by the identity provider (SCIM): proving who they are is no longer enough.
    if (existing.active === false) return { ok: false, code: "account_disabled" };
    // The role is Entra's to decide, every time.
    const patch: { role?: string; email?: string | null } = {};
    if (existing.role !== role) patch.role = role;
    if (email && existing.email !== email) patch.email = email;
    return { ok: true, user: Object.keys(patch).length > 0 ? await store.update(existing.id, patch) : existing, created: false };
  }

  const base = (claims.upn ?? claims.email ?? `sso-${claims.oid}`).slice(0, 120);
  const suffix = crypto.createHash("sha256").update(externalId).digest("hex").slice(0, 6);
  const candidates = [base, `${base}-${suffix}`, `sso-${suffix}${crypto.randomBytes(2).toString("hex")}`];
  const organizationId = cfg.organizationId ?? (await store.defaultOrganizationId());
  for (const username of candidates) {
    if (await store.usernameTaken(username)) continue;
    try {
      return { ok: true, user: await store.create({ username, email, role, organizationId, externalId }), created: true };
    } catch (e: any) {
      if (!isUniqueViolation(e)) return { ok: false, code: "provisioning_failed", detail: clean(String(e?.message ?? e)) };
      // Two first sign-ins at once, or a name taken a moment ago: the person may now exist, otherwise try the next name.
      const raced = await store.findByExternalId(externalId);
      if (raced) return { ok: true, user: raced, created: false };
    }
  }
  return { ok: false, code: "provisioning_failed", detail: "no free user name" };
}
