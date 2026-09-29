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
import { causeFromMessage, isProblemCause, isStuck, type SkipCause } from "@shared/run-words";

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
    // Cheap pass for the list: the message is enough to spot the two defect
    // causes. The detail view works them out from the graph instead.
    problemSkips: skipped.filter((n) => isProblemCause(causeFromMessage(n.error))).length,
    waitingOnApproval: !!run.pendingApprovalId,
  };
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
  const runs = (await storage.listDagExecutionRunsByOrg(orgId, limit).catch(() => [])) as any[];
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

  // The graph, when the team still has one. Without it the causes fall back to
  // the recorded message rather than being guessed.
  let labels = new Map<string, { label: string; stateKey: string | null }>();
  let incoming = new Map<string, string[]>();
  let planKnown = false;
  const blueprintId = (team as any)?.blueprintId;
  if (blueprintId) {
    const [bpNodes, bpEdges] = await Promise.all([
      storage.getTeamBlueprintNodes(blueprintId).catch(() => []),
      storage.getTeamBlueprintEdges(blueprintId).catch(() => []),
    ]);
    labels = new Map((bpNodes as any[]).map((n) => [n.id, { label: String(n.label ?? n.id), stateKey: n.stateKey ?? null }]));
    try {
      const plan: any = computeWaves(bpNodes as any, bpEdges as any);
      for (const [nodeId, edges] of Object.entries(plan.incomingEdges ?? {})) {
        incoming.set(nodeId, (edges as any[]).map((e) => e.sourceNodeId));
      }
      planKnown = true;
    } catch {
      // A graph that cannot be planned (a cycle) still has labels worth showing.
    }
  }

  const steps: RunNodeOutcome[] = nodes.map((n) => {
    const known = labels.get(n.nodeId);
    const status = String(n.status ?? "");
    return {
      nodeId: n.nodeId,
      label: known?.label ?? n.nodeId.slice(0, 8),
      stateKey: known?.stateKey ?? null,
      status,
      cause: status === "skipped" ? causeOfSkip(n, incoming, statusById) : null,
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
): SkipCause {
  const sources = incoming.get(node.nodeId);
  if (sources && sources.length > 0) {
    const everySourceSkipped = sources.every((id) => statusById.get(id) === "skipped");
    if (everySourceSkipped) return "predecessor_skipped";
  }
  return causeFromMessage(node.error);
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
