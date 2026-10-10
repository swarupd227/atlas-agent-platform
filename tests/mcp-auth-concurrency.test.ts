/**
 * One credential row per MCP server, however many saves arrive at once (upsertMcpServerAuth in server/storage.ts,
 * server/mcp-auth-uniqueness.ts).
 *
 * The bug: the save read the row that was there and then wrote, with nothing between, so ten saves of a new
 * server's credentials at once each found no row and each inserted one; the table had no uniqueness on server_id,
 * and which row a connector read was arbitrary. The stand-in database below has what that needs to show up and to
 * be fixed: reads see only what is committed, a transaction's writes appear when it commits, an advisory lock is
 * held until its transaction ends, and the connection pool is small (a save that waits for a second connection
 * while holding one deadlocks it). Part two tests the start-up step that removes provably identical duplicates
 * and then makes the database refuse more.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableName } from "drizzle-orm";
import { resetState, rowsOf, sleep, state } from "./support/concurrent-db";

// The stand-in database (tests/support/concurrent-db.ts): committed reads, transactions that commit at the end,
// advisory locks held to the end of their transaction, and a small connection pool.
vi.mock("../server/db", async () => {
  const { makeDb } = await import("./support/concurrent-db");
  return { pool: {}, db: makeDb() };
});
/** Its counters and switches, read and written live (they are not copied: a reset replaces them). */
const h: any = new Proxy({}, { get: (_t, k) => (state() as any)[k], set: (_t, k, v) => { (state() as any)[k] = v; return true; } });

const ENV_KEYS = ["INTEGRATION_VAULT_KEY"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
beforeEach(() => {
  vi.resetModules();
  resetState();
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.INTEGRATION_VAULT_KEY = "concurrency-test-vault-key";
});
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const loadStorage = async () => (await import("../server/storage")).storage;
const rows = () => rowsOf("mcp_server_auth");
const save = (storage: any, serverId: string, token: string) => storage.upsertMcpServerAuth({ serverId, authType: "bearer", config: { token } });

// ═══ Saving ══════════════════════════════════════════════════════════════════

describe("saving credentials at the same moment", () => {
  it("ten first saves of one server leave exactly one row, which reads back as one of what was saved", async () => {
    const storage = await loadStorage();
    await Promise.all(Array.from({ length: 10 }, (_, i) => save(storage, "srv-race", `T-${i}`)));
    expect(rows().length).toBe(1);
    const got: any = await storage.getMcpServerAuth("srv-race");
    expect(got.config.token).toMatch(/^T-\d$/);
  });

  it("ten later saves leave one row too, and every one of them wrote to it", async () => {
    const storage = await loadStorage();
    await save(storage, "srv-race", "first");
    await Promise.all(Array.from({ length: 10 }, (_, i) => save(storage, "srv-race", `U-${i}`)));
    expect(rows().length).toBe(1);
    expect(((await storage.getMcpServerAuth("srv-race")) as any).config.token).toMatch(/^U-\d$/);
  });

  it("never lets two saves of the same server be inside the critical section at once, and does not make different servers wait for each other", async () => {
    const storage = await loadStorage();
    await Promise.all([
      ...Array.from({ length: 6 }, (_, i) => save(storage, "srv-a", `A-${i}`)),
      ...Array.from({ length: 6 }, (_, i) => save(storage, "srv-b", `B-${i}`)),
    ]);
    expect(h.maxByKey["mcp_server_auth:srv-a"]).toBe(1);
    expect(h.maxByKey["mcp_server_auth:srv-b"]).toBe(1);
    expect(h.maxActive).toBeGreaterThan(1); // a and b were in progress together
    expect(rows().map((r) => r.serverId).sort()).toEqual(["srv-a", "srv-b"]);
  });

  it("twenty different servers at once all save, one row each", async () => {
    const storage = await loadStorage();
    await Promise.all(Array.from({ length: 20 }, (_, i) => save(storage, `srv-${i}`, `V-${i}`)));
    expect(rows().length).toBe(20);
    expect(new Set(rows().map((r) => r.serverId)).size).toBe(20);
  });

  it("reads the row that is there inside its own transaction, never on a second connection: a small pool does not deadlock", async () => {
    h.poolSize = 3;
    const storage = await loadStorage();
    const done = await Promise.race([
      Promise.all(Array.from({ length: 12 }, (_, i) => save(storage, `srv-${i % 4}`, `W-${i}`))).then(() => "done"),
      sleep(8000).then(() => "deadlocked"),
    ]);
    expect(done).toBe("done");
    expect(h.poolReads).toBe(0);
    expect(h.maxInUse).toBeLessThanOrEqual(3);
    expect(rows().length).toBe(4);
  }, 15000);

  it("a save that fails lets go of its lock, so the next one is not stuck behind it", async () => {
    const storage = await loadStorage();
    h.failNextInsert = true;
    const results = await Promise.allSettled([save(storage, "srv-x", "one"), save(storage, "srv-x", "two"), save(storage, "srv-x", "three")]);
    expect(results.filter((r) => r.status === "rejected").length).toBe(1);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(2);
    expect(rows().length).toBe(1);
    expect(h.locks.size).toBe(0);
  });

  it("with a unique index in the database the same ten saves still all succeed: the lock keeps them from ever colliding", async () => {
    h.uniqueServerId = true;
    const storage = await loadStorage();
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => save(storage, "srv-u", `X-${i}`)));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(rows().length).toBe(1);
  });

  it("changes nothing a caller can see: the same row comes back, config null, encrypted, lastRotated set", async () => {
    const storage = await loadStorage();
    const saved = await save(storage, "srv-1", "tok-1");
    expect(saved).toMatchObject({ serverId: "srv-1", authType: "bearer", config: null });
    expect(JSON.parse(saved.configEncrypted).v).toBe(1);
    expect(saved.lastRotated).toBeInstanceOf(Date);
    expect(JSON.stringify(rows())).not.toContain("tok-1");
  });
});

// ═══ Making the database refuse a second row ═════════════════════════════════

type Row = { id: string; server_id: string; auth_type: string | null; config: unknown; config_encrypted: string | null; last_rotated: Date | null; created_at: Date | null };

/** A stand-in for the migration's connection that answers exactly the statements the module sends, as Postgres would. */
function fakeClient(initial: Row[], opts: { indexExists?: boolean; failDeleteOf?: string; createIndexFails?: "race" | "other" } = {}) {
  const state = { rows: initial.map((r) => ({ ...r })), index: !!opts.indexExists, log: [] as string[], inTx: false, txSnapshot: null as Row[] | null };
  const query = async (text: string, params: unknown[] = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    state.log.push(sql.split(" ").slice(0, 4).join(" "));
    if (sql.startsWith("SELECT 1 FROM pg_indexes")) return { rows: state.index ? [{ "?column?": 1 }] : [] };
    if (sql.startsWith("SELECT server_id FROM mcp_server_auth GROUP BY")) {
      const counts = new Map<string, number>(); state.rows.forEach((r) => counts.set(r.server_id, (counts.get(r.server_id) ?? 0) + 1));
      return { rows: [...counts].filter(([, n]) => n > 1).map(([server_id]) => ({ server_id })).sort((a, b) => a.server_id.localeCompare(b.server_id)) };
    }
    if (sql.startsWith("SELECT id, server_id, auth_type")) {
      // The order below is what Postgres would do with exactly this clause; any other and the answer would differ.
      if (!sql.endsWith("ORDER BY last_rotated DESC NULLS LAST, created_at DESC NULLS LAST, id DESC")) throw new Error(`the rows must come newest first, but the statement says: ${sql.slice(-90)}`);
      const t = (d: Date | null) => (d ? d.getTime() : -Infinity); // NULLS LAST under DESC means null sorts after everything
      const list = state.rows.filter((r) => r.server_id === params[0]).sort((a, b) =>
        (a.last_rotated ? 0 : 1) - (b.last_rotated ? 0 : 1) || t(b.last_rotated) - t(a.last_rotated) ||
        (a.created_at ? 0 : 1) - (b.created_at ? 0 : 1) || t(b.created_at) - t(a.created_at) || b.id.localeCompare(a.id));
      return { rows: list.map((r) => ({ ...r })) };
    }
    if (sql === "BEGIN") { state.inTx = true; state.txSnapshot = state.rows.map((r) => ({ ...r })); return { rows: [] }; }
    if (sql === "COMMIT") { state.inTx = false; state.txSnapshot = null; return { rows: [] }; }
    if (sql === "ROLLBACK") { if (state.txSnapshot) state.rows = state.txSnapshot; state.inTx = false; return { rows: [] }; }
    if (sql.startsWith("DELETE FROM mcp_server_auth WHERE id")) {
      if (opts.failDeleteOf === params[0]) throw new Error("delete failed");
      state.rows = state.rows.filter((r) => r.id !== params[0]); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_server_auth_server")) {
      if (opts.createIndexFails === "race") { state.index = true; throw new Error("relation already exists"); }
      if (opts.createIndexFails === "other") throw new Error("disk full");
      const seen = new Set<string>();
      for (const r of state.rows) { if (seen.has(r.server_id)) throw new Error('could not create unique index: Key (server_id) is duplicated'); seen.add(r.server_id); }
      state.index = true; return { rows: [] };
    }
    throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
  };
  return { client: { query }, state };
}

describe("making the database refuse a second row per server", () => {
  const D = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
  const run = async (client: any, log: any = { log: vi.fn(), warn: vi.fn() }) => ({ result: await (await import("../server/mcp-auth-uniqueness")).ensureMcpServerAuthUnique(client, log), log });
  const blob = async (map: Record<string, string>) => (await import("../server/credential-vault")).encryptCredentialMap(map);
  const row = async (id: string, serverId: string, map: Record<string, string> | null, over: Partial<Row> = {}): Promise<Row> =>
    ({ id, server_id: serverId, auth_type: "bearer", config: null, config_encrypted: map ? await blob(map) : null, last_rotated: D(5), created_at: D(1), ...over });

  it("with no duplicates it just builds the index", async () => {
    const { client, state } = fakeClient([await row("a", "s1", { t: "1" }), await row("b", "s2", { t: "2" })]);
    const { result, log } = await run(client);
    expect(result).toEqual({ duplicateServers: 0, removed: 0, unresolved: 0, indexed: true });
    expect(state.index).toBe(true);
    expect(state.rows.length).toBe(2);
    expect(log.log).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("duplicates that hold exactly the same credential: the newest is kept, the rest removed, and the index built", async () => {
    const same = { token: "abc" };
    const { client, state } = fakeClient([
      await row("old", "s1", same, { last_rotated: D(2) }), await row("mid", "s1", same, { last_rotated: D(3) }), await row("new", "s1", same, { last_rotated: D(4) }),
      await row("only", "s2", { t: "2" }),
    ]);
    const { result, log } = await run(client);
    expect(result).toEqual({ duplicateServers: 1, removed: 2, unresolved: 0, indexed: true });
    expect(state.rows.map((r) => r.id).sort()).toEqual(["new", "only"]);
    expect(state.index).toBe(true);
    expect(String(log.log.mock.calls[0][0])).toMatch(/removed 2 duplicate credential row\(s\)/);
  });

  it("the newest by last_rotated is the one kept; a row never rotated is the oldest; ties go to the later id", async () => {
    const same = { k: "v" };
    const { client, state } = fakeClient([
      await row("b", "s1", same, { last_rotated: null, created_at: D(9) }), await row("a", "s1", same, { last_rotated: D(3) }),
      await row("c", "s2", same, { last_rotated: D(3), created_at: D(1) }), await row("d", "s2", same, { last_rotated: D(3), created_at: D(1) }),
    ]);
    await run(client);
    expect(state.rows.map((r) => r.id).sort()).toEqual(["a", "d"]);
  });

  it("never removes a duplicate whose values differ, and does not build the index", async () => {
    const { client, state } = fakeClient([await row("a", "s1", { token: "TOKEN-AAA" }, { last_rotated: D(2) }), await row("b", "s1", { token: "TOKEN-BBB" }, { last_rotated: D(3) })]);
    const { result, log } = await run(client);
    expect(result).toEqual({ duplicateServers: 1, removed: 0, unresolved: 1, indexed: false });
    expect(state.rows.length).toBe(2);
    expect(state.index).toBe(false);
    expect(String(log.warn.mock.calls[0][0])).toMatch(/1 MCP server\(s\) have more than one credential row.*unique index on server_id was NOT created/);
    expect(JSON.stringify(log.warn.mock.calls)).not.toMatch(/TOKEN-AAA|TOKEN-BBB|s1/);
  });

  it("removes the identical ones even when another row for the same server differs, and leaves that one", async () => {
    const same = { token: "same" };
    const { client, state } = fakeClient([
      await row("n", "s1", same, { last_rotated: D(5) }), await row("dup", "s1", same, { last_rotated: D(4) }), await row("diff", "s1", { token: "other" }, { last_rotated: D(3) }),
    ]);
    const { result } = await run(client);
    expect(result).toMatchObject({ removed: 1, unresolved: 1, indexed: false });
    expect(state.rows.map((r) => r.id).sort()).toEqual(["diff", "n"]);
  });

  it("a different auth type is a different credential, even with the same values", async () => {
    const { client, state } = fakeClient([await row("a", "s1", { t: "1" }, { auth_type: "bearer" }), await row("b", "s1", { t: "1" }, { auth_type: "api_key", last_rotated: D(3) })]);
    expect((await run(client)).result).toMatchObject({ removed: 0, unresolved: 1 });
    expect(state.rows.length).toBe(2);
  });

  it("compares legacy plaintext rows too, and a plaintext row is not the same as an encrypted one with other values", async () => {
    const { client, state } = fakeClient([
      await row("a", "s1", null, { config: { token: "x", z: "1" }, last_rotated: D(4) }), await row("b", "s1", null, { config: { z: "1", token: "x" }, last_rotated: D(3) }),
      await row("c", "s2", null, { config: { token: "x" }, last_rotated: D(4) }), await row("d", "s2", { token: "y" }, { last_rotated: D(3) }),
    ]);
    const { result } = await run(client);
    expect(result).toMatchObject({ removed: 1, unresolved: 1, indexed: false });
    expect(state.rows.map((r) => r.id).sort()).toEqual(["a", "c", "d"]);
  });

  it("leaves rows it cannot read (another key) and rows that live in an external secret store, and says so", async () => {
    const ref = JSON.stringify({ v: 2, store: "aws-sm", name: "astra/p/mcp-auth/1" });
    const ref2 = JSON.stringify({ v: 2, store: "aws-sm", name: "astra/p/mcp-auth/2" });
    const { client, state } = fakeClient([
      await row("r1", "s-ref", null, { config_encrypted: ref, last_rotated: D(4) }), await row("r2", "s-ref", null, { config_encrypted: ref2, last_rotated: D(3) }),
      await row("u1", "s-bad", null, { config_encrypted: "{not json", last_rotated: D(4) }), await row("u2", "s-bad", null, { config_encrypted: "{not json", last_rotated: D(3) }),
    ]);
    const { result } = await run(client);
    expect(result).toMatchObject({ removed: 0, unresolved: 2, indexed: false });
    expect(state.rows.length).toBe(4);
    vi.resetModules();
    process.env.INTEGRATION_VAULT_KEY = "rotated-away";
    const wrongKey = fakeClient([await (async () => { process.env.INTEGRATION_VAULT_KEY = "original"; vi.resetModules(); return row("k1", "s1", { t: "1" }, { last_rotated: D(4) }); })(), await row("k2", "s1", { t: "1" }, { last_rotated: D(3) })]);
    vi.resetModules();
    process.env.INTEGRATION_VAULT_KEY = "a-different-key-now";
    expect((await run(wrongKey.client)).result).toMatchObject({ removed: 0, unresolved: 1, indexed: false });
    expect(wrongKey.state.rows.length).toBe(2);
  });

  it("does nothing, and asks nothing beyond whether the index is there, once it exists", async () => {
    const { client, state } = fakeClient([await row("a", "s1", { t: "1" })], { indexExists: true });
    const { result } = await run(client);
    expect(result).toEqual({ duplicateServers: 0, removed: 0, unresolved: 0, indexed: true });
    expect(state.log).toEqual(["SELECT 1 FROM pg_indexes"]);
  });

  it("is safe to run again: after the first run the second finds nothing to do", async () => {
    const same = { t: "1" };
    const { client, state } = fakeClient([await row("a", "s1", same, { last_rotated: D(2) }), await row("b", "s1", same, { last_rotated: D(3) })]);
    await run(client);
    const again = await run(client);
    expect(again.result.removed).toBe(0);
    expect(state.rows.length).toBe(1);
    expect(state.log.filter((l) => l === "DELETE FROM mcp_server_auth WHERE").length).toBe(1);
  });

  it("each server's removals are one transaction, and a failure rolls it back and is raised", async () => {
    const same = { t: "1" };
    const { client, state } = fakeClient(
      [await row("k", "s1", same, { last_rotated: D(5) }), await row("d1", "s1", same, { last_rotated: D(4) }), await row("d2", "s1", same, { last_rotated: D(3) })],
      { failDeleteOf: "d2" },
    );
    await expect(run(client)).rejects.toThrow("delete failed");
    expect(state.rows.map((r) => r.id).sort()).toEqual(["d1", "d2", "k"]);
    expect(state.inTx).toBe(false);
    expect(state.index).toBe(false);
  });

  it("another instance building the index at the same moment is fine; any other failure to build it is raised", async () => {
    const racing = fakeClient([await row("a", "s1", { t: "1" })], { createIndexFails: "race" });
    expect((await run(racing.client)).result.indexed).toBe(true);
    const failing = fakeClient([await row("a", "s1", { t: "1" })], { createIndexFails: "other" });
    await expect(run(failing.client)).rejects.toThrow("disk full");
  });

  it("the stand-in really refuses an index over duplicates, so the step above could not be skipped", async () => {
    const { client } = fakeClient([await row("a", "s1", { t: "1" }), await row("b", "s1", { t: "1" })]);
    await expect(client.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_server_auth_server ON mcp_server_auth (server_id)")).rejects.toThrow(/duplicated/);
  });
});

// ═══ How it is wired ═════════════════════════════════════════════════════════

describe("wiring", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("saving takes a per-server advisory lock in a transaction before it reads the row, and reads it inside that transaction", () => {
    const s = src("server/storage.ts");
    const upsert = s.slice(s.indexOf("async upsertMcpServerAuth("), s.indexOf("async getRemoteAgents("));
    expect(upsert).toContain("return db.transaction(async (tx) => {");
    expect(upsert).toContain("pg_advisory_xact_lock(hashtext(${`mcp_server_auth:${auth.serverId}`}))");
    expect(upsert.indexOf("pg_advisory_xact_lock")).toBeLessThan(upsert.indexOf("this.readMcpServerAuth(tx, auth.serverId)"));
    expect(upsert).toContain("tx.insert(mcpServerAuth)");
    expect(upsert).toContain("tx.update(mcpServerAuth)");
    expect(upsert).not.toMatch(/\bdb\.(insert|update|select)\(/);
    expect(upsert).not.toContain("this.getMcpServerAuth(");
  });

  it("the one reader serves both the pool and a transaction, and getMcpServerAuth is still the pool reader", () => {
    const s = src("server/storage.ts");
    expect(s).toContain("return this.readMcpServerAuth(db, serverId);");
    expect(s).toContain("private async readMcpServerAuth(exec: typeof db |");
  });

  it("start-up removes provable duplicates and builds the index, and a failure there is logged, never fatal", () => {
    const d = src("server/db.ts");
    const at = d.indexOf("await ensureMcpServerAuthUnique(client);");
    expect(at).toBeGreaterThan(-1);
    expect(d.slice(at - 40, at + 220)).toMatch(/try \{\s+await ensureMcpServerAuthUnique\(client\);\s+\} catch \(e: any\) \{\s+console\.error\("\[db\] could not make mcp_server_auth unique per server \(continuing\):"/);
    expect(d).toContain('import { ensureMcpServerAuthUnique } from "./mcp-auth-uniqueness";');
    expect(d.indexOf("ensureMcpServerAuthUnique(client)")).toBeLessThan(d.indexOf('console.log("[db] Startup migrations complete")'));
  });

  it("the module never deletes except a row proved identical, and only inside a transaction", () => {
    const m = src("server/mcp-auth-uniqueness.ts");
    expect(m.match(/DELETE FROM mcp_server_auth/g)?.length).toBe(1);
    expect(m).toContain("extras.filter((r) => contentOf(r) === kept)");
    expect(m).toContain('await client.query("BEGIN")');
    expect(m).toContain('if (p && p.v === 2) return null;');
  });
});
