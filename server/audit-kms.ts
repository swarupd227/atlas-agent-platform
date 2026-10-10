/**
 * Holding the audit signing key in AWS KMS (ECC_NIST_EDWARDS25519), so the key never exists in this process.
 *
 * Off unless ASTRA_AUDIT_KMS_KEY_ID is set; with it unset nothing here runs and the key comes from
 * AUDIT_SIGNING_PRIVATE_KEY exactly as before. A KMS key signs with ED25519_SHA_512 on the raw message, which
 * is pure Ed25519: the signature on an event is the same 64 bytes, over the same text, that an environment key
 * makes, so anyone verifying the audit log (docs/AUDIT_LOG_EXPORT.md) needs only the public key and never AWS.
 *
 * It fails closed. At boot the key is looked at (right spec, right usage, the algorithm we sign with) and a
 * random nonce is signed and verified here as Ed25519; a key that does not behave as documented stops the
 * server instead of writing events nobody can verify. Every signature is checked against the public key
 * before it is used, so a key swapped under an alias cannot slip a signature past. There is no fallback to a
 * local key: a fallback would be the thing the KMS key exists to avoid.
 */
import crypto from "node:crypto";

export const KMS_KEY_SPEC = "ECC_NIST_EDWARDS25519";
export const KMS_SIGNING_ALGORITHM = "ED25519_SHA_512";
/** KMS signs at most this many bytes of message; we sign hashes, which are far shorter. */
export const KMS_MAX_MESSAGE_BYTES = 4096;
export const DEFAULT_TIMEOUT_MS = 5000;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface AuditKmsConfig {
  /** What the operator wrote: a key id, key ARN, alias or alias ARN. */
  keyId: string;
  region: string | null;
  /** A custom endpoint (a VPC endpoint, a local stand-in). https, or http on loopback. */
  endpoint: string | null;
  timeoutMs: number;
}

const KEY_UUID = /^(mrk-)?[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$|^mrk-[0-9a-f]{32}$/i;
const KEY_ARN = /^arn:aws[a-z-]*:kms:([a-z0-9-]+):\d{12}:(key|alias)\/[\w/+=,.@-]+$/;
const ALIAS = /^alias\/[\w/_-]{1,250}$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;

const isLoopbackHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

/** Null when no KMS key is configured; throws with a plain message when it is configured wrongly. */
export function readAuditKmsConfig(env: NodeJS.ProcessEnv = process.env): AuditKmsConfig | null {
  const keyId = env.ASTRA_AUDIT_KMS_KEY_ID?.trim();
  if (!keyId) return null;
  const arn = KEY_ARN.exec(keyId);
  if (!arn && !KEY_UUID.test(keyId) && !ALIAS.test(keyId)) {
    throw new Error("ASTRA_AUDIT_KMS_KEY_ID must be a KMS key id, key ARN, alias (alias/name) or alias ARN");
  }
  const region = (env.ASTRA_AUDIT_KMS_REGION?.trim() || arn?.[1] || env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim() || "") || null;
  if (!region) throw new Error("ASTRA_AUDIT_KMS_KEY_ID needs a region: use the key's ARN, or set ASTRA_AUDIT_KMS_REGION (or AWS_REGION)");
  if (!REGION.test(region)) throw new Error(`the KMS region "${region.slice(0, 40)}" is not an AWS region name`);

  let endpoint: string | null = null;
  const rawEndpoint = env.ASTRA_AUDIT_KMS_ENDPOINT?.trim();
  if (rawEndpoint) {
    let u: URL;
    try { u = new URL(rawEndpoint); } catch { throw new Error("ASTRA_AUDIT_KMS_ENDPOINT is not a URL"); }
    if (!(u.protocol === "https:" || (u.protocol === "http:" && isLoopbackHost(u.hostname)))) throw new Error("ASTRA_AUDIT_KMS_ENDPOINT must be https (http only for localhost)");
    endpoint = rawEndpoint.replace(/\/+$/, "");
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const rawTimeout = env.ASTRA_AUDIT_KMS_TIMEOUT_MS?.trim();
  if (rawTimeout) {
    timeoutMs = /^\d+$/.test(rawTimeout) ? Number(rawTimeout) : NaN;
    if (!(timeoutMs >= 500 && timeoutMs <= 60_000)) throw new Error("ASTRA_AUDIT_KMS_TIMEOUT_MS must be between 500 and 60000");
  }
  return { keyId, region, endpoint, timeoutMs };
}

export function validateAuditKmsEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    readAuditKmsConfig(env);
    return [];
  } catch (e: any) {
    return [`The audit signing key in KMS is misconfigured: ${e.message}`];
  }
}

/** A line for the startup log. */
export function describeAuditKms(env: NodeJS.ProcessEnv = process.env): string {
  try {
    return readAuditKmsConfig(env) ? "audit-key=kms" : "audit-key=env";
  } catch {
    return "audit-key=invalid";
  }
}

// ─── The signer ──────────────────────────────────────────────────────────────

export interface KmsSigner {
  /** SPKI PEM of the public key, as Node and the verification recipe use it. */
  publicKeyPem: string;
  /** The ARN KMS resolved the configured key to: every signature is requested from exactly this key. */
  keyArn: string;
  sign(message: Buffer): Promise<Buffer>;
  stats(): KmsStats;
}

export interface KmsStats { signed: number; failed: number; lastLatencyMs: number | null; lastError: string | null; lastErrorAt: string | null }

type SdkModule = typeof import("@aws-sdk/client-kms");

const loadSdk = (): Promise<SdkModule> => import("@aws-sdk/client-kms");

/** What goes in a log or an error: the kind of failure, never a request or a credential. */
function brief(e: any): string {
  const name = typeof e?.name === "string" ? e.name : "Error";
  const message = String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 160);
  return message && message !== name ? `${name}: ${message}` : name;
}

export async function openKmsSigner(cfg: AuditKmsConfig, load: () => Promise<SdkModule> = loadSdk): Promise<KmsSigner> {
  let sdk: SdkModule;
  try {
    sdk = await load();
  } catch (e: any) {
    throw new Error(`the AWS KMS client library (@aws-sdk/client-kms) could not be loaded: ${String(e?.message ?? e).slice(0, 200)}`);
  }
  const client = new sdk.KMSClient({ region: cfg.region ?? undefined, ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}), maxAttempts: 3 });
  const send = (command: any) => client.send(command, { abortSignal: AbortSignal.timeout(cfg.timeoutMs) });

  // 1. Look at the key: it must be an Ed25519 signing key that offers the algorithm we sign with.
  let described: any;
  try {
    described = await send(new sdk.GetPublicKeyCommand({ KeyId: cfg.keyId }));
  } catch (e: any) {
    throw new Error(`cannot read the public key of the KMS key (${brief(e)}). The instance's role needs kms:GetPublicKey and kms:Sign on it`);
  }
  const spec = described.KeySpec ?? described.CustomerMasterKeySpec;
  if (spec !== KMS_KEY_SPEC) throw new Error(`the KMS key is ${String(spec)}, not ${KMS_KEY_SPEC}: the audit chain is signed with Ed25519`);
  if (described.KeyUsage !== "SIGN_VERIFY") throw new Error(`the KMS key's usage is ${String(described.KeyUsage)}, not SIGN_VERIFY`);
  if (!Array.isArray(described.SigningAlgorithms) || !described.SigningAlgorithms.includes(KMS_SIGNING_ALGORITHM)) {
    throw new Error(`the KMS key does not offer ${KMS_SIGNING_ALGORITHM}`);
  }
  const keyArn = typeof described.KeyId === "string" && described.KeyId ? described.KeyId : cfg.keyId;
  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey({ key: Buffer.from(described.PublicKey), format: "der", type: "spki" });
  } catch (e: any) {
    throw new Error(`the KMS public key is not a readable SubjectPublicKeyInfo (${brief(e)})`);
  }
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error(`the KMS public key is ${String(publicKey.asymmetricKeyType)}, not ed25519`);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  const state: KmsStats = { signed: 0, failed: 0, lastLatencyMs: null, lastError: null, lastErrorAt: null };
  let lastSlowWarn = 0;

  const sign = async (message: Buffer): Promise<Buffer> => {
    if (message.length < 1 || message.length > KMS_MAX_MESSAGE_BYTES) throw new Error(`a message to sign is 1 to ${KMS_MAX_MESSAGE_BYTES} bytes`);
    const started = Date.now();
    try {
      // The ARN KMS resolved at boot, not the alias: a signature always comes from the key whose public half we hold.
      const out: any = await send(new sdk.SignCommand({ KeyId: keyArn, Message: message, MessageType: "RAW", SigningAlgorithm: KMS_SIGNING_ALGORITHM }));
      const signature = Buffer.from(out.Signature ?? []);
      if (out.SigningAlgorithm !== undefined && out.SigningAlgorithm !== KMS_SIGNING_ALGORITHM) throw new Error(`KMS answered with ${String(out.SigningAlgorithm)}`);
      if (signature.length !== 64) throw new Error(`KMS returned a ${signature.length}-byte signature, not 64`);
      if (!crypto.verify(null, message, publicKey, signature)) throw new Error("KMS returned a signature that does not verify against the key's public key");
      state.signed++;
      state.lastLatencyMs = Date.now() - started;
      if (state.lastLatencyMs > 500 && Date.now() - lastSlowWarn > 60_000) {
        lastSlowWarn = Date.now();
        console.warn(`[audit-signing] KMS signing took ${state.lastLatencyMs} ms: every audit write waits for it`);
      }
      return signature;
    } catch (e: any) {
      state.failed++;
      state.lastError = brief(e);
      state.lastErrorAt = new Date().toISOString();
      throw new Error(`the audit signing key in KMS could not sign (${state.lastError})`);
    }
  };

  // 2. Prove it end to end before anything is signed for real: a random nonce, through KMS, checked here as Ed25519.
  try {
    await sign(Buffer.from(crypto.randomBytes(32).toString("hex")));
  } catch (e: any) {
    throw new Error(`the KMS key did not pass the signing check at start-up: ${e.message}`);
  }
  state.signed = 0;
  state.lastLatencyMs = null;

  return { publicKeyPem, keyArn, sign, stats: () => ({ ...state }) };
}
