/**
 * Server-side presets for the agent wizard (GET /api/industries/:id/dynamic-presets):
 * the built-in verticals' guardrails, context and context priority, merged with
 * the industry packs' wizard presets -- the same merge the client wizard does.
 *
 * Packs carry no context priority, so a pack industry gets the documented
 * default order rather than an invented one.
 */
import { packWizardContexts, packWizardPresets } from "./industry-packs";

export interface ServerWizardPreset { riskTier: string; autonomyMode: string; stopConditions: string[]; escalationTriggers: string[]; forbiddenOutputs: string[]; allowedActions: string[] }
export interface ServerWizardContext { recommendedModel: { provider: string; model: string }; memoryGovernance: Array<{ rule: string; regulation: string; type: string }>; contextBudget: Array<{ category: string; pct: number; tokens: number }> }

export const BUILT_IN_WIZARD_PRESETS: Record<string, { riskTier: string; autonomyMode: string; stopConditions: string[]; escalationTriggers: string[]; forbiddenOutputs: string[]; allowedActions: string[] }> = {
  financial_services: { riskTier: "HIGH", autonomyMode: "assisted", stopConditions: ["PII detected in output", "Transaction amount exceeds threshold", "Regulatory compliance check failed"], escalationTriggers: ["Write to production trading system", "Customer complaint escalation", "Fraud detection signal"], forbiddenOutputs: ["Raw account numbers", "Unmasked SSN or tax IDs", "Investment advice without disclaimers"], allowedActions: ["Read customer records", "Generate compliance reports", "Query market data feeds"] },
  healthcare: { riskTier: "HIGH", autonomyMode: "manual", stopConditions: ["PHI detected outside secure boundary", "Clinical decision without validation", "Patient safety signal detected"], escalationTriggers: ["Adverse event signal", "Medication interaction warning", "Abnormal lab result flagged"], forbiddenOutputs: ["Unredacted PHI", "Autonomous clinical diagnoses", "Treatment recommendations without clinician review"], allowedActions: ["Read de-identified patient data", "Generate clinical summaries", "Query formulary database"] },
  manufacturing: { riskTier: "MEDIUM", autonomyMode: "assisted", stopConditions: ["Safety interlock override attempted", "Production parameter out of range", "Equipment fault detected"], escalationTriggers: ["Quality non-conformance detected", "Emergency stop triggered", "Calibration overdue"], forbiddenOutputs: ["Override safety interlocks", "Bypass quality hold", "Modify emergency stop configuration"], allowedActions: ["Read sensor data", "Generate production reports", "Query maintenance schedules"] },
  retail: { riskTier: "MEDIUM", autonomyMode: "autonomous", stopConditions: ["Payment card data detected in output", "Price manipulation detected", "Inventory discrepancy above threshold"], escalationTriggers: ["High-value refund request", "Suspected fraud pattern", "Customer data deletion request"], forbiddenOutputs: ["Unmasked credit card numbers", "Raw customer passwords", "Competitor price comparisons without context"], allowedActions: ["Read product catalog", "Update order status", "Query inventory levels"] },
  insurance: { riskTier: "HIGH", autonomyMode: "assisted", stopConditions: ["PII detected in output", "Unfair denial pattern detected", "Policy limit exceeded"], escalationTriggers: ["High-value claim flagged", "Fraud indicator detected", "Regulatory inquiry received"], forbiddenOutputs: ["Raw policyholder SSN", "Unauthorized policy modifications", "Bad faith claim denials"], allowedActions: ["Read policy records", "Generate claims reports", "Query actuarial models"] },
};

export const BUILT_IN_WIZARD_CONTEXT: Record<string, { recommendedModel: { provider: string; model: string }; memoryGovernance: Array<{ rule: string; regulation: string; type: string }>; contextBudget: Array<{ category: string; pct: number; tokens: number }> }> = {
  financial_services: { recommendedModel: { provider: "openai", model: "gpt-4.1" }, memoryGovernance: [{ rule: "Retain BSA/AML records for 5 years minimum", regulation: "BSA/AML", type: "retention" }, { rule: "Customer identity records retained for 5 years after account closure", regulation: "CIP", type: "retention" }, { rule: "Erase personal data within 30 days of valid GDPR request", regulation: "GDPR", type: "erasure" }, { rule: "Transaction logs immutable once committed", regulation: "SOX", type: "immutability" }], contextBudget: [{ category: "System Instructions", pct: 20, tokens: 1640 }, { category: "Industry Ontology", pct: 22, tokens: 1802 }, { category: "Regulatory Context", pct: 18, tokens: 1475 }, { category: "Skill Instructions", pct: 14, tokens: 1147 }, { category: "Conversation History", pct: 10, tokens: 819 }, { category: "Retrieved Knowledge", pct: 10, tokens: 819 }, { category: "Tool Descriptions", pct: 6, tokens: 490 }] },
  healthcare: { recommendedModel: { provider: "openai", model: "gpt-4.1" }, memoryGovernance: [{ rule: "Retain medical records for minimum 6 years (varies by state)", regulation: "HIPAA", type: "retention" }, { rule: "PHI must be encrypted at rest and in transit", regulation: "HIPAA Security Rule", type: "encryption" }, { rule: "Right to access personal health records within 30 days", regulation: "HIPAA", type: "access" }, { rule: "Minimum necessary standard for PHI disclosure", regulation: "HIPAA Privacy Rule", type: "access_control" }], contextBudget: [{ category: "System Instructions", pct: 18, tokens: 1475 }, { category: "Industry Ontology", pct: 20, tokens: 1638 }, { category: "Regulatory Context", pct: 20, tokens: 1638 }, { category: "Skill Instructions", pct: 15, tokens: 1229 }, { category: "Conversation History", pct: 10, tokens: 819 }, { category: "Retrieved Knowledge", pct: 12, tokens: 983 }, { category: "Tool Descriptions", pct: 5, tokens: 410 }] },
  manufacturing: { recommendedModel: { provider: "openai", model: "gpt-4o" }, memoryGovernance: [{ rule: "Retain quality records per ISO 9001 (minimum 3 years)", regulation: "ISO 9001", type: "retention" }, { rule: "Safety incident records retained for 10 years", regulation: "OSHA", type: "retention" }, { rule: "Production batch records retained for product lifecycle", regulation: "GMP", type: "retention" }], contextBudget: [{ category: "System Instructions", pct: 22, tokens: 1802 }, { category: "Industry Ontology", pct: 18, tokens: 1475 }, { category: "Regulatory Context", pct: 12, tokens: 983 }, { category: "Skill Instructions", pct: 18, tokens: 1475 }, { category: "Conversation History", pct: 8, tokens: 655 }, { category: "Retrieved Knowledge", pct: 14, tokens: 1147 }, { category: "Tool Descriptions", pct: 8, tokens: 655 }] },
  insurance: { recommendedModel: { provider: "anthropic", model: "claude-3.5-sonnet" }, memoryGovernance: [{ rule: "Claims records retained for statute of limitations + 3 years", regulation: "State Insurance Laws", type: "retention" }, { rule: "Underwriting records retained for policy lifetime + 7 years", regulation: "NAIC Model Laws", type: "retention" }, { rule: "GDPR erasure within 30 days for EU policyholders", regulation: "GDPR", type: "erasure" }], contextBudget: [{ category: "System Instructions", pct: 20, tokens: 1638 }, { category: "Industry Ontology", pct: 20, tokens: 1638 }, { category: "Regulatory Context", pct: 18, tokens: 1475 }, { category: "Skill Instructions", pct: 14, tokens: 1147 }, { category: "Conversation History", pct: 10, tokens: 819 }, { category: "Retrieved Knowledge", pct: 12, tokens: 983 }, { category: "Tool Descriptions", pct: 6, tokens: 490 }] },
  retail: { recommendedModel: { provider: "openai", model: "gpt-4o" }, memoryGovernance: [{ rule: "PCI data must not be stored after transaction completion", regulation: "PCI DSS", type: "deletion" }, { rule: "Customer data erasure within 45 days of CCPA request", regulation: "CCPA", type: "erasure" }, { rule: "Behavioral tracking data retained max 13 months", regulation: "GDPR/ePrivacy", type: "retention" }], contextBudget: [{ category: "System Instructions", pct: 20, tokens: 1638 }, { category: "Industry Ontology", pct: 15, tokens: 1229 }, { category: "Regulatory Context", pct: 10, tokens: 819 }, { category: "Skill Instructions", pct: 18, tokens: 1475 }, { category: "Conversation History", pct: 15, tokens: 1229 }, { category: "Retrieved Knowledge", pct: 14, tokens: 1147 }, { category: "Tool Descriptions", pct: 8, tokens: 655 }] },
};

export const BUILT_IN_CONTEXT_PRIORITY: Record<string, string[]> = {
  healthcare: ["Regulatory Context", "Skill Instructions", "Industry Ontology", "Conversation History", "Tool Descriptions", "Retrieved Knowledge", "System Instructions"],
  financial_services: ["Regulatory Context", "System Instructions", "Industry Ontology", "Skill Instructions", "Conversation History", "Tool Descriptions", "Retrieved Knowledge"],
  insurance: ["Regulatory Context", "Industry Ontology", "Skill Instructions", "System Instructions", "Conversation History", "Tool Descriptions", "Retrieved Knowledge"],
  manufacturing: ["System Instructions", "Industry Ontology", "Skill Instructions", "Regulatory Context", "Retrieved Knowledge", "Conversation History", "Tool Descriptions"],
  retail: ["System Instructions", "Skill Instructions", "Conversation History", "Retrieved Knowledge", "Industry Ontology", "Regulatory Context", "Tool Descriptions"],
};

export const DEFAULT_WIZARD_PRESET: ServerWizardPreset = { riskTier: "MEDIUM", autonomyMode: "assisted", stopConditions: [], escalationTriggers: [], forbiddenOutputs: [], allowedActions: [] };
export const DEFAULT_WIZARD_CONTEXT: ServerWizardContext = { recommendedModel: { provider: "openai", model: "gpt-4o" }, memoryGovernance: [], contextBudget: [{ category: "System Instructions", pct: 20, tokens: 1638 }, { category: "Industry Ontology", pct: 15, tokens: 1229 }, { category: "Regulatory Context", pct: 15, tokens: 1229 }, { category: "Skill Instructions", pct: 15, tokens: 1229 }, { category: "Conversation History", pct: 12, tokens: 983 }, { category: "Retrieved Knowledge", pct: 15, tokens: 1229 }, { category: "Tool Descriptions", pct: 8, tokens: 655 }] };
export const DEFAULT_CONTEXT_PRIORITY = ["System Instructions", "Industry Ontology", "Regulatory Context", "Skill Instructions", "Conversation History", "Retrieved Knowledge", "Tool Descriptions"];

export function wizardPresetFor(industryId: string): ServerWizardPreset {
  const builtIn = BUILT_IN_WIZARD_PRESETS[industryId];
  if (builtIn) return builtIn;
  const pack = packWizardPresets[industryId];
  if (pack) {
    const { riskTier, autonomyMode, stopConditions, escalationTriggers, forbiddenOutputs, allowedActions } = pack;
    return { riskTier, autonomyMode, stopConditions, escalationTriggers, forbiddenOutputs, allowedActions };
  }
  return DEFAULT_WIZARD_PRESET;
}

export function wizardContextFor(industryId: string): ServerWizardContext {
  const builtIn = BUILT_IN_WIZARD_CONTEXT[industryId];
  if (builtIn) return builtIn;
  const pack = packWizardContexts[industryId];
  if (pack) {
    return {
      recommendedModel: { provider: pack.recommendedModel.provider, model: pack.recommendedModel.model },
      memoryGovernance: pack.memoryGovernance,
      contextBudget: pack.contextBudgetPreset?.length ? pack.contextBudgetPreset : DEFAULT_WIZARD_CONTEXT.contextBudget,
    };
  }
  return DEFAULT_WIZARD_CONTEXT;
}

export function contextPriorityFor(industryId: string): string[] {
  return BUILT_IN_CONTEXT_PRIORITY[industryId] ?? DEFAULT_CONTEXT_PRIORITY;
}
