import { z } from "zod";
import type { AstraTool, AstraToolContext, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Decide the last two kinds of item in Needs you: a requested exception to a
 * policy, and an agent's request to use a tool. Both go through the same code
 * as My Actions (server/action-decisions.ts): checked against the
 * organization, decided once, audited under the person deciding.
 *
 * The cards are honest about effects. An approved exception is recorded, but
 * the runtime doesn't read exceptions yet, so the policy is still enforced. A
 * tool request that needs a form or a URL answer can't be settled with yes or
 * no, so it's sent to Approval Gates.
 */

type ExceptionInput = { exceptionId: string; decision: "approve" | "reject"; note?: string };
type ToolInput = { requestId: string; decision: "approve" | "decline"; note?: string };

interface ExceptionView {
  id: string;
  status: string;
  reason: string;
  scope: string;
  requestedBy: string | null;
  expiresAt: string | null;
  policy: { id: string; name: string } | null;
  agent: { id: string; name: string } | null;
}

interface ToolRequestView {
  id: string;
  status: string;
  toolName: string | null;
  serverName: string | null;
  reason: string | null;
  riskFlags: string[];
  proposedArgs: string | null;
  needsAnswer: boolean;
  agent: { id: string; name: string } | null;
}

async function loadException(ctx: AstraToolContext, id: string): Promise<{ refuse: string } | { pe: ExceptionView }> {
  const pe: ExceptionView | null = await ctx.services.getPolicyExceptionForDecision(ctx.orgId, id);
  if (!pe) return { refuse: "No policy exception with that id in this organization." };
  if (pe.status !== "pending") return { refuse: `That exception was already ${pe.status}. Nothing to decide.` };
  return { pe };
}

async function loadToolRequest(ctx: AstraToolContext, id: string): Promise<{ refuse: string } | { req: ToolRequestView }> {
  const req: ToolRequestView | null = await ctx.services.getToolRequestForDecision(ctx.orgId, id);
  if (!req) return { refuse: "No tool request with that id in this organization." };
  if (req.status !== "pending") return { refuse: `That tool request was already ${req.status}. Nothing to decide.` };
  if (req.needsAnswer) return { refuse: "This request asks for a form or a link to be completed, not a yes or no. Open it in Approval Gates (/approvals/gates)." };
  return { req };
}

async function actorLabel(ctx: AstraToolContext) {
  return (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
}

export const decidePolicyExceptionTool: AstraTool<ExceptionInput> = {
  name: "decide_policy_exception",
  description:
    "Approve or reject a requested exception to a policy (a 'governance' item from list_needs_me). The confirmation card names the policy, who it's for, the reason and the expiry, and says plainly that an approved exception is recorded but doesn't yet change what the runtime enforces. The user confirms first.",
  input: z.object({
    exceptionId: z.string().min(1).describe("The policy exception's id (sourceId from list_needs_me)."),
    decision: z.enum(["approve", "reject"]),
    note: z.string().max(1000).optional().describe("A reason, recorded with the decision."),
  }),
  permission: "approve_changes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const loaded = await loadException(ctx, input.exceptionId);
    if ("refuse" in loaded) return loaded;
    const pe = loaded.pe;
    const who = pe.scope === "org" ? "the whole organization" : pe.agent?.name ?? "an agent that no longer exists";
    return {
      summary: `${input.decision === "approve" ? "Approve" : "Reject"} exception to ${pe.policy?.name ?? "a deleted policy"} for ${who}`,
      details: [
        `Reason given: ${pe.reason}`,
        pe.expiresAt ? `Would expire ${pe.expiresAt.slice(0, 10)}.` : "No expiry set.",
        input.decision === "approve"
          ? "Approving records the exception. The runtime doesn't read exceptions yet, so the policy is still enforced as before."
          : "Rejecting closes the request; nothing else changes.",
        ...(input.note ? [`Your note: ${input.note}`] : []),
        "Recorded in the audit trail under your name.",
      ],
      frozen: { exceptionId: pe.id },
    };
  },
  run: async (ctx, input) => {
    const loaded = await loadException(ctx, input.exceptionId);
    if ("refuse" in loaded) throw new Error(loaded.refuse);
    const result = await ctx.services.decidePolicyExceptionAs(ctx.orgId, ctx.userId, await actorLabel(ctx), input.exceptionId, input.decision, input.note);
    const proof: Partial<ProofEnvelope> = {
      compliance: { status: "measured", summary: `Exception ${result.exception.status} as ${ctx.role} · audit recorded${result.runtimeEffect ? " · not yet enforced by the runtime" : ""}` },
    };
    return { payload: { decided: true, ...result }, proof };
  },
};

export const answerToolRequestTool: AstraTool<ToolInput> = {
  name: "answer_tool_request",
  description:
    "Approve or decline an agent's request to use a tool (an 'autonomy' item from list_needs_me). The confirmation card names the agent, the tool and connector, the reason, any risk flags and the arguments it proposed. Requests that need a form or URL answer are refused with a pointer to Approval Gates. The user confirms first.",
  input: z.object({
    requestId: z.string().min(1).describe("The tool request's id (sourceId from list_needs_me)."),
    decision: z.enum(["approve", "decline"]),
    note: z.string().max(1000).optional().describe("A reason, recorded with the decision."),
  }),
  permission: "approve_changes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const loaded = await loadToolRequest(ctx, input.requestId);
    if ("refuse" in loaded) return loaded;
    const r = loaded.req;
    return {
      summary: `${input.decision === "approve" ? "Let" : "Don't let"} ${r.agent?.name ?? "the agent"} use ${r.toolName ?? "the tool"}${r.serverName ? ` on ${r.serverName}` : ""}`,
      details: [
        ...(r.reason ? [`Why it asked: ${r.reason}`] : []),
        ...(r.riskFlags.length ? [`Risk flags: ${r.riskFlags.join(", ")}`] : []),
        ...(r.proposedArgs ? [`With: ${r.proposedArgs}`] : []),
        input.decision === "approve" ? "The agent may make this call." : "The agent is told no and doesn't make the call.",
        ...(input.note ? [`Your note: ${input.note}`] : []),
        "Recorded in the audit trail under your name.",
      ],
      frozen: { requestId: r.id },
    };
  },
  run: async (ctx, input) => {
    const loaded = await loadToolRequest(ctx, input.requestId);
    if ("refuse" in loaded) throw new Error(loaded.refuse);
    const result = await ctx.services.respondToToolRequestAs(ctx.orgId, ctx.userId, await actorLabel(ctx), input.requestId, input.decision, input.note);
    const proof: Partial<ProofEnvelope> = { compliance: { status: "measured", summary: `Tool request ${result.toolRequest.status} as ${ctx.role} · audit recorded` } };
    return { payload: { decided: true, ...result }, proof };
  },
};
