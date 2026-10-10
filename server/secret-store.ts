/**
 * An external secret store for connector credentials: AWS Secrets Manager.
 *
 * Off unless ASTRA_SECRETS_MANAGER_PREFIX is set. With it unset nothing here runs and credentials are
 * stored exactly as before (server/credential-vault.ts, encrypted in the database). With it set, a
 * credential set is written to Secrets Manager as one secret, and the database keeps only a reference
 * to it (server/credential-store.ts); no secret value is ever in the database for those rows.
 *
 * It fails closed. At boot the store is tried end to end (create, read, update, read, delete a throwaway
 * secret), so a missing permission stops the server instead of failing a connector call later. A read
 * that fails is an error: a reference holds no secret, so there is nothing to fall back to. Reads are
 * kept for a short time (60 s unless set) so a busy connector does not call AWS on every request, and a
 * write updates what is kept; a secret rotated outside Astra is picked up when that time is up.
 */
import crypto from "node:crypto";

export const CREDENTIAL_KINDS = ["mcp-auth", "connection", "agent-connection", "oauth-app"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];
/**
 * The kinds that are read and written through the store, all of which are switched on when a store is configured
 * unless ASTRA_SECRETS_MANAGER_KINDS narrows them (docs/EXTERNAL_SECRET_STORE.md). A kind added to CREDENTIAL_KINDS
 * before its code moves over stays out of this list, and so out of the default.
 */
export const WIRED_KINDS: readonly CredentialKind[] = ["mcp-auth", "connection", "agent-connection", "oauth-app"];

/** Secrets Manager allows 65,536 bytes; leave room for the JSON around the values. */
export const MAX_SECRET_BYTES = 60_000;
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_CACHE_SECONDS = 60;
/** How long a deleted secret can still be restored: the shortest AWS allows. */
export const DELETE_RECOVERY_DAYS = 7;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SecretStoreConfig {
  /** Every secret's name starts with this, e.g. "astra/prod/". Ends in "/". */
  prefix: string;
  region: string;
  endpoint: string | null;
  /** A customer-managed KMS key to encrypt the secrets with (default: the account's aws/secretsmanager key). */
  kmsKeyId: string | null;
  timeoutMs: number;
  cacheSeconds: number;
  /** Which kinds of credential go to the store. Others stay where they were. */
  kinds: CredentialKind[];
}

const PREFIX = /^[A-Za-z0-9][A-Za-z0-9_+=.@-]*(\/[A-Za-z0-9][A-Za-z0-9_+=.@-]*)*\/$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const KMS_KEY = /^(arn:aws[a-z-]*:kms:[a-z0-9-]+:\d{12}:(key|alias)\/[\w/+=,.@-]+|(mrk-)?[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|mrk-[0-9a-f]{32}|alias\/[\w/_-]{1,250})$/i;
const isLoopbackHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

/** Null when no store is configured; throws with a plain message when it is configured wrongly. */
export function readSecretStoreConfig(env: NodeJS.ProcessEnv = process.env): SecretStoreConfig | null {
  const prefix = env.ASTRA_SECRETS_MANAGER_PREFIX?.trim();
  if (!prefix) return null;
  if (prefix.length > 200 || !PREFIX.test(prefix)) {
    throw new Error('ASTRA_SECRETS_MANAGER_PREFIX must be a path ending in "/", such as astra/prod/ (letters, digits and _+=.@- in each part)');
  }
  const region = env.ASTRA_SECRETS_MANAGER_REGION?.trim() || env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim() || "";
  if (!region) throw new Error("the secret store needs a region: set ASTRA_SECRETS_MANAGER_REGION (or AWS_REGION)");
  if (!REGION.test(region)) throw new Error(`the Secrets Manager region "${region.slice(0, 40)}" is not an AWS region name`);

  let endpoint: string | null = null;
  const rawEndpoint = env.ASTRA_SECRETS_MANAGER_ENDPOINT?.trim();
  if (rawEndpoint) {
    let u: URL;
    try { u = new URL(rawEndpoint); } catch { throw new Error("ASTRA_SECRETS_MANAGER_ENDPOINT is not a URL"); }
    if (!(u.protocol === "https:" || (u.protocol === "http:" && isLoopbackHost(u.hostname)))) throw new Error("ASTRA_SECRETS_MANAGER_ENDPOINT must be https (http only for localhost)");
    endpoint = rawEndpoint.replace(/\/+$/, "");
  }

  const kmsKeyId = env.ASTRA_SECRETS_MANAGER_KMS_KEY_ID?.trim() || null;
  if (kmsKeyId && !KMS_KEY.test(kmsKeyId)) throw new Error("ASTRA_SECRETS_MANAGER_KMS_KEY_ID must be a KMS key id, key ARN, alias or alias ARN");

  const num = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!(n >= min && n <= max)) throw new Error(`${name} must be between ${min} and ${max}`);
    return n;
  };
  const timeoutMs = num("ASTRA_SECRETS_MANAGER_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 500, 60_000);
  const cacheSeconds = num("ASTRA_SECRETS_MANAGER_CACHE_SECONDS", DEFAULT_CACHE_SECONDS, 0, 3600);

  let kinds: CredentialKind[] = [...WIRED_KINDS];
  const rawKinds = env.ASTRA_SECRETS_MANAGER_KINDS?.trim();
  if (rawKinds) {
    const asked = rawKinds.split(",").map((k) => k.trim()).filter(Boolean);
    const unknown = asked.filter((k) => !(CREDENTIAL_KINDS as readonly string[]).includes(k));
    if (unknown.length > 0 || asked.length === 0) throw new Error(`ASTRA_SECRETS_MANAGER_KINDS must be a list of: ${CREDENTIAL_KINDS.join(", ")}`);
    kinds = Array.from(new Set(asked)) as CredentialKind[];
  }
  return { prefix, region, endpoint, kmsKeyId, timeoutMs, cacheSeconds, kinds };
}

export function validateSecretStoreEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    readSecretStoreConfig(env);
    return [];
  } catch (e: any) {
    return [`The external secret store is misconfigured: ${e.message}`];
  }
}

/** A line for the startup log. */
export function describeSecretStore(env: NodeJS.ProcessEnv = process.env): string {
  try {
    const c = readSecretStoreConfig(env);
    return c ? `secrets=aws-sm(${c.kinds.join("+")})` : "secrets=db";
  } catch {
    return "secrets=invalid";
  }
}

// ─── The store ───────────────────────────────────────────────────────────────

export class SecretStoreError extends Error {
  constructor(readonly code: "unavailable" | "not_found" | "invalid", message: string) { super(message); this.name = "SecretStoreError"; }
}

export interface SecretStoreStats { reads: number; cacheHits: number; writes: number; failures: number; lastError: string | null; lastErrorAt: string | null }

export interface SecretStore {
  readonly config: SecretStoreConfig;
  /** Create a secret holding these values; returns its name, which is what the database keeps. */
  create(kind: CredentialKind, values: Record<string, string>): Promise<string>;
  get(name: string): Promise<Record<string, string>>;
  put(name: string, values: Record<string, string>): Promise<void>;
  /** Mark a secret for deletion, restorable for DELETE_RECOVERY_DAYS. A secret that is already gone is fine. */
  remove(name: string, opts?: { forceNow?: boolean }): Promise<void>;
  stats(): SecretStoreStats;
  /** Forget what is kept (tests; and after an administrator changes a secret behind our back). */
  forget(name?: string): void;
}

type SdkModule = typeof import("@aws-sdk/client-secrets-manager");
const loadSdk = (): Promise<SdkModule> => import("@aws-sdk/client-secrets-manager");

/** What goes in a log or an error: the kind of failure, never a request, a name's value or a credential. */
function brief(e: any): string {
  const name = typeof e?.name === "string" ? e.name : "Error";
  const message = String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 160);
  return message && message !== name ? `${name}: ${message}` : name;
}

function encode(values: Record<string, string>): string {
  const text = JSON.stringify(values);
  if (Buffer.byteLength(text) > MAX_SECRET_BYTES) throw new SecretStoreError("invalid", `a credential set is at most ${MAX_SECRET_BYTES} bytes`);
  return text;
}

function decode(text: unknown): Record<string, string> {
  let parsed: unknown;
  try { parsed = typeof text === "string" ? JSON.parse(text) : null; } catch { parsed = null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed as object).some((v) => typeof v !== "string")) {
    throw new SecretStoreError("invalid", "the secret is not a map of text values");
  }
  return parsed as Record<string, string>;
}

export async function openSecretStoreClient(cfg: SecretStoreConfig, load: () => Promise<SdkModule> = loadSdk): Promise<SecretStore> {
  let sdk: SdkModule;
  try {
    sdk = await load();
  } catch (e: any) {
    throw new Error(`the AWS Secrets Manager client library (@aws-sdk/client-secrets-manager) could not be loaded: ${String(e?.message ?? e).slice(0, 200)}`);
  }
  const client = new sdk.SecretsManagerClient({ region: cfg.region, ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}), maxAttempts: 3 });
  const send = (command: any) => client.send(command, { abortSignal: AbortSignal.timeout(cfg.timeoutMs) });

  const state: SecretStoreStats = { reads: 0, cacheHits: 0, writes: 0, failures: 0, lastError: null, lastErrorAt: null };
  const cache = new Map<string, { at: number; values: Record<string, string> }>();
  const ttl = cfg.cacheSeconds * 1000;
  const fail = (what: string, e: any): never => {
    if (e instanceof SecretStoreError) throw e;
    state.failures++; state.lastError = `${what}: ${brief(e)}`; state.lastErrorAt = new Date().toISOString();
    const missing = e?.name === "ResourceNotFoundException";
    throw new SecretStoreError(missing ? "not_found" : "unavailable", missing ? `the secret does not exist in Secrets Manager (${what})` : `Secrets Manager could not ${what} (${brief(e)})`);
  };
  const remember = (name: string, values: Record<string, string>) => {
    if (ttl <= 0) return;
    if (cache.size >= 2000) cache.clear();
    cache.set(name, { at: Date.now(), values: { ...values } });
  };

  return {
    config: cfg,
    async create(kind, values) {
      const text = encode(values);
      const name = `${cfg.prefix}${kind}/${crypto.randomUUID()}`;
      try {
        await send(new sdk.CreateSecretCommand({
          Name: name, SecretString: text, ClientRequestToken: crypto.randomUUID(), ...(cfg.kmsKeyId ? { KmsKeyId: cfg.kmsKeyId } : {}),
          Description: "Astra connector credentials", Tags: [{ Key: "managed-by", Value: "astra" }, { Key: "astra-kind", Value: kind }],
        }));
      } catch (e: any) {
        // A name is a fresh random id, so one that exists is our own earlier try whose answer was lost.
        if (e?.name !== "ResourceExistsException") return fail("create a secret", e);
        try { await send(new sdk.PutSecretValueCommand({ SecretId: name, SecretString: text, ClientRequestToken: crypto.randomUUID() })); } catch (e2: any) { return fail("create a secret", e2); }
      }
      state.writes++;
      remember(name, values);
      return name;
    },
    async get(name) {
      const hit = cache.get(name);
      if (hit && Date.now() - hit.at < ttl) { state.cacheHits++; return { ...hit.values }; }
      state.reads++;
      let out: any;
      try { out = await send(new sdk.GetSecretValueCommand({ SecretId: name })); } catch (e: any) { return fail("read a secret", e); }
      const values = decode(out.SecretString);
      remember(name, values);
      return { ...values };
    },
    async put(name, values) {
      const text = encode(values);
      try { await send(new sdk.PutSecretValueCommand({ SecretId: name, SecretString: text, ClientRequestToken: crypto.randomUUID() })); } catch (e: any) { return fail("update a secret", e); }
      state.writes++;
      remember(name, values);
    },
    async remove(name, opts = {}) {
      try {
        await send(new sdk.DeleteSecretCommand({ SecretId: name, ...(opts.forceNow ? { ForceDeleteWithoutRecovery: true } : { RecoveryWindowInDays: DELETE_RECOVERY_DAYS }) }));
      } catch (e: any) {
        // Already gone, or already marked for deletion: what was asked for is true.
        if (e?.name === "ResourceNotFoundException" || (e?.name === "InvalidRequestException" && /marked for deletion/i.test(String(e?.message)))) { cache.delete(name); return; }
        return fail("delete a secret", e);
      }
      state.writes++;
      cache.delete(name);
    },
    stats: () => ({ ...state }),
    forget(name) { if (name) cache.delete(name); else cache.clear(); },
  };
}

/** Proves the store works end to end with a throwaway secret that is gone afterwards: every permission is used. */
export async function probeSecretStore(store: SecretStore): Promise<void> {
  const marker = crypto.randomBytes(8).toString("hex");
  const name = await store.create("mcp-auth", { probe: marker });
  try {
    store.forget(name);
    const read = await store.get(name);
    if (read.probe !== marker) throw new SecretStoreError("invalid", "the secret read back is not the one written");
    await store.put(name, { probe: `${marker}-2` });
    store.forget(name);
    if ((await store.get(name)).probe !== `${marker}-2`) throw new SecretStoreError("invalid", "an update was not read back");
  } finally {
    await store.remove(name, { forceNow: true }).catch(() => { /* reported by the failure above, if any */ });
  }
}

// ─── The one the server uses ─────────────────────────────────────────────────

let _store: Promise<SecretStore> | null = null;
let _storeKey: string | null = null;
let sdkLoader: () => Promise<SdkModule> = loadSdk;
/** Replace how the AWS library is loaded (tests: to make loading fail, then succeed). */
export function setSdkLoaderForTests(l: (() => Promise<SdkModule>) | null): void { sdkLoader = l ?? loadSdk; }
const ENV_KEYS = ["ASTRA_SECRETS_MANAGER_PREFIX", "ASTRA_SECRETS_MANAGER_REGION", "ASTRA_SECRETS_MANAGER_ENDPOINT", "ASTRA_SECRETS_MANAGER_KMS_KEY_ID", "ASTRA_SECRETS_MANAGER_TIMEOUT_MS", "ASTRA_SECRETS_MANAGER_CACHE_SECONDS", "ASTRA_SECRETS_MANAGER_KINDS", "AWS_REGION", "AWS_DEFAULT_REGION"];

/** The store in force, opened on first use and kept; null when none is configured. A failure to open is not kept. */
export async function getSecretStore(): Promise<SecretStore | null> {
  const cfg = readSecretStoreConfig();
  if (!cfg) return null;
  const key = ENV_KEYS.map((k) => process.env[k] ?? "").join("\u0001");
  if (!_store || _storeKey !== key) {
    _storeKey = key;
    const opening = openSecretStoreClient(cfg, sdkLoader);
    _store = opening;
    opening.catch(() => { if (_store === opening) _store = null; });
  }
  return _store;
}

/** Kinds a setting names that this version does not read or write through the store (none, until one is added to CREDENTIAL_KINDS ahead of its code). */
export function kindsNotYetWired(kinds: readonly CredentialKind[], wired: readonly CredentialKind[] = WIRED_KINDS): CredentialKind[] {
  return kinds.filter((k) => !wired.includes(k));
}

/** At start-up: open the store and try it. Does nothing when none is configured. Throws if it cannot be used. */
export async function initSecretStore(): Promise<void> {
  const store = await getSecretStore();
  if (!store) return;
  await probeSecretStore(store);
  console.log(`[secret-store] Credentials of kind ${store.config.kinds.join(", ")} are kept in AWS Secrets Manager under ${store.config.prefix} (${store.config.region}).`);
  const unwired = kindsNotYetWired(store.config.kinds);
  if (unwired.length > 0) console.warn(`[secret-store] ${unwired.join(", ")} ${unwired.length > 1 ? "are" : "is"} listed in ASTRA_SECRETS_MANAGER_KINDS but not yet stored there by this version: those credentials stay in the database.`);
}

export function resetSecretStoreForTests(): void { _store = null; _storeKey = null; sdkLoader = loadSdk; }
