/**
 * The Astra home briefing: a few counted rows shown before the first message.
 * Pure: the route gathers each section and says which ones the role may see.
 *
 * A count here is only a pointer. Each row carries a prompt, and choosing it
 * asks Astra, so the fact is re-established by a tool call with its own proof.
 * No cost or business-value figures: the rates behind them aren't measured.
 */

/** A section's data; `null` when this role doesn't have access to it (the row is left out, not shown as empty). */
export type HomeSection<T> = { ok: true; data: T } | { ok: false; reason: string } | null;

export interface HomeInput {
  organizationName: string | null;
  industry: { label: string | null; source: "tenant" | "request" | "none"; organizationLabel: string | null };
  needs: HomeSection<{ needsDecisionCount: number; urgentCount: number; decidableHere: number }>;
  agents: HomeSection<{ runnable: number }>;
  outcomes: HomeSection<{ total: number; pendingReview: number }>;
  connectors: HomeSection<{ total: number; connected: number; notConnected: number }>;
}

export interface HomeRow {
  id: "needs" | "agents" | "outcomes" | "connectors" | "industry";
  label: string;
  count: number | null;
  detail: string | null;
  /** Sent as a message when the row is chosen. */
  prompt: string;
  tone: "attention" | "neutral" | "unavailable";
}

export interface HomeBriefing {
  organizationName: string | null;
  rows: HomeRow[];
  /** What the briefing deliberately doesn't show, and why. */
  notShown: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sectionRow<T>(
  section: HomeSection<T>,
  base: Pick<HomeRow, "id" | "label" | "prompt">,
  describe: (data: T) => Pick<HomeRow, "count" | "detail" | "tone">,
): HomeRow | null {
  if (section === null) return null;
  if (!section.ok) return { ...base, count: null, detail: `Couldn't load: ${section.reason}`, tone: "unavailable" };
  return { ...base, ...describe(section.data) };
}

export function buildHome(input: HomeInput): HomeBriefing {
  const org = input.organizationName || "your organization";
  const rows: Array<HomeRow | null> = [
    sectionRow(input.needs, { id: "needs", label: "Waiting on a decision", prompt: "What needs my decision right now?" }, (d) => ({
      count: d.needsDecisionCount,
      detail:
        d.needsDecisionCount === 0
          ? "Nothing waiting"
          : [d.urgentCount ? `${d.urgentCount} urgent` : null, `${d.decidableHere} you can decide here`].filter(Boolean).join(" · "),
      tone: d.needsDecisionCount > 0 ? "attention" : "neutral",
    })),
    sectionRow(input.agents, { id: "agents", label: "Agents you can run", prompt: "I want one of my agents to do a piece of work. Which ones can I run?" }, (d) => ({
      count: d.runnable,
      detail: d.runnable === 0 ? "None yet" : null,
      tone: "neutral",
    })),
    sectionRow(input.outcomes, { id: "outcomes", label: "Outcomes", prompt: "Show me our outcomes and which are waiting for review." }, (d) => ({
      count: d.total,
      detail: d.pendingReview ? `${d.pendingReview} waiting for review` : d.total === 0 ? "Describe a goal to create one" : null,
      tone: d.pendingReview ? "attention" : "neutral",
    })),
    sectionRow(input.connectors, { id: "connectors", label: "Connectors", prompt: "What connectors can my agents use, and which are connected?" }, (d) => ({
      count: d.total,
      detail: d.notConnected ? `${plural(d.notConnected, "integration")} not connected` : d.connected ? `${d.connected} connected` : null,
      tone: d.notConnected ? "attention" : "neutral",
    })),
    {
      id: "industry",
      label: "Industry",
      count: null,
      detail:
        input.industry.source === "tenant" && input.industry.label
          ? `${input.industry.label}, set for ${org}`
          : input.industry.source === "request" && input.industry.label
            ? `Viewing ${input.industry.label}${input.industry.organizationLabel ? ` · ${org} is ${input.industry.organizationLabel}` : ` · not set for ${org}`}`
            : `Not set for ${org}`,
      prompt: "What industry and regulatory context applies to us?",
      tone: input.industry.source === "none" ? "attention" : "neutral",
    },
  ];
  return {
    organizationName: input.organizationName,
    rows: rows.filter((r): r is HomeRow => r !== null),
    notShown: ["Cost and business value aren't shown here: the rates behind them aren't measured."],
  };
}
