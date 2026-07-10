/**
 * Unified visual canvas — "skill" node wiring in the team-blueprint DAG engine.
 * Proves: computeWaves correctly carries a node's refSkillId into its plan
 * config (the wiring point a typo would silently break, since nothing else
 * catches a dropped field here — executeNode would just treat a skill node
 * as agentless and skip it instead of resolving the skill).
 */
import { describe, it, expect } from "vitest";
import { computeWaves } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

function node(overrides: Partial<TeamBlueprintNode>): TeamBlueprintNode {
  return {
    id: "n1",
    blueprintId: "bp1",
    nodeType: "internal_agent",
    label: "Node",
    positionX: 0,
    positionY: 0,
    refAgentId: null,
    refRemoteAgentId: null,
    refToolIds: [],
    refPolicyId: null,
    gateType: null,
    config: null,
    createdAt: new Date(),
    stateKey: "node_output",
    outputSchema: null,
    fallbackOutput: null,
    timeoutMs: 30000,
    retryPolicy: null,
    refTeamAgentId: null,
    outputContractId: null,
    refSkillId: null,
    ...overrides,
  } as TeamBlueprintNode;
}

describe("computeWaves — skill node wiring", () => {
  it("carries refSkillId through into nodeConfig for a skill-type node", () => {
    const skillNode = node({ id: "skill-1", nodeType: "skill", refSkillId: "skill-abc", stateKey: "compliance_context" });
    const plan = computeWaves([skillNode], []);

    expect(plan.nodeConfig["skill-1"].nodeType).toBe("skill");
    expect(plan.nodeConfig["skill-1"].refSkillId).toBe("skill-abc");
    expect(plan.nodeConfig["skill-1"].stateKey).toBe("compliance_context");
  });

  it("defaults refSkillId to null for non-skill nodes", () => {
    const agentNode = node({ id: "agent-1", nodeType: "internal_agent", refAgentId: "agent-xyz" });
    const plan = computeWaves([agentNode], []);

    expect(plan.nodeConfig["agent-1"].refSkillId).toBeNull();
  });

  it("places a skill node upstream of a dependent agent node in an earlier wave", () => {
    const skillNode = node({ id: "skill-1", nodeType: "skill", refSkillId: "skill-abc", stateKey: "context" });
    const agentNode = node({ id: "agent-1", nodeType: "internal_agent", refAgentId: "agent-xyz", stateKey: "result" });
    const edge: TeamBlueprintEdge = {
      id: "e1",
      blueprintId: "bp1",
      sourceNodeId: "skill-1",
      targetNodeId: "agent-1",
      label: null,
      contentPartTypes: [],
      allowedMetadata: null,
      slaTimeoutMs: null,
      failureMode: null,
      retryPolicy: null,
      condition: null,
      config: null,
    } as unknown as TeamBlueprintEdge;

    const plan = computeWaves([skillNode, agentNode], [edge]);

    expect(plan.totalWaves).toBe(2);
    expect(plan.waves[0].nodes).toEqual(["skill-1"]);
    expect(plan.waves[1].nodes).toEqual(["agent-1"]);
  });
});
