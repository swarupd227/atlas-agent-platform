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
import { listAgentsTool } from "./tools/list-agents";
import { getAgentTool } from "./tools/get-agent";
import { findConnectorsTool } from "./tools/find-connectors";
import { getIndustryContextTool } from "./tools/get-industry-context";

/** Claude Sonnet 5 by default; override with ASTRA_MODEL. */
export const ASTRA_MODEL = process.env.ASTRA_MODEL || "claude-sonnet-5";

export const ASTRA_TOOLS: AstraTool[] = [finishTurnTool, listAgentsTool, getAgentTool, findConnectorsTool, getIndustryContextTool];

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
      const [organizationName, industry] = await Promise.all([
        services.getOrganizationName(ctx.orgId),
        services.getIndustryContext(ctx.industryId ?? null),
      ]);
      return {
        organizationName,
        industryLabel: industry.selected && industry.pack ? industry.label : industry.selected ? String(industry.industryId) : null,
        industryHighlights: industry.selected && industry.pack ? industry.regulatoryFrameworks : undefined,
      };
    },
  };
  cached = { deps, store };
  return cached;
}
