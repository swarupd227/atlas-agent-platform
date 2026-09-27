import { z } from "zod";
import { resolveAgentRef } from "./refs";
import type { AstraTool, ConfirmPreview, ConfirmWarning, ProofEnvelope } from "../types";

/**
 * Changing what an agent is told to do, from the conversation.
 *
 * After watching an automation run once, the most common sentence anyone says is
 * "be stricter about coastal wind" -- and until now the only way to act on it
 * was the agent page. There is no update_agent tool at all.
 *
 * Two fields, deliberately kept apart, because they are different promises:
 * standing instructions (the system message, how it behaves every run) and task
 * instructions (what it is asked to do, which the request and the previous
 * stage's output are appended to). The card shows both, so a person editing one
 * can see what the other already says.
 *
 * Three things the card has to say, because none of them is visible otherwise:
 * an edit reaches the next run of a live deployment with no gate in between; the
 * agent's golden cases were written against the old text; and if the agent was
 * drafted from a process-flow step, syncing that flow later replaces the agent
 * and takes the edit with it.
 */

interface Context {
  agent: { id: string; name: string; status: string | null; riskTier: string | null; autonomyMode: string | null; agentType: string | null; outcomeId: string | null };
  standing: string;
  task: string;
  taskFallsBackToDescription: boolean;
  description: string;
  drivenBy: "task" | "description";
  deployments: Array<{ id: string; environment: string; status: string; version: string | null }>;
  fromFlow: { teamName: string; stepLabel: string } | null;
  evalSuites: number;
}

const clip = (text: string, max = 700) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const shown = (text: string) => (text.trim() ? clip(text) : "(empty)");

export const getAgentInstructionsTool: AstraTool<{ agent: string }> = {
  name: "get_agent_instructions",
  description:
    "What an agent is actually told to do: its standing instructions (the system message it gets every run) and its task instructions (what it is asked to do each run). Read this before proposing a change, so the change is a rewrite of the real text and not a guess. Also says which deployments a change would reach and whether the agent was drafted from a process-flow step.",
  input: z.object({ agent: z.string().min(1).describe("The agent's name or id.") }),
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) throw new Error(found.refuse);
    const c: Context = await ctx.services.agentInstructionContext(ctx.orgId, found.item.id);
    return {
      payload: {
        message: `"${c.agent.name}": ${c.standing.trim() ? "standing instructions set" : "no standing instructions"}, task instructions ${c.drivenBy === "task" ? "set" : "falling back to its description"}`,
        agent: c.agent.name,
        agentId: c.agent.id,
        standingInstructions: c.standing,
        taskInstructions: c.task,
        ...(c.taskFallsBackToDescription
          ? { note: `It has no task instructions of its own, so at run time it is handed its description: "${clip(c.description, 300)}"` }
          : {}),
        liveDeployments: c.deployments.map((d) => `${d.environment} (${d.status})`),
        evalSuites: c.evalSuites,
        ...(c.fromFlow ? { draftedFromFlowStep: `"${c.fromFlow.stepLabel}" in the flow behind ${c.fromFlow.teamName}` } : {}),
      },
      artifact: {
        kind: "text",
        title: `${c.agent.name} — instructions`,
        props: {
          text: [
            `**Standing instructions** (system message, every run)`,
            "",
            c.standing.trim() ? c.standing : "_None._",
            "",
            `**Task instructions** (what it is asked to do each run${c.taskFallsBackToDescription ? "; falls back to its description" : ""})`,
            "",
            c.task.trim() ? c.task : c.description || "_None._",
          ].join("\n"),
        },
        fullViewHref: `/agents/${c.agent.id}`,
      },
      proof: {
        context: { status: "measured", summary: `Read from the agent's own record · ${c.deployments.length} live ${c.deployments.length === 1 ? "deployment" : "deployments"}` },
      },
    };
  },
};

type UpdateInput = { agent: string; target: "standing" | "task"; instructions: string };

export const updateAgentInstructionsTool: AstraTool<UpdateInput> = {
  name: "update_agent_instructions",
  description:
    "Change an agent's instructions: its standing instructions (how it behaves, the system message) or its task instructions (what it does each run). Read them with get_agent_instructions first and pass the COMPLETE new text, not a fragment — it replaces the field. The user sees the current text beside the new one, and what the change reaches, before it happens.",
  input: z.object({
    agent: z.string().min(1).describe("The agent's name or id."),
    target: z.enum(["standing", "task"]).describe("standing = how it behaves every run (systemPrompt); task = what it is asked to do each run."),
    instructions: z.string().min(10).max(8000).describe("The complete new text for that field, in the user's own terms."),
  }),
  permission: "create_modify_blueprints",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) return found;
    let c: Context;
    try {
      c = await ctx.services.agentInstructionContext(ctx.orgId, found.item.id);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    const before = input.target === "standing" ? c.standing : c.task;
    if (before.trim() === input.instructions.trim()) {
      return { refuse: `That is already "${c.agent.name}"'s ${input.target === "standing" ? "standing" : "task"} instructions, word for word.` };
    }

    const warnings: ConfirmWarning[] = [];
    if (c.deployments.length) {
      warnings.push({
        title: `This reaches ${c.deployments.map((d) => d.environment).join(", ")} at the next run`,
        detail: "Instructions are read from the agent at the start of every run, so a live deployment picks this up immediately. Nothing gates it.",
      });
    }
    if (c.fromFlow) {
      warnings.push({
        title: `This agent was drafted from the step "${c.fromFlow.stepLabel}"`,
        detail: `Syncing that flow into ${c.fromFlow.teamName} again would replace this agent and draft a fresh one from the step's own words, losing this edit. To make the change stick, change the step too.`,
      });
    }
    if (c.evalSuites > 0) {
      warnings.push({
        title: `Its ${c.evalSuites === 1 ? "eval suite was" : `${c.evalSuites} eval suites were`} written against the old instructions`,
        detail: "Run them afterwards: a pass rate from before this change says nothing about after it.",
      });
    }
    if (input.target === "task" && c.taskFallsBackToDescription) {
      warnings.push({
        title: "It had no task instructions of its own",
        detail: "Until now the runtime handed it its description. After this it uses the text you're setting instead.",
      });
    }
    if (c.agent.autonomyMode === "autonomous") {
      warnings.push({ title: "This agent acts without asking", detail: "It is autonomous, so the new instructions are what it acts on unsupervised." });
    }

    return {
      summary: `Change ${c.agent.name}'s ${input.target === "standing" ? "standing" : "task"} instructions`,
      details: [
        "Now:",
        shown(before),
        "",
        "After:",
        clip(input.instructions),
        "",
        input.target === "standing"
          ? `Its task instructions are untouched: ${shown(c.task || c.description)}`
          : `Its standing instructions are untouched: ${shown(c.standing)}`,
        "Nothing is deployed and nothing runs now. The change applies from its next run.",
      ],
      warnings,
      frozen: { agent: c.agent.id, target: input.target, length: input.instructions.trim().length },
    };
  },
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) throw new Error(found.refuse);
    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.updateAgentInstructionsAs(ctx.orgId, ctx.userId, actor, {
      agentId: found.item.id,
      target: input.target,
      text: input.instructions,
    });
    const proof: Partial<ProofEnvelope> = {
      compliance: { status: "measured", summary: `Recorded as a configuration change on ${r.agent.name}, with the text before and after` },
      context: { status: "measured", summary: `${r.target === "standing" ? "Standing" : "Task"} instructions replaced` },
    };
    return {
      payload: {
        changed: true,
        agent: r.agent.name,
        agentId: r.agent.id,
        target: r.target,
        next: "It applies from the agent's next run. Run its evals to see whether it still does what it promised, and check anything that depended on the old wording.",
      },
      artifact: {
        kind: "text",
        title: `${r.agent.name} — instructions changed`,
        props: { text: [`**${r.agent.name}** — ${r.target === "standing" ? "standing" : "task"} instructions changed.`, "", "**Now:**", "", r.after].join("\n") },
        fullViewHref: `/agents/${r.agent.id}`,
      },
      proof,
    };
  },
};

export const AGENT_INSTRUCTION_TOOLS: AstraTool[] = [getAgentInstructionsTool, updateAgentInstructionsTool] as AstraTool[];
