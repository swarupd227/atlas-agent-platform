// Magentic orchestration mode: instead of a human pre-wiring a fixed graph of
// nodes/edges (DAGExecutionEngine's only mode), a manager agent dynamically
// decides, one round at a time, which specialist agent from an open pool
// (agentTeams membership, not a blueprint graph) should act next, based on
// the evolving task state -- until the manager declares the task done or a
// cap is hit. Modeled on Microsoft Agent Framework's Magentic-One pattern.
//
// Reuses existing infrastructure rather than inventing new machinery:
// - completeWithFallback() for the manager's own structured decision calls
//   (no tool-loop needed -- the manager doesn't call tools itself).
// - executeWorkerAgent() to actually run whichever specialist gets picked.
// - dagExecutionRuns for persistence: each round is stored as a synthetic
//   one-node "wave" (waveNumber = round number), so the existing monitor UI
//   and DagExecutionRun schema need no changes.
// - The exact maxTotalCostUsd/maxTotalToolCallsPerRun budget-gate shape
//   already used per-wave in DAGExecutionEngine.execute(), applied per-round.
import { storage } from "./storage";
import { executeWorkerAgent, extractStructuredOutput } from "./agent-runtime";
import { completeWithFallback } from "./llm-provider";
import type { DagExecutionRun } from "@shared/schema";
import type { WaveExecutionResult, NodeExecutionResult } from "./dag-execution-engine";

interface MagenticSpecialist {
  agentId: string;
  name: string;
  description: string;
  role: string;
}

interface MagenticRunSetup {
  dagRun: DagExecutionRun;
  teamAgentId: string;
  managerPrompt: string;
  maxSteps: number;
  maxTotalCostUsd?: number;
  maxTotalToolCallsPerRun?: number;
  members: MagenticSpecialist[];
  request: string;
}

export interface MagenticRunResult {
  dagRunId: string;
  success: boolean;
  finalAnswer: string | null;
  terminationReason: string;
}

interface ManagerDecision {
  action: "delegate" | "finish";
  agentId?: string;
  instructions?: string;
  reasoning?: string;
  finalAnswer?: string;
}

// Looks up the team agent's Magentic config + specialist pool and persists a
// "pending run" row up front -- mirrors setupTeamAgentDagRun's split so a
// caller (the run-magentic route) can hand dagRunId to the client immediately
// rather than waiting for the full (possibly many-round) run to finish.
async function setupMagenticTeamRun(teamAgentId: string, request: string): Promise<MagenticRunSetup> {
  const teamAgent = await storage.getAgent(teamAgentId);
  if (!teamAgent) throw new Error(`Team agent ${teamAgentId} not found`);

  const runtimeConfig = (teamAgent.runtimeConfig as Record<string, any>) || {};
  const orchestration = runtimeConfig.orchestration || {};
  if (orchestration.pattern !== "magentic") {
    throw new Error(`Team agent ${teamAgentId} is not configured for Magentic mode (runtimeConfig.orchestration.pattern !== "magentic")`);
  }
  const magenticConfig = orchestration.magentic || {};

  const memberRows = await storage.getAgentTeamMembers(teamAgentId);
  if (memberRows.length === 0) {
    throw new Error("This Magentic team has no specialist members yet -- add at least one via the Members dialog first");
  }
  const resolved = await Promise.all(memberRows.map(async (m) => {
    const agent = await storage.getAgent(m.memberAgentId);
    if (!agent) return null;
    const specialist: MagenticSpecialist = { agentId: agent.id, name: agent.name, description: agent.description || "", role: m.role || "member" };
    return specialist;
  }));
  const members = resolved.filter((m): m is MagenticSpecialist => !!m);
  if (members.length === 0) {
    throw new Error("This Magentic team's configured members could not be resolved to real agents");
  }

  const managerPrompt: string = typeof magenticConfig.managerPrompt === "string" && magenticConfig.managerPrompt.trim().length > 0
    ? magenticConfig.managerPrompt
    : "Coordinate the specialist agents below to fulfil the user's request as efficiently as possible.";
  const maxSteps = typeof magenticConfig.maxSteps === "number" && magenticConfig.maxSteps > 0 ? Math.floor(magenticConfig.maxSteps) : 8;

  const initialState = { request };
  const dagRun = await storage.createDagExecutionRun({
    teamAgentId,
    pipelineRunId: null,
    pipelineStageId: null,
    executionPlanId: null,
    stateSchemaId: null,
    initialState,
    currentState: initialState,
    finalState: null,
    status: "running",
    currentWave: 0,
    totalWaves: maxSteps,
    startedAt: new Date(),
    waveResults: [],
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCostUsd: 0,
    totalToolCalls: 0,
  });

  return {
    dagRun,
    teamAgentId,
    managerPrompt,
    maxSteps,
    maxTotalCostUsd: typeof runtimeConfig.maxTotalCostUsd === "number" ? runtimeConfig.maxTotalCostUsd : undefined,
    maxTotalToolCallsPerRun: typeof runtimeConfig.maxTotalToolCallsPerRun === "number" ? runtimeConfig.maxTotalToolCallsPerRun : undefined,
    members,
    request,
  };
}

function buildManagerSystemPrompt(managerPrompt: string, members: MagenticSpecialist[]): string {
  const roster = members
    .map((m) => `- id: ${m.agentId} | name: ${m.name} | role: ${m.role}${m.description ? ` | ${m.description}` : ""}`)
    .join("\n");
  return `${managerPrompt}

You are the manager of a team of specialist agents. On each turn, decide which ONE specialist should act next given everything that has happened so far, or declare the task finished.

Available specialists:
${roster}

Respond with ONLY a JSON object, no prose before or after it, in exactly one of these two shapes:
{"action": "delegate", "agentId": "<one of the ids above>", "instructions": "<specific instructions for what this specialist should do right now>", "reasoning": "<brief reason for this choice>"}
{"action": "finish", "finalAnswer": "<the final result to report back to the user>", "reasoning": "<why the task is now complete>"}`;
}

async function getManagerDecision(systemPrompt: string, historyText: string): Promise<{ decision: ManagerDecision; costUsd: number }> {
  const result = await completeWithFallback(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: historyText },
    ],
    { responseFormat: "json", maxTokens: 1000 },
  );
  const parsed = extractStructuredOutput(result.content);
  if (!parsed || (parsed.action !== "delegate" && parsed.action !== "finish")) {
    // Fail closed rather than looping on unparseable manager output: treat it
    // as an immediate finish so the run terminates cleanly with the raw text
    // preserved for diagnosis, instead of retrying indefinitely.
    return {
      decision: { action: "finish", finalAnswer: `Manager produced an unparseable decision and the run was stopped. Raw output: ${result.content.slice(0, 500)}` },
      costUsd: result.costUsd,
    };
  }
  return { decision: parsed as ManagerDecision, costUsd: result.costUsd };
}

// Drives the manager round-loop against an already-persisted run row,
// keeping currentWave/currentState/waveResults live in the DB as it goes,
// then writes the final status/state -- same shape as executeTeamAgentDagRun.
async function executeMagenticTeamRun(setup: MagenticRunSetup): Promise<MagenticRunResult> {
  const { dagRun, teamAgentId, managerPrompt, maxSteps, maxTotalCostUsd, maxTotalToolCallsPerRun, members, request } = setup;
  const systemPrompt = buildManagerSystemPrompt(managerPrompt, members);

  const state: Record<string, any> = { request };
  const waveResults: WaveExecutionResult[] = [];
  let totalCostUsd = 0;
  let totalToolCalls = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let success = true;
  let finalAnswer: string | null = null;
  let terminationReason = "max_steps_reached";
  let lastAgentId: string | null = null;
  let stallStreak = 0;
  let historyText = `User request: ${request}\n\n(No specialists have acted yet.)`;

  try {
    for (let round = 1; round <= maxSteps; round++) {
      const roundStart = Date.now();
      const { decision, costUsd: managerCostUsd } = await getManagerDecision(systemPrompt, historyText);
      totalCostUsd += managerCostUsd;

      if (decision.action === "finish") {
        finalAnswer = decision.finalAnswer || "Task marked complete by manager.";
        terminationReason = "manager_finished";
        break;
      }

      const specialist = members.find((m) => m.agentId === decision.agentId);
      if (!specialist) {
        const nr: NodeExecutionResult = {
          nodeId: `step-${round}`,
          agentId: decision.agentId || "",
          status: "failed",
          output: { managerReasoning: decision.reasoning || "" },
          error: `Manager selected an unknown specialist id "${decision.agentId}"`,
          durationMs: Date.now() - roundStart,
          promptTokens: 0,
          completionTokens: 0,
          traceId: "",
        };
        waveResults.push({ waveNumber: round, startedAt: new Date(roundStart).toISOString(), completedAt: new Date().toISOString(), durationMs: nr.durationMs, nodes: [nr] });
        historyText += `\n\nRound ${round}: manager tried to delegate to unknown specialist id "${decision.agentId}" -- ignored, try again.`;
        await storage.updateDagExecutionRun(dagRun.id, { status: "running", currentWave: round, currentState: state, waveResults: waveResults as any, totalCostUsd, totalToolCalls, totalPromptTokens, totalCompletionTokens });
        continue;
      }

      const mockTeamAgent = {
        deploymentId: undefined,
        agentId: "__magentic_orchestrator__",
        agentName: "Magentic Manager",
        mcpServerIds: [],
        intervalMs: 0,
        prompt: decision.instructions || request,
        agentType: "team" as const,
        runtimeConfig: {},
      };
      const contextInput = decision.instructions || request;
      const workerResult = await executeWorkerAgent(specialist.agentId, mockTeamAgent as any, contextInput, round);
      const durationMs = Date.now() - roundStart;

      totalPromptTokens += workerResult.promptTokens || 0;
      totalCompletionTokens += workerResult.completionTokens || 0;
      totalCostUsd += workerResult.costUsd || 0;
      totalToolCalls += workerResult.toolCallCount || 0;

      // Merge the specialist's structured output into the running flat
      // state, mirroring buildPipelineState's parse-or-fallback-to-text style.
      const parsed = workerResult.output ? extractStructuredOutput(workerResult.output) : null;
      const newKeys: string[] = [];
      if (parsed) {
        for (const [k, v] of Object.entries(parsed)) {
          if (!(k in state)) newKeys.push(k);
          state[k] = v;
        }
      }
      const producedNewState = newKeys.length > 0;
      const stateKey = `specialist_${specialist.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_round_${round}`;
      state[stateKey] = workerResult.output;
      newKeys.push(stateKey);

      const nr: NodeExecutionResult = {
        nodeId: `step-${round}`,
        agentId: specialist.agentId,
        status: workerResult.success ? "completed" : "failed",
        output: { managerReasoning: decision.reasoning || "", selectedAgentName: specialist.name, specialistOutput: workerResult.output },
        error: workerResult.success ? undefined : (workerResult.step?.error || "Specialist execution failed"),
        durationMs,
        promptTokens: workerResult.promptTokens || 0,
        completionTokens: workerResult.completionTokens || 0,
        costUsd: workerResult.costUsd || 0,
        toolCallCount: workerResult.toolCallCount || 0,
        traceId: "",
      };
      waveResults.push({ waveNumber: round, startedAt: new Date(roundStart).toISOString(), completedAt: new Date().toISOString(), durationMs, nodes: [nr] });

      const outputPreview = typeof workerResult.output === "string" ? workerResult.output.slice(0, 1000) : JSON.stringify(workerResult.output).slice(0, 1000);
      historyText += `\n\nRound ${round}: delegated to "${specialist.name}" with instructions: "${contextInput}"\nResult (${nr.status}): ${outputPreview}`;

      // Stall detection: the same specialist picked twice in a row while
      // writing no new state means the manager is spinning, not progressing.
      if (specialist.agentId === lastAgentId && !producedNewState) {
        stallStreak++;
      } else {
        stallStreak = 0;
      }
      lastAgentId = specialist.agentId;

      await storage.updateDagExecutionRun(dagRun.id, { status: "running", currentWave: round, currentState: state, waveResults: waveResults as any, totalCostUsd, totalToolCalls, totalPromptTokens, totalCompletionTokens });

      if (stallStreak >= 2) {
        success = false;
        terminationReason = "stalled_no_progress";
        storage.createAuditEvent({
          actorType: "system",
          actorId: "magentic-stall-detector",
          action: "magentic_run_stalled",
          objectType: "agent",
          objectId: teamAgentId,
          details: JSON.stringify({ reason: `Specialist "${specialist.name}" was picked repeatedly with no new state written`, round }),
        }).catch(() => {});
        break;
      }

      // Aggregate run-level budget gate -- identical shape to
      // DAGExecutionEngine.execute()'s per-wave check, applied per-round.
      let budgetBreach: string | null = null;
      if (typeof maxTotalCostUsd === "number" && totalCostUsd >= maxTotalCostUsd) {
        budgetBreach = `Run-level cost budget exceeded: $${totalCostUsd.toFixed(4)} >= $${maxTotalCostUsd} for team agent ${teamAgentId}`;
      } else if (typeof maxTotalToolCallsPerRun === "number" && totalToolCalls >= maxTotalToolCallsPerRun) {
        budgetBreach = `Run-level tool-call budget exceeded: ${totalToolCalls} >= ${maxTotalToolCallsPerRun} for team agent ${teamAgentId}`;
      }
      if (budgetBreach) {
        storage.createAuditEvent({
          actorType: "system",
          actorId: "magentic-run-budget-gate",
          action: "magentic_run_throttled_budget_exceeded",
          objectType: "agent",
          objectId: teamAgentId,
          details: JSON.stringify({ reason: budgetBreach, maxTotalCostUsd, maxTotalToolCallsPerRun, totalCostUsd, totalToolCalls, round }),
        }).catch(() => {});
        success = false;
        terminationReason = "budget_exceeded";
        break;
      }
    }

    const finalState = finalAnswer ? { ...state, finalAnswer } : state;
    await storage.updateDagExecutionRun(dagRun.id, {
      status: success ? "completed" : "failed",
      finalState,
      currentState: finalState,
      waveResults: waveResults as any,
      totalPromptTokens,
      totalCompletionTokens,
      totalCostUsd,
      totalToolCalls,
      error: success ? null : terminationReason,
      completedAt: new Date(),
    });

    return { dagRunId: dagRun.id, success, finalAnswer, terminationReason };
  } catch (execErr: any) {
    await storage.updateDagExecutionRun(dagRun.id, {
      status: "failed",
      error: execErr.message,
      waveResults: waveResults as any,
      completedAt: new Date(),
    });
    throw execErr;
  }
}

// Awaited variant -- returns once the full run (all rounds) has finished.
export async function runMagenticTeamAgent(teamAgentId: string, request: string): Promise<MagenticRunResult> {
  const setup = await setupMagenticTeamRun(teamAgentId, request);
  return executeMagenticTeamRun(setup);
}

// Fire-and-forget variant -- returns as soon as the run row exists, matching
// startTeamAgentDagRun's shape so POST /api/team-agents/:id/run-magentic can
// hand dagRunId to the client immediately and let it poll for progress.
export async function startMagenticTeamAgent(teamAgentId: string, request: string): Promise<{ dagRunId: string }> {
  const setup = await setupMagenticTeamRun(teamAgentId, request);
  executeMagenticTeamRun(setup).catch((err) => {
    console.error(`[magentic-run] ${setup.dagRun.id} failed:`, err.message);
  });
  return { dagRunId: setup.dagRun.id };
}
