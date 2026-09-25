import { z } from "zod";
import { RUN_STATISTICS, STATISTIC_LABEL, DEFAULT_WINDOW_DAYS, describeSource, type MeasurementSource } from "@shared/kpi-measurement";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Measuring an outcome from the conversation.
 *
 * Most KPIs here are measured by nothing: a value used to be inferred by
 * matching the KPI's name against run statistics, and there was no way to say
 * "we measured 62% last Tuesday". These two tools are that way, and they go
 * through the same functions as the Outcomes page (server/kpi-actions.ts), so
 * a value recorded in a conversation is the same act, with the same audit
 * record, as one typed into the page.
 *
 * Neither tool invents a number. `record_kpi_value` writes what the person
 * said, and `find_kpis` reports "not measured" rather than a figure nobody
 * took.
 */

interface KpiView {
  id: string;
  name: string;
  unit: string;
  target: number;
  targetOperator: string | null;
  outcomeName: string;
  measuredBy: string;
  sourceKind: "manual" | "agent_runs" | null;
  current: { value: number | null; source: string | null; at: string } | null;
  lastReading: { value: number; at: string; by: string | null; note: string | null } | null;
  authorNote: string | null;
  suggestion: { source: MeasurementSource; because: string } | null;
}

type FindInput = { name?: string; outcome?: string; unmeasuredOnly?: boolean };

export const findKpisTool: AstraTool<FindInput> = {
  name: "find_kpis",
  description:
    "Find the organization's KPIs: what each is measured by, what it last read and when, the note its author wrote about how it should be measured, and its id (needed to record a value). A KPI with nothing measuring it says so.",
  input: z.object({
    name: z.string().max(120).optional().describe("Only KPIs whose name contains this."),
    outcome: z.string().max(120).optional().describe("Only KPIs of outcomes whose name contains this."),
    unmeasuredOnly: z.boolean().optional().describe("Only KPIs that nothing measures yet."),
  }),
  confirm: false,
  run: async (ctx, input) => {
    const all: KpiView[] = await ctx.services.findKpisForMeasurement(ctx.orgId, { name: input.name, outcomeName: input.outcome });
    const rows = input.unmeasuredOnly ? all.filter((k) => !k.sourceKind) : all;
    const measured = rows.filter((k) => k.current);

    const payload = {
      total: rows.length,
      kpis: rows.map((k) => ({
        id: k.id,
        name: k.name,
        outcome: k.outcomeName,
        target: `${k.targetOperator ?? ">="} ${k.target} ${k.unit}`,
        measuredBy: k.measuredBy,
        reads: k.current ? `${k.current.value} ${k.unit} (as of ${k.current.at.split("T")[0]})` : "not measured",
        lastRecorded: k.lastReading ? `${k.lastReading.value} ${k.unit} on ${k.lastReading.at.split("T")[0]}${k.lastReading.by ? ` by ${k.lastReading.by}` : ""}` : null,
        howItWasMeantToBeMeasured: k.authorNote,
        suggestion: k.suggestion ? k.suggestion.because : null,
      })),
    };

    const proof: Partial<ProofEnvelope> = {
      context: measured.length
        ? { status: "measured", summary: `${measured.length} of ${rows.length} KPIs have a value, each with where it came from` }
        : { status: "not_measured", reason: rows.length ? "None of these KPIs has been measured." : "No KPIs matched." },
    };
    return { payload, proof };
  },
};

type RecordInput = { kpiId: string; value: number; takenAt?: string; note?: string };

async function loadKpi(ctx: { orgId: string; services: any }, kpiId: string): Promise<{ refuse: string } | { kpi: KpiView }> {
  const kpi: KpiView | null = await ctx.services.getKpiForMeasurement(ctx.orgId, kpiId);
  if (!kpi) return { refuse: "No KPI with that id in this organization. Use find_kpis to get the id." };
  return { kpi };
}

export const recordKpiValueTool: AstraTool<RecordInput> = {
  name: "record_kpi_value",
  description:
    "Record a measurement a person took for a KPI: the value, optionally the day it was taken and how they know. It becomes what the KPI reads, and is kept in its history. Use find_kpis for the id. The user confirms first.",
  input: z.object({
    kpiId: z.string().min(1).describe("The KPI's id, from find_kpis."),
    value: z.number().finite().describe("The measured value, in the KPI's own unit. Never estimate this; use what the person said."),
    takenAt: z.string().datetime().optional().describe("When the measurement was taken, if not now."),
    note: z.string().max(1000).optional().describe("How they know — where the number came from."),
  }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const loaded = await loadKpi(ctx as any, input.kpiId);
    if ("refuse" in loaded) return loaded;
    const k = loaded.kpi;
    if (k.sourceKind === "agent_runs") {
      return { refuse: `"${k.name}" is measured by agent runs, so a recorded value would be overwritten on the next run. Change what measures it first (set_kpi_measurement).` };
    }
    const target = `${k.targetOperator ?? ">="} ${k.target} ${k.unit}`;
    return {
      summary: `Record ${input.value} ${k.unit} for "${k.name}"`,
      details: [
        `${k.outcomeName} · target ${target}`,
        k.current ? `It currently reads ${k.current.value} ${k.unit}.` : "Nothing has measured it so far.",
        input.takenAt ? `Taken on ${input.takenAt.split("T")[0]}.` : "Taken today.",
        ...(input.note ? [`How you know: ${input.note}`] : []),
        "It becomes what this KPI reads, is kept in its history, and marks the KPI as recorded by a person so agent runs don't overwrite it.",
        "Recorded in the audit trail.",
      ],
      frozen: { kpiId: k.id, value: input.value },
    };
  },
  run: async (ctx, input) => {
    const actorLabel = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const result = await ctx.services.recordKpiValueAs(ctx.orgId, ctx.userId, actorLabel, input.kpiId, input.value, input.takenAt, input.note);
    const proof: Partial<ProofEnvelope> = {
      context: { status: "measured", summary: `Recorded by ${actorLabel}${input.note ? `: ${input.note}` : ""}` },
      compliance: { status: "measured", summary: "Audit recorded" },
    };
    return {
      payload: {
        recorded: true,
        kpi: result.kpi?.name,
        value: input.value,
        nowReads: result.appliedAsCurrent ? "this value" : "a later measurement, which was kept",
        pastThreshold: result.breached,
      },
      proof,
    };
  },
};

type DeclareInput = { kpiId: string; measuredBy: "person" | "agent_runs" | "nothing"; statistic?: string; windowDays?: number };

export const setKpiMeasurementTool: AstraTool<DeclareInput> = {
  name: "set_kpi_measurement",
  description:
    `Declare what measures a KPI: a person recording readings, a named agent-run statistic (${RUN_STATISTICS.join(", ")}) over a window, or nothing. A run statistic is a proxy, never a business measurement. The user confirms first.`,
  input: z.object({
    kpiId: z.string().min(1).describe("The KPI's id, from find_kpis."),
    measuredBy: z.enum(["person", "agent_runs", "nothing"]).describe("Who or what measures it."),
    statistic: z.enum(RUN_STATISTICS as [string, ...string[]]).optional().describe("Required with agent_runs: which run statistic."),
    windowDays: z.number().int().min(1).max(365).optional().describe(`Trailing window for a run statistic (default ${DEFAULT_WINDOW_DAYS}).`),
  }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const loaded = await loadKpi(ctx as any, input.kpiId);
    if ("refuse" in loaded) return loaded;
    const k = loaded.kpi;
    if (input.measuredBy === "agent_runs" && !input.statistic) {
      return { refuse: `Measuring "${k.name}" by agent runs needs a statistic: ${RUN_STATISTICS.join(", ")}.` };
    }
    const next = sourceFor(input);
    return {
      summary: `Measure "${k.name}" by ${describeSource(next).toLowerCase()}`,
      details: [
        `${k.outcomeName} · now: ${k.measuredBy}`,
        ...(k.authorNote ? [`Its author wrote: ${k.authorNote}`] : []),
        ...(next?.kind === "agent_runs"
          ? [
              `${STATISTIC_LABEL[next.statistic]}, over the last ${next.windowDays} days.`,
              "This is a proxy: it measures the agents' runs, not the business outcome, and the page will say so.",
              "Agent runs will keep it up to date, so nobody can record a value by hand.",
            ]
          : next?.kind === "manual"
            ? ["A person records readings; agent runs never overwrite them."]
            : ["Nothing will measure it, and it will say so."]),
        "Recorded in the audit trail.",
      ],
      frozen: { kpiId: k.id, measuredBy: input.measuredBy, statistic: input.statistic ?? null },
    };
  },
  run: async (ctx, input) => {
    const actorLabel = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const result = await ctx.services.declareKpiMeasurementAs(ctx.orgId, ctx.userId, actorLabel, input.kpiId, sourceFor(input));
    const proof: Partial<ProofEnvelope> = { compliance: { status: "measured", summary: `Declared by ${actorLabel} · audit recorded` } };
    return { payload: { kpi: result.kpi?.name, was: result.was, measuredBy: result.describes }, proof };
  },
};

/** The declaration the tool's arguments stand for. */
export function sourceFor(input: Pick<DeclareInput, "measuredBy" | "statistic" | "windowDays">): MeasurementSource | null {
  if (input.measuredBy === "person") return { kind: "manual" };
  if (input.measuredBy === "agent_runs" && input.statistic) {
    return { kind: "agent_runs", statistic: input.statistic as any, windowDays: input.windowDays ?? DEFAULT_WINDOW_DAYS };
  }
  return null;
}

export const KPI_TOOLS: AstraTool[] = [findKpisTool, recordKpiValueTool, setKpiMeasurementTool] as AstraTool[];
