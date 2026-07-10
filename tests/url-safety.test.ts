/**
 * SSRF guard conformance — assertSafeOutboundUrl must refuse loopback,
 * private, link-local, and cloud-metadata targets before any fetch happens,
 * while still allowing ordinary public hosts through. Pure/offline: DNS
 * lookups for public hostnames are mocked so this runs in the deterministic
 * CI unit-test job without network access.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dns/promises", () => ({
  default: { lookup: vi.fn() },
  lookup: vi.fn(),
}));

import dns from "dns/promises";
import { assertSafeOutboundUrl, checkSafeOutboundUrl, UnsafeUrlError } from "../server/url-safety";

beforeEach(() => {
  vi.mocked(dns.lookup).mockReset();
});

describe("assertSafeOutboundUrl — blocks private/internal targets", () => {
  it("rejects a plain IPv4 loopback address", async () => {
    await expect(assertSafeOutboundUrl("http://127.0.0.1:9200")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects localhost by hostname", async () => {
    await expect(assertSafeOutboundUrl("http://localhost:5432")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x)", async () => {
    await expect(assertSafeOutboundUrl("http://10.0.0.5/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeOutboundUrl("http://172.16.5.5/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeOutboundUrl("http://172.31.255.255/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeOutboundUrl("http://192.168.1.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects the cloud metadata address 169.254.169.254", async () => {
    await expect(assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a public hostname that resolves to a private address (DNS rebinding)", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "10.1.2.3", family: 4 }] as any);
    await expect(assertSafeOutboundUrl("http://evil.example.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeOutboundUrl("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeOutboundUrl("gopher://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a malformed URL", async () => {
    await expect(assertSafeOutboundUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects IPv6 loopback and unique-local", async () => {
    await expect(assertSafeOutboundUrl("http://[::1]/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeOutboundUrl("http://[fd00::1]/")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("assertSafeOutboundUrl — allows legitimate public targets", () => {
  it("allows a public hostname resolving to a public address", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    await expect(assertSafeOutboundUrl("https://example.com/page")).resolves.toBeUndefined();
  });

  it("allows a bare public IPv4 address with no DNS lookup needed", async () => {
    await expect(assertSafeOutboundUrl("http://8.8.8.8/")).resolves.toBeUndefined();
    expect(dns.lookup).not.toHaveBeenCalled();
  });
});

describe("checkSafeOutboundUrl — non-throwing variant", () => {
  it("returns { ok: false, reason } instead of throwing", async () => {
    const result = await checkSafeOutboundUrl("http://127.0.0.1/");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("returns { ok: true } for a safe public host", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "1.1.1.1", family: 4 }] as any);
    const result = await checkSafeOutboundUrl("https://public.example.com/");
    expect(result.ok).toBe(true);
  });
});
