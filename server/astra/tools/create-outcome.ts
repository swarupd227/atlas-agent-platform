import { z } from "zod";
import type { AstraTool, ConfirmPreview, ConfirmWarning, ProofEnvelope } from "../types";

/**
 * Create the outcome drafted in the conversation. It starts pending review,
 * with an outcome_review approval, exactly like one created in the Outcome
 * Builder; a baseline nobody gave is stored as unknown rather than 0.
 */

const kpiSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(40).describe("e.g. days, %, count, USD"),
  target: z.number().describe("The target value."),
  targetOperator: z.enum([">=", "<=", "=", ">", "<"]).optional().describe("How the target is met; >= by default."),
  baseline: z.number().optional().describe("Only if the user gave today's value."),
  measurement: z.string().max(300).optional().describe("How it is measured."),
});

type Input = {
  name: string;
  description: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  kpis: Array<z.infer<typeof kpiSchema>>;
  constraints?: string[];
  acceptedAgentIds?: string[];
};

const kpiLine = (k: Input["kpis"][number]) =>
  `${k.name}: ${k.targetOperator ?? ">="} ${k.target} ${k.unit} (baseline ${k.baseline != null ? `${k.baseline} ${k.unit}` : "not given"})`;

function toBody(input: Input) {
  return {
    outcome: { name: input.name, description: input.description, riskTier: input.riskTier },
    kpis: input.kpis.map((k) => ({ ...k, targetOperator: k.targetOperator ?? ">=" })),
    constraints: input.constraints?.length ? input.constraints : undefined,
    acceptedAgentIds: input.acceptedAgentIds,
  };
}

export const createOutcomeTool: AstraTool<Input> = {
  name: "create_outcome",
  description:
    "Create the outcome drafted in the conversation: name, what success means, risk tier and KPIs with targets (baseline only if the user gave it). It starts pending review, like any new outcome. Ground the draft with discover_outcome first. The user confirms before it is created.",
  input: z.object({
    name: z.string().min(3).max(200),
    description: z.string().min(10).max(2000),
    riskTier: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    kpis: z.array(kpiSchema).min(1).max(12),
    constraints: z.array(z.string().max(300)).max(12).optional().describe("Rules the work must respect."),
    acceptedAgentIds: z.array(z.string()).max(20).optional().describe("Existing agents to attach to this outcome."),
  }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    try {
      await ctx.services.checkOutcomeDraft(toBody(input));
    } catch (err: any) {
      return { refuse: `The outcome isn't valid yet: ${err?.message ?? "invalid input"}` };
    }
    for (const id of input.acceptedAgentIds ?? []) {
      if (!(await ctx.services.getAgent(ctx.orgId, id))) return { refuse: `No agent ${id} in this organization to attach.` };
    }
    const duplicates: Array<{ id: string; name: string; status: string }> = await ctx.services.findSimilarOutcomes(ctx.orgId, input.name);
    const warnings: ConfirmWarning[] = duplicates.length
      ? [{ title: `${duplicates.length === 1 ? "A similar outcome exists" : `${duplicates.length} similar outcomes exist`}`, detail: duplicates.map((d) => `${d.name} (${d.status.replace(/_/g, " ")})`).join("; ") }]
      : [];
    return {
      summary: `Create outcome: ${input.name}`,
      details: [
        input.description,
        `Risk tier ${input.riskTier}.`,
        ...input.kpis.map(kpiLine),
        ...(input.constraints?.length ? [`Constraints: ${input.constraints.join("; ")}`] : []),
        ...(input.acceptedAgentIds?.length ? [`Attaches ${input.acceptedAgentIds.length} existing ${input.acceptedAgentIds.length === 1 ? "agent" : "agents"}.`] : []),
        "Starts pending review: an approver approves it before a team is built. Recorded in the audit trail.",
      ],
      warnings,
      frozen: { duplicateIds: duplicates.map((d) => d.id).sort() },
    };
  },
  run: async (ctx, input) => {
    const duplicates: Array<{ id: string }> = await ctx.services.findSimilarOutcomes(ctx.orgId, input.name);
    const seen = new Set(((ctx.confirmation?.frozen?.duplicateIds as string[]) ?? []));
    if (duplicates.some((d) => !seen.has(d.id))) {
      throw new Error("A similar outcome was created after the confirm card was shown, so nothing was created. Check the outcomes list first.");
    }
    const actor = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const created = await ctx.services.createOutcome(ctx.orgId, actor, toBody(input));
    const canApprove = !!ctx.can?.(ctx.role, "approve_changes");

    const outcome = {
      id: created.outcome.id,
      name: created.outcome.name,
      description: created.outcome.description,
      status: created.outcome.status,
      riskTier: created.outcome.riskTier,
      pendingReviewApprovalId: created.approval?.id ?? null,
      agentCount: created.boundAgents ?? 0,
      kpis: created.kpis.map((k: any) => ({ name: k.name, unit: k.unit, target: k.target, targetOperator: k.targetOperator, baseline: k.baseline, current: null })),
    };
    const proof: Partial<ProofEnvelope> = {
      compliance: { status: "measured", summary: `Created pending review · outcome review approval ${outcome.pendingReviewApprovalId ?? "not created"}` },
      context: { status: "not_measured", reason: "No KPI has a measured value yet." },
    };
    return {
      payload: {
        created: true,
        outcomeId: outcome.id,
        status: outcome.status,
        reviewApprovalId: outcome.pendingReviewApprovalId,
        kpis: outcome.kpis.length,
        next: canApprove
          ? "The user's role can approve the review: offer decide_approval with reviewApprovalId."
          : "Someone with approval rights must approve the review before a team is built.",
      },
      artifact: { kind: "outcome", title: outcome.name, props: { outcome }, fullViewHref: `/outcomes/${outcome.id}` },
      proof,
    };
  },
};
