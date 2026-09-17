/**
 * The industry an agent runs with: its own, else its organization's, else its
 * deployment's when that is a real industry (older deployments were written
 * with an invented "technology"). Null when none is known -- an honest "no
 * industry" rather than a made-up one. Rules: shared/industry-filter.ts.
 */
import { pickAgentIndustry } from "@shared/industry-filter";
import { getTenantIndustry } from "./industry-context";

export async function resolveAgentIndustry(
  agent: { industryId?: string | null; organizationId?: string | null } | null | undefined,
  deploymentIndustry?: string | null,
): Promise<string | null> {
  const tenant = await getTenantIndustry(agent?.organizationId ?? null);
  return pickAgentIndustry({ agentIndustryId: agent?.industryId, deploymentIndustry, tenantIndustryId: tenant.industryId });
}
