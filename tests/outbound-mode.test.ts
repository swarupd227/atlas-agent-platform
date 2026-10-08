/**
 * ASTRA_OUTBOUND_POLICY: how the targets an admin configures (MCP servers, rest-proxy connectors)
 * are treated. "audit" (the default) must change nothing and say what "enforce" would refuse;
 * "enforce" must refuse it; "off" must do neither. Also: where loopback is allowed, what a
 * registration is judged by, and the agents safeFetch keeps.
 *
 * Offline: DNS is mocked, undici is a recorder, and the global fetch is stubbed so each mode can
 * be told apart by which of the two a call reached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ fetchMock: vi.fn(), agents: [] as any[] }));

vi.mock("dns/promises", () => ({ default: { lookup: vi.fn() }, lookup: vi.fn() }));
vi.mock("undici", () => ({
  Agent: class { opts: any; close = vi.fn(async () => {}); constructor(opts: any) { this.opts = opts; h.agents.push(this); } },
  fetch: (...args: any[]) => h.fetchMock(...args),
}));

import dns from "dns/promises";
import {
  UnsafeUrlError, credentialsForStatusUrl, outboundPolicyMode, policyFetch, resetOutboundAgentsForTests, resolveOutboundTarget, safeFetch,
  validateOutboundPolicyEnv, vetMcpUrl,
} from "../server/url-safety";

const KEYS = ["ASTRA_OUTBOUND_POLICY", "ASTRA_ALLOWED_PRIVATE_CIDRS", "PORT", "SECURITY_MODE"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

const globalFetch = vi.fn();
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  process.env.PORT = "8080";
  vi.mocked(dns.lookup).mockReset();
  h.fetchMock.mockReset();
  h.agents.length = 0;
  resetOutboundAgentsForTests();
  globalFetch.mockReset().mockResolvedValue({ status: 200 } as any);
  vi.stubGlobal("fetch", globalFetch);
  vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  h.fetchMock.mockResolvedValue({ status: 200, headers: new Headers(), body: { cancel: async () => {} } });
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const resolvesTo = (...addresses: string[]) =>
  vi.mocked(dns.lookup).mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as any);
const flush = () => new Promise((r) => setTimeout(r, 0));
const audited = () => warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("[outbound-policy] audit"));

describe("the mode", () => {
  it("is audit unless set", () => {
    expect(outboundPolicyMode()).toBe("audit");
    process.env.ASTRA_OUTBOUND_POLICY = "";
    expect(outboundPolicyMode()).toBe("audit");
  });

  it("reads off, audit and enforce in any case, ignoring spaces", () => {
    for (const [raw, mode] of [["off", "off"], [" ENFORCE ", "enforce"], ["Audit", "audit"]] as const) {
      process.env.ASTRA_OUTBOUND_POLICY = raw;
      expect(outboundPolicyMode()).toBe(mode);
    }
  });

  it("rejects anything else, and says so at boot", () => {
    process.env.ASTRA_OUTBOUND_POLICY = "strict";
    expect(() => outboundPolicyMode()).toThrow(/off, audit or enforce/);
    expect(validateOutboundPolicyEnv()).toEqual([expect.stringMatching(/ASTRA_OUTBOUND_POLICY is invalid.*strict/)]);
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    expect(validateOutboundPolicyEnv()).toEqual([]);
  });
});

describe("loopback for an admin-configured target", () => {
  const target = (url: string) => resolveOutboundTarget(url, { loopback: "self" });

  it("is reachable on this server's own port, as localhost or a literal", async () => {
    await expect(target("http://localhost:8080/api/mock/x")).resolves.toMatchObject({ addresses: [{ address: "127.0.0.1", family: 4 }] });
    await expect(target("http://127.0.0.1:8080/")).resolves.toMatchObject({ addresses: [{ address: "127.0.0.1" }] });
    await expect(target("http://127.9.9.9:8080/")).resolves.toBeTruthy();
    await expect(target("http://[::1]:8080/")).resolves.toMatchObject({ addresses: [{ address: "::1", family: 6 }] });
  });

  it("follows PORT", async () => {
    process.env.PORT = "5000";
    await expect(target("http://localhost:5000/")).resolves.toBeTruthy();
    await expect(target("http://localhost:8080/")).rejects.toThrow(UnsafeUrlError);
    delete process.env.PORT;                           // the server's own default is 5000
    await expect(target("http://localhost:5000/")).resolves.toBeTruthy();
  });

  it("is not reachable on any other port", async () => {
    await expect(target("http://localhost:9090/")).rejects.toThrow(/own port/);
    await expect(target("http://127.0.0.1:8931/")).rejects.toThrow(UnsafeUrlError);
    await expect(target("http://[::1]:22/")).rejects.toThrow(UnsafeUrlError);
    await expect(target("http://localhost/")).rejects.toThrow(UnsafeUrlError);   // port 80
  });

  it("is reachable on any port in demo mode", async () => {
    process.env.SECURITY_MODE = "demo";
    await expect(target("http://localhost:9090/")).resolves.toBeTruthy();
    process.env.SECURITY_MODE = "production";
    await expect(target("http://localhost:9090/")).rejects.toThrow(UnsafeUrlError);
  });

  it("is never reachable without asking for it", async () => {
    await expect(resolveOutboundTarget("http://localhost:8080/")).rejects.toThrow(UnsafeUrlError);
    await expect(resolveOutboundTarget("http://127.0.0.1:8080/", { loopback: "deny" })).rejects.toThrow(UnsafeUrlError);
  });

  it("is not granted to a name that merely resolves to loopback", async () => {
    resolvesTo("127.0.0.1");
    await expect(target("http://rebind.example.com:8080/")).rejects.toThrow(UnsafeUrlError);
    await expect(target("http://app.localhost:8080/")).rejects.toThrow(UnsafeUrlError);
  });

  it("does not open the other denied addresses, even on the server's own port", async () => {
    await expect(target("http://169.254.169.254:8080/")).rejects.toThrow(UnsafeUrlError);
    await expect(target("http://0.0.0.0:8080/")).rejects.toThrow(UnsafeUrlError);
    await expect(target("http://[fe80::1]:8080/")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("policyFetch", () => {
  const target = "http://10.10.0.5:8931/mcp";

  it("off: the ordinary fetch, no checks", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "off";
    await policyFetch("mcp:x")(target, { method: "POST" });
    expect(globalFetch).toHaveBeenCalledWith(target, { method: "POST" });
    expect(h.fetchMock).not.toHaveBeenCalled();
    await flush();
    expect(audited()).toEqual([]);
  });

  it("audit: the ordinary fetch is made even for a target enforce would refuse, and it is logged", async () => {
    await expect(policyFetch("mcp:srv-1")(target, { method: "POST" })).resolves.toBeTruthy();
    expect(globalFetch).toHaveBeenCalledWith(target, { method: "POST" });
    expect(h.fetchMock).not.toHaveBeenCalled();
    await flush();
    const lines = audited();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("mcp:srv-1");
    expect(lines[0]).toContain("10.10.0.5:8931");
    expect(lines[0]).toMatch(/private\/internal/);
  });

  it("audit: says it once per label and target, and again for a different one", async () => {
    const f = policyFetch("mcp:srv-2");
    await f(target); await f(target); await f(target);
    await flush();
    expect(audited()).toHaveLength(1);
    await policyFetch("mcp:srv-3")(target);
    await f("http://10.10.0.6:8931/mcp");
    await flush();
    expect(audited()).toHaveLength(3);
  });

  it("audit: says nothing about a target enforce would allow", async () => {
    resolvesTo("93.184.216.34");
    await policyFetch("mcp:ok")("https://mcp.example.com/mcp");
    await policyFetch("mcp:self")("http://localhost:8080/api/mock/x");
    process.env.ASTRA_ALLOWED_PRIVATE_CIDRS = "10.10.0.5@8931";
    await policyFetch("mcp:allowed")(target);
    await flush();
    expect(audited()).toEqual([]);
  });

  it("audit: a name that does not resolve is not a policy question, and never fails the call", async () => {
    vi.mocked(dns.lookup).mockRejectedValue(new Error("ENOTFOUND"));
    await expect(policyFetch("mcp:gone")("https://nowhere.example.com/")).resolves.toBeTruthy();
    await flush();
    expect(audited()).toEqual([]);
  });

  it("enforce: refuses it, and nothing is sent", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    await expect(policyFetch("mcp:x")(target, { method: "POST" })).rejects.toThrow(UnsafeUrlError);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it("enforce: sends an allowed target through the pinned path, not the ordinary fetch", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    resolvesTo("93.184.216.34");
    await policyFetch("mcp:x")("https://mcp.example.com/mcp", { method: "POST", body: "{}" });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.fetchMock.mock.calls[0][1].dispatcher).toBe(h.agents[0]);
  });

  it("enforce: this server's own port is reachable, other loopback ports are not", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    await policyFetch("mcp:self")("http://localhost:8080/api/mock/x");
    const addr = await new Promise<string>((r) => h.agents[0].opts.connect.lookup("localhost", {}, (_e: any, a: string) => r(a)));
    expect(addr).toBe("127.0.0.1");
    await expect(policyFetch("mcp:other")("http://localhost:9999/")).rejects.toThrow(UnsafeUrlError);
  });

  it("enforce: a private target is reachable once the operator lists it", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    process.env.ASTRA_ALLOWED_PRIVATE_CIDRS = "10.10.0.5@8931";
    await policyFetch("mcp:x")(target);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    await expect(policyFetch("mcp:x")("http://10.10.0.5:9000/")).rejects.toThrow(UnsafeUrlError);
  });

  it("reads the mode on every call, so a client built earlier follows a change", async () => {
    const f = policyFetch("mcp:x");
    await f(target);
    expect(globalFetch).toHaveBeenCalledTimes(1);
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    await expect(f(target)).rejects.toThrow(UnsafeUrlError);
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});

describe("vetMcpUrl, at registration", () => {
  it("off: lets everything through", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "off";
    await expect(vetMcpUrl("http://169.254.169.254/", "register:x")).resolves.toEqual({ ok: true });
  });

  it("audit: lets a violation through and logs it", async () => {
    await expect(vetMcpUrl("http://10.10.0.5:8931/mcp", "register:playwright")).resolves.toEqual({ ok: true });
    await flush();
    expect(audited().some((l) => l.includes("register:playwright"))).toBe(true);
  });

  it("enforce: refuses a violation, with the reason", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    const r = await vetMcpUrl("http://10.10.0.5:8931/mcp", "register:x");
    expect(r).toMatchObject({ ok: false });
    expect((r as any).message).toMatch(/private\/internal/);
    expect(await vetMcpUrl("http://169.254.169.254/", "register:x")).toMatchObject({ ok: false });
    expect(await vetMcpUrl("http://localhost:9999/", "register:x")).toMatchObject({ ok: false });
  });

  it("enforce: accepts what enforce would reach", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    resolvesTo("93.184.216.34");
    expect(await vetMcpUrl("https://mcp.example.com/mcp", "register:x")).toEqual({ ok: true });
    expect(await vetMcpUrl("http://localhost:8080/api/mock/x", "register:x")).toEqual({ ok: true });
    process.env.ASTRA_ALLOWED_PRIVATE_CIDRS = "10.10.0.0/24@8931";
    expect(await vetMcpUrl("http://10.10.0.5:8931/mcp", "register:x")).toEqual({ ok: true });
  });

  it("enforce: does not judge what it cannot see", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    vi.mocked(dns.lookup).mockRejectedValue(new Error("ENOTFOUND"));
    expect(await vetMcpUrl("https://not-yet.example.com/mcp", "register:x")).toEqual({ ok: true });
    expect(await vetMcpUrl("stdio://some-command", "register:x")).toEqual({ ok: true });
    expect(await vetMcpUrl("not a url", "register:x")).toEqual({ ok: true });
  });
});

describe("a job status URL taken from the remote service's own response", () => {
  const creds = { Authorization: "Bearer t", "X-API-Key": "k" };

  it("keeps the connector's credentials on the connector's origin", () => {
    expect(credentialsForStatusUrl("https://api.vendor.com/jobs/7", "https://api.vendor.com", creds)).toEqual(creds);
    expect(credentialsForStatusUrl("https://api.vendor.com:443/jobs/7", "https://api.vendor.com/v1", creds)).toEqual(creds);
  });

  it("does not send them to another origin", () => {
    for (const poll of ["https://evil.example.com/jobs/7", "http://api.vendor.com/jobs/7", "https://api.vendor.com:8443/jobs/7", "https://api.vendor.com.evil.com/x"]) {
      expect(credentialsForStatusUrl(poll, "https://api.vendor.com", creds)).toEqual({});
    }
  });

  it("sends nothing it cannot judge", () => {
    expect(credentialsForStatusUrl("not a url", "https://api.vendor.com", creds)).toEqual({});
    expect(credentialsForStatusUrl("https://api.vendor.com/x", "also not", creds)).toEqual({});
  });
});

describe("the agents safeFetch keeps", () => {
  it("reuses one for the same origin and validated addresses, so a session does not re-handshake", async () => {
    resolvesTo("93.184.216.34");
    await safeFetch("https://a.example.com/one");
    await safeFetch("https://a.example.com/two");
    expect(h.agents).toHaveLength(1);
    await safeFetch("https://b.example.com/one");
    expect(h.agents).toHaveLength(2);
  });

  it("makes a new one at once when the name resolves somewhere else, and retires the old", async () => {
    resolvesTo("93.184.216.34");
    await safeFetch("https://a.example.com/");
    resolvesTo("1.1.1.1");
    await safeFetch("https://a.example.com/");
    expect(h.agents).toHaveLength(2);
    const lookup = h.agents[1].opts.connect.lookup;
    expect(await new Promise<string>((r) => lookup("a.example.com", {}, (_e: any, a: string) => r(a)))).toBe("1.1.1.1");
  });

  it("retires an agent after its lifetime", async () => {
    vi.useFakeTimers();
    try {
      resolvesTo("93.184.216.34");
      await safeFetch("https://a.example.com/");
      vi.advanceTimersByTime(31_000);
      await safeFetch("https://a.example.com/");
      expect(h.agents).toHaveLength(2);
      expect(h.agents[0].close).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("closes them all on reset", async () => {
    resolvesTo("93.184.216.34");
    await safeFetch("https://a.example.com/");
    resetOutboundAgentsForTests();
    expect(h.agents[0].close).toHaveBeenCalled();
  });
});

describe("where the policy is applied", () => {
  // Line endings differ between a working tree and a checkout; the assertions are about the code.
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

  it("every request the MCP transport makes", () => {
    const src = read("server/mcp-client.ts");
    expect(src).toContain("const fetch = policyFetch(`mcp:${serverId}`);");
    expect(src).toContain("requestInit: { headers: authHeaders },\n        fetch,");
    expect(src).toContain("new StreamableHTTPClientTransport(new URL(serverUrl), { fetch })");
  });

  it("rest-proxy calls, the job polling, and the credentials a status URL gets", () => {
    const src = read("server/tool-dispatcher.ts");
    expect(src).toContain("await policyFetch(`rest-proxy:${tool.serverName}`)(fetchUrl, fetchOpts)");
    expect(src).toContain("await policyFetch(`rest-proxy-poll:${toolLabel}`)(pollUrl,");
    expect(src).toContain("credentialsForStatusUrl(pollUrl, baseUrl,");
    expect(src).not.toContain("await fetch(fetchUrl, fetchOpts)");
    expect(src).not.toContain("await fetch(pollUrl");
  });

  it("MCP server registration and edit", () => {
    const src = read("server/routes/runtime.ts");
    expect(src).toContain("await vetMcpUrl(data.url, `register:${data.name}`)");
    expect(src).toContain("await vetMcpUrl(sanitized.url, `edit:${req.params.id}`)");
    expect(src.indexOf("vetMcpUrl(data.url")).toBeLessThan(src.indexOf("await storage.createMcpServer({"));
    expect(src.indexOf("vetMcpUrl(sanitized.url")).toBeLessThan(src.indexOf("await storage.updateMcpServer(req.params.id as string, sanitized)"));
  });

  it("the mode is checked at boot", () => {
    expect(read("server/config.ts")).toContain("describeOutboundPolicy()");
  });
});
