/**
 * A stand-in database with what it takes for a race between writers to show up, and for its fix to be tested:
 * reads see only what is committed, a transaction's writes appear when it commits, an advisory lock is held until
 * its transaction ends, and the connection pool is small (code that waits for a second connection while holding
 * one deadlocks it). Its state lives on globalThis so a test and a freshly imported mock of ../server/db see the
 * same counters whatever vi.resetModules() has done in between.
 */
import { getTableName } from "drizzle-orm";

export interface ConcurrentDbState {
  committed: Record<string, any[]>;
  poolSize: number;
  inUse: number;
  waiting: Array<() => void>;
  maxInUse: number;
  poolReads: number;
  txReads: number;
  active: number;
  maxActive: number;
  activeByKey: Record<string, number>;
  maxByKey: Record<string, number>;
  locks: Map<string, Array<() => void>>;
  failNextInsert: boolean;
  uniqueServerId: boolean;
  readDelayMs: number;
}

const fresh = (): ConcurrentDbState => ({
  committed: {}, poolSize: 10, inUse: 0, waiting: [], maxInUse: 0, poolReads: 0, txReads: 0, active: 0, maxActive: 0,
  activeByKey: {}, maxByKey: {}, locks: new Map(), failNextInsert: false, uniqueServerId: false, readDelayMs: 4,
});

const G = globalThis as any;
G.__concurrentDbState ??= fresh();
export const state = (): ConcurrentDbState => G.__concurrentDbState;
export const resetState = (): void => { G.__concurrentDbState = fresh(); };
export const rowsOf = (name: string): any[] => state().committed[name] ?? [];

function paramsOf(node: any, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  if (node.constructor?.name === "Param") out.push(node.value);
  if (Array.isArray(node)) node.forEach((n) => paramsOf(n, out));
  else if (Array.isArray(node.queryChunks)) node.queryChunks.forEach((n: any) => paramsOf(n, out));
  return out;
}
const table = (t: any) => (state().committed[getTableName(t)] ??= []);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A connection from a small pool: taken for a transaction, or for one statement outside one. */
async function takeConnection() {
  const s = state();
  if (s.inUse >= s.poolSize) await new Promise<void>((r) => s.waiting.push(r));
  s.inUse++; s.maxInUse = Math.max(s.maxInUse, s.inUse);
}
function giveBack() { const s = state(); s.inUse--; s.waiting.shift()?.(); }

async function acquire(key: string, release: Array<() => void>) {
  const s = state();
  const queue = s.locks.get(key);
  if (queue) { await new Promise<void>((r) => queue.push(r)); } else { s.locks.set(key, []); }
  release.push(() => { const q = s.locks.get(key)!; const next = q.shift(); if (next) next(); else s.locks.delete(key); });
}

export function makeDb(): any {
  const reader = (visible: (t: any) => any[], count: "pool" | "tx") => ({
    from: (t: any) => ({
      where: async (cond: any) => {
        const s = state();
        if (count === "pool") { await takeConnection(); s.poolReads++; } else s.txReads++;
        try {
          await sleep(s.readDelayMs);
          const vals = paramsOf(cond);
          return visible(t).filter((r) => vals.some((v) => Object.values(r).includes(v))).map((r) => ({ ...r }));
        } finally { if (count === "pool") giveBack(); }
      },
    }),
  });
  return {
    select: () => reader((t) => table(t), "pool"),
    insert: () => { throw new Error("outside a transaction"); },
    update: () => { throw new Error("outside a transaction"); },
    execute: async () => [],
    transaction: async (cb: (tx: any) => Promise<unknown>) => {
      const s = state();
      await takeConnection();
      const pending: Array<() => void> = [];
      const release: Array<() => void> = [];
      let serverKey = "";
      s.active++; s.maxActive = Math.max(s.maxActive, s.active);
      const tx: any = {
        execute: async (q: any) => {
          // drizzle keeps an interpolated string as a raw chunk of the sql template; the lock key is the first one.
          const key = String((q?.queryChunks ?? []).find((c: unknown) => typeof c === "string") ?? "");
          if (!key.startsWith("mcp_server_auth:")) throw new Error(`the lock was taken on an unexpected key: ${JSON.stringify(key)}`);
          serverKey = key;
          s.activeByKey[key] ??= 0;
          await acquire(key, release);
          s.activeByKey[key]++; s.maxByKey[key] = Math.max(s.maxByKey[key] ?? 0, s.activeByKey[key]);
          return [];
        },
        select: () => reader((t) => table(t), "tx"),
        insert: (t: any) => ({ values: (v: any) => ({ returning: async () => {
          if (s.failNextInsert) { s.failNextInsert = false; throw new Error("insert failed"); }
          const row = { id: `row-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), ...v };
          pending.push(() => {
            if (s.uniqueServerId && table(t).some((r) => r.serverId === row.serverId)) throw new Error('duplicate key value violates unique constraint "idx_mcp_server_auth_server"');
            table(t).push(row);
          });
          return [{ ...row }];
        } }) }),
        update: (t: any) => ({ set: (v: any) => ({ where: (cond: any) => ({ returning: async () => {
          const vals = paramsOf(cond);
          const hit = table(t).filter((r) => vals.some((x) => Object.values(r).includes(x)));
          pending.push(() => hit.forEach((r) => Object.assign(r, v)));
          return hit.map((r) => ({ ...r, ...v }));
        } }) }) }),
      };
      try {
        const result = await cb(tx);
        pending.forEach((apply) => apply()); // commit: only now do other transactions see the writes
        return result;
      } finally {
        if (serverKey) s.activeByKey[serverKey]--;
        s.active--;
        release.forEach((r) => r());
        giveBack();
      }
    },
  };
}
