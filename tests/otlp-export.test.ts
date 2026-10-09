/**
 * Forwarding run traces over OTLP (server/otlp-export.ts): the standard OpenTelemetry configuration
 * is read strictly (a wrong value stops the server, it is not ignored), the spans that go out carry
 * no free text unless asked, and no failure of the backend can reach a run: it is retried when
 * transient, counted when lost, and never thrown.
 *
 * Offline: the global fetch is the backend. The outbound policy is the real one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  describeOtlp, flush, flushOtlp, forwardTraceSpans, getOtlpExportStatus, parseKeyValueList, readOtlpConfig, resetOtlpExportForTests, validateOtlpEnv,
} from "../server/otlp-export";
import { RunSpanCollector, spansToResourceSpans, type RunSpan } from "../server/run-spans";

const KEYS = [
  "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
  "OTEL_EXPORTER_OTLP_HEADERS_FILE", "OTEL_EXPORTER_OTLP_TRACES_HEADERS_FILE", "OTEL_EXPORTER_OTLP_TIMEOUT", "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL", "OTEL_SERVICE_NAME", "OTEL_RESOURCE_ATTRIBUTES", "ASTRA_OTLP_INCLUDE_ERRORS", "BUILD_COMMIT",
  "ASTRA_OUTBOUND_POLICY", "ASTRA_ALLOWED_PRIVATE_CIDRS", "PORT", "SECURITY_MODE",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

const fetchMock = vi.fn();
const ok = () => ({ status: 200, headers: new Headers(), text: async () => "" });
const reply = (status: number, body = "", headers: Record<string, string> = {}) => ({ status, headers: new Headers(headers), text: async () => body });

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  resetOtlpExportForTests();
  fetchMock.mockReset().mockResolvedValue(ok());
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  resetOtlpExportForTests();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const configure = (extra: Record<string, string> = {}) => {
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "https://otlp.example.test/v1/traces";
  process.env.OTEL_EXPORTER_OTLP_HEADERS = "dd-api-key=SECRET-KEY-1234";
  Object.assign(process.env, extra);
};
const spanList = (n: number, extra: Record<string, string | number | boolean> = {}): RunSpan[] =>
  Array.from({ length: n }, (_, i) => ({
    spanId: String(i).padStart(16, "0"), parentSpanId: i === 0 ? null : "0".repeat(16), name: `span ${i}`, kind: i === 0 ? "run" : "step",
    startMs: 1_700_000_000_000 + i, endMs: 1_700_000_000_005 + i, status: "ok", attributes: { "tool.name": "t", ...extra },
  }));
const trace = (id: string, spans: RunSpan[], over: Record<string, unknown> = {}) => ({
  id, agentId: "agent-1", organizationId: "org-1", spansJson: { traceId: id.padEnd(32, "0"), spans }, ...over,
});
const sent = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init, body: JSON.parse(String(init.body)) }));

describe("the configuration", () => {
  it("is off without an endpoint", () => {
    expect(readOtlpConfig({})).toBeNull();
    expect(validateOtlpEnv()).toEqual([]);
    expect(describeOtlp()).toBe("otlp=off");
  });

  it("uses a traces endpoint as given, and appends /v1/traces to a base one", () => {
    expect(readOtlpConfig({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://otlp.example.test/custom/path?x=1" })!.tracesUrl).toBe("https://otlp.example.test/custom/path?x=1");
    expect(readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" })!.tracesUrl).toBe("http://collector:4318/v1/traces");
    expect(readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318///" })!.tracesUrl).toBe("http://collector:4318/v1/traces");
  });

  it("prefers the traces-specific endpoint and headers", () => {
    const c = readOtlpConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://general:4318", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://specific:4318/v1/traces",
      OTEL_EXPORTER_OTLP_HEADERS: "a=general", OTEL_EXPORTER_OTLP_TRACES_HEADERS: "a=specific",
    })!;
    expect(c.tracesUrl).toBe("http://specific:4318/v1/traces");
    expect(c.headers).toEqual({ a: "specific" });
  });

  it("reads headers as name=value pairs, percent-decoding the value", () => {
    expect(parseKeyValueList("dd-api-key=abc, x-team=a%20b ,empty=", "H")).toEqual({ "dd-api-key": "abc", "x-team": "a b", empty: "" });
  });

  it.each([
    ["a pair with no name", "=value"],
    ["a pair with no =", "justaname"],
    ["a name with a space", "bad name=v"],
    ["a name that is not a header name", "bad:name=v"],
    ["a value with a line break", "a=x%0d%0ainjected: 1"],
    ["a value that is not percent-encoding", "a=%E0%A4%A"],
    ["the same name twice", "a=1,A=2"],
  ])("refuses headers with %s", (_n, raw) => {
    expect(() => readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318", OTEL_EXPORTER_OTLP_HEADERS: raw })).toThrow();
  });

  it("reads headers from a mounted secret file, and refuses both the variable and the file", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "otlp-"));
    const file = path.join(dir, "headers");
    writeFileSync(file, "dd-api-key=from-file\n");
    expect(readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_HEADERS_FILE: file })!.headers).toEqual({ "dd-api-key": "from-file" });
    expect(() => readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_HEADERS: "a=1", OTEL_EXPORTER_OTLP_HEADERS_FILE: file })).toThrow(/not both/);
    expect(() => readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_HEADERS_FILE: path.join(dir, "missing") })).toThrow(/cannot read/);
  });

  it.each([
    ["not a URL", { OTEL_EXPORTER_OTLP_ENDPOINT: "collector:4318 x" }],
    ["not http(s)", { OTEL_EXPORTER_OTLP_ENDPOINT: "grpc://collector:4317" }],
    ["a URL with a password", { OTEL_EXPORTER_OTLP_ENDPOINT: "https://user:pw@otlp.example.test" }],
    ["protobuf", { OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf" }],
    ["gRPC", { OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "grpc" }],
    ["a timeout that is not a number", { OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_TIMEOUT: "ten" }],
    ["a timeout that is too large", { OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_TIMEOUT: "999999" }],
    ["a flag that is not true or false", { OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", ASTRA_OTLP_INCLUDE_ERRORS: "yes" }],
    ["resource attributes that are not pairs", { OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_RESOURCE_ATTRIBUTES: "nope" }],
  ])("refuses %s, which would otherwise look configured and send nothing", (_n, env) => {
    expect(() => readOtlpConfig(env as any)).toThrow();
    Object.assign(process.env, env);
    expect(validateOtlpEnv()).toHaveLength(1);
  });

  it("accepts the protocol it speaks, and is not bothered by a protocol when nothing is configured", () => {
    expect(readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_EXPORTER_OTLP_PROTOCOL: "HTTP/JSON" })).not.toBeNull();
    expect(readOtlpConfig({ OTEL_EXPORTER_OTLP_PROTOCOL: "grpc" })).toBeNull();
  });

  it("builds the resource: service name, attributes, and the build as the version", () => {
    const c = readOtlpConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://c", OTEL_SERVICE_NAME: "astra-prod", OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=prod,team=a%20b", BUILD_COMMIT: "abc123",
    })!;
    expect(c.serviceName).toBe("astra-prod");
    expect(c.resourceAttributes).toEqual({ "deployment.environment": "prod", team: "a b", "service.version": "abc123" });
    expect(readOtlpConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c" })!.serviceName).toBe("atlas-agent-runtime");
  });

  it("describes itself without a header value or the URL's path", () => {
    configure({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://otlp.example.test/secret/path?token=zzz" });
    const line = describeOtlp();
    expect(line).toBe("otlp=otlp.example.test headers=1");
    expect(line).not.toMatch(/SECRET|zzz|path/);
  });
});

describe("the spans that go out", () => {
  const withError = (): RunSpan[] => [{ ...spanList(1)[0], attributes: { "tool.name": "t", "error.message": "vendor said: account 1234 is locked" } }];

  it("drop the error text unless asked, and keep everything else", () => {
    const stripped = JSON.stringify(spansToResourceSpans("t".repeat(32), withError(), {}, { includeErrors: false }));
    expect(stripped).not.toMatch(/error\.message|account 1234/);
    expect(stripped).toContain("tool.name");
    expect(JSON.stringify(spansToResourceSpans("t".repeat(32), withError(), {}, { includeErrors: true }))).toContain("account 1234");
  });

  it("keep the in-app span view whole: toOtlp still includes the error text", () => {
    const c = new RunSpanCollector("a".repeat(32));
    c.record("w", "wire", null, 1, 1, "error", { "error.message": "kept" });
    expect(JSON.stringify(c.toOtlp())).toContain("kept");
  });

  it("are OTLP: trace id, nanosecond times, status", () => {
    const [{ scopeSpans }] = [spansToResourceSpans("b".repeat(32), spanList(2), { "service.name": "x" })] as any;
    const s = scopeSpans[0].spans[1];
    expect(s.traceId).toBe("b".repeat(32));
    expect(s.startTimeUnixNano).toBe(String(Math.round(1_700_000_000_001 * 1e6)));
    expect(s.status).toEqual({ code: 1 });
    expect(s.parentSpanId).toBe("0".repeat(16));
  });
});

describe("forwarding a trace", () => {
  it("does nothing, and says nothing, when export is not configured", async () => {
    forwardTraceSpans(trace("aaa", spanList(3)));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOtlpExportStatus()).toMatchObject({ configured: false, queuedSpans: 0, exportedSpans: 0 });
  });

  it("sends the spans as OTLP JSON to the endpoint, with the headers, from the configuration", async () => {
    configure({ OTEL_SERVICE_NAME: "astra-test", OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=test" });
    forwardTraceSpans(trace("t1", spanList(3)));
    await flush();
    const [call] = sent();
    expect(call.url).toBe("https://otlp.example.test/v1/traces");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toMatchObject({ "Content-Type": "application/json", "dd-api-key": "SECRET-KEY-1234" });
    const resource = call.body.resourceSpans[0];
    const attrs = Object.fromEntries(resource.resource.attributes.map((a: any) => [a.key, a.value.stringValue]));
    expect(attrs).toMatchObject({ "service.name": "astra-test", "deployment.environment": "test", "agent.id": "agent-1", "run.trace_id": "t1", "astra.org.id": "org-1" });
    expect(resource.scopeSpans[0].spans).toHaveLength(3);
    expect(getOtlpExportStatus()).toMatchObject({ exportedSpans: 3, exportedBatches: 1, failedSpans: 0, queuedSpans: 0 });
  });

  it("sends many traces in as few requests as fit, each under the batch size", async () => {
    configure();
    const big = "x".repeat(300_000);
    for (let i = 0; i < 30; i++) forwardTraceSpans(trace(`b${String(i).padStart(3, "0")}`, spanList(1, { blob: big })));
    await flush();
    const calls = sent();
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.length).toBeLessThan(30);
    for (const c of calls) expect(String(c.init.body).length).toBeLessThanOrEqual(4 * 1024 * 1024 + 400_000);
    expect(calls.reduce((n, c) => n + c.body.resourceSpans.length, 0)).toBe(30);
    expect(getOtlpExportStatus().exportedSpans).toBe(30);
  });

  it("sends a trace once, and again only when it has grown", async () => {
    configure();
    forwardTraceSpans(trace("dup", spanList(2)));
    forwardTraceSpans(trace("dup", spanList(2)));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // One copy in the request, not two (they would share a batch).
    expect(sent()[0].body.resourceSpans).toHaveLength(1);
    expect(getOtlpExportStatus().exportedSpans).toBe(2);
    forwardTraceSpans(trace("dup", spanList(5)));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getOtlpExportStatus().exportedSpans).toBe(7);
  });

  it("leaves out the error text by default, and puts it in when asked", async () => {
    configure();
    const spans = [{ ...spanList(1)[0], attributes: { "error.message": "vendor text" } }];
    forwardTraceSpans(trace("e1", spans));
    await flush();
    expect(String(sent()[0].init.body)).not.toContain("vendor text");
    resetOtlpExportForTests();
    fetchMock.mockClear();
    process.env.ASTRA_OTLP_INCLUDE_ERRORS = "true";
    forwardTraceSpans(trace("e2", spans));
    await flush();
    expect(String(sent()[0].init.body)).toContain("vendor text");
  });

  it("ignores a trace with no usable spans, and never throws on garbage", () => {
    configure();
    for (const bad of [null, undefined, {}, { traceId: "x" }, { traceId: "x", spans: [] }, { traceId: 5, spans: [1] }, "text"]) {
      expect(() => forwardTraceSpans({ id: "g", spansJson: bad })).not.toThrow();
    }
    expect(getOtlpExportStatus().queuedSpans).toBe(0);
  });

  it("drops what does not fit in the queue, and counts it", async () => {
    configure();
    forwardTraceSpans(trace("huge1", spanList(15_000)));
    forwardTraceSpans(trace("huge2", spanList(10_000)));
    const s = getOtlpExportStatus();
    expect(s.queuedSpans).toBe(15_000);
    expect(s.droppedSpans).toBe(10_000);
    expect(s.lastError).toMatch(/queue full/);
  });

  it("is never thrown when the configuration is invalid at the moment of use", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "not a url";
    expect(() => forwardTraceSpans(trace("bad", spanList(1)))).not.toThrow();
    expect(getOtlpExportStatus()).toMatchObject({ configured: false });
    expect(getOtlpExportStatus().configError).toMatch(/valid URL/);
  });
});

describe("when the backend does not cooperate", () => {
  it("retries a 503 and counts the spans exported once it answers", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(ok());
    forwardTraceSpans(trace("r1", spanList(2)));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getOtlpExportStatus()).toMatchObject({ exportedSpans: 2, failedSpans: 0 });
  });

  it("waits as long as the backend says on a 429", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(reply(429, "", { "retry-after": "1" })).mockResolvedValueOnce(ok());
    const started = Date.now();
    forwardTraceSpans(trace("r2", spanList(1)));
    await flush();
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(getOtlpExportStatus().exportedSpans).toBe(1);
  });

  it("does not retry a refusal of the key: it counts the loss and says why", async () => {
    configure();
    fetchMock.mockResolvedValue(reply(403, "Forbidden"));
    forwardTraceSpans(trace("r3", spanList(4)));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const s = getOtlpExportStatus();
    expect(s).toMatchObject({ exportedSpans: 0, failedSpans: 4 });
    expect(s.lastError).toBe("HTTP 403: Forbidden");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("HTTP 403"));
  });

  it("gives up on a backend that keeps failing, after three attempts", async () => {
    configure();
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    forwardTraceSpans(trace("r4", spanList(1)));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getOtlpExportStatus()).toMatchObject({ failedSpans: 1, lastError: "connect ECONNREFUSED" });
  }, 10_000);

  it("does not retry what the outbound policy refuses", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    configure({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://10.9.9.9/v1/traces" });
    forwardTraceSpans(trace("r5", spanList(1)));
    const started = Date.now();
    await flush();
    // A retry would wait 500ms, then 1000ms, before giving up; a refusal is final at once.
    expect(Date.now() - started).toBeLessThan(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOtlpExportStatus()).toMatchObject({ failedSpans: 1 });
    expect(getOtlpExportStatus().lastError).toMatch(/outbound policy.*private/i);
  });

  it("sends to a private collector the operator allowed", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    process.env.ASTRA_ALLOWED_PRIVATE_CIDRS = "10.9.9.9@4318";
    configure({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://10.9.9.9:4318/v1/traces", OTEL_EXPORTER_OTLP_TIMEOUT: "100" });
    forwardTraceSpans(trace("r6", spanList(1)));
    await flush();
    // The policy lets it through to the network (which this offline test does not have).
    expect(getOtlpExportStatus().lastError ?? "").not.toMatch(/outbound policy/i);
  }, 10_000);

  it("shutdown does not wait for a backend that never answers", async () => {
    configure();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    forwardTraceSpans(trace("r7", spanList(1)));
    const started = Date.now();
    await flushOtlp(100);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("reports counts, the host and the header names, and no header value or URL path", async () => {
    configure({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://otlp.example.test/private/path?token=zzz" });
    forwardTraceSpans(trace("s1", spanList(1)));
    await flush();
    const status = getOtlpExportStatus();
    expect(status).toMatchObject({ configured: true, endpointHost: "otlp.example.test", headerNames: ["dd-api-key"] });
    expect(JSON.stringify(status)).not.toMatch(/SECRET|zzz|private\/path/);
  });
});

describe("it is wired in", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("hooks both places a trace row is written, so every runtime that records spans exports them", () => {
    const s = src("server/storage.ts");
    expect(s).toMatch(/async createTrace\([\s\S]{0,600}forwardTraceSpans\(created\)/);
    expect(s).toMatch(/async updateTrace\([\s\S]{0,400}forwardTraceSpans\(updated\)/);
  });

  it("no longer exports from a single route", () => {
    expect(src("server/routes/runtime.ts")).not.toContain("exportSpansOtlp");
    expect(src("server/run-spans.ts")).not.toContain("exportSpansOtlp");
  });

  it("is validated at boot and flushed at shutdown, before the database closes", () => {
    expect(src("server/config.ts")).toContain("errors.push(...validateOtlpEnv())");
    const idx = src("server/index.ts");
    expect(idx.indexOf("flushOtlp(")).toBeGreaterThan(0);
    expect(idx.indexOf("flushOtlp(")).toBeLessThan(idx.indexOf("pool.end()"));
  });

  it("has a status route that only an administrator may read", () => {
    expect(src("server/routes/observability.ts")).toMatch(/router\.get\("\/api\/observability\/export\/status", checkPermission\("manage_platform_settings"\)/);
  });
});
