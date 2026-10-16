/**
 * Amazon Bedrock settings: everything an administrator can set, none of it AWS knowledge baked into the code.
 *
 * - The settings (region, which model does which job, limits, AWS-only mode) are one JSON document in platform_settings.
 * - The optional access keys are encrypted in the same vault table as the other LLM provider keys (llm_provider_keys, provider
 *   "aws_bedrock"). Without them the server uses the AWS credentials it already runs with (the task / instance / pod role).
 * - A deployment can supply the same document in the ASTRA_BEDROCK environment variable; what an administrator saves wins,
 *   as it does for the other provider keys.
 *
 * Nothing here calls AWS: server/bedrock-client.ts does.
 */
import { z } from "zod";
import { storage } from "./storage";
import { decryptCredential, encryptCredential } from "./credential-vault";
import { getLockdown, LockdownError } from "./lockdown";

export const BEDROCK_SETTING_KEY = "bedrock_config";
export const BEDROCK_KEY_ROW = "aws_bedrock";

/** The jobs a Bedrock model can be given. `embedding` drives document search; `chat` and `fast` answer Claude calls once `useForChat` is on. */
export const BEDROCK_PURPOSES = ["embedding", "chat", "fast"] as const;
export type BedrockPurpose = (typeof BEDROCK_PURPOSES)[number];

/** How to talk to an embedding model: its request and response shapes differ by vendor, not by model id. */
export const EMBEDDING_FAMILIES = ["titan", "cohere"] as const;
export type EmbeddingFamily = (typeof EMBEDDING_FAMILIES)[number];

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{2,199}$/;
const REGION = /^[a-z]{2}(-[a-z]+){1,2}-\d{1,2}$/;

const modelRow = z.object({
  /** Pasted from the Bedrock console: a model id, or an inference profile id such as "us.anthropic...". */
  modelId: z.string().trim().regex(MODEL_ID, "Not a model id: paste it from the Bedrock console (letters, digits and . : / - _ only)"),
  /** Embedding models only. Worked out from the id when left out. */
  family: z.enum(EMBEDDING_FAMILIES).optional(),
  /** Embedding models only: the size of the vector. Titan V2 takes 256, 512 or 1024; Cohere v3 and Titan G1 are fixed. */
  dimensions: z.number().int().min(8).max(8192).optional(),
  /** Optional, for the cost figures. US dollars per 1,000 input tokens. */
  pricePer1kInputTokens: z.number().min(0).max(1000).optional(),
  pricePer1kOutputTokens: z.number().min(0).max(1000).optional(),
}).strict();
export type BedrockModelRow = z.infer<typeof modelRow>;

export const bedrockConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * When on, nothing leaves for OpenAI or for Anthropic's own API (server/ai-egress.ts): a chat request for an OpenAI model is
   * answered by the Claude model on Bedrock, and what has no Bedrock equivalent (speech, images, OpenAI's web search) is refused.
   * Needs chat on Bedrock, and document search on a Bedrock model, so there is something to answer with.
   */
  awsOnly: z.boolean().default(false),
  /** Answer Claude calls (agents, chat, evaluations) from Bedrock instead of the Anthropic API. Needs a `chat` model. */
  useForChat: z.boolean().default(false),
  /** Empty means "the region the server already runs in" (AWS_REGION). */
  region: z.string().trim().regex(REGION, "Not a region name, for example eu-central-1").or(z.literal("")).default(""),
  /** Optional private address for Bedrock (a VPC endpoint). Must be an https address under amazonaws.com. */
  endpoint: z.string().trim().default(""),
  /** "role": use the credentials the server already has. "keys": use the access keys saved on this page. */
  credentialMode: z.enum(["role", "keys"]).default("role"),
  models: z.object({
    embedding: modelRow.optional(),
    chat: modelRow.optional(),
    fast: modelRow.optional(),
  }).strict().default({}),
  limits: z.object({
    timeoutMs: z.number().int().min(1_000).max(600_000).default(60_000),
    /** Requests in flight at once, so the platform stays inside the account's Bedrock quota. */
    maxConcurrent: z.number().int().min(1).max(64).default(4),
  }).strict().default({ timeoutMs: 60_000, maxConcurrent: 4 }),
}).strict();
export type BedrockConfig = z.infer<typeof bedrockConfigSchema>;

export function defaultBedrockConfig(): BedrockConfig {
  return bedrockConfigSchema.parse({});
}

/** Starting points an administrator can pick; never applied on their own. */
export const SUGGESTED_MODELS: Array<{ purpose: BedrockPurpose; label: string; row: BedrockModelRow; note: string }> = [
  { purpose: "embedding", label: "Titan Text Embeddings V2 (1,024 dimensions)", row: { modelId: "amazon.titan-embed-text-v2:0", family: "titan", dimensions: 1024 }, note: "Recommended for document search. Also takes 512 or 256 dimensions." },
  { purpose: "embedding", label: "Titan Embeddings G1 - Text (1,536 dimensions)", row: { modelId: "amazon.titan-embed-text-v1", family: "titan" }, note: "Older. Same vector size as OpenAI's text-embedding-3-small." },
  { purpose: "embedding", label: "Cohere Embed Multilingual v3 (1,024 dimensions)", row: { modelId: "cohere.embed-multilingual-v3", family: "cohere", dimensions: 1024 }, note: "For documents in several languages." },
  { purpose: "embedding", label: "Cohere Embed English v3 (1,024 dimensions)", row: { modelId: "cohere.embed-english-v3", family: "cohere", dimensions: 1024 }, note: "English only." },
  { purpose: "chat", label: "Claude Sonnet 4.5 (US profile)", row: { modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" }, note: "Replace us. with eu. or apac. to match your region group. Copy the exact id from Bedrock, Cross-region inference." },
  { purpose: "fast", label: "Claude Haiku 4.5 (US profile)", row: { modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0" }, note: "Replace us. with eu. or apac. to match your region group." },
];

/**
 * Whether an id names a Claude model. An ARN is taken on trust: an application inference profile's id is opaque, and the Test
 * button is what proves it.
 */
export function isClaudeModelId(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.startsWith("arn:") || id.includes("anthropic.claude");
}

/** The family of an embedding model, from its id, unless the row says. */
export function embeddingFamilyOf(row: Pick<BedrockModelRow, "modelId" | "family">): EmbeddingFamily | null {
  if (row.family) return row.family;
  const id = row.modelId.toLowerCase();
  if (id.includes("titan-embed")) return "titan";
  if (id.includes("cohere.embed") || id.includes("cohere-embed")) return "cohere";
  return null;
}

// ── the endpoint ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A custom address must be an AWS one. Access keys are used to sign every request, so an address an administrator could point
 * anywhere would let a typo (or someone with this page) send signed requests to a host that is not AWS.
 */
export function validateBedrockEndpoint(endpoint: string): string | null {
  if (!endpoint) return null;
  let url: URL;
  try { url = new URL(endpoint); } catch { return "Not a web address"; }
  if (url.protocol !== "https:") return "Must start with https://";
  if (url.username || url.password) return "Must not contain a user name or password";
  if (url.port && url.port !== "443") return "Only the standard port (443) is allowed";
  if (!/\.(amazonaws\.com|amazonaws\.com\.cn|api\.aws)$/i.test(url.hostname)) return "Must be an AWS address (ending in amazonaws.com, amazonaws.com.cn or api.aws)";
  return null;
}

/** The configuration, checked as a whole: the schema, then the rules that span fields. Throws ZodError. */
export function parseBedrockConfig(raw: unknown): BedrockConfig {
  const config = bedrockConfigSchema.parse(raw);
  const problems: z.ZodIssue[] = [];
  const endpointProblem = validateBedrockEndpoint(config.endpoint);
  if (endpointProblem) problems.push({ code: "custom", path: ["endpoint"], message: endpointProblem });
  if (config.awsOnly && !config.useForChat) {
    problems.push({ code: "custom", path: ["awsOnly"], message: "AWS only needs chat switched to Bedrock first: with it on, Bedrock answers every request" });
  }
  if (config.useForChat) {
    const chat = config.models.chat;
    if (!chat) problems.push({ code: "custom", path: ["models", "chat"], message: "Choose the Claude model Bedrock should use for chat before switching chat to Bedrock" });
    else if (!isClaudeModelId(chat.modelId)) problems.push({ code: "custom", path: ["models", "chat"], message: "Chat on Bedrock works with Claude models only: the id should contain anthropic.claude, for example us.anthropic.claude-sonnet-4-5-20250929-v1:0" });
    const fast = config.models.fast;
    if (fast && !isClaudeModelId(fast.modelId)) problems.push({ code: "custom", path: ["models", "fast"], message: "The fast model for chat on Bedrock must be a Claude model too" });
  }
  const emb = config.models.embedding;
  if (emb) {
    const family = embeddingFamilyOf(emb);
    if (!family) problems.push({ code: "custom", path: ["models", "embedding", "family"], message: "Cannot tell which kind of embedding model this is: choose Titan or Cohere" });
    for (const purpose of ["chat", "fast"] as const) {
      const row = config.models[purpose];
      if (row?.family || row?.dimensions) problems.push({ code: "custom", path: ["models", purpose], message: "Vector size and model kind are for the embedding model only" });
    }
  }
  if (problems.length) throw new z.ZodError(problems);
  return config;
}

export function effectiveRegion(config: Pick<BedrockConfig, "region">): string {
  return config.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "";
}

/** Whether the platform should treat Bedrock as available: switched on, a region to talk to, and a model for at least one job. */
export function isBedrockConfigured(config: BedrockConfig): boolean {
  return config.enabled && !!effectiveRegion(config) && BEDROCK_PURPOSES.some((p) => !!config.models[p]);
}

// ── loading and saving ───────────────────────────────────────────────────────────────────────────────────────────

export type BedrockConfigSource = "admin" | "environment" | "default";
const CACHE_MS = 15_000;
let cached: { at: number; value: { config: BedrockConfig; source: BedrockConfigSource } } | null = null;
/** The settings as last read successfully (not a fallback to "off"), kept for a moment when the database cannot be reached. */
let lastGood: { config: BedrockConfig; source: BedrockConfigSource } | null = null;

export function invalidateBedrockConfig(): void { cached = null; }

function fromEnvironment(): BedrockConfig | null {
  const raw = process.env.ASTRA_BEDROCK;
  if (!raw) return null;
  try { return parseBedrockConfig(JSON.parse(raw)); }
  catch (err: any) {
    console.error(`[bedrock] ASTRA_BEDROCK is not a valid Bedrock configuration and is ignored: ${String(err?.message ?? err).slice(0, 300)}`);
    return null;
  }
}

export async function loadBedrockConfig(): Promise<{ config: BedrockConfig; source: BedrockConfigSource }> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value: { config: BedrockConfig; source: BedrockConfigSource };
  try {
    let row;
    try { row = await storage.getPlatformSetting(BEDROCK_SETTING_KEY); }
    catch (err: any) {
      // The database could not be reached just now. With chat on Bedrock, treating that as "Bedrock is off" would send the next
      // Claude calls to the Anthropic API, outside the administrator's AWS account: keep the settings last read, and look again soon.
      if (lastGood) {
        console.error(`[bedrock] settings could not be read just now, keeping the last ones read: ${String(err?.message ?? err).slice(0, 200)}`);
        cached = { at: Date.now() - CACHE_MS + 5_000, value: lastGood };
        return lastGood;
      }
      throw err;
    }
    if (row?.value) value = { config: parseBedrockConfig(JSON.parse(row.value)), source: "admin" };
    else {
      const env = fromEnvironment();
      value = env ? { config: env, source: "environment" } : { config: defaultBedrockConfig(), source: "default" };
    }
    lastGood = value;
  } catch (err: any) {
    // A stored document that no longer parses must not take the platform down, and must not silently switch Bedrock on.
    console.error(`[bedrock] stored configuration could not be read, Bedrock is treated as off: ${String(err?.message ?? err).slice(0, 300)}`);
    value = { config: defaultBedrockConfig(), source: "default" };
  }
  cached = { at: Date.now(), value };
  return value;
}

export async function saveBedrockConfig(config: BedrockConfig): Promise<void> {
  await storage.upsertPlatformSetting({
    key: BEDROCK_SETTING_KEY,
    value: JSON.stringify(config),
    category: "ai",
    description: "Amazon Bedrock settings (Model Providers page). No secrets: access keys are stored encrypted elsewhere.",
  });
  invalidateBedrockConfig();
}

/** Names of the top-level and model settings that differ, for the audit trail. Values are not recorded. */
export function changedBedrockFields(before: BedrockConfig, after: BedrockConfig): string[] {
  const out: string[] = [];
  for (const k of ["enabled", "awsOnly", "useForChat", "region", "endpoint", "credentialMode"] as const) if (before[k] !== after[k]) out.push(k);
  for (const p of BEDROCK_PURPOSES) if (JSON.stringify(before.models[p] ?? null) !== JSON.stringify(after.models[p] ?? null)) out.push(`models.${p}`);
  if (JSON.stringify(before.limits) !== JSON.stringify(after.limits)) out.push("limits");
  return out;
}

// ── access keys (optional) ───────────────────────────────────────────────────────────────────────────────────────

export const bedrockCredentialsSchema = z.object({
  accessKeyId: z.string().trim().regex(/^[A-Z0-9]{16,128}$/, "Not an access key id (it looks like AKIA… or ASIA…)"),
  secretAccessKey: z.string().trim().min(16, "Too short to be a secret access key").max(256),
  /** Only for temporary credentials. */
  sessionToken: z.string().trim().min(16).max(4096).optional(),
}).strict();
export type BedrockCredentials = z.infer<typeof bedrockCredentialsSchema>;

const keysRefused = () => getLockdown().llmKeys === "env-only";

export function maskAccessKeyId(id: string): string {
  return id.length <= 8 ? "••••" : `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export async function saveBedrockCredentials(creds: BedrockCredentials, updatedBy: string | undefined): Promise<void> {
  if (keysRefused()) throw new LockdownError("Entering AWS access keys");
  await storage.upsertLlmProviderKey({
    provider: BEDROCK_KEY_ROW,
    apiKeyBlob: encryptCredential(JSON.stringify(Object.fromEntries(Object.entries(creds).filter(([, v]) => v !== undefined)))),
    keyPreview: maskAccessKeyId(creds.accessKeyId),
    baseUrl: null,
    updatedBy: updatedBy ?? null,
  });
}

export async function clearBedrockCredentials(): Promise<void> {
  await storage.deleteLlmProviderKey(BEDROCK_KEY_ROW);
}

/** The saved keys, or null when none are saved or this deployment refuses stored keys. */
export async function loadBedrockCredentials(): Promise<BedrockCredentials | null> {
  if (keysRefused()) return null;
  const row = await storage.getLlmProviderKey(BEDROCK_KEY_ROW);
  if (!row) return null;
  try { return bedrockCredentialsSchema.parse(JSON.parse(decryptCredential(row.apiKeyBlob))); }
  catch (err: any) {
    console.error(`[bedrock] saved access keys could not be read: ${String(err?.message ?? err).slice(0, 200)}`);
    return null;
  }
}

export async function bedrockCredentialStatus(): Promise<{ configured: boolean; preview: string | null; updatedAt: string | null; updatedBy: string | null; refusedByLockdown: boolean }> {
  const refusedByLockdown = keysRefused();
  const row = refusedByLockdown ? null : await storage.getLlmProviderKey(BEDROCK_KEY_ROW);
  return { configured: !!row, preview: row?.keyPreview ?? null, updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null, updatedBy: row?.updatedBy ?? null, refusedByLockdown };
}
