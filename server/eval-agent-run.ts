// Runs an agent for an eval the way a person actually runs it -- through startWorkspaceRun, the same
// single-agent checkpoint loop Ask Astra, Workspace chat, Slack and Teams all call -- and returns its
// real answer for the judge to score.
//
// Before this, an eval ran a tool-using agent as a bare model call (no tools, output capped), or, for a
// deployed agent, returned a fixed "cycle completed" message. A first pass at this file called
// executePromptWithMcp instead of startWorkspaceRun: that function is a DIFFERENT tool-calling
// implementation (used by team DAG workers and Playground), and in it a tool-using agent could still
// answer from memory instead of calling its tools -- verified live: the Policy Assistant, asked the
// same question through executePromptWithMcp and through startWorkspaceRun, made 0 tool calls and
// invented a policy section through the former, 6 real tool calls and cited real sections through the
// latter. startWorkspaceRun's own loop has no such gap, so this now calls that instead.
//
// Write tools are withheld by restricting the tool list itself (Checkpoint.toolAllowlist, applied in
// buildContext the same way a policy's toolAllowlist already is), not by asking the model nicely -- so
// an eval structurally cannot call a write tool, whatever the model decides.

import { storage } from "./storage";
import { startWorkspaceRun } from "./workspace-run";
import { gatherAvailableTools, isSideEffectful } from "./tool-dispatcher";
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
  agent: { id: string; organizationId?: string | null },
  input: string,
  mcpServerIds: string[],
): Promise<EvalAgentRunResult> {
  const orgId = agent.organizationId ?? undefined;

  const fullAgent = await storage.getAgent(agent.id, orgId);
  if (!fullAgent) return { output: "", error: "Agent not found", toolCalls: 0, withheldTools: [] };
  if (fullAgent.agentType === "team") {
    // A team orchestrator's real work is its blueprint DAG (runTeamWorkspaceRun), a different
    // execution path that this file's toolAllowlist restriction does not reach -- running one through
    // here would offer every tool, including writes, unrestricted. Refuse rather than do that silently;
    // evaluate the team's individual worker agents instead.
    return { output: "", error: "This agent is a team orchestrator; evals run against its individual worker agents, not the team itself.", toolCalls: 0, withheldTools: [] };
  }

  // Offer only read-only tools. buildContext's `if (toolAllowlist)` treats an empty array as a real,
  // present restriction (not "no filter") -- an empty array is truthy in JS -- so passing [] when
  // nothing is read-only correctly leaves the agent with no tools at all, not every tool.
  const available = mcpServerIds.length > 0 ? await gatherAvailableTools(mcpServerIds) : [];
  const readOnly = available.filter((t) => !isSideEffectful(t));
  const withheldTools = available.filter((t) => isSideEffectful(t)).map((t) => t.toolName);
  const allowlist = readOnly.map((t) => t.toolName);

  const view = await startWorkspaceRun({ agentId: agent.id, input, orgId, actorId: "eval", toolAllowlist: allowlist });
  const toolCalls = (view.steps ?? []).filter((s: any) => s?.type === "tool_call").length;

  if (view.pending) {
    // No write tool was ever offered, so a pause here means a policy required human approval even for
    // a read -- treat it as a real failure rather than silently approving on the eval's behalf.
    return { output: "", error: `Run paused for approval on "${view.pending.toolName}"; evals never approve on a human's behalf.`, toolCalls, withheldTools };
  }
  if (view.status !== "completed" || !view.outputSummary) {
    return { output: "", error: view.outputSummary || `Run ended with status "${view.status}"`, toolCalls, withheldTools };
  }
  return { output: view.outputSummary, error: null, toolCalls, withheldTools };
}
