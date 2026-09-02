/**
 * VitalEdge / Equipment Dealer vertical — journey registry.
 *
 * Five production-grade journeys spanning the dealer operating model, each
 * carrying its own connectors, skills, agents, policies, blueprints, system
 * prompts and eval suite. The provisioner walks this array; the demo script
 * walks it in the same order.
 */
import type { JourneyDef } from "./types";
import { DEALER_ONTOLOGY_CONCEPTS } from "../ontology";
import { J1_INVOICE_TO_CASH } from "./invoice-to-cash";
import { J2_COLLECTIONS } from "./collections";
import { J3_WARRANTY } from "./warranty";
import { J4_RENTAL } from "./rental";
import { J5_WHOLEGOODS } from "./wholegoods";

export const DEALER_JOURNEYS: JourneyDef[] = [
  J1_INVOICE_TO_CASH,
  J2_COLLECTIONS,
  J3_WARRANTY,
  J4_RENTAL,
  J5_WHOLEGOODS,
];

export {
  J1_INVOICE_TO_CASH,
  J2_COLLECTIONS,
  J3_WARRANTY,
  J4_RENTAL,
  J5_WHOLEGOODS,
};

/**
 * Agent-to-ontology binding is by concept LABEL, so a typo in an ontologyTag
 * does not fail loudly — it silently produces an agent with no ontology
 * grounding, which is exactly the failure a governance demo cannot afford.
 * Run this before provisioning.
 */
export function validateJourneyBindings(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const conceptLabels = new Set(DEALER_ONTOLOGY_CONCEPTS.map((c) => c.label));

  for (const journey of DEALER_JOURNEYS) {
    const skillNames = new Set(journey.skills.map((s) => s.name));
    const mcpNames = new Set(journey.mcpServers.map((m) => m.name));
    const agentKeys = new Set(journey.agents.map((a) => a.key));

    for (const agent of journey.agents) {
      for (const tag of agent.ontologyTags) {
        if (!conceptLabels.has(tag)) {
          errors.push(`${journey.id} ${agent.externalId}: ontologyTag "${tag}" matches no concept label`);
        }
      }
      for (const skill of agent.skillNames) {
        if (!skillNames.has(skill)) {
          errors.push(`${journey.id} ${agent.externalId}: skill "${skill}" is not defined in this journey`);
        }
      }
      if (agent.mcpServerName && !mcpNames.has(agent.mcpServerName)) {
        errors.push(`${journey.id} ${agent.externalId}: mcpServerName "${agent.mcpServerName}" is not defined in this journey`);
      }
      if (agent.kbName && !journey.kbNames.includes(agent.kbName)) {
        errors.push(`${journey.id} ${agent.externalId}: kbName "${agent.kbName}" is not listed in journey kbNames`);
      }
      if (!journey.systemPrompts[agent.externalId]) {
        errors.push(`${journey.id} ${agent.externalId}: no system prompt defined`);
      }
    }

    for (const skill of journey.skills) {
      if (!agentKeys.has(skill.agentKey)) {
        errors.push(`${journey.id}: skill "${skill.name}" references unknown agentKey "${skill.agentKey}"`);
      }
    }

    // Every worker skill should actually be bound to its agent, otherwise it
    // provisions as an orphan and shows up in Skill Studio attached to nothing.
    const boundSkills = new Set(journey.agents.flatMap((a) => a.skillNames));
    for (const skill of journey.skills) {
      if (!boundSkills.has(skill.name)) {
        errors.push(`${journey.id}: skill "${skill.name}" is defined but bound to no agent`);
      }
    }

    if (journey.evalCases.length === 0) {
      errors.push(`${journey.id}: eval suite "${journey.evalSuiteName}" has no cases`);
    }
    const scorerIds = new Set([
      "ed-financial-accuracy",
      "ed-warranty-compliance",
      "ed-revenue-recognition",
      "ed-equipment-identity",
      "ed-collections-conduct",
    ]);
    for (const c of journey.evalCases) {
      for (const scorer of c.scorers) {
        if (!scorerIds.has(scorer)) {
          errors.push(`${journey.id} eval "${c.name}": unknown scorer "${scorer}"`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Flat counts for the provisioner's summary output and the demo script. */
export function journeyInventory() {
  return {
    journeys: DEALER_JOURNEYS.length,
    ontologyConcepts: DEALER_ONTOLOGY_CONCEPTS.length,
    agents: DEALER_JOURNEYS.reduce((n, j) => n + j.agents.length, 0),
    skills: DEALER_JOURNEYS.reduce((n, j) => n + j.skills.length, 0),
    mcpServers: DEALER_JOURNEYS.reduce((n, j) => n + j.mcpServers.length, 0),
    mcpTools: DEALER_JOURNEYS.reduce((n, j) => n + j.mcpServers.reduce((m, s) => m + s.tools.length, 0), 0),
    blueprints: DEALER_JOURNEYS.reduce((n, j) => n + j.blueprints.length, 0),
    evalSuites: DEALER_JOURNEYS.length,
    evalCases: DEALER_JOURNEYS.reduce((n, j) => n + j.evalCases.length, 0),
  };
}
