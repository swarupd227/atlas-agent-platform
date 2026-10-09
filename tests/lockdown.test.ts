/**
 * Platform lockdown (server/lockdown.ts): what a deployment does not allow at all. The config has
 * to fail closed, the gates have to close what they name, and the places that do the work (the
 * agent key check, the LLM key resolver) have to refuse on their own, so a route added later in a
 * closed group is closed too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const db = vi.hoisted(() => ({
  keyRows: [] as any[],
  agentRows: [] as any[],
  selects: 0,
  vaultRow: undefined as any,
  vaultReads: 0,
  vaultList: [] as any[],
}));

// authMiddleware reads agent_api_keys and agents straight from drizzle.
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => (db.selects++ === 0 ? db.keyRows : db.agentRows) }) }),
    update: () => ({ set: () => ({ where: () => ({ catch: () => {} }) }) }),
  },
}));
vi.mock("../server/storage", () => ({
  storage: {
    getLlmProviderKey: vi.fn(async () => { db.vaultReads++; return db.vaultRow; }),
    listLlmProviderKeys: vi.fn(async () => db.vaultList),
    upsertLlmProviderKey: vi.fn(async (r: any) => r),
    deleteLlmProviderKey: vi.fn(async () => {}),
  },
}));
vi.mock("../server/credential-vault", () => ({ encryptCredential: (s: string) => `enc:${s}`, decryptCredential: (s: string) => s.replace(/^enc:/, "") }));

import {
  LockdownError, agentApiKeysAllowed, connectorAllowed, connectorKindOf, connectorsRestricted, describeLockdown, getLockdown, llmKeyEntryGate, lockdownGate,
  lockdownPublicView, parseLockdown, validateLockdownEnv,
} from "../server/lockdown";
import { authMiddleware } from "../server/auth";
import { listProviderKeyStatuses, resolveProviderKey, saveProviderKey, invalidateProviderKeyCache, clearProviderKey } from "../server/llm-provider-keys";
import { readFileSync } from "node:fs";

const KEYS = ["ASTRA_LOCKDOWN", "ASTRA_LOCKDOWN_FILE", "OPENAI_API_KEY", "AI_INTEGRATIONS_OPENAI_API_KEY", "SECURITY_MODE"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  db.keyRows = []; db.agentRows = []; db.selects = 0; db.vaultRow = undefined; db.vaultReads = 0; db.vaultList = [];
  invalidateProviderKeyCache();
});
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const lock = (cfg: unknown) => { process.env.ASTRA_LOCKDOWN = JSON.stringify(cfg); };

describe("the config", () => {
  it("restricts nothing when unset or empty", () => {
    expect(getLockdown()).toMatchObject({ active: false, marketplace: "on", apiKeys: { agent: "on", publicApi: "on" }, llmKeys: "vault-and-env" });
    process.env.ASTRA_LOCKDOWN = "   ";
    expect(getLockdown().active).toBe(false);
    process.env.ASTRA_LOCKDOWN = "{}";
    expect(getLockdown().active).toBe(false);
    expect(validateLockdownEnv()).toEqual([]);
  });

  it("reads each switch, and is active when any is set", () => {
    expect(parseLockdown('{"marketplace":"off"}')).toMatchObject({ active: true, marketplace: "off", apiKeys: { agent: "on", publicApi: "on" } });
    expect(parseLockdown('{"apiKeys":{"agent":"off"}}')).toMatchObject({ active: true, apiKeys: { agent: "off", publicApi: "on" } });
    expect(parseLockdown('{"apiKeys":{"publicApi":"off"}}')).toMatchObject({ active: true, apiKeys: { agent: "on", publicApi: "off" } });
    expect(parseLockdown('{"llmKeys":"env-only"}')).toMatchObject({ active: true, llmKeys: "env-only" });
    expect(parseLockdown('{"marketplace":"on","llmKeys":"vault-and-env"}').active).toBe(false);
  });

  it("is a fixed object: nothing can switch a surface back on", () => {
    const l = parseLockdown('{"marketplace":"off","apiKeys":{"agent":"off"}}');
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(l.apiKeys)).toBe(true);
    expect(() => { (l as any).marketplace = "on"; }).toThrow(TypeError);
    expect(() => { (l.apiKeys as any).agent = "on"; }).toThrow(TypeError);
  });

  describe("fails closed", () => {
    const bad: Array<[string, string]> = [
      ["not JSON", "{marketplace: off}"],
      ["JSON that is not an object", "[]"],
      ["null", "null"],
      ["a misspelt switch, which would otherwise mean no restriction", '{"marketplce":"off"}'],
      ["a misspelt nested switch", '{"apiKeys":{"agents":"off"}}'],
      ["a switch this version does not have", '{"nativeTools":{"imageGeneration":"off"}}'],
      ["a native tool switch that is not on or off", '{"nativeTools":{"webSearch":"maybe"}}'],
      ["a connector list that is not a list", '{"connectors":{"allow":"jira"}}'],
      ["a connector type that is not text", '{"connectors":{"allow":[7]}}'],
      ["an empty connector type", '{"connectors":{"allow":[""]}}'],
      ["a connectors key this version does not know", '{"connectors":{"allow":[],"deny":["jira"]}}'],
      ["connectors with no allow list", '{"connectors":{}}'],
      ["a value that is not on or off", '{"marketplace":"OFF"}'],
      ["a boolean where on/off is expected", '{"marketplace":false}'],
      ["a mode that does not exist", '{"llmKeys":"vault-only"}'],
      ["a nested value of the wrong type", '{"apiKeys":"off"}'],
    ];
    for (const [label, raw] of bad) {
      it(`refuses ${label}`, () => {
        expect(() => parseLockdown(raw)).toThrow();
        process.env.ASTRA_LOCKDOWN = raw;
        expect(validateLockdownEnv()).toEqual([expect.stringMatching(/^ASTRA_LOCKDOWN is invalid: /)]);
      });
    }
  });

  it("can come from a file, and a file that cannot be read stops the server", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lockdown-")), "lockdown.json");
    fs.writeFileSync(file, '{"marketplace":"off"}');
    process.env.ASTRA_LOCKDOWN_FILE = file;
    expect(getLockdown().marketplace).toBe("off");
    process.env.ASTRA_LOCKDOWN_FILE = file + ".missing";
    expect(validateLockdownEnv()[0]).toMatch(/cannot read ASTRA_LOCKDOWN_FILE/);
  });

  it("refuses to guess between the variable and the file", () => {
    process.env.ASTRA_LOCKDOWN = '{"marketplace":"off"}';
    process.env.ASTRA_LOCKDOWN_FILE = "/somewhere/else.json";
    expect(validateLockdownEnv()[0]).toMatch(/not both/);
  });

  it("follows the environment it is started with", () => {
    lock({ marketplace: "off" });
    expect(getLockdown().marketplace).toBe("off");
    delete process.env.ASTRA_LOCKDOWN;
    expect(getLockdown().marketplace).toBe("on");
  });

  it("is described for the log and for the app", () => {
    expect(describeLockdown()).toBe("lockdown=none");
    lock({ marketplace: "off", apiKeys: { agent: "off", publicApi: "off" }, llmKeys: "env-only" });
    expect(describeLockdown()).toBe("lockdown=marketplace,agent-api-keys,public-api-key,llm-keys:env-only");
    expect(lockdownPublicView()).toEqual({ active: true, marketplace: "off", apiKeys: { agent: "off", publicApi: "off" }, llmKeys: "env-only", connectors: { allow: null }, nativeTools: { webSearch: "on", codeExecution: "on", documents: "on" } });
  });
});

describe("connector types in the config", () => {
  it("allows every type unless a list is given", () => {
    expect(getLockdown().connectors.allow).toBeNull();
    expect(connectorsRestricted()).toBe(false);
    for (const kind of ["jira", "mcp", "openapi", "anything"]) expect(connectorAllowed(kind)).toBe(true);
  });

  it("allows exactly the types listed, and is then active", () => {
    lock({ connectors: { allow: ["msgraph", "mcp"] } });
    expect(getLockdown()).toMatchObject({ active: true, connectors: { allow: ["msgraph", "mcp"] } });
    expect(connectorsRestricted()).toBe(true);
    expect(connectorAllowed("msgraph")).toBe(true);
    expect(connectorAllowed("mcp")).toBe(true);
    for (const kind of ["jira", "openapi", "salesforce", "MSGRAPH", "msgraph "]) expect(connectorAllowed(kind), kind).toBe(false);
  });

  it("an empty list allows no connector at all", () => {
    lock({ connectors: { allow: [] } });
    expect(getLockdown().active).toBe(true);
    for (const kind of ["jira", "mcp", "openapi"]) expect(connectorAllowed(kind)).toBe(false);
  });

  it("drops duplicates, and the list cannot be changed afterwards", () => {
    const l = parseLockdown('{"connectors":{"allow":["jira","jira","mcp"]}}');
    expect(l.connectors.allow).toEqual(["jira", "mcp"]);
    expect(Object.isFrozen(l.connectors)).toBe(true);
    expect(Object.isFrozen(l.connectors.allow)).toBe(true);
    expect(() => (l.connectors.allow as string[]).push("salesforce")).toThrow(TypeError);
  });

  it("is described for the log and for the app", () => {
    lock({ connectors: { allow: ["jira", "mcp"] } });
    expect(describeLockdown()).toBe("lockdown=connectors:jira+mcp");
    expect(lockdownPublicView().connectors).toEqual({ allow: ["jira", "mcp"] });
    lock({ connectors: { allow: [] } });
    expect(describeLockdown()).toBe("lockdown=connectors:none");
  });

  describe("a type the registry does not know stops the server at boot", () => {
    const known = ["jira", "msgraph", "salesforce"];
    it("accepts the registry's ids and the two generic kinds", () => {
      lock({ connectors: { allow: ["jira", "msgraph", "mcp", "openapi"] } });
      expect(validateLockdownEnv(known)).toEqual([]);
    });
    it("names what it does not know, and what it does", () => {
      lock({ connectors: { allow: ["jira", "jirra", "Salesforce"] } });
      const problems = validateLockdownEnv(known);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/unknown connector type\(s\): jirra, Salesforce/);
      expect(problems[0]).toMatch(/Known: .*jira.*mcp.*openapi/);
    });
    it("does not check ids when it is not told which exist", () => {
      lock({ connectors: { allow: ["whatever"] } });
      expect(validateLockdownEnv()).toEqual([]);
    });
    it("is checked by the server's own boot code, against the registry", () => {
      const cfg = readFileSync("server/config.ts", "utf8");
      expect(cfg).toContain("validateLockdownEnv(INTEGRATION_REGISTRY.map((def) => def.id))");
    });
  });

  describe("what kind of connector a row is", () => {
    it("is the integration it is, when it has one", () => {
      expect(connectorKindOf({ integrationId: "jira", transportType: "streamable-http" })).toBe("jira");
      expect(connectorKindOf({ integrationId: "msgraph", transportType: "rest-proxy" })).toBe("msgraph");
    });
    it("is openapi for an imported REST API, and mcp for every other transport", () => {
      expect(connectorKindOf({ transportType: "rest-proxy" })).toBe("openapi");
      expect(connectorKindOf({ transportType: "REST-PROXY" })).toBe("openapi");
      for (const t of ["streamable-http", "sse", "http", "enterprise", "stdio", "", null, undefined]) expect(connectorKindOf({ transportType: t as any }), String(t)).toBe("mcp");
      expect(connectorKindOf({})).toBe("mcp");
    });
  });
});

describe("the gates", () => {
  const run = (mw: any, req: any = {}) => {
    const res: any = { code: 200, body: undefined };
    res.status = (c: number) => { res.code = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    const next = vi.fn();
    mw(req, res, next);
    return { res, next };
  };

  it("lets everything through when nothing is closed", () => {
    for (const s of ["marketplace", "agentApiKeys", "publicApi"] as const) expect(run(lockdownGate(s)).next).toHaveBeenCalledTimes(1);
  });

  it("closes only the surface it names, with a 403 that says why", () => {
    lock({ marketplace: "off" });
    const closed = run(lockdownGate("marketplace"));
    expect(closed.next).not.toHaveBeenCalled();
    expect(closed.res).toMatchObject({ code: 403, body: { reason: "platform_lockdown", surface: "The connector marketplace" } });
    expect(closed.res.body.message).toContain("platform policy");
    expect(run(lockdownGate("agentApiKeys")).next).toHaveBeenCalledTimes(1);
    expect(run(lockdownGate("publicApi")).next).toHaveBeenCalledTimes(1);
  });

  it("closes agent keys and the public API independently", () => {
    lock({ apiKeys: { agent: "off" } });
    expect(run(lockdownGate("agentApiKeys")).res.code).toBe(403);
    expect(run(lockdownGate("publicApi")).next).toHaveBeenCalledTimes(1);
    lock({ apiKeys: { publicApi: "off" } });
    expect(run(lockdownGate("publicApi")).res.code).toBe(403);
    expect(run(lockdownGate("agentApiKeys")).next).toHaveBeenCalledTimes(1);
  });

  it("refuses entering an LLM key, but not listing, testing or clearing one", () => {
    lock({ llmKeys: "env-only" });
    expect(run(llmKeyEntryGate, { method: "POST", path: "/openai" }).res.code).toBe(403);
    expect(run(llmKeyEntryGate, { method: "POST", path: "/openai/" }).res.code).toBe(403);
    expect(run(llmKeyEntryGate, { method: "POST", path: "/openai/test" }).next).toHaveBeenCalledTimes(1);
    expect(run(llmKeyEntryGate, { method: "GET", path: "/" }).next).toHaveBeenCalledTimes(1);
    expect(run(llmKeyEntryGate, { method: "DELETE", path: "/openai" }).next).toHaveBeenCalledTimes(1);
  });

  it("does nothing to LLM key entry when keys may be entered", () => {
    expect(run(llmKeyEntryGate, { method: "POST", path: "/openai" }).next).toHaveBeenCalledTimes(1);
  });
});

describe("agent API keys, at the place that checks them", () => {
  const bearerReq = (p = "/gateway/v1/invoke/ag-1") => ({ path: p, headers: { authorization: "Bearer secret-key" }, cookies: {}, socket: {} }) as any;
  const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
  const withKey = () => {
    db.keyRows = [{ id: "k1", name: "ci", agentId: "ag-1", scopes: ["invoke"], expiresAt: null }];
    db.agentRows = [{ organizationId: "org-a" }];
  };

  it("authenticates a valid agent key by default", async () => {
    withKey();
    const req = bearerReq(); const next = vi.fn();
    await authMiddleware(req, res(), next);
    expect(next).toHaveBeenCalled();
    expect(req.authUser).toMatchObject({ role: "api", organizationId: "org-a", apiKeyAgentId: "ag-1" });
  });

  for (const p of ["/gateway/v1/invoke/ag-1", "/eval/run", "/integrations/jira/mcp"]) {
    it(`accepts none when agent keys are off: ${p} is refused like a request with no session, and the database is not asked`, async () => {
      withKey();
      lock({ apiKeys: { agent: "off" } });
      const r = res(); const next = vi.fn();
      await authMiddleware(bearerReq(p), r, next);
      expect(next).not.toHaveBeenCalled();
      expect(r.code).toBe(401);
      expect(db.selects).toBe(0);
    });
  }

  it("is a single question the rest of the app asks", () => {
    expect(agentApiKeysAllowed()).toBe(true);
    lock({ apiKeys: { agent: "off" } });
    expect(agentApiKeysAllowed()).toBe(false);
    lock({ apiKeys: { publicApi: "off" } });
    expect(agentApiKeysAllowed()).toBe(true);
  });

  it("the key lookup and creation refuse at the storage layer too", () => {
    const src = readFileSync("server/storage.ts", "utf8").replace(/\r\n/g, "\n");
    const lookup = src.slice(src.indexOf("async getAgentApiKeyByHash"), src.indexOf("async createAgentApiKey"));
    expect(lookup.indexOf("if (!agentApiKeysAllowed()) return undefined;")).toBeGreaterThan(-1);
    expect(lookup.indexOf("agentApiKeysAllowed")).toBeLessThan(lookup.indexOf("db.select()"));
    const create = src.slice(src.indexOf("async createAgentApiKey"), src.indexOf("async updateAgentApiKey"));
    expect(create).toContain('throw new LockdownError("Agent API keys")');
    expect(create.indexOf("LockdownError")).toBeLessThan(create.indexOf("db.insert"));
  });
});

describe("LLM keys, at the resolver", () => {
  beforeEach(() => { process.env.OPENAI_API_KEY = "sk-from-env"; db.vaultRow = { apiKeyBlob: "enc:sk-from-vault", baseUrl: null }; });

  it("prefers a stored key by default", async () => {
    expect(await resolveProviderKey("openai")).toMatchObject({ apiKey: "sk-from-vault", source: "vault" });
  });

  it("env-only: uses the environment and never reads the vault, even when a key is stored", async () => {
    lock({ llmKeys: "env-only" });
    expect(await resolveProviderKey("openai")).toMatchObject({ apiKey: "sk-from-env", source: "env" });
    expect(db.vaultReads).toBe(0);
  });

  it("env-only: no environment key means no key, not the stored one", async () => {
    lock({ llmKeys: "env-only" });
    delete process.env.OPENAI_API_KEY;
    expect(await resolveProviderKey("openai")).toMatchObject({ apiKey: undefined, source: "none" });
  });

  it("env-only: entering a key is refused, and nothing is stored", async () => {
    lock({ llmKeys: "env-only" });
    await expect(saveProviderKey("openai", "sk-new", undefined, "admin")).rejects.toThrow(LockdownError);
    const { storage } = await import("../server/storage");
    expect(storage.upsertLlmProviderKey).not.toHaveBeenCalled();
  });

  it("env-only: clearing a stored key is still allowed", async () => {
    lock({ llmKeys: "env-only" });
    await expect(clearProviderKey("openai")).resolves.toBeUndefined();
  });

  it("env-only: a stored key is not reported as the one in use", async () => {
    db.vaultList = [{ provider: "openai", keyPreview: "sk-fro...ault", updatedAt: new Date(), updatedBy: "admin" }];
    expect((await listProviderKeyStatuses()).find((s) => s.provider === "openai")).toMatchObject({ source: "vault" });
    lock({ llmKeys: "env-only" });
    expect((await listProviderKeyStatuses()).find((s) => s.provider === "openai")).toMatchObject({ source: "env", configured: true });
  });
});

describe("where the lockdown is applied", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

  it("each route group is closed by one mount, ahead of the routers that serve it", () => {
    const src = read("server/routes.ts");
    const mounts = [
      'app.use("/api/marketplace", lockdownGate("marketplace"));',
      'app.use("/api/v1", lockdownGate("publicApi"));',
      'app.use("/api/gateway", lockdownGate("agentApiKeys"));',
      'app.use("/api/a2a", lockdownGate("agentApiKeys"));',
      'app.use("/api/agents/:agentId/api-keys", lockdownGate("agentApiKeys"));',
      'app.use("/api/admin/llm-provider-keys", llmKeyEntryGate);',
    ];
    const publicApiMount = src.indexOf("app.use(publicApiRouter);");
    for (const m of mounts) {
      expect(src, m).toContain(m);
      expect(src.indexOf(m), m).toBeLessThan(publicApiMount);
    }
    expect(src).toContain('app.get("/api/platform/lockdown", (_req, res) => res.json(lockdownPublicView()));');
  });

  it("the marketplace is not seeded when it is closed, and a lockdown is recorded at every start", () => {
    const src = read("server/routes.ts");
    expect(src).toContain('if (getLockdown().marketplace !== "off") {');
    expect(src.indexOf('getLockdown().marketplace !== "off"')).toBeLessThan(src.indexOf("await ensureMarketplaceSeedData()"));
    expect(src).toContain('action: "platform_lockdown_active"');
    expect(src).toContain("if (getLockdown().active) {");
  });

  it("the public API refuses on its own too, before it looks at any key", () => {
    const src = read("server/routes/public-api.ts");
    const fn = src.slice(src.indexOf("async function requireApiKey"));
    expect(fn.indexOf('getLockdown().apiKeys.publicApi === "off"')).toBeGreaterThan(-1);
    expect(fn.indexOf('getLockdown().apiKeys.publicApi === "off"')).toBeLessThan(fn.indexOf("extractKey(req)"));
  });

  it("an unreadable lockdown stops the server at boot, and the app says what is closed", () => {
    const src = read("server/config.ts");
    expect(src).toContain("errors.push(...validateLockdownEnv(INTEGRATION_REGISTRY.map((def) => def.id)));");
    expect(src.indexOf("validateLockdownEnv(")).toBeLessThan(src.indexOf("if (errors.length > 0)"));
    expect(src).toContain("describeLockdown()");
  });
});
