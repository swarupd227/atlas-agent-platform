/**
 * The audit signer as it behaves today with a key from the environment (server/audit-signing.ts).
 *
 * This file PINS it. It was written and passed against the code before a KMS-held key was possible, so
 * nothing added since can change what an event signed with an environment key looks like, or how anyone
 * checks it: the key id, the signature (pure Ed25519 over the text of the hash, 64 bytes, base64) and what
 * the public-key endpoint says. The recipe in docs/AUDIT_LOG_EXPORT.md verifies these with nothing but the
 * public key, and has to keep doing so whichever way the key is held.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const h = vi.hoisted(() => ({ rows: [] as any[], failDb: false }));
// The signer touches the database only to look up the public key of a key it does not hold.
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => { if (h.failDb) throw new Error("db down"); return h.rows.slice(); } }) }) }),
    insert: () => ({ values: async (v: any) => { h.rows.push(v); } }),
  },
}));

const ENV_KEYS = ["AUDIT_SIGNING_PRIVATE_KEY", "SECURITY_MODE", "ASTRA_AUDIT_KMS_KEY_ID"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
beforeEach(() => { vi.resetModules(); h.rows.length = 0; h.failDb = false; for (const k of ENV_KEYS) delete process.env[k]; process.env.SECURITY_MODE = "production"; });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const newKey = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    publicKey,
  };
};
const load = () => import("../server/audit-signing");
const HASH = "a".repeat(64);

describe("a key from the environment", () => {
  it("is identified by the first 16 hex of the sha256 of its public key's PEM", async () => {
    const k = newKey();
    process.env.AUDIT_SIGNING_PRIVATE_KEY = k.pem;
    const { getPublicKeyInfo } = await load();
    const info = await getPublicKeyInfo();
    expect(info).toEqual({
      keyId: crypto.createHash("sha256").update(k.publicPem.trim()).digest("hex").slice(0, 16),
      publicKeyPem: k.publicPem,
      algorithm: "Ed25519",
      source: "env",
    });
  });

  it("may be given as PEM or as base64 of the PEM, and is the same key either way", async () => {
    const k = newKey();
    process.env.AUDIT_SIGNING_PRIVATE_KEY = k.pem;
    const a = await (await load()).getPublicKeyInfo();
    vi.resetModules();
    process.env.AUDIT_SIGNING_PRIVATE_KEY = Buffer.from(k.pem).toString("base64");
    const b = await (await load()).getPublicKeyInfo();
    expect(b).toEqual(a);
  });

  it("signs the text of the hash with pure Ed25519: 64 bytes, base64, checkable with only the public key", async () => {
    const k = newKey();
    process.env.AUDIT_SIGNING_PRIVATE_KEY = k.pem;
    const { signAuditPayload, getPublicKeyInfo } = await load();
    const { signature, signerKeyId } = await signAuditPayload(HASH);
    expect(signerKeyId).toBe((await getPublicKeyInfo()).keyId);
    const raw = Buffer.from(signature, "base64");
    expect(raw.length).toBe(64);
    expect(raw.toString("base64")).toBe(signature);
    // The external recipe: Ed25519 over the UTF-8 text of the hash, with nothing else.
    expect(crypto.verify(null, Buffer.from(HASH, "utf-8"), k.publicKey, raw)).toBe(true);
    expect(crypto.verify(null, Buffer.from(HASH.toUpperCase(), "utf-8"), k.publicKey, raw)).toBe(false);
  });

  it("signs the same text to the same signature every time", async () => {
    process.env.AUDIT_SIGNING_PRIVATE_KEY = newKey().pem;
    const { signAuditPayload } = await load();
    expect((await signAuditPayload(HASH)).signature).toBe((await signAuditPayload(HASH)).signature);
    expect((await signAuditPayload(HASH)).signature).not.toBe((await signAuditPayload("b".repeat(64))).signature);
  });

  it("is checked by the same module against the key id on the event", async () => {
    process.env.AUDIT_SIGNING_PRIVATE_KEY = newKey().pem;
    const { signAuditPayload, verifyAuditSignature } = await load();
    const { signature, signerKeyId } = await signAuditPayload(HASH);
    expect(await verifyAuditSignature(HASH, signature, signerKeyId)).toBe(true);
    expect(await verifyAuditSignature("c".repeat(64), signature, signerKeyId)).toBe(false);
    const flipped = Buffer.from(signature, "base64"); flipped[0] ^= 1;
    expect(await verifyAuditSignature(HASH, flipped.toString("base64"), signerKeyId)).toBe(false);
    for (const bad of ["", "!!!", "AAAA", null]) expect(await verifyAuditSignature(HASH, bad as any, signerKeyId), String(bad)).toBe(false);
    expect(await verifyAuditSignature(HASH, signature, null)).toBe(false);
  });

  it("does not verify an event signed by a key it has never seen, and says so rather than failing, even with the database down", async () => {
    const other = newKey();
    const sig = crypto.sign(null, Buffer.from(HASH), crypto.createPrivateKey(other.pem)).toString("base64");
    process.env.AUDIT_SIGNING_PRIVATE_KEY = newKey().pem;
    const { verifyAuditSignature } = await load();
    expect(await verifyAuditSignature(HASH, sig, "0123456789abcdef")).toBe(false);
    h.failDb = true;
    expect(await verifyAuditSignature(HASH, sig, "0123456789abcdef")).toBe(false);
  });

  it("finds the public key of a key it does not hold in crypto_keys, whatever its purpose", async () => {
    const other = newKey();
    const sig = crypto.sign(null, Buffer.from(HASH), crypto.createPrivateKey(other.pem)).toString("base64");
    process.env.AUDIT_SIGNING_PRIVATE_KEY = newKey().pem;
    h.rows.push({ keyId: "feedfeedfeedfeed", publicKeyPem: other.publicPem, purpose: "anything" });
    const { verifyAuditSignature } = await load();
    expect(await verifyAuditSignature(HASH, sig, "feedfeedfeedfeed")).toBe(true);
  });

  it("is never written to the database", async () => {
    process.env.AUDIT_SIGNING_PRIVATE_KEY = newKey().pem;
    const { signAuditPayload } = await load();
    await signAuditPayload(HASH);
    expect(h.rows).toEqual([]);
  });
});

describe("production without a key", () => {
  it("refuses to sign rather than write an unsigned chain, and says so in the same words", async () => {
    const { signAuditPayload, getSigningKey } = await load();
    await expect(getSigningKey()).rejects.toThrow("[audit-signing] FATAL: AUDIT_SIGNING_PRIVATE_KEY must be set in production — refusing to write an unsigned audit chain.");
    await expect(signAuditPayload(HASH)).rejects.toThrow(/FATAL/);
  });
});

describe("the canonical form and the chain", () => {
  it("is exactly nine keys in alphabetical order, with nulls for what is missing", async () => {
    const { buildCanonicalAuditPayload } = await load();
    const s = buildCanonicalAuditPayload({ action: "a", sequenceNum: 3, createdAt: "2026-01-01T00:00:00.000Z" });
    expect(s).toBe('{"action":"a","actorId":null,"actorType":null,"createdAt":"2026-01-01T00:00:00.000Z","details":null,"objectId":null,"objectType":null,"organizationId":null,"sequenceNum":3}');
  });

  it("chains with sha256(previousHash + canonical)", async () => {
    const { computeEventHash } = await load();
    expect(computeEventHash("PREV", "{}")).toBe(crypto.createHash("sha256").update("PREV{}").digest("hex"));
  });
});
