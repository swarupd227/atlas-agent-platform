import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derives the 32-byte vault key from the INTEGRATION_VAULT_KEY env var.
 * In development (NODE_ENV !== "production") a per-process fallback key is
 * accepted so the dev server starts cleanly, but a clear warning is printed.
 * In production, the absence of the env var causes an immediate startup error.
 */
let _cachedKey: Buffer | null = null;

export function getVaultKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const raw = process.env.INTEGRATION_VAULT_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[credential-vault] FATAL: INTEGRATION_VAULT_KEY env var is not set. " +
        "Set a 32-byte (64 hex char) random key before starting the server in production."
      );
    }
    console.warn(
      "[credential-vault] WARNING: INTEGRATION_VAULT_KEY is not set. " +
      "Using an ephemeral dev key — credentials will NOT survive a server restart. " +
      "Set INTEGRATION_VAULT_KEY in your environment for persistent encryption."
    );
    // Use a stable per-process ephemeral key so at least within a single run
    // encrypt/decrypt is consistent; cleared on restart which is the intended warning.
    _cachedKey = randomBytes(32);
    return _cachedKey;
  }

  _cachedKey = createHash("sha256").update(raw).digest();
  return _cachedKey;
}

export interface EncryptedBlob {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function encryptCredential(plaintext: string): string {
  const key = getVaultKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob: EncryptedBlob = {
    v: 1,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
  return JSON.stringify(blob);
}

export function decryptCredential(blobJson: string): string {
  const key = getVaultKey();
  const blob: EncryptedBlob = JSON.parse(blobJson);
  if (blob.v !== 1) throw new Error(`Unsupported vault blob version: ${(blob as any).v}`);
  const iv = Buffer.from(blob.iv, "hex");
  const tag = Buffer.from(blob.tag, "hex");
  const ciphertext = Buffer.from(blob.ciphertext, "hex");
  // Exactly the shape encryptCredential writes. Node would otherwise accept a tag of 4 to 16 bytes, and a blob whose stored tag
  // was shortened would then be forgeable with a chance of 1 in 2^32 per try instead of 1 in 2^128.
  if (iv.length !== IV_LENGTH) throw new Error("Invalid vault blob: the IV is the wrong length");
  if (tag.length !== TAG_LENGTH) throw new Error("Invalid vault blob: the authentication tag is the wrong length");
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

export function encryptCredentialMap(credentials: Record<string, string>): string {
  return encryptCredential(JSON.stringify(credentials));
}

export function decryptCredentialMap(blobJson: string): Record<string, string> {
  return JSON.parse(decryptCredential(blobJson));
}
