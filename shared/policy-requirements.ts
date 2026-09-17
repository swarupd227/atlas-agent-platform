/**
 * Which policies an industry requires before an agent is created (the wizard's
 * design-time check), and whether an organization's active policies cover them.
 *
 * Built-in verticals have a curated list; an industry pack contributes one
 * requirement per policy in its policy packs. An industry with neither returns
 * no requirements and `checked: false` -- nothing was checked, which is not a pass.
 */
import { packPolicyPacks } from "./industry-packs";

export interface PolicyRequirement {
  domain: string;
  regulation: string;
  description: string;
  /** For pack requirements: the pack policy that satisfies it when installed. */
  policyName?: string;
}

export const BUILT_IN_POLICY_REQUIREMENTS: Record<string, PolicyRequirement[]> = {
  financial_services: [
    { domain: "data_handling", regulation: "PCI-DSS", description: "Payment Card Industry Data Security Standard data handling policy" },
    { domain: "data_handling", regulation: "GLBA", description: "Gramm-Leach-Bliley Act customer data privacy policy" },
    { domain: "data_handling", regulation: "BSA/AML", description: "Bank Secrecy Act / Anti-Money Laundering data retention policy" },
    { domain: "tool_permissions", regulation: "SOX", description: "Sarbanes-Oxley financial reporting controls" },
    { domain: "output_control", regulation: "REG_DD", description: "Truth in Savings disclosure output controls" },
  ],
  healthcare: [
    { domain: "data_handling", regulation: "HIPAA", description: "Health Insurance Portability and Accountability Act PHI handling policy" },
    { domain: "data_handling", regulation: "HITECH", description: "HITECH Act breach notification and data protection policy" },
    { domain: "output_control", regulation: "HIPAA", description: "HIPAA minimum necessary standard output filtering" },
  ],
  insurance: [
    { domain: "data_handling", regulation: "NAIC", description: "NAIC model regulation data governance policy" },
    { domain: "data_handling", regulation: "GDPR", description: "GDPR policyholder data processing policy" },
    { domain: "output_control", regulation: "NAIC", description: "NAIC consumer communication compliance controls" },
  ],
  manufacturing: [
    { domain: "tool_permissions", regulation: "OSHA", description: "OSHA safety interlock tool access controls" },
    { domain: "data_handling", regulation: "ITAR", description: "ITAR export-controlled data handling policy" },
  ],
  retail: [
    { domain: "data_handling", regulation: "PCI-DSS", description: "PCI-DSS payment card data handling policy" },
    { domain: "data_handling", regulation: "CCPA", description: "CCPA consumer data privacy policy" },
  ],
  technology_saas: [
    { domain: "data_handling", regulation: "SOC2", description: "SOC 2 Type II data handling and security controls" },
    { domain: "data_handling", regulation: "GDPR", description: "GDPR data processing and residency policy" },
    { domain: "output_control", regulation: "CCPA", description: "CCPA consumer data output controls" },
  ],
};

/** Requirements for an industry: the built-in list, then the industry's policy packs. */
export function policyRequirementsFor(industryId: string): PolicyRequirement[] {
  const builtIn = BUILT_IN_POLICY_REQUIREMENTS[industryId] ?? [];
  const fromPacks: PolicyRequirement[] = packPolicyPacks
    .filter((pack) => pack.industry === industryId)
    .flatMap((pack) => pack.policies.map((p) => ({ domain: p.domain, regulation: pack.framework, description: p.description, policyName: p.name })));
  return [...builtIn, ...fromPacks];
}

export interface PolicyCheckResult {
  passed: boolean;
  /** False when no requirements are known for the industry, so nothing was checked. */
  checked: boolean;
  message?: string;
  requirements: Array<{ domain: string; regulation: string; description: string; status: "satisfied" | "missing"; matchingPolicy?: string; severity: "critical" | "warning" }>;
}

export function checkPolicyRequirements(
  industryId: string,
  requirements: PolicyRequirement[],
  activePolicies: Array<{ name: string | null; description: string | null; domain: string | null }>,
  riskTier?: string,
): PolicyCheckResult {
  if (requirements.length === 0) {
    return { passed: true, checked: false, message: `No policy requirements are known for ${industryId}, so none were checked.`, requirements: [] };
  }
  const isHighRisk = riskTier === "HIGH" || riskTier === "CRITICAL";
  const results = requirements.map((r) => {
    const regulationLower = r.regulation.toLowerCase().split("/")[0];
    const matchingPolicy = activePolicies.find((p) => {
      if (p.domain !== r.domain) return false;
      if (r.policyName && (p.name || "").toLowerCase() === r.policyName.toLowerCase()) return true;
      return (p.name || "").toLowerCase().includes(regulationLower) || (p.description || "").toLowerCase().includes(regulationLower);
    });
    return {
      domain: r.domain,
      regulation: r.regulation,
      description: r.description,
      status: matchingPolicy ? ("satisfied" as const) : ("missing" as const),
      matchingPolicy: matchingPolicy?.name ?? undefined,
      severity: isHighRisk ? ("critical" as const) : ("warning" as const),
    };
  });
  return { passed: results.every((r) => r.status === "satisfied"), checked: true, requirements: results };
}
