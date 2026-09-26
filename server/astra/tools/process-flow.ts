import { z } from "zod";
import { draftKey, holdDraft, takeDraft } from "../flow-drafts";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Drawing a process flow from a description, in the conversation.
 *
 * The Studio has done this since it was built, behind a "Describe workflow"
 * panel; Cowork could talk about a process all day and not produce one. The
 * conversation is arguably the better place for it: the clarifying questions
 * the Studio asks in a modal are just talking, and Astra already knows the
 * organization's outcomes, agents and industry.
 *
 * One tool, not two, and the preview does the drawing. That way the card shows
 * the steps it is actually about to create, with whatever the compiler flags
 * about them.
 *
 * What the preview drew is held in flow-drafts.ts until the person confirms,
 * because a confirm card's frozen input is only what the card SHOWS -- `run`
 * is handed the model's original arguments. Drawing again on confirm would
 * risk saving a flow that differs from the one just read and agreed to.
 */

type Input = { description?: string; name?: string; fileIds?: string[] };

interface Drafted {
  name: string;
  nodes: Array<{ id: string; type: string; label: string; actor?: string }>;
  edges: Array<{ id: string; from: string; to: string; label?: string; condition?: string }>;
  /** What the compiler says about the draft: missing trigger, a decision with no condition… */
  warnings: string[];
}

/** The shape of a flow in one line: what a person checks before saving. */
export function flowShape(nodes: Drafted["nodes"], edges: Drafted["edges"]): string {
  const of = (type: string) => nodes.filter((n) => n.type === type).length;
  const parts = [`${nodes.length} ${nodes.length === 1 ? "step" : "steps"}`];
  if (of("make_decision")) parts.push(`${of("make_decision")} decision${of("make_decision") === 1 ? "" : "s"}`);
  if (of("parallel")) parts.push(`${of("parallel")} parallel split${of("parallel") === 1 ? "" : "s"}`);
  if (of("expert_approval")) parts.push(`${of("expert_approval")} approval${of("expert_approval") === 1 ? "" : "s"}`);
  const conditioned = edges.filter((e) => e.condition).length;
  if (conditioned) parts.push(`${conditioned} conditional path${conditioned === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** The steps, in the order they were drawn, for the card. */
export function stepLines(nodes: Drafted["nodes"], limit = 12): string[] {
  const lines = nodes.slice(0, limit).map((n, i) => `${i + 1}. ${n.label}${n.actor ? ` — ${n.actor}` : ""}`);
  if (nodes.length > limit) lines.push(`…and ${nodes.length - limit} more`);
  return lines;
}

export const createProcessFlowTool: AstraTool<Input> = {
  name: "create_process_flow",
  description:
    "Draw a process flow from a description of how the work runs, and save it to the Process Flow library. Attached documents can be the description ('here is our SOP'). The user sees the steps and anything the compiler flags, and confirms before it is saved.",
  input: z.object({
    description: z.string().max(4000).optional().describe("How the process runs, in the user's own words. Optional only when a document is attached."),
    name: z.string().max(80).optional().describe("What to call the flow; one is drafted if you don't give it."),
    fileIds: z.array(z.string()).max(5).optional().describe("Attached process documents to derive the flow from."),
  }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    if (!input.description?.trim() && !(input.fileIds?.length)) {
      return { refuse: "Describe the process, or attach the document that describes it." };
    }
    let drafted: Drafted;
    try {
      drafted = await ctx.services.draftFlow(ctx.orgId, input);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (drafted.nodes.length === 0) {
      return { refuse: "I couldn't turn that into a flow. Say what starts it, what happens in between, and how it ends." };
    }

    const name = input.name?.trim() || drafted.name;
    // Held for the confirmation; run() gets the model's arguments, not this.
    holdDraft(draftKey(ctx.orgId, input), { name, graph: { name, nodes: drafted.nodes, edges: drafted.edges }, warnings: drafted.warnings });
    return {
      summary: `Create process flow "${name}"`,
      details: [
        flowShape(drafted.nodes, drafted.edges),
        ...stepLines(drafted.nodes),
        // The compiler's findings are the reason to look before saving.
        ...(drafted.warnings.length
          ? ["", "Worth checking before you run it:", ...drafted.warnings.map((w) => `• ${w}`)]
          : ["", "The compiler found nothing to flag."]),
        "",
        "It is saved to the library, where you can edit it. Nothing runs until you turn it into an automation.",
      ],
      // Shown on the card; the graph itself is held server-side.
      frozen: { name, steps: drafted.nodes.length },
    };
  },
  run: async (ctx, input) => {
    const frozen = takeDraft(draftKey(ctx.orgId, input));
    // Gone means the process restarted between the card and the click. Saying
    // so beats drawing a second flow and calling it the one they agreed to.
    if (!frozen?.graph?.nodes?.length) {
      throw new Error("The flow I drew is no longer held (the server restarted). Ask me to draw it again and I'll show you the steps.");
    }
    const saved = await ctx.services.saveFlow(ctx.orgId, frozen.name, frozen.graph);
    const proof: Partial<ProofEnvelope> = {
      context: frozen.warnings.length
        ? { status: "measured", summary: `Saved with ${frozen.warnings.length} thing${frozen.warnings.length === 1 ? "" : "s"} to check` }
        : { status: "measured", summary: "Saved; the compiler flagged nothing" },
    };
    return {
      payload: {
        created: true,
        id: saved.id,
        name: saved.name,
        steps: frozen.graph.nodes.length,
        openIn: `/process-flows?flowId=${saved.id}`,
        toCheck: frozen.warnings,
      },
      artifact: {
        kind: "text",
        title: saved.name,
        props: {
          text: [
            `**${saved.name}** — ${frozen.graph.nodes.length} steps.`,
            ...(frozen.warnings.length ? ["", "Worth checking:", ...frozen.warnings.map((w) => `- ${w}`)] : []),
          ].join("\n"),
        },
      },
      proof,
    };
  },
};

type ReviseInput = { flow: string; instruction: string };

interface RevisionPlan {
  flow: { id: string; name: string };
  changed: string[];
  skipped: string[];
  warnings: string[];
  graph: unknown | null;
}

export const listProcessFlowsTool: AstraTool<{ name?: string }> = {
  name: "list_process_flows",
  description: "The organization's process flows, with their ids — needed to change one.",
  input: z.object({ name: z.string().max(120).optional().describe("Only flows whose name contains this.") }),
  confirm: false,
  run: async (ctx, input) => {
    const flows = await ctx.services.findFlows(ctx.orgId, input.name);
    return {
      payload: {
        total: flows.length,
        flows: flows.map((f: { id: string; name: string; steps: number }) => ({ id: f.id, name: f.name, steps: f.steps, openIn: `/process-flows?flowId=${f.id}` })),
      },
    };
  },
};

export const reviseProcessFlowTool: AstraTool<ReviseInput> = {
  name: "revise_process_flow",
  description:
    "Change an existing process flow by describing the change ('put a fraud check before the payout'). Only what was asked for moves; everything else keeps its place on the canvas. The user sees exactly what will change, and can undo it afterwards.",
  input: z.object({
    flow: z.string().min(1).describe("The flow's id, from list_process_flows."),
    instruction: z.string().min(3).max(1000).describe("The change, in the user's own words."),
  }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    let plan: RevisionPlan;
    try {
      plan = await ctx.services.planFlowRevision(ctx.orgId, input.flow, input.instruction);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (!plan.graph || plan.changed.length === 0) {
      return {
        refuse: plan.skipped.length
          ? `I couldn't make that change: ${plan.skipped.join(" ")}`
          : "I couldn't see what to change from that. Name the step, and say what should happen before or after it.",
      };
    }

    holdDraft(reviseKey(ctx.orgId, input), { name: plan.flow.name, graph: plan.graph as HeldGraph, warnings: plan.warnings });
    return {
      summary: `Change "${plan.flow.name}"`,
      details: [
        ...plan.changed,
        // What it could not do belongs on the card too: a step it failed to
        // find is usually a step the person named differently.
        ...(plan.skipped.length ? ["", "What I couldn't do:", ...plan.skipped.map((sk) => `• ${sk}`)] : []),
        ...(plan.warnings.length
          ? ["", "Worth checking after this:", ...plan.warnings.map((w) => `• ${w}`)]
          : ["", "The compiler flags nothing about the result."]),
        "",
        "Everything not listed above keeps its place. You can undo this afterwards.",
      ],
      frozen: { flow: plan.flow.id, changes: plan.changed.length },
    };
  },
  run: async (ctx, input) => {
    const held = takeDraft(reviseKey(ctx.orgId, input));
    if (!held?.graph) {
      throw new Error("The change I worked out is no longer held (the server restarted). Ask for it again and I'll show you what it would do.");
    }
    const saved = await ctx.services.saveFlowRevision(ctx.orgId, input.flow, held.graph, input.instruction, await actorLabel(ctx));
    return {
      payload: { changed: true, flow: saved.name, openIn: `/process-flows?flowId=${saved.id}`, toCheck: held.warnings, undo: "Ask me to undo it and I will put the previous version back." },
      proof: { context: { status: "measured", summary: "The state it replaced was kept, so this can be undone" } },
    };
  },
};

export const undoFlowChangeTool: AstraTool<{ flow: string }> = {
  name: "undo_flow_change",
  description: "Put a process flow back to how it was before the last change, whoever made it.",
  input: z.object({ flow: z.string().min(1).describe("The flow's id, from list_process_flows.") }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => ({
    summary: "Undo the last change to this flow",
    details: [
      "The flow goes back to the state before its last save.",
      "That state is itself kept, so this can be undone in turn.",
    ],
    frozen: { flow: input.flow },
  }),
  run: async (ctx, input) => {
    const restored = await ctx.services.undoFlowChange(ctx.orgId, input.flow, await actorLabel(ctx));
    return {
      payload: { undone: true, flow: restored.name, openIn: `/process-flows?flowId=${restored.id}` },
      proof: { context: { status: "measured", summary: "Restored from the recorded version history" } },
    };
  },
};

/** Who is asking, for the version history. */
async function actorLabel(ctx: { services: { getUserDisplayName?: (id: string | null) => Promise<string | null> }; userId: string | null; role: string }): Promise<string> {
  return (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
}

/** A revision is held by the flow and the words that described the change. */
function reviseKey(orgId: string, input: ReviseInput): string {
  return draftKey(orgId, { name: input.flow, description: input.instruction });
}

type HeldGraph = { name: string; nodes: unknown[]; edges: unknown[] };

export const PROCESS_FLOW_TOOLS: AstraTool[] = [createProcessFlowTool, listProcessFlowsTool, reviseProcessFlowTool, undoFlowChangeTool] as AstraTool[];
