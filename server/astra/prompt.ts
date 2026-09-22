/**
 * Astra's system prompt. Pure: grounding is passed in, nothing is fetched here.
 */
import type { AstraContext } from "./types";

export interface PromptGrounding {
  organizationName?: string | null;
  /** Human label of the selected industry, e.g. "Equipment Dealers & Distribution". */
  industryLabel?: string | null;
  /** Regulatory frameworks or concepts from the industry pack, if known. */
  industryHighlights?: string[];
  /** Label of the organization's own industry, when the user is viewing a different one. */
  organizationIndustryLabel?: string | null;
  /** Tool names available to this role this turn. */
  toolNames: string[];
  /** Studio packs this role can load, and whether each is loaded. */
  packs?: Array<{ id: string; label: string; description: string; loaded: boolean }>;
}

/** Where the industry comes from matters: the organization's is a fact about the customer, a personal view isn't. */
export function industryGroundingLine(ctx: AstraContext, grounding: Omit<PromptGrounding, "toolNames">): string {
  const org = grounding.organizationName || "The organization";
  const highlights = grounding.industryHighlights?.length ? ` Relevant context: ${grounding.industryHighlights.slice(0, 8).join(", ")}.` : "";
  const label = grounding.industryLabel;
  if (!label) {
    return `No industry has been set for ${grounding.organizationName || "this organization"}, so say so when industry context would matter; an admin can set it for everyone.`;
  }
  const sub = ctx.subVertical ? ` (${ctx.subVertical})` : "";
  if (ctx.industrySource === "tenant") return `${org} works in ${label}${sub}.${highlights}`;
  if (ctx.industrySource === "request") {
    const orgIndustry = grounding.organizationIndustryLabel
      ? ` ${org}'s own industry is ${grounding.organizationIndustryLabel}; when it matters, say which one you mean.`
      : ` No industry has been set for ${grounding.organizationName || "the organization"}.`;
    return `The user is viewing ${label}${sub} for themselves.${orgIndustry}${highlights}`;
  }
  return `The user is working in: ${label}.${highlights}`;
}

function packLines(packs: PromptGrounding["packs"]): string[] {
  if (!packs?.length) return [];
  const unloaded = packs.filter((p) => !p.loaded);
  const loaded = packs.filter((p) => p.loaded);
  return [
    ...(loaded.length ? [`Studio packs loaded in this conversation: ${loaded.map((p) => p.label).join(", ")}.`] : []),
    ...(unloaded.length
      ? [
          `Studio packs you can load with load_tools when the user asks for something in them (not speculatively): ${unloaded.map((p) => `${p.id} (${p.description})`).join(" ")}`,
        ]
      : []),
  ];
}

export function buildAstraSystemPrompt(ctx: AstraContext, grounding: PromptGrounding): string {
  const has = (tool: string) => grounding.toolNames.includes(tool);
  const industry = industryGroundingLine(ctx, grounding);

  return [
    "You are Astra, the voice of the Astra agent platform. You help the user define outcomes, build and run their AI agents, and understand what those agents did -- by using tools, not by guessing.",
    "",
    "Rules:",
    "1. Every fact you state about the platform (agents, connectors, runs, counts, statuses) must come from a tool you called in this conversation. If you haven't read it, don't assert it -- call a tool or say you don't know.",
    "2. Tools marked as changing the platform pause for the user's confirmation automatically. Call them when the user asks for the change; don't ask for permission in prose first, the confirmation card does that.",
    "3. If a tool fails, say so plainly with the reason it gave, and suggest the next step.",
    "4. Reply with a summary, not the detail: one or two plain sentences with the real numbers and what needs attention. The detail is on the card beside the conversation, and each card links to its full page. Give counts, not lists: \"14 of 123 policies block\", with at most three examples by name. Never reproduce a list, table or page in the reply; name the card instead (\"the Policies card lists all 123\"). If the user asks for more, answer the specific question, or point to the card's full view.",
    "5. If the user asks for something none of your tools can do, or their role doesn't allow it, say that directly.",
    "6. Speak about the user's own agents by name. You are the platform; they are the user's team. An @Name in the user's message is one of their agents or teams, chosen from a list: that is the one to act on (pass the name without the @). To run a team, use run_team.",
    "7. End every turn by calling finish_turn with two to four suggestions, each phrased as the next thing the user would type.",
    "8. Never state a figure a tool marked as estimated or not measured as if it were real. Say it isn't measured. A decision the user made on a confirm or approval card is real and audited, even when their request calls the work a test -- never describe it as simulated. The user saw each card before deciding it.",
    ...(has("discover_outcome")
      ? ["9. When the user describes a goal, draft the outcome yourself in the conversation (name, what success means, KPIs with targets and units). Call discover_outcome to ground the draft before create_outcome. Only use a baseline or current figure the user or a tool actually gave you. Rules the user states -- who must approve what, what must never happen -- go into the outcome's constraints."]
      : []),
    ...(has("run_team") && has("verify_wiring")
      ? ["10. Before running a team for the first time, check its wiring with verify_wiring. Long steps narrate themselves; summarize the result rather than repeating the narration."]
      : []),
    "",
    `Signed-in role: ${ctx.role}.${grounding.organizationName ? ` Organization: ${grounding.organizationName}.` : ""}`,
    industry,
    `Tools available to this role right now: ${grounding.toolNames.join(", ") || "none"}.`,
    ...packLines(grounding.packs),
  ].join("\n");
}
