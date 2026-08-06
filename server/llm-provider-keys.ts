import { storage } from "./storage";
import { encryptCredential, decryptCredential } from "./credential-vault";

// Central place for "where does this provider's API key actually come from"
// -- an Admin-set key in the encrypted vault (llm_provider_keys table) takes
// priority over the env var, so rotating a key from Admin doesn't require a
// redeploy/restart. Short in-memory TTL cache keeps the common case (every
// LLM call) from hitting the DB, while a save/clear always invalidates
// immediately so the new key is live on the very next call.

export type LlmProviderName = "openai" | "anthropic" | "google" | "azure_openai" | "self_hosted";

const ENV_VARS: Record<LlmProviderName, { key: string[]; baseUrl?: string }> = {
  openai: { key: ["AI_INTEGRATIONS_OPENAI_API_KEY", "OPENAI_API_KEY"], baseUrl: "AI_INTEGRATIONS_OPENAI_BASE_URL" },
  anthropic: { key: ["AI_INTEGRATIONS_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"], baseUrl: "AI_INTEGRATIONS_ANTHROPIC_BASE_URL" },
  google: { key: ["GOOGLE_AI_API_KEY"] },
  azure_openai: { key: ["AZURE_OPENAI_API_KEY"] },
  self_hosted: { key: ["SELF_HOSTED_LLM_URL"] },
};

function envKey(provider: LlmProviderName): string | undefined {
  for (const name of ENV_VARS[provider].key) {
    const v = process.env[name];
    if (v) return v;
  }
  return undefined;
}

function envBaseUrl(provider: LlmProviderName): string | undefined {
  const varName = ENV_VARS[provider].baseUrl;
  return varName ? process.env[varName] : undefined;
}

export function maskKeyPreview(rawKey: string): string {
  if (rawKey.length <= 8) return "••••";
  return `${rawKey.slice(0, 6)}...${rawKey.slice(-4)}`;
}

interface ResolvedKey {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  source: "vault" | "env" | "none";
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<LlmProviderName, { value: ResolvedKey; expiresAt: number }>();

/** Drops the cached value for one provider (or all) so the next resolve() re-reads the vault. */
export function invalidateProviderKeyCache(provider?: LlmProviderName): void {
  if (provider) cache.delete(provider);
  else cache.clear();
}

export async function resolveProviderKey(provider: LlmProviderName): Promise<ResolvedKey> {
  const cached = cache.get(provider);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let resolved: ResolvedKey;
  try {
    const row = await storage.getLlmProviderKey(provider);
    if (row) {
      resolved = { apiKey: decryptCredential(row.apiKeyBlob), baseUrl: row.baseUrl ?? envBaseUrl(provider), source: "vault" };
    } else {
      const envValue = envKey(provider);
      resolved = envValue
        ? { apiKey: envValue, baseUrl: envBaseUrl(provider), source: "env" }
        : { apiKey: undefined, baseUrl: undefined, source: "none" };
    }
  } catch (err: any) {
    console.error(`[llm-provider-keys] vault lookup failed for "${provider}", falling back to env: ${err.message}`);
    const envValue = envKey(provider);
    resolved = envValue
      ? { apiKey: envValue, baseUrl: envBaseUrl(provider), source: "env" }
      : { apiKey: undefined, baseUrl: undefined, source: "none" };
  }

  cache.set(provider, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved;
}

export async function saveProviderKey(provider: LlmProviderName, apiKey: string, baseUrl: string | undefined, updatedBy: string | undefined) {
  const row = await storage.upsertLlmProviderKey({
    provider,
    apiKeyBlob: encryptCredential(apiKey),
    keyPreview: maskKeyPreview(apiKey),
    baseUrl: baseUrl || null,
    updatedBy: updatedBy || null,
  });
  invalidateProviderKeyCache(provider);
  return row;
}

export async function clearProviderKey(provider: LlmProviderName) {
  await storage.deleteLlmProviderKey(provider);
  invalidateProviderKeyCache(provider);
}

export interface ProviderKeyStatus {
  provider: LlmProviderName;
  configured: boolean;
  source: "vault" | "env" | "none";
  keyPreview: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function listProviderKeyStatuses(): Promise<ProviderKeyStatus[]> {
  const rows = await storage.listLlmProviderKeys();
  const byProvider = new Map(rows.map((r) => [r.provider as LlmProviderName, r]));
  return (Object.keys(ENV_VARS) as LlmProviderName[]).map((provider) => {
    const row = byProvider.get(provider);
    if (row) {
      return {
        provider,
        configured: true,
        source: "vault",
        keyPreview: row.keyPreview,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
        updatedBy: row.updatedBy,
      };
    }
    const envValue = envKey(provider);
    return {
      provider,
      configured: !!envValue,
      source: envValue ? "env" : "none",
      keyPreview: envValue ? maskKeyPreview(envValue) : null,
      updatedAt: null,
      updatedBy: null,
    };
  });
}
