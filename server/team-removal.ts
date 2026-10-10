/**
 * Deleting a team: the orchestrator, and the workers only it uses.
 *
 * A team is an orchestrator agent plus member agents, and `deleteAgent`
 * deletes exactly one agent. So deleting a team through the Agents page left
 * every worker behind — agents with no team to run them, indistinguishable in
 * the registry from ones somebody meant to build.
 *
 * A worker can serve more than one team, and then it isn't this team's to
 * delete: it stays, and the caller is told which team keeps it. That rule came
 * from the Journey Library (journeys are teams wearing a library badge), and
 * lives here so the Agents page and the library give the same answer.
 */
import { storage } from "./storage";
import type { Agent } from "@shared/schema";

export interface TeamActor {
  orgId: string | undefined;
  actorId: string | null;
  actorLabel: string;
  /** Where it was done: "Agents page", "Journey Library". */
  via: string;
}

export class TeamRemovalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface WorkerPlan {
  id: string;
  name: string;
  /** Other teams that also use this worker; when any, it isn't deleted. */
  alsoUsedBy: string[];
}

/** A deployment in one of these states is already over; nothing to retire. */
const FINISHED_DEPLOYMENT = new Set(["rolled_back", "promoted", "superseded", "retired", "failed"]);

export interface LiveDeployment {
  id: string;
  agentId: string;
  agentName: string | null;
  environment: string;
  status: string;
}

/**
 * The deployments of these agents that are still in a live state.
 *
 * Read before anything is deleted, because a deployment row outlives the agent it
 * names: nothing here or in the agent delete route used to touch them, so a
 * removed team left its deployments behind, still listed and still saying
 * "pending" or "deployed" for an agent that no longer exists. Measured on Azure
 * 2026-09-27: 402 such rows, most of them from long-deleted test agents.
 */
export async function liveDeploymentsFor(orgId: string | undefined, agentIds: string[]): Promise<LiveDeployment[]> {
  if (agentIds.length === 0) return [];
  const wanted = new Set(agentIds);
  const all = (await storage.getDeployments(orgId).catch(() => [])) as any[];
  return all
    .filter((d) => d.agentId && wanted.has(d.agentId) && !FINISHED_DEPLOYMENT.has(String(d.status)))
    .map((d) => ({ id: d.id, agentId: d.agentId, agentName: d.agentName ?? null, environment: String(d.environment ?? "staging"), status: String(d.status) }));
}

/**
 * Retire them, rather than delete them: what was deployed and when is history
 * worth keeping, and the row still carries the agent's name. Retiring takes it
 * out of everything that reads live deployments; deleting it would erase the
 * record that the agent ever ran anywhere.
 */
export async function retireDeploymentsFor(orgId: string | undefined, agentIds: string[]): Promise<LiveDeployment[]> {
  const live = await liveDeploymentsFor(orgId, agentIds);
  for (const d of live) {
    await storage.updateDeployment(d.id, { status: "retired" } as any).catch(() => {});
  }
  return live;
}

export interface StrandedEvalSuite {
  id: string;
  agentId: string;
  name: string;
  totalCases: number;
  /** Null when the suite was never run — nothing was ever measured with it. */
  lastRunAt: string | null;
  /** Null means nothing can attribute it to a tenant once the agent is gone. */
  organizationId: string | null;
}

/**
 * The eval suites of these agents, read while the agents still exist.
 *
 * A suite names its agent and, in practice, nothing else: measured on Azure
 * 2026-10-09, 0 of 832 stranded suites carried a golden dataset or a skill. So
 * when the agent row goes, the suite cannot be re-attributed to an owner, cannot
 * be re-run, and cannot be removed — there is no delete route or storage method
 * for an eval suite, the same gap deployments had before `ec51f5d`. 832 such
 * rows on Azure, one per deleted agent, mostly auto-generated suites from test
 * agents (`[E2E] Direct Wizard Agent … - Auto-Generated Suite`).
 *
 * This is residue, not a tenant leak: every agent carries an organization and
 * `createEvalSuite` derives the suite's from it, so a suite created today is
 * attributed before anyone can delete anything. The 832 predate that.
 */
export async function evalSuitesFor(agentIds: string[]): Promise<StrandedEvalSuite[]> {
  if (agentIds.length === 0) return [];
  const out: StrandedEvalSuite[] = [];
  for (const agentId of agentIds) {
    // Called inside the try, not `.catch()`-ed: a storage without the method
    // throws on `undefined(...)` before there is a promise to catch on, which
    // would turn "could not list suites" into a failed delete.
    let suites: any[] = [];
    try {
      suites = (await (storage as { getEvalsByAgent?: (id: string) => Promise<unknown[]> }).getEvalsByAgent?.(agentId)) as any[] ?? [];
    } catch { suites = []; }
    for (const s of suites) {
      out.push({
        id: String(s.id),
        agentId,
        name: String(s.name ?? ""),
        totalCases: Number(s.totalCases ?? 0),
        lastRunAt: s.lastRunAt ? new Date(s.lastRunAt).toISOString() : null,
        organizationId: s.organizationId ?? null,
      });
    }
  }
  return out;
}

export interface DeletedEvalSuite extends StrandedEvalSuite {
  testCases: number;
  runs: number;
  caseResults: number;
}

/**
 * Delete these agents' eval suites, with their test cases, runs and results.
 *
 * Called while the agents still exist, for the same reason the deployments are
 * retired there: a suite names only its agent, so afterwards nothing can reach
 * it. Retiring was the other option and was rejected — it needs a column every
 * reader has to honour, and a retired suite nobody filters out is a row that
 * looks handled and is not.
 *
 * Each suite is deleted through the agent that owns it, which the caller has
 * already resolved inside its own organization. Nothing here takes a suite id
 * from a request.
 */
export async function deleteEvalSuitesFor(orgId: string | undefined, agentIds: string[]): Promise<DeletedEvalSuite[]> {
  const suites = await evalSuitesFor(agentIds);
  const deleted: DeletedEvalSuite[] = [];
  for (const s of suites) {
    try {
      const counts = await (storage as { deleteEvalSuite?: (id: string, orgId?: string) => Promise<{ testCases: number; runs: number; caseResults: number } | undefined> })
        .deleteEvalSuite?.(s.id, orgId);
      // A suite the delete could not claim is reported undeleted rather than
      // reported gone: the audit event has to say what actually happened.
      if (counts) deleted.push({ ...s, testCases: counts.testCases, runs: counts.runs, caseResults: counts.caseResults });
    } catch { /* leaving a suite behind must never fail the agent delete */ }
  }
  return deleted;
}

export interface TeamRemovalPlan {
  teamId: string;
  teamName: string;
  workers: WorkerPlan[];
  /** Deployments that would be retired with these agents, by agent. */
  liveDeployments: LiveDeployment[];
  /** Eval suites that would be left behind, unreachable, by these agents. */
  strandedEvalSuites: StrandedEvalSuite[];
  /** Names of the agents that would be deleted, orchestrator first. */
  deletes: string[];
  /** Workers that stay, each with the team that keeps it. */
  keeps: string[];
  runCount: number;
  processFlowName: string | null;
  /** Set when a flow points at this team: the flow stays, the link is cleared. */
  processFlowId: string | null;
  /** Whether this team is also listed in the Journey Library. */
  inLibrary: boolean;
}

/** `noun` is what the caller's surface calls it: "No journey with that id…" in the library. */
export async function requireTeam(teamAgentId: string, orgId: string | undefined, noun = "agent"): Promise<Agent> {
  const agent = await storage.getAgent(teamAgentId, orgId);
  if (!agent) throw new TeamRemovalError(`No ${noun} with that id in this organization.`, 404);
  return agent;
}

/** What deleting this team would take, and what it would leave. */
export async function planTeamRemoval(orgId: string | undefined, teamAgentId: string): Promise<TeamRemovalPlan> {
  const orchestrator = await requireTeam(teamAgentId, orgId);
  const members = await storage.getAgentTeamMembers(orchestrator.id);

  const workers: WorkerPlan[] = [];
  for (const member of members) {
    const worker = await storage.getAgent(member.memberAgentId, orgId);
    if (!worker) continue;
    const memberships = await storage.getAgentTeamsByMember(worker.id);
    const otherTeamIds = memberships.map((m) => m.teamAgentId).filter((id) => id !== orchestrator.id);
    const otherTeams = (await Promise.all(otherTeamIds.map((id) => storage.getAgent(id, orgId)))).filter((a): a is Agent => !!a);
    workers.push({ id: worker.id, name: worker.name, alsoUsedBy: otherTeams.map((t) => t.name) });
  }

  const runs = await storage.summarizeDagExecutionRunsByTeamAgent(orchestrator.id);
  const flows = await storage.getProcessFlows(orgId);
  const flow = flows.find((f) => (f as any).teamAgentId === orchestrator.id);

  // Only the agents actually going: a worker another team keeps is still running
  // for that team, so its deployment is not this team's to retire.
  const goingIds = [orchestrator.id, ...workers.filter((w) => w.alsoUsedBy.length === 0).map((w) => w.id)];

  return {
    teamId: orchestrator.id,
    teamName: orchestrator.name,
    workers,
    liveDeployments: await liveDeploymentsFor(orgId, goingIds),
    strandedEvalSuites: await evalSuitesFor(goingIds),
    deletes: [orchestrator.name, ...workers.filter((w) => w.alsoUsedBy.length === 0).map((w) => w.name)],
    keeps: workers.filter((w) => w.alsoUsedBy.length > 0).map((w) => `${w.name} (also used by ${w.alsoUsedBy.join(", ")})`),
    runCount: runs.total ?? 0,
    processFlowName: flow ? (flow as any).name ?? null : null,
    processFlowId: flow ? (flow as any).id ?? null : null,
    inLibrary: !!orchestrator.isCuratedJourney,
  };
}

/**
 * Delete the team. Its runs stay in the run history because they happened, and
 * its process flow stays because a flow can outlive the team that ran it -- but
 * the flow's link to this team is cleared, or the Studio would keep offering to
 * sync a flow to an agent that no longer exists. Cowork can now create that
 * link from a conversation (automate_process_flow), so the dangling id would
 * have gone from rare to ordinary.
 */
export async function deleteTeam(actor: TeamActor, teamAgentId: string): Promise<{ deleted: string[]; kept: string[]; runCount: number; deploymentsRetired: LiveDeployment[]; evalSuitesDeleted: DeletedEvalSuite[] }> {
  const plan = await planTeamRemoval(actor.orgId, teamAgentId);
  const deleted: string[] = [];

  // Before the agents go, so the rows can still be matched to them. A deployment
  // whose agent is deleted is unreachable and untouchable -- there is no delete
  // route for one -- so it has to be closed here or not at all.
  const goingIds = [plan.teamId, ...plan.workers.filter((w) => w.alsoUsedBy.length === 0).map((w) => w.id)];
  const deploymentsRetired = await retireDeploymentsFor(actor.orgId, goingIds);
  // Only the agents actually going: a worker another team keeps still has an
  // agent to own its suite, so that suite is not stranded and not ours to take.
  const evalSuitesDeleted = await deleteEvalSuitesFor(actor.orgId, goingIds);

  for (const worker of plan.workers) {
    if (worker.alsoUsedBy.length > 0) continue;
    await storage.deleteAgent(worker.id, actor.orgId);
    deleted.push(worker.name);
  }
  // deleteAgent clears this team's membership rows in both directions, so a
  // worker that stayed keeps only its other teams' rows.
  await storage.deleteAgent(plan.teamId, actor.orgId);
  deleted.unshift(plan.teamName);

  if (plan.processFlowId) {
    await storage.updateProcessFlow(plan.processFlowId, { teamAgentId: null } as any, actor.orgId).catch(() => {});
  }

  await storage.createAuditEvent({
    organizationId: actor.orgId,
    actorType: "user",
    actorId: actor.actorId ?? actor.actorLabel,
    objectType: "agent",
    objectId: plan.teamId,
    action: "team_deleted",
    details: JSON.stringify({
      team: plan.teamName,
      deleted,
      kept: plan.keeps,
      runsKept: plan.runCount,
      deploymentsRetired: deploymentsRetired.map((d) => `${d.agentName ?? d.agentId} ${d.environment} (was ${d.status})`),
      // What the suites took with them, recorded because nothing else can:
      // after this there is no row left to ask.
      evalSuitesDeleted: evalSuitesDeleted.map((s) => `${s.name} (${s.testCases} cases, ${s.runs} runs, ${s.caseResults} results)`),
      // A suite the delete could not claim. Should be empty; if it is not, the
      // suite is still there and nothing can reach it.
      evalSuitesLeft: plan.strandedEvalSuites.filter((s) => !evalSuitesDeleted.some((d) => d.id === s.id)).map((s) => s.name),
      processFlowKept: plan.processFlowName,
      processFlowUnlinked: !!plan.processFlowId,
      fromLibrary: plan.inLibrary,
      via: actor.via,
    }),
  });

  return { deleted, kept: plan.keeps, runCount: plan.runCount, deploymentsRetired, evalSuitesDeleted };
}
