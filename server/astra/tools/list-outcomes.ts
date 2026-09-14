import { z } from "zod";
import type { AstraTool, ProofEnvelope } from "../types";

/**
 * The organization's outcomes with their KPIs. A KPI's current value is only
 * reported together with where it came from; values with no recorded source
 * are reported as not measured.
 */

type Input = { status?: string; search?: string };

interface OutcomeRow {
  id: string;
  name: string;
  status: string;
  riskTier: string;
  pendingReviewApprovalId: string | null;
  agentCount: number;
  kpis: Array<{ name: string; unit: string; target: number; targetOperator: string | null; baseline: number | null; current: { value: number | null; source: string; updatedAt: string | null } | null }>;
}

const SOURCE_LABEL: Record<string, string> = {
  agent_runs: "derived from agent runs (a proxy, not a business measurement)",
  manual: "entered by a person",
};

export const listOutcomesTool: AstraTool<Input> = {
  name: "list_outcomes",
  description:
    "List the organization's outcomes: status, risk tier, whether the outcome review is pending (with its approval id), how many agents serve it, and its KPIs with targets. A KPI's current value appears only with its source; otherwise it is not measured.",
  input: z.object({
    status: z.string().max(40).optional().describe("Only outcomes with this status, e.g. pending_review, awaiting_agent_plan, agents_assigned, active."),
    search: z.string().max(120).optional().describe("Only outcomes whose name contains this."),
  }),
  confirm: false,
  run: async (ctx, input) => {
    const all: OutcomeRow[] = await ctx.services.listOutcomes(ctx.orgId);
    const needle = input.search?.trim().toLowerCase();
    const rows = all
      .filter((o) => !input.status || o.status === input.status)
      .filter((o) => !needle || o.name.toLowerCase().includes(needle));

    const kpis = rows.flatMap((o) => o.kpis);
    const measured = kpis.filter((k) => k.current);
    const payload = {
      total: rows.length,
      outcomes: rows.slice(0, 25).map((o) => ({
        id: o.id,
        name: o.name,
        status: o.status,
        riskTier: o.riskTier,
        pendingReviewApprovalId: o.pendingReviewApprovalId,
        agents: o.agentCount,
        kpis: o.kpis.map((k) => ({
          name: k.name,
          target: `${k.targetOperator ?? ">="} ${k.target} ${k.unit}`,
          baseline: k.baseline ?? "not given",
          current: k.current ? { value: k.current.value, source: SOURCE_LABEL[k.current.source] ?? k.current.source } : "not measured",
        })),
      })),
    };

    const proof: Partial<ProofEnvelope> = {
      context: measured.length
        ? { status: "measured", summary: `${measured.length} of ${kpis.length} KPI values have a recorded source; run-derived values are proxies` }
        : { status: "not_measured", reason: kpis.length ? "None of these KPIs has a current value with a recorded source." : "No KPIs." },
    };

    return {
      payload,
      artifact: rows.length === 1
        ? { kind: "outcome", title: rows[0].name, props: { outcome: rows[0] }, fullViewHref: `/outcomes/${rows[0].id}` }
        : { kind: "outcomeList", title: input.status ? `Outcomes · ${input.status.replace(/_/g, " ")}` : "Outcomes", props: { outcomes: rows.slice(0, 50), total: rows.length }, fullViewHref: "/outcomes" },
      proof,
    };
  },
};
