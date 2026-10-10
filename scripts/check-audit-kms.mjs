#!/usr/bin/env node
/**
 * Check an AWS KMS key as Astra's audit signing key, against the REAL KMS, before switching to it.
 *
 *   ASTRA_AUDIT_KMS_KEY_ID=arn:aws:kms:eu-central-1:111122223333:key/... node scripts/check-audit-kms.mjs [--samples 20]
 *
 * Credentials come from the usual AWS places (environment, shared config, the instance or task role): run it
 * as the same role the application will use, so the permissions you test are the ones it will have. It needs
 * kms:GetPublicKey and kms:Sign on the key and signs only random nonces; it creates and changes nothing.
 * It does not use any Astra code on purpose: it checks what AWS does, from first principles.
 *
 * Exit 0 only if every check passes. Also reads ASTRA_AUDIT_KMS_REGION / AWS_REGION and ASTRA_AUDIT_KMS_ENDPOINT.
 */
import crypto from "node:crypto";

const keyId = (process.env.ASTRA_AUDIT_KMS_KEY_ID ?? "").trim();
const samplesArg = process.argv.indexOf("--samples");
const samples = samplesArg > -1 ? Number(process.argv[samplesArg + 1]) : 20;
if (!keyId) { console.error("Set ASTRA_AUDIT_KMS_KEY_ID to the key id, key ARN or alias."); process.exit(2); }
if (!Number.isInteger(samples) || samples < 1 || samples > 500) { console.error("--samples must be 1 to 500."); process.exit(2); }
const arnRegion = /^arn:aws[a-z-]*:kms:([a-z0-9-]+):/.exec(keyId)?.[1];
const region = process.env.ASTRA_AUDIT_KMS_REGION || arnRegion || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
if (!region) { console.error("No region: use the key's ARN, or set AWS_REGION."); process.exit(2); }

let sdk;
try { sdk = await import("@aws-sdk/client-kms"); } catch (e) { console.error(`Cannot load @aws-sdk/client-kms (run npm install): ${e.message}`); process.exit(2); }
const client = new sdk.KMSClient({ region, ...(process.env.ASTRA_AUDIT_KMS_ENDPOINT ? { endpoint: process.env.ASTRA_AUDIT_KMS_ENDPOINT } : {}), maxAttempts: 3 });

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); return ok; };
const brief = (e) => `${e?.name ?? "Error"}: ${String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 140)}`;

// 1. The key.
let described;
try {
  described = await client.send(new sdk.GetPublicKeyCommand({ KeyId: keyId }));
  check("the role can read the key's public key (kms:GetPublicKey)", true);
} catch (e) {
  check("the role can read the key's public key (kms:GetPublicKey)", false, brief(e));
  console.log("\nCheck the key id, the region, and that the role has kms:GetPublicKey and kms:Sign on the key (the key ARN, not an alias, in the IAM policy).");
  process.exit(1);
}
const spec = described.KeySpec ?? described.CustomerMasterKeySpec;
check("key spec is ECC_NIST_EDWARDS25519 (Ed25519)", spec === "ECC_NIST_EDWARDS25519", String(spec));
check("key usage is SIGN_VERIFY", described.KeyUsage === "SIGN_VERIFY", String(described.KeyUsage));
check("the key offers ED25519_SHA_512 (pure Ed25519)", Array.isArray(described.SigningAlgorithms) && described.SigningAlgorithms.includes("ED25519_SHA_512"), (described.SigningAlgorithms ?? []).join(","));
let publicKey = null;
try {
  publicKey = crypto.createPublicKey({ key: Buffer.from(described.PublicKey), format: "der", type: "spki" });
  check("the public key is an Ed25519 SubjectPublicKeyInfo Node can read", publicKey.asymmetricKeyType === "ed25519", String(publicKey.asymmetricKeyType));
} catch (e) { check("the public key is an Ed25519 SubjectPublicKeyInfo Node can read", false, brief(e)); }
if (!publicKey || results.includes(false)) { console.log("\nFix the above before going further."); process.exit(1); }
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const astraKeyId = crypto.createHash("sha256").update(pem.trim()).digest("hex").slice(0, 16);
const arn = described.KeyId || keyId;

// 2. Signing, verified here with nothing from AWS.
const sign = async (message, algorithm = "ED25519_SHA_512", type = "RAW") =>
  Buffer.from((await client.send(new sdk.SignCommand({ KeyId: arn, Message: message, MessageType: type, SigningAlgorithm: algorithm }))).Signature);
try {
  const nonce = Buffer.from(crypto.randomBytes(32).toString("hex"));
  const sig = await sign(nonce);
  check("the role can sign (kms:Sign)", true);
  check("the signature is 64 bytes", sig.length === 64, `${sig.length} bytes`);
  check("the signature verifies offline as plain Ed25519 with only the public key (what the audit-log recipe does)", crypto.verify(null, nonce, publicKey, sig));
  check("a different message does not verify under that signature", !crypto.verify(null, Buffer.from("x" + nonce.toString()), publicKey, sig));
  const again = await sign(nonce);
  check("signing the same bytes twice gives the same signature (Ed25519 is deterministic)", again.equals(sig));
} catch (e) { check("the role can sign (kms:Sign)", false, brief(e)); process.exit(1); }

// 3. The algorithm that must NOT be used: the prehash variant does not verify as plain Ed25519.
try {
  const digest = crypto.createHash("sha512").update("probe").digest();
  const ph = await sign(digest, "ED25519_PH_SHA_512", "DIGEST");
  check("(information) ED25519_PH_SHA_512 is a different signature scheme: Astra does not use it", !crypto.verify(null, digest, publicKey, ph));
} catch (e) { console.log(`INFO  ED25519_PH_SHA_512 not tried (${brief(e)})`); }

// 4. What it costs: audit writes of one organization wait for a signature in turn.
const times = [];
let failures = 0;
for (let i = 0; i < samples; i++) {
  const m = Buffer.from(crypto.randomBytes(32).toString("hex"));
  const t = process.hrtime.bigint();
  try { await sign(m); times.push(Number(process.hrtime.bigint() - t) / 1e6); } catch { failures++; }
}
check(`${samples} signatures in a row, none failing`, failures === 0, failures ? `${failures} failed` : "");
if (times.length) {
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`\nlatency over ${times.length} signatures: min ${times[0].toFixed(0)} ms, median ${q(0.5).toFixed(0)} ms, p95 ${q(0.95).toFixed(0)} ms, max ${times[times.length - 1].toFixed(0)} ms`);
  console.log(`one organization's audit writes wait for a signature in turn: about ${Math.floor(1000 / mean)} events per second per organization at this latency (run this from the application's own network).`);
}

console.log(`\nkey      ${arn}\nastra id ${astraKeyId}  (what each signed event records as its signer)\n\n${pem}`);
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "ALL CHECKS PASSED: this key can be used as the audit signing key." : `${failed} CHECK(S) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
