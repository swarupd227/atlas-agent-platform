/**
 * Reuses an already-connected SqlConnector across tool calls instead of
 * opening a fresh one (and, for ssh_tunnel/relay_agent modes, a fresh
 * tunnel) every single time. Measured directly during live verification:
 * a multi-step agent question (describe table, describe another, run
 * query) paid a full SSH-handshake or relay-round-trip on EVERY step,
 * since server/integrations/sql/mcp-server.ts previously built and closed
 * a connector per call.
 *
 * Scoped per (integration, org, exact credentials) rather than per
 * workspace-run: pooled dialect clients (pg.Pool, mysql2's pool, mssql's
 * ConnectionPool) are explicitly designed for concurrent multiplexed use,
 * and a tunnel or relay stream multiplexes multiple queries the same way --
 * so sharing one session across every concurrent run from the same org is
 * the correct, MORE efficient fix, not a corner cut. Threading a per-run
 * key through the generic MCP tool-dispatch path (shared by every
 * integration, not just SQL) would be substantially more invasive for no
 * real benefit over this.
 */

import { createHash } from "crypto";
import type { SqlConnector, SqlCredentials } from "./types";

interface CachedSession {
  client: SqlConnector;
  lastUsedAt: number;
}

const IDLE_EVICT_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const sessions = new Map<string, CachedSession>();
let sweepTimer: NodeJS.Timeout | null = null;

function ensureSweepTimer(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of Array.from(sessions.entries())) {
      if (now - session.lastUsedAt > IDLE_EVICT_MS) {
        sessions.delete(key);
        session.client.close().catch(() => {});
      }
    }
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref();
}

function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(obj).sort().reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {} as Record<string, unknown>)
  );
}

function cacheKey(integrationId: string, orgId: string, credentials: SqlCredentials): string {
  const hash = createHash("sha256").update(stableStringify(credentials as Record<string, unknown>)).digest("hex").slice(0, 16);
  return `${integrationId}:${orgId}:${hash}`;
}

/**
 * Returns the cached connector for this exact (integration, org,
 * credentials) combination, building and caching a fresh one via `build()`
 * on a miss. A credential change naturally misses cache (different hash)
 * rather than reusing stale creds; the orphaned old entry is reclaimed by
 * the idle sweep.
 */
export function getOrCreateSession(
  integrationId: string,
  orgId: string,
  credentials: SqlCredentials,
  build: () => SqlConnector
): SqlConnector {
  ensureSweepTimer();
  const key = cacheKey(integrationId, orgId, credentials);
  const existing = sessions.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.client;
  }
  const client = build();
  sessions.set(key, { client, lastUsedAt: Date.now() });
  return client;
}

/**
 * Evicts and closes the cached session so the next call builds a fresh
 * one. Callers should evict after ANY error from a cached connector --
 * the underlying connection or tunnel may be poisoned (dead pool, dropped
 * SSH channel), and silently keeping a broken connector cached would fail
 * every subsequent call until the 5-minute idle sweep happens to catch it.
 */
export function evictSession(integrationId: string, orgId: string, credentials: SqlCredentials): void {
  const key = cacheKey(integrationId, orgId, credentials);
  const existing = sessions.get(key);
  if (existing) {
    sessions.delete(key);
    existing.client.close().catch(() => {});
  }
}

export function _sessionCacheSizeForTests(): number {
  return sessions.size;
}

export function _clearSessionCacheForTests(): void {
  for (const session of Array.from(sessions.values())) session.client.close().catch(() => {});
  sessions.clear();
}
