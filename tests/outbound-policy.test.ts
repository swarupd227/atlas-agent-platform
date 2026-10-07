/**
 * The outbound policy: what an address is, what an operator may allow, and what
 * safeFetch will actually connect to.
 *
 * Pure/offline: DNS is mocked and undici is replaced by a recorder, so the tests
 * can read the address a connection would be made to and the hops a redirect
 * takes without a network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ fetchMock: vi.fn(), agents: [] as any[] }));

vi.mock("dns/promises", () => ({ default: { lookup: vi.fn() }, lookup: vi.fn() }));
vi.mock("undici", () => ({
  Agent: class { opts: any; constructor(opts: any) { this.opts = opts; h.agents.push(this); } },
  fetch: (...args: any[]) => h.fetchMock(...args),
}));

import dns from "dns/promises";
import {
  UnsafeUrlError, assertSafeOutboundUrl, describeOutboundPolicy, parseAllowedPrivateCidrs, safeFetch, validateOutboundPolicyEnv,
} from "../server/url-safety";

const ENV = "ASTRA_ALLOWED_PRIVATE_CIDRS";
const saved = process.env[ENV];
beforeEach(() => {
  delete process.env[ENV];
  vi.mocked(dns.lookup).mockReset();
  h.fetchMock.mockReset();
  h.agents.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved;
  vi.restoreAllMocks();
});

const refused = (url: string) => expect(assertSafeOutboundUrl(url)).rejects.toThrow(UnsafeUrlError);
const allowed = (url: string) => expect(assertSafeOutboundUrl(url)).resolves.toBeUndefined();
const resolvesTo = (...addresses: string[]) =>
  vi.mocked(dns.lookup).mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as any);

describe("addresses that can never be reached, whatever the configuration", () => {
  const denied = [
    "http://127.0.0.1/", "http://127.255.255.254/", "http://169.254.169.254/latest/meta-data/", "http://0.0.0.0/",
    "http://224.0.0.1/", "http://255.255.255.255/", "http://100.100.100.200/",
    "http://[::]/", "http://[::1]/", "http://[fe80::1]/", "http://[ff02::1]/", "http://[fd00:ec2::254]/",
  ];
  for (const url of denied) it(`refuses ${url}`, async () => { await refused(url); });

  it("refuses them even when the operator lists the private space around them", async () => {
    process.env[ENV] = "100.64.0.0/10,fc00::/7";
    await refused("http://100.100.100.200/");
    await refused("http://[fd00:ec2::254]/");
  });

  it("refuses numeric spellings of loopback", async () => {
    await refused("http://2130706433/");
    await refused("http://0x7f.1/");
    await refused("http://0177.0.0.1/");
  });

  it("refuses localhost however it is written, on the name alone", async () => {
    resolvesTo("93.184.216.34"); // a resolver that would let any of them through
    await refused("http://LOCALHOST/");
    await refused("http://localhost./");
    await refused("http://api.localhost/");
    await refused("http://metadata.google.internal/");
  });
});

describe("addresses that an IPv6 address carries inside it", () => {
  it("is judged by the IPv4 address inside, in the hex form the URL parser produces", async () => {
    await refused("http://[::ffff:127.0.0.1]/");   // becomes ::ffff:7f00:1
    await refused("http://[::ffff:169.254.169.254]/");
    await refused("http://[::ffff:10.0.0.1]/");
    await refused("http://[::127.0.0.1]/");
    await refused("http://[64:ff9b::7f00:1]/");     // NAT64
    await refused("http://[2002:7f00:1::1]/");      // 6to4 of 127.0.0.1
    await refused("http://[2002:a00:1::]/");        // 6to4 of 10.0.0.1
  });

  it("lets an embedded public address through", async () => {
    await allowed("http://[::ffff:8.8.8.8]/");
    await allowed("http://[64:ff9b::808:808]/");
  });
});

describe("private ranges are refused until an operator lists them", () => {
  const priv = [
    "http://10.0.0.1/", "http://172.16.0.1/", "http://172.31.255.255/", "http://192.168.1.1/", "http://100.64.0.1/",
    "http://198.18.0.1/", "http://192.0.2.1/", "http://203.0.113.9/", "http://[fc00::1]/", "http://[fd12::1]/", "http://[2001:db8::1]/",
  ];
  for (const url of priv) it(`refuses ${url}`, async () => { await refused(url); });

  it("allows public addresses", async () => {
    await allowed("http://8.8.8.8/");
    await allowed("http://[2606:4700:4700::1111]/");
  });

  it("refuses a name when ANY of its addresses is not permitted", async () => {
    resolvesTo("93.184.216.34", "10.1.2.3");
    await refused("http://mixed.example.com/");
  });

  it("refuses a name that does not resolve", async () => {
    vi.mocked(dns.lookup).mockRejectedValue(new Error("ENOTFOUND"));
    await refused("http://nowhere.example.com/");
  });
});

describe("the operator's allowlist", () => {
  it("allows the listed range and nothing around it", async () => {
    process.env[ENV] = "10.20.0.0/16";
    await allowed("http://10.20.1.5/");
    await allowed("http://10.20.255.255:8080/");
    await refused("http://10.21.0.1/");
    await refused("http://10.19.255.255/");
    await refused("http://192.168.1.1/");
  });

  it("scopes an entry to a port when one is given", async () => {
    process.env[ENV] = "10.30.4.7@8443";
    await allowed("http://10.30.4.7:8443/");
    await allowed("https://10.30.4.7:8443/x");
    await refused("http://10.30.4.7:443/");
    await refused("https://10.30.4.7/");        // default 443
    await refused("http://10.30.4.7/");         // default 80
    await refused("http://10.30.4.8:8443/");
  });

  it("takes a single address, several entries, and IPv6", async () => {
    process.env[ENV] = "10.1.1.1, 172.20.0.0/14\n fd12:3456::/32";
    await allowed("http://10.1.1.1/");
    await allowed("http://172.22.9.9/");
    await allowed("http://[fd12:3456::9]/");
    await refused("http://10.1.1.2/");
    await refused("http://172.24.0.1/");
    await refused("http://[fd12:3457::1]/");
  });

  it("applies to a hostname that resolves into the listed range, and only if all its addresses are", async () => {
    process.env[ENV] = "10.20.0.0/16";
    resolvesTo("10.20.4.4");
    await allowed("http://vm.hilti.internal:8080/");
    resolvesTo("10.20.4.4", "10.99.0.1");
    await refused("http://vm.hilti.internal:8080/");
  });

  it("treats an IPv4-mapped IPv6 address as the IPv4 address for the list", async () => {
    process.env[ENV] = "10.20.0.0/16";
    await allowed("http://[::ffff:10.20.1.5]/");
    await refused("http://[::ffff:10.21.0.1]/");
  });

  it("is re-read when the setting changes", async () => {
    process.env[ENV] = "10.20.0.0/16";
    await allowed("http://10.20.1.5/");
    process.env[ENV] = "10.30.0.0/16";
    await refused("http://10.20.1.5/");
    delete process.env[ENV];
    await refused("http://10.30.1.5/");
  });
});

describe("what an operator cannot list", () => {
  const cannot = [
    "127.0.0.0/8", "127.0.0.1", "169.254.169.254", "169.254.0.0/16", "100.100.100.200", "0.0.0.0/0", "0.0.0.0/8", "224.0.0.0/4",
    "::1", "fe80::/10", "fd00:ec2::254",
    "10.0.0.0/4",        // starts in "this network"
    "10.0.0.0/7",        // 11.x is public
    "172.16.0.0/11",     // ends in public space
    "100.64.0.0/9",      // starts in public space
    "8.8.8.0/24", "1.1.1.1", "2606:4700::/32",
  ];
  for (const entry of cannot) it(`rejects ${entry}`, () => { expect(() => parseAllowedPrivateCidrs(entry)).toThrow(/private|not entirely/i); });

  const malformed = ["banana", "10.0.0.0/33", "10.0.0.0/x", "10.0.0.0/-1", "10.0.0.1@0", "10.0.0.1@70000", "10.0.0.1@http", "10.0.0.0/8@80@90", "10.0.0.0/8/9", "10.0.0/8"];
  for (const entry of malformed) it(`rejects the malformed entry ${entry}`, () => { expect(() => parseAllowedPrivateCidrs(entry)).toThrow(); });

  it("accepts nothing as nothing", () => {
    expect(parseAllowedPrivateCidrs(undefined)).toEqual([]);
    expect(parseAllowedPrivateCidrs("  ,  ")).toEqual([]);
  });

  it("is reported at boot, not at the first request", () => {
    expect(validateOutboundPolicyEnv()).toEqual([]);
    process.env[ENV] = "10.0.0.0/8";
    expect(validateOutboundPolicyEnv()).toEqual([]);
    expect(describeOutboundPolicy()).toBe("outbound_private_allowlist=10.0.0.0/8");
    process.env[ENV] = "127.0.0.0/8";
    expect(validateOutboundPolicyEnv()[0]).toMatch(/ASTRA_ALLOWED_PRIVATE_CIDRS is invalid/);
    process.env[ENV] = "oops";
    expect(validateOutboundPolicyEnv()[0]).toMatch(/not an IP address/);
  });

  it("is silent about a policy that isn't set", () => {
    expect(describeOutboundPolicy()).toBeNull();
  });

  it("stops the server at boot when the setting is invalid", () => {
    const config = readFileSync("server/config.ts", "utf8");
    expect(config).toContain("errors.push(...validateOutboundPolicyEnv());");
    // ...and that happens before the check that turns errors into an exit.
    expect(config.indexOf("validateOutboundPolicyEnv()")).toBeLessThan(config.indexOf("if (errors.length > 0)"));
  });
});

describe("safeFetch connects to the address it validated", () => {
  const ok = () => ({ status: 200, headers: new Headers(), body: { cancel: async () => {} } });
  const redirect = (to: string, status = 302) => ({ status, headers: new Headers({ location: to }), body: { cancel: vi.fn(async () => {}) } });

  it("asks undici to connect through a lookup that only knows the validated addresses", async () => {
    resolvesTo("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946");
    h.fetchMock.mockResolvedValue(ok());
    await safeFetch("https://example.com/page", { method: "GET" });

    const lookup = h.agents[0].opts.connect.lookup;
    const all = await new Promise<any>((res) => lookup("example.com", { all: true }, (_e: any, v: any) => res(v)));
    expect(all).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const one = await new Promise<any>((res) => lookup("example.com", {}, (_e: any, a: string, f: number) => res([a, f])));
    expect(one).toEqual(["93.184.216.34", 4]);
    const v6 = await new Promise<any>((res) => lookup("example.com", { family: 6 }, (_e: any, a: string, f: number) => res([a, f])));
    expect(v6).toEqual(["2606:2800:220:1:248:1893:25c8:1946", 6]);
  });

  it("does not resolve again at connect time, so a changed DNS answer cannot redirect the connection", async () => {
    vi.mocked(dns.lookup)
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as any)
      .mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as any); // what an attacker's DNS says the second time
    h.fetchMock.mockResolvedValue(ok());
    await safeFetch("https://rebind.example.com/");

    const lookup = h.agents[0].opts.connect.lookup;
    const addr = await new Promise<string>((res) => lookup("rebind.example.com", {}, (_e: any, a: string) => res(a)));
    expect(addr).toBe("93.184.216.34");
    expect(dns.lookup).toHaveBeenCalledTimes(1);
  });

  it("refuses an unsafe URL before anything is sent", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(UnsafeUrlError);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it("hands redirect handling to itself, not to undici", async () => {
    resolvesTo("93.184.216.34");
    h.fetchMock.mockResolvedValue(ok());
    await safeFetch("https://example.com/", { headers: { "X-Test": "1" } });
    const init = h.fetchMock.mock.calls[0][1];
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBe(h.agents[0]);
    expect(new Headers(init.headers).get("x-test")).toBe("1");
  });

  it("refuses a redirect to an internal address, and never connects to it", async () => {
    resolvesTo("93.184.216.34");
    const r = redirect("http://169.254.169.254/latest/meta-data/");
    h.fetchMock.mockResolvedValueOnce(r);
    await expect(safeFetch("https://example.com/")).rejects.toThrow(UnsafeUrlError);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(r.body.cancel).toHaveBeenCalled();
  });

  it("follows a redirect to a public address, judging and pinning that hop on its own", async () => {
    vi.mocked(dns.lookup).mockImplementation((async (host: string) => [{ address: host === "a.example.com" ? "93.184.216.34" : "1.1.1.1", family: 4 }]) as any);
    h.fetchMock.mockResolvedValueOnce(redirect("https://b.example.com/next")).mockResolvedValueOnce(ok());
    const res = await safeFetch("https://a.example.com/");
    expect(res.status).toBe(200);
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
    expect(String(h.fetchMock.mock.calls[1][0])).toBe("https://b.example.com/next");
    expect(h.agents).toHaveLength(2);
    const second = await new Promise<string>((r) => h.agents[1].opts.connect.lookup("b.example.com", {}, (_e: any, a: string) => r(a)));
    expect(second).toBe("1.1.1.1");
  });

  it("keeps its headers across a same-origin redirect and drops them on a cross-origin one", async () => {
    resolvesTo("93.184.216.34");
    const headers = { Authorization: "Bearer secret", "X-API-Key": "k", Cookie: "s=1", "User-Agent": "ua", Accept: "application/json" };
    h.fetchMock.mockResolvedValueOnce(redirect("/same")).mockResolvedValueOnce(redirect("https://other.example.com/x")).mockResolvedValueOnce(ok());
    await safeFetch("https://a.example.com/", { headers });
    const seen = h.fetchMock.mock.calls.map((c) => new Headers(c[1].headers));
    expect(seen[1].get("authorization")).toBe("Bearer secret");      // same origin
    expect(seen[1].get("x-api-key")).toBe("k");
    expect(seen[2].get("authorization")).toBeNull();                 // other origin
    expect(seen[2].get("x-api-key")).toBeNull();
    expect(seen[2].get("cookie")).toBeNull();
    expect(seen[2].get("user-agent")).toBe("ua");
    expect(seen[2].get("accept")).toBe("application/json");
  });

  it("stops after too many redirects", async () => {
    resolvesTo("93.184.216.34");
    h.fetchMock.mockImplementation(async () => redirect("https://example.com/again"));
    await expect(safeFetch("https://example.com/")).rejects.toThrow(/Too many redirects/);
    expect(h.fetchMock.mock.calls.length).toBe(6);
  });

  it("does not follow a redirect for a request that carries a body, and hands the 3xx back", async () => {
    resolvesTo("93.184.216.34");
    h.fetchMock.mockResolvedValue(redirect("https://example.com/elsewhere", 307));
    const res = await safeFetch("https://example.com/hook", { method: "POST", body: "{}" });
    expect(res.status).toBe(307);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("raises on a redirect when the caller asked for redirect: error", async () => {
    resolvesTo("93.184.216.34");
    h.fetchMock.mockResolvedValue(redirect("https://example.com/elsewhere"));
    await expect(safeFetch("https://example.com/", { redirect: "error" })).rejects.toThrow(UnsafeUrlError);
  });

  it("connects to an allowlisted private address when the operator listed it", async () => {
    process.env[ENV] = "10.20.0.0/16@8080";
    h.fetchMock.mockResolvedValue(ok());
    await safeFetch("http://10.20.4.4:8080/health");
    const addr = await new Promise<string>((r) => h.agents[0].opts.connect.lookup("10.20.4.4", {}, (_e: any, a: string) => r(a)));
    expect(addr).toBe("10.20.4.4");
    await expect(safeFetch("http://10.20.4.4:9090/health")).rejects.toThrow(UnsafeUrlError);
  });
});
