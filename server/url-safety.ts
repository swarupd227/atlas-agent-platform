/**
 * Outbound URL safety — SSRF guard for fetches driven by user-supplied or
 * user-editable URLs (KB ingestion, webhook callers, connector "test"
 * buttons, spec imports). Refuses a private/loopback/link-local/metadata target
 * so the app can't be used as a proxy to scan or hit internal infrastructure.
 *
 * Three layers, each of which the one before it cannot give on its own:
 *
 *   1. Classification. Every address is public, private or denied. Denied
 *      (loopback, link-local and cloud metadata, multicast, reserved, the
 *      unspecified address) is never reachable, whatever the configuration says.
 *      Private (RFC 1918, CGNAT, ULA, documentation and benchmarking ranges) is
 *      refused unless an operator has listed it. An IPv6 address that embeds an
 *      IPv4 one (mapped, NAT64, 6to4) is judged by the worse of the two, in both
 *      the dotted and the hex form the URL parser produces.
 *
 *   2. The operator's allowlist, ASTRA_ALLOWED_PRIVATE_CIDRS. A deployment whose
 *      services sit on a private subnet (a customer's own VPC) lists those ranges,
 *      optionally with a port: "10.20.0.0/16,10.30.4.7@8443". It can only name
 *      private space: an entry that reaches into public or denied space is
 *      rejected, and so is an unparseable one, at boot (validateOutboundPolicyEnv),
 *      so a typo stops the server instead of silently widening or narrowing access.
 *
 *   3. safeFetch. A check followed by a separate fetch resolves the name twice,
 *      and DNS can answer differently the second time. safeFetch resolves once,
 *      validates every address, and connects to the address it validated (the
 *      Host header and TLS name stay the hostname). It also follows redirects
 *      itself, validating every hop, because a public URL can redirect to an
 *      internal one.
 *
 * Applied to fetches whose URL a person or a caller supplies. Deliberately NOT
 * applied to MCP server registration or calls: an admin registering a connector
 * against an internal endpoint is the intended product behavior there (see
 * ASTRA_OUTBOUND_POLICY for how that is being brought under the same rules).
 */
import dns from "dns/promises";
import net from "net";
import { Agent, fetch as undiciFetch } from "undici";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback", "metadata.google.internal"]);
const MAX_REDIRECTS = 5;

// ─── Classification ──────────────────────────────────────────────────────────

type Verdict = "public" | "private" | "denied";

function blockList(entries: Array<[string, number, "ipv4" | "ipv6"]>, singles: Array<[string, "ipv4" | "ipv6"]> = []): net.BlockList {
  const list = new net.BlockList();
  for (const [addr, prefix, fam] of entries) list.addSubnet(addr, prefix, fam);
  for (const [addr, fam] of singles) list.addAddress(addr, fam);
  return list;
}

// Never reachable, never allowlistable.
const DENIED = blockList(
  [
    ["0.0.0.0", 8, "ipv4"],        // "this network"
    ["127.0.0.0", 8, "ipv4"],      // loopback
    ["169.254.0.0", 16, "ipv4"],   // link-local, including the cloud metadata address 169.254.169.254
    ["224.0.0.0", 4, "ipv4"],      // multicast
    ["240.0.0.0", 4, "ipv4"],      // reserved, and the broadcast address
    ["fe80::", 10, "ipv6"],        // link-local
    ["ff00::", 8, "ipv6"],         // multicast
  ],
  [
    ["100.100.100.200", "ipv4"],   // Alibaba Cloud metadata (inside the CGNAT range otherwise allowlistable)
    ["::", "ipv6"],                // unspecified
    ["::1", "ipv6"],               // loopback
    ["fd00:ec2::254", "ipv6"],     // AWS metadata over IPv6 (inside ULA otherwise allowlistable)
  ],
);

// Refused by default, reachable only when an operator lists it.
const PRIVATE = blockList([
  ["10.0.0.0", 8, "ipv4"],         // RFC 1918
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],      // carrier-grade NAT
  ["192.0.0.0", 24, "ipv4"],       // IETF protocol assignments
  ["192.0.2.0", 24, "ipv4"],       // documentation
  ["198.18.0.0", 15, "ipv4"],      // benchmarking
  ["198.51.100.0", 24, "ipv4"],    // documentation
  ["203.0.113.0", 24, "ipv4"],     // documentation
  ["fc00::", 7, "ipv6"],           // unique local
  ["2001:db8::", 32, "ipv6"],      // documentation
  ["2001::", 32, "ipv6"],          // Teredo (embeds an obfuscated IPv4 address)
  ["100::", 64, "ipv6"],           // discard-only
]);

const WORSE: Record<Verdict, number> = { public: 0, private: 1, denied: 2 };

/** The eight 16-bit groups of an IPv6 address, or null if it is not one. */
function ipv6Groups(ip: string): number[] | null {
  let addr = ip.split("%")[0].toLowerCase();
  if (net.isIP(addr) !== 6) return null;
  const dotted = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const o = dotted[1].split(".").map(Number);
    addr = addr.slice(0, -dotted[1].length) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail === undefined ? [] : tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  const groups = [...h, ...Array(Math.max(fill, 0)).fill("0"), ...t].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const v4FromGroups = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** The IPv4 address an IPv6 address carries inside it, if it carries one. */
function embeddedIPv4(groups: number[]): string | null {
  const [a, b, c, d, e, f, g, h] = groups;
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0) && (g !== 0 || h > 1 || f === 0xffff)) return v4FromGroups(g, h); // ::ffff:a.b.c.d and ::a.b.c.d
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return v4FromGroups(g, h); // NAT64
  if (a === 0x2002) return v4FromGroups(b, c);                                                              // 6to4
  return null;
}

function classify(rawIp: string): Verdict {
  const ip = rawIp.split("%")[0];
  const family = net.isIP(ip);
  if (family === 0) return "denied"; // not an address we can reason about
  let verdict: Verdict;
  if (family === 4) {
    verdict = DENIED.check(ip, "ipv4") ? "denied" : PRIVATE.check(ip, "ipv4") ? "private" : "public";
  } else {
    verdict = DENIED.check(ip, "ipv6") ? "denied" : PRIVATE.check(ip, "ipv6") ? "private" : "public";
    const groups = ipv6Groups(ip);
    const v4 = groups && embeddedIPv4(groups);
    if (v4) {
      const inner = classify(v4);
      if (WORSE[inner] > WORSE[verdict]) verdict = inner;
    }
  }
  return verdict;
}

// ─── The operator's allowlist ────────────────────────────────────────────────

interface AllowEntry {
  text: string;
  list: net.BlockList;
  ports: number | null;
}

function ipToBigInt(ip: string): bigint {
  // BigInt() calls, not literals: the project's TypeScript target predates BigInt literals.
  if (net.isIPv4(ip)) return ip.split(".").reduce((n, o) => (n << BigInt(8)) | BigInt(o), BigInt(0));
  const groups = ipv6Groups(ip)!;
  return groups.reduce((n, g) => (n << BigInt(16)) | BigInt(g), BigInt(0));
}

function bigIntToIp(n: bigint, family: 4 | 6): string {
  if (family === 4) return [24, 16, 8, 0].map((s) => String((n >> BigInt(s)) & BigInt(255))).join(".");
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) groups.push(((n >> BigInt(i * 16)) & BigInt(0xffff)).toString(16));
  return groups.join(":");
}

/**
 * Parses ASTRA_ALLOWED_PRIVATE_CIDRS: comma or whitespace separated entries of
 * `<address>[/<prefix>][@<port>]`. Throws on anything it can't read, and on an
 * entry that reaches outside private address space.
 */
export function parseAllowedPrivateCidrs(raw: string | undefined): AllowEntry[] {
  const entries: AllowEntry[] = [];
  for (const token of (raw ?? "").split(/[\s,]+/).filter(Boolean)) {
    const [spec, portText, ...extra] = token.split("@");
    if (extra.length > 0) throw new Error(`"${token}": more than one @port.`);
    const [addr, prefixText, ...more] = spec.split("/");
    if (more.length > 0) throw new Error(`"${token}": more than one /prefix.`);
    const family = net.isIP(addr);
    if (family === 0) throw new Error(`"${token}": "${addr}" is not an IP address.`);
    const max = family === 4 ? 32 : 128;
    const prefix = prefixText === undefined ? max : Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > max || (prefixText !== undefined && !/^\d+$/.test(prefixText))) {
      throw new Error(`"${token}": prefix must be a whole number from 0 to ${max}.`);
    }
    let ports: number | null = null;
    if (portText !== undefined) {
      if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new Error(`"${token}": port must be 1-65535.`);
      ports = Number(portText);
    }
    // The whole range must be private space: both its first and last address.
    const bits = BigInt(max);
    const one = BigInt(1);
    const full = (one << bits) - one;
    const mask = prefix === 0 ? BigInt(0) : full ^ ((one << (bits - BigInt(prefix))) - one);
    const first = ipToBigInt(addr) & mask;
    const last = first | (full ^ mask);
    const fam: 4 | 6 = family === 4 ? 4 : 6;
    for (const edge of [first, last]) {
      if (classify(bigIntToIp(edge, fam)) !== "private") {
        throw new Error(`"${token}" is not entirely private address space (it covers ${bigIntToIp(edge, fam)}), so it cannot be allowlisted.`);
      }
    }
    const list = new net.BlockList();
    list.addSubnet(bigIntToIp(first, fam), prefix, fam === 4 ? "ipv4" : "ipv6");
    entries.push({ text: token, list, ports });
  }
  return entries;
}

let cachedRaw: string | undefined;
let cachedEntries: AllowEntry[] = [];

function allowEntries(): AllowEntry[] {
  const raw = process.env.ASTRA_ALLOWED_PRIVATE_CIDRS;
  if (raw !== cachedRaw) {
    cachedEntries = parseAllowedPrivateCidrs(raw);
    cachedRaw = raw;
  }
  return cachedEntries;
}

/** Problems with the outbound policy in the environment, for the boot-time check. */
export function validateOutboundPolicyEnv(): string[] {
  try {
    parseAllowedPrivateCidrs(process.env.ASTRA_ALLOWED_PRIVATE_CIDRS);
    return [];
  } catch (e: any) {
    return [`ASTRA_ALLOWED_PRIVATE_CIDRS is invalid: ${e.message}`];
  }
}

/** A line for the startup log, or null when no private range is allowed. */
export function describeOutboundPolicy(): string | null {
  const entries = allowEntries();
  return entries.length > 0 ? `outbound_private_allowlist=${entries.map((e) => e.text).join(",")}` : null;
}

const logged = new Set<string>();

function permitted(address: string, port: number, host: string): boolean {
  const verdict = classify(address);
  if (verdict === "public") return true;
  if (verdict === "denied") return false;
  const bare = address.split("%")[0];
  // An IPv4-mapped IPv6 address is the IPv4 address it carries, as far as the operator's list is concerned.
  const groups = net.isIPv6(bare) ? ipv6Groups(bare) : null;
  const mapped = groups && groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff ? v4FromGroups(groups[6], groups[7]) : null;
  const subject = mapped ?? bare;
  const family = net.isIPv4(subject) ? "ipv4" : "ipv6";
  const hit = allowEntries().find((e) => (e.ports === null || e.ports === port) && e.list.check(subject, family));
  if (!hit) return false;
  const key = `${host}:${port}:${bare}`;
  if (!logged.has(key)) {
    logged.add(key);
    console.info(`[outbound] allowing private target ${host}:${port} (${bare}) via ASTRA_ALLOWED_PRIVATE_CIDRS entry "${hit.text}"`);
  }
  return true;
}

// ─── Validation and resolution ───────────────────────────────────────────────

export interface UrlSafetyResult {
  ok: boolean;
  reason?: string;
}

export interface OutboundTarget {
  url: URL;
  hostname: string;
  port: number;
  /** Every address the name resolved to; all of them passed the policy. */
  addresses: Array<{ address: string; family: 4 | 6 }>;
}

/**
 * Validates a URL and resolves it once. http(s) only, not a blocked hostname,
 * and every address it resolves to must be public or on the operator's list.
 */
export async function resolveOutboundTarget(rawUrl: string): Promise<OutboundTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Protocol "${url.protocol}" is not allowed — only http/https.`);
  }
  // The URL parser keeps the brackets on an IPv6 literal, and a trailing dot is the same host.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError(`Host "${hostname}" is not reachable from this action.`);
  }
  const literal = net.isIP(hostname);
  if (literal) {
    if (!permitted(hostname, port, hostname)) throw new UnsafeUrlError(`Host "${hostname}" resolves to a private/internal address.`);
    return { url, hostname, port, addresses: [{ address: hostname, family: literal === 4 ? 4 : 6 }] };
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host "${hostname}".`);
  }
  if (!records || records.length === 0) throw new UnsafeUrlError(`Could not resolve host "${hostname}".`);
  for (const r of records) {
    if (!permitted(r.address, port, hostname)) {
      throw new UnsafeUrlError(`Host "${hostname}" resolves to a private/internal address (${r.address}).`);
    }
  }
  return { url, hostname, port, addresses: records.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 })) };
}

/** Throws UnsafeUrlError unless the URL is safe to fetch server-side. */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  await resolveOutboundTarget(rawUrl);
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

// ─── safeFetch ───────────────────────────────────────────────────────────────

/** A connect-time lookup that can only answer with the addresses already validated. */
export function pinnedLookup(addresses: Array<{ address: string; family: 4 | 6 }>) {
  return (_hostname: string, options: any, callback: (...args: any[]) => void) => {
    const wanted = options?.family === 4 || options?.family === 6 ? options.family : null;
    const usable = wanted ? addresses.filter((a) => a.family === wanted) : addresses;
    if (usable.length === 0) return callback(new Error("No validated address for this connection."));
    if (options?.all) return callback(null, usable.map((a) => ({ address: a.address, family: a.family })));
    return callback(null, usable[0].address, usable[0].family);
  };
}

// One Agent per hop, holding no idle sockets: the connection belongs to the address validated for this hop.
function pinnedAgent(addresses: OutboundTarget["addresses"]): Agent {
  return new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1, connect: { lookup: pinnedLookup(addresses) as any } });
}

const KEPT_ON_CROSS_ORIGIN_REDIRECT = new Set(["accept", "accept-language", "accept-encoding", "user-agent", "content-type"]);

/**
 * fetch for a URL the caller doesn't control. The name is resolved and judged once, the connection
 * goes to the address that was judged, and a redirect is followed (GET and HEAD only) only after
 * its target has been judged the same way. A redirect to another origin drops every header except
 * a few harmless ones, so credentials aimed at one host are not handed to another. For other
 * methods a redirect response is returned as it is.
 */
export async function safeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const followRedirects = (method === "GET" || method === "HEAD") && init.redirect !== "manual" && init.redirect !== "error";
  let url = String(input);
  let headers = new Headers(init.headers as any);
  for (let hop = 0; ; hop++) {
    const target = await resolveOutboundTarget(url);
    const response = (await undiciFetch(target.url, {
      ...(init as any),
      headers,
      dispatcher: pinnedAgent(target.addresses),
      redirect: "manual",
    })) as unknown as Response;
    const redirected = response.status >= 300 && response.status < 400 && response.headers.get("location");
    if (!redirected) return response;
    if (init.redirect === "error") throw new UnsafeUrlError("The server answered with a redirect.");
    if (!followRedirects) return response;
    await response.body?.cancel().catch(() => undefined);
    if (hop >= MAX_REDIRECTS) throw new UnsafeUrlError("Too many redirects.");
    const next = new URL(redirected, target.url);
    if (next.origin !== target.url.origin) {
      const kept = new Headers();
      headers.forEach((value, key) => { if (KEPT_ON_CROSS_ORIGIN_REDIRECT.has(key.toLowerCase())) kept.set(key, value); });
      headers = kept;
    }
    url = next.href;
  }
}
