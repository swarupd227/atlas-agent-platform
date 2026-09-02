/**
 * Industry pack contract.
 *
 * An industry pack is everything the platform needs to support a vertical:
 * its profile, its vocabulary, its assurance scorers, its deployment gates,
 * its policy packs, its eval framework, its agent-wizard defaults and its
 * outcome starter prompts.
 *
 * The point is that adding a vertical means adding ONE directory here, not
 * editing twenty platform files. Before this existed, `equipment_dealer` was
 * spread across industry-provider.tsx, industry-assurance.ts,
 * industry-deployment-pipeline.ts, policy-packs.ts, server/routes.ts,
 * agent-wizard.tsx, outcome-discover.tsx and ten dropdown lists — which meant
 * every new vertical was a platform change.
 *
 * Deliberately free of React and of any server import: packs are consumed by
 * both sides, so icons are named rather than referenced, and the client maps
 * names to components at the edge.
 */

export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export interface IntegrationSystem {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface GovernancePolicy {
  label: string;
  description: string;
}

export interface IndustryProfileData {
  label: string;
  shortLabel: string;
  description: string;
  /** lucide-react icon NAME. Resolved to a component by the client only. */
  iconName: string;
  color: string;
  ontology: string;
  agentSkills: number;
  regulatoryFrameworks: string[];
  subVerticals: string[];
  jurisdictions: string[];
  integrationSystems: IntegrationSystem[];
  departments: string[];
  defaultGovernancePolicies: GovernancePolicy[];
}

export interface IndustryScorer {
  id: string; type: string; name: string; description: string;
  weight: number; params: Record<string, unknown>; industry: string;
}

export interface RegulatoryTemplate {
  id: string; regulation: string; section: string; name: string; description: string;
  inputScenario: string; expectedBehavior: string; tags: string[]; industry: string;
}

export interface KpiDimension {
  id: string; label: string; industry: string; description: string;
}

export interface RegressionImpactTemplate {
  pattern: string; industry: string; impactTemplate: string;
  regulatoryRef?: string; revenueMultiplier?: number;
}

export interface ProductionEdgeCase {
  id: string; title: string; description: string; category: string;
  severity: "critical" | "high" | "medium" | "low"; industry: string;
  inputData: Record<string, unknown>; expectedOutput: Record<string, unknown>;
  tags: string[]; discoveredAt: string; occurrences: number;
}

export interface PipelineStage {
  id: string; name: string; description: string; mandatory: boolean; order: number;
  requiredArtifacts: string[]; attestationType: "auto" | "manual" | "review";
}

export interface RollbackTrigger {
  id: string; name: string; description: string; metric: string;
  condition: "below" | "above" | "any_event"; threshold?: number; unit?: string;
  severity: "critical" | "high" | "medium"; autoRollback: boolean;
}

export interface EvidenceItem {
  id: string; name: string; description: string; source: string;
  required: boolean; regulation?: string;
}

export interface PolicyPackPolicy {
  name: string; domain: string; description: string; policyJson: Record<string, unknown>;
}

export interface PolicyPack {
  id: string; name: string; description: string; industry: string; framework: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  policies: PolicyPackPolicy[];
}

export interface EvalFramework {
  id: string; label: string; description: string;
  dimensions: Array<{
    id: string; name: string; description: string; weight: number; scoringCriteria: string[];
  }>;
}

export interface WizardPreset {
  label: string; riskTier: string; autonomyMode: string;
  stopConditions: string[]; escalationTriggers: string[];
  forbiddenOutputs: string[]; allowedActions: string[];
}

export interface WizardToolConfig {
  name: string; description: string; permissionScope: string; dataClasses: string[];
  failureModes: string[]; rateLimit: string; costPerCall: number; accessTier: string;
  writeAccess?: boolean;
}

export interface WizardContext {
  defaultSkills: string[];
  recommendedModel: { provider: string; model: string; reasoning: string };
  modelBenchmarks: Array<{ model: string; provider: string; score: number; reasoning: string }>;
  compliancePrerequisites: string[];
  mcpTools: WizardToolConfig[];
  dataSensitivityClasses: string[];
  contentFilters: string[];
  memoryGovernance: Array<{ rule: string; regulation: string; type: string }>;
  contextBudgetPreset: Array<{ category: string; pct: number; tokens: number }>;
  costBenchmarks: Record<string, { label: string; low: number; high: number; unit: string }>;
}

export interface StarterPrompt {
  /** lucide-react icon NAME, resolved by the client. */
  iconName: string;
  label: string;
  prompt: string;
}

export interface IndustryPack {
  /** Stable industry id used as the key everywhere in the platform. */
  id: string;
  profile: IndustryProfileData;
  /** Overrides for generic platform nouns, e.g. kpis -> "Absorption Metrics". */
  terminology: Record<string, string>;
  assurance: {
    scorers: IndustryScorer[];
    regulatoryTemplates: RegulatoryTemplate[];
    kpiDimensions: KpiDimension[];
    regressionImpactTemplates: RegressionImpactTemplate[];
    productionEdgeCases: ProductionEdgeCase[];
  };
  deployment: {
    pipelineStages: PipelineStage[];
    rollbackTriggers: RollbackTrigger[];
    evidenceItems: EvidenceItem[];
  };
  policyPacks: PolicyPack[];
  evalFramework: EvalFramework;
  wizard: { preset: WizardPreset; context: WizardContext };
  starterPrompts: StarterPrompt[];
}
