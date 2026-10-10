/**
 * Keeping connector credentials in AWS Secrets Manager (server/secret-store.ts, server/credential-store.ts,
 * and the MCP server auth store in server/storage.ts).
 *
 * The real AWS SDK client talks real HTTP to a stand-in Secrets Manager (tests/support/mock-secrets-manager.ts)
 * that enforces the documented rules. What this proves, above all: with no store configured nothing is
 * different (tests/credential-vault-pins.test.ts pins that, written before this existed); with one, no
 * secret value reaches the database; a reference is read from the store or the read fails, never guessed;
 * and a store that is switched off or unreachable cannot leave credentials silently somewhere else. What it
 * cannot prove is that AWS behaves as documented: scripts/check-secrets-manager.mjs does that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableName } from "drizzle-orm";
import { startMockSecretsManager, type MockSecretsManager } from "./support/mock-secrets-manager";

const h = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));

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
    select: () => ({ from: (t: any) => ({ where: async (cond: any) => matching(t, cond).map((r) => ({ ...r })) }) }),
    insert: (t: any) => ({ values: (v: any) => ({ returning: async () => { const row = { id: `row-${rowsOf(t).length + 1}`, createdAt: new Date(), ...v }; rowsOf(t).push(row); return [{ ...row }]; } }) }),
    update: (t: any) => ({ set: (v: any) => ({ where: (cond: any) => ({ returning: async () => { const hit = matching(t, cond); hit.forEach((r) => Object.assign(r, v)); return hit.map((r) => ({ ...r })); } }) }) }),
    execute: async () => [],
    transaction: async (cb: (tx: any) => Promise<unknown>) => cb(db),
  };
  return { pool: {}, db };
});

const ENV_KEYS = [
  "INTEGRATION_VAULT_KEY", "NODE_ENV", "ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT",
  "ASTRA_SECRETS_MANAGER_KMS_KEY_ID", "ASTRA_SECRETS_MANAGER_TIMEOUT_MS", "ASTRA_SECRETS_MANAGER_CACHE_SECONDS", "ASTRA_SECRETS_MANAGER_KINDS",
  "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

let sm: MockSecretsManager;
beforeEach(async () => {
  vi.resetModules();
  h.tables = {};
  for (const k of ENV_KEYS) delete process.env[k];
  sm = await startMockSecretsManager();
  process.env.INTEGRATION_VAULT_KEY = "secret-store-test-key";
  process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE"; process.env.AWS_SECRET_ACCESS_KEY = "example-secret"; // the stand-in does not check them
});
afterEach(async () => {
  await sm.close();
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

/** Switch the store on, against the stand-in. */
const storeOn = (over: Record<string, string> = {}) => {
  process.env.ASTRA_SECRETS_MANAGER_PREFIX = "astra/test/";
  process.env.ASTRA_SECRETS_MANAGER_REGION = sm.region;
  process.env.ASTRA_SECRETS_MANAGER_ENDPOINT = sm.endpoint;
  for (const [k, v] of Object.entries(over)) process.env[k] = v;
};
const secretModule = () => import("../server/secret-store");
const credentialModule = () => import("../server/credential-store");
const loadStorage = async () => (await import("../server/storage")).storage;
const openByHand = (blob: string, rawKey = "secret-store-test-key") => {
  const b = JSON.parse(blob);
  const d = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(rawKey).digest(), Buffer.from(b.iv, "hex"));
  d.setAuthTag(Buffer.from(b.tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(b.ciphertext, "hex")), d.final()]).toString("utf8");
};
const SECRET = "tok-very-secret-123";

// ═══ Configuration ═══════════════════════════════════════════════════════════

describe("configuration", () => {
  const read = async (env: Record<string, string | undefined>) => (await secretModule()).readSecretStoreConfig(env as NodeJS.ProcessEnv);
  const ok = { ASTRA_SECRETS_MANAGER_PREFIX: "astra/prod/", AWS_REGION: "eu-central-1" };

  it("is off unless a prefix is set, and then nothing else is read", async () => {
    for (const v of [undefined, "", "   "]) expect(await read({ ASTRA_SECRETS_MANAGER_PREFIX: v, ASTRA_SECRETS_MANAGER_TIMEOUT_MS: "junk", ASTRA_SECRETS_MANAGER_KINDS: "nonsense" })).toBeNull();
    const m = await secretModule();
    expect(m.validateSecretStoreEnv({} as any)).toEqual([]);
    expect(m.describeSecretStore({} as any)).toBe("secrets=db");
    expect(await m.getSecretStore()).toBeNull();
  });

  it("takes a path-style prefix that ends in a slash", async () => {
    for (const p of ["astra/", "astra/prod/", "astra/prod/eu.1/", "a_b-c=d+e@f.g/"]) expect((await read({ ...ok, ASTRA_SECRETS_MANAGER_PREFIX: p }))!.prefix, p).toBe(p);
    for (const bad of ["astra", "astra/prod", "/astra/", "astra//prod/", "astra/ prod/", "astra/prod/../", "ast ra/", "x".repeat(201) + "/", "astra/pr$d/"]) {
      await expect(read({ ...ok, ASTRA_SECRETS_MANAGER_PREFIX: bad }), bad).rejects.toThrow(/ASTRA_SECRETS_MANAGER_PREFIX must be a path ending in/);
    }
  });

  it("needs a region, from the setting or the environment, that looks like one", async () => {
    expect((await read({ ASTRA_SECRETS_MANAGER_PREFIX: "a/", ASTRA_SECRETS_MANAGER_REGION: "us-east-1", AWS_REGION: "eu-west-1" }))!.region).toBe("us-east-1");
    expect((await read({ ASTRA_SECRETS_MANAGER_PREFIX: "a/", AWS_DEFAULT_REGION: "eu-north-1" }))!.region).toBe("eu-north-1");
    await expect(read({ ASTRA_SECRETS_MANAGER_PREFIX: "a/" })).rejects.toThrow(/needs a region/);
    await expect(read({ ASTRA_SECRETS_MANAGER_PREFIX: "a/", AWS_REGION: "Mars" })).rejects.toThrow(/not an AWS region name/);
  });

  it("allows a custom endpoint only over https, or http on this machine", async () => {
    expect((await read({ ...ok, ASTRA_SECRETS_MANAGER_ENDPOINT: "https://vpce-1.secretsmanager.eu-central-1.vpce.amazonaws.com/" }))!.endpoint).toBe("https://vpce-1.secretsmanager.eu-central-1.vpce.amazonaws.com");
    expect((await read({ ...ok, ASTRA_SECRETS_MANAGER_ENDPOINT: "http://localhost:4566" }))!.endpoint).toBe("http://localhost:4566");
    for (const bad of ["http://sm.example.com", "ftp://x", "nope", "http://169.254.169.254"]) await expect(read({ ...ok, ASTRA_SECRETS_MANAGER_ENDPOINT: bad }), bad).rejects.toThrow(/ASTRA_SECRETS_MANAGER_ENDPOINT/);
  });

  it("takes an optional KMS key, and refuses a malformed one", async () => {
    expect((await read(ok))!.kmsKeyId).toBeNull();
    for (const good of ["alias/astra-secrets", "1234abcd-12ab-34cd-56ef-1234567890ab", "arn:aws:kms:eu-central-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab", "arn:aws:kms:eu-central-1:111122223333:alias/astra"]) {
      expect((await read({ ...ok, ASTRA_SECRETS_MANAGER_KMS_KEY_ID: good }))!.kmsKeyId, good).toBe(good);
    }
    for (const bad of ["secrets", "alias/", "arn:aws:s3:::b"]) await expect(read({ ...ok, ASTRA_SECRETS_MANAGER_KMS_KEY_ID: bad }), bad).rejects.toThrow(/KMS_KEY_ID/);
  });

  it("bounds the time a call may take and how long a read is kept", async () => {
    const c = (await read(ok))!;
    expect([c.timeoutMs, c.cacheSeconds]).toEqual([5000, 60]);
    const d = (await read({ ...ok, ASTRA_SECRETS_MANAGER_TIMEOUT_MS: "800", ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" }))!;
    expect([d.timeoutMs, d.cacheSeconds]).toEqual([800, 0]);
    for (const [k, v] of [["ASTRA_SECRETS_MANAGER_TIMEOUT_MS", "499"], ["ASTRA_SECRETS_MANAGER_TIMEOUT_MS", "60001"], ["ASTRA_SECRETS_MANAGER_TIMEOUT_MS", "x"], ["ASTRA_SECRETS_MANAGER_CACHE_SECONDS", "3601"], ["ASTRA_SECRETS_MANAGER_CACHE_SECONDS", "-1"], ["ASTRA_SECRETS_MANAGER_CACHE_SECONDS", "1.5"]]) {
      await expect(read({ ...ok, [k]: v }), `${k}=${v}`).rejects.toThrow(new RegExp(`${k} must be between`));
    }
  });

  it("chooses which kinds go to the store: all of them unless listed, and only known ones", async () => {
    const m = await secretModule();
    expect(m.WIRED_KINDS).toEqual(["mcp-auth"]);
    expect((await read(ok))!.kinds).toEqual(["mcp-auth"]); // what this version moves over
    expect((await read({ ...ok, ASTRA_SECRETS_MANAGER_KINDS: " mcp-auth , mcp-auth,connection " }))!.kinds).toEqual(["mcp-auth", "connection"]);
    for (const bad of ["mcp-auth,llm-keys", "nonsense", ",", "MCP-AUTH"]) await expect(read({ ...ok, ASTRA_SECRETS_MANAGER_KINDS: bad }), bad).rejects.toThrow(/ASTRA_SECRETS_MANAGER_KINDS must be a list of/);
  });

  it("reports itself, and a wrong setting as an error that stops the server", async () => {
    const m = await secretModule();
    expect(m.describeSecretStore(ok as any)).toBe("secrets=aws-sm(mcp-auth)");
    expect(m.describeSecretStore({ ...ok, ASTRA_SECRETS_MANAGER_KINDS: "mcp-auth,connection" } as any)).toBe("secrets=aws-sm(mcp-auth+connection)");
    expect(m.describeSecretStore({ ASTRA_SECRETS_MANAGER_PREFIX: "bad" } as any)).toBe("secrets=invalid");
    expect(m.validateSecretStoreEnv({ ASTRA_SECRETS_MANAGER_PREFIX: "bad" } as any)[0]).toMatch(/external secret store is misconfigured/);
  });
});

// ═══ The store ═══════════════════════════════════════════════════════════════

describe("the store, through the real SDK", () => {
  const open = async (over: Record<string, string> = {}) => { storeOn(over); const m = await secretModule(); return m.openSecretStoreClient(m.readSecretStoreConfig()!); };

  it("creates a secret under the prefix and kind with a random name, holding the values, tagged as ours", async () => {
    const store = await open();
    const name = await store.create("mcp-auth", { token: SECRET, url: "https://x.example" });
    expect(name).toMatch(/^astra\/test\/mcp-auth\/[0-9a-f-]{36}$/);
    const s = sm.secrets.get(name)!;
    expect(JSON.parse(s.value)).toEqual({ token: SECRET, url: "https://x.example" });
    expect(s.tags).toEqual({ "managed-by": "astra", "astra-kind": "mcp-auth" });
    expect(s.kmsKeyId).toBeUndefined();
    const call = sm.calls.find((c) => c.op === "CreateSecret")!.body;
    expect(call.ClientRequestToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(await store.create("mcp-auth", { a: "1" })).not.toBe(name);
  });

  it("encrypts with the customer-managed key when one is named", async () => {
    const store = await open({ ASTRA_SECRETS_MANAGER_KMS_KEY_ID: "alias/astra-secrets" });
    const name = await store.create("connection", { a: "1" });
    expect(sm.secrets.get(name)!.kmsKeyId).toBe("alias/astra-secrets");
  });

  it("reads back what was written, and a reader cannot change what is kept", async () => {
    const store = await open();
    const name = await store.create("mcp-auth", { token: SECRET });
    const a = await store.get(name); a.token = "tampered";
    expect((await store.get(name)).token).toBe(SECRET);
    await store.put(name, { token: "new" });
    expect(await store.get(name)).toEqual({ token: "new" });
    expect(JSON.parse(sm.secrets.get(name)!.value)).toEqual({ token: "new" });
    expect(sm.secrets.get(name)!.versions).toBe(2);
  });

  it("keeps a read for the time allowed: the next ask does not go to AWS, an ask after it does, and a write updates it", async () => {
    const store = await open({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "1" });
    const name = await store.create("mcp-auth", { v: "1" });
    const reads = () => sm.calls.filter((c) => c.op === "GetSecretValue").length;
    await store.get(name); await store.get(name); await store.get(name);
    expect(reads()).toBe(0); // the create already kept it
    store.forget(name);
    await store.get(name); await store.get(name);
    expect(reads()).toBe(1);
    expect(store.stats()).toMatchObject({ reads: 1, cacheHits: 4 });
    // rotated behind our back: picked up when the time is up, not before
    sm.secrets.get(name)!.value = JSON.stringify({ v: "rotated" });
    expect((await store.get(name)).v).toBe("1");
    await new Promise((r) => setTimeout(r, 1100));
    expect((await store.get(name)).v).toBe("rotated");
    await store.put(name, { v: "ours" });
    expect((await store.get(name)).v).toBe("ours");
    expect(reads()).toBe(2);
  });

  it("with the cache off asks AWS every time", async () => {
    const store = await open({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    const name = await store.create("mcp-auth", { v: "1" });
    await store.get(name); await store.get(name);
    expect(sm.calls.filter((c) => c.op === "GetSecretValue").length).toBe(2);
  });

  it("deletes with a 7-day recovery window, forgets it at once, and does not mind a secret that is already gone", async () => {
    const store = await open();
    const name = await store.create("mcp-auth", { v: "1" });
    await store.remove(name);
    expect(sm.calls.find((c) => c.op === "DeleteSecret")!.body).toMatchObject({ SecretId: name, RecoveryWindowInDays: 7 });
    expect(sm.secrets.get(name)!.deletedAt).toBeInstanceOf(Date);
    await expect(store.get(name)).rejects.toMatchObject({ code: "unavailable" }); // marked for deletion: not served from the cache
    await expect(store.remove(name)).resolves.toBeUndefined();
    await expect(store.remove("astra/test/mcp-auth/never-existed")).resolves.toBeUndefined();
  });

  it("can delete without recovery (the start-up probe only)", async () => {
    const store = await open();
    const name = await store.create("mcp-auth", { v: "1" });
    await store.remove(name, { forceNow: true });
    expect(sm.calls.find((c) => c.op === "DeleteSecret")!.body).toMatchObject({ ForceDeleteWithoutRecovery: true });
    expect(sm.calls.find((c) => c.op === "DeleteSecret")!.body.RecoveryWindowInDays).toBeUndefined();
  });

  it("says a secret that is not there is not there", async () => {
    const store = await open();
    await expect(store.get("astra/test/mcp-auth/nope")).rejects.toMatchObject({ code: "not_found", name: "SecretStoreError" });
    await expect(store.put("astra/test/mcp-auth/nope", { a: "1" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("retries a throttled or failed call, and refuses what will not change, with a short message that holds no value", async () => {
    const store = await open({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    const name = await store.create("mcp-auth", { token: SECRET });
    sm.failNext.push({ status: 400, type: "ThrottlingException" }, { status: 500, type: "InternalServiceError" });
    expect((await store.get(name)).token).toBe(SECRET);
    sm.deny.add("GetSecretValue");
    const before = sm.calls.length;
    const err: any = await store.get(name).catch((e) => e);
    expect(err).toMatchObject({ name: "SecretStoreError", code: "unavailable" });
    expect(err.message).toMatch(/could not read a secret \(AccessDeniedException/);
    expect(err.message).not.toContain(SECRET);
    expect(sm.calls.length - before).toBe(1); // a refusal is not retried
    expect(store.stats()).toMatchObject({ failures: 1, lastError: expect.stringContaining("AccessDeniedException") });
  });

  it("gives up on a call that never answers, after the time allowed", async () => {
    const store = await open({ ASTRA_SECRETS_MANAGER_TIMEOUT_MS: "500", ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    const name = await store.create("mcp-auth", { v: "1" });
    sm.hang = true;
    const started = Date.now();
    await expect(store.get(name)).rejects.toMatchObject({ code: "unavailable" });
    expect(Date.now() - started).toBeLessThan(3000);
    sm.hang = false;
    expect((await store.get(name)).v).toBe("1");
  });

  it("a create whose answer was lost and is retried by the SDK is one secret, not two", async () => {
    const store = await open();
    sm.createThenReport.push({ status: 500, type: "InternalServiceError" });
    const name = await store.create("mcp-auth", { v: "once" });
    expect(sm.secrets.size).toBe(1);
    expect(sm.calls.filter((c) => c.op === "CreateSecret").length).toBe(2);
    expect(JSON.parse(sm.secrets.get(name)!.value)).toEqual({ v: "once" });
  });

  it("if it is told the name exists after its own create, it puts the values on that name instead of failing", async () => {
    const store = await open();
    sm.createThenReport.push({ status: 400, type: "ResourceExistsException", message: "already exists" });
    const name = await store.create("mcp-auth", { v: "late" });
    expect(sm.secrets.size).toBe(1);
    expect(sm.calls.filter((c) => c.op === "PutSecretValue").length).toBe(1);
    expect(sm.calls.find((c) => c.op === "PutSecretValue")!.body.SecretId).toBe(name);
  });

  it("refuses to send what AWS would refuse, and what is not a map of text", async () => {
    const store = await open();
    const calls = sm.calls.length;
    await expect(store.create("mcp-auth", { big: "x".repeat(60_001) })).rejects.toMatchObject({ code: "invalid" });
    expect(sm.calls.length).toBe(calls);
    const name = await store.create("mcp-auth", { v: "1" });
    for (const bad of ["not json", "[1]", '{"a":1}', "null"]) {
      sm.secrets.get(name)!.value = bad; store.forget(name);
      await expect(store.get(name), bad).rejects.toMatchObject({ code: "invalid" });
    }
  });

  it("says plainly when the AWS client library is not installed", async () => {
    storeOn();
    const m = await secretModule();
    await expect(m.openSecretStoreClient(m.readSecretStoreConfig()!, async () => { throw new Error("Cannot find module"); })).rejects.toThrow(/Secrets Manager client library \(@aws-sdk\/client-secrets-manager\) could not be loaded/);
  });
});

describe("trying the store at start-up", () => {
  it("passes when every permission works, and leaves nothing behind", async () => {
    storeOn();
    const m = await secretModule();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await m.initSecretStore();
    expect(sm.calls.map((c) => c.op)).toEqual(["CreateSecret", "GetSecretValue", "PutSecretValue", "GetSecretValue", "DeleteSecret"]);
    expect(sm.calls.at(-1)!.body.ForceDeleteWithoutRecovery).toBe(true);
    expect(sm.secrets.size).toBe(0);
  });

  it("fails, naming what failed, when a permission is missing, and cleans up the probe secret it did make", async () => {
    storeOn();
    sm.deny.add("PutSecretValue");
    const m = await secretModule();
    await expect(m.initSecretStore()).rejects.toThrow(/could not update a secret \(AccessDeniedException/);
    expect(sm.calls.at(-1)!.op).toBe("DeleteSecret");
  });

  it("does nothing, and asks nothing of AWS, when no store is configured", async () => {
    const m = await secretModule();
    await expect(m.initSecretStore()).resolves.toBeUndefined();
    expect(sm.calls.length).toBe(0);
  });

  it("a failure to load the AWS library is not remembered either: once it can be loaded the next try works", async () => {
    storeOn();
    const m = await secretModule();
    m.setSdkLoaderForTests(async () => { throw new Error("Cannot find module '@aws-sdk/client-secrets-manager'"); });
    await expect(m.getSecretStore()).rejects.toThrow(/Secrets Manager client library .* could not be loaded/);
    m.setSdkLoaderForTests(null);
    await expect(m.getSecretStore()).resolves.toMatchObject({ config: { prefix: "astra/test/" } });
  });

  it("does not remember a failure to open: the next try is a fresh one", async () => {
    storeOn();
    const m = await secretModule();
    sm.failNext.push(...Array.from({ length: 4 }, () => ({ status: 500, type: "InternalServiceError" })));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(m.initSecretStore()).rejects.toThrow();
    sm.failNext.length = 0;
    await expect(m.initSecretStore()).resolves.toBeUndefined();
  });
});

describe("a kind that this version does not move over yet", () => {
  it("is accepted in the setting, does nothing, and the start-up says so", async () => {
    storeOn({ ASTRA_SECRETS_MANAGER_KINDS: "mcp-auth,connection,oauth-app" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await (await secretModule()).initSecretStore();
    expect(log.mock.calls.some((c) => String(c[0]).includes("mcp-auth, connection, oauth-app are kept in AWS Secrets Manager") || String(c[0]).includes("kind mcp-auth, connection, oauth-app"))).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).includes("connection, oauth-app are listed in ASTRA_SECRETS_MANAGER_KINDS but not yet stored there"))).toBe(true);
  });

  it("says nothing when every listed kind is one that is moved", async () => {
    storeOn();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await (await secretModule()).initSecretStore();
    expect(warn.mock.calls.length).toBe(0);
  });
});

// ═══ The check an operator runs against the real thing ═══════════════════════

describe("scripts/check-secrets-manager.mjs", () => {
  const run = (env: Record<string, string | undefined>, args: string[] = ["--samples", "3"]) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      execFile(process.execPath, [path.join(__dirname, "..", "scripts", "check-secrets-manager.mjs"), ...args], {
        cwd: path.join(__dirname, ".."), timeout: 60_000,
        env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", AWS_ACCESS_KEY_ID: "AKIAEXAMPLE", AWS_SECRET_ACCESS_KEY: "example-secret", ...env } as any,
      }, (err: any, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: String(stdout) + String(stderr) }));
    });
  const target = () => ({ ASTRA_SECRETS_MANAGER_PREFIX: "astra/check/", AWS_REGION: sm.region, ASTRA_SECRETS_MANAGER_ENDPOINT: sm.endpoint });

  it("passes against a store that behaves as documented, uses only what Astra uses, and leaves only a secret marked for deletion", async () => {
    const r = await run(target());
    expect(r.out).toContain("ALL CHECKS PASSED");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/read latency over 3/);
    expect(r.out).not.toContain("example-secret");
    expect([...new Set(sm.calls.map((c) => c.op))].sort()).toEqual(["CreateSecret", "DeleteSecret", "GetSecretValue", "PutSecretValue"]);
    expect(sm.calls.filter((c) => c.op === "CreateSecret").length).toBe(1);
    expect(sm.calls.find((c) => c.op === "CreateSecret")!.body.Name).toMatch(/^astra\/check\/_check\//);
    expect(sm.calls.find((c) => c.op === "DeleteSecret")!.body).toMatchObject({ RecoveryWindowInDays: 7 });
    expect(sm.calls.filter((c) => c.op === "DeleteSecret").length).toBe(1);
    expect([...sm.secrets.values()].map((s) => !!s.deletedAt)).toEqual([true]);
    expect(r.out).toMatch(/marked for deletion and unreadable; AWS purges it after 7 days/);
  });

  it("says which permission is missing, and still leaves nothing readable behind", async () => {
    sm.deny.add("PutSecretValue");
    const r = await run(target());
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/FAIL {2}the role can update it \(secretsmanager:PutSecretValue\)/);
    expect(r.out).toMatch(/needs secretsmanager:PutSecretValue/);
    expect([...sm.secrets.values()].every((s) => !!s.deletedAt)).toBe(true);
    sm.deny.clear(); sm.deny.add("DeleteSecret");
    const noDelete = await run(target());
    expect(noDelete.code).toBe(1);
    expect(noDelete.out).toMatch(/FAIL {2}the role can delete with a recovery window/);
    expect(noDelete.out).toMatch(/could not delete the throwaway secret/);
    sm.deny.clear(); sm.deny.add("CreateSecret");
    const none = await run(target());
    expect(none.code).toBe(1);
    expect(none.out).toMatch(/FAIL {2}the role can create a secret/);
    expect(none.out).toMatch(/secretsmanager:CreateSecret and secretsmanager:TagResource/);
  });

  it("insists on a prefix in the right shape and a region, and asks AWS nothing otherwise", async () => {
    expect((await run({ AWS_REGION: sm.region, ASTRA_SECRETS_MANAGER_ENDPOINT: sm.endpoint })).code).toBe(2);
    expect((await run({ ...target(), ASTRA_SECRETS_MANAGER_PREFIX: "astra" })).code).toBe(2);
    const noRegion = await run({ ASTRA_SECRETS_MANAGER_PREFIX: "astra/check/", ASTRA_SECRETS_MANAGER_ENDPOINT: sm.endpoint });
    expect(noRegion.code).toBe(2);
    expect(noRegion.out).toMatch(/No region/);
    expect((await run(target(), ["--samples", "0"])).code).toBe(2);
    expect(sm.calls.length).toBe(0);
  });
});

// ═══ Seal and open ═══════════════════════════════════════════════════════════

describe("sealing and opening credentials", () => {
  it("with no store: exactly the vault blob, readable with nothing but the documented format", async () => {
    const { sealCredentialMap, openCredentialMap, parseReference } = await credentialModule();
    const blob = await sealCredentialMap({ token: SECRET }, { kind: "mcp-auth" });
    expect(JSON.parse(blob).v).toBe(1);
    expect(JSON.parse(openByHand(blob))).toEqual({ token: SECRET });
    expect(parseReference(blob)).toBeNull();
    expect(await openCredentialMap(blob)).toEqual({ token: SECRET });
    expect(sm.calls.length).toBe(0);
  });

  it("with no store: a row that already holds a vault blob is replaced by a vault blob, as ever", async () => {
    const { sealCredentialMap } = await credentialModule();
    const first = await sealCredentialMap({ a: "1" }, { kind: "connection" });
    const second = await sealCredentialMap({ a: "2" }, { kind: "connection", existing: first });
    expect(JSON.parse(openByHand(second))).toEqual({ a: "2" });
  });

  it("with a store: writes the secret there and gives back a reference that holds no value", async () => {
    storeOn();
    const { sealCredentialMap, openCredentialMap, parseReference } = await credentialModule();
    const blob = await sealCredentialMap({ token: SECRET }, { kind: "mcp-auth" });
    const ref = parseReference(blob)!;
    expect(ref).toMatchObject({ v: 2, store: "aws-sm", name: expect.stringMatching(/^astra\/test\/mcp-auth\//) });
    expect(blob).not.toContain(SECRET);
    expect(Object.keys(JSON.parse(blob))).toEqual(["v", "store", "name"]);
    expect(JSON.parse(sm.secrets.get(ref.name)!.value)).toEqual({ token: SECRET });
    expect(await openCredentialMap(blob)).toEqual({ token: SECRET });
  });

  it("with a store: a reference is updated in place, never copied, and the reference stays the same", async () => {
    storeOn();
    const { sealCredentialMap, openCredentialMap } = await credentialModule();
    const first = await sealCredentialMap({ token: "one" }, { kind: "mcp-auth" });
    const second = await sealCredentialMap({ token: "two" }, { kind: "mcp-auth", existing: first });
    expect(second).toBe(first);
    expect(sm.secrets.size).toBe(1);
    expect(await openCredentialMap(second)).toEqual({ token: "two" });
  });

  it("a kind that is not switched on stays a vault blob, and a reference of any kind is still updated in the store", async () => {
    storeOn({ ASTRA_SECRETS_MANAGER_KINDS: "mcp-auth" });
    const { sealCredentialMap, parseReference } = await credentialModule();
    const conn = await sealCredentialMap({ a: "1" }, { kind: "connection" });
    expect(parseReference(conn)).toBeNull();
    expect(JSON.parse(openByHand(conn))).toEqual({ a: "1" });
    expect(sm.calls.length).toBe(0);
    const ref = await sealCredentialMap({ a: "1" }, { kind: "mcp-auth" });
    vi.resetModules();
    storeOn({ ASTRA_SECRETS_MANAGER_KINDS: "connection" });
    const again = await (await credentialModule()).sealCredentialMap({ a: "2" }, { kind: "mcp-auth", existing: ref });
    expect(again).toBe(ref);
  });

  it("a vault blob met when the store is on stays readable, and becomes a reference the next time it is written", async () => {
    const legacy = await (await credentialModule()).sealCredentialMap({ token: "old" }, { kind: "mcp-auth" });
    vi.resetModules();
    storeOn();
    const { openCredentialMap, sealCredentialMap, parseReference } = await credentialModule();
    expect(await openCredentialMap(legacy)).toEqual({ token: "old" });
    expect(sm.calls.length).toBe(0);
    const moved = await sealCredentialMap({ token: "new" }, { kind: "mcp-auth", existing: legacy });
    expect(parseReference(moved)).not.toBeNull();
  });

  it("a reference met with no store configured is an error that says why, on read and on write, and nothing is written anywhere", async () => {
    storeOn();
    const { sealCredentialMap } = await credentialModule();
    const ref = await sealCredentialMap({ token: SECRET }, { kind: "mcp-auth" });
    vi.resetModules();
    for (const k of ENV_KEYS) if (k.startsWith("ASTRA_SECRETS")) delete process.env[k];
    const off = await credentialModule();
    await expect(off.openCredentialMap(ref)).rejects.toThrow(/kept in AWS Secrets Manager, but no secret store is configured/);
    await expect(off.sealCredentialMap({ token: "x" }, { kind: "mcp-auth", existing: ref })).rejects.toThrow(/no secret store is configured/);
    await expect(off.releaseCredentials(ref)).rejects.toThrow(/no secret store is configured/);
    expect(sm.calls.filter((c) => c.op === "CreateSecret").length).toBe(1);
  });

  it("a read that fails is an error, never an empty map or a guess", async () => {
    storeOn({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    const { sealCredentialMap, openCredentialMap } = await credentialModule();
    const ref = await sealCredentialMap({ token: SECRET }, { kind: "mcp-auth" });
    sm.deny.add("GetSecretValue");
    await expect(openCredentialMap(ref)).rejects.toThrow(/Secrets Manager could not read a secret/);
    sm.deny.clear();
    sm.secrets.clear();
    await expect(openCredentialMap(ref)).rejects.toMatchObject({ code: "not_found" });
  });

  it("releases a reference's secret with a recovery window, and a vault blob is nothing to release", async () => {
    storeOn();
    const { sealCredentialMap, releaseCredentials } = await credentialModule();
    const ref = await sealCredentialMap({ a: "1" }, { kind: "mcp-auth" });
    const vaultBlob = await (async () => { vi.resetModules(); for (const k of ENV_KEYS) if (k.startsWith("ASTRA_SECRETS")) delete process.env[k]; return (await credentialModule()).sealCredentialMap({ a: "1" }, { kind: "mcp-auth" }); })();
    await (await credentialModule()).releaseCredentials(vaultBlob);
    await releaseCredentials(null);
    await releaseCredentials("");
    expect(sm.calls.filter((c) => c.op === "DeleteSecret").length).toBe(0);
    vi.resetModules(); storeOn();
    await (await credentialModule()).releaseCredentials(ref);
    expect(sm.calls.find((c) => c.op === "DeleteSecret")!.body.RecoveryWindowInDays).toBe(7);
  });

  it("recognises a reference only when it is exactly one", async () => {
    const { parseReference, isReferenceBlob } = await credentialModule();
    expect(parseReference('{"v":2,"store":"aws-sm","name":"a/b"}')).toEqual({ v: 2, store: "aws-sm", name: "a/b" });
    for (const not of [null, undefined, "", "x", "{", "[]", "null", '{"v":1}', '{"v":2}', '{"v":2,"store":"other","name":"a"}', '{"v":2,"store":"aws-sm"}', '{"v":2,"store":"aws-sm","name":""}', '{"v":2,"store":"aws-sm","name":7}', `{"v":2,"store":"aws-sm","name":"${"x".repeat(513)}"}`, JSON.stringify({ v: 1, iv: "00", tag: "00", ciphertext: "00" })]) {
      expect(parseReference(not as any), String(not)).toBeNull();
      expect(isReferenceBlob(not as any)).toBe(false);
    }
  });

  it("round-trips awkward values: empty, unicode, quotes, a large map", async () => {
    storeOn({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0", ASTRA_SECRETS_MANAGER_KINDS: "mcp-auth,connection" });
    const { sealCredentialMap, openCredentialMap } = await credentialModule();
    const map = { empty: "", uni: "pässwörd-日本語-🔑", quote: 'a"b\\c\n', many: "x".repeat(20_000) };
    expect(await openCredentialMap(await sealCredentialMap(map, { kind: "connection" }))).toEqual(map);
  });
});

// ═══ The MCP server auth store, end to end ═══════════════════════════════════

describe("MCP server auth with a store", () => {
  const stored = () => h.tables["mcp_server_auth"] ?? [];

  it("keeps no secret in the database: config is null and the column holds a reference; the values are in the store", async () => {
    storeOn();
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: SECRET, extraHeaders: '{"x-api-key":"k"}' } } as any);
    const row = stored()[0];
    expect(row.config).toBeNull();
    expect(JSON.parse(row.configEncrypted)).toMatchObject({ v: 2, store: "aws-sm" });
    expect(JSON.stringify(h.tables)).not.toContain(SECRET);
    expect(JSON.stringify(h.tables)).not.toContain("x-api-key");
    expect(JSON.parse([...sm.secrets.values()][0].value)).toEqual({ token: SECRET, extraHeaders: '{"x-api-key":"k"}' });
  });

  it("reads it back through the store, merged as before, with every other column", async () => {
    storeOn();
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: SECRET } } as any);
    const got: any = await storage.getMcpServerAuth("srv-1");
    expect(got.config).toEqual({ token: SECRET });
    expect(got).toMatchObject({ serverId: "srv-1", authType: "bearer" });
  });

  it("an update goes to the same secret, and does not add a second one or a second row", async () => {
    storeOn();
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "one" } } as any);
    const refBefore = stored()[0].configEncrypted;
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "two" } } as any);
    expect(stored().length).toBe(1);
    expect(stored()[0].configEncrypted).toBe(refBefore);
    expect(sm.secrets.size).toBe(1);
    expect(((await storage.getMcpServerAuth("srv-1")) as any).config).toEqual({ token: "two" });
  });

  it("an unreadable reference is an error from the read, and not the empty config a failed vault read falls back to", async () => {
    storeOn({ ASTRA_SECRETS_MANAGER_CACHE_SECONDS: "0" });
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: SECRET } } as any);
    sm.deny.add("GetSecretValue");
    await expect(storage.getMcpServerAuth("srv-1")).rejects.toThrow(/Secrets Manager could not read a secret/);
    await expect(storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "x" } } as any)).rejects.toThrow();
  });

  it("with the store switched off a row that lives in it can be neither read nor rewritten, and is left exactly as it was", async () => {
    storeOn();
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: SECRET } } as any);
    const before = JSON.stringify(stored());
    vi.resetModules();
    for (const k of ENV_KEYS) if (k.startsWith("ASTRA_SECRETS")) delete process.env[k];
    const off = await loadStorage();
    await expect(off.getMcpServerAuth("srv-1")).rejects.toThrow(/no secret store is configured/);
    await expect(off.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "x" } } as any)).rejects.toThrow(/no secret store is configured/);
    expect(JSON.stringify(stored())).toBe(before);
    expect(JSON.stringify(h.tables)).not.toContain("\"ciphertext\"");
  });

  it("a row written before the store was configured is read as before, and moves to the store when it is next written", async () => {
    const storage0 = await loadStorage();
    await storage0.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "legacy" } } as any);
    const legacyBlob = stored()[0].configEncrypted;
    expect(JSON.parse(legacyBlob).v).toBe(1);
    vi.resetModules();
    storeOn();
    const storage = await loadStorage();
    expect(((await storage.getMcpServerAuth("srv-1")) as any).config).toEqual({ token: "legacy" });
    expect(sm.calls.length).toBe(0);
    expect(stored()[0].configEncrypted).toBe(legacyBlob);
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: "legacy2" } } as any);
    expect(JSON.parse(stored()[0].configEncrypted).v).toBe(2);
    expect(((await storage.getMcpServerAuth("srv-1")) as any).config).toEqual({ token: "legacy2" });
  });

  it("a kind that is not switched on stays where it was: with only connections switched on, MCP auth is still a vault blob", async () => {
    storeOn({ ASTRA_SECRETS_MANAGER_KINDS: "connection" });
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: SECRET } } as any);
    expect(JSON.parse(stored()[0].configEncrypted).v).toBe(1);
    expect(sm.calls.length).toBe(0);
  });

  it("no change for anyone who has not configured it: the same blob, the same calls, nothing asked of AWS", async () => {
    const storage = await loadStorage();
    await storage.upsertMcpServerAuth({ serverId: "srv-1", authType: "bearer", config: { token: SECRET } } as any);
    expect(JSON.parse(openByHand(stored()[0].configEncrypted))).toEqual({ token: SECRET });
    expect(((await storage.getMcpServerAuth("srv-1")) as any).config).toEqual({ token: SECRET });
    expect(sm.calls.length).toBe(0);
  });
});

// ═══ How it is wired ═════════════════════════════════════════════════════════

describe("wiring", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("the server tries the store before it takes traffic, and stops if it cannot", () => {
    const index = src("server/index.ts");
    const open = index.indexOf("await initSecretStore()");
    expect(open).toBeGreaterThan(-1);
    expect(open).toBeLessThan(index.indexOf("await registerRoutes(httpServer, app)"));
    expect(index.slice(open - 60, open + 260)).toContain("process.exit(1)");
  });

  it("a wrong setting stops the server at boot, and the start-up line says where credentials are kept", () => {
    const c = src("server/config.ts");
    expect(c).toContain("errors.push(...validateSecretStoreEnv())");
    expect(c).toContain("${describeSecretStore()}");
  });

  it("the AWS client library is loaded only when the store is used, and the vault itself knows nothing of any of this", () => {
    expect(src("server/secret-store.ts")).not.toMatch(/^import [^t].*from "@aws-sdk/m);
    expect(src("server/secret-store.ts")).toContain('import("@aws-sdk/client-secrets-manager")');
    const vault = src("server/credential-vault.ts");
    expect(vault).not.toMatch(/secret-store|credential-store|@aws-sdk|ASTRA_SECRETS/);
    expect(vault).toContain("export function encryptCredentialMap");
    expect(vault).toContain("export function decryptCredentialMap");
  });

  it("the library is a declared dependency", () => {
    expect(JSON.parse(src("package.json")).dependencies["@aws-sdk/client-secrets-manager"]).toMatch(/^\^3\./);
  });

  it("the MCP auth store goes through the new layer and nowhere else touches the vault for it", () => {
    const s = src("server/storage.ts");
    const get = s.slice(s.indexOf("async getMcpServerAuth("), s.indexOf("async getRemoteAgents("));
    expect(get).toContain("openCredentialMap");
    expect(get).toContain('sealCredentialMap(configMap, { kind: "mcp-auth", existing: existing?.configEncrypted })');
    expect(get).not.toContain("encryptCredentialMap");
  });

  it("the setup guide covers the secrets, the permissions, switching on and off, and what to expect", () => {
    const doc = src("docs/EXTERNAL_SECRET_STORE.md");
    for (const needle of ["ASTRA_SECRETS_MANAGER_PREFIX", "secretsmanager:CreateSecret", "secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:DeleteSecret", "ASTRA_SECRETS_MANAGER_KINDS", "check-secrets-manager"]) expect(doc, needle).toContain(needle);
  });
});
