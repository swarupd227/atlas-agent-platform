/**
 * Astra services for reading and changing an agent's instructions.
 *
 * The change itself is server/agent-instructions.ts, which also knows the two
 * things that make the confirm card honest: which deployments the edit reaches
 * (there is no per-deployment freeze -- the runtime reads the agent row every
 * run), and whether the agent was drafted from a process-flow step, because
 * syncing that flow later replaces the agent and takes this edit with it.
 */
import {
  AgentInstructionError,
  deploymentsReached,
  flowStepBehind,
  readAgentInstructions,
  updateAgentInstructions,
  type InstructionTarget,
} from "../agent-instructions";
import { storage } from "../storage";

/** Everything the card needs: the text now, what it drives, and what a change reaches. */
async function agentInstructionContext(orgId: string, agentId: string) {
  const instructions = await readAgentInstructions(orgId, agentId);
  const [deployments, fromFlow, suites] = await Promise.all([
    deploymentsReached(orgId, agentId),
    flowStepBehind(orgId, agentId),
    storage.getEvalsByAgent(agentId).catch(() => []),
  ]);
  return {
    ...instructions,
    deployments,
    fromFlow,
    // Golden cases were written against the instructions as they were; after an
    // edit they are the check that it still does what it promised.
    evalSuites: (suites as any[]).length,
  };
}

async function updateAgentInstructionsAs(
  orgId: string,
  userId: string | null,
  actorLabel: string,
  input: { agentId: string; target: InstructionTarget; text: string },
) {
  return updateAgentInstructions(orgId, { ...input, actorLabel, actorId: userId });
}

export { AgentInstructionError };

export const agentInstructionServices = {
  agentInstructionContext,
  updateAgentInstructionsAs,
};
