/**
 * How connector credentials are stored today (server/credential-vault.ts and the MCP-server auth store in
 * server/storage.ts).
 *
 * This file PINS it. It was written and passed against the code before credentials could be kept in an
 * external secret store, so nothing added since can change what is written to the database when no external
 * store is configured, or how an existing row is read: the blob format (AES-256-GCM, key = sha256 of
 * INTEGRATION_VAULT_KEY), what a failed decrypt does, and what the MCP auth store writes and returns.
 * Real storage object over a stand-in database; real crypto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { getTableName } from "drizzle-orm";

const h = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, ops: [] as string[] }));

/** The values bound into a drizzle condition, e.g. the id in eq(mcpServerAuth.serverId, id). */
function paramsOf(node: any, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  if (node.constructor?.name === "Param") out.push(node.value);
  if (Array.isArray(node)) node.forEach((n) => paramsOf(n, out));
  else if (Array.isArray(node.queryChunks)) node.queryChunks.forEach((n: any) => paramsOf(n, out));
  return out;
}
const rowsOf = (t: any) => (h.tables[getTableName(t)] ??= []);
const matching = (t: any, cond: any) => { const vals = paramsOf(cond); return rowsOf(t).filter((r) => vals.some((v) => Object.values(r).includes(v))); };

vi.mock("../server/db", () => {
  const db: any = {
    select: () => ({ from: (t: any) => ({ where: async (cond: any) => { h.ops.push(`select ${getTableName(t)}`); return matching(t, cond).map((r) => ({ ...r })); } }) }),
    insert: (t: any) => ({ values: (v: any) => ({ returning: async () => { h.ops.push(`insert ${getTableName(t)}`); const row = { id: `row-${rowsOf(t).length + 1}`, createdAt: new Date(), ...v }; rowsOf(t).push(row); return [{ ...row }]; } }) }),
    update: (t: any) => ({ set: (v: any) => ({ where: (cond: any) => ({ returning: async () => { h.ops.push(`update ${getTableName(t)}`); const hit = matching(t, cond); hit.forEach((r) => Object.assign(r, v)); return hit.map((r) => ({ ...r })); } }) }) }),
    // Saving MCP auth takes a per-server lock inside a transaction (added after these pins were written; the
    // stand-in only has to run the callback, and the lock is not one of the reads and writes pinned below).
    execute: async () => [],
    transaction: async (cb: (tx: any) => Promise<unknown>) => cb(db),
  };
  return { pool: {}, db };
});

const ENV_KEYS = ["INTEGRATION_VAULT_KEY", "NODE_ENV", "ASTRA_SECRETS_MANAGER_PREFIX"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
beforeEach(() => {
  vi.resetModules();
  h.tables = {}; h.ops = [];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.INTEGRATION_VAULT_KEY = "pin-test-vault-key";
});
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const vault = () => import("../server/credential-vault");
const loadStorage = async () => (await import("../server/storage")).storage;
/** The documented format, read with nothing but node:crypto: the check that a blob is what it has always been. */
const openByHand = (blob: string, rawKey = "pin-test-vault-key") => {
  const b = JSON.parse(blob);
  const d = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(rawKey).digest(), Buffer.from(b.iv, "hex"));
  d.setAuthTag(Buffer.from(b.tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(b.ciphertext, "hex")), d.final()]).toString("utf8");
};

describe("the vault blob", () => {
  it("is AES-256-GCM under sha256 of INTEGRATION_VAULT_KEY, as JSON with exactly v, iv, tag and ciphertext in hex", async () => {
    const { encryptCredentialMap } = await vault();
    const blob = encryptCredentialMap({ token: "s3cr3t", url: "https://x.example" });
    const parsed = JSON.parse(blob);
    expect(Object.keys(parsed)).toEqual(["v", "iv", "tag", "ciphertext"]);
    expect(parsed.v).toBe(1);
    expect(parsed.iv).toMatch(/^[0-9a-f]{24}$/);
    expect(parsed.tag).toMatch(/^[0-9a-f]{32}$/);
    expect(parsed.ciphertext).toMatch(/^[0-9a-f]+$/);
    expect(JSON.parse(openByHand(blob))).toEqual({ token: "s3cr3t", url: "https://x.example" });
    expect(blob).not.toContain("s3cr3t");
  });

  it("round-trips a map and a plain string, and uses a fresh IV each time", async () => {
    const { encryptCredential, decryptCredential, encryptCredentialMap, decryptCredentialMap } = await vault();
    expect(decryptCredential(encryptCredential("plain"))).toBe("plain");
    expect(decryptCredentialMap(encryptCredentialMap({ a: "1", b: "" }))).toEqual({ a: "1", b: "" });
    const a = JSON.parse(encryptCredential("same")); const b = JSON.parse(encryptCredential("same"));
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a tampered blob, a blob under another key, and a version it does not know", async () => {
    const { encryptCredentialMap, decryptCredentialMap } = await vault();
    const blob = encryptCredentialMap({ k: "v" });
    const t = JSON.parse(blob); t.ciphertext = (t.ciphertext[0] === "0" ? "1" : "0") + t.ciphertext.slice(1);
    expect(() => decryptCredentialMap(JSON.stringify(t))).toThrow();
    const u = JSON.parse(blob); u.tag = "0".repeat(32);
    expect(() => decryptCredentialMap(JSON.stringify(u))).toThrow();
    expect(() => decryptCredentialMap(JSON.stringify({ ...JSON.parse(blob), v: 2 }))).toThrow(/Unsupported vault blob version: 2/);
    expect(() => decryptCredentialMap("not json")).toThrow();
    vi.resetModules();
    process.env.INTEGRATION_VAULT_KEY = "a-different-key";
    const other = await vault();
    expect(() => other.decryptCredentialMap(blob)).toThrow();
  });

  it("in production refuses to run without the key, and says so; elsewhere it uses an ephemeral key with a warning", async () => {
    delete process.env.INTEGRATION_VAULT_KEY;
    process.env.NODE_ENV = "production";
    const { getVaultKey } = await vault();
    expect(() => getVaultKey()).toThrow(/INTEGRATION_VAULT_KEY env var is not set/);
    vi.resetModules();
    process.env.NODE_ENV = "development";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dev = await vault();
    expect(dev.getVaultKey().length).toBe(32);
    expect(dev.decryptCredential(dev.encryptCredential("x"))).toBe("x");
    expect(warn.mock.calls.some((c) => String(c[0]).includes("ephemeral dev key"))).toBe(true);
    warn.mockRestore();
  });
});

describe("the MCP server auth store", () => {
  const row = (over: Record<string, unknown> = {}) => ({ serverId: "srv-1", authType: "bearer", config: null, configEncrypted: null, ...over });

  it("writes the config encrypted, never in the clear: config is null, configEncrypted is a v1 blob, lastRotated is set", async () => {
    const storage = await loadStorage();
    const saved = await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "tok-123" } } as any);
    const stored = h.tables["mcp_server_auth"][0];
    expect(stored.config).toBeNull();
    expect(JSON.parse(stored.configEncrypted).v).toBe(1);
    expect(JSON.parse(openByHand(stored.configEncrypted))).toEqual({ token: "tok-123" });
    expect(stored.lastRotated).toBeInstanceOf(Date);
    expect(JSON.stringify(stored)).not.toContain("tok-123");
    expect(saved.serverId).toBe("srv-1");
    expect(h.ops).toEqual(["select mcp_server_auth", "insert mcp_server_auth"]);
  });

  it("turns every value into a string on the way in (so a structured value is kept as text)", async () => {
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "api_key", config: { n: 5, ok: true, nothing: null, obj: { a: 1 }, list: [1, 2] } } as any);
    expect(JSON.parse(openByHand(h.tables["mcp_server_auth"][0].configEncrypted))).toEqual({ n: "5", ok: "true", nothing: "", obj: "[object Object]", list: "1,2" });
  });

  it("updates the row it has instead of adding another, and re-encrypts", async () => {
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "one" } } as any);
    h.ops = [];
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "two" } } as any);
    expect(h.tables["mcp_server_auth"].length).toBe(1);
    expect(JSON.parse(openByHand(h.tables["mcp_server_auth"][0].configEncrypted))).toEqual({ token: "two" });
    expect(h.ops).toEqual(["select mcp_server_auth", "update mcp_server_auth"]);
  });

  it("stores no secret when there is no config object (none, or an array), and still writes the row", async () => {
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "a", authType: "none", config: null } as any);
    await storage.upsertMcpServerAuth({ serverId: "b", authType: "none", config: [1, 2] } as any);
    for (const r of h.tables["mcp_server_auth"]) { expect(r.configEncrypted).toBeUndefined(); expect(r.config).toBeNull(); }
  });

  it("reads the decrypted config back over whatever is in config, and keeps every other column", async () => {
    const storage = await loadStorage();
    const { encryptCredentialMap } = await vault();
    h.tables["mcp_server_auth"] = [row({ id: "r1", config: { stale: "plaintext" }, configEncrypted: encryptCredentialMap({ token: "live" }) })];
    const got: any = await storage.getMcpServerAuth("srv-1");
    expect(got.config).toEqual({ token: "live" });
    expect(got).toMatchObject({ id: "r1", serverId: "srv-1", authType: "bearer" });
    expect(got.configEncrypted).toBeTruthy();
  });

  it("returns a legacy row with plaintext config as it is, and nothing for an unknown server", async () => {
    const storage = await loadStorage();
    h.tables["mcp_server_auth"] = [row({ id: "r1", config: { token: "legacy" } })];
    expect(((await storage.getMcpServerAuth("srv-1")) as any).config).toEqual({ token: "legacy" });
    expect(await storage.getMcpServerAuth("nobody")).toBeUndefined();
  });

  it("when the blob cannot be decrypted (a changed key) falls back, silently, to the config column", async () => {
    // Pinned as it is today, not as it should be: an unreadable blob is not an error here.
    const storage = await loadStorage();
    const { encryptCredentialMap } = await vault();
    const blob = encryptCredentialMap({ token: "live" });
    vi.resetModules();
    process.env.INTEGRATION_VAULT_KEY = "rotated-away";
    const storage2 = await loadStorage();
    h.tables["mcp_server_auth"] = [row({ id: "r1", config: { token: "fallback" }, configEncrypted: blob })];
    const got: any = await storage2.getMcpServerAuth("srv-1");
    expect(got.config).toEqual({ token: "fallback" });
    expect(storage).toBeTruthy();
  });
});
