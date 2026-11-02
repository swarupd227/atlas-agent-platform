/**
 * Which library policies the agent wizard recommends for an industry. A
 * recommendation is only a suggestion: nothing is selected or attached until the
 * person creating the agent adds it (agents created in the wizard are held to the
 * policies chosen for them; see policySelection in shared/schema.ts).
 *
 * A policy is recommended, strongest reason first, when it:
 *   1. meets one of the industry's required items (policyRequirementsFor),
 *   2. is written for the industry (policyJson.industry), or
 *   3. is written for every industry (policyJson.industry = "cross_industry").
 */
import { policyMeetsRequirement, policyRequirementsFor } from "./policy-requirements";

export interface RecommendablePolicy {
  id: string;
  name: string;
  domain: string;
  description?: string | null;
  status?: string | null;
  policyJson?: unknown;
}

export interface PolicyRecommendation<P extends RecommendablePolicy = RecommendablePolicy> {
  policy: P;
  /** Why it is recommended, for the person deciding, e.g. "Meets PCI-DSS (data_handling)". */
  reasons: string[];
}

const CROSS_INDUSTRY = "cross_industry";

export function recommendPolicies<P extends RecommendablePolicy>(
  industryId: string | null | undefined,
  policies: P[],
  industryLabel?: string,
): PolicyRecommendation<P>[] {
  const industry = industryId && industryId !== "custom" ? industryId : null;
  const requirements = industry ? policyRequirementsFor(industry) : [];
  const ranked: Array<PolicyRecommendation<P> & { rank: number }> = [];
  for (const policy of policies) {
    if (policy.status && policy.status !== "active") continue;
    const reasons: string[] = [];
    let rank = 3;
    for (const r of requirements) {
      if (policyMeetsRequirement({ name: policy.name, description: policy.description ?? null, domain: policy.domain }, r)) {
        const reason = `Meets ${r.regulation} (${r.domain})`;
        if (!reasons.includes(reason)) reasons.push(reason);
        rank = Math.min(rank, 0);
      }
    }
    const tagged = (policy.policyJson as { industry?: unknown } | null | undefined)?.industry;
    if (industry && tagged === industry) {
      reasons.push(`Written for ${industryLabel || industry}`);
      rank = Math.min(rank, 1);
    } else if (tagged === CROSS_INDUSTRY) {
      reasons.push("Written for every industry");
      rank = Math.min(rank, 2);
    }
    if (reasons.length > 0) ranked.push({ policy, reasons, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.policy.name.localeCompare(b.policy.name))
    .map(({ policy, reasons }) => ({ policy, reasons }));
}
