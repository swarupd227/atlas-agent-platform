/**
 * Intelligence Context Layer, phase 0: the classification and the contract.
 *
 * A run's state is three different things mixed together, and only one of them
 * is a durable business asset. Measured on a real E&S run (dag execution run
 * d966bcac, 56 state keys):
 *
 *   decision trace   submissionId SUB-2026-8891 · policyNumber POL-2026-8891-CP
 *                    treatyReference · clausesUsed · rate_as_submitted
 *                    status "bound and active" · reconciled · endorsementText
 *   session state    nextAgent · nextSteps · workflowStatus · orchestrationStatus
 *   plumbing         __revision · iterationsUsed · answerSource
 *
 * Persisting all 56 would record `iterationsUsed` as if it were business
 * judgement -- treating decision-relevant information as a byproduct of the
 * framework that happened to produce it. So classification happens BEFORE
 * anything is returned or stored, and it fails closed: a key nobody has
 * classified is reported as unclassified rather than quietly included.
 *
 * Nothing here reads a database or calls a model. The resolver lives in
 * server/intelligence-context.ts.
 */

/** What a state key is, for the purpose of durability. */
export type KeyKind = "decision" | "session" | "plumbing" | "unclassified";

/**
 * What part of a decision trace a state key carries.
 *
 * Measured first, then designed: classifying by key NAME left 119 distinct
 * keys (716 occurrences, ~77%) unclassified, because real state keys are
 * authored step slugs -- `standardise_records`, `block_and_score_pairs`,
 * `classify_claim_type` -- not business nouns. No word list can classify a
 * name the flow author chose.
 *
 * The step itself declares what it is. team_blueprint_nodes carry `stateKey`
 * and `nodeType`, so a key joins back to its step for EVERY journey rather
 * than only the insurance ones:
 *
 *   tool_call       -> evidence   a connector's own answer, not an opinion
 *   decision        -> decision   a classification or branch verdict
 *   expression      -> decision   a value derived from state
 *   edge_gate       -> approval   where a human approved or overrode
 *   internal_agent  -> decision   when it declares an output contract
 *                      context    when it does not: narrative, not a verdict
 */
export type KeyRole =
  | "evidence" | "decision" | "approval" | "artefact" | "context"
  | "session" | "plumbing" | "unclassified";

/** The roles that belong in a durable decision trace. */
const DURABLE_ROLES: ReadonlySet<KeyRole> = new Set<KeyRole>(["evidence", "decision", "approval", "artefact", "context"]);
export const isDurableRole = (r: KeyRole): boolean => DURABLE_ROLES.has(r);

/** A step as authored, which is the contract a state key is read against. */
export interface StepContract {
  stateKey: string;
  nodeType: string;
  hasOutputContract: boolean;
  label?: string;
}

/**
 * Suffixes the ENGINE owns (dag-execution-engine.ts). Structural, not
 * authorial, so they carry meaning for every journey. `_verified` is the
 * connectors' own answers kept verbatim beside a step's narrative, which is
 * exactly the evidence/self-report distinction the trace needs.
 */
const ENGINE_SUFFIXES: Array<{ suffix: string; role: KeyRole }> = [
  { suffix: "_verified", role: "evidence" },
  { suffix: "_sources", role: "evidence" },
  { suffix: "_citations", role: "evidence" },
  { suffix: "_files", role: "artefact" },
  { suffix: "_decision", role: "decision" },
];

const ROLE_BY_NODE_TYPE: Record<string, KeyRole> = {
  team_answer: "decision",
  tool_call: "evidence",
  connector: "evidence",
  decision: "decision",
  expression: "decision",
  edge_gate: "approval",
  gate: "approval",
  approval: "approval",
};

export function buildStepIndex(
  nodes: Array<{ stateKey?: string | null; nodeType?: string | null; outputContractId?: string | null; outputSchema?: unknown; label?: string | null }>,
  opts?: { teamStateKey?: string | null },
): Map<string, StepContract> {
  const index = new Map<string, StepContract>();
  for (const n of nodes ?? []) {
    if (!n?.stateKey) continue;
    index.set(n.stateKey, {
      stateKey: n.stateKey,
      nodeType: String(n.nodeType ?? ""),
      hasOutputContract: !!(n.outputContractId || (n.outputSchema && Object.keys(n.outputSchema as object).length > 0)),
      label: n.label ?? undefined,
    });
  }
  // The orchestrator writes the team's own answer under a key named after the
  // team, and some blueprints leave that node's stateKey unset -- so the most
  // important content in the run was coming back unclassified (the single
  // largest group in the live backlog: 50 of 230 occurrences). Declared here
  // rather than name-matched, because the caller knows which team it asked for.
  if (opts?.teamStateKey && !index.has(opts.teamStateKey)) {
    index.set(opts.teamStateKey, { stateKey: opts.teamStateKey, nodeType: "team_answer", hasOutputContract: true });
  }
  return index;
}

/** A team name as the state key its orchestrator writes under. */
export const teamStateKeyFor = (teamName: string): string =>
  String(teamName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * What role a state key plays, read against the authored steps.
 *
 * With a step index this is a lookup, not a guess. Without one it falls back
 * to the name rules below, which is why those are kept: the engine writes keys
 * no step declares (`__revision`, `iterationsUsed`, `request`) and they must
 * still be recognised as plumbing or session rather than persisted.
 */
export function roleOfStateKey(key: string, steps?: Map<string, StepContract> | null): KeyRole {
  if (key.startsWith("__")) return "plumbing";
  if (PLUMBING_KEYS.has(key)) return "plumbing";
  if (SESSION_KEYS.has(key)) return "session";

  for (const { suffix, role } of ENGINE_SUFFIXES) {
    if (!key.endsWith(suffix)) continue;
    const base = key.slice(0, -suffix.length);
    // Only when the base really is a step: a business field called
    // "fully_verified" is not an engine key.
    if (steps?.has(base)) return role;
    if (!steps) return role;
  }

  const step = steps?.get(key);
  if (step) {
    const byType = ROLE_BY_NODE_TYPE[step.nodeType];
    if (byType) return byType;
    if (step.nodeType === "internal_agent" || step.nodeType === "remote_agent" || step.nodeType === "team") {
      // A declared output contract makes it a verdict; prose makes it context.
      return step.hasOutputContract ? "decision" : "context";
    }
    // A declared step of some other kind is still the journey's own output.
    return "context";
  }

  // No step declares it. Fall back to the name rules, and stay unclassified
  // rather than assume durability.
  const kind = classifyStateKey(key);
  return kind === "unclassified" ? "unclassified" : kind;
}

/**
 * Framework bookkeeping. Never durable, never shown to an agent.
 * `__`-prefixed keys are the engine's own (e.g. __revision).
 */
const PLUMBING_KEYS = new Set([
  "iterationsUsed", "answerSource", "totalTokens", "totalCostUsd", "totalPromptTokens",
  "totalCompletionTokens", "latencyMs", "downstreamAgentCount", "totalToolCalls",
  "currentWave", "totalWaves", "pending", "v2writeback_meta",
]);

/**
 * Keeps the workflow moving while it runs. Lives as long as the interaction,
 * then has no value: "nextAgent" is meaningless once the run has ended.
 */
const SESSION_KEYS = new Set([
  "nextAgent", "nextSteps", "workflowStatus", "orchestrationStatus", "workflowId",
  "request", "currentStageId", "activeInterruptId",
]);

/**
 * Decision-relevant: the record around a business object. Matched by exact
 * name or by shape, because journeys name their own state keys and a fixed
 * list would miss every new journey.
 */
const DECISION_KEYS = new Set([
  // A concern raised by a review step and then resolved. Live content:
  // "REVISION ROUND 1 of 1: 'Pre-Bind Quality Checker' reviewed the result and
  // sent it back to 'Premium Calculator' ... so it resolves every finding
  // below." That is decision-relevant in the strongest sense -- a system of
  // record keeps the final premium and keeps no trace that it was challenged
  // once and corrected. It was classified as session state until measurement
  // showed what it holds. (`__revision` stays plumbing: it counts the rounds,
  // it does not say what the concern was.)
  "revision_request",
  "status", "reconciled", "clausesUsed", "endorsementText", "notificationSent",
  "treatyReference", "treatyBinder", "treatyYear", "carrierCode", "policyNumber",
  "submissionId", "bordereauEntryId", "ledgerJournalId", "rate_as_submitted",
  "v2writeback", "evidence", "contextUsed",
]);

/**
 * Shapes that mark a key as decision-relevant whatever the journey calls it.
 * Matched against a snake_cased form of the key, because journeys use both
 * conventions -- `insuredName` and `insured_name` are the same key, and a
 * pattern anchored on `_` alone silently misses every camelCase one.
 */
const DECISION_PATTERNS: RegExp[] = [
  /(?:^|_)(?:policy|binder|submission|treaty|bordereau|ledger|journal|carrier|broker|insured|claim|premium|endorsement)(?:_|$)/,
  /_(?:id|number|reference|ref|code)$/,
  /^(?:fetch|verify|validate|check|assess|calculate|reconcile)_/,
  /_(?:approved|rejected|declined|bound|posted|escalated|sent)$/,
];

/** camelCase and snake_case collapsed to one comparable form. */
const normaliseKey = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();

/**
 * What kind of state key this is.
 *
 * Order matters: plumbing and session are explicit denials, so a key that is
 * both named in SESSION_KEYS and shaped like a decision stays session. The
 * default is `unclassified`, NOT `decision` -- a layer that persists anything
 * it cannot name is how framework noise becomes enterprise record.
 */
export function classifyStateKey(key: string): KeyKind {
  if (key.startsWith("__")) return "plumbing";
  if (PLUMBING_KEYS.has(key)) return "plumbing";
  if (SESSION_KEYS.has(key)) return "session";
  if (DECISION_KEYS.has(key)) return "decision";
  const n = normaliseKey(key);
  if (DECISION_PATTERNS.some((p) => p.test(n))) return "decision";
  return "unclassified";
}

/** A business object, as "<type>:<natural key>". */
export type Subject = string;

/**
 * Patterns that identify a business object in a state value. Deliberately
 * narrow: a false subject is worse than a missed one, because it would anchor
 * a decision to something that is not the thing it decided.
 */
const SUBJECT_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: "submission", re: /\bSUB-\d{4}-\d+\b/g },
  { type: "policy", re: /\bPOL-[0-9A-Z-]{4,}\b/g },
  { type: "binder", re: /\bCP-\d{4}-\d+\b/g },
  { type: "broker", re: /\bBRK-[0-9A-Z-]{2,}\b/g },
  { type: "agency", re: /\bAGY-[0-9A-Z-]{2,}\b/g },
  // A period is only a period when a key says so: "2026-11" appears in
  // timestamps everywhere, and anchoring on those would attach decisions to
  // the month they happened to run in.
];

const PERIOD_KEY = /(?:^|_)(?:period|closePeriod|accountingPeriod)(?:_|$)/i;
const PERIOD_VALUE = /^\s*(20\d\d-(?:0[1-9]|1[0-2]))\s*$/;

/**
 * Business objects named in a run's state, each with the key that named it.
 *
 * Returns the evidence rather than only the answer: a subject whose source key
 * cannot be shown is a subject nobody can check.
 */
export function extractSubjects(state: Record<string, unknown> | null | undefined): Array<{ subject: Subject; fromKey: string }> {
  if (!state || typeof state !== "object") return [];
  const found = new Map<Subject, string>();
  for (const [key, value] of Object.entries(state)) {
    if (classifyStateKey(key) === "plumbing") continue;
    const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
    if (typeof text !== "string" || !text) continue;
    for (const { type, re } of SUBJECT_PATTERNS) {
      for (const m of text.match(new RegExp(re.source, "g")) ?? []) {
        const s = `${type}:${m}`;
        if (!found.has(s)) found.set(s, key);
      }
    }
    if (PERIOD_KEY.test(key)) {
      const pm = typeof value === "string" ? value.match(PERIOD_VALUE) : null;
      if (pm) { const s = `period:${pm[1]}`; if (!found.has(s)) found.set(s, key); }
    }
  }
  return [...found.entries()].map(([subject, fromKey]) => ({ subject, fromKey }));
}

/** Why a requested subject returned nothing, or why an item was withheld. */
export type OmissionReason =
  | "no_record" | "expired" | "unreviewed" | "low_confidence"
  | "withheld_precedent_for_purpose" | "unclassified_keys";

export interface Omission {
  reason: OmissionReason;
  subject?: Subject;
  detail: string;
  count?: number;
}

/** Exact subject match in the same journey, versus anything looser. */
export type AuthorityTier = "authoritative" | "precedent";

/** Which axis matched a precedent -- they are not equally strong claims. */
export type MatchAxis = "same_customer" | "same_class_of_business" | "similar_risk";

export interface ContextItem {
  subject: Subject;
  tier: AuthorityTier;
  matchAxis?: MatchAxis;
  /** Decision-relevant state only, never session state or plumbing. */
  decision: Record<string, unknown>;
  citation: {
    runId: string;
    teamAgentId: string | null;
    decidedAt: string | null;
    status: string;
    /** The state keys this was drawn from, so a reader can check it. */
    fromKeys: string[];
  };
}

/** What a caller is doing, which decides whether precedent is allowed. */
export type Purpose = "draft" | "decide" | "review" | "bind" | "judge" | "explain";

/**
 * Purposes that must not see precedent. A gate asking "was this approved?"
 * must never be satisfiable by a decision from another journey, so this is a
 * default rather than a label -- a default that ships wrong is a default that
 * ships.
 */
const PRECEDENT_WITHHELD_FROM: ReadonlySet<Purpose> = new Set<Purpose>(["decide", "bind", "judge"]);

export const precedentAllowedFor = (purpose: Purpose): boolean => !PRECEDENT_WITHHELD_FROM.has(purpose);

export interface ResolveContextResult {
  items: ContextItem[];
  omissions: Omission[];
  usedSubjects: Subject[];
  missedSubjects: Subject[];
  /** Counted, not guessed at: how many state keys nobody has classified. */
  unclassifiedKeys: string[];
}

/**
 * Keeps only the decision-relevant half of a run's state, and says what it
 * could not place.
 */
/**
 * A run's state split into the parts of a decision trace, read against the
 * authored steps.
 *
 * `unclassified` is returned rather than folded into either side. A layer that
 * silently includes what it cannot name persists framework noise as business
 * record; one that silently drops it loses decisions. Naming the gap is the
 * only option that stays honest as journeys are added.
 */
export function traceStateOf(
  state: Record<string, unknown> | null | undefined,
  steps?: Map<string, StepContract> | null,
): {
  byRole: Record<KeyRole, Record<string, unknown>>;
  durable: Record<string, unknown>;
  fromKeys: string[];
  unclassified: string[];
} {
  const byRole = {
    evidence: {}, decision: {}, approval: {}, artefact: {}, context: {},
    session: {}, plumbing: {}, unclassified: {},
  } as Record<KeyRole, Record<string, unknown>>;
  const durable: Record<string, unknown> = {};
  const fromKeys: string[] = [];
  const unclassified: string[] = [];

  for (const [key, value] of Object.entries(state ?? {})) {
    const role = roleOfStateKey(key, steps);
    byRole[role][key] = value;
    if (role === "unclassified") { unclassified.push(key); continue; }
    if (isDurableRole(role)) { durable[key] = value; fromKeys.push(key); }
  }
  return { byRole, durable, fromKeys, unclassified };
}

export function decisionStateOf(state: Record<string, unknown> | null | undefined): {
  decision: Record<string, unknown>;
  fromKeys: string[];
  unclassified: string[];
} {
  const decision: Record<string, unknown> = {};
  const fromKeys: string[] = [];
  const unclassified: string[] = [];
  for (const [key, value] of Object.entries(state ?? {})) {
    const kind = classifyStateKey(key);
    if (kind === "decision") { decision[key] = value; fromKeys.push(key); }
    else if (kind === "unclassified") unclassified.push(key);
  }
  return { decision, fromKeys, unclassified };
}
