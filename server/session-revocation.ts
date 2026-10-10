/**
 * Ending a session before its cookie expires, for people who sign in with Microsoft (server/sso.ts) and are
 * deprovisioned by their identity provider (server/scim.ts).
 *
 * A session cookie is a signed token that nothing looks up: that is why a password sign-in costs no database
 * query per request, and it stays that way. This check applies to ONE kind of token only: one issued by single
 * sign-on (it carries `src: "sso"`), and only while SCIM is switched on. For every other request,
 * password sign-ins included, `checkSession` answers "ok" without reading anything.
 *
 * For an SSO token it reads the person's row (cached for 30 seconds, and dropped at once on the instance that
 * deprovisioned them) and refuses it if the person is gone, inactive, or the token was issued before their
 * sessions were revoked. If the row cannot be read it refuses too ("unavailable"), because answering "ok" when
 * we cannot tell would keep a revoked person signed in exactly when the database is struggling.
 */
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "./db";

export interface SessionState { active: boolean; validAfter: Date | null }
export type SessionVerdict = "ok" | "revoked" | "unavailable";

/** How long a person's state is remembered: the longest another instance can keep honouring a revoked session. */
export const SESSION_CACHE_MS = 30_000;

/** SCIM is on when it has a token; boot (config.ts) refuses a token without single sign-on. */
export function scimSwitchedOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.ASTRA_SCIM_TOKEN?.trim() || env.ASTRA_SCIM_TOKEN_FILE?.trim());
}

type Loader = (userId: string) => Promise<SessionState | null>;

const dbLoader: Loader = async (userId) => {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ? { active: row.active !== false, validAfter: row.sessionsValidAfter ?? null } : null;
};

let load: Loader = dbLoader;
const cache = new Map<string, { at: number; state: SessionState | null }>();

/** Forget what is remembered about one person (or everyone), so the next request reads the row afresh. */
export function forgetSession(userId?: string): void {
  if (userId) cache.delete(userId); else cache.clear();
}

export function setSessionLoaderForTests(l: Loader | null): void { load = l ?? dbLoader; cache.clear(); }

/** Does this token still stand? Reads nothing unless it is an SSO token and SCIM is on. */
export async function checkSession(token: { userId: string; src?: string; iat?: number }, now: number = Date.now()): Promise<SessionVerdict> {
  if (token.src !== "sso" || !scimSwitchedOn()) return "ok";
  let entry = cache.get(token.userId);
  if (!entry || now - entry.at >= SESSION_CACHE_MS) {
    try {
      entry = { at: now, state: await load(token.userId) };
    } catch {
      return "unavailable";
    }
    if (cache.size >= 5000) cache.clear();
    cache.set(token.userId, entry);
  }
  const s = entry.state;
  if (!s || !s.active) return "revoked";
  if (s.validAfter && (token.iat ?? 0) * 1000 < s.validAfter.getTime()) return "revoked";
  return "ok";
}
