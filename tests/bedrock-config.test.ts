/**
 * The Amazon Bedrock settings (server/bedrock-config.ts): what an administrator may set, how it is checked, where it is kept, and
 * that the access keys are never stored or shown in the clear.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for the two tables the settings use.
const settings = new Map<string, { key: string; value: string }>();
const keyRows = new Map<string, any>();
let dbDown = false;
vi.mock("../server/storage", () => ({
  storage: {
    getPlatformSetting: async (key: string) => { if (dbDown) throw new Error("Connection terminated unexpectedly"); return settings.get(key); },
    upsertPlatformSetting: async (s: { key: string; value: string }) => { settings.set(s.key, s); return s; },
    getLlmProviderKey: async (provider: string) => keyRows.get(provider) ?? null,
    upsertLlmProviderKey: async (d: any) => { keyRows.set(d.provider, { ...d, updatedAt: new Date() }); return keyRows.get(d.provider); },
    deleteLlmProviderKey: async (provider: string) => { keyRows.delete(provider); },
  },
}));

import {
  BEDROCK_KEY_ROW, BEDROCK_SETTING_KEY, SUGGESTED_MODELS, bedrockConfigSchema, bedrockCredentialStatus, bedrockCredentialsSchema,
  changedBedrockFields, clearBedrockCredentials, defaultBedrockConfig, effectiveRegion, embeddingFamilyOf, invalidateBedrockConfig,
  isBedrockConfigured, loadBedrockConfig, loadBedrockCredentials, maskAccessKeyId, parseBedrockConfig, saveBedrockConfig,
  saveBedrockCredentials, validateBedrockEndpoint,
} from "../server/bedrock-config";

const ENV = ["ASTRA_BEDROCK", "AWS_REGION", "AWS_DEFAULT_REGION", "ASTRA_LOCKDOWN", "ASTRA_LOCKDOWN_FILE", "INTEGRATION_VAULT_KEY"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  for (const k of ENV) delete process.env[k];
  process.env.INTEGRATION_VAULT_KEY = "test-vault-key-for-bedrock-settings";
  settings.clear(); keyRows.clear(); invalidateBedrockConfig();
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const titan = { modelId: "amazon.titan-embed-text-v2:0", dimensions: 1024 };

describe("the settings document", () => {
  it("starts switched off, with no models and sensible limits", () => {
    const c = defaultBedrockConfig();
    expect(c).toMatchObject({ enabled: false, awsOnly: false, region: "", endpoint: "", credentialMode: "role", models: {}, limits: { timeoutMs: 60_000, maxConcurrent: 4 } });
  });

  it("accepts real region names and refuses anything else", () => {
    for (const r of ["eu-central-1", "us-east-1", "ap-southeast-2", "us-gov-west-1", ""]) expect(bedrockConfigSchema.safeParse({ region: r }).success, r).toBe(true);
    for (const r of ["Europe", "us-east", "eu_central_1", "https://x"]) expect(bedrockConfigSchema.safeParse({ region: r }).success, r).toBe(false);
  });

  it("refuses unknown keys, so a typo is not silently ignored", () => {
    expect(bedrockConfigSchema.safeParse({ regoin: "eu-central-1" }).success).toBe(false);
    expect(bedrockConfigSchema.safeParse({ models: { embedding: { ...titan, modelid: "x" } } }).success).toBe(false);
  });

  it("refuses text that is not a model id", () => {
    expect(bedrockConfigSchema.safeParse({ models: { chat: { modelId: "a b" } } }).success).toBe(false);
    expect(bedrockConfigSchema.safeParse({ models: { chat: { modelId: "x" } } }).success).toBe(false);
    expect(bedrockConfigSchema.safeParse({ models: { chat: { modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" } } }).success).toBe(true);
  });

  it("keeps the limits within bounds", () => {
    expect(bedrockConfigSchema.safeParse({ limits: { timeoutMs: 10, maxConcurrent: 4 } }).success).toBe(false);
    expect(bedrockConfigSchema.safeParse({ limits: { timeoutMs: 60_000, maxConcurrent: 500 } }).success).toBe(false);
  });
});

describe("the private address", () => {
  it("must be an https address under an AWS domain, so signed requests cannot be sent elsewhere", () => {
    expect(validateBedrockEndpoint("")).toBeNull();
    expect(validateBedrockEndpoint("https://vpce-0abc.bedrock-runtime.eu-central-1.vpce.amazonaws.com")).toBeNull();
    expect(validateBedrockEndpoint("https://bedrock-runtime.cn-north-1.amazonaws.com.cn")).toBeNull();
    for (const bad of ["http://bedrock-runtime.us-east-1.amazonaws.com", "https://evil.example.com", "https://amazonaws.com.evil.example", "https://user:pw@x.amazonaws.com", "https://x.amazonaws.com:8443", "not a url"]) {
      expect(validateBedrockEndpoint(bad), bad).not.toBeNull();
    }
  });

  it("is checked when the whole document is parsed", () => {
    expect(() => parseBedrockConfig({ endpoint: "https://evil.example.com" })).toThrow(/AWS address/);
  });
});

describe("the embedding model", () => {
  it("is told apart by its id, unless the row says", () => {
    expect(embeddingFamilyOf({ modelId: "amazon.titan-embed-text-v2:0" })).toBe("titan");
    expect(embeddingFamilyOf({ modelId: "cohere.embed-multilingual-v3" })).toBe("cohere");
    expect(embeddingFamilyOf({ modelId: "vendor.something-else-v1" })).toBeNull();
    expect(embeddingFamilyOf({ modelId: "vendor.something-else-v1", family: "cohere" })).toBe("cohere");
  });

  it("must be one the platform knows how to talk to", () => {
    expect(() => parseBedrockConfig({ models: { embedding: { modelId: "vendor.something-else-v1" } } })).toThrow(/Titan or Cohere/);
    expect(() => parseBedrockConfig({ models: { embedding: { modelId: "vendor.something-else-v1", family: "titan" } } })).not.toThrow();
  });

  it("is the only job that has a vector size or a kind", () => {
    expect(() => parseBedrockConfig({ models: { embedding: titan, chat: { modelId: "us.anthropic.claude-x-v1:0", dimensions: 1024 } } })).toThrow(/embedding model only/);
  });

  it("has starting points that are themselves valid settings", () => {
    for (const s of SUGGESTED_MODELS) expect(() => parseBedrockConfig({ models: { [s.purpose]: s.row } }), s.label).not.toThrow();
  });
});

describe("whether Bedrock counts as configured", () => {
  it("needs it switched on, a region, and a model", () => {
    const base = parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { embedding: titan } });
    expect(isBedrockConfigured(base)).toBe(true);
    expect(isBedrockConfigured({ ...base, enabled: false })).toBe(false);
    expect(isBedrockConfigured({ ...base, models: {} })).toBe(false);
    expect(isBedrockConfigured({ ...base, region: "" })).toBe(false);
  });

  it("takes the region the server runs in when none is set", () => {
    const c = parseBedrockConfig({ enabled: true, models: { embedding: titan } });
    expect(isBedrockConfigured(c)).toBe(false);
    process.env.AWS_REGION = "eu-west-1";
    expect(effectiveRegion(c)).toBe("eu-west-1");
    expect(isBedrockConfigured(c)).toBe(true);
    expect(effectiveRegion({ region: "us-east-1" })).toBe("us-east-1");
  });
});

describe("loading and saving", () => {
  it("is switched off when nothing was ever saved", async () => {
    const { config, source } = await loadBedrockConfig();
    expect(source).toBe("default");
    expect(config.enabled).toBe(false);
  });

  it("round-trips what an administrator saves, and says it came from them", async () => {
    const config = parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { embedding: titan } });
    await saveBedrockConfig(config);
    expect(JSON.parse(settings.get(BEDROCK_SETTING_KEY)!.value)).toEqual(config);
    const loaded = await loadBedrockConfig();
    expect(loaded.source).toBe("admin");
    expect(loaded.config).toEqual(config);
  });

  it("takes a deployment's ASTRA_BEDROCK when nothing was saved, and lets a saved document win", async () => {
    process.env.ASTRA_BEDROCK = JSON.stringify({ enabled: true, region: "us-east-1", models: { embedding: titan } });
    expect((await loadBedrockConfig()).source).toBe("environment");
    invalidateBedrockConfig();
    await saveBedrockConfig(parseBedrockConfig({ enabled: false, region: "eu-west-1" }));
    const loaded = await loadBedrockConfig();
    expect(loaded.source).toBe("admin");
    expect(loaded.config.region).toBe("eu-west-1");
  });

  it("ignores an ASTRA_BEDROCK that is not valid, rather than failing to start", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.ASTRA_BEDROCK = "{ not json";
    const { config, source } = await loadBedrockConfig();
    expect(source).toBe("default");
    expect(config.enabled).toBe(false);
    spy.mockRestore();
  });

  it("treats a stored document that no longer parses as off, not as an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    settings.set(BEDROCK_SETTING_KEY, { key: BEDROCK_SETTING_KEY, value: JSON.stringify({ enabled: true, region: "nowhere" }) });
    const { config } = await loadBedrockConfig();
    expect(config.enabled).toBe(false);
    spy.mockRestore();
  });

  it("keeps the settings it last read when the database cannot be reached, so chat does not slip back to Anthropic's own servers", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const on = parseBedrockConfig({ enabled: true, useForChat: true, region: "eu-central-1", models: { chat: { modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" } } });
    await saveBedrockConfig(on);
    expect((await loadBedrockConfig()).config.useForChat).toBe(true);
    invalidateBedrockConfig();
    dbDown = true;
    try {
      const during = await loadBedrockConfig();
      expect(during.config).toEqual(on);
      expect(during.source).toBe("admin");
    } finally { dbDown = false; }
    spy.mockRestore();
  });

  it("names what changed, without values", () => {
    const a = parseBedrockConfig({ region: "eu-west-1", models: { embedding: titan } });
    const b = parseBedrockConfig({ region: "eu-central-1", enabled: true, models: { embedding: { ...titan, dimensions: 512 }, chat: { modelId: "us.anthropic.claude-x-v1:0" } } });
    expect(changedBedrockFields(a, b)).toEqual(["enabled", "region", "models.embedding", "models.chat"]);
    expect(changedBedrockFields(a, a)).toEqual([]);
  });
});

describe("access keys", () => {
  const good = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };

  it("must look like keys", () => {
    expect(bedrockCredentialsSchema.safeParse(good).success).toBe(true);
    expect(bedrockCredentialsSchema.safeParse({ ...good, accessKeyId: "not a key" }).success).toBe(false);
    expect(bedrockCredentialsSchema.safeParse({ ...good, secretAccessKey: "short" }).success).toBe(false);
    expect(bedrockCredentialsSchema.safeParse({ ...good, extra: 1 }).success).toBe(false);
  });

  it("are stored encrypted, shown only as a preview, and read back whole", async () => {
    await saveBedrockCredentials({ ...good, sessionToken: "x".repeat(40) }, "alice");
    const row = keyRows.get(BEDROCK_KEY_ROW);
    expect(row.apiKeyBlob).not.toContain(good.secretAccessKey);
    expect(row.apiKeyBlob).not.toContain(good.accessKeyId);
    expect(row.keyPreview).toBe(maskAccessKeyId(good.accessKeyId));
    expect(row.keyPreview).not.toContain("OSFODNN7");
    expect(row.updatedBy).toBe("alice");
    expect(await loadBedrockCredentials()).toEqual({ ...good, sessionToken: "x".repeat(40) });
    const status = await bedrockCredentialStatus();
    expect(status).toMatchObject({ configured: true, preview: "AKIA…MPLE", updatedBy: "alice", refusedByLockdown: false });
    expect(JSON.stringify(status)).not.toContain(good.secretAccessKey);
  });

  it("can be removed", async () => {
    await saveBedrockCredentials(good, "alice");
    await clearBedrockCredentials();
    expect(await loadBedrockCredentials()).toBeNull();
    expect((await bedrockCredentialStatus()).configured).toBe(false);
  });

  it("are refused, and any saved ones ignored, on a deployment that takes AI keys from its environment only", async () => {
    await saveBedrockCredentials(good, "alice");
    process.env.ASTRA_LOCKDOWN = JSON.stringify({ llmKeys: "env-only" });
    await expect(saveBedrockCredentials(good, "bob")).rejects.toThrow(/disabled by this deployment/);
    expect(await loadBedrockCredentials()).toBeNull();
    expect((await bedrockCredentialStatus()).refusedByLockdown).toBe(true);
  });

  it("give back nothing when the saved blob cannot be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    keyRows.set(BEDROCK_KEY_ROW, { provider: BEDROCK_KEY_ROW, apiKeyBlob: "garbage", keyPreview: "x" });
    expect(await loadBedrockCredentials()).toBeNull();
    spy.mockRestore();
  });
});
