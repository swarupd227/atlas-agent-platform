/**
 * Agent Workspace — resumable, human-in-the-loop agent runs.
 *
 * This is the engine behind the Workspace consumption surface. It is a real
 * LLM tool-calling loop, but unlike the fire-and-forget engines it can SUSPEND
 * at an approval gate: when a tool requires human approval, the loop persists
 * its full conversation state to `workspace_runs.checkpoint` and returns
 * status `awaiting_approval`. When a human responds, `resumeWorkspaceRun`
 * rehydrates the state and continues exactly where it left off.
 *
 * CONFORMANCE: like every engine, every tool call goes through the shared
 * `dispatchToolCall` — this loop never touches raw MCP execution and never
 * re-implements a gate. It is a third *caller* of the one dispatcher, not a
 * bypass. (tests/engine-parity.test.ts enforces this.)
 *
 * Week-1 scope: single-request runs with multi-tool, multi-iteration loops and
 * one-or-more approval pauses. Live streaming (SSE) and channel delivery are
 * Week 2+. Spans are captured per resume-segment.
 */
import { randomUUID, createHash } from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import { workspaceRuns, type WorkspaceRun } from "@shared/schema";
import { storage } from "./storage";
import { dispatchToolCall, gatherAvailableTools, type AvailableTool } from "./tool-dispatcher";
import { resolvePolicyBundle, buildAgentSystemPrompt, recomputeOutcomeKpis } from "./routes/helpers";
import { getProvider, completeWithFallback, buildCanonicalTools, PRICE_TABLE_VERSION, type LLMMessage } from "./llm-provider";
import { RunSpanCollector } from "./run-spans";
import { canonicalJsonStringify } from "./agent-runtime";
import { runTeamAgentDag, extractFinalOutputText } from "./dag-execution-engine";
import { searchKnowledgeBaseChunks } from "./embeddings";
import type { RoleId } from "./permissions";
import { resolveCodeExecutionAccess, buildCodeExecutionRequestConfig, persistGeneratedFiles } from "./anthropic-code-execution";
import type { Skill } from "@shared/schema";

const MAX_ITERATIONS_DEFAULT = 5;

// The single-agent advance()/finalize() loop below never fed the metering
// pipeline -- Billing reads entirely off outcomeEvents, and this path only
// ever wrote a run_traces record, same gap already fixed for Playground
// (playground.ts) and team/DAG runs (dag-execution-engine.ts). This is the
// single-agent Workspace equivalent, including standalone (no-outcome)
// Process Flow automations, which simply no-op here since they have no
// outcomeId to meter against (test finding TC_ODF_009). Fire-and-forget:
// metering must never break a run result that's already being returned.
async function recordWorkspaceOutcomeEvent(
  agentId: string,
  orgId: string | undefined,
  status: "completed" | "failed",
  costUsd: number,
): Promise<void> {
  try {
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent?.outcomeId) return;
    await storage.createOutcomeEvent({
      organizationId: agent.organizationId ?? undefined,
      outcomeId: agent.outcomeId,
      agentId,
      type: "workspace_run",
      billable: status === "completed",
      excludeReason: status === "failed" ? "run_failed" : undefined,
      unitCount: 1,
      unitValue: costUsd || undefined,
    });
    await recomputeOutcomeKpis(agent.outcomeId, agent.organizationId ?? undefined);
  } catch (err: any) {
    console.error(`[workspace-run] failed to record outcome event for agent ${agentId}:`, err.message);
  }
}

/** Live events streamed to the Workspace so a human watches the agent work. */
export type WorkspaceEvent =
  | { type: "run_started"; runId: string; agentId: string; agentName: string }
  | { type: "planning"; iteration: number }
  | { type: "tool_start"; tool: string; server: string; args: Record<string, any> }
  | { type: "tool_result"; tool: string; outcome: string; ok: boolean; preview: string }
  | { type: "awaiting_approval"; approvalId: string | null; tool: string; summary: string; args: Record<string, any> }
  | { type: "completed"; output: string; costUsd: number; traceId: string | null }
  | { type: "denied"; tool: string }
  | { type: "error"; message: string }
  | { type: "team_progress"; wave: number; totalWaves: number; nodeLabel: string; status: "running" | "completed" | "failed" }
  | { type: "team_awaiting_approval"; wave: number; totalWaves: number; nodeLabel: string; approvalId: string };
export type OnWorkspaceEvent = (e: WorkspaceEvent) => void;
const NOOP: OnWorkspaceEvent = () => {};

interface Checkpoint {
  messages: LLMMessage[];
  iterationsUsed: number;
  steps: any[];
  totalCostUsd: number;
  totalTokens: { prompt: number; completion: number; total: number };
  mcpServerIds: string[];
  industry?: string;
  modelName: string;
  maxIterations: number;
  skillAllowlist: string[] | null;
  // Present only while suspended at an approval gate:
  pendingToolCalls?: Array<{ id: string; name: string; arguments: Record<string, any> }>;
  pendingToolIndex?: number;
  // Anthropic code execution (see server/anthropic-code-execution.ts): the
  // container id is reused across turns so created files / REPL state
  // persist; generatedFileIds accumulates across the whole run.
  containerId?: string;
  generatedFileIds?: string[];
}

export interface WorkspaceRunView {
  id: string;
  agentId: string;
  status: string;
  requestText: string;
  outputSummary: string | null;
  costUsd: number;
  traceId: string | null;
  createdAt: string | null;
  pending: null | {
    approvalId: string | null;
    summary: string | null;
    toolName: string;
    args: Record<string, any>;
  };
  steps: any[];
}

function toolFuncName(idx: number, tool: AvailableTool): string {
  return `mcp_${idx}_${tool.toolName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/** Recompute the (non-serializable) execution context deterministically from
 *  the agent — so a resume rebuilds the exact same tool surface and gates. */
async function buildContext(agentId: string, orgId: string | undefined, mcpServerIds: string[], skillAllowlist: string[] | null) {
  let availableTools = await gatherAvailableTools(mcpServerIds);
  const policyBundle = await resolvePolicyBundle(agentId, orgId);

  if (policyBundle.blockedTools.length > 0) {
    const blocked = new Set(policyBundle.blockedTools.map(t => t.toLowerCase()));
    availableTools = availableTools.filter(t => !blocked.has(t.toolName.toLowerCase()));
  }
  if (policyBundle.toolAllowlist.length > 0) {
    const allow = new Set(policyBundle.toolAllowlist.map(t => t.toLowerCase()));
    availableTools = availableTools.filter(t => allow.has(t.toolName.toLowerCase()));
  }
  if (skillAllowlist) {
    const allow = new Set(skillAllowlist);
    availableTools = availableTools.filter(t => allow.has(t.toolName.toLowerCase()));
  }
  return { availableTools, policyBundle };
}

/** Retrieves the agent's linked KBs, filtered to what the caller's role may
 *  see, and splices matching chunks into the system prompt — the same
 *  context-stuffing pattern agent-runtime.ts's executePromptWithMcp uses.
 *  Never throws: a KB error degrades to "no KB context" rather than failing
 *  the whole run, matching this file's existing non-fatal-trace-write style. */
async function buildSystemMessageWithKbContext(agentId: string, input: string, callerRole: RoleId | undefined, baseSystemMessage: string): Promise<string> {
  try {
    const linkedKbs = await storage.getAgentKnowledgeBases(agentId);
    if (linkedKbs.length === 0) return baseSystemMessage;

    const kbChunks: string[] = [];
    for (const link of linkedKbs.slice(0, 3)) {
      const linkConfig = (link.retrievalConfig as any) || {};
      const topK = typeof linkConfig.topK === "number" ? linkConfig.topK : 5;
      const scoreThreshold = typeof linkConfig.scoreThreshold === "number" ? linkConfig.scoreThreshold : 0.3;
      const chunks = await searchKnowledgeBaseChunks(link.knowledgeBaseId, input, topK, scoreThreshold, callerRole);
      if (chunks.length > 0) {
        kbChunks.push(`--- Knowledge Base: ${link.knowledgeBaseId} ---\n${chunks.map(c => c.content).join("\n\n")}`);
      }
    }
    if (kbChunks.length === 0) return baseSystemMessage;
    return `${baseSystemMessage}\n\n## KNOWLEDGE BASE CONTEXT (retrieved via RAG)\nUse the following domain knowledge to inform your analysis and decisions:\n\n${kbChunks.join("\n\n")}`;
  } catch (e: any) {
    console.error("[workspace-run] KB retrieval failed (non-fatal):", e.message);
    return baseSystemMessage;
  }
}

/** Resolve the skill allowlist for an agent (union of active skills' allowedTools). */
async function resolveSkillAllowlist(agent: any): Promise<string[] | null> {
  try {
    const raw = agent?.preloadedSkills;
    const skillIds: string[] = Array.isArray(raw) ? raw.map((p: any) => p?.skillId).filter(Boolean) : [];
    if (skillIds.length === 0) return null;
    const active = (await storage.getSkillsByIds(skillIds)).filter(s => s.status === "active");
    const allow = new Set<string>();
    let declared = false;
    for (const s of active) {
      const at = (s.allowedTools as string[] | null) || [];
      if (at.length > 0) { declared = true; at.forEach(t => allow.add(t.toLowerCase())); }
    }
    return declared ? Array.from(allow) : null;
  } catch {
    return null;
  }
}

/** Full Skill rows for an agent's active preloaded skills (needed for skillKind/anthropicSkillIds, not just allowedTools). */
async function resolveActiveSkills(agent: any): Promise<Skill[]> {
  try {
    const raw = agent?.preloadedSkills;
    const skillIds: string[] = Array.isArray(raw) ? raw.map((p: any) => p?.skillId).filter(Boolean) : [];
    if (skillIds.length === 0) return [];
    return (await storage.getSkillsByIds(skillIds)).filter(s => s.status === "active");
  } catch {
    return [];
  }
}

function view(run: WorkspaceRun): WorkspaceRunView {
  const cp = (run.checkpoint as Checkpoint | null) ?? null;
  let pending: WorkspaceRunView["pending"] = null;
  if (run.status === "awaiting_approval" && cp?.pendingToolCalls && cp.pendingToolIndex != null) {
    const tc = cp.pendingToolCalls[cp.pendingToolIndex];
    pending = {
      approvalId: run.pendingApprovalId ?? null,
      summary: run.pendingSummary ?? null,
      // Strip the internal mcp_<idx>_ prefix so the UI shows the real tool name.
      toolName: (tc?.name ?? "unknown").replace(/^mcp_\d+_/, ""),
      args: tc?.arguments ?? {},
    };
  }
  return {
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    requestText: run.requestText,
    outputSummary: run.outputSummary ?? null,
    costUsd: run.costUsd ?? 0,
    traceId: run.traceId ?? null,
    createdAt: run.createdAt ? (run.createdAt instanceof Date ? run.createdAt.toISOString() : String(run.createdAt)) : null,
    pending,
    steps: (cp?.steps as any[]) ?? [],
  };
}

/** Start a new Workspace run. Runs until completion or the first approval gate. */
export async function startWorkspaceRun(params: {
  agentId: string;
  input: string;
  orgId?: string;
  actorId?: string;
}, onEvent: OnWorkspaceEvent = NOOP): Promise<WorkspaceRunView> {
  const { agentId, input, orgId, actorId } = params;
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) throw new Error("Agent not found");

  const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
  const isTeamAgent = agent.agentType === "team" && Array.isArray(rtConfig.orchestration?.workerIds) && rtConfig.orchestration.workerIds.length > 0;
  if (isTeamAgent) {
    return runTeamWorkspaceRun(agent, rtConfig, input, orgId, actorId, onEvent);
  }

  const mcpLinks = await storage.getAgentMcpServers(agentId);
  const mcpServerIds = mcpLinks.map((l: any) => l.serverId);
  const skillAllowlist = await resolveSkillAllowlist(agent);
  const baseSystemMessage = buildAgentSystemPrompt(agent);

  // Permissions-aware retrieval: the Workspace is the consumption surface —
  // real employees asking a real agent for work — so it's exactly where a
  // requester's identity should gate what knowledge surfaces. actorId here
  // is the caller's role (server/routes/workspace.ts passes
  // getRequestRole(req)); searchKnowledgeBaseChunks filters by it via
  // canAccessKbSensitivity, same as the agent-runtime.ts engine. Retrieval
  // happens once, from the initial ask, mirroring how a single-turn RAG
  // chat is normally primed — the Workspace loop's later tool-calling
  // iterations don't re-query the KB.
  const systemMessage = await buildSystemMessageWithKbContext(agentId, input, actorId as RoleId | undefined, baseSystemMessage);

  const checkpoint: Checkpoint = {
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: input },
    ],
    iterationsUsed: 0,
    steps: [],
    totalCostUsd: 0,
    totalTokens: { prompt: 0, completion: 0, total: 0 },
    mcpServerIds,
    industry: (agent as any).industry || undefined,
    modelName: agent.modelName || "gpt-4.1",
    maxIterations: (agent as any).maxToolIterations ?? MAX_ITERATIONS_DEFAULT,
    skillAllowlist,
  };

  const [run] = await db.insert(workspaceRuns).values({
    organizationId: orgId ?? undefined,
    agentId,
    status: "running",
    requestText: input,
    actorId: actorId ?? undefined,
    checkpoint: checkpoint as any,
  }).returning();

  onEvent({ type: "run_started", runId: run.id, agentId, agentName: agent.name });
  return advance(run.id, agentId, orgId, undefined, onEvent);
}

/**
 * Team-agent path for the Workspace. The main advance()/resumeWorkspaceRun()
 * loop above is a single-agent, checkpoint-based tool-calling machine --
 * fundamentally different from DAGExecutionEngine's wave-by-wave graph
 * execution (parallel tiers, deterministic/AI conditional edges, worker
 * fan-out). Rather than force those two execution models into one, this
 * calls the SAME runTeamAgentDag() helper POST /api/team-agents/:id/run-dag
 * uses -- so a team agent behaves identically whether it's run from
 * Workspace, the graph editor, or (eventually) a schedule/webhook -- and
 * adapts its result into a WorkspaceRunView so the Workspace UI renders it
 * exactly like any other run -- same answer card, same cost line, same
 * signed-trace record, plus live per-node progress events as each wave runs.
 *
 * Gate nodes create a real row in the `approvals` table and block their wave
 * until a person decides (see DAGExecutionEngine.executeGateNode /
 * waitForApproval) -- unlike the single-agent loop's tool-approval gates,
 * this blocks in-process rather than suspending the workspaceRuns row itself,
 * since runTeamAgentDag() already awaits the whole pipeline synchronously.
 * The onApprovalPending callback below surfaces that wait as a
 * "team_awaiting_approval" event so the live SSE stream doesn't go dark for
 * the (up to 30-minute) duration of the wait.
 */
async function runTeamWorkspaceRun(
  agent: NonNullable<Awaited<ReturnType<typeof storage.getAgent>>>,
  rtConfig: Record<string, any>,
  input: string,
  orgId: string | undefined,
  actorId: string | undefined,
  onEvent: OnWorkspaceEvent,
): Promise<WorkspaceRunView> {
  const agentId = agent.id;
  const mcpLinks = await storage.getAgentMcpServers(agentId);
  const mcpServerIds = mcpLinks.map((l: any) => l.serverId);
  const startMs = Date.now();
  const blueprintId: string | undefined = (agent as any).blueprintId || rtConfig.orchestration?.blueprintId || undefined;

  const [run] = await db.insert(workspaceRuns).values({
    organizationId: orgId ?? undefined,
    agentId,
    status: "running",
    requestText: input,
    actorId: actorId ?? undefined,
    checkpoint: {
      messages: [], iterationsUsed: 0, steps: [], totalCostUsd: 0,
      totalTokens: { prompt: 0, completion: 0, total: 0 },
      mcpServerIds, modelName: agent.modelName || "gpt-4.1",
      maxIterations: (agent as any).maxToolIterations ?? MAX_ITERATIONS_DEFAULT,
      skillAllowlist: null,
    } as any,
  }).returning();

  onEvent({ type: "run_started", runId: run.id, agentId, agentName: agent.name });

  if (!blueprintId) {
    const message = "This team has no blueprint graph to run -- open it in the graph editor first.";
    onEvent({ type: "error", message });
    await db.update(workspaceRuns).set({ status: "failed", outputSummary: message, updatedAt: new Date() }).where(eq(workspaceRuns.id, run.id));
    const [failedRun] = await db.select().from(workspaceRuns).where(eq(workspaceRuns.id, run.id)).limit(1);
    return view(failedRun);
  }

  let dagRunId: string | undefined;
  let output: string;
  let status: "completed" | "failed";
  let waveResultsForTrace: any[] = [];
  let dagResultForProvenance: { totalNodes: number; totalWaves: number } = { totalNodes: 0, totalWaves: 0 };
  // DAGExecutionEngine.execute() already sums each worker node's own costUsd
  // into DAGExecutionResult.totalCostUsd (see dag-execution-engine.ts) -- that
  // real aggregate is captured below instead of being hardcoded to 0. Stays 0
  // only if the pipeline threw before producing a result (cost genuinely
  // unknown in that case).
  let costUsd = 0;

  try {
    const { dagRunId: id, result, wavePlan } = await runTeamAgentDag(agentId, blueprintId, input, {
      errorStrategy: "best_effort",
      onNodeStart: (_nodeId, wave, label, totalWaves) => {
        onEvent({ type: "team_progress", wave, totalWaves, nodeLabel: label, status: "running" });
      },
      onNodeComplete: (_nodeId, wave, label, r, totalWaves) => {
        onEvent({ type: "team_progress", wave, totalWaves, nodeLabel: label, status: r.status === "completed" ? "completed" : "failed" });
      },
      onApprovalPending: (_nodeId, wave, label, totalWaves, approvalId) => {
        onEvent({ type: "team_awaiting_approval", wave, totalWaves, nodeLabel: label, approvalId });
      },
    });
    dagRunId = id;
    output = extractFinalOutputText(result, wavePlan);
    status = result.success ? "completed" : "failed";
    waveResultsForTrace = result.waveResults;
    dagResultForProvenance = { totalNodes: wavePlan.totalNodes, totalWaves: wavePlan.totalWaves };
    costUsd = result.totalCostUsd;
  } catch (execErr: any) {
    output = `Team pipeline failed: ${execErr.message}`;
    status = "failed";
    dagRunId = execErr.dagRunId;
  }

  let traceId: string | null = null;
  try {
    const provenanceSnapshot = {
      engine: "workspace-run-team-dag",
      priceTableVersion: PRICE_TABLE_VERSION,
      dagRunId,
      totalNodes: dagResultForProvenance.totalNodes,
      totalWaves: dagResultForProvenance.totalWaves,
      capturedAt: new Date().toISOString(),
    };
    const provenanceHash = createHash("sha256").update(canonicalJsonStringify(provenanceSnapshot)).digest("hex");
    const trace = await storage.createTrace({
      agentId,
      environment: "workspace",
      status,
      inputSummary: input.slice(0, 500),
      outputSummary: output.slice(0, 500),
      costUsd,
      latencyMs: Date.now() - startMs,
      modelId: agent.modelName || "gpt-4.1",
      stepsJson: waveResultsForTrace as any,
      provenanceSnapshot: provenanceSnapshot as any,
      provenanceHash,
      triggeredBy: "workspace",
      organizationId: orgId ?? undefined,
    } as any);
    traceId = trace.id;
    const auditEvent = await storage.createAuditEvent({
      actorType: "system",
      actorId: "provenance_engine",
      action: "provenance.captured",
      objectType: "run_trace",
      objectId: trace.id,
      organizationId: orgId ?? undefined,
      details: JSON.stringify({ provenanceHash, agentId, engine: "workspace-run-team-dag" }),
    });
    if (auditEvent && auditEvent.id) await storage.updateTrace(trace.id, { auditEventId: auditEvent.id });
  } catch (e: any) {
    console.error("[workspace-run] team trace write failed (non-fatal):", e.message);
  }

  await db.update(workspaceRuns).set({
    status, outputSummary: output.slice(0, 4000), costUsd, traceId: traceId ?? undefined,
    checkpoint: {
      messages: [], iterationsUsed: 0, steps: waveResultsForTrace, totalCostUsd: costUsd,
      totalTokens: { prompt: 0, completion: 0, total: 0 },
      mcpServerIds, modelName: agent.modelName || "gpt-4.1",
      maxIterations: (agent as any).maxToolIterations ?? MAX_ITERATIONS_DEFAULT,
      skillAllowlist: null,
    } as any,
    updatedAt: new Date(),
  }).where(eq(workspaceRuns.id, run.id));

  onEvent({ type: "completed", output, costUsd, traceId });
  const [fresh] = await db.select().from(workspaceRuns).where(eq(workspaceRuns.id, run.id)).limit(1);
  return view(fresh);
}

/** Resume a suspended run after a human decision.
 *  - edits: replacement arguments for the pending tool (approve-with-edits).
 *  - note: the approver's rationale, surfaced to the agent so it reasons with it. */
export async function resumeWorkspaceRun(params: {
  runId: string;
  decision: "approve" | "deny";
  edits?: Record<string, any>;
  note?: string;
  actorId?: string;
  orgId?: string;
}, onEvent: OnWorkspaceEvent = NOOP): Promise<WorkspaceRunView> {
  const { runId, decision, edits, note, actorId, orgId } = params;
  const [run] = await db.select().from(workspaceRuns).where(eq(workspaceRuns.id, runId)).limit(1);
  if (!run) throw new Error("Run not found");
  if (run.status !== "awaiting_approval") throw new Error(`Run is ${run.status}, not awaiting approval`);

  const cp = run.checkpoint as Checkpoint;
  const pendingIdx = cp.pendingToolIndex ?? 0;
  const pendingCall = cp.pendingToolCalls?.[pendingIdx];

  // Approve-with-edits: the human changed the arguments. Swap them in the
  // checkpoint before re-dispatch. The idempotency key (which includes args)
  // changes naturally, and the tool executes with the human's values.
  const edited = decision === "approve" && edits && pendingCall
    && JSON.stringify(edits) !== JSON.stringify(pendingCall.arguments);
  if (edited && pendingCall) pendingCall.arguments = edits!;

  // Record the human's decision as an approval outcome + audit event.
  if (run.pendingApprovalId) {
    await storage.updateApproval(run.pendingApprovalId, {
      status: decision === "approve" ? "approved" : "rejected",
      decidedBy: actorId ?? "workspace-user",
    }).catch(() => {});
  }
  await storage.createAuditEvent({
    actorType: "user",
    actorId: actorId ?? "workspace-user",
    action: decision === "approve" ? (edited ? "workspace_action_approved_edited" : "workspace_action_approved") : "workspace_action_denied",
    objectType: "workspace_run",
    objectId: runId,
    organizationId: run.organizationId ?? undefined,
    details: `${decision === "approve" ? (edited ? "Approved (edited args)" : "Approved") : "Denied"} tool "${pendingCall?.name ?? "unknown"}" in workspace run ${runId}.${note ? ` Note: ${note}` : ""}`,
  }).catch(() => {});

  if (decision === "deny") {
    // Push a denial result (with the approver's reason) so the agent adapts.
    cp.messages.push({ role: "tool", content: JSON.stringify({ error: "Action denied by approver", denied: true, ...(note ? { approverNote: note } : {}) }), tool_call_id: pendingCall?.id } as any);
    cp.steps.push({ id: `step_${cp.steps.length + 1}`, name: `Denied: ${pendingCall?.name}`, type: "tool_call", status: "failed", outcome: "denied_by_human", output: { denied: true, note }, completedAt: new Date().toISOString() });
    // Advance the pending pointer past the denied tool.
    cp.pendingToolIndex = pendingIdx + 1;
    onEvent({ type: "denied", tool: (pendingCall?.name ?? "unknown").replace(/^mcp_\d+_/, "") });
    await db.update(workspaceRuns).set({ checkpoint: cp as any, status: "running", pendingApprovalId: null, pendingSummary: null, updatedAt: new Date() }).where(eq(workspaceRuns.id, runId));
    return advance(runId, run.agentId, run.organizationId ?? undefined, undefined, onEvent);
  }

  // Approve: persist any edited args, clear pending, advance with a one-shot
  // approval override + the approver note for the pending tool.
  await db.update(workspaceRuns).set({ checkpoint: cp as any, status: "running", updatedAt: new Date() }).where(eq(workspaceRuns.id, runId));
  return advance(runId, run.agentId, run.organizationId ?? undefined, run.pendingApprovalId ?? "approved", onEvent, note);
}

export async function getWorkspaceRun(runId: string, orgId?: string): Promise<WorkspaceRunView | null> {
  const [run] = await db.select().from(workspaceRuns).where(eq(workspaceRuns.id, runId)).limit(1);
  if (!run) return null;
  if (orgId && run.organizationId && run.organizationId !== orgId) return null;
  return view(run);
}

/** "My Work" — the caller's own runs (scoped by actor and org), newest first. */
export async function listWorkspaceRuns(orgId?: string, actorId?: string, limit = 50): Promise<WorkspaceRunView[]> {
  const rows = await db.select().from(workspaceRuns).orderBy(desc(workspaceRuns.createdAt)).limit(400);
  return rows
    .filter(r => !orgId || !r.organizationId || r.organizationId === orgId)
    .filter(r => !actorId || !r.actorId || r.actorId === actorId)
    .slice(0, limit)
    .map(view);
}

// Only runnable agents are offered in the Workspace — not drafts, archived,
// or retired ones. An end user should only ever be handed a live agent.
const WORKSPACE_RUNNABLE_STATUSES = new Set(["active", "deployed"]);

/**
 * Agents the caller may USE in the Workspace. Access rules:
 *  - only runnable (active/deployed) agents are shown;
 *  - full-access roles (admin) see every runnable agent;
 *  - others see agents whose workspaceAudience is empty (public) OR includes
 *    their role.
 *  - internal workers that belong to a team blueprint (e.g. "Manager Approval
 *    Agent" inside an expense-approval team) are excluded — a business user
 *    should address the team's orchestrator, not its implementation-detail
 *    sub-agents (UX audit F-4).
 */
export async function getWorkspaceAgents(orgId: string | undefined, role: string): Promise<Array<{ id: string; name: string; description: string | null; riskTier: string }>> {
  const all = await storage.getAgents(orgId);
  const isFullAccess = role === "admin";

  const teamAgents = all.filter(a => a.agentType === "team" && !!(a as any).blueprintId);
  const subWorkerIds = new Set<string>();
  for (const teamAgent of teamAgents) {
    const nodes = await storage.getTeamBlueprintNodes((teamAgent as any).blueprintId);
    for (const node of nodes) {
      if (node.refAgentId && node.refAgentId !== teamAgent.id) subWorkerIds.add(node.refAgentId);
    }
  }

  return all
    .filter(a => WORKSPACE_RUNNABLE_STATUSES.has(a.status))
    .filter(a => !subWorkerIds.has(a.id))
    .filter(a => {
      if (isFullAccess) return true;
      const audience = ((a as any).workspaceAudience as string[] | null) ?? [];
      return audience.length === 0 || audience.includes(role);
    })
    .map(a => ({ id: a.id, name: a.name, description: a.description ?? null, riskTier: a.riskTier }));
}

/**
 * The resumable loop. Runs from the persisted checkpoint until the run
 * completes or the next approval gate. `approvedApprovalId`, when present,
 * satisfies the require-approval gate for the ONE pending tool at
 * checkpoint.pendingToolIndex.
 */
async function advance(runId: string, agentId: string, orgId: string | undefined, approvedApprovalId: string | undefined, onEvent: OnWorkspaceEvent = NOOP, humanNote?: string): Promise<WorkspaceRunView> {
  const startMs = Date.now();
  const [runRow] = await db.select().from(workspaceRuns).where(eq(workspaceRuns.id, runId)).limit(1);
  if (!runRow) throw new Error("Run not found");
  const cp = runRow.checkpoint as Checkpoint;

  const { availableTools, policyBundle } = await buildContext(agentId, orgId, cp.mcpServerIds, cp.skillAllowlist);
  const canonicalTools = buildCanonicalTools(availableTools);
  const agentRow = await storage.getAgent(agentId, orgId);
  const activeSkills = await resolveActiveSkills(agentRow);
  const codeExecAccess = await resolveCodeExecutionAccess(agentId, activeSkills);
  const codeExecConfig = codeExecAccess.enabled ? buildCodeExecutionRequestConfig(activeSkills, cp.containerId) : null;
  const provider = getProvider(cp.modelName.startsWith("claude") ? "anthropic" : "openai");
  const fallback = getProvider(provider.providerName === "openai" ? "anthropic" : "openai");
  const spans = new RunSpanCollector();
  const runSpanId = spans.start(`workspace-run ${agentId}`, "run", null, { agentId, engine: "workspace-run" });
  // The override applies only to the tool that was awaiting approval.
  const overrideIndex = approvedApprovalId != null ? (cp.pendingToolIndex ?? 0) : -1;

  const persist = async (patch: Partial<typeof workspaceRuns.$inferInsert>) => {
    await db.update(workspaceRuns).set({ checkpoint: cp as any, updatedAt: new Date(), ...patch }).where(eq(workspaceRuns.id, runId));
  };

  const finalize = async (output: string, status: "completed" | "failed") => {
    spans.end(runSpanId, status === "completed" ? "ok" : "error", { "run.cost_usd": cp.totalCostUsd });
    const cost = Math.round(cp.totalCostUsd * 100000) / 100000;
    // Signed run trace — the same accountable, auditable record every run gets.
    // provenanceHash + the linked provenance.captured audit event are what let
    // the trace-detail page render "Verified" instead of "Unverified" — mirrors
    // the pattern in agent-runtime.ts so a Workspace run is provably the same
    // kind of accountable record as a scheduled/runtime run, not a lesser one.
    let traceId: string | null = null;
    try {
      const provenanceSnapshot = {
        engine: "workspace-run",
        priceTableVersion: PRICE_TABLE_VERSION,
        policySnapshot: policyBundle.appliedPolicies,
        toolsUsed: cp.steps
          .filter((s: any) => s.type === "tool_call" && s.status === "completed")
          .map((s: any) => s.name),
        modelName: cp.modelName,
        iterationsUsed: cp.iterationsUsed,
        capturedAt: new Date().toISOString(),
      };
      const provenanceHash = createHash("sha256")
        .update(canonicalJsonStringify(provenanceSnapshot))
        .digest("hex");

      const trace = await storage.createTrace({
        agentId,
        environment: "workspace",
        status,
        inputSummary: runRow.requestText.slice(0, 500),
        outputSummary: output.slice(0, 500),
        costUsd: Math.round(cp.totalCostUsd * 100000) / 100000,
        latencyMs: Date.now() - startMs,
        modelId: cp.modelName,
        tokenUsage: cp.totalTokens as any,
        stepsJson: cp.steps as any,
        spansJson: spans.toJSON() as any,
        provenanceSnapshot: provenanceSnapshot as any,
        provenanceHash,
        triggeredBy: "workspace",
        organizationId: orgId ?? undefined,
        policyChecks: policyBundle.appliedPolicies as any,
      } as any);
      traceId = trace.id;

      const auditEvent = await storage.createAuditEvent({
        actorType: "system",
        actorId: "provenance_engine",
        action: "provenance.captured",
        objectType: "run_trace",
        objectId: trace.id,
        organizationId: orgId ?? undefined,
        details: JSON.stringify({
          provenanceHash,
          agentId,
          engine: "workspace-run",
          policyCount: (provenanceSnapshot.policySnapshot || []).length,
          toolCount: provenanceSnapshot.toolsUsed.length,
        }),
      });
      if (auditEvent && auditEvent.id) {
        await storage.updateTrace(trace.id, { auditEventId: auditEvent.id });
      }
    } catch (e: any) {
      console.error("[workspace-run] trace write failed (non-fatal):", e.message);
    }
    await recordWorkspaceOutcomeEvent(agentId, orgId, status, cost);
    delete cp.pendingToolCalls; delete cp.pendingToolIndex;
    await persist({ status, outputSummary: output.slice(0, 4000), costUsd: cost, traceId: traceId ?? undefined, pendingApprovalId: null, pendingSummary: null });
    onEvent({ type: "completed", output, costUsd: cost, traceId });
    const [fresh] = await db.select().from(workspaceRuns).where(eq(workspaceRuns.id, runId)).limit(1);
    return view(fresh);
  };

  // Main loop.
  // Guard against runaway loops beyond the agent's iteration budget.
  for (let guard = 0; guard < cp.maxIterations + 2; guard++) {
    // 1. Get (or resume) the current batch of tool calls.
    if (!cp.pendingToolCalls) {
      if (cp.iterationsUsed >= cp.maxIterations) {
        return finalize("Reached the maximum number of tool steps for this request.", "completed");
      }
      onEvent({ type: "planning", iteration: cp.iterationsUsed + 1 });
      const llm = await completeWithFallback(
        cp.messages,
        {
          model: cp.modelName,
          tools: canonicalTools.length > 0 ? canonicalTools : undefined,
          maxTokens: 4096,
          ...(codeExecConfig ?? {}),
        },
        [provider, fallback],
      );
      cp.totalCostUsd += llm.costUsd;
      cp.totalTokens.prompt += llm.tokensUsed.prompt;
      cp.totalTokens.completion += llm.tokensUsed.completion;
      cp.totalTokens.total += llm.tokensUsed.total;

      if (llm.containerId) cp.containerId = llm.containerId;
      if (llm.generatedFiles?.length) {
        await persistGeneratedFiles(llm.generatedFiles, { organizationId: orgId ?? null, agentId, workspaceRunId: runId });
        cp.generatedFileIds = [...(cp.generatedFileIds ?? []), ...llm.generatedFiles.map(f => f.fileId)];
      }

      if (!llm.toolCalls || llm.toolCalls.length === 0) {
        return finalize(llm.content || "Done.", "completed");
      }
      cp.iterationsUsed++;
      cp.messages.push({ role: "assistant", content: llm.content || "", tool_calls: llm.toolCalls } as any);
      cp.pendingToolCalls = llm.toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments || {} }));
      cp.pendingToolIndex = 0;
    }

    // 2. Execute pending tool calls from the current index. Pause on the first
    //    tool that requires approval (unless it is the just-approved one).
    const pending = cp.pendingToolCalls!;
    let i = cp.pendingToolIndex ?? 0;
    for (; i < pending.length; i++) {
      const tc = pending[i];
      const idx = availableTools.findIndex((_, k) => toolFuncName(k, availableTools[k]) === tc.name);
      const matched = idx >= 0 ? availableTools[idx] : null;

      if (!matched) {
        cp.messages.push({ role: "tool", content: JSON.stringify({ error: `Tool "${tc.name}" is not available` }), tool_call_id: tc.id } as any);
        cp.steps.push({ id: `step_${cp.steps.length + 1}`, name: `Unresolved: ${tc.name}`, type: "tool_call", status: "failed", outcome: "tool_unresolved", completedAt: new Date().toISOString() });
        continue;
      }

      onEvent({ type: "tool_start", tool: matched.toolName, server: matched.serverName, args: tc.arguments });
      const stepSpan = spans.start(`step ${matched.toolName}`, "step", runSpanId, { "tool.name": matched.toolName });
      const dispatch = await dispatchToolCall({
        agentId,
        orgId,
        tool: matched,
        args: tc.arguments,
        policyBundle,
        skillAllowlist: cp.skillAllowlist ? new Set(cp.skillAllowlist) : null,
        idempotencyScope: runId,
        spanCollector: spans,
        parentSpanId: stepSpan,
        ...(i === overrideIndex && approvedApprovalId ? { humanApprovedApprovalId: approvedApprovalId } : {}),
      });
      spans.end(stepSpan, dispatch.ok ? "ok" : "error", { "dispatch.outcome": dispatch.outcome });

      if (dispatch.outcome === "gate_requires_approval") {
        // PAUSE. The dispatcher already created the approval record.
        cp.pendingToolIndex = i;
        const summary = `Wants to run "${matched.toolName}" — ${JSON.stringify(dispatch.redactedArgs).slice(0, 240)}`;
        await persist({ status: "awaiting_approval", pendingApprovalId: dispatch.approvalId ?? undefined, pendingSummary: summary });
        onEvent({ type: "awaiting_approval", approvalId: dispatch.approvalId ?? null, tool: matched.toolName, summary, args: dispatch.redactedArgs });
        const [fresh] = await db.select().from(workspaceRuns).where(eq(workspaceRuns.id, runId)).limit(1);
        return view(fresh);
      }

      const ok = dispatch.ok || dispatch.outcome === "shadow_skipped";
      // Surface the approver's note to the agent alongside the result of the
      // tool they approved, so downstream reasoning accounts for it.
      let resultPayload: unknown = ok ? dispatch.result : { error: dispatch.error, outcome: dispatch.outcome };
      if (humanNote && i === overrideIndex) {
        resultPayload = (resultPayload && typeof resultPayload === "object" && !Array.isArray(resultPayload))
          ? { ...(resultPayload as Record<string, unknown>), approverNote: humanNote }
          : { result: resultPayload, approverNote: humanNote };
      }
      onEvent({ type: "tool_result", tool: matched.toolName, outcome: dispatch.outcome, ok, preview: JSON.stringify(resultPayload).slice(0, 200) });
      cp.messages.push({ role: "tool", content: JSON.stringify(resultPayload), tool_call_id: tc.id } as any);
      cp.steps.push({
        id: `step_${cp.steps.length + 1}`,
        name: `${matched.serverName}: ${matched.toolName}`,
        type: "tool_call",
        status: ok ? "completed" : (dispatch.outcome === "tool_error" ? "failed" : "blocked"),
        outcome: dispatch.outcome,
        toolName: matched.toolName,
        input: dispatch.redactedArgs,
        output: ok ? dispatch.result : { error: dispatch.error },
        latencyMs: dispatch.durationMs,
        completedAt: new Date().toISOString(),
      });
    }

    // 3. All pending tools resolved — clear and loop for the next LLM turn.
    delete cp.pendingToolCalls;
    cp.pendingToolIndex = 0;
    await persist({ status: "running" });
  }

  return finalize("Reached the maximum number of tool steps for this request.", "completed");
}
