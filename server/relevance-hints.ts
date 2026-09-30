/**
 * Relevance hints (Phase 3, item 5): whether each of a run's on-demand skills,
 * or each of its linked connectors, is needed for the task in hand.
 *
 * Nothing in code decides this today. An agent's prompt lists its on-demand
 * skills and the model chooses which to load with read_skill; its tool list
 * holds every tool of every linked connector and the model chooses which to
 * call. The decision seam can guess before the run, and what the run actually
 * loaded and called is the incumbent that guess is measured against.
 *
 * Two calls, each acting on one route only, so a site is either measured or
 * used and never both at once:
 *
 *   recordRelevance   shadow. After the run, one yes/no per item with what the
 *                     run used as the known incumbent. Agreement means the
 *                     model loaded what the decision model would have named.
 *   relevanceHint     jev. Before the run, the items the decision model is
 *                     confident the task needs, for the caller to name in the
 *                     prompt. The model keeps the last word: a hint narrows
 *                     nothing. Once a site is hinted, what the run used is no
 *                     longer an independent answer, so it is not measured.
 *
 * Under the kill switch (llm) neither does anything. Neither can fail a run.
 */
import { decideMany, knownIncumbent, type DecisionQuestion } from "./decision-provider";
import { resolveDecisionRoute } from "./decision-settings";

export interface RelevanceItem { name: string; description?: string | null }

export interface RelevanceArgs {
  /** "skill_relevance" | "connector_preselect" */
  site: string;
  /** What the run was asked to do. */
  task: string;
  items: RelevanceItem[];
  orgId?: string | null;
  /** What an item is called in the question: "skill", "connector". */
  noun: string;
}

/** One call carries at most this many items; the catalog itself shows twenty. */
export const MAX_RELEVANCE_ITEMS = 20;
const TASK_CHARS = 6_000;
const DESCRIPTION_CHARS = 300;

const key = (i: number) => `i${i}`;
const norm = (s: string) => String(s ?? "").trim().toLowerCase();

function setFor(args: RelevanceArgs): { items: RelevanceItem[]; state: Record<string, unknown>; questions: Record<string, DecisionQuestion> } | null {
  const task = String(args.task ?? "").trim();
  const items = args.items.filter((it) => it && String(it.name ?? "").trim()).slice(0, MAX_RELEVANCE_ITEMS);
  if (!task || items.length === 0) return null;
  const questions: Record<string, DecisionQuestion> = {};
  items.forEach((it, i) => {
    questions[key(i)] = {
      kind: "noul",
      instructions: `Is the ${args.noun} "${it.name}" needed to do this task?`,
      criteria: { true: `The task cannot be done properly without this ${args.noun}`, false: `The task does not call for this ${args.noun}` },
      subject: it.name.slice(0, 500),
    };
  });
  return {
    items,
    state: { task: task.slice(0, TASK_CHARS), [`${args.noun}s`]: items.map((it) => ({ name: it.name, description: String(it.description ?? "").slice(0, DESCRIPTION_CHARS) })) },
    questions,
  };
}

/**
 * The items the decision model is confident the task needs. Acts only when the
 * site is routed on it; [] otherwise, and on any error.
 */
export async function relevanceHint(args: RelevanceArgs): Promise<string[]> {
  const set = setFor(args);
  if (!set) return [];
  try {
    const route = await resolveDecisionRoute(args.site, args.orgId);
    if (route.mode !== "jev") return [];
    const decided = await decideMany({
      site: args.site,
      state: set.state,
      orgId: args.orgId,
      questions: set.questions,
      // Where the decision model is unsure, the fallback is to say nothing.
      incumbent: async (keys) => ({ answers: Object.fromEntries(keys.map((k) => [k, false])), model: "no-hint", latencyMs: 0 }),
    });
    return set.items.filter((_, i) => decided[key(i)]?.engine === "jev" && decided[key(i)]?.answer === true).map((it) => it.name);
  } catch (err: unknown) {
    console.warn(`[relevance] ${args.site} hint unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * After the run, in shadow: the same questions with what the run actually used
 * as the known incumbent. Not awaited by the caller; never throws.
 */
export function recordRelevance(args: RelevanceArgs & { used: string[] }): void {
  void (async () => {
    const set = setFor(args);
    if (!set) return;
    const route = await resolveDecisionRoute(args.site, args.orgId);
    if (route.mode !== "shadow") return;
    const used = new Set(args.used.map(norm));
    const known: Record<string, boolean> = {};
    set.items.forEach((it, i) => { known[key(i)] = used.has(norm(it.name)); });
    await decideMany({
      site: args.site,
      state: set.state,
      orgId: args.orgId,
      questions: set.questions,
      incumbent: knownIncumbent(known, { model: "the-run", latencyMs: 0 }),
    });
  })().catch((err: unknown) => {
    console.warn(`[relevance] ${args.site} measurement unavailable: ${err instanceof Error ? err.message : String(err)}`);
  });
}

/** The skills a run loaded, from its tool-call record: every name passed to read_skill that succeeded. */
export function loadedSkillNames(toolCalls: Array<{ toolName: string; args?: unknown; error?: unknown }>, readSkillTool = "read_skill"): string[] {
  const names = new Set<string>();
  for (const call of toolCalls) {
    if (call.toolName !== readSkillTool || call.error) continue;
    const a = (call.args ?? {}) as { skill?: unknown; skills?: unknown };
    if (typeof a.skill === "string" && a.skill.trim()) names.add(a.skill.trim());
    if (Array.isArray(a.skills)) for (const s of a.skills) if (typeof s === "string" && s.trim()) names.add(s.trim());
  }
  return Array.from(names);
}
