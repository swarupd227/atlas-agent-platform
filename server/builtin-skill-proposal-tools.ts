/**
 * The propose_skill tool: how an agent PROPOSES a new skill, or a revision of
 * one it uses.
 *
 * Offered only when the platform flag is on and the agent has opted in (see
 * isSkillProposalEnabled). It files a request that a person must approve, so it
 * changes nothing any run reads until someone has decided -- which is why, like
 * the memory tool, it is exempt from the allow-lists that predate it (an agent
 * with a tool allow-list would otherwise silently lose it) but NOT from shadow
 * runs: a shadow run must not file requests. An explicit policy or AAR block
 * naming the tool still refuses it.
 *
 * Dispatched in-process by executeTool, after every gate in dispatchToolCall.
 */

import type { AvailableTool } from "./tool-dispatcher";
import { BUILTIN_SKILL_PROPOSAL_SERVER_ID, PROPOSE_SKILL_TOOL, SKILL_PROPOSAL_LIMITS, proposeSkill } from "./agent-skill-proposals";

export { BUILTIN_SKILL_PROPOSAL_SERVER_ID, PROPOSE_SKILL_TOOL };

const SERVER_NAME = "Skill proposals";

export function skillProposalToolsFor(): AvailableTool[] {
  return [
    {
      serverId: BUILTIN_SKILL_PROPOSAL_SERVER_ID,
      serverName: SERVER_NAME,
      serverUrl: "",
      toolName: PROPOSE_SKILL_TOOL,
      toolDescription:
        "Propose a new skill, or a better version of a skill you use, when you have worked out a procedure that a later run should follow. " +
        "A person must approve it before it exists for any run, so never rely on a proposal in the run that makes it. " +
        `A skill is a procedure in plain steps (at most ${SKILL_PROPOSAL_LIMITS.maxInstructionChars} characters): when to use it, what to check, what to do, what to hand back. ` +
        "It cannot grant tools or access. Do not include secrets, personal data, or details of a single task. " +
        "To revise a skill, give its id and the complete new instructions (not a diff).",
      toolInputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "revise"], description: "create a new skill, or revise one you use." },
          name: { type: "string", description: `The new skill's name (create only), ${SKILL_PROPOSAL_LIMITS.minNameChars}-${SKILL_PROPOSAL_LIMITS.maxNameChars} characters.` },
          skill_id: { type: "string", description: "The id of the skill to revise (revise only)." },
          description: { type: "string", description: `One sentence on when to use the skill (required for create), at most ${SKILL_PROPOSAL_LIMITS.maxDescriptionChars} characters.` },
          instructions: { type: "string", description: "The full procedure, as numbered steps." },
          reason: { type: "string", description: "Why this helps, in a sentence. The reviewer reads it." },
        },
        required: ["action", "instructions"],
      },
    },
  ];
}

export function isBuiltinSkillProposalTool(tool: Pick<AvailableTool, "serverId">): boolean {
  return tool.serverId === BUILTIN_SKILL_PROPOSAL_SERVER_ID;
}

/** Returns a result rather than throwing: the model reads it and can fix its request. */
export async function executeBuiltinSkillProposalTool(
  toolName: string,
  args: Record<string, any>,
  ctx: { orgId?: string | null; agentId?: string; runId?: string | null },
): Promise<any> {
  if (toolName !== PROPOSE_SKILL_TOOL) throw new Error(`Unknown skill proposal tool "${toolName}"`);
  if (!ctx.agentId) return { ok: false, error: "No agent context to propose a skill for." };
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return proposeSkill({
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    action: String(args?.action ?? "") as any,
    name: str(args?.name),
    skillId: str(args?.skill_id),
    description: str(args?.description),
    instructions: str(args?.instructions),
    reason: str(args?.reason),
    runId: ctx.runId ?? null,
  });
}
