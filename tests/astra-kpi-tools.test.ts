/**
 * Measuring an outcome from the conversation, through the confirm loop.
 *
 * The rules worth holding: a value is recorded only after the user sees a card
 * saying what it will change, a KPI that agent runs keep up to date refuses
 * the recording with the reason rather than quietly taking the value, a run
 * statistic is named on the card as a proxy, and a KPI nothing measures
 * reports "not measured" instead of a number.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { findKpisTool, recordKpiValueTool, setKpiMeasurementTool, sourceFor } from "../server/astra/tools/kpi";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "user-1", role });

const kpi = (over: Record<string, any> = {}) => ({
  id: "kpi-1",
  name: "Fleet utilization",
  unit: "%",
  target: 70,
  targetOperator: ">=",
  outcomeId: "out-1",
  outcomeName: "Rental fleet utilization",
  measuredBy: "Nothing measures this yet",
  sourceKind: null,
  current: null,
  lastReading: null,
  authorNote: "Percentage of fleet units actively rented vs total available",
  suggestion: null,
  ...over,
});

function setup(steps: Parameters<typeof scriptedComplete>[0], row: Record<string, any>) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const recorded: any[] = [];
  const declared: any[] = [];
  const services = {
    findKpisForMeasurement: vi.fn(async (org: string) => (org === ORG ? [row] : [])),
    getKpiForMeasurement: vi.fn(async (org: string, id: string) => (org === ORG && id === row.id ? row : null)),
    recordKpiValueAs: vi.fn(async (...args: any[]) => {
      if (row.sourceKind === "agent_runs") throw new Error(`"${row.name}" is measured by agent runs, so a recorded value would be overwritten on the next run.`);
      recorded.push(args);
      return { reading: { id: "r-1", value: args[4] }, kpi: { ...row }, appliedAsCurrent: true, breached: false };
    }),
    declareKpiMeasurementAs: vi.fn(async (...args: any[]) => {
      declared.push(args);
      return { kpi: { ...row }, describes: "Recorded by a person", was: row.measuredBy };
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, findKpisTool, recordKpiValueTool, setKpiMeasurementTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, recorded, declared, onEvent: () => {} };
}

const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const record = (args: Record<string, any> = {}) => ({ toolCalls: [{ name: "record_kpi_value", arguments: { kpiId: "kpi-1", value: 62.5, ...args } }] });

describe("record_kpi_value", () => {
  it("shows what the value will change before anything is written", async () => {
    const t = setup([record({ note: "Counted in the depot system" })], kpi());
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Record 62.5% for fleet utilization", t.onEvent)).toBe("awaiting_confirmation");
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe('Record 62.5 % for "Fleet utilization"');
    const details = action.details!.join(" ");
    expect(details).toContain("Rental fleet utilization · target >= 70 %");
    expect(details).toContain("Nothing has measured it so far.");
    expect(details).toContain("How you know: Counted in the depot system");
    expect(details).toContain("agent runs don't overwrite it");
    expect(t.services.recordKpiValueAs).not.toHaveBeenCalled();
  });

  it("records exactly the value on the card once the user confirms", async () => {
    const t = setup([record(), (m) => { expect(lastTool(m).result).toMatchObject({ recorded: true, value: 62.5 }); return done("Recorded."); }], kpi());
    await runTurn(t.deps, as("admin"), t.threadId, "Record it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.frozen).toMatchObject({ kpiId: "kpi-1", value: 62.5 });
    expect(await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent)).toBe("idle");
    expect(t.recorded[0].slice(0, 5)).toEqual([ORG, "user-1", "admin", "kpi-1", 62.5]);
  });

  it("Not now records nothing", async () => {
    const t = setup([record(), (m) => { expect(lastTool(m)).toMatchObject({ declined: true }); return done("Left it."); }], kpi());
    await runTurn(t.deps, as("admin"), t.threadId, "Record it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "cancel", t.onEvent);
    expect(t.services.recordKpiValueAs).not.toHaveBeenCalled();
  });

  it("refuses, without a card, a KPI that agent runs keep up to date", async () => {
    const runMeasured = kpi({ sourceKind: "agent_runs", measuredBy: "Share of the outcome's agent runs that finished without failing, over the last 30 days (a proxy)" });
    const t = setup([record(), (m) => { expect(lastTool(m).error).toContain("would be overwritten on the next run"); return done("Can't."); }], runMeasured);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Record it", t.onEvent)).toBe("idle");
    expect(t.services.recordKpiValueAs).not.toHaveBeenCalled();
  });

  it("refuses a KPI that isn't this organization's, and says how to find one", async () => {
    const t = setup([{ toolCalls: [{ name: "record_kpi_value", arguments: { kpiId: "kpi-elsewhere", value: 1 } }] }, (m) => { expect(lastTool(m).error).toContain("Use find_kpis"); return done("Can't."); }], kpi());
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Record it", t.onEvent)).toBe("idle");
  });

  it("needs the permission that editing an outcome needs", async () => {
    expect(recordKpiValueTool.permission).toBe("create_modify_outcomes");
    expect(setKpiMeasurementTool.permission).toBe("create_modify_outcomes");
    // ops_sre and finance can't edit an outcome, so they can't measure one either.
    expect(hasPermission("ops_sre", "create_modify_outcomes")).toBe(false);
    expect(hasPermission("finance", "create_modify_outcomes")).toBe(false);
    expect(hasPermission("outcome_owner", "create_modify_outcomes")).toBe(true);
  });

  it("is not offered at all to a role that can't edit an outcome", async () => {
    const t = setup([done("You can't record that.")], kpi());
    const offered = t.deps.registry.canonicalDefinitions("ops_sre" as RoleId).map((d: any) => d.name);
    expect(offered).toContain("find_kpis");
    expect(offered).not.toContain("record_kpi_value");
    expect(offered).not.toContain("set_kpi_measurement");
  });
});

describe("set_kpi_measurement", () => {
  const declare = (args: Record<string, any>) => ({ toolCalls: [{ name: "set_kpi_measurement", arguments: { kpiId: "kpi-1", ...args } }] });

  it("says on the card that a run statistic is a proxy, and what it costs you", async () => {
    const t = setup([declare({ measuredBy: "agent_runs", statistic: "success_rate", windowDays: 14 })], kpi());
    await runTurn(t.deps, as("admin"), t.threadId, "Measure it from runs", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    const details = action.details!.join(" ");
    expect(details).toContain("over the last 14 days");
    expect(details).toContain("measures the agents' runs, not the business outcome");
    expect(details).toContain("nobody can record a value by hand");
    // The author's own note about how it should be measured is on the card.
    expect(details).toContain("Percentage of fleet units actively rented");
  });

  it("won't take agent runs without saying which statistic", async () => {
    const t = setup([declare({ measuredBy: "agent_runs" }), (m) => { expect(lastTool(m).error).toContain("needs a statistic"); return done("Which one?"); }], kpi());
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Measure it from runs", t.onEvent)).toBe("idle");
    expect(t.services.declareKpiMeasurementAs).not.toHaveBeenCalled();
  });

  it("declares a person, on confirm", async () => {
    const t = setup([declare({ measuredBy: "person" })], kpi());
    await runTurn(t.deps, as("admin"), t.threadId, "I'll measure it myself", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe('Measure "Fleet utilization" by recorded by a person');
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.declared[0].slice(0, 4)).toEqual([ORG, "user-1", "admin", "kpi-1"]);
    expect(t.declared[0][4]).toEqual({ kind: "manual" });
  });

  it("turns its arguments into a declaration, or into nothing", () => {
    expect(sourceFor({ measuredBy: "person" })).toEqual({ kind: "manual" });
    expect(sourceFor({ measuredBy: "agent_runs", statistic: "cost_usd", windowDays: 7 })).toEqual({ kind: "agent_runs", statistic: "cost_usd", windowDays: 7 });
    expect(sourceFor({ measuredBy: "nothing" })).toBeNull();
    // Agent runs with no statistic measures nothing, rather than guessing one.
    expect(sourceFor({ measuredBy: "agent_runs" })).toBeNull();
  });
});

describe("find_kpis", () => {
  it("reports a KPI nobody measured as not measured, never as a number", async () => {
    const t = setup([{ toolCalls: [{ name: "find_kpis", arguments: {} }] }, (m) => {
      const r = lastTool(m).result;
      expect(r.kpis[0]).toMatchObject({ reads: "not measured", measuredBy: "Nothing measures this yet" });
      expect(r.kpis[0].howItWasMeantToBeMeasured).toContain("actively rented");
      return done("Nothing measures it.");
    }], kpi());
    await runTurn(t.deps, as("admin"), t.threadId, "What measures my outcomes?", t.onEvent);
    const proof = t.store.threadMessages(t.threadId).find((m) => m.proof?.context)?.proof;
    expect(proof!.context).toMatchObject({ status: "not_measured" });
  });

  it("reports a measured one with the value and when it was taken", async () => {
    const measured = kpi({ current: { value: 62.5, source: "manual", at: "2026-09-24T12:00:00.000Z" }, sourceKind: "manual", measuredBy: "Recorded by a person", lastReading: { value: 62.5, at: "2026-09-24T12:00:00.000Z", by: "admin", note: null } });
    const t = setup([{ toolCalls: [{ name: "find_kpis", arguments: { name: "fleet" } }] }, (m) => {
      expect(lastTool(m).result.kpis[0]).toMatchObject({ reads: "62.5 % (as of 2026-09-24)", lastRecorded: "62.5 % on 2026-09-24 by admin" });
      return done("It reads 62.5%.");
    }], measured);
    await runTurn(t.deps, as("admin"), t.threadId, "What does fleet utilization read?", t.onEvent);
  });

  it("is a read: no card, no permission gate", () => {
    expect(findKpisTool.confirm).toBe(false);
    expect(findKpisTool.permission).toBeUndefined();
  });
});
