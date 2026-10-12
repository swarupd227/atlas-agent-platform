/**
 * Names for the skill-proposal tool, in a module with no imports so the tool
 * dispatcher can read them without loading the database layer
 * (server/agent-skill-proposals.ts).
 */

/** Platform flag. Off unless "on"; a failed read is off. */
export const SKILL_PROPOSALS_SETTING = "AGENT_SKILL_PROPOSALS";
export const PROPOSE_SKILL_TOOL = "propose_skill";
export const BUILTIN_SKILL_PROPOSAL_SERVER_ID = "builtin:skill-proposals";
