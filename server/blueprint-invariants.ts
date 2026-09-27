/**
 * Is this team's graph one that can actually run?
 *
 * Until now the answer was only ever discovered by running it. computeWaves
 * rejects a cyclic graph, so a team whose blueprint holds one edge pointing
 * backwards dies with "Cycle detected in team graph" the first time anybody
 * presses run -- while the build said success, the sync said success and the
 * deployment went active. Live 2026-09-27: a 22-node team, three loops, zero
 * runs, and nothing on any surface saying why.
 *
 * Two things are checked, and the difference between them matters:
 *
 * - a loop left as an EDGE stops every run before its first step (blocksRun);
 * - a revision rule pointing at a step that is no longer in the team runs fine
 *   and silently never fires, which is worse to diagnose and not worth blocking a
 *   deployment over.
 *
 * Everything here is read from the stored rows, so a finding is measured, not
 * inferred from what a build intended to write.
 */
import { storage } from "./storage";
import { backEdgeKeys } from "@shared/graph-cycles";

export interface BlueprintFinding {
  kind: "cycle" | "dangling_revision" | "no_fallback_branch" | "unreachable_rule_field" | "branch_judged_by_model";
  /** Sentence naming the steps involved and what to do, for a card or a route. */
  message: string;
  /** True when no run can start at all. */
  blocksRun: boolean;
  /** The step labels involved, for a caller that formats its own copy. */
  steps: string[];
}

export interface BlueprintCheck {
  /** False only when something stops a run from starting. */
  runnable: boolean;
  findings: BlueprintFinding[];
  checked: { nodes: number; edges: number };
}

const OK: BlueprintCheck = { runnable: true, findings: [], checked: { nodes: 0, edges: 0 } };

export async function checkBlueprintInvariants(blueprintId: string | null | undefined): Promise<BlueprintCheck> {
  if (!blueprintId) return OK;
  const nodes = (await storage.getTeamBlueprintNodes(blueprintId).catch(() => [])) as any[];
  const edges = (await storage.getTeamBlueprintEdges(blueprintId).catch(() => [])) as any[];
  if (nodes.length === 0) return { ...OK, checked: { nodes: 0, edges: edges.length } };

  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const findings: BlueprintFinding[] = [];
  const outgoing = new Map<string, any[]>();
  for (const e of edges) outgoing.set(e.sourceNodeId, [...(outgoing.get(e.sourceNodeId) ?? []), e]);
  const guarded = (e: any) => !!(String(e.condition ?? "").trim() || (e.evaluationMode === "deterministic" && e.rule));

  const loops = backEdgeKeys(
    nodes.map((n) => n.id),
    edges.map((e) => ({ from: e.sourceNodeId, to: e.targetNodeId })),
  );
  for (const key of Array.from(loops)) {
    const [from, to] = key.split("::");
    findings.push({
      kind: "cycle",
      blocksRun: true,
      steps: [labelOf(from), labelOf(to)],
      message: `"${labelOf(from)}" has a connection back to "${labelOf(to)}", so the team's steps form a loop and no run can start. Sending work back belongs on the reviewing step as a revision rule, which is what syncing the flow again writes.`,
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    const target = ((node.config as any)?.revision as { targetNodeId?: string } | undefined)?.targetNodeId;
    if (target && !nodeIds.has(target)) {
      findings.push({
        kind: "dangling_revision",
        blocksRun: false,
        steps: [node.label],
        message: `"${node.label}" sends work back to a step that is no longer part of this team, so that loop can never fire. It usually means the step it pointed at was replaced; syncing the flow again repoints it.`,
      });
    }
  }

  // --- a decision with no way through ---
  //
  // Live 2026-09-27, found by another session on the first runs of a team that had
  // never run: a router node completed, both of its outgoing conditions evaluated
  // false, and every remaining step -- filing, pre-bind, both sign-offs, the
  // binder, the bordereau, the notification -- was skipped. The run terminated
  // "completed_with_skips": success, having bound nothing.
  //
  // What is said here is the CONSEQUENCE, not a claim that the conditions cannot
  // match. Proving that would mean inferring an expression's output keys from its
  // JSONata, and a wrong "this can never match" in a governance check is worse
  // than the gap it closes. A node where the author knows one branch always
  // matches is a legitimate design, so this never blocks a deployment.
  //
  // Gates are exempt: an approval node resolves its own approve/reject polarity,
  // so conditions on every edge out of one are how it is meant to be built.
  //
  // It also only fires when NONE of those ways out is a rule the engine can
  // evaluate itself, and that narrowing was measured rather than guessed. Census
  // over the 85 team blueprints on Azure, 2026-09-27: flagging every node whose
  // ways out are all conditional hit 50 nodes across 30 teams -- most of them
  // ordinary, well-built decisions, which is the kind of finding people learn to
  // scroll past. Requiring that none of them be a rule hit 4 nodes across 4 teams,
  // and the first was the live failure above. A branch decided entirely by prose
  // is also the one where nothing can be verified before the run.
  for (const node of nodes) {
    const outs = outgoing.get(node.id) ?? [];
    if (outs.length === 0) continue;
    if (node.nodeType === "edge_gate" || node.gateType) continue;
    // An expression step gets the more specific finding below instead, so a node
    // is never described twice.
    if (node.nodeType === "expression") continue;
    if (!outs.every(guarded)) continue;
    if (outs.some((e: any) => e.evaluationMode === "deterministic" && e.rule)) continue;
    findings.push({
      kind: "no_fallback_branch",
      blocksRun: false,
      steps: [node.label, ...outs.map((e: any) => labelOf(e.targetNodeId))],
      message: `"${node.label}" has ${outs.length === 1 ? "one way on and it is conditional" : `${outs.length} ways on and every one of them is conditional`} (to ${outs.map((e: any) => `"${labelOf(e.targetNodeId)}"`).join(", ")}). If none of them matches at run time, every step after it is skipped and the run still reports completed — so a run that did nothing looks like a run that worked. An unconditional path out, or a condition that is always true, gives it somewhere to go.`,
    });
  }

  // --- a rule reading from a step that is not there ---
  //
  // A rule field written as "<step>.<field>" names another step's output by its
  // stateKey. A step that was replaced gets a NEW stateKey, so the reference goes
  // nowhere and the branch is dead. Only dotted references are checked: a bare
  // field like "aggregate" is read from the merged run state, where it comes from
  // inside some step's JSON output and cannot be known from the blueprint --
  // flagging those would be guessing.
  const stateKeys = new Set(nodes.map((n) => String(n.stateKey ?? "")).filter(Boolean));
  const RUNTIME_PREFIXES = new Set(["state", "input", "output", "request", "run"]);
  const fieldsOf = (rule: unknown, into: string[] = []): string[] => {
    const group = rule as { conditions?: unknown[] } | null;
    if (!group || !Array.isArray(group.conditions)) return into;
    for (const c of group.conditions) {
      const leaf = c as { field?: unknown; conditions?: unknown[] };
      if (Array.isArray(leaf?.conditions)) fieldsOf(leaf, into);
      else if (typeof leaf?.field === "string") into.push(leaf.field);
    }
    return into;
  };
  for (const e of edges) {
    if (e.evaluationMode !== "deterministic" || !e.rule) continue;
    for (const field of fieldsOf(e.rule)) {
      const prefix = field.includes(".") ? field.split(".")[0] : "";
      if (!prefix || stateKeys.has(prefix) || RUNTIME_PREFIXES.has(prefix)) continue;
      findings.push({
        kind: "unreachable_rule_field",
        blocksRun: false,
        steps: [labelOf(e.sourceNodeId), labelOf(e.targetNodeId)],
        message: `The path from "${labelOf(e.sourceNodeId)}" to "${labelOf(e.targetNodeId)}" is decided by "${field}", but no step in this team writes "${prefix}" — usually the step it named was replaced and took its state key with it. The rule reads nothing, so that path is never taken.`,
      });
    }
  }

  // --- a structured step whose branches are prose ---
  //
  // An expression step emits JSON. When every path out of it is judged by a model
  // reading that JSON against a sentence, two things follow: a model call per run
  // to decide something arithmetic, and no error when the sentence and the JSON
  // use different words for the same thing -- which is exactly how the live case
  // above went unnoticed ({"route":"escalate"} against "Endorsement approved").
  for (const node of nodes) {
    if (node.nodeType !== "expression") continue;
    const outs = outgoing.get(node.id) ?? [];
    if (outs.length === 0 || !outs.every(guarded)) continue;
    if (outs.some((e: any) => e.evaluationMode === "deterministic" && e.rule)) continue;
    findings.push({
      kind: "branch_judged_by_model",
      blocksRun: false,
      steps: [node.label],
      message: `"${node.label}" produces a structured result, but every path out of it is judged by a model reading a sentence (${outs.map((e: any) => `"${String(e.condition ?? "").trim()}"`).join(", ")}). That costs a model call on every run to decide something the engine could evaluate itself, and nothing notices when the sentence and the step's own field names disagree. Writing these as rules on the fields the step emits removes both risks.`,
    });
  }

  return { runnable: !findings.some((f) => f.blocksRun), findings, checked: { nodes: nodes.length, edges: edges.length } };
}
