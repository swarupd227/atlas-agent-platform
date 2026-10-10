#!/usr/bin/env node
/**
 * Check AWS Secrets Manager as Astra's external credential store, against the REAL service, before switching on.
 *
 *   ASTRA_SECRETS_MANAGER_PREFIX=astra/prod/ AWS_REGION=eu-central-1 node scripts/check-secrets-manager.mjs [--samples 10]
 *
 * Credentials come from the usual AWS places (environment, shared config, the instance or task role): run it
 * as the same role the application will use, so the permissions you test are the ones it will have. It
 * creates, reads, updates and then deletes (with the 7-day recovery window Astra uses) ONE throwaway secret
 * under `<prefix>_check/` and nothing else. That secret then stays marked for deletion, unreadable, until AWS
 * purges it after 7 days; if the delete step cannot run, it is force-deleted instead so nothing is left.
 * It does not use any Astra code on purpose: it checks what AWS does.
 *
 * Also reads ASTRA_SECRETS_MANAGER_REGION, ASTRA_SECRETS_MANAGER_ENDPOINT and ASTRA_SECRETS_MANAGER_KMS_KEY_ID.
 * Exit 0 only if every check passes.
 */
import crypto from "node:crypto";

const prefix = (process.env.ASTRA_SECRETS_MANAGER_PREFIX ?? "").trim();
const samplesArg = process.argv.indexOf("--samples");
const samples = samplesArg > -1 ? Number(process.argv[samplesArg + 1]) : 10;
if (!prefix) { console.error("Set ASTRA_SECRETS_MANAGER_PREFIX to the prefix Astra will use, for example astra/prod/"); process.exit(2); }
if (!/^[A-Za-z0-9][A-Za-z0-9_+=.@-]*(\/[A-Za-z0-9][A-Za-z0-9_+=.@-]*)*\/$/.test(prefix)) { console.error('The prefix must be a path ending in "/", for example astra/prod/'); process.exit(2); }
if (!Number.isInteger(samples) || samples < 1 || samples > 200) { console.error("--samples must be 1 to 200."); process.exit(2); }
const region = process.env.ASTRA_SECRETS_MANAGER_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
if (!region) { console.error("No region: set AWS_REGION (or ASTRA_SECRETS_MANAGER_REGION)."); process.exit(2); }
const kmsKeyId = (process.env.ASTRA_SECRETS_MANAGER_KMS_KEY_ID ?? "").trim() || undefined;

let sdk;
try { sdk = await import("@aws-sdk/client-secrets-manager"); } catch (e) { console.error(`Cannot load @aws-sdk/client-secrets-manager (run npm install): ${e.message}`); process.exit(2); }
const client = new sdk.SecretsManagerClient({ region, ...(process.env.ASTRA_SECRETS_MANAGER_ENDPOINT ? { endpoint: process.env.ASTRA_SECRETS_MANAGER_ENDPOINT } : {}), maxAttempts: 3 });

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); return ok; };
const brief = (e) => `${e?.name ?? "Error"}: ${String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 140)}`;
const name = `${prefix}_check/${crypto.randomUUID()}`;
const marker = crypto.randomBytes(8).toString("hex");
const timeMs = async (fn) => { const t = process.hrtime.bigint(); const r = await fn(); return [r, Number(process.hrtime.bigint() - t) / 1e6]; };
let created = false;
let scheduled = false;
const needsHelp = (what) => console.log(`\nThe role needs ${what} on arn:aws:secretsmanager:${region}:<account>:secret:${prefix}* (and, with a customer-managed key, kms:GenerateDataKey and kms:Decrypt on it).`);

try {
  // 1. Create.
  try {
    await client.send(new sdk.CreateSecretCommand({
      Name: name, SecretString: JSON.stringify({ probe: marker }), ClientRequestToken: crypto.randomUUID(), ...(kmsKeyId ? { KmsKeyId: kmsKeyId } : {}),
      Description: "Astra connector credentials: setup check, deleted straight away", Tags: [{ Key: "managed-by", Value: "astra" }, { Key: "astra-kind", Value: "check" }],
    }));
    created = true;
    check("the role can create a secret under the prefix (secretsmanager:CreateSecret, TagResource)", true);
  } catch (e) {
    check("the role can create a secret under the prefix (secretsmanager:CreateSecret, TagResource)", false, brief(e));
    needsHelp("secretsmanager:CreateSecret and secretsmanager:TagResource");
    process.exit(1);
  }

  // 2. Read, update, read.
  try {
    const [first] = await timeMs(() => client.send(new sdk.GetSecretValueCommand({ SecretId: name })));
    check("the role can read it back (secretsmanager:GetSecretValue), and it holds what was written", JSON.parse(first.SecretString ?? "{}").probe === marker);
  } catch (e) { check("the role can read it back (secretsmanager:GetSecretValue)", false, brief(e)); needsHelp("secretsmanager:GetSecretValue"); }
  try {
    await client.send(new sdk.PutSecretValueCommand({ SecretId: name, SecretString: JSON.stringify({ probe: `${marker}-2` }), ClientRequestToken: crypto.randomUUID() }));
    const after = await client.send(new sdk.GetSecretValueCommand({ SecretId: name }));
    check("the role can update it (secretsmanager:PutSecretValue), and the new value is what is read", JSON.parse(after.SecretString ?? "{}").probe === `${marker}-2`);
  } catch (e) { check("the role can update it (secretsmanager:PutSecretValue)", false, brief(e)); needsHelp("secretsmanager:PutSecretValue"); }

  // 3. Latency of a read, which is what a connector call waits for when the cache is cold.
  const times = [];
  let failures = 0;
  for (let i = 0; i < samples; i++) {
    try { const [, ms] = await timeMs(() => client.send(new sdk.GetSecretValueCommand({ SecretId: name }))); times.push(ms); } catch { failures++; }
  }
  check(`${samples} reads in a row, none failing`, failures === 0, failures ? `${failures} failed` : "");
  if (times.length) {
    times.sort((a, b) => a - b);
    const q = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
    console.log(`\nread latency over ${times.length}: min ${times[0].toFixed(0)} ms, median ${q(0.5).toFixed(0)} ms, p95 ${q(0.95).toFixed(0)} ms, max ${times[times.length - 1].toFixed(0)} ms (Astra keeps a read for 60 s by default)\n`);
  }

  // 4. Delete the way Astra does: with the shortest recovery window.
  try {
    await client.send(new sdk.DeleteSecretCommand({ SecretId: name, RecoveryWindowInDays: 7 }));
    scheduled = true;
    check("the role can delete with a 7-day recovery window (secretsmanager:DeleteSecret), as Astra does", true);
    let blocked = false;
    try { await client.send(new sdk.GetSecretValueCommand({ SecretId: name })); } catch (e) { blocked = /marked for deletion|InvalidRequestException/i.test(String(e?.name) + String(e?.message)); }
    check("a secret marked for deletion cannot be read, so a deleted credential stops working at once", blocked);
  } catch (e) { check("the role can delete with a recovery window (secretsmanager:DeleteSecret)", false, brief(e)); needsHelp("secretsmanager:DeleteSecret"); }
} finally {
  if (created && scheduled) {
    console.log(`cleanup: the throwaway secret ${name} is marked for deletion and unreadable; AWS purges it after 7 days.`);
  } else if (created) {
    try {
      await client.send(new sdk.DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }));
      console.log("cleanup: the throwaway secret was deleted for good.");
    } catch (e) {
      console.log(`cleanup: could not delete the throwaway secret ${name} (${brief(e)}). Remove it by hand.`);
    }
  }
}

const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "\nALL CHECKS PASSED: this prefix can be used as Astra's external secret store." : `\n${failed} CHECK(S) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
