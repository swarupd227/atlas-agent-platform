/**
 * What an MCP server's auth record turns into on the wire (server/mcp-client.ts buildMcpAuthHeaders).
 *
 * The first block PINS how every auth type that existed before the OAuth client-credentials work
 * behaves, input by input. It was written and passed against the unmodified code, so a later change
 * cannot alter what a server already configured sends. The blocks after it cover what was added:
 * extra headers on any auth type, and the client-credentials token manager.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const h = vi.hoisted(() => ({ upserts: [] as any[], current: null as any }));
vi.mock("../server/storage", () => ({
  storage: {
    upsertMcpServerAuth: vi.fn(async (a: any) => { h.upserts.push(a); return a; }),
    getMcpServerAuth: vi.fn(async () => h.current),
  },
}));

import { buildMcpAuthHeaders } from "../server/mcp-client";
import { McpAuthError, getClientCredentialsToken, mergeExtraHeaders, normalizeMcpAuthInput, parseExtraHeaders, resetMcpAuthForTests } from "../server/mcp-auth";

const server = { id: "srv-1", name: "t", url: "https://mcp.example.test/mcp", transportType: "streamable-http" } as any;
const auth = (authType: string, config: Record<string, unknown> | null) => ({ serverId: "srv-1", authType, config }) as any;
const headers = (a: any) => buildMcpAuthHeaders(server, a);

describe("existing auth types send exactly what they always did", () => {
  it("none, or no record at all: nothing", async () => {
    expect(await headers(undefined)).toEqual({});
    expect(await headers(null)).toEqual({});
    expect(await headers(auth("none", null))).toEqual({});
    expect(await headers(auth("none", { token: "ignored" }))).toEqual({});
  });

  it("an unknown type: nothing", async () => {
    expect(await headers(auth("something_else", { token: "x" }))).toEqual({});
  });

  it("bearer: Authorization: Bearer <token>", async () => {
    expect(await headers(auth("bearer", { token: "tok-123" }))).toEqual({ Authorization: "Bearer tok-123" });
    expect(await headers(auth("bearer_token", { token: "tok-123" }))).toEqual({ Authorization: "Bearer tok-123" });
  });

  it("bearer without a token: nothing", async () => {
    expect(await headers(auth("bearer", {}))).toEqual({});
    expect(await headers(auth("bearer", { token: "" }))).toEqual({});
    expect(await headers(auth("bearer", null))).toEqual({});
  });

  it("api_key: the named header, or X-API-Key; the older field names still work", async () => {
    expect(await headers(auth("api_key", { headerName: "x-api-key", value: "k1" }))).toEqual({ "x-api-key": "k1" });
    expect(await headers(auth("api_key", { value: "k2" }))).toEqual({ "X-API-Key": "k2" });
    expect(await headers(auth("api_key", { keyName: "X-Token", keyValue: "k3" }))).toEqual({ "X-Token": "k3" });
    expect(await headers(auth("api_key", { keyValue: "k4" }))).toEqual({ "X-API-Key": "k4" });
  });

  it("api_key without a value: nothing", async () => {
    expect(await headers(auth("api_key", { headerName: "x-api-key" }))).toEqual({});
    expect(await headers(auth("api_key", { headerName: "x-api-key", value: "" }))).toEqual({});
  });

  it("basic: Authorization: Basic base64(user:password), missing parts as empty", async () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64");
    expect(await headers(auth("basic", { username: "u", password: "p" }))).toEqual({ Authorization: `Basic ${b64("u:p")}` });
    expect(await headers(auth("basic", { username: "u" }))).toEqual({ Authorization: `Basic ${b64("u:")}` });
    expect(await headers(auth("basic", {}))).toEqual({ Authorization: `Basic ${b64(":")}` });
  });

  it("oauth2: Authorization: Bearer <accessToken> while the token is not near expiry", async () => {
    expect(await headers(auth("oauth2", { accessToken: "at-1" }))).toEqual({ Authorization: "Bearer at-1" });
    expect(await headers(auth("oauth2", { accessToken: "at-2", expiresAt: Date.now() + 3_600_000, refreshToken: "r" }))).toEqual({ Authorization: "Bearer at-2" });
    expect(await headers(auth("oauth2", { accessToken: "at-3", expiresAt: String(Date.now() + 3_600_000) }))).toEqual({ Authorization: "Bearer at-3" });
  });

  it("oauth2 near expiry with no refresh token, or no provider for the URL: the existing token, unchanged", async () => {
    expect(await headers(auth("oauth2", { accessToken: "stale", expiresAt: Date.now() - 1000 }))).toEqual({ Authorization: "Bearer stale" });
    expect(await headers(auth("oauth2", { accessToken: "stale", expiresAt: Date.now() - 1000, refreshToken: "r" }))).toEqual({ Authorization: "Bearer stale" });
  });

  it("oauth2 without an access token: nothing", async () => {
    expect(await headers(auth("oauth2", {}))).toEqual({});
    expect(await headers(auth("oauth2", { accessToken: "" }))).toEqual({});
  });

  it("an unrecognised extra field in the config changes nothing", async () => {
    expect(await headers(auth("bearer", { token: "t", note: "hello", extraHeader: "x" }))).toEqual({ Authorization: "Bearer t" });
  });
});

// ─── Additional headers on any auth type ─────────────────────────────────────

describe("additional headers", () => {
  const withHeaders = (type: string, cfg: Record<string, unknown>, headersObj: Record<string, string> | string) =>
    auth(type, { ...cfg, extraHeaders: typeof headersObj === "string" ? headersObj : JSON.stringify(headersObj) });

  it("go out beside the credential: Adobe's Authorization plus x-api-key", async () => {
    expect(await headers(withHeaders("bearer", { token: "ims" }, { "x-api-key": "client-id" }))).toEqual({ Authorization: "Bearer ims", "x-api-key": "client-id" });
    expect(await headers(withHeaders("basic", { username: "u", password: "p" }, { "X-Tenant": "t1" }))).toMatchObject({ "X-Tenant": "t1" });
    expect(await headers(withHeaders("oauth2", { accessToken: "at" }, { "x-api-key": "k" }))).toEqual({ Authorization: "Bearer at", "x-api-key": "k" });
  });

  it("are read from the stored JSON text or from an object", async () => {
    expect(await headers(auth("bearer", { token: "t", extraHeaders: { "x-a": "1" } }))).toEqual({ Authorization: "Bearer t", "x-a": "1" });
    expect(await headers(auth("bearer", { token: "t", extraHeaders: '{"x-a":"1"}' }))).toEqual({ Authorization: "Bearer t", "x-a": "1" });
  });

  it("never replace what the auth type set", async () => {
    expect(await headers(withHeaders("api_key", { headerName: "x-api-key", value: "from-auth" }, { "X-API-KEY": "from-extra", "x-other": "o" }))).toEqual({ "x-api-key": "from-auth", "x-other": "o" });
  });

  it("are not sent for none", async () => {
    expect(await headers(withHeaders("none", {}, { "x-a": "1" }))).toEqual({});
  });

  it("are all ignored, with the credential intact, when what is stored cannot be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await headers(withHeaders("bearer", { token: "t" }, "not json"))).toEqual({ Authorization: "Bearer t" });
    expect(await headers(withHeaders("bearer", { token: "t" }, { Authorization: "Bearer other" }))).toEqual({ Authorization: "Bearer t" });
    expect(await headers(withHeaders("bearer", { token: "t" }, { ok: "1", "bad name": "2" }))).toEqual({ Authorization: "Bearer t" });
  });

  it("an empty set changes nothing", () => {
    const base = { Authorization: "Bearer t" };
    expect(mergeExtraHeaders(base, { extraHeaders: "{}" })).toBe(base);
    expect(mergeExtraHeaders(base, {})).toBe(base);
    expect(mergeExtraHeaders(base, null)).toBe(base);
  });
});

describe("parsing additional headers", () => {
  const bad = (v: unknown) => expect(parseExtraHeaders(v).ok, JSON.stringify(v)).toBe(false);
  it("accepts a plain set", () => {
    expect(parseExtraHeaders({ "x-api-key": "k", "X-Tenant-Id": "t" })).toEqual({ ok: true, headers: { "x-api-key": "k", "X-Tenant-Id": "t" } });
    expect(parseExtraHeaders(undefined)).toEqual({ ok: true, headers: {} });
    expect(parseExtraHeaders("")).toEqual({ ok: true, headers: {} });
  });
  it("refuses the headers the platform or the transport owns", () => {
    for (const n of ["Authorization", "authorization", "Host", "Content-Length", "Content-Type", "Accept", "Cookie", "Transfer-Encoding", "Connection", "Mcp-Session-Id", "Proxy-Authorization", "Proxy-Foo", "Sec-Fetch-Mode", "Origin"]) bad({ [n]: "v" });
  });
  it("refuses bad names, repeated names, empty or oversize values, and line breaks", () => {
    bad({ "bad name": "v" }); bad({ "bad:name": "v" }); bad({ "": "v" }); bad({ "é": "v" });
    bad({ "x-a": "1", "X-A": "2" });
    bad({ "x-a": "" }); bad({ "x-a": 5 }); bad({ "x-a": null }); bad({ "x-a": "v".repeat(2049) });
    bad({ "x-a": "v\r\nInjected: 1" }); bad({ "x-a": "v\nx" }); bad({ "x-a": "v\0" });
  });
  it("refuses more than ten, and anything that is not an object", () => {
    bad(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`x-h${i}`, "v"])));
    bad([["x-a", "1"]]); bad("[1]"); bad("nonsense"); bad(42); bad(true);
  });
});

// ─── Saving: what the route accepts ──────────────────────────────────────────

describe("saving an auth record", () => {
  const ok = (r: ReturnType<typeof normalizeMcpAuthInput>) => { expect(r.ok).toBe(true); return (r as any).config; };
  const errs = (r: ReturnType<typeof normalizeMcpAuthInput>) => { expect(r.ok).toBe(false); return (r as any).errors as string[]; };

  it("passes every existing shape through untouched: the same object", () => {
    for (const [t, c] of [["bearer", { token: "t" }], ["api_key", { headerName: "h", value: "v" }], ["oauth2", { accessToken: "a", refreshToken: "r", expiresAt: 5 }], ["basic", { username: "u", password: "p" }], ["none", {}], ["none", null], ["bearer", undefined]] as const) {
      const input = c as any;
      expect(normalizeMcpAuthInput(t, input, null)).toEqual({ ok: true, config: input });
      expect((normalizeMcpAuthInput(t, input, null) as any).config).toBe(input);
    }
  });

  it("stores additional headers as JSON text, which is how the encrypted record holds every value", () => {
    const c = ok(normalizeMcpAuthInput("bearer", { token: "t", extraHeaders: { "x-api-key": "k" } }, null));
    expect(c).toEqual({ token: "t", extraHeaders: '{"x-api-key":"k"}' });
  });

  it("refuses bad additional headers with the reason", () => {
    expect(errs(normalizeMcpAuthInput("bearer", { token: "t", extraHeaders: { Authorization: "x" } }, null))[0]).toMatch(/cannot be added here/);
    expect(errs(normalizeMcpAuthInput("none", { extraHeaders: { "x-a": "1" } }, null))[0]).toMatch(/other than none/);
  });

  it("keeps stored additional headers when the save leaves them out, replaces them when present, clears them when empty", () => {
    const existing = { authType: "bearer", config: { token: "old", extraHeaders: '{"x-keep":"1"}' } };
    expect(ok(normalizeMcpAuthInput("bearer", { token: "new" }, existing))).toEqual({ token: "new", extraHeaders: '{"x-keep":"1"}' });
    expect(ok(normalizeMcpAuthInput("bearer", { token: "new", extraHeaders: { "x-new": "2" } }, existing))).toEqual({ token: "new", extraHeaders: '{"x-new":"2"}' });
    expect(ok(normalizeMcpAuthInput("bearer", { token: "new", extraHeaders: {} }, existing))).toEqual({ token: "new" });
    expect(ok(normalizeMcpAuthInput("none", {}, existing))).toEqual({});
  });

  describe("client credentials", () => {
    const valid = { tokenUrl: "https://ims.example.test/ims/token/v3", clientId: "cid", clientSecret: "sek", scope: "openid", audience: "aud" };
    it("is shaped to exactly its own fields, with the body method by default", () => {
      expect(ok(normalizeMcpAuthInput("oauth2_client_credentials", { ...valid, accessToken: "stale", expiresAt: 9 } as any, null))).toEqual({ ...valid, tokenAuthMethod: "body" });
    });
    it("takes additional headers too", () => {
      expect(ok(normalizeMcpAuthInput("oauth2_client_credentials", { ...valid, extraHeaders: { "x-api-key": "cid" } }, null)).extraHeaders).toBe('{"x-api-key":"cid"}');
    });
    it.each([
      ["no token URL", { ...valid, tokenUrl: "" }, /token URL is required/],
      ["a token URL that is not an address", { ...valid, tokenUrl: "idp token" }, /not a valid address/],
      ["a token URL that is not http", { ...valid, tokenUrl: "ftp://idp/token" }, /http or https/],
      ["a token URL with a password", { ...valid, tokenUrl: "https://u:p@idp/token" }, /user name or password/],
      ["no client id", { ...valid, clientId: "" }, /client id is required/],
      ["no client secret", { ...valid, clientSecret: "" }, /client secret is required/],
      ["a method that does not exist", { ...valid, tokenAuthMethod: "header" }, /"body" or "basic"/],
      ["a setting it does not have", { ...valid, grantType: "password" }, /not a setting/],
      ["an oversize scope", { ...valid, scope: "s".repeat(1001) }, /scope is too long/],
    ])("refuses %s", (_n, cfg, re) => {
      expect(errs(normalizeMcpAuthInput("oauth2_client_credentials", cfg, null)).join(" ")).toMatch(re);
    });
    it("keeps the stored secret when a save leaves it out, but only from the same auth type", () => {
      const { clientSecret, ...noSecret } = valid;
      const same = { authType: "oauth2_client_credentials", config: { ...valid, accessToken: "cached" } };
      expect(ok(normalizeMcpAuthInput("oauth2_client_credentials", noSecret, same)).clientSecret).toBe("sek");
      expect(ok(normalizeMcpAuthInput("oauth2_client_credentials", noSecret, same))).not.toHaveProperty("accessToken");
      expect(errs(normalizeMcpAuthInput("oauth2_client_credentials", noSecret, { authType: "bearer", config: { clientSecret: "from-another-type" } })).join(" ")).toMatch(/client secret is required/);
    });
  });
});

// ─── Client credentials: the token manager ───────────────────────────────────

describe("the client-credentials token", () => {
  const fetchMock = vi.fn();
  const ccServer = { id: "srv-cc", name: "Adobe", url: "https://mcp.example.test/mcp", transportType: "streamable-http" } as any;
  const cfg = (over: Record<string, unknown> = {}) => ({ tokenUrl: "https://ims.example.test/ims/token/v3", clientId: "cid", clientSecret: "s3cr3t!", scope: "openid,AdobeID", audience: "", tokenAuthMethod: "body", ...over });
  const stored = (c: Record<string, unknown>) => { h.current = auth("oauth2_client_credentials", c); return h.current; };
  const tokenReply = (over: Record<string, unknown> = {}, status = 200) => ({
    ok: status >= 200 && status < 300, status, headers: new Headers(),
    text: async () => JSON.stringify({ access_token: "tok-1", token_type: "Bearer", expires_in: 3600, ...over }),
  });
  const get = (c: Record<string, unknown>) => getClientCredentialsToken(ccServer, c);
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMcpAuthForTests();
    h.upserts.length = 0; h.current = null;
    delete process.env.ASTRA_OUTBOUND_POLICY;
    fetchMock.mockReset().mockResolvedValue(tokenReply());
    vi.stubGlobal("fetch", fetchMock);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.ASTRA_OUTBOUND_POLICY; });

  it("is requested with the client credentials, and sent as a Bearer token beside the extra header", async () => {
    const c = cfg({ extraHeaders: '{"x-api-key":"cid"}' });
    stored(c);
    const out = await buildMcpAuthHeaders(ccServer, auth("oauth2_client_credentials", c));
    expect(out).toEqual({ Authorization: "Bearer tok-1", "x-api-key": "cid" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ims.example.test/ims/token/v3");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" });
    const body = new URLSearchParams(init.body);
    expect(Object.fromEntries(body)).toEqual({ grant_type: "client_credentials", client_id: "cid", client_secret: "s3cr3t!", scope: "openid,AdobeID" });
    expect(init.redirect).toBe("manual");
    // A token endpoint that never answers cannot hang the call that needs the token.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("can send the client credentials as HTTP Basic instead, form-encoded as the standard says", async () => {
    stored(cfg({ clientId: "a b", clientSecret: "p@ss:w/rd+", tokenAuthMethod: "basic", audience: "https://api.example.test" }));
    await get(cfg({ clientId: "a b", clientSecret: "p@ss:w/rd+", tokenAuthMethod: "basic", audience: "https://api.example.test" }));
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("a+b:p%40ss%3Aw%2Frd%2B").toString("base64")}`);
    const body = Object.fromEntries(new URLSearchParams(init.body));
    expect(body).toEqual({ grant_type: "client_credentials", scope: "openid,AdobeID", audience: "https://api.example.test" });
  });

  it("is kept with the server's encrypted auth record, with the rest of its settings", async () => {
    const c = cfg();
    stored(c);
    await get(c);
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]).toMatchObject({ serverId: "srv-cc", authType: "oauth2_client_credentials" });
    expect(h.upserts[0].config).toMatchObject({ ...c, accessToken: "tok-1" });
    expect(h.upserts[0].config.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
  });

  it("is reused while it has more than a minute left, with no request", async () => {
    const t = await get(cfg({ accessToken: "cached", expiresAt: Date.now() + 120_000 }));
    expect(t).toBe("cached");
    expect(await get(cfg({ accessToken: "cached", expiresAt: String(Date.now() + 120_000) }))).toBe("cached");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is renewed inside the last minute, and when it has expired", async () => {
    stored(cfg());
    expect(await get(cfg({ accessToken: "old", expiresAt: Date.now() + 30_000 }))).toBe("tok-1");
    resetMcpAuthForTests();
    expect(await get(cfg({ accessToken: "old", expiresAt: Date.now() - 5_000 }))).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is remembered in memory when it could not be stored, so the next call does not ask again", async () => {
    h.current = null;
    await get(cfg());
    await get(cfg());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is not reused for different credentials", async () => {
    stored(cfg());
    await get(cfg());
    fetchMock.mockResolvedValueOnce(tokenReply({ access_token: "tok-2" }));
    expect(await get(cfg({ clientSecret: "changed" }))).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is asked for once however many calls need it at the same moment", async () => {
    stored(cfg());
    let release!: () => void;
    fetchMock.mockImplementation(() => new Promise((r) => { release = () => r(tokenReply()); }));
    const calls = Array.from({ length: 10 }, () => get(cfg()));
    await new Promise((r) => setTimeout(r, 10));
    release();
    expect(new Set(await Promise.all(calls))).toEqual(new Set(["tok-1"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is not stored over a configuration an administrator changed while it was being fetched", async () => {
    h.current = auth("oauth2_client_credentials", cfg({ clientId: "someone-else" }));
    expect(await get(cfg())).toBe("tok-1");
    expect(h.upserts).toHaveLength(0);
  });

  it("lasts five minutes when the server does not say how long it lives", async () => {
    stored(cfg());
    fetchMock.mockResolvedValue(tokenReply({ expires_in: undefined }));
    await get(cfg());
    const exp = h.upserts[0].config.expiresAt;
    expect(exp).toBeGreaterThan(Date.now() + 290_000);
    expect(exp).toBeLessThan(Date.now() + 310_000);
  });

  describe("when it cannot be had", () => {
    const fails = async (c = cfg()) => { try { await get(c); } catch (e) { return e as Error; } throw new Error("expected a failure"); };

    it("refuses with the server's reason, and never with a secret", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, headers: new Headers(), text: async () => JSON.stringify({ error: "invalid_client", error_description: "Client authentication failed" }) });
      const e = await fails();
      expect(e).toBeInstanceOf(McpAuthError);
      expect(e.message).toMatch(/ims\.example\.test.*refused.*Adobe.*HTTP 401 invalid_client \(Client authentication failed\)/);
      expect(e.message).not.toContain("s3cr3t!");
      expect(JSON.stringify(warn.mock.calls)).not.toContain("s3cr3t!");
    });

    it.each([
      ["a 200 that is an error body", () => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ error: "invalid_scope" }) }), /invalid_scope/],
      ["no access token", () => tokenReply({ access_token: undefined }), /without an access token/],
      ["an empty access token", () => tokenReply({ access_token: "" }), /without an access token/],
      ["a body that is not JSON", () => ({ ok: true, status: 200, headers: new Headers(), text: async () => "<html>login</html>" }), /without an access token/],
      ["a token type that is not Bearer", () => tokenReply({ token_type: "MAC" }), /only Bearer/],
      ["a redirect", () => ({ ok: false, status: 302, headers: new Headers({ location: "https://elsewhere" }), text: async () => "" }), /HTTP 302/],
    ])("refuses %s", async (_n, reply, re) => {
      fetchMock.mockResolvedValue(reply());
      expect((await fails()).message).toMatch(re);
    });

    it("says it could not be reached, naming the host", async () => {
      fetchMock.mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND"), { name: "Error" }));
      expect((await fails()).message).toMatch(/Could not reach the token endpoint ims\.example\.test.*ENOTFOUND/);
      resetMcpAuthForTests();
      fetchMock.mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
      expect((await fails()).message).toMatch(/timed out after 10s/);
    });

    it("asks the settings, not the network, when they are incomplete", async () => {
      expect((await fails(cfg({ clientSecret: "" }))).message).toMatch(/incomplete/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not ask again for thirty seconds after a refusal", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400, headers: new Headers(), text: async () => '{"error":"invalid_client"}' });
      const first = await fails();
      const second = await fails();
      expect(second.message).toBe(first.message);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to a token that has not expired yet", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503, headers: new Headers(), text: async () => "" });
      expect(await get(cfg({ accessToken: "still-good", expiresAt: Date.now() + 30_000 }))).toBe("still-good");
    });

    it("fails the header build, so a call never goes out without a credential", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, headers: new Headers(), text: async () => '{"error":"invalid_client"}' });
      await expect(buildMcpAuthHeaders(ccServer, auth("oauth2_client_credentials", cfg()))).rejects.toBeInstanceOf(McpAuthError);
    });
  });

  it("goes out under the outbound policy: a private token URL is refused in enforce, and nothing is sent", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    const e = await get(cfg({ tokenUrl: "http://10.9.9.9/token" })).catch((x) => x);
    expect(e).toBeInstanceOf(McpAuthError);
    expect(e.message).toMatch(/private\/internal/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("it is wired in", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("the client builds headers through the new path only for the new type and the extra headers", () => {
    const c = src("server/mcp-client.ts");
    expect(c).toContain("return mergeExtraHeaders(await baseAuthHeaders(server, auth, cfg), cfg);");
    expect(c).toMatch(/case CLIENT_CREDENTIALS: \{[\s\S]{0,300}getClientCredentialsToken\(server, cfg\)/);
    expect(c).toMatch(/if \(!auth \|\| auth\.authType === "none"\) return \{\};\n\s*const cfg/);
  });

  it("the save route validates before it stores, and checks the token URL against the outbound policy", () => {
    const r = src("server/routes/runtime.ts");
    const route = r.slice(r.indexOf('router.put("/api/mcp-servers/:id/auth"'));
    expect(route.indexOf("normalizeMcpAuthInput(")).toBeGreaterThan(0);
    expect(route.indexOf("normalizeMcpAuthInput(")).toBeLessThan(route.indexOf("storage.upsertMcpServerAuth("));
    expect(route.indexOf("vetMcpUrl(")).toBeLessThan(route.indexOf("storage.upsertMcpServerAuth("));
    expect(route).toMatch(/if \(!normalized\.ok\) return res\.status\(400\)/);
  });

  it("the audit event of a save names the headers and never a value", () => {
    const r = src("server/routes/runtime.ts");
    const route = r.slice(r.indexOf('router.put("/api/mcp-servers/:id/auth"'), r.indexOf("Real MCP OAuth 2.0 + PKCE connect flow"));
    expect(route).toContain("Object.keys(storedExtraHeaders(");
    expect(route).not.toMatch(/details: JSON\.stringify\(\{[^}]*(clientSecret|token|value)/);
  });
});
