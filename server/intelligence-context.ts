/**
 * Intelligence Context Layer, phase 0: the consumption path, read-only.
 *
 * Deliberately no new store. It reads decision-relevant state out of
 * dag_execution_runs, which is where Live Automation already records, and
 * returns it anchored on the business object. The point of doing the read side
 * first is that a store nobody reads is what `memoryRagConfig` already is: a
 * column on every agent record, configured on zero of them.
 *
 * Where the data is was measured, not assumed. Approvals cannot anchor this:
 * all 1,035 of them key on PLATFORM artefacts (pipeline_gate 524, agent 284,
 * mcp-tool 125, outcome_contract 66) and not one names a binder, submission or
 * period. /api/workspace/runs holds Cowork runs and none of the MGA journeys,
 * and /api/pipelines holds one unrelated pipeline. dag_execution_runs state
 * carries submissionId, policyNumber, treatyReference and the decision
 * content together.
 */
import { storage } from "./storage";
import {
  extractSubjects, traceStateOf, precedentAllowedFor, buildStepIndex, teamStateKeyFor,
  type ContextItem, type Omission, type Purpose, type ResolveContextResult, type Subject, type MatchAxis,
  type StepContract, type Conflict, type OmissionReason,
} from "@shared/intelligence-context";

export interface ResolveContextInput {
  /** Business objects in play, e.g. ["submission:SUB-2026-8891"]. */
  subjects: Subject[];
  purpose: Purpose;
  surface: "team_run" | "cowork" | "approval" | "proposal" | "eval" | "authoring";
  orgId?: string | null;
  /** The caller's journey. Same journey + exact subject = authoritative. */
  teamAgentId?: string | null;
  /** Effective dating: ignore anything decided after this instant. */
  asOf?: Date;
  limit?: number;
  /** How many runs to scan. Bounded so a cold call cannot walk all history. */
  scanRuns?: number;
  /** The asking run, so it is never handed its own decision back as precedent. */
  excludeRunId?: string;
}

/**
 * Below this, a reviewer-set confidence withholds a record from reuse. Only a
 * REVIEWER sets confidence, so this never fires on an unjudged record -- null
 * means nobody has judged it, which is not the same as low.
 */
const LOW_CONFIDENCE = 0.5;

/** What a record is, and why, when it is NOT offered for reuse. */
export interface RecallVerdict {
  recallable: boolean;
  /** Set when recallable is false. The same OmissionReason a caller would see. */
  reason?: OmissionReason;
  detail?: string;
}

/**
 * The recall gate, in ONE place.
 *
 * It began inline inside resolveContext, which was fine while resolveContext
 * was the only caller. The review queue needs the same verdict -- a reviewer
 * working through the backlog has to be told "withheld because nobody reviewed
 * it" rather than shown an undifferentiated list -- and a second copy of five
 * branches would drift from the first. Today's lesson from the eval work was
 * exactly this: `?? 0` in fourteen readers was the defect, and one shared
 * definition was the fix.
 *
 * Order matters. Superseded is reported before expired, because a record that
 * was both replaced AND timed out is more usefully explained by the person who
 * replaced it than by the clock.
 */
export function recallVerdict(
  rec: {
    subject: string; runId?: string | null; reviewState?: string | null; confidence?: number | null;
    supersededAt?: Date | string | null; supersededBy?: string | null; supersededReason?: string | null;
    expiresAt?: Date | string | null; effectiveFrom?: Date | string | null;
  },
  opts: { requireReview: boolean; now?: Date },
): RecallVerdict {
  const now = opts.now ?? new Date();
  const run = String(rec.runId ?? "").slice(0, 8);
  if (rec.supersededAt) {
    return {
      recallable: false, reason: "superseded",
      detail: `A decision on ${rec.subject} from run ${run} was superseded${rec.supersededBy ? ` by record ${String(rec.supersededBy).slice(0, 8)}` : ""}${rec.supersededReason ? `: ${String(rec.supersededReason).slice(0, 160)}` : ""}`,
    };
  }
  if (rec.expiresAt && new Date(rec.expiresAt) <= now) {
    return { recallable: false, reason: "expired", detail: `A decision on ${rec.subject} expired on ${new Date(rec.expiresAt).toISOString().slice(0, 10)} and is not offered as current` };
  }
  if (rec.effectiveFrom && new Date(rec.effectiveFrom) > now) {
    return { recallable: false, reason: "not_yet_effective", detail: `A decision on ${rec.subject} does not take effect until ${new Date(rec.effectiveFrom).toISOString().slice(0, 10)}, so it is not offered as current` };
  }
  // The two behind the flag. See RECALL_REQUIRE_REVIEW_SETTING for why these
  // are not switched on with the lifecycle branches above.
  if (opts.requireReview && String(rec.reviewState ?? "unreviewed") === "unreviewed") {
    return { recallable: false, reason: "unreviewed", detail: `A decision on ${rec.subject} from run ${run} exists but no one has reviewed it, so it is not offered as precedent` };
  }
  if (opts.requireReview && typeof rec.confidence === "number" && rec.confidence < LOW_CONFIDENCE) {
    return { recallable: false, reason: "low_confidence", detail: `A decision on ${rec.subject} was judged ${(rec.confidence * 100).toFixed(0)}% confident, below the ${(LOW_CONFIDENCE * 100).toFixed(0)}% bar for reuse` };
  }
  return { recallable: true };
}

const DEFAULT_LIMIT = 8;
const DEFAULT_SCAN = 60;

/**
 * Which axis, if any, makes another run relevant to this request.
 *
 * `similar_risk` previously fired whenever a run had ANY subject, which made
 * every run in history precedent for every request: asking about a submission
 * that had never existed returned three precedent items. Relevance now needs
 * a real overlap -- the run must reference something the request references --
 * and a run that shares nothing and is not the same journey is not precedent
 * at all.
 */
function axisFor(
  runSubjects: Subject[],
  requested: Subject[],
  sameJourney: boolean,
): MatchAxis | null {
  const party = (s: Subject) => s.startsWith("broker:") || s.startsWith("agency:");
  const requestedSet = new Set(requested);
  // Strongest: the same counterparty, whatever the subject of the decision.
  if (runSubjects.some((s) => party(s) && requestedSet.has(s))) return "same_customer";
  // Same journey, different subject: the same class of business by definition,
  // since a journey is built for one.
  if (sameJourney) return "same_class_of_business";
  // Weakest axis, and now it requires an actual shared business object -- the
  // same treaty, binder or insured -- rather than merely existing.
  if (runSubjects.some((s) => requestedSet.has(s))) return "similar_risk";
  return null;
}

/**
 * Authoritative records of one subject that disagree on a field.
 *
 * Only authoritative items are compared: two precedents differing is normal
 * and says nothing, while two authoritative records differing means the
 * platform holds two accounts of the same decision.
 */
function findConflicts(items: ContextItem[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const bySubject = new Map<Subject, ContextItem[]>();
  for (const i of items) {
    if (i.tier !== "authoritative") continue;
    if (!bySubject.has(i.subject)) bySubject.set(i.subject, []);
    bySubject.get(i.subject)!.push(i);
  }
  for (const [subject, group] of bySubject) {
    if (group.length < 2) continue;
    const fields = new Set(group.flatMap((i: ContextItem) => Object.keys(i.decision)));
    for (const field of fields) {
      const present = group.filter((i: ContextItem) => field in i.decision);
      if (present.length < 2) continue;
      // Only a value short enough to be a fact can be a conflict of fact. A
      // long block differing is two accounts of the same thing, not two
      // claims about it, and reporting it drowns the real conflicts.
      if (present.some((i: ContextItem) => JSON.stringify(i.decision[field] ?? "").length > 240)) continue;
      const distinct = new Set(present.map((i: ContextItem) => JSON.stringify(i.decision[field])));
      if (distinct.size < 2) continue;
      conflicts.push({
        subject,
        field,
        values: present.map((i: ContextItem) => ({ runId: i.citation.runId, decidedAt: i.citation.decidedAt, value: i.decision[field] })),
      });
    }
  }
  return conflicts;
}

/**
 * Context for a decision, anchored on business objects.
 *
 * Returns what it found AND what it did not: "nothing was retrieved" and
 * "nothing exists" are different facts, and a caller that cannot tell them
 * apart will present an empty recall as settled history.
 */
export async function resolveContext(input: ResolveContextInput): Promise<ResolveContextResult> {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 50));
  const scan = Math.max(1, Math.min(input.scanRuns ?? DEFAULT_SCAN, 200));
  const requested = [...new Set(input.subjects.filter(Boolean))];
  const omissions: Omission[] = [];

  // Indexed records first. This is the whole point of phase 1: a lookup on the
  // subject cannot be pushed out of range by other journeys' traffic, which is
  // what made the recency scan report "no record" for a submission that had
  // been bound twice. The scan stays as a fallback for runs that finished
  // before indexing existed.
  const indexed = await (storage as any).getDecisionRecordsBySubjects?.(requested, input.orgId ?? undefined, scan)
    .catch((err: any) => { console.error("[intelligence-context] decision-record lookup failed:", err?.message); return null; });
  const scanned = { byIndex: Array.isArray(indexed) && indexed.length > 0, runs: scan };

  // A failed history read is reported, not turned into an empty list. Swallowed,
  // it rendered as "no finished run recorded a decision on <subject>" -- which
  // tells a reader the object is new when the truth is that nobody looked.
  let historyFailed = false;
  const runs = await storage.listDagExecutionRunsByOrg(input.orgId ?? undefined, scan).catch((err: any) => {
    historyFailed = true;
    console.error("[intelligence-context] could not read run history:", err?.message);
    return [] as Awaited<ReturnType<typeof storage.listDagExecutionRunsByOrg>>;
  });

  // A state key is classified against the steps that WROTE it, so each run is
  // read against its own team's blueprint. Cached per team: a scan of 60 runs
  // would otherwise refetch the same blueprint dozens of times. Measured
  // effect of doing this instead of matching key names: unclassified keys fell
  // from 76.9% to 18.9% across 40 live runs.
  const indexCache = new Map<string, Map<string, StepContract>>();
  // Teams whose blueprint could not be read. Their state is classified by key
  // name instead, which is materially worse -- on live data it read three
  // tool_call outputs as decisions and then compared them for conflicts.
  const degraded = new Set<string>();
  const stepsFor = async (teamAgentId: string | null): Promise<Map<string, StepContract> | null> => {
    if (!teamAgentId) return null;
    const hit = indexCache.get(teamAgentId);
    if (hit) return hit;
    try {
      const agent = await storage.getAgent(teamAgentId, input.orgId ?? undefined);
      if (agent?.blueprintId) {
        const nodes = await storage.getTeamBlueprintNodes(agent.blueprintId);
        const index = buildStepIndex(nodes as any[], { teamStateKey: teamStateKeyFor(agent.name ?? "") });
        if (index.size > 0) {
          // ONLY successes are cached. Caching a failure as null made one
          // transient fetch degrade every later run for that team, invisibly,
          // for the rest of the request.
          indexCache.set(teamAgentId, index);
          // Deliberately NOT clearing an earlier `degraded` mark: a retry
          // succeeding does not un-degrade the runs already classified
          // without the blueprint, and their items are in the result.
          return index;
        }
      }
    } catch { /* fall through to degraded */ }
    degraded.add(teamAgentId);
    return null;
  };

  const items: ContextItem[] = [];
  const unclassified = new Set<string>();
  const seenSubjects = new Set<Subject>();
  let withheld = 0;

  // Indexed records become items directly: the subject is the key they were
  // stored under, so there is nothing to re-derive and nothing to miss.
  const gated: Array<{ reason: OmissionReason; subject: Subject; detail: string }> = [];
  const now = input.asOf ?? new Date();
  // Read once, not per record: the lifecycle branches below always apply, and
  // only the review requirement is flagged. See RECALL_REQUIRE_REVIEW_SETTING
  // for why those two are not switched on together.
  const requireReview = await settingIsOn(RECALL_REQUIRE_REVIEW_SETTING);
  for (const rec of (Array.isArray(indexed) ? indexed : [])) {
    const decidedAt = rec.decidedAt ? new Date(rec.decidedAt) : null;
    if (input.asOf && decidedAt && decidedAt > input.asOf) continue;
    if (rec.runId === input.excludeRunId) continue;

    // The recall gate, through the one function that owns it. Each refusal is
    // REPORTED, never a silent drop: a record withheld because nobody reviewed
    // it and a subject with no record at all are different facts.
    const verdict = recallVerdict(rec, { requireReview, now });
    if (!verdict.recallable) {
      gated.push({ reason: verdict.reason!, subject: rec.subject, detail: verdict.detail! });
      continue;
    }
    const sameJourney = !!input.teamAgentId && rec.teamAgentId === input.teamAgentId;
    const tier: ContextItem["tier"] = sameJourney ? "authoritative" : "precedent";
    if (tier === "precedent" && !precedentAllowedFor(input.purpose)) { withheld++; continue; }
    const axis = tier === "precedent" ? "same_class_of_business" as MatchAxis : undefined;
    seenSubjects.add(rec.subject);
    items.push({
      subject: rec.subject,
      subjects: [rec.subject],
      tier,
      ...(axis ? { matchAxis: axis } : {}),
      decision: (rec.decision ?? {}) as Record<string, unknown>,
      evidence: (rec.evidence ?? {}) as Record<string, unknown>,
      narrative: {},
      citation: {
        runId: rec.runId,
        teamAgentId: rec.teamAgentId ?? null,
        decidedAt: decidedAt ? decidedAt.toISOString() : null,
        status: "completed",
        fromKeys: Array.isArray(rec.fromKeys) ? rec.fromKeys as string[] : [],
      },
    });
  }

  const indexedRunIds = new Set((Array.isArray(indexed) ? indexed : []).map((r: any) => r.runId));
  for (const run of runs) {
    // Already covered by an indexed record; scanning it again would list the
    // same decision twice from two sources.
    if (indexedRunIds.has(run.id)) continue;
    // Only a finished run has a decision. A run still going has an opinion.
    if (!["completed", "completed_with_skips", "succeeded"].includes(String(run.status))) continue;
    const decidedAt = (run.completedAt ?? run.startedAt ?? null) as Date | null;
    if (input.asOf && decidedAt && new Date(decidedAt) > input.asOf) continue;

    const state = (run.finalState ?? run.currentState ?? null) as Record<string, unknown> | null;
    if (!state) continue;

    const subjects = extractSubjects(state);
    if (subjects.length === 0) continue;
    const subjectList = subjects.map((s) => s.subject);

    const steps = await stepsFor(run.teamAgentId ?? null);
    const { byRole, durable, fromKeys, unclassified: unk } = traceStateOf(state, steps);
    for (const k of unk) unclassified.add(k);
    if (Object.keys(durable).length === 0) continue;
    // Evidence is held apart from the verdicts so the renderer can reference
    // it instead of pasting connector payloads into a prompt.
    const evidence = { ...byRole.evidence };
    const decision = { ...byRole.decision, ...byRole.approval, ...byRole.artefact };
    // Narrative is kept apart from the verdicts. Two runs of one journey write
    // different prose for every narrative step, so folding it into `decision`
    // turned 2 real conflicts into 15 and would have taught a reader to
    // ignore the warning.
    const narrative = { ...byRole.context };

    const sameJourney = !!input.teamAgentId && run.teamAgentId === input.teamAgentId;
    const exact = subjectList.filter((s) => requested.includes(s));

    // Authoritative needs BOTH: this run decided on this very object, in this
    // journey. Same subject in another journey is precedent, never authority.
    const tier: ContextItem["tier"] = exact.length > 0 && sameJourney ? "authoritative" : "precedent";

    if (tier === "precedent" && !precedentAllowedFor(input.purpose)) { withheld++; continue; }

    const axis = tier === "precedent" ? axisFor(subjectList, requested, sameJourney) : undefined;
    if (tier === "precedent" && !axis) continue;

    const anchor = exact[0] ?? subjectList[0];
    seenSubjects.add(anchor);
    items.push({
      subject: anchor,
      subjects: [anchor],
      tier,
      ...(axis ? { matchAxis: axis } : {}),
      decision,
      evidence,
      narrative,
      citation: {
        runId: run.id,
        teamAgentId: run.teamAgentId ?? null,
        decidedAt: decidedAt ? new Date(decidedAt).toISOString() : null,
        status: String(run.status),
        fromKeys,
      },
    });
  }

  // One decision, not one per subject it was filed under. A run indexed
  // against a submission, its policy and its binder matched three times and was
  // rendered three times; collapsing by run keeps the evidence of breadth (the
  // subjects it covers) without restating the decision.
  const byRun = new Map<string, ContextItem>();
  for (const item of items) {
    const existing = byRun.get(item.citation.runId);
    if (!existing) { byRun.set(item.citation.runId, item); continue; }
    for (const s of item.subjects) if (!existing.subjects.includes(s)) existing.subjects.push(s);
    // Prefer the subject the caller actually asked about as the headline.
    if (requested.includes(item.subject) && !requested.includes(existing.subject)) existing.subject = item.subject;
    // Authority wins: the same run cannot be both, but merging defensively
    // avoids a precedent label hiding an authoritative record.
    if (item.tier === "authoritative") { existing.tier = "authoritative"; delete (existing as { matchAxis?: MatchAxis }).matchAxis; }
  }
  const merged = [...byRun.values()];
  items.length = 0;
  items.push(...merged);

  // Authoritative first, then the stronger precedent axes, then recency.
  const axisRank: Record<string, number> = { same_customer: 0, same_class_of_business: 1, similar_risk: 2 };
  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "authoritative" ? -1 : 1;
    const ar = axisRank[a.matchAxis ?? ""] ?? 3, br = axisRank[b.matchAxis ?? ""] ?? 3;
    if (ar !== br) return ar - br;
    return String(b.citation.decidedAt ?? "").localeCompare(String(a.citation.decidedAt ?? ""));
  });

  const kept = items.slice(0, limit);

  // Against every subject an item covers, not just its headline: after
  // collapsing by run, a served subject would otherwise be reported missing
  // because another subject became the headline.
  const missed = requested.filter((s) => !kept.some((i) => i.subjects.includes(s)));
  // A subject the gate refused is NOT a subject with no record. Both are
  // "nothing was served", and reporting them the same way is the one confusion
  // this layer exists to prevent: the caller would read "no decision is held on
  // this submission" when one is held, was found, and was deliberately withheld
  // pending review. The gate's own omission below carries the real reason, so
  // the absence claims skip these.
  const gatedSubjects = new Set(gated.map((g) => g.subject));
  const unexplained = missed.filter((s) => !gatedSubjects.has(s));
  if (historyFailed) {
    // No no_record claims when the history could not be read: every subject
    // would be reported absent on no evidence.
    omissions.push({
      reason: "history_unavailable",
      detail: `Run history could not be read, so whether a prior decision exists on ${unexplained.join(", ") || "these subjects"} is UNKNOWN — not absent`,
      count: unexplained.length,
    });
  } else {
    // Says what was searched, not what exists. The previous wording -- "No
    // finished run recorded a decision on <subject>" -- asserted absence from
    // a bounded scan, and was measurably false: five finished runs had decided
    // on SUB-2026-8891 while four sat outside the window and the fifth was the
    // asking run itself. Overclaiming here breaks the one distinction this
    // layer exists to preserve.
    for (const s of unexplained) {
      omissions.push({
        reason: "no_record",
        subject: s,
        detail: scanned.byIndex
          ? `No decision record is held for ${s}`
          : `No decision on ${s} was found in the ${scanned.runs} most recent run(s) searched — this is the limit of the search, not a statement that none exists`,
      });
    }
  }
  if (withheld > 0) {
    omissions.push({
      reason: "withheld_precedent_for_purpose",
      detail: `${withheld} precedent item(s) withheld: purpose "${input.purpose}" may only use authoritative context, so a decision from another journey cannot satisfy it`,
      count: withheld,
    });
  }
  // Refusals from the recall gate. Reported per subject, because "withheld
  // because nobody reviewed it" and "none exists" must never render alike.
  for (const g of gated) omissions.push({ reason: g.reason, subject: g.subject, detail: g.detail });

  if (degraded.size > 0) {
    omissions.push({
      reason: "blueprint_unavailable",
      detail: `${degraded.size} team(s) had no readable blueprint, so their state was classified by key name rather than by the step that wrote it — a connector's output can be misread as a decision this way, and any conflict reported for those runs may be an artefact of that`,
      count: degraded.size,
    });
  }
  if (unclassified.size > 0) {
    omissions.push({
      reason: "unclassified_keys",
      detail: `${unclassified.size} state key(s) are classified neither decision nor session, so they were excluded rather than assumed durable: ${[...unclassified].slice(0, 12).join(", ")}`,
      count: unclassified.size,
    });
  }

  const conflicts = findConflicts(kept);

  return {
    items: kept,
    conflicts,
    omissions,
    usedSubjects: [...new Set(kept.flatMap((i) => i.subjects))],
    missedSubjects: missed,
    unclassifiedKeys: [...unclassified],
  };
}

/**
 * Indexes a finished run's decisions by the business objects they were about.
 *
 * Phase 1's write path, and the answer to what phase 0 could not do. Retrieval
 * by recency scan reported "no record" for SUB-2026-8891 while five finished
 * runs had decided on it -- four outside the window, the fifth the asking run.
 * A row per (subject, run) makes the next read a lookup.
 *
 * Writes only what classification says is durable, so framework bookkeeping
 * does not become enterprise record. Never throws: the run has already
 * finished, and recording it for the future must not retrospectively fail it.
 */
export async function recordRunDecisions(input: {
  runId: string;
  teamAgentId: string;
  teamName: string;
  orgId?: string | null;
  state: Record<string, unknown> | null | undefined;
  nodeConfig: Record<string, { stateKey?: string | null; nodeType?: string | null; outputContractId?: string | null; label?: string | null }>;
  decidedAt: Date;
}): Promise<{ written: number; subjects: Subject[] }> {
  const extracted = extractSubjects(input.state);
  const subjects = extracted.map(s => s.subject);
  if (subjects.length === 0) return { written: 0, subjects: [] };

  const steps = buildStepIndex(Object.values(input.nodeConfig ?? {}), { teamStateKey: teamStateKeyFor(input.teamName) });
  const { byRole, fromKeys } = traceStateOf(input.state, steps);
  const decision = { ...byRole.decision, ...byRole.approval, ...byRole.artefact };
  const evidence = { ...byRole.evidence };

  // A run that established a subject but decided nothing about it is not a
  // decision record. Writing one would put an empty row where a reader expects
  // a judgement.
  //
  // The keys that PRODUCED the subjects do not count towards that: a record
  // whose only content is `submissionId: SUB-2026-8891`, filed under
  // submission:SUB-2026-8891, restates its own key and asserts nothing. Same
  // tautology as scoring an eval field the agent was handed in its input.
  const subjectKeys = new Set(extracted.map(s => s.fromKey));
  const judgement = Object.keys(decision).filter(k => !subjectKeys.has(k));
  if (judgement.length === 0) return { written: 0, subjects };

  // Reviewed means a person settled a gate on this run. That is a platform
  // signal rather than the model's opinion of itself, and it is the reason
  // confidence is left for a reviewer to set: an agent's self-reported
  // confidence is the cheapest and least trustworthy number available.
  //
  // Defaulting everything to "unreviewed" and then withholding unreviewed
  // records would have turned the layer off silently, which is a worse failure
  // than the one the gate exists to prevent.
  const passedAGate = Object.keys(byRole.approval).length > 0;
  const reviewState = passedAGate ? "reviewed" : "unreviewed";

  let written = 0;
  for (const subject of subjects) {
    try {
      await (storage as any).upsertDecisionRecord?.({
        organizationId: input.orgId ?? null,
        subject,
        subjectType: subject.split(":")[0],
        teamAgentId: input.teamAgentId,
        runId: input.runId,
        decidedAt: input.decidedAt,
        decision,
        evidence,
        fromKeys,
        reviewState,
        decidedBy: input.teamName || input.teamAgentId,
        effectiveFrom: input.decidedAt,
      });
      written++;
    } catch (err: any) {
      console.error(`[intelligence-context] could not record ${subject} for run ${input.runId}:`, err?.message);
    }
  }
  return { written, subjects };
}

/** The platform setting that turns this layer on. "on" or "off". */
export const INTELLIGENCE_CONTEXT_SETTING = "INTELLIGENCE_CONTEXT";

/**
 * Is the layer on?
 *
 * A platform setting, not an environment variable. The first version used env
 * vars and that was the wrong call: flipping it needed a Cloud Shell round trip
 * and an app restart, and a list of team ids in an env var is invisible to
 * anyone looking at the platform. This follows the pattern GUARDRAIL_REVIEW and
 * DECISION_STEP_KIND already use -- a row in platform_settings, readable and
 * writable through /api/platform-settings/:key, so it is togglable from the UI
 * and visible beside the other flags.
 *
 * There is deliberately no per-journey scoping here. A journey only receives
 * context when its state names a business object, so the layer is already
 * self-limiting; and if per-journey enablement is ever wanted it belongs on the
 * team record, where an operator can see it, not in a configured id list.
 *
 * Off unless explicitly turned on: this reads prior decisions into a live
 * prompt, and a default-on read path is a default-on behaviour change. A failed
 * read is off, never on.
 */
export async function intelligenceContextEnabled(): Promise<boolean> {
  return settingIsOn(INTELLIGENCE_CONTEXT_SETTING);
}

/**
 * The review requirement, as its own flag, and the reason it is separate.
 *
 * The recall gate's six branches are not equally safe to switch on. Nobody
 * disputes that a superseded, expired or not-yet-effective record should be
 * withheld -- those states exist only because someone set them deliberately.
 * The review requirement is different: `review_state` defaults to `unreviewed`,
 * so the moment the column existed EVERY record already in production became
 * unreviewed, including the E&S records this layer was proved on. Turning the
 * requirement on with the column would have stopped the layer serving anything,
 * on a deploy whose release note said "quality gate".
 *
 * Backfilling those rows to `reviewed` was the other option and is worse: it
 * would assert a review that never happened, in the one feature whose job is to
 * say truthfully where a decision came from. So the data stays honest and the
 * requirement waits for a review path to exist, behind a flag an operator can
 * see in Admin -> Platform Flags.
 *
 * Off unless explicitly turned on, and a failed read is off.
 */
export const RECALL_REQUIRE_REVIEW_SETTING = "INTELLIGENCE_RECALL_REQUIRE_REVIEW";

async function settingIsOn(key: string): Promise<boolean> {
  try {
    const row = await (storage as { getPlatformSetting?: (key: string) => Promise<{ value?: string | null } | undefined> })
      .getPlatformSetting?.(key);
    return String(row?.value ?? "").trim().toLowerCase() === "on";
  } catch {
    return false;
  }
}

/**
 * Prior decisions for a running step, as prompt text, or "" when the layer is
 * off, the step names no business object, or nothing was found.
 *
 * Kept here rather than at the call site so the engine's hunk is three lines
 * and every gate -- the flag, the subject check, the purpose -- lives with the
 * code that owns it.
 */
/**
 * What was injected, in a form a run record can keep.
 *
 * The text alone is not enough. A caller that only gets a string can put it in
 * a prompt and cannot put it anywhere a person will later read -- which is how
 * the first version changed what an agent was told and left no trace of having
 * done so, against this layer's own rule that retrieval must be visible in the
 * run record.
 */
export interface PriorContextForPrompt {
  /** The prompt block, or "" when nothing was injected. */
  text: string;
  /** Business objects the step's state named. Present even when nothing matched. */
  subjects: Subject[];
  /** `subjects` on an item is every object that one decision answered for. */
  items: Array<{ subject: Subject; subjects: Subject[]; tier: string; matchAxis?: string; runId: string; decidedAt: string | null }>;
  conflicts: Array<{ subject: Subject; field: string }>;
  omissions: Array<{ reason: string; detail: string }>;
}

const NOTHING: PriorContextForPrompt = { text: "", subjects: [], items: [], conflicts: [], omissions: [] };

export async function priorDecisionsForPrompt(input: {
  teamAgentId: string;
  state: Record<string, unknown> | null | undefined;
  orgId?: string | null;
  purpose: Purpose;
  limit?: number;
}): Promise<PriorContextForPrompt> {
  if (!(await intelligenceContextEnabled())) return NOTHING;
  // The subjects come from the state the run has reached: the step being
  // prompted is mid-run, and what it is deciding about is whatever upstream
  // steps have established.
  const subjects = extractSubjects(input.state).map(s => s.subject);
  if (subjects.length === 0) return NOTHING;
  try {
    const resolved = await resolveContext({
      subjects,
      purpose: input.purpose,
      surface: "team_run",
      orgId: input.orgId ?? null,
      teamAgentId: input.teamAgentId,
      limit: input.limit ?? 3,
    });
    return {
      text: renderContextForPrompt(resolved),
      subjects,
      items: resolved.items.map(i => ({
        subject: i.subject,
        // Every object this one decision answered for, not just the headline.
        // Without it the record understates what the step was shown: one
        // decision covering a submission, its policy and its binder read as
        // having covered one, and a reader of the run could not tell a
        // collapsed item from a single-subject one.
        subjects: i.subjects,
        tier: i.tier, ...(i.matchAxis ? { matchAxis: i.matchAxis } : {}),
        runId: i.citation.runId, decidedAt: i.citation.decidedAt,
      })),
      conflicts: resolved.conflicts.map(c => ({ subject: c.subject, field: c.field })),
      omissions: resolved.omissions.map(o => ({ reason: o.reason, detail: o.detail })),
    };
  } catch (err: any) {
    // A failure here must not fail the step. The run proceeds without prior
    // context, which is how every run worked before this existed.
    console.error("[intelligence-context] resolve failed; step continues without prior decisions:", err?.message);
    return NOTHING;
  }
}

/**
 * The retrieved context as prompt text, with the tier stated per item.
 *
 * The tier is rendered differently on purpose. An agent reading two similar
 * paragraphs treats them alike, so precedent says what it is and says not to
 * copy it; authoritative says this is the record for this object.
 */
export function renderContextForPrompt(result: ResolveContextResult): string {
  if (result.items.length === 0) {
    // Says WHY there is nothing, so an empty recall is not read as "there is
    // no history" when the truth may be "it was withheld for this purpose".
    const why = result.omissions.map((o) => o.detail).join("; ");
    return why ? `## Prior decisions\n\nNone available. ${why}.` : "";
  }
  const lines = ["## Prior decisions"];

  // Conflicts first, and stated as a warning rather than a footnote: two
  // authoritative records of the same object disagreeing is the most
  // decision-relevant thing here, and an agent that reads the records in order
  // would otherwise take whichever it saw last.
  if (result.conflicts.length > 0) {
    lines.push(`\n> **The platform holds conflicting records. Do not assume either is correct; say so rather than choosing.**`);
    for (const c of result.conflicts.slice(0, CONFLICTS_SHOWN)) {
      const vs = c.values
        .map((v) => `${clip(JSON.stringify(v.value), 80)} (run ${v.runId.slice(0, 8)}${v.decidedAt ? `, ${v.decidedAt.slice(0, 10)}` : ""})`)
        .join("  vs  ");
      lines.push(`> - \`${c.field}\` on ${c.subject}: ${vs}`);
    }
    // A hidden conflict is worse than a hidden field: the reader would
    // believe they had seen every disagreement.
    if (result.conflicts.length > CONFLICTS_SHOWN) {
      lines.push(`> - _and ${result.conflicts.length - CONFLICTS_SHOWN} further conflicting field(s) not listed: ${clip(result.conflicts.slice(CONFLICTS_SHOWN).map((c) => c.field).join(", "), 200)}_`);
    }
  }

  for (const i of result.items) {
    // Names every object the one decision covers, rather than repeating the
    // decision once per object.
    const on = i.subjects.length > 1
      ? `${i.subjects.slice(0, -1).join(", ")} and ${i.subjects[i.subjects.length - 1]}`
      : i.subject;
    const head = i.tier === "authoritative"
      ? `This was decided on ${on}`
      : `Precedent only (${(i.matchAxis ?? "").replace(/_/g, " ")}) — consider, do not copy — on ${on}`;
    lines.push(`\n- **${head}**, run ${i.citation.runId.slice(0, 8)}${i.citation.decidedAt ? ` on ${i.citation.decidedAt.slice(0, 10)}` : ""}:`);

    const fields = Object.entries(i.decision);
    for (const [k, v] of fields.slice(0, DECISION_FIELDS_SHOWN)) {
      lines.push(`  - ${k}: ${clip(typeof v === "string" ? v : JSON.stringify(v), 200)}`);
    }
    // Said, not silently dropped. An agent shown 10 of 30 fields with no
    // note cannot tell a short record from a truncated one, and will answer
    // as though it saw everything.
    if (fields.length > DECISION_FIELDS_SHOWN) {
      const rest = fields.slice(DECISION_FIELDS_SHOWN).map(([k]) => k);
      lines.push(`  - _(+${rest.length} further field(s) recorded on this run, not shown here: ${clip(rest.join(", "), 220)})_`);
    }

    // Evidence by reference. Pasting it put ~555 tokens of GL arrays and
    // claims movements into one item; a trace carries the index, and the
    // run id is how a reader fetches the payload itself.
    const ev = Object.entries(i.evidence);
    if (ev.length > 0) {
      const shown = ev.slice(0, EVIDENCE_FIELDS_SHOWN).map(([k, v]) => `${k} (${describeEvidence(v)})`);
      const more = ev.length - shown.length;
      lines.push(`  - _evidence (not inlined; read from run ${i.citation.runId.slice(0, 8)}):_ ${shown.join(", ")}${more > 0 ? `, and ${more} more` : ""}`);
    }
    if (Object.keys(i.narrative).length > 0) {
      lines.push(`  - _narrative from ${Object.keys(i.narrative).length} step(s), not shown: wording varies between runs and is not a record of fact._`);
    }
  }
  for (const o of result.omissions) lines.push(`\n- _Not shown: ${o.detail}._`);
  return lines.join("\n");
}

/** How many fields of a record are rendered before the rest are summarised. */
const DECISION_FIELDS_SHOWN = 10;
const EVIDENCE_FIELDS_SHOWN = 8;
const CONFLICTS_SHOWN = 6;

/** Truncates visibly: a cut value must not read as a complete one. */
function clip(text: string, max: number): string {
  const s = String(text ?? "");
  return s.length <= max ? s : `${s.slice(0, max)}… [${s.length - max} more chars]`;
}

/** A connector answer's shape, enough to decide whether to go and read it. */
function describeEvidence(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as object);
    return keys.length <= 4 ? keys.join("/") : `${keys.length} fields`;
  }
  if (typeof value === "string") return `${value.length} chars`;
  return typeof value;
}
