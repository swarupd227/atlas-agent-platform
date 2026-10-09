/**
 * Enterprise connectors under the outbound policy (server/real-mcp-base.ts, server/connector-targets.ts).
 *
 * A connector's address is something the customer typed, and the credentials it holds go with every
 * request. Three things are held here: every call goes through the policy (and a refusal is the
 * answer, not something to retry); an address that cannot be a real one is refused when saved and
 * when used; and nothing under server/integrations reaches the network any other way.
 *
 * Offline: DNS is mocked, undici is a recorder, and the global fetch is stubbed so each mode can be
 * told apart by which of the two a call reached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const h = vi.hoisted(() => ({ undiciFetch: vi.fn(), creds: {} as Record<string, string> | null }));

vi.mock("dns/promises", () => ({ default: { lookup: vi.fn() }, lookup: vi.fn() }));
vi.mock("undici", () => ({
  Agent: class { close = vi.fn(async () => {}); },
  fetch: (...args: any[]) => h.undiciFetch(...args),
}));
vi.mock("../server/storage", () => ({
  storage: {
    getAgentIntegrationCredential: vi.fn().mockResolvedValue(null),
    getIntegrationConnection: vi.fn(async () => (h.creds ? { integrationId: "sap", status: "connected", credentialBlob: JSON.stringify(h.creds) } : null)),
    getIntegrationConnectionById: vi.fn().mockResolvedValue(null),
    getCustomToolsServer: vi.fn().mockResolvedValue(null),
    getMcpServerTools: vi.fn().mockResolvedValue([]),
    createAuditEvent: vi.fn().mockResolvedValue({}),
    upsertIntegrationConnection: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../server/credential-vault", () => ({
  decryptCredentialMap: (s: string) => JSON.parse(s),
  encryptCredentialMap: (m: Record<string, string>) => JSON.stringify(m),
}));

import dns from "dns/promises";
import { RealMcpBase, type McpToolResult } from "../server/real-mcp-base";
import { UnsafeUrlError, resetOutboundAgentsForTests } from "../server/url-safety";
import { checkConnectorTargets, connectorTargetUrls, vetConnectorCredentials } from "../server/connector-targets";

class TestConnector extends RealMcpBase {
  integrationId = "sap";
  tools = [];
  handled = 0;
  async handleTool(): Promise<McpToolResult> { this.handled++; return this.ok("done"); }
  send(url: string, init: RequestInit & { bearerToken?: string; timeoutMs?: number } = {}) { return this.fetchWithAuth(url, init); }
}

const KEYS = ["ASTRA_OUTBOUND_POLICY", "ASTRA_ALLOWED_PRIVATE_CIDRS", "PORT", "SECURITY_MODE"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
const globalFetch = vi.fn();
let warn: ReturnType<typeof vi.spyOn>;
const mode = (m?: string) => { if (m === undefined) delete process.env.ASTRA_OUTBOUND_POLICY; else process.env.ASTRA_OUTBOUND_POLICY = m; };
const resolvesTo = (...addresses: string[]) =>
  vi.mocked(dns.lookup).mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as any);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  process.env.PORT = "8080";
  vi.mocked(dns.lookup).mockReset();
  h.undiciFetch.mockReset().mockResolvedValue({ status: 200, headers: new Headers(), body: { cancel: async () => {} } });
  h.creds = { base_url: "https://sap.example.com/sap/opu/odata", username: "u", password: "p" };
  resetOutboundAgentsForTests();
  globalFetch.mockReset().mockResolvedValue({ status: 200, headers: new Headers() } as any);
  vi.stubGlobal("fetch", globalFetch);
  vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("every call goes through the policy", () => {
  it("off: the ordinary fetch, nothing judged", async () => {
    mode("off");
    await new TestConnector().send("http://10.0.0.5/x");
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(h.undiciFetch).not.toHaveBeenCalled();
    await flush();
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("audit (the default): the ordinary fetch, and a log of what enforce would refuse", async () => {
    await new TestConnector().send("http://10.0.0.5/x");
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(h.undiciFetch).not.toHaveBeenCalled();
    await flush();
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("[outbound-policy] audit"));
    expect(lines.some((l) => l.includes("connector:sap") && l.includes("10.0.0.5"))).toBe(true);
  });

  it("enforce: a private address is refused before any request, and is not retried", async () => {
    mode("enforce");
    const started = Date.now();
    const err = await new TestConnector().send("http://10.0.0.5/x", { bearerToken: "secret" }).catch((e) => e);
    expect(err).toBeInstanceOf(UnsafeUrlError);
    expect(String(err.message)).toMatch(/private\/internal/);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(h.undiciFetch).not.toHaveBeenCalled();
    // The retry loop waits 500ms then 1000ms between attempts; a refusal must not enter it.
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("enforce: a public address is called, pinned to what it resolved to, with the credentials", async () => {
    mode("enforce");
    resolvesTo("93.184.216.34");
    await new TestConnector().send("https://sap.example.com/x", { bearerToken: "secret" });
    expect(h.undiciFetch).toHaveBeenCalledTimes(1);
    const [target, init] = h.undiciFetch.mock.calls[0];
    expect(String(target)).toBe("https://sap.example.com/x");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret");
    expect(init.dispatcher).toBeDefined();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("enforce: a name that resolves to a private address is refused", async () => {
    mode("enforce");
    resolvesTo("10.1.2.3");
    await expect(new TestConnector().send("https://sap.example.com/x")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(h.undiciFetch).not.toHaveBeenCalled();
  });

  it("enforce: a private address the operator allowed is called (an on-prem SAP)", async () => {
    mode("enforce");
    process.env.ASTRA_ALLOWED_PRIVATE_CIDRS = "10.1.2.3@8443";
    resolvesTo("10.1.2.3");
    await new TestConnector().send("https://sap.corp.example:8443/x");
    expect(h.undiciFetch).toHaveBeenCalledTimes(1);
  });

  it("enforce: cloud metadata is never allowed, even if the operator listed it", async () => {
    mode("enforce");
    process.env.ASTRA_ALLOWED_PRIVATE_CIDRS = "169.254.169.254";
    await expect(new TestConnector().send("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(h.undiciFetch).not.toHaveBeenCalled();
  });

  it("enforce: a redirect to an internal address is judged before it is followed", async () => {
    mode("enforce");
    resolvesTo("93.184.216.34");
    h.undiciFetch.mockResolvedValueOnce({ status: 302, headers: new Headers({ location: "http://169.254.169.254/latest" }), body: { cancel: async () => {} } });
    await expect(new TestConnector().send("https://sap.example.com/x", { method: "GET", bearerToken: "secret" })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(h.undiciFetch).toHaveBeenCalledTimes(1);
  });

  it("enforce: a redirect to another origin drops the credentials", async () => {
    mode("enforce");
    resolvesTo("93.184.216.34");
    h.undiciFetch
      .mockResolvedValueOnce({ status: 302, headers: new Headers({ location: "https://elsewhere.example.org/y" }), body: { cancel: async () => {} } })
      .mockResolvedValueOnce({ status: 200, headers: new Headers(), body: { cancel: async () => {} } });
    await new TestConnector().send("https://sap.example.com/x", { method: "GET", bearerToken: "secret" });
    expect(h.undiciFetch).toHaveBeenCalledTimes(2);
    expect(new Headers(h.undiciFetch.mock.calls[1][1].headers).get("authorization")).toBeNull();
  });
});

describe("the address saved on a connection is judged when the connector is called", () => {
  const BAD = { base_url: "https://user:pw@sap.example.com/odata" };

  it("enforce: refuses the call and never reaches the connector", async () => {
    mode("enforce");
    h.creds = { ...BAD, username: "u", password: "p" };
    const c = new TestConnector();
    const res = await c.callTool("any_tool", {}, "org-1");
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/address this deployment does not allow/);
    expect(c.handled).toBe(0);
  });

  it("audit: runs the call and says what enforce would refuse, once", async () => {
    h.creds = { ...BAD, username: "u", password: "p" };
    const c = new TestConnector();
    expect((await c.callTool("any_tool", {}, "org-1")).isError).toBeFalsy();
    await c.callTool("any_tool", {}, "org-1");
    expect(c.handled).toBe(2);
    const lines = warn.mock.calls.map((x) => String(x[0])).filter((m) => m.includes("would refuse connector:sap"));
    expect(lines).toHaveLength(1);
  });

  it("off: does not look", async () => {
    mode("off");
    h.creds = { ...BAD, username: "u", password: "p" };
    const c = new TestConnector();
    expect((await c.callTool("any_tool", {}, "org-1")).isError).toBeFalsy();
    expect(warn.mock.calls.filter((x) => String(x[0]).includes("would refuse"))).toHaveLength(0);
  });

  it("a good address is called in every mode", async () => {
    for (const m of ["off", "audit", "enforce"]) {
      mode(m);
      const c = new TestConnector();
      expect((await c.callTool("any_tool", {}, "org-1")).isError, m).toBeFalsy();
      expect(c.handled).toBe(1);
    }
  });
});

describe("the shape of an address", () => {
  const ok = (id: string, creds: Record<string, string>) => expect(checkConnectorTargets(id, creds)).toEqual([]);
  const bad = (id: string, creds: Record<string, string>) => expect(checkConnectorTargets(id, creds).length, `${id} ${JSON.stringify(creds)}`).toBeGreaterThan(0);

  it("accepts what each connector's own form suggests", () => {
    ok("jira", { base_url: "https://yourorg.atlassian.net" });
    ok("jira", { base_url: "yourorg.atlassian.net" });
    ok("jira", { base_url: "https://jira.corp.example:8443/jira/" });
    ok("jira", { instance_url: "acme.atlassian.net" });
    ok("salesforce", { instance_url: "https://acme.my.salesforce.com" });
    ok("servicenow", { instance_url: "https://yourinstance.service-now.com" });
    ok("sap", { base_url: "https://myhost:443/sap/opu/odata" });
    ok("sap", { base_url: "http://10.1.2.3:50000/sap/opu/odata" });
    ok("databricks", { host: "https://adb-1234567890123456.7.azuredatabricks.net" });
    ok("netsuite", { account_id: "1234567" });
    ok("netsuite", { account_id: "1234567_SB1" });
    ok("zendesk", { subdomain: "acme" });
    ok("zendesk", { subdomain: "https://acme.zendesk.com/" });
    ok("workday", { hostname: "wd5.myworkday.com", tenant_name: "mycompany" });
    ok("workday", { hostname: "https://wd5.myworkday.com/", tenant_name: "my_company" });
    ok("snowflake", { account: "orgname-accountname" });
    ok("snowflake", { account: "xy12345.us-east-1" });
  });

  it("accepts a missing or empty field: absence is the form's concern, not a shape problem", () => {
    ok("sap", {});
    ok("sap", { base_url: "" });
    ok("netsuite", { account_id: "  " });
  });

  it("is silent about integrations that have no address field", () => {
    ok("hubspot", { api_key: "k" });
    ok("postgres", { host: "db.example.com", port: "5432" });
  });

  it("refuses an address that could not be a real one", () => {
    bad("sap", { base_url: "https://user:pw@sap.example.com/odata" });
    bad("sap", { base_url: "https://good.example.com@10.0.0.5/odata" });
    bad("sap", { base_url: "sap.example.com/odata" });
    bad("sap", { base_url: "ftp://sap.example.com" });
    bad("sap", { base_url: "https://sap.example.com/odata?x=1" });
    bad("sap", { base_url: "https://sap.example.com/odata#frag" });
    bad("sap", { base_url: "https://sap.example.com\\@10.0.0.5" });
    bad("sap", { base_url: "https://sap example.com" });
    bad("sap", { base_url: "https://" });
    bad("salesforce", { instance_url: "file:///etc/passwd" });
    bad("servicenow", { instance_url: "javascript://x" });
    bad("databricks", { host: "adb-123.azuredatabricks.net" });
    bad("jira", { base_url: "https://acme.atlassian.net@10.0.0.5" });
    bad("jira", { base_url: "acme.atlassian.net/rest?x" });
    bad("jira", { instance_url: "evil.com#.atlassian.net" });
    bad("jira", { base_url: "ftp://acme.atlassian.net" });
    bad("jira", { base_url: "javascript://acme.atlassian.net" });
  });

  it("refuses characters a web address cannot hold, which a URL parser would quietly repair", () => {
    // The parser turns a backslash into a slash and drops tabs and newlines, so the value that was
    // typed is not the value that would be used.
    bad("sap", { base_url: "https://sap.example.com\\odata" });
    bad("sap", { base_url: "https://sap.exa\tmple.com/odata" });
    bad("sap", { base_url: "https://sap.example.com/odata\n" + "Host: evil" });
    bad("jira", { base_url: "acme.atlassian.net\\x" });
  });

  it("refuses a value pasted into a host name or a path that is not a name", () => {
    bad("netsuite", { account_id: "evil.com/x?" });
    bad("netsuite", { account_id: "123.evil.com" });
    bad("netsuite", { account_id: "123@evil.com" });
    bad("netsuite", { account_id: "1".repeat(65) });
    bad("zendesk", { subdomain: "acme/evil" });
    bad("zendesk", { subdomain: "acme@evil.com" });
    bad("zendesk", { subdomain: "a b" });
    bad("workday", { hostname: "wd5.myworkday.com/evil" });
    bad("workday", { hostname: "evil.com:80@10.0.0.5" });
    bad("workday", { tenant_name: "../../admin" });
    bad("workday", { tenant_name: "a/b" });
    bad("snowflake", { account: "evil.com/x" });
    bad("snowflake", { account: "a b" });
  });

  it("only looks at the fields being changed when asked to", () => {
    const creds = { base_url: "https://user:pw@sap.example.com", client: "100" };
    expect(checkConnectorTargets("sap", creds, ["client"])).toEqual([]);
    expect(checkConnectorTargets("sap", creds, ["base_url"]).length).toBe(1);
  });

  it("names the field and says what is wrong", () => {
    const [p] = checkConnectorTargets("sap", { base_url: "https://u:p@h.example.com" });
    expect(p.key).toBe("base_url");
    expect(p.message).toMatch(/SAP base URL.*user name or password/);
  });
});

describe("the addresses handed to the policy", () => {
  it("are the URLs the connector would call", () => {
    expect(connectorTargetUrls("jira", { base_url: "https://acme.atlassian.net/" })).toEqual([{ key: "base_url", url: "https://acme.atlassian.net" }]);
    expect(connectorTargetUrls("jira", { instance_url: "acme.atlassian.net" })).toEqual([{ key: "instance_url", url: "https://acme.atlassian.net" }]);
    expect(connectorTargetUrls("sap", { base_url: " http://10.1.2.3:50000/odata " })).toEqual([{ key: "base_url", url: "http://10.1.2.3:50000/odata" }]);
    expect(connectorTargetUrls("workday", { hostname: "wd5.myworkday.com" })).toEqual([{ key: "hostname", url: "https://wd5.myworkday.com" }]);
  });
  it("leave out the fields that are only a part of a vendor's own host name", () => {
    expect(connectorTargetUrls("netsuite", { account_id: "123" })).toEqual([]);
    expect(connectorTargetUrls("zendesk", { subdomain: "acme" })).toEqual([]);
  });
});

describe("what the routes do before storing", () => {
  it("refuses a malformed address in every mode", async () => {
    for (const m of ["off", "audit", "enforce"]) {
      mode(m);
      const r = await vetConnectorCredentials("netsuite", { account_id: "evil.com/x?" });
      expect(r.ok, m).toBe(false);
      if (!r.ok) expect(r.problems[0].key).toBe("account_id");
    }
  });

  it("enforce refuses a well-formed address the policy does not allow; audit and off let it through", async () => {
    resolvesTo("10.1.2.3");
    mode("enforce");
    const refused = await vetConnectorCredentials("sap", { base_url: "https://sap.example.com/odata" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/outbound policy/);
    for (const m of ["audit", "off"]) {
      mode(m);
      expect((await vetConnectorCredentials("sap", { base_url: "https://sap.example.com/odata" })).ok, m).toBe(true);
    }
  });

  it("enforce accepts a private address the operator allowed", async () => {
    mode("enforce");
    process.env.ASTRA_ALLOWED_PRIVATE_CIDRS = "10.1.2.3@50000";
    expect((await vetConnectorCredentials("sap", { base_url: "http://10.1.2.3:50000/odata" })).ok).toBe(true);
  });

  it("judges only the fields being edited", async () => {
    mode("enforce");
    const r = await vetConnectorCredentials("sap", { base_url: "https://u:p@h.example.com", client: "100" }, ["client"]);
    expect(r.ok).toBe(true);
  });

  it("does not look up a name for an address that has a vendor's own host", async () => {
    mode("enforce");
    expect((await vetConnectorCredentials("netsuite", { account_id: "1234567" })).ok).toBe(true);
    expect(dns.lookup).not.toHaveBeenCalled();
  });
});

// ── Ratchets: the source cannot drift back to a bare fetch ────────────────────
const ROOT = path.join(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));

describe("no connector reaches the network around the policy", () => {
  // The only bare fetch under server/integrations is a token exchange against a fixed Salesforce
  // host (login or test.salesforce.com); the customer's address is not in it.
  const ALLOWED_BARE_FETCH = new Set(["salesforce/mcp-server.ts"]);

  it("server/integrations has no bare fetch( other than the fixed Salesforce token URL", () => {
    const base = path.join(ROOT, "server", "integrations");
    const found = walk(base).filter((f) => /(?<![.\w])fetch\(/.test(readFileSync(f, "utf8"))).map((f) => path.relative(base, f).replace(/\\/g, "/")).sort();
    expect(found).toEqual(Array.from(ALLOWED_BARE_FETCH));
  });

  it("fetchWithAuth sends through policyFetch, and does not retry a refusal", () => {
    const src = read("server/real-mcp-base.ts");
    const body = src.slice(src.indexOf("protected async fetchWithAuth"));
    expect(body).toContain("policyFetch(`connector:${this.integrationId}`)");
    expect(body).not.toMatch(/await fetch\(/);
    expect(body).toMatch(/instanceof UnsafeUrlError\) throw err/);
  });

  it("callTool judges the saved address before the connector runs", () => {
    const src = read("server/real-mcp-base.ts");
    expect(src.indexOf("checkConnectorTargets(this.integrationId")).toBeGreaterThan(src.indexOf("async callTool"));
    expect(src.indexOf("checkConnectorTargets(this.integrationId")).toBeLessThan(src.indexOf("await this.handleTool("));
  });

  it("both routes that write connector credentials vet the address before encrypting it", () => {
    const src = read("server/routes/enterprise-integrations.ts");
    const writes = [...src.matchAll(/vetConnectorCredentials\(/g)].length;
    expect(writes).toBe(2);
    // ...and acts on the answer: each call is followed by a 400 when the address is refused.
    expect([...src.matchAll(/if \(!vetted\.ok\) return res\.status\(400\)\.json\(\{ error: vetted\.message, problems: vetted\.problems \}\);/g)]).toHaveLength(2);
    const connect = src.slice(src.indexOf('"/api/enterprise-integrations/:id/connect"'));
    expect(connect.indexOf("vetConnectorCredentials(")).toBeLessThan(connect.indexOf("encryptCredentialMap("));
    const edit = src.slice(src.indexOf('"/api/enterprise-integrations/connections/:connectionId/config"', src.indexOf("router.patch")));
    expect(edit.indexOf("vetConnectorCredentials(")).toBeLessThan(edit.indexOf("encryptCredentialMap("));
  });

  it("SAP's own connection test goes through the policy", () => {
    expect(read("server/integrations/sap/mcp-server.ts")).toContain('policyFetch("connector:sap")(pingPath');
  });
});
