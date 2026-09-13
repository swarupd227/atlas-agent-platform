/**
 * Proof envelope helpers. Rule 11: every result proves itself three ways --
 * compliance, context, industry -- and a segment we can't fill says
 * "not measured" instead of being left out or guessed.
 */
import type { ProofEnvelope, ProofSegment } from "./types";

export const NOT_MEASURED: ProofSegment = { status: "not_measured" };

export function emptyProof(): ProofEnvelope {
  return { compliance: NOT_MEASURED, context: NOT_MEASURED, industry: NOT_MEASURED };
}

/** Fill any missing segment with "not measured". */
export function completeProof(partial?: Partial<ProofEnvelope> | null): ProofEnvelope {
  return {
    compliance: partial?.compliance ?? NOT_MEASURED,
    context: partial?.context ?? NOT_MEASURED,
    industry: partial?.industry ?? NOT_MEASURED,
  };
}

const READ_ONLY = /^Read only · (.*)$/;

function partsOf(segment: Extract<ProofSegment, { status: "measured" }>): string[] {
  const parts = segment.details?.parts;
  return Array.isArray(parts) ? (parts as string[]) : [segment.summary];
}

/**
 * One line from many tools' summaries: each distinct fact once, and the
 * generic "Read only · permission X" lines folded into one, behind anything
 * more specific (a confirmation, policies bound, a gate result).
 */
export function summarizeParts(parts: string[]): string {
  const specific = parts.filter((p) => !READ_ONLY.test(p));
  const permissions = Array.from(
    new Set(parts.map((p) => READ_ONLY.exec(p)?.[1]).filter((p): p is string => !!p && p !== "no special permission").map((p) => p.replace(/^permission /, ""))),
  );
  const readOnly = parts.length > specific.length ? `Read only${permissions.length ? ` · ${permissions.length === 1 ? "permission" : "permissions"} ${permissions.join(", ")}` : ""}` : null;
  return [...specific, ...(readOnly && specific.length === 0 ? [readOnly] : [])].join(" · ");
}

/**
 * Merge a tool's proof into the turn's. A measured segment wins over "not
 * measured"; distinct measured facts are all kept (see summarizeParts).
 */
export function mergeProof(into: ProofEnvelope | null, from: Partial<ProofEnvelope> | undefined): ProofEnvelope {
  const base = into ?? emptyProof();
  if (!from) return base;
  const merge = (a: ProofSegment, b: ProofSegment | undefined): ProofSegment => {
    if (!b || b.status === "not_measured") return a;
    if (a.status === "not_measured") return b;
    const parts = Array.from(new Set([...partsOf(a), ...partsOf(b)]));
    if (parts.length === 1) return a;
    return { status: "measured", summary: summarizeParts(parts), details: { ...(a.details ?? {}), ...(b.details ?? {}), parts } };
  };
  return {
    compliance: merge(base.compliance, from.compliance),
    context: merge(base.context, from.context),
    industry: merge(base.industry, from.industry),
  };
}
