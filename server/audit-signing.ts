/**
 * Audit event signing — Ed25519 asymmetric signatures over the audit chain.
 *
 * Why asymmetric (not HMAC): the private key SIGNS, a public key VERIFIES.
 * An external auditor can be handed the public key to verify the whole chain
 * offline WITHOUT gaining the ability to forge it. That is the tamper-
 * RESISTANCE the plain hash chain lacked — a hash uses no secret, so anyone
 * who can write rows can recompute a valid chain; a signature cannot be
 * produced without the private key.
 *
 * Key sourcing:
 *  - PRODUCTION: AUDIT_SIGNING_PRIVATE_KEY (PEM, PKCS#8) from env / KMS. The
 *    private key never touches the database. Required — boot fails loudly
 *    without it in production so signing is never silently skipped.
 *  - DEV / DEMO: a keypair is generated once and persisted in crypto_keys so
 *    signatures survive restarts. Clearly a dev convenience, never for prod.
 *
 * keyId lets keys rotate: each event records which key signed it, and verify
 * looks up the matching public key.
 */
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, createPublicKey, createPrivateKey, type KeyObject } from "crypto";
import { getSecurityMode } from "./auth";
import { openKmsSigner, readAuditKmsConfig, type KmsStats } from "./audit-kms";

// db + schema are imported lazily (only the DEV-key path needs them) so this
// module — and its signing/verification — can run without a database, e.g. in
// unit tests that supply AUDIT_SIGNING_PRIVATE_KEY via env.
async function loadDb() {
  const [{ db }, { cryptoKeys }, { eq }] = await Promise.all([
    import("./db"), import("@shared/schema"), import("drizzle-orm"),
  ]);
  return { db, cryptoKeys, eq };
}

const PURPOSE = "audit_signing";

/**
 * Canonical serialization of the audit-relevant fields — the SINGLE source of
 * truth used by both signing and verification so they can never diverge.
 * Includes createdAt (kills backdating) and organizationId (binds tenancy).
 */
export function buildCanonicalAuditPayload(fields: {
  action: string;
  actorId?: string | null;
  actorType?: string | null;
  details?: string | null;
  objectId?: string | null;
  objectType?: string | null;
  sequenceNum: number;
  organizationId?: string | null;
  createdAt: string; // ISO 8601
}): string {
  const obj: Record<string, unknown> = {
    action: fields.action,
    actorId: fields.actorId ?? null,
    actorType: fields.actorType ?? null,
    createdAt: fields.createdAt,
    details: fields.details ?? null,
    objectId: fields.objectId ?? null,
    objectType: fields.objectType ?? null,
    organizationId: fields.organizationId ?? null,
    sequenceNum: fields.sequenceNum,
  };
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** eventHash = sha256(previousHash + canonicalPayload). Chain pointer. */
export function computeEventHash(previousHash: string, canonicalPayload: string): string {
  return createHash("sha256").update(previousHash + canonicalPayload).digest("hex");
}

/**
 * Merkle root over an ordered list of hex-encoded leaf hashes (the chain's
 * own eventHash values). An odd node at any level is paired with itself
 * (standard padding), so the root is well-defined for any non-empty input.
 * Used for periodic checkpoints: recomputing the root for just one batch's
 * leaves is enough to verify that batch, without replaying the whole chain.
 */
export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) return createHash("sha256").update("").digest("hex");
  let level = leafHashes.map(h => Buffer.from(h, "hex"));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(createHash("sha256").update(Buffer.concat([left, right])).digest());
    }
    level = next;
  }
  return level[0].toString("hex");
}

interface SigningKey {
  keyId: string;
  /** Signs the bytes with the private key, wherever it is held (this process, or KMS). */
  sign(message: Buffer): Promise<Buffer>;
  publicKeyPem: string;
  source: "env" | "generated" | "kms";
}

/** A key held in this process signs locally. */
const localSigner = (privateKey: KeyObject) => async (message: Buffer): Promise<Buffer> => edSign(null, message, privateKey);

let _cache: SigningKey | null = null;
let _pending: Promise<SigningKey> | null = null;
let _kmsStats: (() => KmsStats) | null = null;
// Public keys by keyId, for verifying events signed by rotated/env keys.
const _publicKeyCache = new Map<string, string>();

function keyIdForPublicKey(publicKeyPem: string): string {
  // Stable short id = first 16 hex of sha256(publicKeyPem). Rotating the key
  // changes the id, so old events still resolve to their original public key.
  return createHash("sha256").update(publicKeyPem.trim()).digest("hex").slice(0, 16);
}

/**
 * Resolve the active signing key. Cached for the process lifetime.
 * Idempotent: safe to call from many places during boot.
 */
export async function getSigningKey(): Promise<SigningKey> {
  if (_cache) return _cache;
  // Several callers can ask at once while the key is being opened (KMS is a network call): they share one open.
  // A failure is not remembered, so the next caller tries again.
  if (!_pending) {
    _pending = resolveSigningKey().then(
      (k) => { _cache = k; _pending = null; return k; },
      (e) => { _pending = null; throw e; },
    );
  }
  return _pending;
}

/** Remember the public half of a key we do not sign with, so events it signed stay verifiable after it is gone. */
async function rememberPublicKey(purpose: string, keyId: string, publicKeyPem: string): Promise<void> {
  try {
    const { db, cryptoKeys, eq } = await loadDb();
    const [existing] = await db.select().from(cryptoKeys).where(eq(cryptoKeys.keyId, keyId)).limit(1);
    if (!existing) await db.insert(cryptoKeys).values({ purpose, keyId, privateKeyPem: "", publicKeyPem });
  } catch (e: any) {
    console.warn(`[audit-signing] could not record the public key ${keyId} (${String(e?.message ?? e).slice(0, 120)}): events it signed stay verifiable only while this process holds it`);
  }
}

async function resolveSigningKey(): Promise<SigningKey> {
  const envKey = process.env.AUDIT_SIGNING_PRIVATE_KEY;
  const envPair = () => {
    const pem = envKey!.includes("BEGIN") ? envKey! : Buffer.from(envKey!, "base64").toString("utf-8");
    const privateKey = createPrivateKey(pem);
    const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
    return { privateKey, publicKeyPem, keyId: keyIdForPublicKey(publicKeyPem) };
  };

  // A key in KMS signs; an environment key beside it is kept only to VERIFY what it signed before the switch.
  const kmsConfig = readAuditKmsConfig();
  if (kmsConfig) {
    const signer = await openKmsSigner(kmsConfig);
    const keyId = keyIdForPublicKey(signer.publicKeyPem);
    _publicKeyCache.set(keyId, signer.publicKeyPem);
    await rememberPublicKey("audit_signing_kms", keyId, signer.publicKeyPem);
    if (envKey) {
      const legacy = envPair();
      if (legacy.keyId === keyId) throw new Error("[audit-signing] AUDIT_SIGNING_PRIVATE_KEY is the same key as the one in KMS");
      _publicKeyCache.set(legacy.keyId, legacy.publicKeyPem);
      await rememberPublicKey("audit_signing_retired", legacy.keyId, legacy.publicKeyPem);
      console.warn(`[audit-signing] AUDIT_SIGNING_PRIVATE_KEY (keyId=${legacy.keyId}) is still set. It no longer signs anything; its public key is recorded, so it can be removed.`);
    }
    _kmsStats = signer.stats;
    console.log(`[audit-signing] Signing with an Ed25519 key held in AWS KMS (keyId=${keyId}, ${signer.keyArn}).`);
    return { keyId, publicKeyPem: signer.publicKeyPem, source: "kms", sign: signer.sign };
  }

  if (envKey) {
    const { privateKey, publicKeyPem, keyId } = envPair();
    _publicKeyCache.set(keyId, publicKeyPem);
    console.log(`[audit-signing] Using AUDIT_SIGNING_PRIVATE_KEY from env (keyId=${keyId}).`);
    return { keyId, sign: localSigner(privateKey), publicKeyPem, source: "env" };
  }

  if (getSecurityMode() === "production") {
    throw new Error("[audit-signing] FATAL: AUDIT_SIGNING_PRIVATE_KEY must be set in production — refusing to write an unsigned audit chain.");
  }

  // Dev/demo: load-or-create a persisted keypair.
  const { db, cryptoKeys, eq } = await loadDb();
  const [existing] = await db.select().from(cryptoKeys).where(eq(cryptoKeys.purpose, PURPOSE)).limit(1);
  if (existing) {
    const privateKey = createPrivateKey(existing.privateKeyPem);
    _publicKeyCache.set(existing.keyId, existing.publicKeyPem);
    console.warn(`[audit-signing] DEV keypair loaded from crypto_keys (keyId=${existing.keyId}). Set AUDIT_SIGNING_PRIVATE_KEY for production.`);
    return { keyId: existing.keyId, sign: localSigner(privateKey), publicKeyPem: existing.publicKeyPem, source: "generated" };
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const keyId = keyIdForPublicKey(publicKeyPem);
  try {
    await db.insert(cryptoKeys).values({ purpose: PURPOSE, keyId, privateKeyPem, publicKeyPem });
  } catch {
    // Race: another worker inserted first — re-read.
    const [row] = await db.select().from(cryptoKeys).where(eq(cryptoKeys.purpose, PURPOSE)).limit(1);
    if (row) {
      _publicKeyCache.set(row.keyId, row.publicKeyPem);
      return { keyId: row.keyId, sign: localSigner(createPrivateKey(row.privateKeyPem)), publicKeyPem: row.publicKeyPem, source: "generated" };
    }
  }
  _publicKeyCache.set(keyId, publicKeyPem);
  console.warn(`[audit-signing] Generated a new DEV audit keypair (keyId=${keyId}). Set AUDIT_SIGNING_PRIVATE_KEY for production.`);
  return { keyId, sign: localSigner(privateKey), publicKeyPem, source: "generated" };
}

let _lastSignFailureLog = 0;
let _suppressedSignFailures = 0;

/** Sign a canonical string. Returns { signature (base64), signerKeyId }. */
export async function signAuditPayload(canonical: string): Promise<{ signature: string; signerKeyId: string }> {
  const key = await getSigningKey();
  try {
    const signature = (await key.sign(Buffer.from(canonical, "utf-8"))).toString("base64");
    return { signature, signerKeyId: key.keyId };
  } catch (e: any) {
    // The caller sees the error (the event is not written); an operator must see it too, once in a while if it repeats.
    const now = Date.now();
    if (now - _lastSignFailureLog > 10_000) {
      console.error(`[audit-signing] could not sign an audit event, so it was not written${_suppressedSignFailures ? ` (${_suppressedSignFailures} more since the last report)` : ""}: ${String(e?.message ?? e)}`);
      _lastSignFailureLog = now; _suppressedSignFailures = 0;
    } else {
      _suppressedSignFailures++;
    }
    throw e;
  }
}

/**
 * Open the signing key now, at start-up, when it is held in KMS: a key that cannot sign must stop the server
 * here, not surface as audit events that quietly fail to be written. With the key in the environment nothing
 * is done (it is read when first used, as it always was).
 */
export async function initAuditSigning(): Promise<void> {
  if (!readAuditKmsConfig()) return;
  await getSigningKey();
}

/** What the signer is, for an operator: where the key is held and, for KMS, how signing has been going. */
export async function getAuditSignerStatus(): Promise<{ source: string; keyId: string; kms: KmsStats | null }> {
  const key = await getSigningKey();
  return { source: key.source, keyId: key.keyId, kms: key.source === "kms" && _kmsStats ? _kmsStats() : null };
}

/** Forget the resolved key and what was learned about others (tests, and nothing else). */
export function resetAuditSigningForTests(): void {
  _cache = null; _pending = null; _kmsStats = null; _publicKeyCache.clear(); _lastSignFailureLog = 0; _suppressedSignFailures = 0;
}

/** Resolve a public key PEM for a keyId (active key, cache, or DB). */
async function getPublicKeyPem(signerKeyId: string): Promise<string | null> {
  const cached = _publicKeyCache.get(signerKeyId);
  if (cached) return cached;
  const active = await getSigningKey();
  if (active.keyId === signerKeyId) return active.publicKeyPem;
  // Unknown keyId: look it up in crypto_keys. Fail safe (return null →
  // verification fails) if the DB is unavailable rather than throwing.
  try {
    const { db, cryptoKeys, eq } = await loadDb();
    const [row] = await db.select().from(cryptoKeys).where(eq(cryptoKeys.keyId, signerKeyId)).limit(1);
    if (row) { _publicKeyCache.set(row.keyId, row.publicKeyPem); return row.publicKeyPem; }
  } catch {
    /* DB unavailable — treat as unverifiable. */
  }
  return null;
}

/** Verify a signature over a canonical string against the signer's public key. */
export async function verifyAuditSignature(canonical: string, signature: string | null, signerKeyId: string | null): Promise<boolean> {
  if (!signature || !signerKeyId) return false;
  const pem = await getPublicKeyPem(signerKeyId);
  if (!pem) return false;
  try {
    return edVerify(null, Buffer.from(canonical, "utf-8"), createPublicKey(pem), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/** The public key a past event names as its signer, which may be a key since replaced; null if it is not known. */
export async function getPublicKeyById(signerKeyId: string): Promise<{ keyId: string; publicKeyPem: string; algorithm: string } | null> {
  const pem = await getPublicKeyPem(signerKeyId);
  return pem ? { keyId: signerKeyId, publicKeyPem: pem, algorithm: "Ed25519" } : null;
}

/** Active public key + id, for the /public-key endpoint (external verification). */
export async function getPublicKeyInfo(): Promise<{ keyId: string; publicKeyPem: string; algorithm: string; source: string }> {
  const key = await getSigningKey();
  return { keyId: key.keyId, publicKeyPem: key.publicKeyPem, algorithm: "Ed25519", source: key.source };
}
