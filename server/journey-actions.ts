/**
 * Taking a journey out of the library, or deleting it.
 *
 * A journey isn't a record of its own: it is a team whose orchestrator agent
 * carries `isCuratedJourney`. So deleting one is deleting a team, and that
 * lives in server/team-removal.ts — the Agents page and the library give the
 * same answer, including the rule that a worker another team uses stays.
 *
 * What is particular to a journey is unlisting: it leaves the library and the
 * team keeps running. That has no equivalent elsewhere, so it stays here.
 */
import { storage } from "./storage";
import { TeamRemovalError, deleteTeam, planTeamRemoval, requireTeam, type TeamActor, type TeamRemovalPlan } from "./team-removal";

export type JourneyActor = TeamActor;
export { TeamRemovalError as JourneyActionError };
export type { TeamRemovalPlan as RemovalPlan };

/** The journey's team, refusing a team that isn't in the library. */
async function requireJourney(teamAgentId: string, orgId: string | undefined) {
  const agent = await requireTeam(teamAgentId, orgId, "journey");
  if (!agent.isCuratedJourney) throw new TeamRemovalError(`"${agent.name}" isn't in the Journey Library.`, 400);
  return agent;
}

/** What removing this journey would take, and what it would leave. */
export async function planJourneyRemoval(orgId: string | undefined, teamAgentId: string): Promise<TeamRemovalPlan> {
  await requireJourney(teamAgentId, orgId);
  return planTeamRemoval(orgId, teamAgentId);
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
  await requireJourney(teamAgentId, actor.orgId);
  return deleteTeam(actor, teamAgentId);
}
