import { z } from "zod";
import type { AstraTool, AstraToolContext, ConfirmPreview, ProofEnvelope } from "../types";
import { resolveAgentRef } from "./refs";

/**
 * Evaluation studio pack, over Eval Studio (organization-scoped): list an
 * agent's datasets and runs, run an evaluation and follow it, compare with the
 * previous run, explain failed cases from the judge's own reasoning.
 */

const PACK = "evaluation";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 1000) / 10}%`);

async function resolveDataset(ctx: AstraToolContext, agentId: string | undefined, ref: string): Promise<{ dataset: any } | { refuse: string }> {
  const all: any[] = await ctx.services.listEvalDatasets(ctx.orgId, undefined);
  const byId = all.find((d) => d.id === ref);
  if (byId) return { dataset: byId };
  const needle = ref.trim().toLowerCase();
  const pool = agentId ? all.filter((d) => !d.agentId || d.agentId === agentId) : all;
  const matches = pool.filter((d) => d.name.toLowerCase() === needle).length ? pool.filter((d) => d.name.toLowerCase() === needle) : pool.filter((d) => d.name.toLowerCase().includes(needle));
  if (matches.length === 1) return { dataset: matches[0] };
  if (matches.length === 0) return { refuse: `No eval dataset named "${ref}" in this organization${agentId ? " for that agent" : ""}.` };
  return { refuse: `Several datasets match "${ref}": ${matches.slice(0, 6).map((d) => `${d.name} (${d.id})`).join("; ")}. Say which one.` };
}

const runProof = (run: any): Partial<ProofEnvelope> =>
  run.passRate != null
    ? { compliance: { status: "measured", summary: `Pass rate ${pct(run.passRate)} · ${run.passed}/${run.totalGoldens} cases${run.gate ? ` · ${run.gate}` : ""}` } }
    : { compliance: { status: "not_measured", reason: `The run is ${run.status}; no pass rate yet.` } };

export const listEvalDatasetsTool: AstraTool<{ agent?: string }> = {
  name: "list_eval_datasets",
  description: "List the organization's eval datasets (golden cases), optionally those for one agent, with how many cases each has.",
  input: z.object({ agent: z.string().optional().describe("The agent's id or name.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    let agentId: string | undefined;
    if (input.agent) {
      const ref = await resolveAgentRef(ctx, input.agent);
      if ("refuse" in ref) throw new Error(ref.refuse);
      agentId = ref.item.id;
    }
    const datasets = await ctx.services.listEvalDatasets(ctx.orgId, agentId);
    return { payload: { total: datasets.length, datasets: datasets.slice(0, 30) }, proof: { compliance: { status: "measured", summary: `${datasets.length} datasets` } } };
  },
};

export const listEvalRunsTool: AstraTool<{ agent: string }> = {
  name: "list_eval_runs",
  description: "An agent's most recent eval runs: status, pass rate, gate result.",
  input: z.object({ agent: z.string().min(1).describe("The agent's id or name.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ref = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in ref) throw new Error(ref.refuse);
    const runs = await ctx.services.listEvalRuns(ctx.orgId, ref.item.id);
    return { payload: { agent: { id: ref.item.id, name: ref.item.name }, runs }, proof: { compliance: { status: "measured", summary: `${runs.length} recent runs` } } };
  },
};

export const getEvalRunTool: AstraTool<{ run: string }> = {
  name: "get_eval_run",
  description: "One eval run: status, case counts, pass rate, gate result and pass rate per metric.",
  input: z.object({ run: z.string().min(1).describe("The eval run's id.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.getEvalRunSummary(ctx.orgId, input.run);
    if (!r) throw new Error("No eval run with that id in this organization.");
    return {
      payload: r,
      artifact: { kind: "evalRun", title: `Eval run${r.agent ? ` · ${r.agent.name}` : ""}`, props: r, fullViewHref: `/evals/runs/${r.run.id}` },
      proof: runProof(r.run),
    };
  },
};

export const runEvalTool: AstraTool<{ agent: string; dataset: string }> = {
  name: "run_eval",
  description: "Run an agent's evaluation on one eval dataset and follow it: each case calls the agent and then a judge model per metric. Progress is narrated; if it takes longer than a few minutes, the run carries on and get_eval_run shows the result later.",
  input: z.object({
    agent: z.string().min(1).describe("The agent's id or name."),
    dataset: z.string().min(1).describe("The eval dataset's id or name."),
  }),
  permission: "create_modify_blueprints",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const agent = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in agent) return agent;
    const ds = await resolveDataset(ctx, agent.item.id, input.dataset);
    if ("refuse" in ds) return ds;
    if (!ds.dataset.goldenCount) return { refuse: `The dataset ${ds.dataset.name} has no cases to run.` };
    return {
      summary: `Run ${agent.item.name}'s evaluation on ${ds.dataset.name}`,
      details: [
        `${ds.dataset.goldenCount} cases. Each one calls ${agent.item.name}, then a judge model scores every metric, so the run uses model calls for both (the cost isn't estimated in advance).`,
        "The result is compared with the agent's previous completed run; a drop beyond the gate's window fails the gate.",
        "Recorded in the audit trail.",
      ],
      frozen: { agentId: agent.item.id, datasetId: ds.dataset.id, cases: ds.dataset.goldenCount },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { agentId: string; datasetId: string } | undefined;
    if (!f) throw new Error("Running an evaluation needs the confirmation card.");
    const actor = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const started = await ctx.services.startEvalRunAs(ctx.orgId, f.agentId, f.datasetId, actor);
    ctx.onProgress?.({ type: "working", label: "Evaluation queued" });
    const final = await ctx.services.watchEvalRun(ctx.orgId, started.id, (label: string) => ctx.onProgress?.({ type: "working", label }));
    return {
      payload: {
        runId: started.id,
        finished: final.finished,
        status: final.status,
        passRate: final.passRate,
        passed: final.passed,
        failed: final.failed,
        totalGoldens: final.totalGoldens,
        gate: final.gate,
        ...(final.finished ? {} : { note: "Still running. get_eval_run shows the result when it finishes." }),
      },
      proof: runProof(final),
    };
  },
};

export const compareEvalRunsTool: AstraTool<{ run: string; against?: string }> = {
  name: "compare_eval_runs",
  description: "Compare an eval run with the agent's previous completed run (the same baseline the regression gate uses) or a named run: pass-rate change, change per metric, and whether it's a regression.",
  input: z.object({ run: z.string().min(1), against: z.string().optional().describe("Another run's id; default the previous completed run.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.compareEvalRuns(ctx.orgId, input.run, input.against);
    if (!r) throw new Error("No eval run with that id in this organization.");
    if (!r.baseline) {
      return { payload: { run: r.run, baseline: null, message: "There's no earlier completed run for this agent to compare with." }, proof: { compliance: { status: "not_measured", reason: "No baseline run." } } };
    }
    return {
      payload: r,
      artifact: { kind: "evalCompare", title: "Eval comparison", props: r, fullViewHref: `/evals/runs/${r.run.id}` },
      proof: { compliance: { status: "measured", summary: `${r.passRateDeltaPct != null && r.passRateDeltaPct >= 0 ? "+" : ""}${r.passRateDeltaPct ?? "—"} pp vs previous run${r.regressed ? " · regression" : ""}` } },
    };
  },
};

export const explainEvalFailuresTool: AstraTool<{ run: string }> = {
  name: "explain_eval_failures",
  description: "The failed cases of an eval run with the judge's reasoning for each metric, the input and the expected output. Summarise from these; don't speculate beyond them.",
  input: z.object({ run: z.string().min(1).describe("The eval run's id.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.evalFailures(ctx.orgId, input.run);
    if (!r) throw new Error("No eval run with that id in this organization.");
    return {
      payload: r,
      artifact: { kind: "evalFailures", title: "Failed cases", props: r, fullViewHref: `/evals/runs/${r.run.id}` },
      proof: { compliance: { status: "measured", summary: `${r.shown} of ${r.failedTotal} failed cases, with judge reasoning` } },
    };
  },
};

export const EVALUATION_TOOLS = [listEvalDatasetsTool, listEvalRunsTool, getEvalRunTool, runEvalTool, compareEvalRunsTool, explainEvalFailuresTool];
