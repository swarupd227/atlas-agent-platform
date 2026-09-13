import { z } from "zod";
import type { AstraToolContext, AstraTool, ProofEnvelope, ToolRunResult } from "../types";

/**
 * Ask one of the user's agents to do something, as a Workspace run.
 *
 * Astra never calls a connector itself: the agent's run goes through
 * startWorkspaceRun, so every tool call passes the full gate chain (policies,
 * approvals, warrants, rate limits) and the run gets its signed trace. When a
 * gate asks for a human, the Astra turn pauses on a card; Confirm or Not now
 * approves or denies that step of the run, which then carries on.
 */

interface RunnableAgent {
  id: string;
  name: string;
  description: string | null;
  ontologyTags?: Array<{ conceptLabel?: string }>;
}

interface RunView {
  id: string;
  agentId: string;
  status: string;
  requestText: string;
  outputSummary: string | null;
  costUsd: number;
  traceId: string | null;
  pending: null | { approvalId: string | null; summary: string | null; toolName: string; args: Record<string, unknown> };
  steps: Array<{ name?: string; type?: string; status?: string; outcome?: string }>;
}

type Input = { agent: string; request: string };

const MAX_OUTPUT_CHARS = 4000;

function truncate(text: string | null | undefined, max: number): string {
  const t = text ?? "";
  return t.length > max ? `${t.slice(0, max)}… (${t.length - max} more characters in the full run)` : t;
}

function resolveAgent(agents: RunnableAgent[], ref: string): { agent?: RunnableAgent; candidates?: RunnableAgent[] } {
  const byId = agents.find((a) => a.id === ref);
  if (byId) return { agent: byId };
  const needle = ref.trim().toLowerCase();
  const exact = agents.filter((a) => a.name.toLowerCase() === needle);
  if (exact.length === 1) return { agent: exact[0] };
  const partial = exact.length > 1 ? exact : agents.filter((a) => a.name.toLowerCase().includes(needle));
  if (partial.length === 1) return { agent: partial[0] };
  return { candidates: partial };
}

function forwardProgress(ctx: AstraToolContext, agentName: string) {
  return (e: { type: string; [key: string]: any }) => {
    const emit = ctx.onProgress;
    if (!emit) return;
    switch (e.type) {
      case "run_started":
        return emit({ type: "working", label: `${agentName} started` });
      case "planning":
        return emit({ type: "working", label: `${agentName} is working` });
      case "tool_start":
        // Arguments stay in the run's trace, where they are redacted per role.
        return emit({ type: "tool_start", tool: `${agentName} › ${e.tool}`, input: {} });
      case "tool_result":
        return emit({ type: "tool_result", tool: `${agentName} › ${e.tool}`, ok: !!e.ok, preview: String(e.outcome ?? "") });
      case "denied":
        return emit({ type: "tool_result", tool: `${agentName} › ${e.tool}`, ok: false, preview: "denied" });
      case "awaiting_approval":
        return emit({ type: "working", label: `${agentName} needs your approval` });
      case "error":
        return emit({ type: "working", label: `${agentName} hit an error` });
    }
  };
}

export function runArtifact(run: RunView, agentName: string) {
  return {
    kind: "run",
    title: `${agentName} · ${run.status.replace(/_/g, " ")}`,
    props: {
      runId: run.id,
      agentId: run.agentId,
      agentName,
      status: run.status,
      request: run.requestText,
      output: truncate(run.outputSummary, MAX_OUTPUT_CHARS),
      costUsd: run.costUsd,
      traceId: run.traceId,
      steps: run.steps.slice(-20).map((s) => ({ name: s.name, status: s.status, outcome: s.outcome })),
    },
    fullViewHref: run.traceId ? `/traces/${run.traceId}` : "/workspace",
  };
}

export function runProof(run: RunView, agent?: RunnableAgent): Partial<ProofEnvelope> {
  const toolSteps = run.steps.filter((s) => s.type === "tool_call");
  const denied = toolSteps.filter((s) => s.outcome === "denied_by_human").length;
  const concepts = (agent?.ontologyTags ?? []).map((t) => t.conceptLabel).filter(Boolean);
  return {
    compliance: {
      status: "measured",
      summary: `${toolSteps.length} tool ${toolSteps.length === 1 ? "call" : "calls"} through the agent's policy gate${denied ? ` · ${denied} denied` : ""} · ${run.traceId ? "signed trace recorded" : "no trace yet"}`,
    },
    context: { status: "not_measured", reason: "What the agent retrieved isn't recorded for Workspace runs yet." },
    industry: concepts.length > 0
      ? { status: "measured", summary: concepts.slice(0, 4).join(" · ") }
      : { status: "not_measured", reason: "No industry concepts are tagged on this agent." },
  };
}

function outcome(run: RunView, agentName: string, agent?: RunnableAgent, note?: string): ToolRunResult {
  if (run.status === "awaiting_approval" && run.pending) {
    const args = JSON.stringify(run.pending.args ?? {});
    return {
      payload: { runId: run.id, status: run.status, waitingOn: run.pending.toolName },
      needsConfirmation: {
        summary: `${agentName} wants to run ${run.pending.toolName}`,
        details: [
          ...(note ? [note] : []),
          ...(run.pending.summary ? [run.pending.summary] : []),
          `With: ${args.length > 300 ? `${args.slice(0, 300)}…` : args}`,
          "Confirm approves this step of the run; Not now denies it and the agent carries on without it.",
        ],
        frozen: { runId: run.id, approvalId: run.pending.approvalId, agentId: run.agentId, agentName },
      },
    };
  }
  return {
    payload: {
      ran: true,
      runId: run.id,
      agent: { id: run.agentId, name: agentName },
      status: run.status,
      ...(note ? { note } : {}),
      output: truncate(run.outputSummary, MAX_OUTPUT_CHARS),
      costUsd: run.costUsd,
      traceId: run.traceId,
    },
    artifact: runArtifact(run, agentName),
    proof: runProof(run, agent),
  };
}

export const runAgentTool: AstraTool<Input> = {
  name: "run_agent",
  description:
    "Ask one of the user's agents to do a piece of work and wait for its answer. Use it only when the user asks for an agent to do something. The agent runs with its own connectors under its policies; if a step needs approval, the user is asked. Identify the agent by id or name.",
  input: z.object({
    agent: z.string().min(1).describe("The agent's id or name."),
    request: z.string().min(1).max(4000).describe("What to ask the agent, in the user's words."),
  }),
  confirm: false,
  resumesOnDecline: true,
  run: async (ctx, input) => {
    if (ctx.confirmation && ctx.decision) {
      const frozen = ctx.confirmation.frozen as { runId: string; approvalId: string | null; agentId: string; agentName: string };
      const agents: RunnableAgent[] = await ctx.services.listRunnableAgents(ctx.orgId, ctx.role);
      const agent = agents.find((a) => a.id === frozen.agentId);
      const current: RunView | null = await ctx.services.getAgentRun(ctx.orgId, frozen.runId);
      if (!current) throw new Error("That run is no longer available in this organization.");
      if (current.status !== "awaiting_approval" || current.pending?.approvalId !== frozen.approvalId) {
        // Decided elsewhere (My Actions, the Workspace) while the card was open.
        return outcome(current, frozen.agentName, agent, "This step was already decided elsewhere; nothing was sent from here.");
      }
      const run: RunView = await ctx.services.decideAgentRun(
        ctx.orgId,
        ctx.role,
        frozen.runId,
        ctx.decision === "confirmed" ? "approve" : "deny",
        forwardProgress(ctx, frozen.agentName),
      );
      return outcome(run, frozen.agentName, agent, ctx.decision === "declined" ? `You denied ${current.pending?.toolName ?? "the step"}.` : undefined);
    }

    const agents: RunnableAgent[] = await ctx.services.listRunnableAgents(ctx.orgId, ctx.role);
    const { agent, candidates } = resolveAgent(agents, input.agent);
    if (!agent) {
      if (candidates && candidates.length > 1) {
        return { payload: { ran: false, ambiguous: true, candidates: candidates.slice(0, 8).map((a) => ({ id: a.id, name: a.name })) } };
      }
      const existing = await ctx.services.getAgent(ctx.orgId, input.agent);
      return {
        payload: {
          ran: false,
          message: existing
            ? `${existing.name} isn't available to run: it is ${existing.status}, or not offered to the ${ctx.role} role. Only active or deployed agents in the role's audience can run.`
            : "No agent you can run matches that. Use list_agents to see them.",
        },
      };
    }

    const full = await ctx.services.getAgent(ctx.orgId, agent.id);
    if (full?.agentType === "team") {
      return {
        payload: {
          ran: false,
          message: `${agent.name} is a team. Running teams from Astra isn't available yet; open it in the Workspace.`,
          href: "/workspace",
        },
      };
    }

    const run: RunView = await ctx.services.startAgentRun(ctx.orgId, ctx.role, agent.id, input.request, forwardProgress(ctx, agent.name));
    return outcome(run, agent.name, agent);
  },
};
