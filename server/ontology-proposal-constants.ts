/**
 * Names for the ontology-proposal tool, in a module with no imports so the tool
 * dispatcher can read them without loading the database layer
 * (server/agent-ontology-proposals.ts).
 */

/** Platform flag. Off unless "on"; a failed read is off. */
export const ONTOLOGY_PROPOSALS_SETTING = "AGENT_ONTOLOGY_PROPOSALS";
export const PROPOSE_ONTOLOGY_TOOL = "propose_ontology_concept";
export const BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID = "builtin:ontology-proposals";
