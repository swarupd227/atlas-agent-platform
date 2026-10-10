# Holding the audit signing key in AWS KMS

Astra signs every audit event with an Ed25519 key (see [AUDIT_LOG_EXPORT.md](AUDIT_LOG_EXPORT.md)). By
default that key is `AUDIT_SIGNING_PRIVATE_KEY`, a secret in the application's environment, so it exists in
the process's memory. With AWS KMS the private key is created inside KMS and **never leaves it**: Astra sends
KMS the hash to sign and gets the signature back. Anyone who takes over the application can still ask KMS to
sign (while they hold its role), but they cannot copy the key, and every signature is recorded in CloudTrail.

Off unless `ASTRA_AUDIT_KMS_KEY_ID` is set. With it unset nothing changes.

## What does not change

- **The signature.** A KMS key signs with `ED25519_SHA_512` on the raw message, which is plain Ed25519: the
  same 64 bytes, over the same text (`eventHash`), that an environment key makes. The verification recipe in
  `AUDIT_LOG_EXPORT.md` is the same and needs only the public key. **Verifying never involves AWS.**
- The hash chain, the checkpoints, the exports, and the key id format (first 16 hex of the sha256 of the
  public key's PEM).

## 1. Create the key

An asymmetric KMS key with key spec `ECC_NIST_EDWARDS25519` and usage `SIGN_VERIFY` (AWS added Ed25519 in
November 2025; the spec cannot be changed after creation):

```bash
aws kms create-key --key-spec ECC_NIST_EDWARDS25519 --key-usage SIGN_VERIFY \
  --description "Astra audit signing key" --region eu-central-1
aws kms create-alias --alias-name alias/astra-audit --target-key-id <KeyId from the output> --region eu-central-1
```

Use a key in the same region as the application, and keep the key policy tight: only the application's role
(and your key administrators) need `kms:Sign` and `kms:GetPublicKey`. KMS asymmetric keys do not rotate
themselves: see Rotation below.

## 2. Let the application's role use it

The role the application runs as (instance profile, ECS task role, or an EKS service account) needs, on that
key only:

```json
{ "Effect": "Allow", "Action": ["kms:Sign", "kms:GetPublicKey"], "Resource": "arn:aws:kms:<region>:<account>:key/<key id>" }
```

Put the **key ARN** in the IAM policy, not an alias ARN. For a key in another account the key policy there
must allow the role too. With the Terraform in `deploy/terraform/aws`, set `audit_kms_key_arn` and it adds
exactly this policy and passes the setting to the app. Terraform does not create the key.

## 3. Check the key before switching

Run this as the same role the application will use (from the instance, or with that role assumed):

```bash
ASTRA_AUDIT_KMS_KEY_ID=arn:aws:kms:<region>:<account>:key/<id> node scripts/check-audit-kms.mjs
```

It checks the key spec and usage, signs random nonces through the real KMS, verifies the signatures offline
with Node as plain Ed25519, and prints the latency and the events per second one organization can sustain.
**This is the check that matters:** the automated tests use a stand-in for KMS built from AWS's
documentation, and this is how a real key proves it behaves the same.

## 4. Switch

1. Leave `AUDIT_SIGNING_PRIVATE_KEY` set for now. Set `ASTRA_AUDIT_KMS_KEY_ID` (Terraform:
   `audit_kms_key_arn`) and deploy.
2. At start-up the server reads the key's public half, checks it is Ed25519 and offers `ED25519_SHA_512`,
   signs a random nonce through KMS and verifies it. If anything is wrong it **stops** with the reason
   (`[FATAL] The audit signing key cannot be used`), so a wrong role or key never becomes unsigned events.
3. Look for `audit-key=kms` in the `[config]` line and `Signing with an Ed25519 key held in AWS KMS` in the
   log. New events carry the KMS key's id as `signerKeyId`.
4. While the old variable is still set the log says so: it **no longer signs anything**, and its public key
   is recorded in the database so events it signed stay verifiable. Once you have seen that line, **remove
   `AUDIT_SIGNING_PRIVATE_KEY`** and redeploy. Check that an old event still verifies:
   `GET /api/v1/audit-chain/public-key?keyId=<its signerKeyId>` returns its public key.

## Rotation

Create a new key, run the check, point `ASTRA_AUDIT_KMS_KEY_ID` at it and deploy. The new key's public half is
recorded when it is first used, so everything signed by the old key stays verifiable (`?keyId=` above). Keep
the old KMS key until you are sure nothing needs it again; verification does not need it, only signing did.

## What to expect

- **Every audit write waits for KMS.** The chain is written under a per-organization lock and each event is
  signed inside it, so one organization's events are signed one after another. At about 20 ms per signature
  that is roughly 50 events per second per organization (the check script prints your real figure). Other
  organizations are not held up. KMS allows 1,000 ECC operations per second per account and region, shared
  across keys, and costs about $0.03 per 10,000 requests.
- **It fails closed, and there is no fallback.** If KMS cannot be reached (or the role loses permission, or
  the key is disabled), the audit write fails after at most the timeout (5 s unless
  `ASTRA_AUDIT_KMS_TIMEOUT_MS`, with up to three tries inside it). Astra never signs with a local key instead:
  that would defeat the point. **Consequence to plan for:** many callers in the platform record an audit event
  on a best-effort basis, so while KMS is unavailable those actions can go ahead with their audit event
  missing from the log (the chain stays valid; it simply has no entry for them). The server logs
  `could not sign an audit event, so it was not written` (once every 10 seconds at most): alert on it.
  Slow signatures are logged too (`KMS signing took ... ms`).
- **Every signature is checked** against the public key Astra holds before it is used, so a key that has
  been swapped under an alias, or a corrupt answer, is refused and not written.
- Re-baselining the audit chain (Governance) re-signs every event, which is one KMS call each.
- The calls to KMS use the AWS SDK and its own HTTP client, not the platform's outbound policy
  (`ASTRA_OUTBOUND_POLICY`), because the endpoint is AWS's. For a private path use a VPC endpoint for KMS and
  set `ASTRA_AUDIT_KMS_ENDPOINT` to it (https only).

## Settings

| Setting | |
|---|---|
| `ASTRA_AUDIT_KMS_KEY_ID` | Key id, key ARN, alias or alias ARN. Turns this on. |
| `ASTRA_AUDIT_KMS_REGION` | Only if the key is not given as an ARN and `AWS_REGION` is not set. |
| `ASTRA_AUDIT_KMS_ENDPOINT` | A VPC endpoint for KMS (https; http only for localhost). |
| `ASTRA_AUDIT_KMS_TIMEOUT_MS` | 500 to 60000, default 5000. |

Credentials are the AWS defaults (environment, shared config, instance, task or web-identity role).

## Not covered

Connector credentials (a Jira token, for example) are not held in KMS or a vault by this: they are encrypted
in Astra's database with a key held outside it, as before. A KMS key for them is separate work.
