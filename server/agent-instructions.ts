/**
 * Reading and changing what an agent is told to do.
 *
 * The second gap an outside-in look found: after watching an automation run
 * once, the most common thing anyone says is "be stricter about coastal wind" --
 * and there was no way to do it from the conversation. Only the agent page.
 *
 * Two fields drive an agent at run time, and they are different things:
 *
 * - `systemPrompt` is standing behaviour. It reaches the model as the system
 *   message (agent-runtime.ts builds the worker's context from it, and falls
 *   back to it directly).
 * - `runtimeConfig.prompt` is the task. A worker's prompt for a run is
 *   `runtimeConfig.prompt` (or the description, if it is empty) plus the request
 *   the team was given plus the previous stage's output.
 *
 * Both are read from the agent row at the START OF EVERY RUN. Nothing freezes
 * them per deployment, so an edit reaches the next run of a production
 * deployment with no gate in between. That is a fact about the platform, not a
 * detail: whatever shows this change has to say it.
 */
import { storage } from "./storage";
import { recomputeOutcomeKpis } from "./routes/helpers";

export type InstructionTarget = "standing" | "task";

export class AgentInstructionError extends Error {}

export interface AgentInstructions {
  agent: { id: string; name: string; status: string | null; riskTier: string | null; autonomyMode: string | null; agentType: string | null; outcomeId: string | null };
  /** systemPrompt: how it behaves, every run. */
  standing: string;
  /** runtimeConfig.prompt: what it is asked to do each run; the description is the fallback the runtime uses. */
  task: string;
  taskFallsBackToDescription: boolean;
  description: string;
  /** Which field the runtime would actually read for its task text. */
  drivenBy: "task" | "description";
}

export async function readAgentInstructions(orgId: string | undefined, agentId: string): Promise<AgentInstructions> {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) throw new AgentInstructionError("No agent with that id in this organization.");
  const rt = (agent.runtimeConfig as Record<string, any>) || {};
  const task = typeof rt.prompt === "string" ? rt.prompt : "";
  const description = agent.description ?? "";
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status ?? null,
      riskTier: agent.riskTier ?? null,
      autonomyMode: agent.autonomyMode ?? null,
      agentType: agent.agentType ?? null,
      outcomeId: agent.outcomeId ?? null,
    },
    standing: agent.systemPrompt ?? "",
    task,
    taskFallsBackToDescription: !task,
    description,
    drivenBy: task ? "task" : "description",
  };
}

/**
 * The process-flow step this agent was drafted from, when it was built from a
 * flow. It matters here because syncing that flow later supersedes this agent
 * and drafts a fresh one from the step's own words -- so an edit made here is
 * lost unless the step is changed too. Only the build and the sync write this
 * correlation (shared/process-flow-correlation.ts).
 */
export async function flowStepBehind(orgId: string | undefined, agentId: string): Promise<{ teamName: string; stepLabel: string } | null> {
  const memberships = await storage.getAgentTeamsByMember(agentId).catch(() => []);
  for (const m of memberships) {
    const team = await storage.getAgent(m.teamAgentId, orgId).catch(() => undefined);
    const blueprintId = (team as any)?.blueprintId as string | undefined;
    if (!team || !blueprintId) continue;
    const nodes = await storage.getTeamBlueprintNodes(blueprintId).catch(() => []);
    const node = nodes.find((n: any) => n.refAgentId === agentId);
    const label = (node?.config as any)?.sourceLabel;
    if (node && (node.config as any)?.sourceProcessNodeId && label) {
      return { teamName: team.name, stepLabel: String(label) };
    }
  }
  return null;
}

/** Deployments of this agent that a change would reach, newest environment first. */
export async function deploymentsReached(orgId: string | undefined, agentId: string) {
  const FINISHED = new Set(["rolled_back", "promoted", "superseded", "retired", "failed"]);
  const all = await storage.getDeployments(orgId).catch(() => []);
  return all
    .filter((d: any) => d.agentId === agentId && !FINISHED.has(d.status))
    .map((d: any) => ({ id: d.id, environment: d.environment, status: d.status, version: d.version ?? null }));
}

/**
 * Change one of the two instruction fields. Audited the same way the agent route
 * audits a configuration change, and the outcome's KPIs are re-read after it for
 * the same reason that route re-reads them -- only KPIs that declare they are
 * measured from runs move.
 */
export async function updateAgentInstructions(
  orgId: string | undefined,
  input: { agentId: string; target: InstructionTarget; text: string; actorLabel: string; actorId?: string | null },
): Promise<{ agent: { id: string; name: string }; target: InstructionTarget; before: string; after: string }> {
  const agent = await storage.getAgent(input.agentId, orgId);
  if (!agent) throw new AgentInstructionError("No agent with that id in this organization.");
  const text = input.text.trim();
  if (!text) throw new AgentInstructionError("The new instructions are empty.");

  const rt = (agent.runtimeConfig as Record<string, any>) || {};
  const before = input.target === "standing" ? (agent.systemPrompt ?? "") : (typeof rt.prompt === "string" ? rt.prompt : "");
  if (before.trim() === text) throw new AgentInstructionError(`Those are already "${agent.name}"'s instructions, word for word.`);

  const patch = input.target === "standing"
    ? { systemPrompt: text }
    // The rest of runtimeConfig is somebody's configuration -- model options,
    // guardrails, eval suite config. Replacing the object would drop it.
    : { runtimeConfig: { ...rt, prompt: text } };
  const updated = await storage.updateAgent(agent.id, patch as any, orgId);
  if (!updated) throw new AgentInstructionError("That agent could not be updated.");

  const changedField = input.target === "standing" ? "systemPrompt" : "runtimeConfig.prompt";
  await storage.createAuditEvent({
    actorType: "user",
    actorId: input.actorId ?? input.actorLabel,
    action: "agent.config_changed",
    objectType: "agent",
    objectId: agent.id,
    organizationId: orgId,
    details: JSON.stringify({
      summary: `${input.actorLabel} changed "${agent.name}"'s ${input.target === "standing" ? "standing instructions" : "task instructions"}`,
      agentName: agent.name,
      changedFields: [changedField],
      outcomeId: agent.outcomeId || null,
      before,
      after: text,
      via: "Astra Cowork",
    }),
  }).catch(() => {});

  if (agent.outcomeId) await recomputeOutcomeKpis(agent.outcomeId, orgId).catch(() => null);

  return { agent: { id: agent.id, name: agent.name }, target: input.target, before, after: text };
}
