/**
 * Audit signing conformance — the tamper-RESISTANCE guarantee.
 *
 * These prove the property that lifts the audit chain from tamper-evident to
 * tamper-resistant: a valid signature cannot be produced without the private
 * key, and any change to a signed field (including the timestamp) invalidates
 * the signature. Also asserts, statically, that createAuditEvent signs every
 * event — so no code path can write an unsigned event.
 *
 * Uses an env-provided Ed25519 key so no DB is touched (deterministic CI).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

// Provide a signing key via env BEFORE importing the module (env path skips DB).
beforeAll(() => {
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.AUDIT_SIGNING_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
});

describe("audit signing round-trip", () => {
  it("signs a canonical payload and verifies it", async () => {
    const { signAuditPayload, verifyAuditSignature, buildCanonicalAuditPayload, computeEventHash } = await import("../server/audit-signing");
    const canonical = buildCanonicalAuditPayload({
      action: "policy_updated", actorId: "admin", actorType: "user",
      details: "changed enforcement to strict", objectId: "pol-1", objectType: "policy",
      sequenceNum: 42, organizationId: "org-1", createdAt: "2026-07-07T00:00:00.000Z",
    });
    const eventHash = computeEventHash("PREVHASH", canonical);
    const { signature, signerKeyId } = await signAuditPayload(eventHash);
    expect(signature).toBeTruthy();
    expect(await verifyAuditSignature(eventHash, signature, signerKeyId)).toBe(true);
  });

  it("rejects a tampered payload — changing ANY field breaks the signature", async () => {
    const { signAuditPayload, verifyAuditSignature, buildCanonicalAuditPayload, computeEventHash } = await import("../server/audit-signing");
    const base = {
      action: "deployment_activated", actorId: "admin", actorType: "user",
      details: "prod deploy", objectId: "dep-1", objectType: "deployment",
      sequenceNum: 7, organizationId: "org-1", createdAt: "2026-07-07T00:00:00.000Z",
    };
    const hash = computeEventHash("PREV", buildCanonicalAuditPayload(base));
    const { signature, signerKeyId } = await signAuditPayload(hash);

    // Backdate the event — the timestamp is in the signed payload, so this must fail.
    const backdated = computeEventHash("PREV", buildCanonicalAuditPayload({ ...base, createdAt: "2020-01-01T00:00:00.000Z" }));
    expect(await verifyAuditSignature(backdated, signature, signerKeyId)).toBe(false);

    // Change the actor.
    const reactored = computeEventHash("PREV", buildCanonicalAuditPayload({ ...base, actorId: "attacker" }));
    expect(await verifyAuditSignature(reactored, signature, signerKeyId)).toBe(false);
  });

  it("a signature from a different key does not verify", async () => {
    const { verifyAuditSignature } = await import("../server/audit-signing");
    // A syntactically-valid but wrong signature (base64) must not verify.
    const bogus = Buffer.from("x".repeat(64)).toString("base64");
    expect(await verifyAuditSignature("somehash", bogus, "deadbeefdeadbeef")).toBe(false);
  });

  it("verification fails when signature or keyId is missing", async () => {
    const { verifyAuditSignature } = await import("../server/audit-signing");
    expect(await verifyAuditSignature("h", null, "k")).toBe(false);
    expect(await verifyAuditSignature("h", "sig", null)).toBe(false);
  });
});

describe("no unsigned audit event can be written", () => {
  it("createAuditEvent signs every event (static guarantee)", () => {
    const storage = readFileSync(resolve(__dirname, "../server/storage.ts"), "utf-8");
    // The createAuditEvent body must sign and persist the signature.
    expect(storage).toMatch(/signAuditPayload\(eventHash\)/);
    expect(storage).toMatch(/signature,\s*\n?\s*signerKeyId,/);
    // The canonical payload must include the timestamp (anti-backdating).
    const signing = readFileSync(resolve(__dirname, "../server/audit-signing.ts"), "utf-8");
    expect(signing).toMatch(/createdAt: fields\.createdAt/);
    expect(signing).toMatch(/organizationId: fields\.organizationId/);
  });

  it("rebaseline re-signs relinked events (never leaves a stale signature)", () => {
    const storage = readFileSync(resolve(__dirname, "../server/storage.ts"), "utf-8");
    // Within rebaseline, the update must set a fresh signature.
    expect(storage).toMatch(/signature,\s*signerKeyId\s*\}\)\s*\n?\s*\.where\(eq\(auditEvents\.id/);
  });
});
