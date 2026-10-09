/**
 * Forwarding run traces to an OpenTelemetry backend (Datadog, a Collector, anything that takes OTLP
 * over HTTP/JSON).
 *
 * The span tree of a run is persisted with its trace (run_traces.spans_json). This module is what
 * sends it somewhere: one hook at the place a trace row is written (storage.createTrace and
 * updateTrace), so every runtime that records spans exports them, not the one that happened to
 * call an exporter.
 *
 * Configuration is the standard OpenTelemetry environment, so it reads the way an operator expects:
 *   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT   the full URL, used as given (what a direct Datadog intake needs)
 *   OTEL_EXPORTER_OTLP_ENDPOINT          a base URL; "/v1/traces" is appended
 *   OTEL_EXPORTER_OTLP_TRACES_HEADERS    "name=value,name=value" (e.g. dd-api-key=...); falls back to
 *   OTEL_EXPORTER_OTLP_HEADERS           ...the general one. Either may instead be given as <NAME>_FILE
 *                                        (a path to a mounted secret).
 *   OTEL_EXPORTER_OTLP_TIMEOUT           milliseconds per request (default 10000)
 *   OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES   the resource the spans belong to
 *   ASTRA_OTLP_INCLUDE_ERRORS            "true" keeps the error text a wire span carries; off by default
 *
 * It sends OTLP/HTTP with JSON, which is what Datadog's direct intake and every Collector accept; it
 * does not speak gRPC or protobuf, and a configuration that asks for either stops the server at
 * boot rather than being ignored. Nothing here can fail or slow a run: spans are queued, sent in
 * the background in bounded batches, retried on a transient failure, and counted when they are
 * dropped. The request goes out under the outbound policy (server/url-safety.ts), so a Collector on
 * a private subnet needs ASTRA_ALLOWED_PRIVATE_CIDRS like any other private target.
 */
import fs from "node:fs";
import { UnsafeUrlError, policyFetch } from "./url-safety";
import { spansToResourceSpans, type RunSpan } from "./run-spans";

export interface OtlpConfig {
  tracesUrl: string;
  headers: Record<string, string>;
  serviceName: string;
  resourceAttributes: Record<string, string>;
  includeErrors: boolean;
  timeoutMs: number;
}

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const DEFAULT_TIMEOUT_MS = 10_000;

// ─── Configuration ───────────────────────────────────────────────────────────

/** The value of NAME, or of the file NAME_FILE names. Both set is a mistake worth stopping for. */
function readValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const inline = env[name];
  const file = env[`${name}_FILE`];
  if (inline && file) throw new Error(`set ${name} or ${name}_FILE, not both`);
  if (file) {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch (e: any) {
      throw new Error(`cannot read ${name}_FILE (${file}): ${e.message}`);
    }
  }
  return inline && inline.trim() !== "" ? inline.trim() : undefined;
}

/** "a=b,c=d" as the OpenTelemetry specification writes it: values may be percent-encoded. */
export function parseKeyValueList(raw: string, what: string, nameOk: (n: string) => boolean = () => true): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    if (part.trim() === "") continue;
    const eq = part.indexOf("=");
    if (eq <= 0) throw new Error(`${what}: "${part.trim().slice(0, 40)}" is not name=value`);
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      throw new Error(`${what}: the value of "${name}" is not valid percent-encoding`);
    }
    if (!nameOk(name)) throw new Error(`${what}: "${name}" is not a valid name`);
    if (/[\r\n\0]/.test(value)) throw new Error(`${what}: the value of "${name}" holds a line break`);
    if (Object.keys(out).some((k) => k.toLowerCase() === name.toLowerCase())) throw new Error(`${what}: "${name}" is given twice`);
    out[name] = value;
  }
  return out;
}

/** Null when no endpoint is set; throws with a plain message when what is set cannot be used. */
export function readOtlpConfig(env: NodeJS.ProcessEnv = process.env): OtlpConfig | null {
  const full = readValue(env, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT");
  const base = readValue(env, "OTEL_EXPORTER_OTLP_ENDPOINT");
  const raw = full ?? (base ? `${base.replace(/\/+$/, "")}/v1/traces` : undefined);

  const protocol = (readValue(env, "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL") ?? readValue(env, "OTEL_EXPORTER_OTLP_PROTOCOL"))?.toLowerCase();
  if (protocol && protocol !== "http/json") {
    if (!raw) return null;
    throw new Error(`OTEL_EXPORTER_OTLP_PROTOCOL is "${protocol}", but this server sends OTLP over HTTP with JSON: set it to http/json or leave it unset`);
  }
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("the OTLP traces endpoint is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("the OTLP traces endpoint must be an http or https URL");
  if (url.username || url.password) throw new Error("the OTLP traces endpoint must not contain a user name or password: put credentials in OTEL_EXPORTER_OTLP_HEADERS");

  const headersRaw = readValue(env, "OTEL_EXPORTER_OTLP_TRACES_HEADERS") ?? readValue(env, "OTEL_EXPORTER_OTLP_HEADERS");
  const headers = headersRaw ? parseKeyValueList(headersRaw, "OTEL_EXPORTER_OTLP_HEADERS", (n) => HEADER_NAME.test(n)) : {};

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const t = readValue(env, "OTEL_EXPORTER_OTLP_TIMEOUT");
  if (t !== undefined) {
    timeoutMs = Number(t);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("OTEL_EXPORTER_OTLP_TIMEOUT must be a whole number of milliseconds between 1 and 120000");
  }

  const inc = (env.ASTRA_OTLP_INCLUDE_ERRORS ?? "").trim().toLowerCase();
  if (inc !== "" && inc !== "true" && inc !== "false") throw new Error('ASTRA_OTLP_INCLUDE_ERRORS must be "true" or "false"');

  const resourceAttributes = env.OTEL_RESOURCE_ATTRIBUTES ? parseKeyValueList(env.OTEL_RESOURCE_ATTRIBUTES, "OTEL_RESOURCE_ATTRIBUTES") : {};
  if (env.BUILD_COMMIT && !resourceAttributes["service.version"]) resourceAttributes["service.version"] = env.BUILD_COMMIT;

  return {
    tracesUrl: url.toString(),
    headers,
    serviceName: (env.OTEL_SERVICE_NAME ?? "").trim() || "atlas-agent-runtime",
    resourceAttributes,
    includeErrors: inc === "true",
    timeoutMs,
  };
}

/** Problems with the OTLP environment, for the boot-time check. */
export function validateOtlpEnv(): string[] {
  try {
    readOtlpConfig();
    return [];
  } catch (e: any) {
    return [`OpenTelemetry export is misconfigured: ${e.message}`];
  }
}

/** A line for the startup log. Never the URL's path or query, and never a header value. */
export function describeOtlp(): string {
  try {
    const c = readOtlpConfig();
    if (!c) return "otlp=off";
    return `otlp=${new URL(c.tracesUrl).host} headers=${Object.keys(c.headers).length}`;
  } catch {
    return "otlp=invalid";
  }
}

let cachedKey: string | null = null;
let cached: OtlpConfig | null = null;
function config(): OtlpConfig | null {
  const key = [
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_HEADERS", "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_EXPORTER_OTLP_TRACES_HEADERS_FILE", "OTEL_EXPORTER_OTLP_HEADERS_FILE", "OTEL_EXPORTER_OTLP_TIMEOUT", "OTEL_SERVICE_NAME",
    "OTEL_RESOURCE_ATTRIBUTES", "ASTRA_OTLP_INCLUDE_ERRORS", "OTEL_EXPORTER_OTLP_PROTOCOL", "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL", "BUILD_COMMIT",
  ].map((k) => process.env[k] ?? "").join("\u0001");
  if (cachedKey === key) return cached;
  cached = readOtlpConfig();
  cachedKey = key;
  return cached;
}

// ─── The queue ───────────────────────────────────────────────────────────────

const MAX_QUEUED_SPANS = 20_000;
const FLUSH_INTERVAL_MS = 2_000;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
/** Datadog's documented limit is 15 MiB uncompressed; a single trace larger than this is not sent. */
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const RECENT_TRACES = 5_000;

interface QueuedTrace {
  resourceSpans: Record<string, unknown>;
  spans: number;
  bytes: number;
}

interface Stats {
  exportedSpans: number;
  exportedBatches: number;
  failedSpans: number;
  droppedSpans: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

let queue: QueuedTrace[] = [];
let queuedSpans = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let stats: Stats = { exportedSpans: 0, exportedBatches: 0, failedSpans: 0, droppedSpans: 0, lastSuccessAt: null, lastErrorAt: null, lastError: null };
const seen = new Map<string, number>();
let lastAuthWarning = 0;

function recordError(message: string): void {
  stats.lastError = message.slice(0, 300);
  stats.lastErrorAt = new Date().toISOString();
}

/** What the admin status view shows. Never a header, never the URL's path or query. */
export function getOtlpExportStatus() {
  let c: OtlpConfig | null = null;
  let configError: string | null = null;
  try {
    c = config();
  } catch (e: any) {
    configError = e.message;
  }
  return {
    configured: c !== null,
    configError,
    endpointHost: c ? new URL(c.tracesUrl).host : null,
    headerNames: c ? Object.keys(c.headers) : [],
    includeErrorMessages: c?.includeErrors ?? false,
    queuedSpans,
    ...stats,
  };
}

export function resetOtlpExportForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  queue = [];
  queuedSpans = 0;
  flushing = null;
  stats = { exportedSpans: 0, exportedBatches: 0, failedSpans: 0, droppedSpans: 0, lastSuccessAt: null, lastErrorAt: null, lastError: null };
  seen.clear();
  cachedKey = null;
  cached = null;
  lastAuthWarning = 0;
}

function schedule(): void {
  if (timer || queue.length === 0) return;
  timer = setTimeout(() => {
    timer = null;
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  timer.unref?.();
}

/**
 * Queue a trace's spans for export. Safe to call from anywhere on any trace row: it does nothing
 * when export is not configured, and it never throws or waits.
 */
export function forwardTraceSpans(trace: { id: string; agentId?: string | null; organizationId?: string | null; spansJson?: unknown }): void {
  try {
    const stored = trace.spansJson as { traceId?: string; spans?: RunSpan[] } | null | undefined;
    if (!stored || typeof stored.traceId !== "string" || !Array.isArray(stored.spans) || stored.spans.length === 0) return;
    let cfg: OtlpConfig | null;
    try {
      cfg = config();
    } catch (e: any) {
      recordError(`misconfigured: ${e.message}`);
      return;
    }
    if (!cfg) return;

    // The same trace row is written more than once in some paths; a trace goes out once per span count.
    if ((seen.get(stored.traceId) ?? 0) >= stored.spans.length) return;
    if (seen.size >= RECENT_TRACES) seen.delete(seen.keys().next().value as string);
    seen.set(stored.traceId, stored.spans.length);

    if (queuedSpans + stored.spans.length > MAX_QUEUED_SPANS) {
      stats.droppedSpans += stored.spans.length;
      recordError(`queue full (${MAX_QUEUED_SPANS} spans): trace dropped`);
      return;
    }
    const resource: Record<string, string> = {
      ...cfg.resourceAttributes,
      "service.name": cfg.serviceName,
      "run.trace_id": trace.id,
      ...(trace.agentId ? { "agent.id": trace.agentId } : {}),
      ...(trace.organizationId ? { "astra.org.id": trace.organizationId } : {}),
    };
    const resourceSpans = spansToResourceSpans(stored.traceId, stored.spans, resource, { includeErrors: cfg.includeErrors });
    queue.push({ resourceSpans, spans: stored.spans.length, bytes: JSON.stringify(resourceSpans).length });
    queuedSpans += stored.spans.length;
    schedule();
  } catch (e: any) {
    // Telemetry must never break the write it is attached to.
    recordError(`could not queue a trace: ${e?.message ?? e}`);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function sendBatch(cfg: OtlpConfig, body: string, spans: number): Promise<void> {
  const send = policyFetch("otlp");
  let lastProblem = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await send(cfg.tracesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cfg.headers },
        body,
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (res.status >= 200 && res.status < 300) {
        stats.exportedSpans += spans;
        stats.exportedBatches += 1;
        stats.lastSuccessAt = new Date().toISOString();
        return;
      }
      const text = await res.text().catch(() => "");
      lastProblem = `HTTP ${res.status}${text ? `: ${text.replace(/[\r\n\0]+/g, " ").slice(0, 160)}` : ""}`;
      if (res.status === 401 || res.status === 403) {
        if (Date.now() - lastAuthWarning > 10 * 60_000) {
          lastAuthWarning = Date.now();
          console.error(`[otlp] the backend refused the export with HTTP ${res.status}: check the API key header and that the endpoint matches the backend's site`);
        }
      }
      // Transient: try again. Anything else is the answer.
      if (res.status !== 429 && res.status < 500) break;
      const retryAfter = Number(res.headers?.get?.("retry-after"));
      if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 500 * 2 ** (attempt - 1));
    } catch (e: any) {
      lastProblem = e instanceof UnsafeUrlError ? `refused by the outbound policy: ${e.message}` : (e?.name === "TimeoutError" || e?.name === "AbortError") ? `timed out after ${cfg.timeoutMs}ms` : `${e?.message ?? e}`;
      if (e instanceof UnsafeUrlError) break;
      if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  stats.failedSpans += spans;
  recordError(lastProblem);
}

async function flushOnce(): Promise<void> {
  let cfg: OtlpConfig | null;
  try {
    cfg = config();
  } catch {
    cfg = null;
  }
  while (queue.length > 0) {
    if (!cfg) {
      // Export was turned off or broken while spans waited: they cannot go anywhere.
      stats.droppedSpans += queuedSpans;
      queue = [];
      queuedSpans = 0;
      return;
    }
    const batch: QueuedTrace[] = [];
    let bytes = 0;
    while (queue.length > 0 && (batch.length === 0 || bytes + queue[0].bytes <= MAX_BATCH_BYTES)) {
      const next = queue.shift()!;
      batch.push(next);
      bytes += next.bytes;
    }
    const spans = batch.reduce((n, t) => n + t.spans, 0);
    queuedSpans -= spans;
    if (bytes > MAX_REQUEST_BYTES) {
      stats.failedSpans += spans;
      recordError(`a trace of ${bytes} bytes is larger than the ${MAX_REQUEST_BYTES} byte request limit`);
      continue;
    }
    await sendBatch(cfg, JSON.stringify({ resourceSpans: batch.map((t) => t.resourceSpans) }), spans);
  }
}

/** Send what is queued, now. One flush runs at a time; a call while one is running waits for it. */
export function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!flushing) {
    flushing = flushOnce().finally(() => {
      flushing = null;
      schedule();
    });
  }
  return flushing;
}

/** For shutdown: send what is waiting, but not for longer than `timeoutMs`. */
export async function flushOtlp(timeoutMs: number): Promise<void> {
  await Promise.race([flush(), sleep(timeoutMs)]);
}
