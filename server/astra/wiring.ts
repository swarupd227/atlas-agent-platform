/**
 * Production wiring for the Astra engine: the model call, permissions, audit,
 * services, tools and grounding. Everything the engine takes as a parameter
 * is built here, once.
 */
import { completeWithFallback, getProvider } from "../llm-provider";
import { hasPermission } from "../permissions";
import { storage } from "../storage";
import type { EngineDeps } from "./engine";
import { RateLimiter } from "./dispatch";
import { ToolRegistry } from "./registry";
import { DbThreadStore } from "./store";
import { createAstraServices } from "./services";
import type { AstraContext, AstraTool, AuditFn, CompleteFn } from "./types";
import { finishTurnTool } from "./tools/finish-turn";
import { loadToolsTool } from "./tools/load-tools";
import { GOVERNANCE_TOOLS } from "./tools/governance";
import { EVALUATION_TOOLS } from "./tools/evaluation";
import { KNOWLEDGE_TOOLS } from "./tools/knowledge";
import { DEPLOY_TOOLS } from "./tools/deploy";
import { listAgentsTool } from "./tools/list-agents";
import { getAgentTool } from "./tools/get-agent";
import { findConnectorsTool } from "./tools/find-connectors";
import { getIndustryContextTool } from "./tools/get-industry-context";
import { attachConnectorTool } from "./tools/attach-connector";
import { runAgentTool } from "./tools/run-agent";
import { getRunTool } from "./tools/get-run";
import { decideApprovalTool } from "./tools/decide-approval";
import { decideRecommendationTool } from "./tools/decide-recommendation";
import { acknowledgeAlertTool } from "./tools/acknowledge-alert";
import { KPI_TOOLS } from "./tools/kpi";
import { answerToolRequestTool, decidePolicyExceptionTool } from "./tools/decide-exception-and-tool-request";
import { discoverOutcomeTool } from "./tools/discover-outcome";
import { listOutcomesTool } from "./tools/list-outcomes";
import { createOutcomeTool } from "./tools/create-outcome";
import { listNeedsMeTool } from "./tools/list-needs-me";
import { proposeTeamTool } from "./tools/propose-team";
import { buildTeamTool } from "./tools/build-team";
import { verifyWiringTool } from "./tools/verify-wiring";
import { getTeamRunTool, runTeamTool } from "./tools/run-team";

/** Claude Sonnet 5 by default; override with ASTRA_MODEL. */
export const ASTRA_MODEL = process.env.ASTRA_MODEL || "claude-sonnet-5";

export const ASTRA_TOOLS: AstraTool[] = [finishTurnTool, loadToolsTool, listAgentsTool, getAgentTool, findConnectorsTool, getIndustryContextTool, attachConnectorTool, runAgentTool, getRunTool, decideApprovalTool, decideRecommendationTool, acknowledgeAlertTool, decidePolicyExceptionTool, answerToolRequestTool, discoverOutcomeTool, listOutcomesTool, createOutcomeTool, ...KPI_TOOLS, listNeedsMeTool, proposeTeamTool, buildTeamTool, verifyWiringTool, runTeamTool, getTeamRunTool, ...GOVERNANCE_TOOLS, ...EVALUATION_TOOLS, ...KNOWLEDGE_TOOLS, ...DEPLOY_TOOLS];

function modelCall(): CompleteFn {
  const primaryName = ASTRA_MODEL.startsWith("gpt") || ASTRA_MODEL.startsWith("o") ? "openai" : "anthropic";
  const primary = getProvider(primaryName);
  const fallback = getProvider(primaryName === "openai" ? "anthropic" : "openai");
  // The fallback provider runs with its own default model (completeWithFallback clears it).
  return (messages, options) => completeWithFallback(messages, options, [primary, fallback]);
}

const audit: AuditFn = async (record) => {
  await storage.createAuditEvent({
    actorType: "user",
    actorId: record.userId ?? "unknown",
    action: record.action,
    objectType: "astra_tool",
    objectId: record.objectId,
    organizationId: record.orgId,
    details: JSON.stringify(record.details),
  });
};

let cached: { deps: EngineDeps; store: DbThreadStore } | null = null;

export function getAstraRuntime(): { deps: EngineDeps; store: DbThreadStore } {
  if (cached) return cached;
  const store = new DbThreadStore();
  const services = createAstraServices();
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry(ASTRA_TOOLS, hasPermission),
    complete: modelCall(),
    can: hasPermission,
    audit,
    services,
    model: ASTRA_MODEL,
    rateLimit: new RateLimiter(30),
    grounding: async (ctx: AstraContext) => {
      const personalView = ctx.industrySource === "request" && !!ctx.organizationIndustryId;
      const [organizationName, industry, orgIndustry] = await Promise.all([
        services.getOrganizationName(ctx.orgId),
        services.getIndustryContext(ctx.industryId ?? null),
        personalView ? services.getIndustryContext(ctx.organizationIndustryId) : Promise.resolve(null),
      ]);
      const labelOf = (c: typeof industry | null) => (!c || !c.selected ? null : c.pack || c.builtIn ? c.label : String(c.industryId));
      return {
        organizationName,
        industryLabel: labelOf(industry),
        industryHighlights: industry.selected && (industry.pack || industry.builtIn) ? industry.regulatoryFrameworks : undefined,
        organizationIndustryLabel: labelOf(orgIndustry),
      };
    },
  };
  cached = { deps, store };
  return cached;
}
