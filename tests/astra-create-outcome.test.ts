/**
 * create_outcome through the Astra confirm loop, with fake services.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { createOutcomeTool } from "../server/astra/tools/create-outcome";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "user-1", role });

const draft = {
  name: "Reduce DSO",
  description: "Collect receivables faster across all branches",
  riskTier: "HIGH",
  kpis: [
    { name: "Days sales outstanding", unit: "days", target: 45, targetOperator: "<=" },
    { name: "Promise-to-pay kept", unit: "%", target: 80, baseline: 62 },
  ],
};

function setup(steps: Parameters<typeof scriptedComplete>[0], existing: Array<{ id: string; name: string; status: string }> = []) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const outcomes = [...existing];
  const created: any[] = [];
  const services = {
    checkOutcomeDraft: vi.fn(async () => ({})),
    getAgent: vi.fn(async (org: string, id: string) => (org === ORG && id === "ag-1" ? { id } : undefined)),
    findSimilarOutcomes: vi.fn(async (_org: string, name: string) => outcomes.filter((o) => o.name.toLowerCase() === name.toLowerCase())),
    getUserDisplayName: vi.fn(async () => "admin"),
    createOutcome: vi.fn(async (org: string, actor: string, body: any) => {
      created.push({ org, actor, body });
      return {
        outcome: { id: "out-9", name: body.outcome.name, description: body.outcome.description, status: "pending_review", riskTier: body.outcome.riskTier },
        kpis: body.kpis.map((k: any) => ({ ...k, baseline: k.baseline ?? null })),
        approval: { id: "apr-9" },
        boundAgents: 0,
      };
    }),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, createOutcomeTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, created, outcomes, onEvent: () => {} };
}

const create = (args: Record<string, unknown> = draft) => ({ toolCalls: [{ name: "create_outcome", arguments: args }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;

describe("create_outcome", () => {
  it("shows the KPIs on the card (baselines not given say so) and creates it pending review on Confirm", async () => {
    const t = setup([create(), (m) => { expect(lastTool(m).result).toMatchObject({ created: true, status: "pending_review", reviewApprovalId: "apr-9" }); return done("Created."); }]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Create it", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe("Create outcome: Reduce DSO");
    expect(action.details).toContain("Days sales outstanding: <= 45 days (baseline not given)");
    expect(action.details).toContain("Promise-to-pay kept: >= 80 % (baseline 62 %)");
    expect(t.services.createOutcome).not.toHaveBeenCalled();

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.created).toHaveLength(1);
    expect(t.created[0].org).toBe(ORG);
    expect(t.created[0].body.kpis[0]).not.toHaveProperty("baseline");
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.artifacts[0]).toMatchObject({ kind: "outcome", fullViewHref: "/outcomes/out-9" });
    expect(final.proof!.compliance).toMatchObject({ summary: expect.stringContaining("apr-9") });
  });

  it("warns about a similar outcome, and refuses if one appears after the card was shown", async () => {
    const t = setup([create(), (m) => { expect(lastTool(m).error).toContain("created after the confirm card"); return done("Someone else just created it."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Create it", t.onEvent);
    expect((await pending(t)).warnings ?? []).toHaveLength(0);
    t.outcomes.push({ id: "out-x", name: "Reduce DSO", status: "pending_review" });
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);
    expect(t.services.createOutcome).not.toHaveBeenCalled();
  });

  it("lists a similar outcome that already existed as a warning", async () => {
    const t = setup([create()], [{ id: "out-1", name: "Reduce DSO", status: "active" }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Create it", t.onEvent);
    expect((await pending(t)).warnings![0]).toMatchObject({ title: "A similar outcome exists", detail: "Reduce DSO (active)" });
  });

  it("Not now creates nothing", async () => {
    const t = setup([create(), done("Okay.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Create it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "cancel", t.onEvent);
    expect(t.services.createOutcome).not.toHaveBeenCalled();
  });

  it("refuses to attach an agent from outside the organization", async () => {
    const t = setup([create({ ...draft, acceptedAgentIds: ["ag-other"] }), (m) => { expect(lastTool(m).error).toContain("No agent ag-other"); return done("That agent isn't yours."); }]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Create it", t.onEvent)).toBe("idle");
  });

  it("isn't offered to roles that can't create outcomes", async () => {
    for (const role of ["finance", "ops_sre"] as RoleId[]) {
      const t = setup([create(), (m) => { expect(lastTool(m).error).toMatch(/No tool named "create_outcome"/); return done("Can't."); }]);
      await runTurn(t.deps, as(role), t.threadId, "Create it", t.onEvent);
      expect(t.services.createOutcome).not.toHaveBeenCalled();
    }
  });
});
