/**
 * What an MCP server needs beyond a single static header, added without changing any auth type that
 * already existed:
 *
 *  - extraHeaders: additional request headers sent with any auth type, for services that want more
 *    than one credential at once (Adobe: `Authorization: Bearer <IMS token>` AND `x-api-key`).
 *  - oauth2_client_credentials: the platform gets its own access token from the server's token
 *    endpoint with a client id and secret, keeps it until shortly before it expires, and gets a new
 *    one. This is what a gateway that wants a short-lived JWT (Adobe IMS, AgentCore Gateway with a
 *    JWT authorizer) needs, so nobody pastes a token that lapses in an hour.
 *
 * buildMcpAuthHeaders (server/mcp-client.ts) calls into here only for these two. Every other auth
 * type, and every record without extraHeaders, takes exactly the path it always took.
 */
import crypto from "node:crypto";
import type { McpServer } from "@shared/schema";
import { policyFetch } from "./url-safety";

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

// ─── Extra headers ───────────────────────────────────────────────────────────

export const MAX_EXTRA_HEADERS = 10;
export const MAX_HEADER_VALUE = 2048;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/;

/**
 * Headers the platform or the MCP transport owns. An extra header cannot replace them: the
 * credential goes through the auth type, and the rest would break the request or the session.
 */
const RESERVED = new Set([
  "authorization", "proxy-authorization", "host", "content-length", "content-type", "accept", "transfer-encoding", "connection",
  "keep-alive", "upgrade", "te", "trailer", "expect", "cookie", "set-cookie", "origin", "referer",
  "mcp-session-id", "mcp-protocol-version", "last-event-id",
]);
const isReserved = (lower: string): boolean => RESERVED.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-");

export type ParsedHeaders = { ok: true; headers: Record<string, string> } | { ok: false; error: string };

/** Accepts the object an API caller sends or the JSON text it is stored as. */
export function parseExtraHeaders(raw: unknown): ParsedHeaders {
  if (raw === undefined || raw === null || raw === "") return { ok: true, headers: {} };
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Additional headers must be a JSON object of header names to values." };
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Additional headers must be a JSON object of header names to values." };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_EXTRA_HEADERS) return { ok: false, error: `At most ${MAX_EXTRA_HEADERS} additional headers are allowed.` };
  const headers: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [name, v] of entries) {
    if (!HEADER_NAME.test(name)) return { ok: false, error: `"${name.slice(0, 40)}" is not a valid header name.` };
    const lower = name.toLowerCase();
    if (isReserved(lower)) return { ok: false, error: `The header "${name}" is set by the platform or by the auth type and cannot be added here.` };
    if (seen.has(lower)) return { ok: false, error: `The header "${name}" is given twice.` };
    seen.add(lower);
    if (typeof v !== "string" || v === "") return { ok: false, error: `The value of "${name}" must be a non-empty string.` };
    if (v.length > MAX_HEADER_VALUE) return { ok: false, error: `The value of "${name}" is longer than ${MAX_HEADER_VALUE} characters.` };
    if (/[\r\n\0]/.test(v)) return { ok: false, error: `The value of "${name}" contains a line break.` };
    headers[name] = v;
  }
  return { ok: true, headers };
}

/** The extra headers stored on an auth record's config, or none if there are none (or they cannot be read). */
export function storedExtraHeaders(cfg: Record<string, unknown> | null | undefined): Record<string, string> {
  const parsed = parseExtraHeaders(cfg?.extraHeaders);
  if (!parsed.ok) {
    console.warn(`[mcp-auth] ignoring unreadable extraHeaders: ${parsed.error}`);
    return {};
  }
  return parsed.headers;
}

/** Adds the extra headers to the auth type's own headers. A header the auth type already set is not replaced. */
export function mergeExtraHeaders(base: Record<string, string>, cfg: Record<string, unknown> | null | undefined): Record<string, string> {
  const extra = storedExtraHeaders(cfg);
  const names = Object.keys(extra);
  if (names.length === 0) return base;
  const have = new Set(Object.keys(base).map((k) => k.toLowerCase()));
  const merged = { ...base };
  for (const name of names) if (!have.has(name.toLowerCase())) merged[name] = extra[name];
  return merged;
}

// ─── Validating what an administrator saves ──────────────────────────────────

export const CLIENT_CREDENTIALS = "oauth2_client_credentials";
const CC_FIELDS = ["tokenUrl", "clientId", "clientSecret", "scope", "audience", "tokenAuthMethod"] as const;

export type NormalizedAuth = { ok: true; config: Record<string, unknown> | null | undefined } | { ok: false; errors: string[] };

/**
 * Checks and shapes the config of a PUT /api/mcp-servers/:id/auth.
 *
 * A record that has no extraHeaders and is not a client-credentials record comes back as it went in:
 * nothing about how existing auth types are saved changes. `existing` is the stored config of the same
 * server, so a save that leaves out the extra headers, or (for client credentials) the secret, keeps
 * what is stored: the screen cannot show a secret back, so asking for it again on every edit would be
 * a trap.
 */
export function normalizeMcpAuthInput(authType: string, config: unknown, existing?: { authType?: string; config?: Record<string, unknown> | null } | null): NormalizedAuth {
  const input = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : undefined;
  const isCc = authType === CLIENT_CREDENTIALS;
  if (!isCc && !(input && "extraHeaders" in input) && !storedExtraHeadersFor(existing, authType)) return { ok: true, config: config as any };

  const errors: string[] = [];
  const out: Record<string, unknown> = isCc ? {} : { ...(input ?? {}) };

  // Extra headers: omitted keeps what is stored, present (even empty) replaces it.
  if (authType === "none") {
    if (input && input.extraHeaders !== undefined && input.extraHeaders !== "" && JSON.stringify(input.extraHeaders) !== "{}") errors.push("Additional headers need an auth type other than none.");
    delete out.extraHeaders;
  } else {
    const raw = input && "extraHeaders" in input ? input.extraHeaders : existing?.config?.extraHeaders;
    const parsed = parseExtraHeaders(raw);
    if (!parsed.ok) errors.push(parsed.error);
    else if (Object.keys(parsed.headers).length > 0) out.extraHeaders = JSON.stringify(parsed.headers);
    else delete out.extraHeaders;
  }

  if (isCc) {
    const src = input ?? {};
    const prev = existing?.authType === CLIENT_CREDENTIALS ? (existing.config ?? {}) : {};
    const str = (k: string): string => (typeof src[k] === "string" ? (src[k] as string).trim() : "");
    const tokenUrl = str("tokenUrl");
    const clientId = str("clientId");
    const clientSecret = str("clientSecret") || (typeof prev.clientSecret === "string" ? prev.clientSecret : "");
    const method = str("tokenAuthMethod") || "body";
    if (!tokenUrl) errors.push("The token URL is required.");
    else {
      try {
        const u = new URL(tokenUrl);
        if (u.protocol !== "https:" && u.protocol !== "http:") errors.push("The token URL must be an http or https address.");
        else if (u.username || u.password) errors.push("The token URL must not contain a user name or password.");
        else if (u.hash) errors.push("The token URL must not have a fragment.");
      } catch {
        errors.push("The token URL is not a valid address.");
      }
    }
    if (!clientId) errors.push("The client id is required.");
    else if (clientId.length > 500) errors.push("The client id is too long.");
    if (!clientSecret) errors.push("The client secret is required.");
    else if (clientSecret.length > 4000) errors.push("The client secret is too long.");
    if (method !== "body" && method !== "basic") errors.push('The token request authentication must be "body" or "basic".');
    for (const k of ["scope", "audience"]) if (str(k).length > 1000) errors.push(`The ${k} is too long.`);
    for (const k of Object.keys(src)) if (!(CC_FIELDS as readonly string[]).includes(k) && k !== "extraHeaders" && k !== "accessToken" && k !== "expiresAt") errors.push(`"${k}" is not a setting of this auth type.`);
    // A new save starts from no token: the credentials may have changed.
    Object.assign(out, { tokenUrl, clientId, clientSecret, tokenAuthMethod: method });
    if (str("scope")) out.scope = str("scope");
    if (str("audience")) out.audience = str("audience");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, config: out };
}

function storedExtraHeadersFor(existing: { authType?: string; config?: Record<string, unknown> | null } | null | undefined, authType: string): boolean {
  return authType !== "none" && !!existing?.config && typeof existing.config.extraHeaders === "string" && existing.config.extraHeaders !== "";
}

// ─── Client-credentials token manager ────────────────────────────────────────

const SKEW_MS = 60_000;
const DEFAULT_LIFETIME_S = 300;
const MAX_LIFETIME_S = 7 * 24 * 3600;
const FAILURE_BACKOFF_MS = 30_000;
const TOKEN_TIMEOUT_MS = 10_000;

interface MemToken { token: string; expiresAt: number; creds: string }
const memory = new Map<string, MemToken>();
const inflight = new Map<string, Promise<string>>();
const failures = new Map<string, { at: number; message: string }>();

export function resetMcpAuthForTests(): void {
  memory.clear();
  inflight.clear();
  failures.clear();
}

const formEncode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
const clean = (s: string) => s.replace(/[\r\n\0\u0000-\u001f]+/g, " ").slice(0, 200);

function credentialsHash(cfg: Record<string, unknown>): string {
  const parts = ["tokenUrl", "clientId", "clientSecret", "scope", "audience", "tokenAuthMethod"].map((k) => String(cfg[k] ?? ""));
  return crypto.createHash("sha256").update(parts.join("\u0001")).digest("hex");
}

function cachedIn(cfg: Record<string, unknown>): { token: string; expiresAt: number } | null {
  const token = typeof cfg.accessToken === "string" ? cfg.accessToken : "";
  const expiresAt = Number(cfg.expiresAt);
  return token && Number.isFinite(expiresAt) ? { token, expiresAt } : null;
}

/** A token good for at least another minute, fetching a new one when there is not one. */
export async function getClientCredentialsToken(server: Pick<McpServer, "id" | "name">, cfg: Record<string, unknown>): Promise<string> {
  const creds = credentialsHash(cfg);
  const key = `${server.id}|${creds}`;
  const now = Date.now();

  const stored = cachedIn(cfg);
  if (stored && stored.expiresAt - now > SKEW_MS) return stored.token;
  const mem = memory.get(server.id);
  if (mem && mem.creds === creds && mem.expiresAt - now > SKEW_MS) return mem.token;

  const failed = failures.get(key);
  if (failed && now - failed.at < FAILURE_BACKOFF_MS) {
    const fallback = stored && stored.expiresAt > now ? stored : mem && mem.creds === creds && mem.expiresAt > now ? mem : null;
    if (fallback) return fallback.token;
    throw new McpAuthError(failed.message);
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchAndStore(server, cfg, creds).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  try {
    const token = await pending;
    failures.delete(key);
    return token;
  } catch (e: any) {
    const message = e instanceof McpAuthError ? e.message : `Could not get an access token for "${server.name || server.id}": ${clean(String(e?.message ?? e))}`;
    failures.set(key, { at: Date.now(), message });
    console.warn(`[mcp-auth] ${message}`);
    // A token that has not actually expired yet is still good.
    const fallback = stored && stored.expiresAt > Date.now() ? stored : mem && mem.creds === creds && mem.expiresAt > Date.now() ? mem : null;
    if (fallback) return fallback.token;
    throw e instanceof McpAuthError ? e : new McpAuthError(message);
  }
}

async function fetchAndStore(server: Pick<McpServer, "id" | "name">, cfg: Record<string, unknown>, creds: string): Promise<string> {
  const tokenUrl = String(cfg.tokenUrl ?? "");
  const clientId = String(cfg.clientId ?? "");
  const clientSecret = String(cfg.clientSecret ?? "");
  const method = cfg.tokenAuthMethod === "basic" ? "basic" : "body";
  const label = server.name || server.id;
  if (!tokenUrl || !clientId || !clientSecret) throw new McpAuthError(`The OAuth client credentials for "${label}" are incomplete: set the token URL, client id and client secret.`);

  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (method === "basic") headers.Authorization = `Basic ${Buffer.from(`${formEncode(clientId)}:${formEncode(clientSecret)}`).toString("base64")}`;
  else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  if (cfg.scope) body.set("scope", String(cfg.scope));
  if (cfg.audience) body.set("audience", String(cfg.audience));

  let host = "the token endpoint";
  try { host = new URL(tokenUrl).host; } catch { /* validated when saved */ }

  let res: Response;
  try {
    res = await policyFetch(`mcp-oauth:${server.id}`)(tokenUrl, { method: "POST", headers, body: body.toString(), redirect: "manual", signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) });
  } catch (e: any) {
    const why = e?.name === "TimeoutError" || e?.name === "AbortError" ? `timed out after ${TOKEN_TIMEOUT_MS / 1000}s` : clean(String(e?.message ?? e));
    throw new McpAuthError(`Could not reach the token endpoint ${host} for "${label}": ${why}`);
  }
  const text = await res.text().catch(() => "");
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }

  if (!res.ok || (json && typeof json.error === "string")) {
    const code = json && typeof json.error === "string" ? clean(json.error) : "";
    const desc = json && typeof json.error_description === "string" ? clean(json.error_description) : "";
    throw new McpAuthError(`The token endpoint ${host} refused the request for "${label}": HTTP ${res.status}${code ? ` ${code}` : ""}${desc ? ` (${desc})` : ""}`);
  }
  const token = json && typeof json.access_token === "string" ? json.access_token : "";
  if (!token || token.length > 8192) throw new McpAuthError(`The token endpoint ${host} answered "${label}" without an access token.`);
  if (typeof json.token_type === "string" && json.token_type.toLowerCase() !== "bearer") {
    throw new McpAuthError(`The token endpoint ${host} issued a "${clean(json.token_type)}" token for "${label}"; only Bearer tokens are supported.`);
  }
  const lifetime = Number(json.expires_in);
  const seconds = Number.isFinite(lifetime) && lifetime > 0 ? Math.min(lifetime, MAX_LIFETIME_S) : DEFAULT_LIFETIME_S;
  const expiresAt = Date.now() + seconds * 1000;

  memory.set(server.id, { token, expiresAt, creds });
  await persist(server.id, creds, token, expiresAt);
  return token;
}

/** Keeps the token with the server's encrypted auth record, unless an administrator changed it while we were fetching. */
async function persist(serverId: string, creds: string, token: string, expiresAt: number): Promise<void> {
  try {
    const { storage } = await import("./storage");
    const current = await storage.getMcpServerAuth(serverId);
    const currentCfg = (current?.config as Record<string, unknown> | null) ?? null;
    if (!current || current.authType !== CLIENT_CREDENTIALS || !currentCfg || credentialsHash(currentCfg) !== creds) return;
    await storage.upsertMcpServerAuth({ serverId, authType: CLIENT_CREDENTIALS, config: { ...currentCfg, accessToken: token, expiresAt } });
  } catch (e: any) {
    console.warn(`[mcp-auth] could not store the access token for server ${serverId}: ${clean(String(e?.message ?? e))}`);
  }
}
