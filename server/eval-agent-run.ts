// Runs an agent for an eval the way it actually runs -- same runtime, tools, skills and system prompt --
// and returns its real answer for the judge to score.
//
// Before this, an eval ran a tool-using agent as a bare model call (no tools, output capped), or, for a
// deployed agent, returned a fixed "cycle completed" message. Either way the judge scored something
// other than the agent's answer. Write tools are withheld here, so an eval can never change anything.

import { storage } from "./storage";
import { executePromptWithMcp } from "./agent-runtime";
import { gatherAvailableTools, isSideEffectful } from "./tool-dispatcher";
import { buildAgentSystemPromptWithGovernance } from "./routes/helpers";
import { resolveAgentIndustry } from "./agent-industry";
import type { EvalRunShape } from "./eval-run-mode";

export async function describeEvalRunShape(agent: { id: string; preloadedSkills?: unknown }): Promise<EvalRunShape & { mcpServerIds: string[] }> {
  const [links, kbs, deployments] = await Promise.all([
    storage.getAgentMcpServers(agent.id),
    storage.getAgentKnowledgeBases(agent.id).catch(() => []),
    storage.getDeploymentsByAgentId(agent.id, "active").catch(() => []),
  ]);
  const mcpServerIds = links.map((l) => l.serverId);
  return {
    mcpServerIds,
    mcpServerCount: mcpServerIds.length,
    skillCount: Array.isArray(agent.preloadedSkills) ? agent.preloadedSkills.length : 0,
    knowledgeBaseCount: kbs.length,
    activeDeploymentCount: deployments.length,
  };
}

export interface EvalAgentRunResult {
  output: string;
  error: string | null;
  toolCalls: number;
  /** Write tools the agent has but that were withheld for this eval. */
  withheldTools: string[];
}

export async function runAgentForEval(
  agent: { id: string; organizationId?: string | null; maxToolIterations?: number | null; modelProvider?: string | null; modelName?: string | null },
  input: string,
  mcpServerIds: string[],
): Promise<EvalAgentRunResult> {
  const orgId = agent.organizationId ?? null;

  // Offer only read-only tools. An empty allowlist would mean "no filter", so when nothing is
  // read-only the agent runs without any tool server instead.
  const available = mcpServerIds.length > 0 ? await gatherAvailableTools(mcpServerIds) : [];
  const readOnly = available.filter((t) => !isSideEffectful(t));
  const withheldTools = available.filter((t) => isSideEffectful(t)).map((t) => t.toolName);
  const serverIds = readOnly.length > 0 ? mcpServerIds : [];
  const allowlist = readOnly.map((t) => t.toolName);

  const fullAgent = await storage.getAgent(agent.id);
  const systemPrompt = fullAgent ? await buildAgentSystemPromptWithGovernance(fullAgent, orgId ?? undefined) : undefined;
  const industry = fullAgent ? (await resolveAgentIndustry(fullAgent as any)) ?? undefined : undefined;

  const result = await executePromptWithMcp(
    agent.id,
    "eval",
    undefined,
    serverIds,
    input,
    industry,
    systemPrompt,
    {
      conversational: true,
      maxToolIterations: agent.maxToolIterations ?? 8,
      ...(allowlist.length > 0 ? { dagToolAllowlist: allowlist } : {}),
    },
    undefined,
    orgId,
    null,
  );

  const toolCalls = (result.steps ?? []).filter((s: any) => s.type === "api_call").length;
  if (!result.success && result.summary?.error) {
    return { output: "", error: String(result.summary.error), toolCalls, withheldTools };
  }
  const output = (result as any).conversationalResponse || result.summary?.analysis?.summary || "";
  return { output: typeof output === "string" ? output : JSON.stringify(output), error: null, toolCalls, withheldTools };
}
