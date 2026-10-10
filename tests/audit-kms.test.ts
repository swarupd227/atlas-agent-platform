/**
 * An audit signing key held in AWS KMS (server/audit-kms.ts, server/audit-signing.ts).
 *
 * The real AWS SDK client talks real HTTP to a stand-in KMS (tests/support/mock-kms.ts) that speaks the
 * KMS wire protocol and enforces the documented rules for ECC_NIST_EDWARDS25519 keys. What this proves:
 * a signature made through KMS is the same pure Ed25519 over the same text that an environment key makes, so
 * the verification recipe is unchanged; a key that is wrong in any way, or that stops behaving, stops the
 * server or the write instead of producing events nobody can verify; and nothing ever falls back to a local
 * key. What it cannot prove is that AWS behaves as documented: the start-up check and scripts/check-audit-kms.mjs
 * do that against the real thing. (tests/audit-signing-pins.test.ts pins the environment-key path, written
 * before this existed.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { startMockKms, type MockKms } from "./support/mock-kms";

const h = vi.hoisted(() => ({ rows: [] as any[], failDb: false }));

/** The values bound into a drizzle condition, e.g. the key id in eq(cryptoKeys.keyId, id). */
function paramsOf(node: any, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  if (node.constructor?.name === "Param") out.push(node.value);
  if (Array.isArray(node)) node.forEach((n) => paramsOf(n, out));
  else if (Array.isArray(node.queryChunks)) node.queryChunks.forEach((n: any) => paramsOf(n, out));
  return out;
}
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (cond: any) => ({ limit: async () => {
      if (h.failDb) throw new Error("db down");
      const vals = paramsOf(cond);
      return h.rows.filter((r) => vals.includes(r.keyId) || vals.includes(r.purpose));
    } }) }) }),
    insert: () => ({ values: async (v: any) => { if (h.failDb) throw new Error("db down"); h.rows.push(v); } }),
  },
}));

const ENV_KEYS = [
  "AUDIT_SIGNING_PRIVATE_KEY", "SECURITY_MODE", "ASTRA_AUDIT_KMS_KEY_ID", "ASTRA_AUDIT_KMS_REGION", "ASTRA_AUDIT_KMS_ENDPOINT",
  "ASTRA_AUDIT_KMS_TIMEOUT_MS", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

let kms: MockKms;
const HASH = "a".repeat(64);
const edKey = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return { pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(), privateKey, publicKey };
};
const keyIdOf = (publicPem: string) => crypto.createHash("sha256").update(publicPem.trim()).digest("hex").slice(0, 16);

beforeEach(async () => {
  vi.resetModules();
  h.rows.length = 0; h.failDb = false;
  for (const k of ENV_KEYS) delete process.env[k];
  kms = await startMockKms();
  process.env.SECURITY_MODE = "production";
  process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE"; process.env.AWS_SECRET_ACCESS_KEY = "example-secret"; // the stand-in does not check them
  process.env.ASTRA_AUDIT_KMS_KEY_ID = kms.keyArn;
  process.env.ASTRA_AUDIT_KMS_ENDPOINT = kms.endpoint;
});
afterEach(async () => {
  await kms.close();
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const kmsModule = () => import("../server/audit-kms");
const signingModule = () => import("../server/audit-signing");
const config = async () => (await kmsModule()).readAuditKmsConfig()!;

// ═══ Configuration ═══════════════════════════════════════════════════════════

describe("configuration", () => {
  const read = async (env: Record<string, string | undefined>) => (await kmsModule()).readAuditKmsConfig(env as NodeJS.ProcessEnv);
  const UUID = "1234abcd-12ab-34cd-56ef-1234567890ab";
  const ARN = `arn:aws:kms:eu-central-1:111122223333:key/${UUID}`;

  it("is off unless a key is named, and then nothing about it is read", async () => {
    for (const v of [undefined, "", "   "]) expect(await read({ ASTRA_AUDIT_KMS_KEY_ID: v, ASTRA_AUDIT_KMS_TIMEOUT_MS: "junk" })).toBeNull();
    const m = await kmsModule();
    expect(m.validateAuditKmsEnv({} as any)).toEqual([]);
    expect(m.describeAuditKms({} as any)).toBe("audit-key=env");
  });

  it("takes a key id, a multi-region key id, a key ARN, an alias or an alias ARN", async () => {
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: ARN }))!.keyId).toBe(ARN);
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: UUID, AWS_REGION: "eu-west-1" }))!.keyId).toBe(UUID);
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: `mrk-${"0123456789abcdef".repeat(2)}`, AWS_REGION: "eu-west-1" }))!.keyId).toMatch(/^mrk-/);
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: "alias/astra-audit", AWS_REGION: "us-east-1" }))!.keyId).toBe("alias/astra-audit");
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: "arn:aws:kms:us-east-1:111122223333:alias/astra-audit" }))!.region).toBe("us-east-1");
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: "arn:aws-us-gov:kms:us-gov-west-1:111122223333:key/" + UUID }))!.region).toBe("us-gov-west-1");
  });

  it("refuses anything else, so a typo stops the server instead of failing at the first audit event", async () => {
    for (const bad of ["audit", "alias/", "arn:aws:s3:::bucket", "arn:aws:kms:eu-central-1:123:key/x", `${UUID}extra`, "alias/has space", "../../etc/passwd", "https://kms.example.com"]) {
      await expect(read({ ASTRA_AUDIT_KMS_KEY_ID: bad, AWS_REGION: "eu-west-1" }), bad).rejects.toThrow(/must be a KMS key id/);
    }
    const m = await kmsModule();
    expect(m.validateAuditKmsEnv({ ASTRA_AUDIT_KMS_KEY_ID: "audit", AWS_REGION: "eu-west-1" } as any)[0]).toMatch(/audit signing key in KMS is misconfigured/);
    expect(m.describeAuditKms({ ASTRA_AUDIT_KMS_KEY_ID: "audit" } as any)).toBe("audit-key=invalid");
  });

  it("works out the region from the ARN, else the setting, else the environment, and insists on one", async () => {
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: ARN, AWS_REGION: "us-east-1" }))!.region).toBe("eu-central-1");
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: UUID, ASTRA_AUDIT_KMS_REGION: "ap-southeast-2", AWS_REGION: "us-east-1" }))!.region).toBe("ap-southeast-2");
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: UUID, AWS_DEFAULT_REGION: "eu-north-1" }))!.region).toBe("eu-north-1");
    await expect(read({ ASTRA_AUDIT_KMS_KEY_ID: UUID })).rejects.toThrow(/needs a region/);
    await expect(read({ ASTRA_AUDIT_KMS_KEY_ID: UUID, AWS_REGION: "Not A Region" })).rejects.toThrow(/not an AWS region name/);
  });

  it("allows a custom endpoint only over https, or http on this machine", async () => {
    const base = { ASTRA_AUDIT_KMS_KEY_ID: ARN };
    expect((await read({ ...base, ASTRA_AUDIT_KMS_ENDPOINT: "https://vpce-0abc.kms.eu-central-1.vpce.amazonaws.com/" }))!.endpoint).toBe("https://vpce-0abc.kms.eu-central-1.vpce.amazonaws.com");
    expect((await read({ ...base, ASTRA_AUDIT_KMS_ENDPOINT: "http://127.0.0.1:4566" }))!.endpoint).toBe("http://127.0.0.1:4566");
    for (const bad of ["http://kms.example.com", "ftp://x", "not a url", "http://169.254.169.254"]) await expect(read({ ...base, ASTRA_AUDIT_KMS_ENDPOINT: bad }), bad).rejects.toThrow(/ASTRA_AUDIT_KMS_ENDPOINT/);
    expect((await read(base))!.endpoint).toBeNull();
  });

  it("bounds the time a signature may take: 5 seconds unless set, never under 0.5 or over 60", async () => {
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: ARN }))!.timeoutMs).toBe(5000);
    expect((await read({ ASTRA_AUDIT_KMS_KEY_ID: ARN, ASTRA_AUDIT_KMS_TIMEOUT_MS: "800" }))!.timeoutMs).toBe(800);
    for (const bad of ["499", "60001", "abc", "1.5", "-1"]) await expect(read({ ASTRA_AUDIT_KMS_KEY_ID: ARN, ASTRA_AUDIT_KMS_TIMEOUT_MS: bad }), bad).rejects.toThrow(/between 500 and 60000/);
  });

  it("says kms in the start-up line only when it is on", async () => {
    expect((await kmsModule()).describeAuditKms()).toBe("audit-key=kms");
  });
});

// ═══ The signer ══════════════════════════════════════════════════════════════

describe("opening the key", () => {
  const open = async (over: Record<string, unknown> = {}) => { const m = await kmsModule(); return m.openKmsSigner({ ...(await config()), ...over } as any); };

  it("reads its public key, proves it signs, and answers with a SubjectPublicKeyInfo PEM", async () => {
    const signer = await open();
    expect(signer.publicKeyPem).toBe(kms.publicKeyPem());
    expect(signer.keyArn).toBe(kms.keyArn);
    expect(kms.calls.map((c) => c.target)).toEqual(["TrentService.GetPublicKey", "TrentService.Sign"]);
    expect(signer.stats()).toMatchObject({ signed: 0, failed: 0, lastLatencyMs: null });
  });

  it("asks for pure Ed25519 over the raw message, from the exact key it resolved, even when named by alias", async () => {
    process.env.ASTRA_AUDIT_KMS_KEY_ID = "alias/audit";
    process.env.ASTRA_AUDIT_KMS_REGION = kms.region;
    const signer = await open();
    await signer.sign(Buffer.from(HASH));
    const sign = kms.calls.filter((c) => c.target === "TrentService.Sign");
    expect(sign.length).toBe(2);
    for (const s of sign) expect(s.body).toMatchObject({ KeyId: kms.keyArn, MessageType: "RAW", SigningAlgorithm: "ED25519_SHA_512" });
    expect(kms.calls[0].body.KeyId).toBe("alias/audit");
  });

  it("refuses a key that is not an Ed25519 signing key, before any event is signed", async () => {
    for (const [change, expected] of [
      [() => { kms.keySpec = "ECC_NIST_P256"; }, /ECC_NIST_P256, not ECC_NIST_EDWARDS25519/],
      [() => { kms.keyUsage = "KEY_AGREEMENT"; }, /usage is KEY_AGREEMENT, not SIGN_VERIFY/],
      [() => { kms.algorithms = ["ED25519_PH_SHA_512"]; }, /does not offer ED25519_SHA_512/],
    ] as Array<[() => void, RegExp]>) {
      const fresh = await startMockKms(); kms = fresh; process.env.ASTRA_AUDIT_KMS_KEY_ID = fresh.keyArn; process.env.ASTRA_AUDIT_KMS_ENDPOINT = fresh.endpoint;
      change();
      await expect(open(), String(expected)).rejects.toThrow(expected);
      expect(fresh.calls.some((c) => c.target === "TrentService.Sign")).toBe(false);
      await fresh.close();
    }
    kms = await startMockKms(); process.env.ASTRA_AUDIT_KMS_KEY_ID = kms.keyArn; process.env.ASTRA_AUDIT_KMS_ENDPOINT = kms.endpoint;
  });

  it("refuses a public key that is not Ed25519 or not readable", async () => {
    kms.publicKeyDer = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "der" }) as Buffer;
    await expect(open()).rejects.toThrow(/is ec, not ed25519/);
    kms.publicKeyDer = Buffer.from("not a key");
    await expect(open()).rejects.toThrow(/not a readable SubjectPublicKeyInfo/);
  });

  it("explains what to grant when the key cannot be read, and when it is not there", async () => {
    kms.failNext.push({ status: 400, type: "AccessDeniedException", message: "User is not authorized to perform: kms:GetPublicKey" });
    await expect(open()).rejects.toThrow(/needs kms:GetPublicKey and kms:Sign/);
    await expect(open({ keyId: "alias/someone-elses" })).rejects.toThrow(/cannot read the public key of the KMS key/);
  });

  it("refuses a key that cannot sign, or signs wrongly, at start-up", async () => {
    kms.enabled = false;
    await expect(open()).rejects.toThrow(/did not pass the signing check at start-up.*DisabledException/);
    kms.enabled = true;
    kms.mangle = (s) => { const t = Buffer.from(s); t[0] ^= 1; return t; };
    await expect(open()).rejects.toThrow(/does not verify against the key's public key/);
    kms.mangle = (s) => s.subarray(0, 63);
    await expect(open()).rejects.toThrow(/63-byte signature, not 64/);
    kms.mangle = undefined;
    expect(await open()).toBeTruthy();
  });

  it("says plainly when the AWS client library is not installed", async () => {
    const m = await kmsModule();
    await expect(m.openKmsSigner(await config(), async () => { throw new Error("Cannot find module '@aws-sdk/client-kms'"); })).rejects.toThrow(/AWS KMS client library \(@aws-sdk\/client-kms\) could not be loaded/);
  });
});

describe("signing", () => {
  const open = async (over: Record<string, unknown> = {}) => { const m = await kmsModule(); return m.openKmsSigner({ ...(await config()), ...over } as any); };

  it("makes the same signature an environment key makes: 64 bytes of pure Ed25519 over the bytes, checkable with only the public key", async () => {
    const signer = await open();
    const sig = await signer.sign(Buffer.from(HASH, "utf-8"));
    expect(sig.length).toBe(64);
    expect(crypto.verify(null, Buffer.from(HASH, "utf-8"), crypto.createPublicKey(signer.publicKeyPem), sig)).toBe(true);
    expect(kms.verify(Buffer.from(HASH, "utf-8"), sig)).toBe(true);
    expect(crypto.verify(null, Buffer.from(HASH.toUpperCase()), crypto.createPublicKey(signer.publicKeyPem), sig)).toBe(false);
  });

  it("will not send what KMS would refuse, or nothing", async () => {
    const signer = await open();
    const calls = kms.calls.length;
    await expect(signer.sign(Buffer.alloc(0))).rejects.toThrow(/1 to 4096 bytes/);
    await expect(signer.sign(Buffer.alloc(4097, 1))).rejects.toThrow(/1 to 4096 bytes/);
    expect(kms.calls.length).toBe(calls);
    expect((await signer.sign(Buffer.alloc(4096, 1))).length).toBe(64);
  });

  it("retries a throttled or failed call, and gives up with a short message that holds no request detail", async () => {
    const signer = await open();
    kms.failNext.push({ status: 400, type: "ThrottlingException" }, { status: 500, type: "KMSInternalException" });
    expect((await signer.sign(Buffer.from(HASH))).length).toBe(64);
    expect(kms.calls.filter((c) => c.target === "TrentService.Sign").length).toBe(4); // boot check + 3 attempts
    kms.failNext.push(...Array.from({ length: 5 }, () => ({ status: 500, type: "KMSInternalException", message: "internal secret=hunter2" })));
    const err: any = await signer.sign(Buffer.from(HASH)).catch((e) => e);
    expect(err.message).toMatch(/^the audit signing key in KMS could not sign \(/);
    expect(err.message.length).toBeLessThan(260);
    expect(signer.stats()).toMatchObject({ failed: 1, lastError: expect.stringContaining("KMSInternalException") });
  });

  it("does not retry a refusal that will not change: a disabled key", async () => {
    const signer = await open();
    kms.enabled = false;
    const before = kms.calls.length;
    await expect(signer.sign(Buffer.from(HASH))).rejects.toThrow(/DisabledException/);
    expect(kms.calls.length - before).toBe(1);
  });

  it("gives up on a call that never answers, after the time allowed, not after the SDK's own patience", async () => {
    const signer = await open({ timeoutMs: 500 });
    kms.hang = true;
    const started = Date.now();
    await expect(signer.sign(Buffer.from(HASH))).rejects.toThrow(/could not sign/);
    expect(Date.now() - started).toBeLessThan(3000);
    kms.hang = false;
    expect((await signer.sign(Buffer.from(HASH))).length).toBe(64);
  });

  it("refuses a signature that does not verify against the public key it holds: a key moved under an alias cannot slip one past", async () => {
    const signer = await open();
    kms.rotateKey();
    await expect(signer.sign(Buffer.from(HASH))).rejects.toThrow(/does not verify against the key's public key/);
    const s = signer.stats();
    expect(s.failed).toBe(1);
  });

  it("refuses a corrupt answer: wrong length, wrong bytes", async () => {
    const signer = await open();
    kms.mangle = (s) => Buffer.concat([s, Buffer.from([0])]);
    await expect(signer.sign(Buffer.from(HASH))).rejects.toThrow(/65-byte signature, not 64/);
    kms.mangle = (s) => { const t = Buffer.from(s); t[63] ^= 0x80; return t; };
    await expect(signer.sign(Buffer.from(HASH))).rejects.toThrow(/does not verify/);
  });

  it("keeps count, and records how long the last signature took", async () => {
    kms.delayMs = 40;
    const signer = await open();
    await signer.sign(Buffer.from(HASH));
    await signer.sign(Buffer.from(HASH));
    const s = signer.stats();
    expect(s.signed).toBe(2);
    expect(s.lastLatencyMs).toBeGreaterThanOrEqual(35);
    expect(s.failed).toBe(0);
  });

  it("warns once a minute when signing is slow, because every audit write waits for it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const signer = await open();
    kms.delayMs = 560;
    await signer.sign(Buffer.from(HASH));
    await signer.sign(Buffer.from(HASH));
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("every audit write waits")).length).toBe(1);
  });
});

// ═══ Through the audit signer ════════════════════════════════════════════════

describe("as the audit signer", () => {
  it("signs events so that the recipe in docs/AUDIT_LOG_EXPORT.md verifies them with only the public key", async () => {
    const { signAuditPayload, verifyAuditSignature, getPublicKeyInfo } = await signingModule();
    const { signature, signerKeyId } = await signAuditPayload(HASH);
    const info = await getPublicKeyInfo();
    expect(info).toEqual({ keyId: keyIdOf(kms.publicKeyPem()), publicKeyPem: kms.publicKeyPem(), algorithm: "Ed25519", source: "kms" });
    expect(signerKeyId).toBe(info.keyId);
    expect(Buffer.from(signature, "base64").length).toBe(64);
    expect(crypto.verify(null, Buffer.from(HASH, "utf-8"), crypto.createPublicKey(info.publicKeyPem), Buffer.from(signature, "base64"))).toBe(true);
    expect(await verifyAuditSignature(HASH, signature, signerKeyId)).toBe(true);
    expect(await verifyAuditSignature("b".repeat(64), signature, signerKeyId)).toBe(false);
  });

  it("needs no key in the environment, even in production", async () => {
    expect(process.env.AUDIT_SIGNING_PRIVATE_KEY).toBeUndefined();
    const { signAuditPayload } = await signingModule();
    await expect(signAuditPayload(HASH)).resolves.toMatchObject({ signature: expect.any(String) });
  });

  it("opens the key once however many events arrive at the same moment", async () => {
    const { signAuditPayload } = await signingModule();
    await Promise.all(Array.from({ length: 8 }, () => signAuditPayload(HASH)));
    expect(kms.calls.filter((c) => c.target === "TrentService.GetPublicKey").length).toBe(1);
    expect(kms.calls.filter((c) => c.target === "TrentService.Sign").length).toBe(1 + 8);
  });

  it("records the public key, and only the public key, so its events stay verifiable after a rotation", async () => {
    const { getSigningKey } = await signingModule();
    await getSigningKey();
    expect(h.rows).toEqual([{ purpose: "audit_signing_kms", keyId: keyIdOf(kms.publicKeyPem()), privateKeyPem: "", publicKeyPem: kms.publicKeyPem() }]);
    vi.resetModules();
    await (await signingModule()).getSigningKey();
    expect(h.rows.length).toBe(1);
  });

  it("an event signed before a rotation is still verified after it, from the recorded public key alone", async () => {
    const first = await signingModule();
    const { signature, signerKeyId } = await first.signAuditPayload(HASH);
    kms.rotateKey();
    vi.resetModules();
    const second = await signingModule();
    const now = await second.getPublicKeyInfo();
    expect(now.keyId).not.toBe(signerKeyId);
    expect(await second.verifyAuditSignature(HASH, signature, signerKeyId)).toBe(true);
    expect(h.rows.map((r) => r.keyId).sort()).toEqual([signerKeyId, now.keyId].sort());
  });

  it("when an environment key is still set it only verifies: it signs nothing, and its public key is recorded so the variable can be removed", async () => {
    const legacy = edKey();
    process.env.AUDIT_SIGNING_PRIVATE_KEY = legacy.pem;
    const oldSig = crypto.sign(null, Buffer.from(HASH), legacy.privateKey).toString("base64");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { signAuditPayload, verifyAuditSignature, getPublicKeyInfo } = await signingModule();
    const { signature, signerKeyId } = await signAuditPayload(HASH);
    const kmsId = keyIdOf(kms.publicKeyPem());
    expect(signerKeyId).toBe(kmsId);
    expect((await getPublicKeyInfo()).source).toBe("kms");
    expect(kms.verify(Buffer.from(HASH), Buffer.from(signature, "base64"))).toBe(true);
    expect(await verifyAuditSignature(HASH, oldSig, keyIdOf(legacy.publicPem))).toBe(true);
    expect(h.rows.find((r) => r.purpose === "audit_signing_retired")).toEqual({ purpose: "audit_signing_retired", keyId: keyIdOf(legacy.publicPem), privateKeyPem: "", publicKeyPem: legacy.publicPem });
    expect(JSON.stringify(h.rows)).not.toContain("PRIVATE KEY");
    expect(warn.mock.calls.some((c) => String(c[0]).includes("is still set") && String(c[0]).includes("can be removed"))).toBe(true);
    // After a restart with the variable gone, the old events still verify.
    delete process.env.AUDIT_SIGNING_PRIVATE_KEY;
    vi.resetModules();
    expect(await (await signingModule()).verifyAuditSignature(HASH, oldSig, keyIdOf(legacy.publicPem))).toBe(true);
  });

  it("never falls back to the environment key when KMS cannot be used", async () => {
    const legacy = edKey();
    process.env.AUDIT_SIGNING_PRIVATE_KEY = legacy.pem;
    const { signAuditPayload, getSigningKey } = await signingModule();
    await getSigningKey();
    kms.enabled = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(signAuditPayload(HASH)).rejects.toThrow(/could not sign/);
    // And a start-up that cannot open the key does not quietly pick the local one either.
    vi.resetModules();
    kms.hang = true; process.env.ASTRA_AUDIT_KMS_TIMEOUT_MS = "500";
    await expect((await signingModule()).getSigningKey()).rejects.toThrow(/cannot read the public key of the KMS key/);
  });

  it("refuses an environment key that is the very key in KMS", async () => {
    // A key cannot be exported from KMS, but one can be imported into it: then the same key is held in both places.
    const legacy = edKey();
    process.env.AUDIT_SIGNING_PRIVATE_KEY = legacy.pem;
    kms.adoptKey(legacy.privateKey);
    await expect((await signingModule()).getSigningKey()).rejects.toThrow(/is the same key as the one in KMS/);
    expect(h.rows.some((r) => r.purpose === "audit_signing_retired")).toBe(false);
  });

  it("carries on when the database cannot record the public key, and says so", async () => {
    h.failDb = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { signAuditPayload } = await signingModule();
    await expect(signAuditPayload(HASH)).resolves.toMatchObject({ signature: expect.any(String) });
    expect(warn.mock.calls.some((c) => String(c[0]).includes("could not record the public key"))).toBe(true);
  });

  it("does not remember a failure to open: the next caller tries again", async () => {
    const { getSigningKey } = await signingModule();
    kms.enabled = false;
    await expect(getSigningKey()).rejects.toThrow(/start-up/);
    kms.enabled = true;
    await expect(getSigningKey()).resolves.toMatchObject({ source: "kms" });
  });

  it("reports one failure in the log, not one per event, when signing keeps failing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { signAuditPayload, getSigningKey } = await signingModule();
    await getSigningKey();
    kms.enabled = false;
    for (let i = 0; i < 5; i++) await expect(signAuditPayload(HASH)).rejects.toThrow();
    const mine = err.mock.calls.filter((c) => String(c[0]).includes("could not sign an audit event"));
    expect(mine.length).toBe(1);
    expect(String(mine[0][0])).not.toContain("example-secret");
  });

  it("is opened at start-up, so a key that cannot sign stops the server; with no KMS it does nothing at all", async () => {
    const { initAuditSigning } = await signingModule();
    await expect(initAuditSigning()).resolves.toBeUndefined();
    expect(kms.calls.length).toBe(2);
    vi.resetModules();
    kms.enabled = false;
    await expect((await signingModule()).initAuditSigning()).rejects.toThrow(/did not pass the signing check/);
    vi.resetModules();
    delete process.env.ASTRA_AUDIT_KMS_KEY_ID;
    const callsBefore = kms.calls.length;
    await expect((await signingModule()).initAuditSigning()).resolves.toBeUndefined();
    expect(kms.calls.length).toBe(callsBefore);
  });

  it("tells an operator where the key is held and how signing is going", async () => {
    const { signAuditPayload, getAuditSignerStatus } = await signingModule();
    await signAuditPayload(HASH);
    expect(await getAuditSignerStatus()).toMatchObject({ source: "kms", keyId: keyIdOf(kms.publicKeyPem()), kms: { signed: 1, failed: 0 } });
    vi.resetModules();
    delete process.env.ASTRA_AUDIT_KMS_KEY_ID;
    process.env.AUDIT_SIGNING_PRIVATE_KEY = edKey().pem;
    expect(await (await signingModule()).getAuditSignerStatus()).toMatchObject({ source: "env", kms: null });
  });

  it("measures what it costs: every audit write of one organization waits for a signature in turn", async () => {
    // The chain is written under a per-organization lock, so n events take n x the signing latency.
    kms.delayMs = 25;
    const { signAuditPayload, getSigningKey } = await signingModule();
    await getSigningKey();
    const started = Date.now();
    for (let i = 0; i < 8; i++) await signAuditPayload(HASH);
    const perEvent = (Date.now() - started) / 8;
    console.log(`[measured] in turn, at 25 ms of KMS latency: ${perEvent.toFixed(1)} ms per event, about ${Math.round(1000 / perEvent)} events per second per organization`);
    expect(perEvent).toBeGreaterThanOrEqual(24);
    expect(perEvent).toBeLessThan(120);
  });
});

// ═══ The check an operator runs against the real thing ═══════════════════════

describe("scripts/check-audit-kms.mjs", () => {
  const run = (env: Record<string, string | undefined>, args: string[] = ["--samples", "3"]) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      execFile(process.execPath, [path.join(__dirname, "..", "scripts", "check-audit-kms.mjs"), ...args], {
        cwd: path.join(__dirname, ".."), timeout: 60_000,
        env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", AWS_ACCESS_KEY_ID: "AKIAEXAMPLE", AWS_SECRET_ACCESS_KEY: "example-secret", ...env } as any,
      }, (err: any, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: String(stdout) + String(stderr) }));
    });
  const target = () => ({ ASTRA_AUDIT_KMS_KEY_ID: kms.keyArn, ASTRA_AUDIT_KMS_ENDPOINT: kms.endpoint });

  it("passes for a key that behaves as documented, and prints the public key and the id Astra will record", async () => {
    const r = await run(target());
    expect(r.out).toContain("ALL CHECKS PASSED");
    expect(r.code).toBe(0);
    expect(r.out).toContain(kms.publicKeyPem().trim());
    expect(r.out).toContain(keyIdOf(kms.publicKeyPem()));
    expect(r.out).toMatch(/signatures in a row, none failing/);
    expect(r.out).toMatch(/events per second per organization/);
    expect(r.out).not.toContain("example-secret");
  });

  it("fails, and says which check, for a key of the wrong kind or one that signs wrongly", async () => {
    kms.keySpec = "ECC_NIST_P256";
    const wrongSpec = await run(target());
    expect(wrongSpec.code).toBe(1);
    expect(wrongSpec.out).toMatch(/FAIL {2}key spec is ECC_NIST_EDWARDS25519/);
    kms.keySpec = "ECC_NIST_EDWARDS25519";
    kms.mangle = (s) => { const t = Buffer.from(s); t[5] ^= 1; return t; };
    const wrongSig = await run(target());
    expect(wrongSig.code).toBe(1);
    expect(wrongSig.out).toMatch(/FAIL {2}the signature verifies offline as plain Ed25519/);
    expect(wrongSig.out).not.toContain("ALL CHECKS PASSED");
  });

  it("fails clearly when the role may not use the key", async () => {
    kms.failNext.push({ status: 400, type: "AccessDeniedException", message: "not authorized to perform: kms:GetPublicKey" });
    const r = await run(target());
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/FAIL {2}the role can read the key's public key/);
    expect(r.out).toMatch(/kms:GetPublicKey and kms:Sign/);
    kms.enabled = false;
    const disabled = await run(target());
    expect(disabled.code).toBe(1);
    expect(disabled.out).toMatch(/FAIL {2}the role can sign/);
  });

  it("insists on knowing the key and the region, and does not go looking without them", async () => {
    expect((await run({ ASTRA_AUDIT_KMS_ENDPOINT: kms.endpoint })).code).toBe(2);
    const noRegion = await run({ ASTRA_AUDIT_KMS_KEY_ID: "alias/audit", ASTRA_AUDIT_KMS_ENDPOINT: kms.endpoint });
    expect(noRegion.code).toBe(2);
    expect(noRegion.out).toMatch(/No region/);
    expect((await run(target(), ["--samples", "0"])).code).toBe(2);
    expect(kms.calls.length).toBe(0);
  });
});

// ═══ How it is wired ═════════════════════════════════════════════════════════

describe("wiring", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("the server opens the key before it takes traffic, and stops if it cannot", () => {
    const index = src("server/index.ts");
    const open = index.indexOf("await initAuditSigning()");
    const routes = index.indexOf("await registerRoutes(httpServer, app)");
    expect(open).toBeGreaterThan(-1);
    expect(open).toBeLessThan(routes);
    const around = index.slice(open - 80, open + 260);
    expect(around).toContain("process.exit(1)");
  });

  it("a setting that is wrong stops the server at boot, and the start-up line says where the key is", () => {
    const c = src("server/config.ts");
    expect(c).toContain("errors.push(...validateAuditKmsEnv())");
    expect(c).toContain("${describeAuditKms()}");
  });

  it("the AWS client library is loaded only when KMS is used, so no other deployment pays for it", () => {
    const k = src("server/audit-kms.ts");
    expect(k).not.toMatch(/^import [^t].*from "@aws-sdk/m);
    expect(k).not.toMatch(/^import \{[^}]*\} from "@aws-sdk/m);
    expect(k).toContain('import("@aws-sdk/client-kms")');
    expect(src("server/audit-signing.ts")).not.toContain("@aws-sdk");
  });

  it("the library is a declared dependency, so a clean install has it", () => {
    expect(JSON.parse(src("package.json")).dependencies["@aws-sdk/client-kms"]).toMatch(/^\^3\./);
  });

  it("createAuditEvent still signs every event inside the organization's lock, and says nothing else about keys", () => {
    const s = src("server/storage.ts");
    const create = s.slice(s.indexOf("async createAuditEvent("), s.indexOf("async getInvoices("));
    expect(create).toContain("pg_advisory_xact_lock");
    expect(create).toContain("await signAuditPayload(eventHash)");
    expect(create.indexOf("pg_advisory_xact_lock")).toBeLessThan(create.indexOf("signAuditPayload"));
  });

  it("the setup guide covers creating the key, the permissions, the switch and what to expect", () => {
    const doc = src("docs/AUDIT_SIGNING_KMS.md");
    for (const needle of ["ECC_NIST_EDWARDS25519", "ED25519_SHA_512", "kms:Sign", "kms:GetPublicKey", "ASTRA_AUDIT_KMS_KEY_ID", "AUDIT_SIGNING_PRIVATE_KEY", "check-audit-kms"]) expect(doc, needle).toContain(needle);
  });
});
