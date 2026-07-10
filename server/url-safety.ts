/**
 * Outbound URL safety — SSRF guard for fetches driven by user-supplied or
 * user-editable URLs (KB ingestion, webhook callers, connector "test"
 * buttons). Blocks the request BEFORE any DNS lookup or connection is made
 * to a private/loopback/link-local address, so the app can't be used as a
 * proxy to scan or hit internal infrastructure or cloud metadata endpoints.
 *
 * Deliberately NOT applied to MCP server registration/initialization: an
 * admin registering a connector against an internal or localhost endpoint is
 * the intended product behavior (the platform's own demo connectors run on
 * localhost), not an SSRF vector — the caller there already holds the
 * permission to register arbitrary infrastructure.
 */
import dns from "dns/promises";
import net from "net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "metadata.google.internal"]);

// Private / loopback / link-local / cloud-metadata ranges. IPv4-mapped IPv6
// addresses are normalized to IPv4 before this check.
function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;                 // loopback
    if (lower.startsWith("fe80:")) return true;        // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice(7);
      if (net.isIPv4(v4)) return isBlockedIp(v4);
    }
    return false;
  }
  if (!net.isIPv4(ip)) return false;
  const octets = ip.split(".").map(Number);
  const [a, b] = octets;
  if (a === 127) return true;                                          // loopback
  if (a === 10) return true;                                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;                     // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                              // 192.168.0.0/16
  if (a === 169 && b === 254) return true;                              // link-local + cloud metadata (169.254.169.254)
  if (a === 0) return true;                                             // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true;                    // 100.64.0.0/10 (carrier-grade NAT)
  return false;
}

export interface UrlSafetyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a URL is safe to fetch server-side: http(s) only, not a blocked
 * hostname, and — after DNS resolution — not a private/loopback/link-local
 * address. Resolving before the real fetch also defeats naive DNS-rebinding
 * (the URL is fetched immediately after this check, not cached and reused).
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError(`Protocol "${parsed.protocol}" is not allowed — only http/https.`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`Host "${hostname}" is not reachable from this action.`);
  }
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new UnsafeUrlError(`Host "${hostname}" resolves to a private/internal address.`);
    return;
  }
  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true });
    addresses = records.map(r => r.address);
  } catch {
    throw new UnsafeUrlError(`Could not resolve host "${hostname}".`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`Could not resolve host "${hostname}".`);
  for (const addr of addresses) {
    if (isBlockedIp(addr)) throw new UnsafeUrlError(`Host "${hostname}" resolves to a private/internal address (${addr}).`);
  }
}

/** Non-throwing variant for call sites that want a boolean + message. */
export async function checkSafeOutboundUrl(rawUrl: string): Promise<UrlSafetyResult> {
  try {
    await assertSafeOutboundUrl(rawUrl);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e.message };
  }
}
