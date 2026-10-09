# Reading the audit log from a SIEM

Astra's audit log is a signed hash chain: every event carries the hash of the one before it and an
Ed25519 signature. A SIEM or compliance archive can **pull** the log with a read-only key and prove it
holds what Astra wrote.

Astra does not push audit events to an external system. (The "Logging Integrations" screen stores
settings but does not send anything.) The supported path is the pull below.

## 1. Mint a key

An administrator creates a key for the organization. The key is shown once.

```bash
curl -X POST https://<astra>/api/audit-read-keys \
  -H "Content-Type: application/json" -b "<administrator session cookie>" \
  -d '{"name": "Hilti SIEM", "expiresInDays": 365}'
```

The response carries `key` (`astra_audit_…`), its `id`, a `keyPrefix` for recognising it later, and its
expiry. Astra keeps only a SHA-256 of the key, so a lost key cannot be recovered: revoke it and mint another.

- Administrators only. A key belongs to the organization, not to an agent, and can do one thing: read
  that organization's audit events.
- It expires (default 365 days, at most 1095); a key that never expires is not offered. Rotate before it does.
- An organization can have up to 25 active keys: one per consumer, so each can be revoked alone.
- `GET /api/audit-read-keys` lists them (prefix, expiry, when last used, never the key).
  `DELETE /api/audit-read-keys/<id>` revokes one, effective at once.
- Creating and revoking a key are recorded in the audit log itself.

## 2. Pull events

```bash
curl -H "Authorization: Bearer astra_audit_…" \
  "https://<astra>/api/v1/audit-events?after_seq=0&limit=500"
```

`X-API-Key: <key>` works in place of the Bearer header.

| Parameter | Meaning |
|---|---|
| `after_seq` | Return events with a sequence number greater than this. Default 0. |
| `limit` | 1 to 1000. Default 500. |
| `format` | `json` (default) or `ndjson` (one event per line). |

A value that cannot be honoured (not a number, out of range, given twice) is a `400`, never silently replaced.

The JSON response:

```json
{ "organizationId": "…", "afterSeq": 0, "nextAfterSeq": 500, "hasMore": true, "count": 500, "events": [ … ] }
```

Keep `nextAfterSeq` and ask again from there. While `hasMore` is true, ask again at once; when it is
false you are caught up, so wait and poll (every minute is plenty). With `format=ndjson` the same two
values are the `X-Next-After-Seq` and `X-Has-More` response headers.

Each event has `id`, `sequenceNum`, `createdAt`, `organizationId`, `actorType`, `actorId`, `action`,
`objectType`, `objectId`, `details`, `previousHash`, `eventHash`, `signature`, `signerKeyId`,
`correlationId`, `traceId`, `industryId`, `complianceFrameworks` and `ontologyTags`.

- Only events in the key's own organization are returned, and only events in the hash chain (those with a
  sequence number): that is what can be verified.
- `details` is returned exactly as stored, unredacted, because the signature covers it. Treat the key as
  you would any credential that can read your audit log.
- A bad key of any kind (missing, unknown, expired, revoked) gets the same `401`. A deployment that has
  turned the public API off (`apiKeys.publicApi` in the platform lockdown) gets a `403` and cannot mint keys.

A minimal poller:

```bash
after=0
while true; do
  page=$(curl -sf -H "Authorization: Bearer $KEY" "https://<astra>/api/v1/audit-events?after_seq=$after&limit=1000") || { sleep 60; continue; }
  echo "$page" | jq -c '.events[]' >> audit.ndjson
  after=$(echo "$page" | jq .nextAfterSeq)
  [ "$(echo "$page" | jq .hasMore)" = "true" ] || sleep 60
done
```

## 3. Verify what you received

`GET /api/v1/audit-chain/public-key` (same key) returns the Ed25519 public key (`publicKeyPem`, `keyId`).
For each event, in sequence order:

1. **Chain.** `previousHash` equals the previous event's `eventHash` (the first event of an organization
   starts from `GENESIS`).
2. **Hash.** Build the canonical payload: a JSON object with exactly the keys `action`, `actorId`,
   `actorType`, `createdAt`, `details`, `objectId`, `objectType`, `organizationId`, `sequenceNum`, in that
   (alphabetical) order, missing values as `null`, serialised with `JSON.stringify`. Then
   `eventHash = sha256_hex(previousHash + canonicalPayload)`.
3. **Signature.** `signature` is the base64 Ed25519 signature, made with the key named by `signerKeyId`,
   over the UTF-8 text of `eventHash`.

A break in any of the three means an event was altered, removed or inserted.

Astra's own checks use the same rules: `GET /api/audit-events/verify-chain` (signed in) verifies the chain
server-side.
