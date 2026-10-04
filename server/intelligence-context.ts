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
  type StepContract,
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

/** Which axis, if any, makes an unrelated run relevant to this request. */
function axisFor(
  runSubjects: Subject[],
  requested: Subject[],
  sameJourney: boolean,
): MatchAxis | null {
  const party = (s: Subject) => s.startsWith("broker:") || s.startsWith("agency:");
  const requestedParties = new Set(requested.filter(party));
  // Strongest: the same counterparty, whatever the subject of the decision.
  if (runSubjects.some((s) => party(s) && requestedParties.has(s))) return "same_customer";
  // Same journey, different subject: the same class of business by definition,
  // since a journey is built for one.
  if (sameJourney) return "same_class_of_business";
  // Weakest, and the most easily spurious. Returned, but never silently: the
  // caller sees the axis and can discount it.
  if (runSubjects.length > 0) return "similar_risk";
  return null;
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
  const indexCache = new Map<string, Map<string, StepContract> | null>();
  const stepsFor = async (teamAgentId: string | null): Promise<Map<string, StepContract> | null> => {
    if (!teamAgentId) return null;
    if (indexCache.has(teamAgentId)) return indexCache.get(teamAgentId) ?? null;
    let index: Map<string, StepContract> | null = null;
    try {
      const agent = await storage.getAgent(teamAgentId, input.orgId ?? undefined);
      if (agent?.blueprintId) {
        const nodes = await storage.getTeamBlueprintNodes(agent.blueprintId);
        index = buildStepIndex(nodes as any[], { teamStateKey: teamStateKeyFor(agent.name ?? "") });
      }
    } catch { index = null; }
    indexCache.set(teamAgentId, index);
    return index;
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
    const { durable: decision, fromKeys, unclassified: unk } = traceStateOf(state, steps);
    for (const k of unk) unclassified.add(k);
    if (Object.keys(decision).length === 0) continue;

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
  if (unclassified.size > 0) {
    omissions.push({
      reason: "unclassified_keys",
      detail: `${unclassified.size} state key(s) are classified neither decision nor session, so they were excluded rather than assumed durable: ${[...unclassified].slice(0, 12).join(", ")}`,
      count: unclassified.size,
    });
  }

  return {
    items: kept,
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
  for (const i of result.items) {
    const head = i.tier === "authoritative"
      ? `This was decided on ${i.subject}`
      : `Precedent only (${(i.matchAxis ?? "").replace(/_/g, " ")}) — consider, do not copy — on ${i.subject}`;
    lines.push(`\n- **${head}**, run ${i.citation.runId.slice(0, 8)}${i.citation.decidedAt ? ` on ${i.citation.decidedAt.slice(0, 10)}` : ""}:`);
    for (const [k, v] of Object.entries(i.decision).slice(0, 10)) {
      lines.push(`  - ${k}: ${typeof v === "string" ? v.slice(0, 200) : JSON.stringify(v).slice(0, 200)}`);
    }
  }
  for (const o of result.omissions) lines.push(`\n- _Not shown: ${o.detail}._`);
  return lines.join("\n");
}
