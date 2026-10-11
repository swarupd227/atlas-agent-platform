/**
 * The vault reads back only blobs of the exact shape it writes: a 12-byte IV and a 16-byte AES-GCM authentication tag.
 *
 * Node accepts an authentication tag of 4 to 16 bytes unless the length is pinned. Someone able to write the database could
 * shorten a stored tag to 4 bytes and have a forged blob accepted with a chance of 1 in 2^32 per try instead of 1 in 2^128.
 * Found by static analysis on 2026-10-11. (tests/credential-vault-pins.test.ts pins the blob format itself.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); process.env.INTEGRATION_VAULT_KEY = "vault-tag-test-key"; });

const load = () => import("../server/credential-vault");
const tamper = (blob: string, change: (b: any) => void) => { const b = JSON.parse(blob); change(b); return JSON.stringify(b); };

describe("decryptCredential", () => {
  it("still reads what encryptCredential wrote", async () => {
    const v = await load();
    expect(v.decryptCredential(v.encryptCredential("secret"))).toBe("secret");
    expect(v.decryptCredentialMap(v.encryptCredentialMap({ a: "1" }))).toEqual({ a: "1" });
  });

  it("writes a 16-byte tag and a 12-byte IV (the shape it insists on reading)", async () => {
    const b = JSON.parse((await load()).encryptCredential("x"));
    expect(Buffer.from(b.tag, "hex").length).toBe(16);
    expect(Buffer.from(b.iv, "hex").length).toBe(12);
  });

  it("refuses a tag cut short, however plausible the rest", async () => {
    const v = await load();
    const blob = v.encryptCredential("secret");
    for (const bytes of [1, 4, 8, 12, 15]) {
      const cut = tamper(blob, (b) => { b.tag = b.tag.slice(0, bytes * 2); });
      expect(() => v.decryptCredential(cut), `${bytes} bytes`).toThrow(/authentication tag/);
    }
  });

  it("refuses a tag that is too long, and an empty one", async () => {
    const v = await load();
    const blob = v.encryptCredential("secret");
    expect(() => v.decryptCredential(tamper(blob, (b) => { b.tag += "00"; }))).toThrow(/authentication tag/);
    expect(() => v.decryptCredential(tamper(blob, (b) => { b.tag = ""; }))).toThrow(/authentication tag/);
  });

  it("refuses an IV of the wrong length", async () => {
    const v = await load();
    const blob = v.encryptCredential("secret");
    expect(() => v.decryptCredential(tamper(blob, (b) => { b.iv = b.iv.slice(0, 16); }))).toThrow(/IV/);
    expect(() => v.decryptCredential(tamper(blob, (b) => { b.iv += "00"; }))).toThrow(/IV/);
  });

  it("still refuses a tag of the right length that is wrong", async () => {
    const v = await load();
    const blob = v.encryptCredential("secret");
    expect(() => v.decryptCredential(tamper(blob, (b) => { b.tag = "00".repeat(16); }))).toThrow();
  });
});
