import { z } from "zod";
import type { AstraTool } from "../types";
import { runArtifact, runProof } from "./run-agent";

export const getRunTool: AstraTool<{ runId: string }> = {
  name: "get_run",
  description:
    "Get an agent run's status, answer, the steps it took and whether it is waiting for approval. Payloads are redacted to what the user's role may see.",
  input: z.object({ runId: z.string().min(1).describe("The run's id.") }),
  confirm: false,
  run: async (ctx, input) => {
    const run = await ctx.services.getRunForRole(ctx.orgId, ctx.role, input.runId);
    if (!run) return { payload: { found: false, message: "No run with that id in this organization." } };
    const agent = await ctx.services.getAgent(ctx.orgId, run.agentId);
    const agentName = agent?.name ?? "Agent";
    return {
      payload: {
        found: true,
        runId: run.id,
        agent: { id: run.agentId, name: agentName },
        status: run.status,
        request: run.requestText,
        output: run.outputSummary ? String(run.outputSummary).slice(0, 4000) : null,
        waitingOn: run.pending ? { tool: run.pending.toolName, summary: run.pending.summary } : null,
        steps: (run.steps ?? []).slice(-20).map((s: any) => ({ name: s.name, status: s.status, outcome: s.outcome })),
        costUsd: run.costUsd,
        traceId: run.traceId,
      },
      artifact: runArtifact(run, agentName),
      proof: runProof(run, agent ? { id: agent.id, name: agent.name, description: agent.description ?? null, ontologyTags: agent.ontologyTags } : undefined),
    };
  },
};
