/**
 * server/action-decisions.ts: accepting or dismissing a recommendation and
 * acknowledging an alert -- honest about what changes, scoped to the
 * organization, audited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  rows: new Map<unknown, any[]>(),
  updates: [] as Array<{ table: unknown; set: any }>,
  agents: new Map<string, any>(),
  audit: [] as any[],
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: (table: unknown) => ({ where: async () => state.rows.get(table) ?? [] }) }),
    update: (table: unknown) => ({ set: (set: any) => ({ where: async () => { state.updates.push({ table, set }); } }) }),
  },
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string, orgId?: string) => {
      const a = state.agents.get(id);
      return a && (!orgId || a.organizationId === orgId) ? { ...a } : undefined;
    }),
    updateAgent: vi.fn(async (id: string, data: any) => { state.agents.set(id, { ...state.agents.get(id), ...data }); return {}; }),
    createAuditEvent: vi.fn(async (e: any) => { state.audit.push(e); return e; }),
  },
}));

import { agentAlerts, improvementRecommendations } from "@shared/schema";
import { ActionDecisionError, acknowledgeAlert, decideRecommendation, recommendationEffect } from "../server/action-decisions";

const actor = { orgId: "org-a", actorId: "user-1", actorLabel: "admin", via: "test" };
const rec = (over: Record<string, unknown> = {}) => ({
  id: "rec-1", agentId: "ag-1", title: "Reduce Invoice Agent latency", status: "pending",
  suggestedChanges: { action: "workflow_optimization", strategies: ["parallel_steps", "async_tool_calls"] },
  ...over,
});

beforeEach(() => {
  state.rows.clear();
  state.updates.length = 0;
  state.audit.length = 0;
  state.agents.clear();
  state.agents.set("ag-1", { id: "ag-1", name: "Invoice Agent", organizationId: "org-a", modelName: "gpt-4.1" });
});

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return e instanceof ActionDecisionError ? e.code : String(e); }
};

describe("recommendationEffect", () => {
  it("a cost optimization with a mapped model is a real downgrade", () => {
    expect(recommendationEffect({ agentId: "ag-1", suggestedChanges: { action: "cost_optimization", strategies: ["model_downgrade"] } }, { modelName: "gpt-4.1" }))
      .toEqual({ kind: "model_downgrade", agentId: "ag-1", from: "gpt-4.1", to: "gpt-4.1-mini" });
  });

  it("retraining and workflow changes are work still to do, not something accepting performs", () => {
    expect(recommendationEffect({ agentId: "ag-1", suggestedChanges: { action: "retrain" } }, null)).toMatchObject({ kind: "manual", work: expect.stringContaining("Retraining isn't automated") });
    expect(recommendationEffect(rec() as any, null)).toMatchObject({ kind: "manual", work: expect.stringContaining("parallel steps, async tool calls") });
    expect(recommendationEffect({ agentId: "ag-1", suggestedChanges: { action: "cost_optimization", strategies: ["model_downgrade"] } }, { modelName: "some-model" }))
      .toMatchObject({ kind: "manual", work: expect.stringContaining("no cheaper model mapped for some-model") });
  });
});

describe("decideRecommendation", () => {
  it("accepting a workflow change records it, changes nothing, and says what's still to do", async () => {
    state.rows.set(improvementRecommendations, [rec()]);
    const r = await decideRecommendation({ ...actor, recommendationId: "rec-1", decision: "accept" });
    expect(r).toMatchObject({ changed: null, stillToDo: expect.stringContaining("aren't applied automatically"), recommendation: { status: "applied" } });
    expect(state.updates[0].set).toMatchObject({ status: "applied" });
    expect(state.agents.get("ag-1").modelName).toBe("gpt-4.1");
    expect(state.audit).toEqual([expect.objectContaining({ organizationId: "org-a", action: "recommendation_accepted", details: expect.stringContaining("nothing changed automatically") })]);
  });

  it("accepting a model downgrade changes the agent's model, audited twice", async () => {
    state.rows.set(improvementRecommendations, [rec({ suggestedChanges: { action: "cost_optimization", strategies: ["model_downgrade"] } })]);
    const r = await decideRecommendation({ ...actor, recommendationId: "rec-1", decision: "accept" });
    expect(r.changed).toEqual({ from: "gpt-4.1", to: "gpt-4.1-mini" });
    expect(state.agents.get("ag-1").modelName).toBe("gpt-4.1-mini");
    expect(state.audit.map((e) => e.action)).toEqual(["agent_model_downgraded", "recommendation_accepted"]);
  });

  it("dismissing changes nothing on the agent", async () => {
    state.rows.set(improvementRecommendations, [rec({ suggestedChanges: { action: "cost_optimization", strategies: ["model_downgrade"] } })]);
    const r = await decideRecommendation({ ...actor, recommendationId: "rec-1", decision: "dismiss" });
    expect(r).toMatchObject({ changed: null, stillToDo: null, recommendation: { status: "dismissed" } });
    expect(state.agents.get("ag-1").modelName).toBe("gpt-4.1");
  });

  it("refuses another organization's agent and an already-decided recommendation", async () => {
    state.rows.set(improvementRecommendations, [rec()]);
    expect(await code(decideRecommendation({ ...actor, orgId: "org-b", recommendationId: "rec-1", decision: "dismiss" }))).toBe("not_found");
    state.rows.set(improvementRecommendations, [rec({ status: "applied" })]);
    expect(await code(decideRecommendation({ ...actor, recommendationId: "rec-1", decision: "dismiss" }))).toBe("not_pending");
    expect(state.audit).toHaveLength(0);
  });
});

describe("acknowledgeAlert", () => {
  it("acknowledges an alert in the organization, audited, and refuses others", async () => {
    state.rows.set(agentAlerts, [{ id: "al-1", orgId: "org-a", agentName: "Invoice Agent", message: "Success rate dropped to 62%", acknowledgedAt: null }]);
    await acknowledgeAlert({ ...actor, alertId: "al-1" });
    expect(state.updates[0].set).toHaveProperty("acknowledgedAt");
    expect(state.audit).toEqual([expect.objectContaining({ organizationId: "org-a", action: "alert_acknowledged" })]);
    expect(await code(acknowledgeAlert({ ...actor, orgId: "org-b", alertId: "al-1" }))).toBe("not_found");
    state.rows.set(agentAlerts, [{ id: "al-1", orgId: "org-a", agentName: "x", message: "y", acknowledgedAt: new Date() }]);
    expect(await code(acknowledgeAlert({ ...actor, alertId: "al-1" }))).toBe("not_pending");
  });
});
