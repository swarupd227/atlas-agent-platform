/**
 * Phase 0 of the Jev evaluation (TypeSafe AI's "System One" decision model):
 * shadow measurement, nothing more.
 *
 * With DECISION_PROVIDER=shadow and TYPESAFE_API_KEY set, the judgment-shaped
 * LLM call sites wired here (evaluateCondition and checkSoftPolicyCompliance
 * in agent-runtime.ts) also send the same state and question to Jev AFTER the
 * LLM has answered, and record both verdicts in decision_audit. Nothing routes
 * on Jev's answer -- the run uses the LLM's verdict exactly as before, and the
 * Jev call is fire-and-forget so it adds no latency to the run either.
 *
 * Any other DECISION_PROVIDER value, or a missing key, turns every export here
 * into a no-op, so the default deployment is today's behaviour byte for byte.
 * The comparison report is GET /api/decision-audit/summary
 * (server/routes/decision-audit.ts); the go/no-go gate it feeds is in the
 * evaluation doc ("G0: >=95% agreement over >=500 real calls per site").
 *
 * Wire contract (docs.typesafe.ai/api): POST {state, model, questions} with a
 * bearer key; a noul answers {noul: p}, a score answers {score, legend,
 * probabilities, confidence}, a choice answers {choice, probabilities,
 * confidence}. Confidence is a spread statistic, not a calibrated
 * probability, and a noul has none -- so for nouls this module stores
 * margin = |p - 0.5| * 2 in its place, which lets the report threshold both
 * kinds on one column.
 */
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";

const JEV_ENDPOINT = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = process.env.TYPESAFE_MODEL || "jev-latest";
// Measured 10-15 s per call from a dev machine on 2026-09-28 against the vendor's
// quoted 70-500 ms; the call is off the run's critical path, so the timeout is
// generous and the latency column in decision_audit is where the truth lands.
const JEV_TIMEOUT_MS = 30_000;
// Jev caps state at 32k tokens; the sites here send ~3k chars of output plus
// the question, so this is a guard against a runaway caller, not a budget.
const MAX_STATE_CHARS = 100_000;
// Shadow calls ride alongside real runs; past this many in flight they are
// dropped (and counted), never queued, so a Jev slowdown cannot pile up.
const MAX_IN_FLIGHT = 8;

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
}

export function shadowDecisionsEnabled(): boolean {
  return process.env.DECISION_PROVIDER === "shadow" && !!process.env.TYPESAFE_API_KEY;
}

let inFlight = 0;
const stats = { sent: 0, dropped: 0, failed: 0 };

/** Process-local counters for the summary endpoint; the durable record is decision_audit. */
export function shadowDecisionStats() {
  return { enabled: shadowDecisionsEnabled(), inFlight, ...stats, model: JEV_MODEL };
}

/** One raw call to Jev. Exported for the smoke test; the shadow hooks go through runShadow. */
export async function callJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
): Promise<{ response: JevResponse; latencyMs: number }> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: JEV_MODEL, questions }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Jev HTTP ${res.status}: ${text}`);
    }
    return { response: (await res.json()) as JevResponse, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

// ── Audit rows ──────────────────────────────────────────────────────────────

interface Comparison {
  questionKind: JevQuestion["type"];
  /** What was judged (a condition, a policy name) -- never the state itself. */
  subject: string;
  jevAnswer: unknown;
  llmAnswer: unknown;
  /** The boolean each engine would have routed on; null when the question has no binary reading. */
  jevDecision: boolean | null;
  llmDecision: boolean | null;
  confidence: number | null;
  margin: number | null;
}

interface AuditRow extends Partial<Comparison> {
  site: string;
  questionKind: JevQuestion["type"];
  latencyMs: number | null;
  llmLatencyMs: number | null;
  llmModel: string | null;
  jevModel: string | null;
  inputTokens: number | null;
  stateChars: number;
  stateHash: string;
  error: string | null;
}

async function record(row: AuditRow): Promise<void> {
  const agree =
    row.jevDecision === null || row.jevDecision === undefined || row.llmDecision === null || row.llmDecision === undefined
      ? null
      : row.jevDecision === row.llmDecision;
  await db.execute(sql`
    INSERT INTO decision_audit
      (site, question_kind, subject, jev_answer, llm_answer, jev_decision, llm_decision, agree,
       confidence, margin, latency_ms, llm_latency_ms, llm_model, jev_model, input_tokens,
       state_chars, state_hash, error)
    VALUES
      (${row.site}, ${row.questionKind}, ${row.subject ?? null},
       ${row.jevAnswer === undefined ? null : JSON.stringify(row.jevAnswer)}::jsonb,
       ${row.llmAnswer === undefined ? null : JSON.stringify(row.llmAnswer)}::jsonb,
       ${row.jevDecision ?? null}, ${row.llmDecision ?? null}, ${agree},
       ${row.confidence ?? null}, ${row.margin ?? null}, ${row.latencyMs}, ${row.llmLatencyMs},
       ${row.llmModel}, ${row.jevModel}, ${row.inputTokens}, ${row.stateChars}, ${row.stateHash}, ${row.error})
  `);
}

interface LlmContext {
  model?: string;
  latencyMs: number;
}

/**
 * Send one shadow request and write one audit row per comparison. A failed
 * call still writes a row (with `error`), so the failure rate is part of the
 * measurement rather than invisible.
 */
async function runShadow(
  site: string,
  state: unknown,
  questions: Record<string, JevQuestion>,
  interpret: (answers: Record<string, JevAnswer>) => Comparison[],
  llm: LlmContext,
): Promise<void> {
  const stateJson = JSON.stringify(state);
  const base = {
    site,
    stateChars: stateJson.length,
    stateHash: createHash("sha256").update(stateJson).digest("hex").slice(0, 32),
    llmModel: llm.model ?? null,
    llmLatencyMs: llm.latencyMs,
  };
  const firstKind = Object.values(questions)[0]?.type ?? "noul";
  if (stateJson.length > MAX_STATE_CHARS) {
    await record({ ...base, questionKind: firstKind, latencyMs: null, jevModel: null, inputTokens: null, error: `state too large (${stateJson.length} chars)` });
    return;
  }
  try {
    const { response, latencyMs } = await callJev(state, questions);
    stats.sent++;
    for (const c of interpret(response.answers)) {
      await record({
        ...base,
        ...c,
        latencyMs,
        jevModel: response.model ?? JEV_MODEL,
        inputTokens: response.usage?.input_tokens ?? null,
        error: null,
      });
    }
  } catch (err: unknown) {
    stats.failed++;
    const message = err instanceof Error ? err.message : String(err);
    await record({ ...base, questionKind: firstKind, latencyMs: null, jevModel: null, inputTokens: null, error: message.slice(0, 500) });
    throw err;
  }
}

function fireAndForget(label: string, work: () => Promise<void>): void {
  if (!shadowDecisionsEnabled()) return;
  if (inFlight >= MAX_IN_FLIGHT) {
    stats.dropped++;
    return;
  }
  inFlight++;
  work()
    .catch((err: unknown) => {
      console.warn(`[decision-shadow] ${label}: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      inFlight--;
    });
}

const noulMargin = (p: number) => Math.abs(p - 0.5) * 2;

// ── Site hooks ──────────────────────────────────────────────────────────────

/**
 * Mirror of evaluateCondition (agent-runtime.ts): the same condition and the
 * same 3,000-char slice of worker output the LLM saw, as one noul.
 */
export function shadowEvaluateCondition(args: {
  condition: string;
  workerOutput: string;
  llmDecision: boolean;
  llmModel?: string;
  llmLatencyMs: number;
  /** Audit-row site; a replay of stored pairs labels itself so live and replayed rows stay separable. */
  site?: string;
}): void {
  const site = args.site ?? "evaluateCondition";
  fireAndForget(site, () =>
    runShadow(
      site,
      { condition: args.condition, worker_output: args.workerOutput.slice(0, 3000) },
      {
        holds: {
          type: "noul",
          instructions: `You are evaluating a pipeline routing condition against a worker's output. Is the condition satisfied? Condition: ${args.condition}`,
          criteria: {
            true: "The worker output clearly satisfies the condition",
            false: "The worker output does not satisfy the condition, or does not say",
          },
        },
      },
      (answers) => {
        const a = answers.holds;
        if (!a || a.type !== "noul") return [];
        return [{
          questionKind: "noul",
          subject: args.condition.slice(0, 500),
          jevAnswer: { noul: a.noul },
          llmAnswer: { decision: args.llmDecision },
          jevDecision: a.noul >= 0.5,
          llmDecision: args.llmDecision,
          confidence: null,
          margin: noulMargin(a.noul),
        }];
      },
      { model: args.llmModel, latencyMs: args.llmLatencyMs },
    ),
  );
}

export interface ShadowPolicy {
  id: string;
  name: string;
  description: string;
  requirements: string[];
}

export interface ShadowPolicyVerdict {
  policyId: string;
  compliant: boolean;
  severity: "low" | "medium" | "high";
}

// The LLM judge's severity words, in the order Jev's score levels are declared
// below (level 0 = no violation), so a score level maps straight to a word.
const SEVERITY_LEVELS = ["none", "low", "medium", "high"] as const;

/**
 * Mirror of checkSoftPolicyCompliance (agent-runtime.ts): one call carrying
 * every policy, with a "violates" noul and a severity score per policy. The
 * LLM prompt's rule is compliant=false ONLY on clear evidence, so the noul is
 * asked in the violation direction and compared against !compliant.
 */
export function shadowSoftPolicyCompliance(args: {
  outputText: string;
  policies: ShadowPolicy[];
  llmVerdicts: ShadowPolicyVerdict[];
  llmModel?: string;
  llmLatencyMs: number;
}): void {
  if (args.policies.length === 0) return;
  fireAndForget("checkSoftPolicyCompliance", () => {
    const questions: Record<string, JevQuestion> = {};
    args.policies.forEach((p, i) => {
      const policyText = `${p.name}: ${p.description}${p.requirements.length ? ` Requirements: ${p.requirements.join("; ")}` : ""}`;
      questions[`p${i}_violates`] = {
        type: "noul",
        instructions: `Is there clear evidence in the agent output that this policy applied to the task AND was violated? Policy -- ${policyText}`,
        criteria: {
          true: "The policy clearly applied and the output clearly breaks at least one of its requirements",
          false: "The output satisfies the policy, or the policy was simply not triggered by this task",
        },
      };
      questions[`p${i}_severity`] = {
        type: "score",
        instructions: `How serious is any violation of this policy in the agent output? Policy -- ${policyText}`,
        criteria: [
          "No violation: the policy is satisfied or was not triggered",
          "Low: a minor acknowledgment omission",
          "Medium: a meaningful but recoverable gap",
          "High: serious irreversible harm",
        ],
      };
    });
    const byId = new Map(args.llmVerdicts.map(v => [v.policyId, v]));
    return runShadow(
      "checkSoftPolicyCompliance",
      {
        agent_output: args.outputText.slice(0, 3000),
        policies: args.policies.map(p => ({ name: p.name, description: p.description, requirements: p.requirements })),
      },
      questions,
      (answers) => {
        const out: Comparison[] = [];
        args.policies.forEach((p, i) => {
          const llm = byId.get(p.id);
          if (!llm) return;
          const v = answers[`p${i}_violates`];
          if (v && v.type === "noul") {
            out.push({
              questionKind: "noul",
              subject: p.name.slice(0, 500),
              jevAnswer: { violates: v.noul },
              llmAnswer: { compliant: llm.compliant },
              jevDecision: v.noul < 0.5, // "compliant", to line up with the LLM's boolean
              llmDecision: llm.compliant,
              confidence: null,
              margin: noulMargin(v.noul),
            });
          }
          const s = answers[`p${i}_severity`];
          if (s && s.type === "score") {
            const level = Math.round(s.score);
            const jevSeverity = SEVERITY_LEVELS[Math.min(Math.max(level, 0), SEVERITY_LEVELS.length - 1)];
            // Severity only means something when a violation was found; the
            // LLM reports "low" by default on a compliant policy.
            const comparable = !llm.compliant;
            out.push({
              questionKind: "score",
              subject: p.name.slice(0, 500),
              jevAnswer: { score: s.score, severity: jevSeverity, probabilities: s.probabilities },
              llmAnswer: { severity: llm.severity, compliant: llm.compliant },
              jevDecision: comparable ? jevSeverity === llm.severity : null,
              llmDecision: comparable ? true : null,
              confidence: s.confidence,
              margin: null,
            });
          }
        });
        return out;
      },
      { model: args.llmModel, latencyMs: args.llmLatencyMs },
    );
  });
}
