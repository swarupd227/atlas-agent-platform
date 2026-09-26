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

export interface TeamRemovalPlan {
  teamId: string;
  teamName: string;
  workers: WorkerPlan[];
  /** Names of the agents that would be deleted, orchestrator first. */
  deletes: string[];
  /** Workers that stay, each with the team that keeps it. */
  keeps: string[];
  runCount: number;
  processFlowName: string | null;
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

  return {
    teamId: orchestrator.id,
    teamName: orchestrator.name,
    workers,
    deletes: [orchestrator.name, ...workers.filter((w) => w.alsoUsedBy.length === 0).map((w) => w.name)],
    keeps: workers.filter((w) => w.alsoUsedBy.length > 0).map((w) => `${w.name} (also used by ${w.alsoUsedBy.join(", ")})`),
    runCount: runs.total ?? 0,
    processFlowName: flow ? (flow as any).name ?? null : null,
    inLibrary: !!orchestrator.isCuratedJourney,
  };
}

/**
 * Delete the team. Its runs stay in the run history because they happened, and
 * its process flow stays because a flow can outlive the team that ran it.
 */
export async function deleteTeam(actor: TeamActor, teamAgentId: string): Promise<{ deleted: string[]; kept: string[]; runCount: number }> {
  const plan = await planTeamRemoval(actor.orgId, teamAgentId);
  const deleted: string[] = [];

  for (const worker of plan.workers) {
    if (worker.alsoUsedBy.length > 0) continue;
    await storage.deleteAgent(worker.id, actor.orgId);
    deleted.push(worker.name);
  }
  // deleteAgent clears this team's membership rows in both directions, so a
  // worker that stayed keeps only its other teams' rows.
  await storage.deleteAgent(plan.teamId, actor.orgId);
  deleted.unshift(plan.teamName);

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
      processFlowKept: plan.processFlowName,
      fromLibrary: plan.inLibrary,
      via: actor.via,
    }),
  });

  return { deleted, kept: plan.keeps, runCount: plan.runCount };
}
