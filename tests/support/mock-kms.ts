/**
 * A stand-in for AWS KMS that speaks its real wire protocol (AWS JSON 1.1, X-Amz-Target) over real HTTP, so
 * the real AWS SDK client can be pointed at it. It holds an Ed25519 key and enforces the rules the Sign
 * documentation gives for ECC_NIST_EDWARDS25519 keys: ED25519_SHA_512 needs MessageType RAW, ED25519_PH_SHA_512
 * needs a 64-byte DIGEST, a message is 1 to 4096 bytes, a key that is disabled or not for signing refuses.
 *
 * It is built from the documentation, not from AWS: what it cannot prove is that AWS behaves as documented.
 * That is what the boot probe in server/audit-kms.ts and scripts/check-audit-kms.mjs are for.
 */
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface MockKms {
  endpoint: string;
  region: string;
  keyUuid: string;
  keyArn: string;
  /** Every request received, in order. */
  calls: Array<{ target: string; body: any }>;
  /** Wait this long before answering. */
  delayMs: number;
  /** Refuse the next requests, one entry each (consumed in order, for any operation). */
  failNext: Array<{ status: number; type: string; message?: string }>;
  /** Never answer (until closed). */
  hang: boolean;
  keySpec: string;
  keyUsage: string;
  algorithms: string[];
  enabled: boolean;
  /** Change the signature before it is returned (to model a wrong or corrupt answer). */
  mangle?: (signature: Buffer) => Buffer;
  /** Answer GetPublicKey with this DER instead of the key's. */
  publicKeyDer?: Buffer;
  /** Replace the key material (an alias pointed somewhere else, or a rotation). */
  rotateKey(): void;
  /** Hold this key instead (a key that is already known elsewhere). */
  adoptKey(privateKey: crypto.KeyObject): void;
  publicKeyPem(): string;
  verify(message: Buffer, signature: Buffer): boolean;
  close(): Promise<void>;
}

export async function startMockKms(opts: { region?: string; account?: string; delayMs?: number } = {}): Promise<MockKms> {
  const region = opts.region ?? "eu-central-1";
  const account = opts.account ?? "111122223333";
  const keyUuid = crypto.randomUUID();
  const keyArn = `arn:aws:kms:${region}:${account}:key/${keyUuid}`;
  let pair = crypto.generateKeyPairSync("ed25519");

  const mock = {
    region, keyUuid, keyArn,
    calls: [] as MockKms["calls"],
    delayMs: opts.delayMs ?? 0,
    failNext: [] as MockKms["failNext"],
    hang: false,
    keySpec: "ECC_NIST_EDWARDS25519",
    keyUsage: "SIGN_VERIFY",
    algorithms: ["ED25519_SHA_512", "ED25519_PH_SHA_512"],
    enabled: true,
  } as MockKms;

  mock.rotateKey = () => { pair = crypto.generateKeyPairSync("ed25519"); };
  mock.adoptKey = (privateKey) => { pair = { privateKey, publicKey: crypto.createPublicKey(privateKey) }; };
  mock.publicKeyPem = () => pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  mock.verify = (message, signature) => crypto.verify(null, message, pair.publicKey, signature);

  const resolves = (id: unknown) => id === keyUuid || id === keyArn || id === "alias/audit" || id === `arn:aws:kms:${region}:${account}:alias/audit`;

  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const c of req) raw += c;
    const target = String(req.headers["x-amz-target"] ?? "");
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* leave empty */ }
    mock.calls.push({ target, body });
    const send = (status: number, payload: unknown, errorType?: string) => {
      res.writeHead(status, { "Content-Type": "application/x-amz-json-1.1", ...(errorType ? { "x-amzn-ErrorType": errorType } : {}) }).end(JSON.stringify(payload));
    };
    const refuse = (status: number, type: string, message = type) => send(status, { __type: type, message }, type);

    if (mock.hang) return; // the caller's timeout is what ends this
    if (mock.delayMs > 0) await new Promise((r) => setTimeout(r, mock.delayMs));
    const injected = mock.failNext.shift();
    if (injected) return refuse(injected.status, injected.type, injected.message);

    if (!resolves(body.KeyId)) return refuse(400, "NotFoundException", "Key not found");
    if (target === "TrentService.GetPublicKey") {
      const der = mock.publicKeyDer ?? (pair.publicKey.export({ type: "spki", format: "der" }) as Buffer);
      return send(200, {
        KeyId: keyArn, PublicKey: der.toString("base64"), CustomerMasterKeySpec: mock.keySpec, KeySpec: mock.keySpec,
        KeyUsage: mock.keyUsage, SigningAlgorithms: mock.keyUsage === "SIGN_VERIFY" ? mock.algorithms : undefined,
      });
    }
    if (target === "TrentService.Sign") {
      if (!mock.enabled) return refuse(400, "DisabledException", `${keyArn} is disabled.`);
      if (mock.keyUsage !== "SIGN_VERIFY") return refuse(400, "InvalidKeyUsageException", "Key usage is not SIGN_VERIFY");
      const algorithm = body.SigningAlgorithm;
      if (!mock.algorithms.includes(algorithm)) return refuse(400, "InvalidKeyUsageException", `Algorithm ${algorithm} is not valid for this key`);
      const message = Buffer.from(String(body.Message ?? ""), "base64");
      if (message.length < 1 || message.length > 4096) return refuse(400, "ValidationException", "Message must be 1 to 4096 bytes");
      const type = body.MessageType ?? "RAW";
      let signature: Buffer;
      if (algorithm === "ED25519_SHA_512") {
        if (type !== "RAW") return refuse(400, "ValidationException", "ED25519_SHA_512 requires MessageType RAW");
        signature = crypto.sign(null, message, pair.privateKey);
      } else if (algorithm === "ED25519_PH_SHA_512") {
        if (type !== "DIGEST" || message.length !== 64) return refuse(400, "ValidationException", "ED25519_PH_SHA_512 requires a 64-byte DIGEST");
        // Not pure Ed25519: a different construction, so a caller that picks it is caught by verifying.
        signature = crypto.sign(null, crypto.createHash("sha512").update(Buffer.concat([Buffer.from("SigEd25519 no Ed25519 collisions\u0001"), message])).digest(), pair.privateKey);
      } else {
        return refuse(400, "ValidationException", "Unsupported algorithm");
      }
      if (mock.mangle) signature = mock.mangle(signature);
      return send(200, { KeyId: keyArn, Signature: signature.toString("base64"), SigningAlgorithm: algorithm });
    }
    return refuse(400, "UnknownOperationException", target);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  mock.endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
  return mock;
}
