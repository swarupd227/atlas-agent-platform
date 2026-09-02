/**
 * Shared shapes for the VitalEdge / Equipment Dealer journey definitions.
 *
 * One JourneyDef is everything the provisioner needs to stand a journey up
 * end-to-end: mock connectors, knowledge bases, skills, agents, the team
 * orchestrator that makes it a Journey Library entry, blueprints, system
 * prompts, and the eval suite that proves it works.
 */

export interface McpToolDef {
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
}

export interface McpServerDef {
  name: string;
  description: string;
  urlPath: string;
  tools: McpToolDef[];
}

export interface SkillDef {
  name: string;
  description: string;
  domain: string;
  tags: string[];
  agentKey: string;
}

export interface AgentDef {
  key: string;
  externalId: string;
  name: string;
  description: string;
  role: "orchestrator" | "worker";
  mcpServerName?: string;
  kbName?: string;
  skillNames: string[];
  department: string;
  complianceTags: string[];
  /** Must match ontology concept labels exactly — binding is by label. */
  ontologyTags: string[];
}

export interface BlueprintDef {
  name: string;
  description: string;
  steps: Array<{ order: number; label: string; description: string }>;
}

export interface EvalCaseDef {
  name: string;
  /** happy path, edge case, adversarial, or regulatory */
  category: "happy_path" | "edge_case" | "adversarial" | "regulatory";
  inputScenario: string;
  expectedOutput: Record<string, unknown>;
  passCriteria: string;
  /** Scorer ids from industry-assurance.ts for the equipment_dealer pack. */
  scorers: string[];
}

export interface JourneyDef {
  id: string;
  name: string;
  description: string;
  subVertical: string;
  /** Business outcome the journey is bought for, in the dealer's own terms. */
  businessOutcome: string;
  kpis: Array<{ name: string; baseline: string; target: string }>;
  orchestratorName: string;
  mcpServers: McpServerDef[];
  kbNames: string[];
  policyNames: string[];
  skills: SkillDef[];
  agents: AgentDef[];
  blueprints: BlueprintDef[];
  systemPrompts: Record<string, string>;
  evalSuiteName: string;
  evalCases: EvalCaseDef[];
}
