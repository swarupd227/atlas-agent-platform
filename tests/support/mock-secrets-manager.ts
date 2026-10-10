/**
 * A stand-in for AWS Secrets Manager that speaks its real wire protocol (AWS JSON 1.1, X-Amz-Target
 * "secretsmanager.<Operation>") over real HTTP, so the real AWS SDK client can be pointed at it.
 *
 * It keeps secrets in memory and enforces the rules AWS documents: a name is 1 to 512 characters of
 * letters, digits and /_+=.@-; a value is at most 65,536 bytes; CreateSecret refuses a name that exists;
 * a secret marked for deletion cannot be read or written (until restored); a recovery window is 7 to 30
 * days. It is built from the documentation, not from AWS: what it cannot prove is that AWS behaves as
 * documented, which is what scripts/check-secrets-manager.mjs is for.
 */
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface StoredSecret {
  name: string;
  arn: string;
  value: string;
  versions: number;
  kmsKeyId?: string;
  tags: Record<string, string>;
  deletedAt?: Date;
}

export interface MockSecretsManager {
  endpoint: string;
  region: string;
  /** Every request received, in order. */
  calls: Array<{ op: string; body: any }>;
  secrets: Map<string, StoredSecret>;
  delayMs: number;
  /** Refuse the next requests, one entry each (consumed in order, for any operation). */
  failNext: Array<{ status: number; type: string; message?: string }>;
  /** Let the next CreateSecret happen, but answer it with this error (the answer was lost on the way back). */
  createThenReport: Array<{ status: number; type: string; message?: string }>;
  /** Refuse every request of these operations. */
  deny: Set<string>;
  hang: boolean;
  close(): Promise<void>;
}

export async function startMockSecretsManager(opts: { region?: string; account?: string; delayMs?: number } = {}): Promise<MockSecretsManager> {
  const region = opts.region ?? "eu-central-1";
  const account = opts.account ?? "111122223333";
  const mock = { region, calls: [], secrets: new Map(), delayMs: opts.delayMs ?? 0, failNext: [], createThenReport: [], deny: new Set<string>(), hang: false } as unknown as MockSecretsManager;
  const tokens = new Map<string, string>();

  const find = (id: unknown): StoredSecret | undefined => {
    if (typeof id !== "string") return undefined;
    for (const s of mock.secrets.values()) if (s.name === id || s.arn === id) return s;
    return undefined;
  };

  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const c of req) raw += c;
    const op = String(req.headers["x-amz-target"] ?? "").replace(/^secretsmanager\./, "");
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* leave empty */ }
    mock.calls.push({ op, body });
    const send = (status: number, payload: unknown, errorType?: string) => {
      res.writeHead(status, { "Content-Type": "application/x-amz-json-1.1", ...(errorType ? { "x-amzn-ErrorType": errorType } : {}) }).end(JSON.stringify(payload));
    };
    const refuse = (status: number, type: string, message = type) => send(status, { __type: type, Message: message }, type);

    if (mock.hang) return;
    if (mock.delayMs > 0) await new Promise((r) => setTimeout(r, mock.delayMs));
    const injected = mock.failNext.shift();
    if (injected) return refuse(injected.status, injected.type, injected.message);
    if (mock.deny.has(op)) return refuse(400, "AccessDeniedException", `User is not authorized to perform: secretsmanager:${op}`);

    if (op === "CreateSecret") {
      const name = body.Name;
      if (typeof name !== "string" || !/^[A-Za-z0-9/_+=.@-]{1,512}$/.test(name)) return refuse(400, "ValidationException", "Invalid name");
      if (typeof body.SecretString !== "string") return refuse(400, "InvalidParameterException", "SecretString is required");
      if (Buffer.byteLength(body.SecretString) > 65_536) return refuse(400, "InvalidParameterException", "The secret value is too large");
      // As AWS: a repeat of the same request (same token, same value) is the same answer, not an error.
      const existing = find(name);
      if (existing && body.ClientRequestToken && tokens.get(name) === body.ClientRequestToken && existing.value === body.SecretString) {
        return send(200, { ARN: existing.arn, Name: name, VersionId: crypto.randomUUID() });
      }
      if (existing) return refuse(400, "ResourceExistsException", "The operation failed because the secret already exists.");
      const arn = `arn:aws:secretsmanager:${region}:${account}:secret:${name}-${crypto.randomBytes(3).toString("hex")}`;
      const tags: Record<string, string> = {}; for (const t of body.Tags ?? []) tags[t.Key] = t.Value;
      mock.secrets.set(name, { name, arn, value: body.SecretString, versions: 1, kmsKeyId: body.KmsKeyId, tags });
      tokens.set(name, String(body.ClientRequestToken ?? ""));
      // The answer is lost on the way back: the secret exists, the caller is told something else.
      const lost = mock.createThenReport.shift();
      if (lost) return refuse(lost.status, lost.type, lost.message);
      return send(200, { ARN: arn, Name: name, VersionId: crypto.randomUUID() });
    }
    const s = find(body.SecretId);
    if (!s) return refuse(400, "ResourceNotFoundException", "Secrets Manager can't find the specified secret.");
    if (op === "DescribeSecret") {
      return send(200, { ARN: s.arn, Name: s.name, KmsKeyId: s.kmsKeyId, ...(s.deletedAt ? { DeletedDate: s.deletedAt.getTime() / 1000 } : {}), Tags: Object.entries(s.tags).map(([Key, Value]) => ({ Key, Value })) });
    }
    if (op === "RestoreSecret") { s.deletedAt = undefined; return send(200, { ARN: s.arn, Name: s.name }); }
    if (s.deletedAt) return refuse(400, "InvalidRequestException", "You can't perform this operation on the secret because it was marked for deletion.");
    if (op === "GetSecretValue") return send(200, { ARN: s.arn, Name: s.name, SecretString: s.value, VersionId: `v${s.versions}`, VersionStages: ["AWSCURRENT"], CreatedDate: Date.now() / 1000 });
    if (op === "PutSecretValue") {
      if (typeof body.SecretString !== "string") return refuse(400, "InvalidParameterException", "SecretString is required");
      if (Buffer.byteLength(body.SecretString) > 65_536) return refuse(400, "InvalidParameterException", "The secret value is too large");
      s.value = body.SecretString; s.versions++;
      return send(200, { ARN: s.arn, Name: s.name, VersionId: `v${s.versions}`, VersionStages: ["AWSCURRENT"] });
    }
    if (op === "DeleteSecret") {
      if (body.ForceDeleteWithoutRecovery !== true) {
        const days = body.RecoveryWindowInDays ?? 30;
        if (!Number.isInteger(days) || days < 7 || days > 30) return refuse(400, "InvalidParameterException", "RecoveryWindowInDays must be between 7 and 30");
      }
      if (body.ForceDeleteWithoutRecovery === true) { mock.secrets.delete(s.name); return send(200, { ARN: s.arn, Name: s.name, DeletionDate: Date.now() / 1000 }); }
      s.deletedAt = new Date();
      return send(200, { ARN: s.arn, Name: s.name, DeletionDate: s.deletedAt.getTime() / 1000 });
    }
    return refuse(400, "UnknownOperationException", op);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  mock.endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
  return mock;
}
