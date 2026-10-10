/**
 * Simultaneous saves of one MCP server's credentials with an external secret store switched on
 * (tests/mcp-auth-concurrency.test.ts covers the same without one).
 *
 * Before saves were serialized per server, ten at once left ten rows, and with the store on each of those
 * created its own secret, nine of which nothing referred to afterwards (each costs money and holds a
 * credential). With the lock there is one row and one secret.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetState, rowsOf } from "./support/concurrent-db";
import { startMockSecretsManager, type MockSecretsManager } from "./support/mock-secrets-manager";

vi.mock("../server/db", async () => {
  const { makeDb } = await import("./support/concurrent-db");
  return { pool: {}, db: makeDb() };
});

const ENV_KEYS = [
  "INTEGRATION_VAULT_KEY", "ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT",
  "ASTRA_SECRETS_MANAGER_CACHE_SECONDS", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

let sm: MockSecretsManager;
beforeEach(async () => {
  vi.resetModules();
  resetState();
  for (const k of ENV_KEYS) delete process.env[k];
  sm = await startMockSecretsManager();
  process.env.INTEGRATION_VAULT_KEY = "store-concurrency-test-vault-key";
  process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE"; process.env.AWS_SECRET_ACCESS_KEY = "example-secret";
  process.env.ASTRA_SECRETS_MANAGER_PREFIX = "astra/test/"; process.env.ASTRA_SECRETS_MANAGER_REGION = sm.region;
  process.env.ASTRA_SECRETS_MANAGER_ENDPOINT = sm.endpoint; process.env.ASTRA_SECRETS_MANAGER_CACHE_SECONDS = "60";
});
afterEach(async () => {
  await sm.close();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const loadStorage = async () => (await import("../server/storage")).storage;
const save = (storage: any, serverId: string, token: string) => storage.upsertMcpServerAuth({ serverId, authType: "bearer", config: { token } });

describe("simultaneous saves with the secret store on", () => {
  it("ten first saves of one server make one row and one secret, not ten of each with nine left behind", async () => {
    const storage = await loadStorage();
    await Promise.all(Array.from({ length: 10 }, (_, i) => save(storage, "srv-race", `S-${i}`)));
    expect(rowsOf("mcp_server_auth").length).toBe(1);
    expect(sm.secrets.size).toBe(1);
    expect(((await storage.getMcpServerAuth("srv-race")) as any).config.token).toMatch(/^S-\d$/);
  });

  it("ten later saves update that one secret and add none", async () => {
    const storage = await loadStorage();
    await save(storage, "srv-race", "first");
    await Promise.all(Array.from({ length: 10 }, (_, i) => save(storage, "srv-race", `Z-${i}`)));
    expect(sm.secrets.size).toBe(1);
    expect(rowsOf("mcp_server_auth").length).toBe(1);
  });

  it("different servers each get their own secret, saved at the same time", async () => {
    const storage = await loadStorage();
    await Promise.all(Array.from({ length: 8 }, (_, i) => save(storage, `srv-${i}`, `V-${i}`)));
    expect(rowsOf("mcp_server_auth").length).toBe(8);
    expect(sm.secrets.size).toBe(8);
  });
});
