/**
 * Taking a journey out of the library, or deleting it.
 *
 * A journey isn't a record of its own: it is a team whose orchestrator agent
 * carries `isCuratedJourney`. So "delete this journey" has to say which agents
 * it means, and a worker that another team also uses is not this journey's to
 * delete -- it stays, and the caller is told it stayed.
 *
 * Two different things a person might want, kept separate because they are:
 *   - unlist: it leaves the Journey Library; the team still exists and still
 *     runs. Reversible.
 *   - delete: the orchestrator and the workers only this journey uses are
 *     gone. Its runs stay in the run history, because they happened, and its
 *     process flow stays because a flow can outlive the team that ran it.
 */
import { storage } from "./storage";
import type { Agent } from "@shared/schema";

export interface JourneyActor {
  orgId: string | undefined;
  actorId: string | null;
  actorLabel: string;
  via: string;
}

export class JourneyActionError extends Error {
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

export interface RemovalPlan {
  journeyId: string;
  journeyName: string;
  /** Workers this journey uses, and whether each would go. */
  workers: WorkerPlan[];
  deletes: string[];
  keeps: string[];
  runCount: number;
  processFlowName: string | null;
}

async function requireJourney(teamAgentId: string, orgId: string | undefined): Promise<Agent> {
  const agent = await storage.getAgent(teamAgentId, orgId);
  if (!agent) throw new JourneyActionError("No journey with that id in this organization.", 404);
  if (!agent.isCuratedJourney) throw new JourneyActionError(`"${agent.name}" isn't in the Journey Library.`, 400);
  return agent;
}

/** What removing this journey would take, and what it would leave. */
export async function planJourneyRemoval(orgId: string | undefined, teamAgentId: string): Promise<RemovalPlan> {
  const orchestrator = await requireJourney(teamAgentId, orgId);
  const members = await storage.getAgentTeamMembers(orchestrator.id);

  const workers: WorkerPlan[] = [];
  for (const member of members) {
    const worker = await storage.getAgent(member.memberAgentId, orgId);
    if (!worker) continue;
    // A worker can serve more than one team; the other teams' names are what
    // makes "it stays" understandable rather than arbitrary.
    const memberships = await storage.getAgentTeamsByMember(worker.id);
    const otherTeamIds = memberships.map((m) => m.teamAgentId).filter((id) => id !== orchestrator.id);
    const otherTeams = (await Promise.all(otherTeamIds.map((id) => storage.getAgent(id, orgId)))).filter((a): a is Agent => !!a);
    workers.push({ id: worker.id, name: worker.name, alsoUsedBy: otherTeams.map((t) => t.name) });
  }

  const runs = await storage.summarizeDagExecutionRunsByTeamAgent(orchestrator.id);
  const flows = await storage.getProcessFlows(orgId);
  const flow = flows.find((f) => (f as any).teamAgentId === orchestrator.id);

  return {
    journeyId: orchestrator.id,
    journeyName: orchestrator.name,
    workers,
    deletes: [orchestrator.name, ...workers.filter((w) => w.alsoUsedBy.length === 0).map((w) => w.name)],
    keeps: workers.filter((w) => w.alsoUsedBy.length > 0).map((w) => `${w.name} (also used by ${w.alsoUsedBy.join(", ")})`),
    runCount: runs.total ?? 0,
    processFlowName: flow ? (flow as any).name ?? null : null,
  };
}

/** Take it out of the library. The team is untouched and still runs. */
export async function unlistJourney(actor: JourneyActor, teamAgentId: string): Promise<{ name: string }> {
  const orchestrator = await requireJourney(teamAgentId, actor.orgId);
  await storage.updateAgent(orchestrator.id, { isCuratedJourney: false }, actor.orgId);
  await storage.createAuditEvent({
    organizationId: actor.orgId,
    actorType: "user",
    actorId: actor.actorId ?? actor.actorLabel,
    objectType: "agent",
    objectId: orchestrator.id,
    action: "journey_unlisted",
    details: JSON.stringify({ journey: orchestrator.name, effect: "Removed from the Journey Library; the team still exists.", via: actor.via }),
  });
  return { name: orchestrator.name };
}

/** Delete the journey's team: its orchestrator, and the workers only it uses. */
export async function deleteJourney(actor: JourneyActor, teamAgentId: string): Promise<{ deleted: string[]; kept: string[]; runCount: number }> {
  const plan = await planJourneyRemoval(actor.orgId, teamAgentId);
  const deleted: string[] = [];

  for (const worker of plan.workers) {
    if (worker.alsoUsedBy.length > 0) continue;
    await storage.deleteAgent(worker.id, actor.orgId);
    deleted.push(worker.name);
  }
  // The membership rows go with the orchestrator, including those of workers
  // that stayed: they are this team's rows, not the other teams'.
  for (const member of await storage.getAgentTeamMembers(plan.journeyId)) {
    await storage.deleteAgentTeamMember(member.id);
  }
  await storage.deleteAgent(plan.journeyId, actor.orgId);
  deleted.unshift(plan.journeyName);

  await storage.createAuditEvent({
    organizationId: actor.orgId,
    actorType: "user",
    actorId: actor.actorId ?? actor.actorLabel,
    objectType: "agent",
    objectId: plan.journeyId,
    action: "journey_deleted",
    details: JSON.stringify({
      journey: plan.journeyName,
      deleted,
      kept: plan.keeps,
      runsKept: plan.runCount,
      processFlowKept: plan.processFlowName,
      via: actor.via,
    }),
  });

  return { deleted, kept: plan.keeps, runCount: plan.runCount };
}
