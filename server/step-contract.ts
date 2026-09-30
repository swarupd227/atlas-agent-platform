/**
 * What a step promises to produce, from whichever source actually knows.
 *
 * A branch condition can only be judged against the producing step's output, and
 * measured on the fleet 2026-09-28 no node declared one — so every verdict fell
 * back to run history, which needs three runs and supports "never observed"
 * rather than "cannot happen". Expression steps closed part of that: their keys
 * are in their source. This closes the rest, by asking each kind of step the
 * question in the way that kind can answer it:
 *
 *   - the node declares an outputSchema              -> use it, it is the author's word
 *   - an Expression step                             -> derive the keys from the expression
 *   - an approval gate                               -> the PLATFORM writes the shape, so it knows it
 *   - an agent with a STRICT output contract         -> the contract is enforced at generation
 *   - anything else                                  -> undefined, and the caller falls back to history
 *
 * The last line is the important one. An agent with no contract, or a lenient
 * one, is genuinely unknowable from the blueprint: a lenient contract is not
 * enforced, so treating it as decisive would let this report a live branch as
 * dead on the strength of a schema nothing upholds.
 */
import { storage } from "./storage";
import { expressionOutputSchema } from "./expression-contract";

type Schema = { type: "object"; properties: Record<string, unknown> };

const asSchema = (keys: string[]): Schema => ({
  type: "object",
  properties: Object.fromEntries(keys.map((k) => [k, {}])),
});

/**
 * What an approval gate writes, straight from the writer in
 * dag-execution-engine.ts: `{ approved, decidedBy, approvalId?, reason? }`.
 *
 * Like every schema here this says what the step CAN produce, not what every
 * run reports — `approvalId` and `reason` are both conditional.
 */
export const GATE_OUTPUT_SCHEMA = asSchema(["approved", "decidedBy", "approvalId", "reason"]);

interface StepNode {
  nodeType?: unknown;
  outputSchema?: unknown;
  config?: unknown;
  refAgentId?: unknown;
}

/** The contract an agent's runs are actually held to, if it is held to one. */
async function agentContractSchema(agentId: string): Promise<unknown> {
  const agent = await storage.getAgent(agentId).catch(() => undefined);
  // Same resolution order the runtime uses (agent-runtime.ts): an explicitly
  // configured contract first, then the most recent one for this agent.
  const configured = (agent?.runtimeConfig as { outputContractId?: unknown } | null)?.outputContractId;
  const contract = typeof configured === "string"
    ? await storage.getOutputContract(configured).catch(() => undefined)
    : (await storage.getOutputContracts(agentId).catch(() => []))[0];
  if (!contract) return undefined;
  // A lenient contract is repaired-if-possible, not guaranteed. Only a strict
  // one is worth calling decisive.
  if (contract.enforcementMode !== "strict") return undefined;
  const definition = contract.schemaDefinition as { properties?: unknown } | null;
  return definition && typeof definition === "object" && definition.properties ? definition : undefined;
}

/**
 * The step's output schema, or undefined when nothing can say with certainty.
 *
 * Undefined is a real answer here and the caller must treat it as one: it means
 * fall back to what runs have produced, not "this step produces nothing".
 */
export async function stepOutputSchema(node: StepNode | null | undefined): Promise<unknown> {
  if (!node) return undefined;
  if (node.outputSchema) return node.outputSchema;

  if (node.nodeType === "expression") {
    const expression = (node.config as { expression?: unknown } | null)?.expression;
    return expressionOutputSchema(typeof expression === "string" ? expression : null) ?? undefined;
  }

  if (node.nodeType === "edge_gate") return GATE_OUTPUT_SCHEMA;

  if (typeof node.refAgentId === "string" && node.refAgentId) {
    return agentContractSchema(node.refAgentId);
  }

  return undefined;
}
