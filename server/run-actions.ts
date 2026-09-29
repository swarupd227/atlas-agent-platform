/**
 * What a run actually did.
 *
 * The surfaces around runs report a status and a duration. Measured across the
 * 85 most recent team runs (2026-09-28): 536 of 1,501 steps never ran, 61 of 85
 * runs skipped at least one, and only 14 completed cleanly — while the usual
 * recorded status was `completed_with_skips`, which reads as success. The worst
 * ran 4 of 27 steps and cost real money doing it.
 *
 * So everything here answers in two halves: what the run is said to be, and how
 * much of it happened. And where a step did not run, the cause is worked out
 * from the RUN'S OWN GRAPH — were this step's sources skipped too? — rather than
 * by parsing the recorded message, so runs recorded before the engine
 * distinguished the causes are classified just as well as new ones.
 */
import { storage } from "./storage";
import { computeWaves } from "./dag-execution-engine";
import { causeFromMessage, fieldsInSkipMessage, isProblemCause, isStuck, producerOmitted, type SkipCause } from "@shared/run-words";

export class RunActionError extends Error {}

export interface RunNodeOutcome {
  nodeId: string;
  label: string;
  stateKey: string | null;
  status: string;
  cause: SkipCause | null;
  /** The engine's own words, kept verbatim. */
  detail: string | null;
  durationMs: number | null;
  costUsd: number | null;
  toolCalls: number | null;
}

export interface RunSummary {
  id: string;
  team: { id: string | null; name: string };
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  steps: { total: number; ran: number; skipped: number; failed: number };
  costUsd: number | null;
  stuck: boolean;
  /** Skips whose cause is a defect rather than a branch working as drawn. */
  problemSkips: number;
  waitingOnApproval: boolean;
}

const nodesOf = (run: any): any[] =>
  ((run?.waveResults ?? []) as any[]).flatMap((w) => (w?.nodes ?? []) as any[]);

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(v as any);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

/**
 * A `missing_field` verdict, checked against the run's own state.
 *
 * Runs recorded before 2026-09-29 used one sentence for two opposite findings:
 * a condition reading a field nothing produces (a branch that can never be
 * taken) and one whose producing step ran and simply did not report it (correct
 * routing). The state settles it after the fact — if something wrote under the
 * field's own key, the producer ran. Measured over the 60 most recent runs, 7
 * of 15 such skips were a silent producer, every one of them on a gate that
 * fires normally in the runs where the field IS reported.
 */
function refineMissingField(cause: SkipCause, message: string | null | undefined, state: unknown): SkipCause {
  if (cause !== "missing_field" || !state) return cause;
  const fields = fieldsInSkipMessage(message);
  if (fields.length === 0) return cause;
  return fields.every((field) => producerOmitted(state, field)) ? "producer_omitted_field" : cause;
}

function summarise(run: any, teamName: string): RunSummary {
  const nodes = nodesOf(run);
  const skipped = nodes.filter((n) => n.status === "skipped");
  const failed = nodes.filter((n) => n.status === "failed" || n.status === "error");
  const startedAt = iso(run.startedAt);
  const completedAt = iso(run.completedAt);
  return {
    id: run.id,
    team: { id: run.teamAgentId ?? null, name: teamName },
    status: String(run.status ?? "unknown"),
    startedAt,
    completedAt,
    durationMs: startedAt ? (completedAt ? new Date(completedAt).getTime() : Date.now()) - new Date(startedAt).getTime() : null,
    steps: { total: nodes.length, ran: nodes.length - skipped.length, skipped: skipped.length, failed: failed.length },
    costUsd: typeof run.totalCostUsd === "number" ? run.totalCostUsd : null,
    stuck: isStuck(String(run.status ?? ""), startedAt, iso(run.heartbeatAt)),
    // Cheap pass for the list: the message plus the run's state, which is all
    // that is needed to spot the defect causes. It cannot tell a cascade from a
    // false condition — neither is a defect, so the count is unaffected — and
    // the detail view works every cause out from the graph instead.
    problemSkips: skipped.filter((n) => isProblemCause(refineMissingField(causeFromMessage(n.error), n.error, run.finalState))).length,
    waitingOnApproval: !!run.pendingApprovalId,
  };
}

/** The organization's most recent runs — the one read both fleet views share. */
async function recentRuns(orgId: string | undefined, limit: number): Promise<any[]> {
  return (await storage.listDagExecutionRunsByOrg(orgId, limit).catch(() => [])) as any[];
}

/**
 * Recent runs across the organization, each with how much of it ran.
 *
 * Deliberately does NOT load any blueprint: this is the list, and one graph per
 * run would make it slow enough that nobody opens it.
 */
export async function runsOverview(orgId: string | undefined, limit = 60): Promise<{
  runs: RunSummary[];
  counts: {
    runs: number;
    cleanRuns: number;
    runsWithSkips: number;
    failed: number;
    running: number;
    stuck: number;
    waitingOnApproval: number;
    steps: number;
    stepsSkipped: number;
    costUsd: number;
  };
}> {
  const runs = await recentRuns(orgId, limit);
  const teamIds = Array.from(new Set(runs.map((r) => r.teamAgentId).filter(Boolean)));
  const names = new Map<string, string>();
  for (const id of teamIds) {
    const agent = await storage.getAgent(id as string, orgId).catch(() => undefined);
    if (agent?.name) names.set(id as string, agent.name);
  }

  const summaries = runs.map((r) => summarise(r, names.get(r.teamAgentId) ?? "a team that is no longer here"));
  const steps = summaries.reduce((a, s) => a + s.steps.total, 0);
  const stepsSkipped = summaries.reduce((a, s) => a + s.steps.skipped, 0);
  return {
    runs: summaries,
    counts: {
      runs: summaries.length,
      cleanRuns: summaries.filter((s) => s.steps.total > 0 && s.steps.skipped === 0 && s.status === "completed").length,
      runsWithSkips: summaries.filter((s) => s.steps.skipped > 0).length,
      failed: summaries.filter((s) => s.status === "failed").length,
      running: summaries.filter((s) => s.status === "running").length,
      stuck: summaries.filter((s) => s.stuck).length,
      waitingOnApproval: summaries.filter((s) => s.waitingOnApproval).length,
      steps,
      stepsSkipped,
      costUsd: Math.round(summaries.reduce((a, s) => a + (s.costUsd ?? 0), 0) * 100) / 100,
    },
  };
}

interface TeamGraph {
  labels: Map<string, { label: string; stateKey: string | null }>;
  incoming: Map<string, string[]>;
  /** False when the team has no graph, or one that cannot be planned (a cycle). */
  planKnown: boolean;
}

const emptyGraph = (): TeamGraph => ({ labels: new Map(), incoming: new Map(), planKnown: false });

/**
 * A team's graph: step labels and, for each step, the steps feeding it.
 *
 * Loaded once and shared, because the graph is what makes a cause real rather
 * than a reading of the recorded message, and the fleet views ask about several
 * runs of the same team. Without it the causes fall back to the message — never
 * to a guess.
 */
async function teamGraph(blueprintId: string | null | undefined): Promise<TeamGraph> {
  if (!blueprintId) return emptyGraph();
  const [bpNodes, bpEdges] = await Promise.all([
    storage.getTeamBlueprintNodes(blueprintId).catch(() => []),
    storage.getTeamBlueprintEdges(blueprintId).catch(() => []),
  ]);
  const graph = emptyGraph();
  graph.labels = new Map((bpNodes as any[]).map((n) => [n.id, { label: String(n.label ?? n.id), stateKey: n.stateKey ?? null }]));
  try {
    const plan: any = computeWaves(bpNodes as any, bpEdges as any);
    for (const [nodeId, edges] of Object.entries(plan.incomingEdges ?? {})) {
      graph.incoming.set(nodeId, (edges as any[]).map((e) => e.sourceNodeId));
    }
    graph.planKnown = true;
  } catch {
    // A graph that cannot be planned still has labels worth showing.
  }
  return graph;
}

/**
 * Why each step of one run did or did not happen.
 *
 * The cause is decided by the graph first: if every edge into a skipped step
 * came from a step that was itself skipped, then this step's own condition was
 * never evaluated, whatever its recorded message says. That matters because 14
 * of the 22 steps that had never run in any recent run were in exactly that
 * position, all reporting a message about their own condition.
 */
export async function explainRun(orgId: string | undefined, runId: string): Promise<{
  run: RunSummary;
  steps: RunNodeOutcome[];
  byCause: Record<string, number>;
  /** Steps that did run, in the order the plan put them. */
  planKnown: boolean;
}> {
  const run = await storage.getDagExecutionRun(runId).catch(() => undefined);
  if (!run) throw new RunActionError(`No run with id "${runId}".`);
  const team = run.teamAgentId ? await storage.getAgent(run.teamAgentId, orgId).catch(() => undefined) : undefined;
  if (run.teamAgentId && !team) throw new RunActionError("That run belongs to another organization.");

  const nodes = nodesOf(run);
  const statusById = new Map<string, string>(nodes.map((n) => [n.nodeId, String(n.status ?? "")]));
  const { labels, incoming, planKnown } = await teamGraph((team as any)?.blueprintId);

  const steps: RunNodeOutcome[] = nodes.map((n) => {
    const known = labels.get(n.nodeId);
    const status = String(n.status ?? "");
    return {
      nodeId: n.nodeId,
      label: known?.label ?? n.nodeId.slice(0, 8),
      stateKey: known?.stateKey ?? null,
      status,
      cause: status === "skipped" ? causeOfSkip(n, incoming, statusById, run.finalState) : null,
      detail: n.error ?? null,
      durationMs: typeof n.durationMs === "number" ? n.durationMs : null,
      costUsd: typeof n.costUsd === "number" ? n.costUsd : null,
      toolCalls: typeof n.toolCallCount === "number" ? n.toolCallCount : null,
    };
  });

  const byCause: Record<string, number> = {};
  for (const s of steps) if (s.cause) byCause[s.cause] = (byCause[s.cause] ?? 0) + 1;

  return { run: summarise(run, team?.name ?? "a team that is no longer here"), steps, byCause, planKnown };
}

/**
 * Why one step was skipped: the graph decides, the message only fills in which
 * KIND of condition failure it was.
 */
export function causeOfSkip(
  node: { nodeId: string; error?: string | null },
  incoming: ReadonlyMap<string, string[]>,
  statusById: ReadonlyMap<string, string>,
  /** The run's own final state, which separates a dead gate from a silent producer. */
  state?: unknown,
): SkipCause {
  const sources = incoming.get(node.nodeId);
  if (sources && sources.length > 0) {
    const everySourceSkipped = sources.every((id) => statusById.get(id) === "skipped");
    if (everySourceSkipped) return "predecessor_skipped";
  }

  return refineMissingField(causeFromMessage(node.error), node.error, state);
}

/**
 * Steps of a team that have not run in ANY of its recent runs.
 *
 * The fleet view the run pages never had: a branch nobody takes shows up as one
 * skipped step per run, which reads as routing. Twenty-two steps across six
 * teams were in this state on 2026-09-28 and none had ever been surfaced.
 */
export async function stepsNeverRun(orgId: string | undefined, teamAgentId: string, limit = 10): Promise<{
  team: { id: string; name: string };
  runsExamined: number;
  steps: Array<{ nodeId: string; label: string; seen: number }>;
}> {
  const team = await storage.getAgent(teamAgentId, orgId).catch(() => undefined);
  if (!team) throw new RunActionError("No team with that id in this organization.");
  const runs = (await storage.listDagExecutionRunsByTeamAgent(teamAgentId, limit).catch(() => [])) as any[];

  const seen = new Map<string, { appearances: number; skips: number }>();
  for (const run of runs) {
    for (const n of nodesOf(run)) {
      const row = seen.get(n.nodeId) ?? { appearances: 0, skips: 0 };
      row.appearances++;
      if (n.status === "skipped") row.skips++;
      seen.set(n.nodeId, row);
    }
  }

  const blueprintId = (team as any).blueprintId;
  const bpNodes = blueprintId ? ((await storage.getTeamBlueprintNodes(blueprintId).catch(() => [])) as any[]) : [];
  const labelOf = new Map(bpNodes.map((n) => [n.id, String(n.label ?? n.id)]));

  const never = Array.from(seen.entries())
    // Three appearances before "never" means anything — the same floor the
    // condition check uses, for the same reason.
    .filter(([, v]) => v.appearances >= 3 && v.skips === v.appearances)
    .map(([nodeId, v]) => ({ nodeId, label: labelOf.get(nodeId) ?? nodeId.slice(0, 8), seen: v.appearances }));

  return { team: { id: team.id, name: team.name }, runsExamined: runs.length, steps: never };
}

/**
 * The runs a person should look at, with the reason each one is here.
 *
 * Deliberately not "every run with a skip": 61 of 85 runs skip something and
 * most of those skips are branches working as drawn, so a list of all of them is
 * a list nobody reads. A run is here because it failed, because it has been
 * running with no heartbeat for an hour, because it is waiting on somebody, or
 * because a skip has a cause that is a defect.
 *
 * The causes come from each team's GRAPH, loaded once per team rather than once
 * per run. That matters more here than anywhere: the cheap message-based reading
 * returns "cause not recorded" for every run made before 2026-09-29, which is
 * most of the fleet, and a list that silently drops those is worse than no list.
 */
export async function runsNeedingAttention(orgId: string | undefined, limit = 40): Promise<{
  runs: Array<RunSummary & { reasons: string[]; problemSteps: Array<{ label: string; cause: SkipCause; detail: string | null }> }>;
  examined: number;
  causesFrom: "graph" | "recorded messages" | "both";
}> {
  const runs = await recentRuns(orgId, limit);
  const names = new Map<string, string>();
  const graphs = new Map<string, TeamGraph>();
  for (const id of Array.from(new Set(runs.map((r) => r.teamAgentId).filter(Boolean))) as string[]) {
    const agent = await storage.getAgent(id, orgId).catch(() => undefined);
    if (agent?.name) names.set(id, agent.name);
    graphs.set(id, await teamGraph((agent as any)?.blueprintId));
  }

  const out: Array<RunSummary & { reasons: string[]; problemSteps: Array<{ label: string; cause: SkipCause; detail: string | null }> }> = [];
  let fromGraph = 0;
  let fromMessage = 0;
  for (const run of runs) {
    const summary = summarise(run, names.get(run.teamAgentId) ?? "a team that is no longer here");
    const graph = graphs.get(run.teamAgentId) ?? emptyGraph();
    if (graph.planKnown) fromGraph++;
    else fromMessage++;
    const nodes = nodesOf(run);
    const statusById = new Map<string, string>(nodes.map((n) => [n.nodeId, String(n.status ?? "")]));
    const problemSteps = nodes
      .filter((n) => n.status === "skipped")
      .map((n) => ({ node: n, cause: causeOfSkip(n, graph.incoming, statusById, (run as any).finalState) }))
      .filter(({ cause }) => isProblemCause(cause))
      .map(({ node, cause }) => ({
        label: graph.labels.get(node.nodeId)?.label ?? node.nodeId.slice(0, 8),
        cause,
        detail: node.error ?? null,
      }));

    const reasons: string[] = [];
    if (summary.status === "failed") reasons.push("It failed");
    if (summary.stuck) reasons.push(`It has been running with no sign of life for ${Math.round((summary.durationMs ?? 0) / 3_600_000)}h or more`);
    if (summary.waitingOnApproval) reasons.push("It is waiting for somebody to decide");
    if (problemSteps.length > 0) {
      reasons.push(
        `${problemSteps.length} ${problemSteps.length === 1 ? "step was" : "steps were"} skipped by a condition that can never be satisfied`,
      );
    }
    if (reasons.length > 0) out.push({ ...summary, reasons, problemSteps });
  }

  return {
    runs: out,
    examined: runs.length,
    causesFrom: fromGraph > 0 && fromMessage > 0 ? "both" : fromGraph > 0 ? "graph" : "recorded messages",
  };
}

/**
 * Two runs of the same team, step by step.
 *
 * The question this answers is "it worked last week" — which is always about a
 * step that ran then and not now, so the comparison is per step rather than per
 * total. Steps skipped on either side carry their cause, so a difference reads
 * as either a different route through the same graph or a step that stopped
 * being reachable.
 */
export async function compareRuns(orgId: string | undefined, runId: string, againstRunId?: string): Promise<{
  team: { id: string | null; name: string };
  runs: { a: RunSummary; b: RunSummary };
  /** How b was chosen, when the caller did not name it. */
  againstChosen: "you named it" | "the team's previous run";
  differences: Array<{
    label: string;
    nodeId: string;
    a: { status: string; cause: SkipCause | null };
    b: { status: string; cause: SkipCause | null };
  }>;
  sameSteps: number;
  stepsOnlyIn: { a: string[]; b: string[] };
}> {
  const a = await storage.getDagExecutionRun(runId).catch(() => undefined);
  if (!a) throw new RunActionError(`No run with id "${runId}".`);
  const team = a.teamAgentId ? await storage.getAgent(a.teamAgentId, orgId).catch(() => undefined) : undefined;
  if (a.teamAgentId && !team) throw new RunActionError("That run belongs to another organization.");

  let b: any;
  let againstChosen: "you named it" | "the team's previous run" = "you named it";
  if (againstRunId) {
    b = await storage.getDagExecutionRun(againstRunId).catch(() => undefined);
    if (!b) throw new RunActionError(`No run with id "${againstRunId}".`);
    if (b.teamAgentId !== a.teamAgentId) {
      throw new RunActionError("Those two runs are of different teams, so their steps cannot be lined up. Compare runs of one team.");
    }
  } else {
    if (!a.teamAgentId) throw new RunActionError("That run has no team recorded, so there is no previous run to compare it with.");
    const recent = (await storage.listDagExecutionRunsByTeamAgent(a.teamAgentId, 10).catch(() => [])) as any[];
    const startedA = new Date(a.startedAt ?? 0).getTime();
    b = recent
      .filter((r) => r.id !== a.id && new Date(r.startedAt ?? 0).getTime() < startedA)
      .sort((x, y) => new Date(y.startedAt ?? 0).getTime() - new Date(x.startedAt ?? 0).getTime())[0];
    if (!b) throw new RunActionError("This is the team's only run so far, so there is nothing to compare it with.");
    againstChosen = "the team's previous run";
  }

  const graph = await teamGraph((team as any)?.blueprintId);
  const nodesA = nodesOf(a);
  const nodesB = nodesOf(b);
  const statusA = new Map<string, string>(nodesA.map((n) => [n.nodeId, String(n.status ?? "")]));
  const statusB = new Map<string, string>(nodesB.map((n) => [n.nodeId, String(n.status ?? "")]));
  const byId = (nodes: any[]) => new Map<string, any>(nodes.map((n) => [n.nodeId, n]));
  const nodeA = byId(nodesA);
  const nodeB = byId(nodesB);

  const label = (id: string) => graph.labels.get(id)?.label ?? id.slice(0, 8);
  const cause = (node: any, statuses: Map<string, string>, runState: unknown) =>
    node && node.status === "skipped" ? causeOfSkip(node, graph.incoming, statuses, runState) : null;

  const shared = Array.from(nodeA.keys()).filter((id) => nodeB.has(id));
  const differences = shared
    .filter((id) => statusA.get(id) !== statusB.get(id))
    .map((id) => ({
      label: label(id),
      nodeId: id,
      a: { status: statusA.get(id) ?? "", cause: cause(nodeA.get(id), statusA, a.finalState) },
      b: { status: statusB.get(id) ?? "", cause: cause(nodeB.get(id), statusB, b.finalState) },
    }));

  return {
    team: { id: a.teamAgentId ?? null, name: team?.name ?? "a team that is no longer here" },
    runs: {
      a: summarise(a, team?.name ?? "a team that is no longer here"),
      b: summarise(b, team?.name ?? "a team that is no longer here"),
    },
    againstChosen,
    differences,
    sameSteps: shared.length - differences.length,
    stepsOnlyIn: {
      a: Array.from(nodeA.keys()).filter((id) => !nodeB.has(id)).map(label),
      b: Array.from(nodeB.keys()).filter((id) => !nodeA.has(id)).map(label),
    },
  };
}
