import { z } from "zod";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Acknowledge an agent alert: it leaves the list of things needing a decision.
 * Acknowledging doesn't fix anything, and the card says so.
 */

type Input = { alertId: string; note?: string };

interface AlertView {
  id: string;
  agentName: string;
  message: string;
  severity: string;
  acknowledged: boolean;
  triggeredAt: string | null;
}

async function load(ctx: Parameters<NonNullable<AstraTool<Input>["preview"]>>[0], input: Input): Promise<{ refuse: string } | { alert: AlertView }> {
  const alert: AlertView | null = await ctx.services.getAlertForDecision(ctx.orgId, input.alertId);
  if (!alert) return { refuse: "No alert with that id in this organization." };
  if (alert.acknowledged) return { refuse: "That alert was already acknowledged." };
  return { alert };
}

export const acknowledgeAlertTool: AstraTool<Input> = {
  name: "acknowledge_alert",
  description:
    "Acknowledge an agent alert (from list_needs_me) so it stops waiting on a decision. It doesn't fix the underlying problem. The user confirms first.",
  input: z.object({
    alertId: z.string().min(1).describe("The alert's id."),
    note: z.string().max(1000).optional().describe("A note, recorded with the acknowledgement."),
  }),
  permission: "view_agents",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const loaded = await load(ctx, input);
    if ("refuse" in loaded) return loaded;
    const a = loaded.alert;
    return {
      summary: `Acknowledge alert on ${a.agentName}`,
      details: [
        a.message,
        "The alert leaves Needs you. Nothing about the agent changes; the problem it reports isn't fixed by acknowledging it.",
        ...(input.note ? [`Your note: ${input.note}`] : []),
        "Recorded in the audit trail.",
      ],
      frozen: { alertId: a.id },
    };
  },
  run: async (ctx, input) => {
    const loaded = await load(ctx, input);
    if ("refuse" in loaded) throw new Error(loaded.refuse);
    const actorLabel = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const result = await ctx.services.acknowledgeAlertAs(ctx.orgId, ctx.userId, actorLabel, input.alertId, input.note);
    const proof: Partial<ProofEnvelope> = {
      compliance: { status: "measured", summary: `Acknowledged as ${ctx.role} · audit recorded` },
    };
    return { payload: { acknowledged: true, alert: result.alert }, proof };
  },
};
