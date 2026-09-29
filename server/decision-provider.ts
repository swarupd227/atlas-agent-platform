/**
 * The decision seam: one typed question in, one answer out, and the caller
 * never knows which engine answered.
 *
 * A judgment-shaped question -- is this condition satisfied, which branch,
 * how severe -- is not a text-generation task, and a decision model answers it
 * in ~250 ms for a fraction of a cent (Phase 0 measured Jev at 100% agreement
 * with Claude Sonnet 4.5 on 250 such questions wherever it was confident).
 * Every judgment-shaped call site goes through decide(); the route is a
 * deterministic function of the platform settings, the site and the
 * organization (server/decision-settings.ts), never a second model call:
 *
 *   llm     the incumbent language model answers, as before this seam existed
 *   shadow  the LLM answers and decides; Jev is asked too and both are recorded
 *   jev     Jev answers; below the site's threshold the LLM answers instead
 *
 * Confidence: for choice/score it is the vendor's spread statistic; for a
 * noul, which has none, it is the margin |p - 0.5| * 2 that Phase 0
 * thresholded on. Neither is a calibrated probability, which is why the
 * fallback exists. An LLM answer carries no confidence (null).
 *
 * Every call writes one decision_audit row, the same table the shadow
 * measurement fills, so cost, latency and agreement stay measurable after
 * routing begins. The judged state is stored as a hash, never as text.
 */
import { createHash } from "crypto";
import { completeWithFallback } from "./llm-provider";
import { callJev, recordDecisionAudit, type JevAnswer, type JevQuestion } from "./decision-shadow";
import { resolveDecisionRoute, type DecisionMode } from "./decision-settings";

export type DecisionKind = "noul" | "choice" | "score";

export interface DecisionRequest {
  kind: DecisionKind;
  /** Which call site is asking (audit and per-site routing): "evaluateCondition", "handoff", "decision_step"... */
  site: string;
  /** What is being judged. Text or JSON; capped at ~32k tokens by the engine's own limit. */
  state: unknown;
  /** The question, phrased so that "true" / the chosen option is the affirmative reading. */
  instructions: string;
  /** noul: what true and false mean; choice: option -> description; score: ordered level descriptions. */
  criteria?: { true: string; false: string } | Record<string, string> | string[];
  /** Organization whose residency may force the LLM route. */
  orgId?: string | null;
  /** Overrides the site's act threshold for this call. */
  threshold?: number;
  /**
   * The exact prompt the incumbent LLM should see when it answers, so a site
   * that predates this seam keeps its wording byte for byte. Without it the
   * provider renders a generic prompt from instructions and criteria.
   */
  llmPrompt?: string;
  /** Short label for the audit row (a condition, a policy name); never the state. */
  subject?: string;
}

export interface DecisionResult {
  kind: DecisionKind;
  /** noul: boolean; choice: the option key; score: the level index. */
  answer: boolean | string | number;
  probabilities?: Record<string, number>;
  /** Decision-model confidence or margin; null when the LLM answered. */
  confidence: number | null;
  engine: "jev" | "llm";
  mode: DecisionMode;
  model: string;
  latencyMs: number;
  inputTokens: number;
  costUsd: number;
  /** Why the LLM answered when the route was jev. */
  fallbackReason?: "below_threshold" | "jev_error" | "residency" | "no_key";
}

// Vendor list price, USD per 1k input tokens; output is free. Kept here rather
// than in the LLM price table until the decision model has a provider entry.
export const JEV_USD_PER_1K_INPUT = 0.000042;

const noulMargin = (p: number) => Math.abs(p - 0.5) * 2;

function toJevQuestion(req: DecisionRequest): JevQuestion {
  switch (req.kind) {
    case "noul":
      return { type: "noul", instructions: req.instructions, criteria: req.criteria as { true: string; false: string } | undefined };
    case "choice":
      return { type: "choice", instructions: req.instructions, criteria: (req.criteria ?? {}) as Record<string, string> };
    case "score":
      return { type: "score", instructions: req.instructions, criteria: (req.criteria ?? []) as string[] };
  }
}

function fromJevAnswer(kind: DecisionKind, a: JevAnswer | undefined): { answer: boolean | string | number; probabilities?: Record<string, number>; confidence: number } | null {
  if (!a || a.type !== kind) return null;
  if (a.type === "noul") return { answer: a.noul >= 0.5, confidence: noulMargin(a.noul), probabilities: { true: a.noul, false: 1 - a.noul } };
  if (a.type === "choice") return { answer: a.choice, probabilities: a.probabilities, confidence: a.confidence };
  return { answer: Math.round(a.score), probabilities: a.probabilities, confidence: a.confidence };
}

// ── The incumbent LLM as a decision engine ──────────────────────────────────

function renderLlmPrompt(req: DecisionRequest): string {
  if (req.llmPrompt) return req.llmPrompt;
  const state = typeof req.state === "string" ? req.state : JSON.stringify(req.state, null, 2);
  const head = `${req.instructions}\n\nSTATE:\n${state}\n\n`;
  switch (req.kind) {
    case "noul": {
      const c = req.criteria as { true: string; false: string } | undefined;
      const legend = c ? `true = ${c.true}\nfalse = ${c.false}\n\n` : "";
      return `${head}${legend}Respond with ONLY "true" or "false".`;
    }
    case "choice": {
      const options = Object.entries((req.criteria ?? {}) as Record<string, string>).map(([k, d]) => `- ${k}: ${d}`).join("\n");
      return `${head}OPTIONS:\n${options}\n\nRespond with ONLY a JSON object {"choice": "<one option key exactly as written>"}.`;
    }
    case "score": {
      const levels = ((req.criteria ?? []) as string[]).map((d, i) => `${i}: ${d}`).join("\n");
      return `${head}LEVELS (low to high):\n${levels}\n\nRespond with ONLY a JSON object {"level": <integer>}.`;
    }
  }
}

function parseLlmAnswer(kind: DecisionKind, text: string, req: DecisionRequest): boolean | string | number {
  const raw = (text ?? "").trim();
  if (kind === "noul") return raw.toLowerCase().startsWith("true");
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  let parsed: Record<string, unknown> = {};
  if (start !== -1 && end > start) { try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ } }
  if (kind === "choice") {
    const keys = Object.keys((req.criteria ?? {}) as Record<string, string>);
    const c = String(parsed.choice ?? "").trim();
    if (keys.includes(c)) return c;
    const ci = keys.find(k => k.toLowerCase() === c.toLowerCase()) ?? keys.find(k => raw.toLowerCase().includes(k.toLowerCase()));
    if (ci) return ci;
    throw new Error(`LLM choice not among options: ${raw.slice(0, 80)}`);
  }
  const n = Number(parsed.level ?? parsed.score);
  const max = ((req.criteria ?? []) as string[]).length - 1;
  if (Number.isInteger(n) && n >= 0 && n <= max) return n;
  throw new Error(`LLM level out of range: ${raw.slice(0, 80)}`);
}

async function decideWithLlm(req: DecisionRequest, mode: DecisionMode, fallbackReason?: DecisionResult["fallbackReason"]): Promise<DecisionResult> {
  const startedAt = Date.now();
  const result = await completeWithFallback(
    [{ role: "user", content: renderLlmPrompt(req) }],
    { maxTokens: req.kind === "noul" ? 10 : 60, temperature: 0 },
  );
  return {
    kind: req.kind,
    answer: parseLlmAnswer(req.kind, result.content ?? "", req),
    confidence: null,
    engine: "llm",
    mode,
    model: result.actualModel ?? "unknown",
    latencyMs: Date.now() - startedAt,
    inputTokens: result.tokensUsed?.prompt ?? 0,
    costUsd: result.costUsd ?? 0,
    fallbackReason,
  };
}

async function askJev(req: DecisionRequest): Promise<DecisionResult> {
  const { response, latencyMs } = await callJev(req.state, { q: toJevQuestion(req) });
  const parsed = fromJevAnswer(req.kind, response.answers?.q);
  if (!parsed) throw new Error(`Jev returned no ${req.kind} answer`);
  const inputTokens = response.usage?.input_tokens ?? 0;
  return {
    kind: req.kind,
    ...parsed,
    engine: "jev",
    mode: "jev",
    model: response.model ?? "jev",
    latencyMs,
    inputTokens,
    costUsd: (inputTokens / 1000) * JEV_USD_PER_1K_INPUT,
  };
}

// ── Audit ───────────────────────────────────────────────────────────────────

function stateMeta(state: unknown) {
  const json = typeof state === "string" ? state : JSON.stringify(state ?? null);
  return { stateChars: json.length, stateHash: createHash("sha256").update(json).digest("hex").slice(0, 32) };
}

async function audit(req: DecisionRequest, route: { mode: DecisionMode; reason: string }, final: DecisionResult, jev?: DecisionResult | null, error?: string): Promise<void> {
  const llm = final.engine === "llm" ? final : null;
  const decisionOf = (r: DecisionResult | null | undefined) => (r && r.kind === "noul" ? (r.answer as boolean) : null);
  await recordDecisionAudit({
    site: req.site,
    questionKind: req.kind,
    subject: (req.subject ?? req.instructions).slice(0, 500),
    jevAnswer: jev ? { answer: jev.answer, probabilities: jev.probabilities } : undefined,
    llmAnswer: llm ? { answer: llm.answer } : undefined,
    jevDecision: decisionOf(jev),
    llmDecision: decisionOf(llm),
    // A choice or a score is compared on its answer; a noul on its boolean.
    agree: jev && llm ? String(jev.answer) === String(llm.answer) : null,
    confidence: jev && req.kind !== "noul" ? jev.confidence : null,
    margin: jev && req.kind === "noul" ? jev.confidence : null,
    latencyMs: jev?.latencyMs ?? null,
    llmLatencyMs: llm?.latencyMs ?? null,
    llmModel: llm?.model ?? null,
    jevModel: jev?.model ?? null,
    inputTokens: jev?.inputTokens ?? null,
    ...stateMeta(req.state),
    error: error ?? null,
    engine: final.engine,
    mode: route.mode,
    fallbackReason: final.fallbackReason ?? (route.reason === "residency" ? "residency" : null),
  }).catch((err: unknown) => {
    console.warn(`[decision-provider] audit write failed: ${err instanceof Error ? err.message : String(err)}`);
  });
}

// ── The seam ────────────────────────────────────────────────────────────────

export async function decide(req: DecisionRequest): Promise<DecisionResult> {
  const route = await resolveDecisionRoute(req.site, req.orgId);
  const threshold = req.threshold ?? route.threshold;

  if (route.mode === "llm") {
    const r = await decideWithLlm(req, "llm", route.reason === "residency" ? "residency" : undefined);
    await audit(req, route, r);
    return r;
  }

  if (route.mode === "shadow") {
    // The LLM decides; Jev is asked afterwards, off the critical path, for the record.
    const r = await decideWithLlm(req, "shadow");
    void askJev(req)
      .then(jev => audit(req, route, { ...r, mode: "shadow" }, jev))
      .catch((err: unknown) => audit(req, route, r, null, err instanceof Error ? err.message : String(err)));
    return r;
  }

  // jev: the decision model answers unless it is unsure or unavailable.
  if (!process.env.TYPESAFE_API_KEY) {
    const r = await decideWithLlm(req, "jev", "no_key");
    await audit(req, route, r);
    return r;
  }
  let jev: DecisionResult | null = null;
  let jevError: string | undefined;
  try {
    jev = await askJev(req);
  } catch (err: unknown) {
    jevError = err instanceof Error ? err.message : String(err);
  }
  if (jev && (jev.confidence ?? 0) >= threshold) {
    await audit(req, route, jev, jev);
    return jev;
  }
  const r = await decideWithLlm(req, "jev", jev ? "below_threshold" : "jev_error");
  await audit(req, route, r, jev, jevError);
  return r;
}
