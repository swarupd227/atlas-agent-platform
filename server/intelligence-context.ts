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
  type StepContract, type Conflict,
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
    const fields = new Set(group.flatMap((i) => Object.keys(i.decision)));
    for (const field of fields) {
      const present = group.filter((i) => field in i.decision);
      if (present.length < 2) continue;
      // Only a value short enough to be a fact can be a conflict of fact. A
      // long block differing is two accounts of the same thing, not two
      // claims about it, and reporting it drowns the real conflicts.
      if (present.some((i) => JSON.stringify(i.decision[field] ?? "").length > 240)) continue;
      const distinct = new Set(present.map((i) => JSON.stringify(i.decision[field])));
      if (distinct.size < 2) continue;
      conflicts.push({
        subject,
        field,
        values: present.map((i) => ({ runId: i.citation.runId, decidedAt: i.citation.decidedAt, value: i.decision[field] })),
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

  const runs = await storage.listDagExecutionRunsByOrg(input.orgId ?? undefined, scan).catch(() => []);

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

  for (const run of runs) {
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

  // Authoritative first, then the stronger precedent axes, then recency.
  const axisRank: Record<string, number> = { same_customer: 0, same_class_of_business: 1, similar_risk: 2 };
  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "authoritative" ? -1 : 1;
    const ar = axisRank[a.matchAxis ?? ""] ?? 3, br = axisRank[b.matchAxis ?? ""] ?? 3;
    if (ar !== br) return ar - br;
    return String(b.citation.decidedAt ?? "").localeCompare(String(a.citation.decidedAt ?? ""));
  });

  const kept = items.slice(0, limit);

  const missed = requested.filter((s) => !kept.some((i) => i.subject === s));
  for (const s of missed) omissions.push({ reason: "no_record", subject: s, detail: `No finished run recorded a decision on ${s}` });
  if (withheld > 0) {
    omissions.push({
      reason: "withheld_precedent_for_purpose",
      detail: `${withheld} precedent item(s) withheld: purpose "${input.purpose}" may only use authoritative context, so a decision from another journey cannot satisfy it`,
      count: withheld,
    });
  }
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
    usedSubjects: [...new Set(kept.map((i) => i.subject))],
    missedSubjects: missed,
    unclassifiedKeys: [...unclassified],
  };
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
    const head = i.tier === "authoritative"
      ? `This was decided on ${i.subject}`
      : `Precedent only (${(i.matchAxis ?? "").replace(/_/g, " ")}) — consider, do not copy — on ${i.subject}`;
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
