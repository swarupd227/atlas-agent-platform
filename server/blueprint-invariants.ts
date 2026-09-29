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
import { expressionOutputKeys, nodeOutputSchema } from "./expression-contract";
import { backEdgeKeys } from "@shared/graph-cycles";
import { judgeConditionField, ruleFields, statePaths } from "@shared/rule-fields";
import { effectiveStateKey } from "@shared/state-key";

export interface BlueprintFinding {
  kind:
    | "cycle"
    | "dangling_revision"
    | "no_fallback_branch"
    | "unreachable_rule_field"
    /** A branch condition that cannot be true: see the check at the end of this file. */
    | "unsatisfiable_condition"
    /** A field an Expression step constructs but only reports in some runs. */
    | "conditional_output_field"
    | "branch_judged_by_model";
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
  const guarded = (e: any) => !!(String(e.condition ?? "").trim() || (e.evaluationMode === "deterministic" && e.rule) || e.evaluationMode === "decision");

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
    // A decision step always takes exactly one of its branches: that is what the
    // node is. There is no "none matched" to warn about.
    if (node.nodeType === "decision") continue;
    // An expression step gets the more specific finding below instead, so a node
    // is never described twice.
    if (node.nodeType === "expression") continue;
    if (!outs.every(guarded)) continue;
    if (outs.some((e: any) => e.evaluationMode === "deterministic" && e.rule)) continue;
    const where = outs.map((e: any) => `"${labelOf(e.targetNodeId)}"`).join(", ");
    findings.push({
      kind: "no_fallback_branch",
      blocksRun: false,
      steps: [node.label, ...outs.map((e: any) => labelOf(e.targetNodeId))],
      // What happens AFTER such a run differs by shape, and the difference is
      // deliberate on the engine's side: it calls a step a dead end only when two
      // or more branching paths were all skipped (`branching.length >= 2` in
      // execute()), because a lone conditional path that does not fire has always
      // counted as success -- dag-conditional-edges asserts it. So for one way on,
      // this finding is the only warning anyone will ever get, and it says so.
      message: outs.length >= 2
        ? `"${node.label}" has ${outs.length} ways on and every one of them is conditional (to ${where}). If none of them matches at run time, every step after it is skipped; the run then fails and names this step — but nothing says so until it has run. An unconditional path out, or a rule the engine can check itself, settles it before then.`
        : `"${node.label}" has one way on and it is conditional (to ${where}). If it answers false at run time, every step after it is skipped and the run still reports completed: a single conditional path that does not fire counts as success, so nothing after the fact will raise it. This is the only warning it gets.`,
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
  //
  // The key compared is the one the engine FILES UNDER, not the stored column:
  // a node holding no key is filed by a slug of its label. Comparing the column
  // let a team whose agent wrote endorsement_accepted_agent, against rules
  // reading endorsement_accepted, pass this check with nothing to compare
  // (live 2026-09-29: every step after that decision skipped, sync and deploy
  // both green).
  const stateKeys = new Set(nodes.map((n) => effectiveStateKey(n)).filter(Boolean));
  const RUNTIME_PREFIXES = new Set(["state", "input", "output", "request", "run"]);
  for (const e of edges) {
    if (e.evaluationMode !== "deterministic" || !e.rule) continue;
    for (const field of ruleFields(e.rule)) {
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
      message: `"${node.label}" produces a structured result, but every path out of it is judged by a model reading a sentence (${outs.map((e: any) => `"${String(e.condition ?? "").trim()}"`).join(", ")}). That costs a model call on every run to decide something the engine could evaluate itself, and nothing notices when the sentence and the step's own field names disagree. ${outs.length >= 2 ? "A run where none of them matches fails and names this step, which is after the fact." : "A run where it does not match still reports completed, so nothing after the fact will raise it."} Writing these as rules on the fields the step emits removes both risks.`,
    });
  }

  // --- a branch condition that cannot be true ---
  //
  // The check above compares the field's PREFIX with the team's state keys, and
  // for nine of the thirteen dead edges found on the live fleet the prefix was a
  // perfectly real step. What was missing was the property after the dot:
  // `pre_bind_quality_check.passed` reads a step that exists and a property it
  // never emits, so the branch behind it had never once been taken in 85 runs.
  //
  // Two sources decide it, and a finding always says which one it rests on: the
  // producing step's declared output schema (decisive, before any run), or the
  // fields recent runs actually produced (evidence, not proof -- hence never
  // blocking, and never raised below a floor of runs).
  const nodeByStateKey = new Map(nodes.map((n) => [effectiveStateKey(n), n] as const).filter(([k]) => !!k));
  const { observedPaths, pathRuns, runsObserved } = await observedStateFields(blueprintId);

  for (const e of edges) {
    if (e.evaluationMode !== "deterministic" || !e.rule) continue;
    for (const field of ruleFields(e.rule)) {
      const producer = nodeByStateKey.get(field.split(".")[0]);
      const verdict = judgeConditionField({
        field,
        stateKeys,
        producerSchema: nodeOutputSchema(producer),
        observedPaths,
        runsObserved,
      });
      if (verdict.satisfiable) {
        // A key the expression DOES construct, that some runs nonetheless did
        // not report. JSONata omits a key whose value evaluates to undefined,
        // so a verdict like `$heaviest.share > 35` vanishes in exactly the runs
        // where the answer would be "no" -- and the run then records the step
        // as skipped for a field "nothing produces". Live case 2026-09-29: the
        // E&S carrier approval gate, which fires normally whenever the field IS
        // reported. Only raised for Expression steps, whose output shape is
        // meant to be fixed; an agent's wording varying between runs is not news.
        const dot = field.indexOf(".");
        const property = dot > 0 ? field.slice(dot + 1) : "";
        const constructed = producer?.nodeType === "expression"
          ? expressionOutputKeys((producer.config as { expression?: string } | null)?.expression)
          : null;
        const seenIn = pathRuns.get(field) ?? 0;
        if (constructed?.includes(property) && runsObserved >= 3 && seenIn > 0 && seenIn < runsObserved) {
          findings.push({
            kind: "conditional_output_field",
            blocksRun: false,
            steps: [labelOf(e.sourceNodeId), labelOf(e.targetNodeId)],
            message: `"${producer?.label ?? field.split(".")[0]}" builds "${property}", but only ${seenIn} of the last ${runsObserved} runs reported it — an expression leaves a key out entirely when its value works out to nothing. The path from "${labelOf(e.sourceNodeId)}" to "${labelOf(e.targetNodeId)}" reads it, so in the other runs that path is skipped and recorded as a condition on a field nothing produces. Give the key a value in every case (a guard such as $exists(...) around the comparison) so the step always reports its answer, including when the answer is no.`,
          });
        }
        continue;
      }
      const from = labelOf(e.sourceNodeId);
      const to = labelOf(e.targetNodeId);
      findings.push({
        kind: "unsatisfiable_condition",
        blocksRun: false,
        steps: [from, to],
        message:
          verdict.basis === "schema"
            ? `The path from "${from}" to "${to}" is decided by "${field}", but "${producer?.label ?? field.split(".")[0]}" declares it produces ${verdict.declared.length > 0 ? verdict.declared.map((d) => `"${d}"`).join(", ") : "nothing"} — not "${field.split(".").slice(1).join(".")}". The condition can never be true, so that path is never taken and every step behind it is skipped.`
            : `The path from "${from}" to "${to}" is decided by "${field}", and "${field}" has not appeared in any of the last ${verdict.runsObserved} runs of this team. That is evidence rather than proof — a rare case might still produce it — but if it is a typo for a field the step does emit, every step behind this path is being skipped on every run.`,
      });
    }
  }

  return { runnable: !findings.some((f) => f.blocksRun), findings, checked: { nodes: nodes.length, edges: edges.length } };
}

/**
 * The dotted paths recent runs of this team actually produced.
 *
 * Read from completed runs' final state, newest first, because that is the only
 * evidence available when a step declares no output schema — which, measured on
 * 2026-09-28, was every step of all six teams that skip anything.
 *
 * Returns nothing on any failure: a check that cannot see run history must say
 * "no evidence" and let the condition pass, never invent a defect.
 */
async function observedStateFields(blueprintId: string): Promise<{ observedPaths: Set<string>; pathRuns: Map<string, number>; runsObserved: number }> {
  const empty = { observedPaths: new Set<string>(), pathRuns: new Map<string, number>(), runsObserved: 0 };
  try {
    const agents = await storage.listAgentsByBlueprintId(blueprintId);
    const teamAgentId = agents[0]?.id;
    if (!teamAgentId) return empty;
    const runs = await storage.listDagExecutionRunsByTeamAgent(teamAgentId, 10);
    if (runs.length === 0) return empty;
    const observedPaths = new Set<string>();
    // How many of those runs each path appeared in. A path present in some runs
    // and absent in others is a producer whose output shape changes, which reads
    // downstream as a condition on a field nothing produces.
    const pathRuns = new Map<string, number>();
    let runsObserved = 0;
    for (const run of runs) {
      const state = run?.finalState ?? run?.currentState;
      if (!state || typeof state !== "object") continue;
      runsObserved++;
      for (const path of Array.from(statePaths(state))) {
        observedPaths.add(path);
        pathRuns.set(path, (pathRuns.get(path) ?? 0) + 1);
      }
    }
    return { observedPaths, pathRuns, runsObserved };
  } catch {
    return empty;
  }
}
