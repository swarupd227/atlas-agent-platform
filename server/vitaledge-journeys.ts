/**
 * VitalEdge / Equipment Dealer vertical — journey registry.
 *
 * Five production-grade journeys spanning the dealer operating model, each
 * carrying its own connectors, skills, agents, policies, blueprints, system
 * prompts and eval suite. The provisioner walks this array; the demo script
 * walks it in the same order.
 */
import type { JourneyDef } from "./vitaledge-journey-types";
import { VITALEDGE_ONTOLOGY_CONCEPTS } from "./vitaledge-ontology";
import { VE_J1_CASH } from "./vitaledge-journey-cash";
import { VE_J2_COLLECTIONS } from "./vitaledge-journey-collections";
import { VE_J3_WARRANTY } from "./vitaledge-journey-warranty";
import { VE_J4_RENTAL } from "./vitaledge-journey-rental";
import { VE_J5_WHOLEGOODS } from "./vitaledge-journey-wholegoods";

export const VITALEDGE_JOURNEYS: JourneyDef[] = [
  VE_J1_CASH,
  VE_J2_COLLECTIONS,
  VE_J3_WARRANTY,
  VE_J4_RENTAL,
  VE_J5_WHOLEGOODS,
];

export {
  VE_J1_CASH,
  VE_J2_COLLECTIONS,
  VE_J3_WARRANTY,
  VE_J4_RENTAL,
  VE_J5_WHOLEGOODS,
};

/**
 * Agent-to-ontology binding is by concept LABEL, so a typo in an ontologyTag
 * does not fail loudly — it silently produces an agent with no ontology
 * grounding, which is exactly the failure a governance demo cannot afford.
 * Run this before provisioning.
 */
export function validateJourneyBindings(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const conceptLabels = new Set(VITALEDGE_ONTOLOGY_CONCEPTS.map((c) => c.label));

  for (const journey of VITALEDGE_JOURNEYS) {
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
    journeys: VITALEDGE_JOURNEYS.length,
    ontologyConcepts: VITALEDGE_ONTOLOGY_CONCEPTS.length,
    agents: VITALEDGE_JOURNEYS.reduce((n, j) => n + j.agents.length, 0),
    skills: VITALEDGE_JOURNEYS.reduce((n, j) => n + j.skills.length, 0),
    mcpServers: VITALEDGE_JOURNEYS.reduce((n, j) => n + j.mcpServers.length, 0),
    mcpTools: VITALEDGE_JOURNEYS.reduce((n, j) => n + j.mcpServers.reduce((m, s) => m + s.tools.length, 0), 0),
    blueprints: VITALEDGE_JOURNEYS.reduce((n, j) => n + j.blueprints.length, 0),
    evalSuites: VITALEDGE_JOURNEYS.length,
    evalCases: VITALEDGE_JOURNEYS.reduce((n, j) => n + j.evalCases.length, 0),
  };
}
