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

interface SigningKey {
  keyId: string;
  privateKey: KeyObject;
  publicKeyPem: string;
  source: "env" | "generated";
}

let _cache: SigningKey | null = null;
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

  const envKey = process.env.AUDIT_SIGNING_PRIVATE_KEY;
  if (envKey) {
    const pem = envKey.includes("BEGIN") ? envKey : Buffer.from(envKey, "base64").toString("utf-8");
    const privateKey = createPrivateKey(pem);
    const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
    const keyId = keyIdForPublicKey(publicKeyPem);
    _publicKeyCache.set(keyId, publicKeyPem);
    _cache = { keyId, privateKey, publicKeyPem, source: "env" };
    console.log(`[audit-signing] Using AUDIT_SIGNING_PRIVATE_KEY from env (keyId=${keyId}).`);
    return _cache;
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
    _cache = { keyId: existing.keyId, privateKey, publicKeyPem: existing.publicKeyPem, source: "generated" };
    console.warn(`[audit-signing] DEV keypair loaded from crypto_keys (keyId=${existing.keyId}). Set AUDIT_SIGNING_PRIVATE_KEY for production.`);
    return _cache;
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
      _cache = { keyId: row.keyId, privateKey: createPrivateKey(row.privateKeyPem), publicKeyPem: row.publicKeyPem, source: "generated" };
      return _cache;
    }
  }
  _publicKeyCache.set(keyId, publicKeyPem);
  _cache = { keyId, privateKey, publicKeyPem, source: "generated" };
  console.warn(`[audit-signing] Generated a new DEV audit keypair (keyId=${keyId}). Set AUDIT_SIGNING_PRIVATE_KEY for production.`);
  return _cache;
}

/** Sign a canonical string. Returns { signature (base64), signerKeyId }. */
export async function signAuditPayload(canonical: string): Promise<{ signature: string; signerKeyId: string }> {
  const key = await getSigningKey();
  const signature = edSign(null, Buffer.from(canonical, "utf-8"), key.privateKey).toString("base64");
  return { signature, signerKeyId: key.keyId };
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

/** Active public key + id, for the /public-key endpoint (external verification). */
export async function getPublicKeyInfo(): Promise<{ keyId: string; publicKeyPem: string; algorithm: string; source: string }> {
  const key = await getSigningKey();
  return { keyId: key.keyId, publicKeyPem: key.publicKeyPem, algorithm: "Ed25519", source: key.source };
}
