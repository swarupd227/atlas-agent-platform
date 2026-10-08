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
 * Applied, always, to fetches whose URL a person or a caller supplies.
 *
 * MCP servers and rest-proxy connectors are different: an admin registering a
 * connector against an internal endpoint is intended product behavior, and this
 * platform's own connectors are reached on localhost. They follow the same rules
 * under ASTRA_OUTBOUND_POLICY (policyFetch, vetMcpUrl): "audit" by default, which
 * logs what "enforce" would refuse and refuses nothing, so a deployment can read
 * what enforcing would break before it does. In enforce, loopback is allowed only
 * on this server's own port (or anywhere under SECURITY_MODE=demo), and private
 * ranges need the same allowlist.
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

export type OutboundPolicyMode = "off" | "audit" | "enforce";

/**
 * ASTRA_OUTBOUND_POLICY: how the operator-configured MCP and rest-proxy targets are treated.
 * "enforce" refuses a target the policy refuses. "audit" (the default) changes nothing and logs
 * each target "enforce" would have refused, so a deployment can read what it would break before
 * turning enforcement on. "off" does neither. The paths that fetch a URL a person supplies are
 * always enforced, whatever this says.
 */
export function outboundPolicyMode(): OutboundPolicyMode {
  const raw = (process.env.ASTRA_OUTBOUND_POLICY ?? "").trim().toLowerCase();
  if (raw === "") return "audit";
  if (raw === "off" || raw === "audit" || raw === "enforce") return raw;
  throw new Error(`must be off, audit or enforce (got "${raw}")`);
}

/** Problems with the outbound policy in the environment, for the boot-time check. */
export function validateOutboundPolicyEnv(): string[] {
  const problems: string[] = [];
  try {
    parseAllowedPrivateCidrs(process.env.ASTRA_ALLOWED_PRIVATE_CIDRS);
  } catch (e: any) {
    problems.push(`ASTRA_ALLOWED_PRIVATE_CIDRS is invalid: ${e.message}`);
  }
  try {
    outboundPolicyMode();
  } catch (e: any) {
    problems.push(`ASTRA_OUTBOUND_POLICY is invalid: ${e.message}`);
  }
  return problems;
}

/** A line for the startup log. */
export function describeOutboundPolicy(): string {
  const entries = allowEntries();
  const allow = entries.length > 0 ? ` outbound_private_allowlist=${entries.map((e) => e.text).join(",")}` : "";
  return `outbound_policy=${outboundPolicyMode()}${allow}`;
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

export interface OutboundOptions {
  /**
   * "deny" (the default): loopback is never reachable. "self": `localhost` or a literal loopback
   * address is reachable on this server's own port, which is how the in-process connectors are
   * reached, and on any port when SECURITY_MODE=demo. A hostname that merely resolves to loopback
   * is never allowed. For the operator-configured MCP and rest-proxy targets.
   */
  loopback?: "deny" | "self";
}

function isLoopbackLiteral(ip: string): boolean {
  if (net.isIPv4(ip)) return ip.startsWith("127.");
  const g = ipv6Groups(ip);
  return !!g && g.slice(0, 7).every((x) => x === 0) && g[7] === 1;
}

function loopbackAllowed(port: number): boolean {
  if (process.env.SECURITY_MODE === "demo") return true;
  return port === parseInt(process.env.PORT || "5000", 10);
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
export async function resolveOutboundTarget(rawUrl: string, options: OutboundOptions = {}): Promise<OutboundTarget> {
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
  const literal = net.isIP(hostname);
  if (options.loopback === "self" && (hostname === "localhost" || (literal && isLoopbackLiteral(hostname)))) {
    if (!loopbackAllowed(port)) {
      throw new UnsafeUrlError(`Host "${hostname}" is not reachable: loopback is only allowed on this server's own port.`);
    }
    const address = literal ? hostname : "127.0.0.1";
    return { url, hostname, port, addresses: [{ address, family: address.includes(":") ? 6 : 4 }] };
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError(`Host "${hostname}" is not reachable from this action.`);
  }
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

// A connection belongs to the addresses validated for it, so agents are kept per
// (origin, validated address set). An MCP session makes many requests to one host and should not
// pay a new TCP and TLS handshake for each; a changed DNS answer is a different key and gets a new
// agent at once, and an agent is retired after AGENT_TTL_MS in any case.
const AGENT_TTL_MS = 30_000;
const AGENT_CACHE_MAX = 256;
const agentCache = new Map<string, { agent: Agent; expires: number }>();

function retire(agent: Agent): void {
  // close() waits for requests in flight to finish.
  void Promise.resolve(agent.close()).catch(() => undefined);
}

function pinnedAgent(target: OutboundTarget): Agent {
  const key = `${target.url.protocol}//${target.hostname}:${target.port}|${target.addresses.map((a) => a.address).sort().join(",")}`;
  const now = Date.now();
  const hit = agentCache.get(key);
  if (hit && hit.expires > now) return hit.agent;
  if (hit) { agentCache.delete(key); retire(hit.agent); }
  if (agentCache.size >= AGENT_CACHE_MAX) {
    const oldest = agentCache.keys().next().value as string;
    retire(agentCache.get(oldest)!.agent);
    agentCache.delete(oldest);
  }
  const agent = new Agent({ keepAliveTimeout: 10_000, keepAliveMaxTimeout: 30_000, connect: { lookup: pinnedLookup(target.addresses) as any } });
  agentCache.set(key, { agent, expires: now + AGENT_TTL_MS });
  return agent;
}

/** For tests: forget every cached agent. */
export function resetOutboundAgentsForTests(): void {
  agentCache.forEach(({ agent }) => retire(agent));
  agentCache.clear();
}

const KEPT_ON_CROSS_ORIGIN_REDIRECT = new Set(["accept", "accept-language", "accept-encoding", "user-agent", "content-type"]);

/**
 * fetch for a URL the caller doesn't control. The name is resolved and judged once, the connection
 * goes to the address that was judged, and a redirect is followed (GET and HEAD only) only after
 * its target has been judged the same way. A redirect to another origin drops every header except
 * a few harmless ones, so credentials aimed at one host are not handed to another. For other
 * methods a redirect response is returned as it is.
 */
export async function safeFetch(input: string | URL, init: RequestInit = {}, options: OutboundOptions = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const followRedirects = (method === "GET" || method === "HEAD") && init.redirect !== "manual" && init.redirect !== "error";
  let url = String(input);
  let headers = new Headers(init.headers as any);
  for (let hop = 0; ; hop++) {
    const target = await resolveOutboundTarget(url, options);
    const response = (await undiciFetch(target.url, {
      ...(init as any),
      headers,
      dispatcher: pinnedAgent(target),
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

// ─── Operator-configured targets (MCP servers, rest-proxy connectors) ────────

const auditSeen = new Set<string>();

function hostPort(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || (u.protocol === "https:" ? 443 : 80)}`;
  } catch {
    return url.slice(0, 80);
  }
}

/** Logs, once per label and target, what "enforce" would refuse. Never delays or fails the call. */
function auditOutbound(url: string, label: string): void {
  void (async () => {
    try {
      await resolveOutboundTarget(url, { loopback: "self" });
    } catch (e: any) {
      // A name that does not resolve is not a policy question: the call fails on its own.
      if (!(e instanceof UnsafeUrlError) || /^Could not resolve/.test(e.message)) return;
      const key = `${label}|${hostPort(url)}`;
      if (auditSeen.has(key)) return;
      if (auditSeen.size > 2000) auditSeen.clear();
      auditSeen.add(key);
      console.warn(`[outbound-policy] audit: ASTRA_OUTBOUND_POLICY=enforce would refuse ${label} -> ${hostPort(url)}: ${e.message}`);
    }
  })();
}

/**
 * The fetch for an operator-configured target. In "enforce" it is safeFetch with loopback limited
 * to this server's own port; in "audit" it is the ordinary fetch plus a log of what enforce would
 * refuse; in "off" it is the ordinary fetch. The mode is read per call, so it can be changed
 * without rebuilding a client.
 */
export function policyFetch(label: string): (input: string | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const mode = outboundPolicyMode();
    if (mode === "enforce") return safeFetch(input, init, { loopback: "self" });
    if (mode === "audit") auditOutbound(String(input), label);
    return fetch(input, init);
  };
}

/**
 * Judges an MCP server URL when it is registered or edited. A definite violation is refused in
 * "enforce" and logged in "audit". A URL that is not http(s), or a name that does not resolve
 * (which says nothing about where it would point), is let through.
 */
export async function vetMcpUrl(rawUrl: string, label: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const mode = outboundPolicyMode();
  if (mode === "off") return { ok: true };
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: true };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: true };
  try {
    await resolveOutboundTarget(rawUrl, { loopback: "self" });
    return { ok: true };
  } catch (e: any) {
    if (!(e instanceof UnsafeUrlError) || /^Could not resolve/.test(e.message)) return { ok: true };
    if (mode === "enforce") return { ok: false, message: e.message };
    auditOutbound(rawUrl, label);
    return { ok: true };
  }
}
/**
 * The headers to send when following a job status URL. The URL comes from the remote service's own
 * response, and it may be absolute, so it can name a different host than the connector's. The
 * connector's credentials are for the connector's origin: sent to any other host, they would hand
 * them to whatever the response said. A status URL on another origin is followed without them.
 */
export function credentialsForStatusUrl(pollUrl: string, baseUrl: string, headers: Record<string, string>): Record<string, string> {
  try {
    if (new URL(pollUrl).origin === new URL(baseUrl).origin) return headers;
  } catch { /* an unparseable URL gets no credentials either */ }
  if (Object.keys(headers).length > 0) {
    console.warn(`[tool-dispatcher] job status URL is on a different origin than the connector; following it without the connector's credentials`);
  }
  return {};
}
