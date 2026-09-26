import { z } from "zod";
import { resolveTeam } from "./team-ref";
import type { AstraTool, AstraToolContext, ConfirmPreview, ConfirmWarning, ProofEnvelope } from "../types";

/**
 * Attaching a built team to an outcome.
 *
 * A team planned from a process flow, or from a description of the work, is
 * built attached to nothing: it can run, and nothing it does moves a number
 * anybody agreed to. build_team says so on its card, which was as far as the
 * conversation could take it -- the only way to close the gap was the classic
 * agent page. This is the step that closes it.
 *
 * The card is careful about what attaching does and does not do. It makes the
 * team's runs count towards the outcome and scaffolds a KPI-aligned eval
 * suite; it does not start measuring KPIs that nobody declared a source for,
 * and it does not touch a KPI somebody reads by hand.
 */

type Input = { team: string; outcome: string };

interface OutcomeRef {
  id: string;
  name: string;
}

interface Measurement {
  outcome: OutcomeRef & { status: string };
  kpis: number;
  fromRuns: number;
  byHand: number;
  undeclared: number;
  agentsAttached: number;
}

/** One of the organization's outcomes, by id or by name. */
async function resolveOutcome(ctx: AstraToolContext, ref: string): Promise<{ outcome: OutcomeRef } | { refuse: string }> {
  const outcomes: OutcomeRef[] = await ctx.services.listOutcomeNames(ctx.orgId);
  const byId = outcomes.find((o) => o.id === ref);
  if (byId) return { outcome: byId };
  const needle = ref.trim().toLowerCase();
  const exact = outcomes.filter((o) => o.name.toLowerCase() === needle);
  const matched = exact.length ? exact : outcomes.filter((o) => o.name.toLowerCase().includes(needle));
  if (matched.length === 1) return { outcome: matched[0] };
  if (matched.length === 0) return { refuse: `No outcome named "${ref}" in this organization. list_outcomes shows them.` };
  return { refuse: `Several outcomes match "${ref}": ${matched.slice(0, 6).map((o) => `${o.name} (${o.id})`).join("; ")}. Say which one.` };
}

/** What measuring this outcome rests on, for the card. */
export function measurementLine(m: Measurement): string {
  if (m.kpis === 0) return `"${m.outcome.name}" has no KPIs, so attaching the team still measures nothing. Add one with a source and record readings against it.`;
  const parts: string[] = [];
  if (m.fromRuns) parts.push(`${m.fromRuns} measured from agent runs, re-read now`);
  if (m.byHand) parts.push(`${m.byHand} read by a person, unchanged`);
  if (m.undeclared) parts.push(`${m.undeclared} with no source declared, so not measured`);
  return `${m.kpis} ${m.kpis === 1 ? "KPI" : "KPIs"}: ${parts.join("; ")}.`;
}

export const attachTeamToOutcomeTool: AstraTool<Input> = {
  name: "attach_team_to_outcome",
  description:
    "Attach a built team to one of the organization's outcomes, so the team appears under it and its runs count towards it. Use after build_team for a team planned from a process flow or from described work. Deploys nothing and runs nothing. The user confirms first.",
  input: z.object({
    team: z.string().min(1).describe("The team's name or id."),
    outcome: z.string().min(1).describe("The outcome's name or id, from list_outcomes."),
  }),
  permission: "create_modify_blueprints",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const t = await resolveTeam(ctx, input.team);
    if ("refuse" in t) return t;
    const o = await resolveOutcome(ctx, input.outcome);
    if ("refuse" in o) return o;

    let measurement: Measurement;
    try {
      measurement = await ctx.services.outcomeMeasurement(ctx.orgId, o.outcome.id);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    const current = await ctx.services.getAgent(ctx.orgId, t.team.id).catch(() => null);
    const alreadyThere = current?.outcomeId === o.outcome.id;
    if (alreadyThere) return { refuse: `"${t.team.name}" is already attached to "${o.outcome.name}".` };

    const warnings: ConfirmWarning[] = [];
    if (current?.outcomeId) {
      warnings.push({
        title: "This team is attached to another outcome",
        detail: "It moves: from now on its runs count towards this one instead. What it did before stays where it is.",
      });
    }
    if (measurement.kpis === 0) {
      warnings.push({ title: "This outcome measures nothing yet", detail: "It has no KPIs, so attaching the team doesn't make its work measurable." });
    } else if (measurement.fromRuns === 0) {
      warnings.push({
        title: "No KPI here is measured from agent runs",
        detail: "The team's runs won't move any of these figures on their own. Declare what measures a KPI if you want its readings to come from runs.",
      });
    }

    return {
      summary: `Attach "${t.team.name}" to the outcome "${o.outcome.name}"`,
      details: [
        `The team appears under "${o.outcome.name}", alongside the ${measurement.agentsAttached} ${measurement.agentsAttached === 1 ? "agent" : "agents"} already attached to it.`,
        measurementLine(measurement),
        "A KPI-aligned eval suite is scaffolded for the team from this outcome's KPIs.",
        "Nothing is deployed and nothing runs. The team's own configuration, connectors and gates are untouched.",
      ],
      warnings,
      frozen: { team: t.team.id, outcome: o.outcome.id },
    };
  },
  run: async (ctx, input) => {
    const t = await resolveTeam(ctx, input.team);
    if ("refuse" in t) throw new Error(t.refuse);
    const o = await resolveOutcome(ctx, input.outcome);
    if ("refuse" in o) throw new Error(o.refuse);

    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.attachTeamToOutcomeAs(ctx.orgId, ctx.userId, actor, t.team.id, o.outcome.id);
    const proof: Partial<ProofEnvelope> = {
      context: {
        status: "measured",
        summary: `${r.kpiCount} ${r.kpiCount === 1 ? "KPI" : "KPIs"} on "${r.outcome.name}" · ${r.kpisReRead} re-read from runs`,
      },
    };
    return {
      payload: {
        attached: true,
        team: r.agent.name,
        teamAgentId: r.agent.id,
        outcome: r.outcome.name,
        outcomeId: r.outcome.id,
        ...(r.movedFrom ? { movedFromOutcomeId: r.movedFrom } : {}),
        kpis: r.kpiCount,
        kpisReReadFromRuns: r.kpisReRead,
        evalCasesScaffolded: r.evalCases,
        next: "Nothing was deployed or run. Deploy it when you want it live, and run_team to try it.",
      },
      artifact: { kind: "text", title: r.outcome.name, props: { text: `**${r.agent.name}** is attached to **${r.outcome.name}** — ${r.kpiCount} ${r.kpiCount === 1 ? "KPI" : "KPIs"}, ${r.kpisReRead} re-read from agent runs.` }, fullViewHref: `/outcomes/${r.outcome.id}` },
      proof,
    };
  },
};
