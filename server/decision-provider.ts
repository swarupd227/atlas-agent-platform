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

// ── One cap for every live call to the decision model ────────────────────────
//
// The shadow hooks drop a measurement past eight in flight; a live decision
// cannot be dropped, so the seam queues instead. The red-team runner asks its
// judge ten at a time and a guardrail set fires on every agent step of a team
// run, which is how a slow vendor minute would otherwise fan out into a
// hundred open requests.
const MAX_LIVE_IN_FLIGHT = 8;
let liveInFlight = 0;
const liveQueue: Array<() => void> = [];
async function withDecisionSlot<T>(work: () => Promise<T>): Promise<T> {
  if (liveInFlight >= MAX_LIVE_IN_FLIGHT) await new Promise<void>((resolve) => liveQueue.push(resolve));
  liveInFlight++;
  try {
    return await work();
  } finally {
    liveInFlight--;
    liveQueue.shift()?.();
  }
}
/** For tests: how many decision-model calls are open right now. */
export function decisionCallsInFlight(): number { return liveInFlight; }

async function askJev(req: DecisionRequest): Promise<DecisionResult> {
  const { response, latencyMs } = await withDecisionSlot(() => callJev(req.state, { q: toJevQuestion(req) }));
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
    llmInputTokens: llm?.inputTokens ?? null,
    llmCostUsd: llm?.costUsd ?? null,
    jevCostUsd: jev?.costUsd ?? null,
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

// ── Several questions, one call ─────────────────────────────────────────────

/** One question of a decideMany() set: everything a DecisionRequest carries except the shared state, site and organization. */
export type DecisionQuestion = Omit<DecisionRequest, "state" | "site" | "orgId">;

/** What a caller's own incumbent answered for a batch of keys, in one call. */
export interface IncumbentBatch {
  /** noul: boolean; choice: the option key; score: the level index. A key left out is an error for that key. */
  answers: Record<string, boolean | string | number>;
  model?: string;
  latencyMs: number;
  inputTokens?: number;
  costUsd?: number;
}

export interface DecisionSetRequest {
  site: string;
  state: unknown;
  orgId?: string | null;
  /** Keyed questions; every key comes back in the result. */
  questions: Record<string, DecisionQuestion>;
  /**
   * The caller's own incumbent judge for a batch of keys, when it has one: a
   * site that predates the seam usually asks the language model about every
   * item in one prompt and gets evidence back with the verdicts. Given, it
   * answers every key on the llm and shadow routes and only the unsure keys on
   * the jev route, in one call each; without it each key is asked separately
   * with the generic prompt.
   */
  incumbent?: (keys: string[]) => Promise<IncumbentBatch>;
}

/**
 * Several judgment-shaped questions about ONE state, answered in one decision-model
 * call. The vendor's API takes a keyed map of questions per state, and a guardrail
 * set -- four or five policy questions after an agent step -- is one round trip
 * this way instead of one per question. Mastra's classifier makes the same choice.
 *
 * Routing is per site, as for decide(); the fallback is per QUESTION: the ones the
 * decision model answers above the threshold are taken, the rest go to the
 * incumbent model in parallel. In shadow mode the incumbent answers every
 * question and the decision model is asked once, afterwards, for the record.
 * Every question writes its own decision_audit row, so the per-site report is
 * unchanged by how many questions travelled together.
 */
export async function decideMany(set: DecisionSetRequest): Promise<Record<string, DecisionResult>> {
  const keys = Object.keys(set.questions);
  if (keys.length === 0) return {};
  const route = await resolveDecisionRoute(set.site, set.orgId);
  const reqOf = (key: string): DecisionRequest => ({ ...set.questions[key], site: set.site, state: set.state, orgId: set.orgId });
  const out: Record<string, DecisionResult> = {};

  // The incumbent for a batch of keys: the caller's own, in one call, else the
  // generic prompt per key. Either way one DecisionResult per key, with a
  // batched call's tokens and price attributed once.
  const askIncumbent = async (batch: string[], mode: DecisionMode, fallbackReason?: DecisionResult["fallbackReason"]): Promise<Record<string, DecisionResult>> => {
    const got: Record<string, DecisionResult> = {};
    if (!set.incumbent) {
      await Promise.all(batch.map(async (key) => { got[key] = await decideWithLlm(reqOf(key), mode, fallbackReason); }));
      return got;
    }
    const b = await set.incumbent(batch);
    batch.forEach((key, i) => {
      const answer = b.answers[key];
      if (answer === undefined) throw new Error(`incumbent gave no answer for ${key}`);
      got[key] = {
        kind: set.questions[key].kind,
        answer,
        confidence: null,
        engine: "llm",
        mode,
        model: b.model ?? "unknown",
        latencyMs: b.latencyMs,
        inputTokens: i === 0 ? (b.inputTokens ?? 0) : 0,
        costUsd: i === 0 ? (b.costUsd ?? 0) : 0,
        fallbackReason,
      };
    });
    return got;
  };

  if (route.mode === "llm") {
    const got = await askIncumbent(keys, "llm", route.reason === "residency" ? "residency" : undefined);
    for (const key of keys) { await audit(reqOf(key), route, got[key]); out[key] = got[key]; }
    return out;
  }

  if (route.mode === "shadow") {
    Object.assign(out, await askIncumbent(keys, "shadow"));
    void askJevMany(set, keys)
      .then(async ({ answers }) => {
        for (const key of keys) await audit(reqOf(key), route, { ...out[key], mode: "shadow" }, answers[key] ?? null);
      })
      .catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        for (const key of keys) await audit(reqOf(key), route, out[key], null, message);
      });
    return out;
  }

  if (!process.env.TYPESAFE_API_KEY) {
    const got = await askIncumbent(keys, "jev", "no_key");
    for (const key of keys) { await audit(reqOf(key), route, got[key]); out[key] = got[key]; }
    return out;
  }

  let answers: Record<string, DecisionResult | null> = {};
  let jevError: string | undefined;
  try {
    answers = (await askJevMany(set, keys)).answers;
  } catch (err: unknown) {
    jevError = err instanceof Error ? err.message : String(err);
  }
  const unsure: string[] = [];
  for (const key of keys) {
    const jev = answers[key] ?? null;
    const threshold = reqOf(key).threshold ?? route.threshold;
    if (jev && (jev.confidence ?? 0) >= threshold) { await audit(reqOf(key), route, jev, jev); out[key] = jev; }
    else unsure.push(key);
  }
  if (unsure.length > 0) {
    // One batch to the incumbent for everything the model was unsure about;
    // each key still says why it went there.
    const got = await askIncumbent(unsure, "jev");
    for (const key of unsure) {
      const jev = answers[key] ?? null;
      const r = { ...got[key], fallbackReason: (jev ? "below_threshold" : "jev_error") as DecisionResult["fallbackReason"] };
      await audit(reqOf(key), route, r, jev, jevError ?? (jev ? undefined : `no ${reqOf(key).kind} answer for ${key}`));
      out[key] = r;
    }
  }
  return out;
}

/**
 * An incumbent for decideMany() whose answers are already known: a judge whose
 * one prompt gives the overall verdict AND the per-criterion answers has to be
 * called anyway, so the seam compares against (or falls back to) what it said
 * rather than asking again. The call's cost is attributed to the batch once.
 */
export function knownIncumbent(
  answers: Record<string, boolean | string | number>,
  meta: Omit<IncumbentBatch, "answers">,
): (keys: string[]) => Promise<IncumbentBatch> {
  return async (keys) => {
    const picked: IncumbentBatch["answers"] = {};
    for (const k of keys) if (answers[k] !== undefined) picked[k] = answers[k];
    return { ...meta, answers: picked };
  };
}

/** One decision-model call for every question of the set; a question the model did not answer comes back null. */
async function askJevMany(set: DecisionSetRequest, keys: string[]): Promise<{ answers: Record<string, DecisionResult | null> }> {
  const questions: Record<string, JevQuestion> = {};
  for (const key of keys) questions[key] = toJevQuestion({ ...set.questions[key], site: set.site, state: set.state });
  const { response, latencyMs } = await withDecisionSlot(() => callJev(set.state, questions));
  const inputTokens = response.usage?.input_tokens ?? 0;
  // The call's tokens and price are attributed to the set once, on its first
  // question, so summing the audit rows still gives what was actually spent.
  const answers: Record<string, DecisionResult | null> = {};
  keys.forEach((key, i) => {
    const q = set.questions[key];
    const parsed = fromJevAnswer(q.kind, response.answers?.[key]);
    answers[key] = parsed
      ? {
          kind: q.kind,
          ...parsed,
          engine: "jev",
          mode: "jev",
          model: response.model ?? "jev",
          latencyMs,
          inputTokens: i === 0 ? inputTokens : 0,
          costUsd: i === 0 ? (inputTokens / 1000) * JEV_USD_PER_1K_INPUT : 0,
        }
      : null;
  });
  return { answers };
}
