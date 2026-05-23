import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getDerivedKey(): Buffer {
  const raw = process.env.INTEGRATION_VAULT_KEY || "atlas-dev-vault-key-change-in-production-32b";
  return createHash("sha256").update(raw).digest();
}

export interface EncryptedBlob {
  iv: string;
  tag: string;
  ciphertext: string;
}

export function encryptCredential(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob: EncryptedBlob = {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
  return JSON.stringify(blob);
}

export function decryptCredential(blobJson: string): string {
  const key = getDerivedKey();
  const blob: EncryptedBlob = JSON.parse(blobJson);
  const iv = Buffer.from(blob.iv, "hex");
  const tag = Buffer.from(blob.tag, "hex");
  const ciphertext = Buffer.from(blob.ciphertext, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

export function encryptCredentialMap(credentials: Record<string, string>): string {
  return encryptCredential(JSON.stringify(credentials));
}

export function decryptCredentialMap(blobJson: string): Record<string, string> {
  return JSON.parse(decryptCredential(blobJson));
}
