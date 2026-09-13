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

/**
 * Merge a tool's proof into the turn's. A measured segment wins over "not
 * measured"; two measured summaries are joined so neither is lost.
 */
export function mergeProof(into: ProofEnvelope | null, from: Partial<ProofEnvelope> | undefined): ProofEnvelope {
  const base = into ?? emptyProof();
  if (!from) return base;
  const merge = (a: ProofSegment, b: ProofSegment | undefined): ProofSegment => {
    if (!b || b.status === "not_measured") return a;
    if (a.status === "not_measured") return b;
    if (a.summary === b.summary) return a;
    return { status: "measured", summary: `${a.summary} · ${b.summary}`, details: { ...(a.details ?? {}), ...(b.details ?? {}) } };
  };
  return {
    compliance: merge(base.compliance, from.compliance),
    context: merge(base.context, from.context),
    industry: merge(base.industry, from.industry),
  };
}
