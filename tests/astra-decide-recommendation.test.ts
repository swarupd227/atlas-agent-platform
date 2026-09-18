/**
 * decide_recommendation and acknowledge_alert through the Astra confirm loop,
 * with fake services.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { decideRecommendationTool } from "../server/astra/tools/decide-recommendation";
import { acknowledgeAlertTool } from "../server/astra/tools/acknowledge-alert";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "user-1", role });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);

const workflowRec = () => ({
  id: "rec-1", title: "Reduce Invoice Agent latency", description: null, status: "pending", severity: "high",
  estimatedImpact: "Reduce latency from 25265ms to ~15159ms",
  agent: { id: "ag-1", name: "Invoice Agent" },
  effect: { kind: "manual", work: "Workflow changes aren't applied automatically (parallel steps): someone still has to change the agent or its team." },
});
const downgradeRec = () => ({ ...workflowRec(), title: "Cut Invoice Agent cost", effect: { kind: "model_downgrade", from: "gpt-4.1", to: "gpt-4.1-mini" } });

function setup(steps: Parameters<typeof scriptedComplete>[0], rec: Record<string, any>, alert?: Record<string, any>) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const services = {
    getRecommendationForDecision: vi.fn(async (org: string, id: string) => (org === ORG && id === rec.id ? { ...rec } : null)),
    decideRecommendationAs: vi.fn(async (_o: string, _u: string, _l: string, id: string, decision: string) => ({
      recommendation: { id, title: rec.title, status: decision === "accept" ? "applied" : "dismissed" },
      agent: rec.agent,
      changed: decision === "accept" && rec.effect.kind === "model_downgrade" ? { from: rec.effect.from, to: rec.effect.to } : null,
      stillToDo: decision === "accept" && rec.effect.kind === "manual" ? rec.effect.work : null,
    })),
    getAlertForDecision: vi.fn(async (org: string, id: string) => (alert && org === ORG && id === alert.id ? { ...alert } : null)),
    acknowledgeAlertAs: vi.fn(async (_o: string, _u: string, _l: string, id: string) => ({ alert: { id, agentName: alert!.agentName, message: alert!.message, acknowledged: true } })),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, decideRecommendationTool, acknowledgeAlertTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, onEvent: () => {} };
}

const decide = (decision = "accept") => ({ toolCalls: [{ name: "decide_recommendation", arguments: { recommendationId: "rec-1", decision } }] });

describe("decide_recommendation", () => {
  it("says accepting a workflow change changes nothing automatically, labels the impact as an estimate, and on Confirm reports the work still to do", async () => {
    const t = setup([decide(), (m) => { expect(lastTool(m).result).toMatchObject({ decided: true, changed: null, stillToDo: expect.stringContaining("aren't applied automatically") }); return done("Accepted."); }], workflowRec());
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Accept it", t.onEvent)).toBe("awaiting_confirmation");
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe("Accept recommendation: Reduce Invoice Agent latency");
    const details = action.details!.join(" ");
    expect(details).toContain("nothing changes automatically");
    expect(details).toContain("the recommender's estimate, not measured");
    expect(t.services.decideRecommendationAs).not.toHaveBeenCalled();
    expect(await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent)).toBe("idle");
    expect(t.services.decideRecommendationAs).toHaveBeenCalledWith(ORG, "user-1", "admin", "rec-1", "accept", undefined);
  });

  it("names the model change when accepting a downgrade", async () => {
    const t = setup([decide()], downgradeRec());
    await runTurn(t.deps, as("admin"), t.threadId, "Accept it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.details![0]).toBe("Invoice Agent's model changes from gpt-4.1 to gpt-4.1-mini.");
  });

  it("isn't offered to a role without approve_changes, and refuses one already decided", async () => {
    expect(new ToolRegistry([decideRecommendationTool], hasPermission).forRole("agent_engineer").map((x) => x.name)).not.toContain("decide_recommendation");
    const t = setup([decide(), (m) => { expect(lastTool(m).error).toContain("already applied"); return done("Can't."); }], { ...workflowRec(), status: "applied" });
    await runTurn(t.deps, as("admin"), t.threadId, "Accept it", t.onEvent);
    expect(t.services.decideRecommendationAs).not.toHaveBeenCalled();
  });
});

describe("acknowledge_alert", () => {
  it("says acknowledging doesn't fix anything, and acknowledges on Confirm", async () => {
    const alert = { id: "al-1", agentName: "Invoice Agent", message: "Success rate dropped to 62%", severity: "critical", acknowledged: false, triggeredAt: null };
    const t = setup([{ toolCalls: [{ name: "acknowledge_alert", arguments: { alertId: "al-1" } }] }, (m) => { expect(lastTool(m).result).toMatchObject({ acknowledged: true }); return done("Done."); }], workflowRec(), alert);
    await runTurn(t.deps, as("ops_sre"), t.threadId, "Acknowledge it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe("Acknowledge alert on Invoice Agent");
    expect(action.details!.join(" ")).toContain("isn't fixed by acknowledging it");
    await resolveAction(t.deps, as("ops_sre"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.services.acknowledgeAlertAs).toHaveBeenCalledWith(ORG, "user-1", "admin", "al-1", undefined);
  });
});
