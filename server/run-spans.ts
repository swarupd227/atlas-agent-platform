/**
 * Run span tree — makes any agent run auditable down to the wire.
 *
 * A run produces a tree of spans:
 *   run  →  step  →  tool_dispatch  →  wire call (connector HTTP / MCP / LLM)
 * each with a spanId, parentSpanId, start/end times, and attributes. The tree
 * is persisted on the trace (run_traces.spans_json) and can be exported in
 * OTLP ExportTraceServiceRequest shape for any OpenTelemetry backend.
 *
 * Design constraints:
 *  - Deterministic ids are NOT available (Math.random/Date.now are fine in the
 *    server runtime, unlike workflow scripts), so spanIds are random hex.
 *  - Timing uses Date.now(); nanosecond fields are derived (ms * 1e6) — good
 *    enough for audit/waterfall display without a high-res clock dependency.
 *  - A collector is cheap and per-run; nothing is global.
 */
import { randomBytes } from "crypto";

export interface RunSpan {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: "run" | "step" | "tool_dispatch" | "wire" | "llm";
  startMs: number;
  endMs: number | null;
  /** OTLP status: unset while open, ok/error when closed. */
  status: "unset" | "ok" | "error";
  attributes: Record<string, string | number | boolean>;
}

function newSpanId(): string {
  return randomBytes(8).toString("hex");
}
function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

export class RunSpanCollector {
  readonly traceId: string;
  /** Id of the first "run"-kind span — the natural parent for step spans. */
  rootId: string | null = null;
  private spans: RunSpan[] = [];
  private byId = new Map<string, RunSpan>();

  constructor(traceId?: string) {
    this.traceId = traceId ?? newTraceId();
  }

  /** Open a span; returns its id. Close it with end(). */
  start(name: string, kind: RunSpan["kind"], parentSpanId: string | null, attributes: Record<string, string | number | boolean> = {}): string {
    const span: RunSpan = {
      spanId: newSpanId(),
      parentSpanId,
      name,
      kind,
      startMs: Date.now(),
      endMs: null,
      status: "unset",
      attributes,
    };
    this.spans.push(span);
    this.byId.set(span.spanId, span);
    if (kind === "run" && this.rootId === null) this.rootId = span.spanId;
    return span.spanId;
  }

  end(spanId: string, status: "ok" | "error" = "ok", extraAttributes: Record<string, string | number | boolean> = {}): void {
    const span = this.byId.get(spanId);
    if (!span) return;
    span.endMs = Date.now();
    span.status = status;
    Object.assign(span.attributes, extraAttributes);
  }

  /** Record an already-completed span with an explicit duration (e.g. from a
   *  dispatch result that measured its own timing). */
  record(name: string, kind: RunSpan["kind"], parentSpanId: string | null, startMs: number, durationMs: number, status: "ok" | "error", attributes: Record<string, string | number | boolean> = {}): string {
    const span: RunSpan = {
      spanId: newSpanId(),
      parentSpanId,
      name,
      kind,
      startMs,
      endMs: startMs + Math.max(0, durationMs),
      status,
      attributes,
    };
    this.spans.push(span);
    this.byId.set(span.spanId, span);
    return span.spanId;
  }

  /** Persisted internal shape: flat span list + traceId, cheap to store/query. */
  toJSON(): { traceId: string; spans: RunSpan[] } {
    return { traceId: this.traceId, spans: this.spans };
  }

  /** OTLP ExportTraceServiceRequest JSON — consumable by any OTel collector. */
  toOtlp(resourceAttributes: Record<string, string> = {}): unknown {
    return { resourceSpans: [spansToResourceSpans(this.traceId, this.spans, resourceAttributes)] };
  }
}

/**
 * One OTLP ResourceSpans entry for a trace's span list. Pure, so a trace read back from the database
 * and a collector that has just finished produce the same thing. `includeErrors` false drops the
 * `error.message` attribute, which can carry a vendor's error text and is the only free-text field a
 * span has; the in-app span view keeps it, an export to another system leaves it out by default.
 */
export function spansToResourceSpans(
  traceId: string,
  spans: RunSpan[],
  resourceAttributes: Record<string, string> = {},
  options: { includeErrors?: boolean } = {},
): Record<string, unknown> {
  const includeErrors = options.includeErrors ?? true;
  const attrKV = (attrs: Record<string, string | number | boolean>) =>
    Object.entries(attrs).map(([key, value]) => ({
      key,
      value:
        typeof value === "number" ? (Number.isInteger(value) ? { intValue: value } : { doubleValue: value }) :
        typeof value === "boolean" ? { boolValue: value } :
        { stringValue: String(value) },
    }));
  const msToNano = (ms: number) => String(Math.round(ms * 1e6));
  return {
    resource: { attributes: attrKV({ "service.name": "atlas-agent-runtime", ...resourceAttributes }) },
    scopeSpans: [
      {
        scope: { name: "atlas.run-spans", version: "1.0.0" },
        spans: spans.map(s => {
          const attributes = { "span.kind": s.kind, ...s.attributes };
          if (!includeErrors) delete (attributes as Record<string, unknown>)["error.message"];
          return {
            traceId,
            spanId: s.spanId,
            parentSpanId: s.parentSpanId ?? undefined,
            name: s.name,
            kind: 1, // SPAN_KIND_INTERNAL
            startTimeUnixNano: msToNano(s.startMs),
            endTimeUnixNano: msToNano(s.endMs ?? s.startMs),
            attributes: attrKV(attributes),
            status: { code: s.status === "error" ? 2 : s.status === "ok" ? 1 : 0 },
          };
        }),
      },
    ],
  };
}
