/**
 * propose_team through the engine, with a fake proposal service.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { proposeTeamTool } from "../server/astra/tools/propose-team";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext, AstraEvent } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "equipment_dealer" });

const plan = {
  proposalId: "prop-1",
  orchestrator: { name: "Collections Team", description: "Runs collections" },
  pipeline: { pattern: "sequential", description: "Gather, decide, approve, notify" },
  agents: [
    { name: "Gather AR", role: "data", description: "Pulls open AR", tools: [{ name: "get_open_ar" }], systemPrompt: "SECRET PROMPT", estimatedImpact: "Cuts DSO by 12 days", matchedOntologyConcepts: ["Open Receivable"] },
    { name: "Manager Approval", role: "approval", description: "A person approves", isHumanCheckpoint: true },
  ],
};

function setup(steps: Parameters<typeof scriptedComplete>[0], service: (...args: any[]) => Promise<any>) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const events: AstraEvent[] = [];
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, proposeTeamTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services: { proposeTeamForOutcome: vi.fn(service) },
    model: "test",
  };
  return { store, threadId, deps, events, onEvent: (e: AstraEvent) => events.push(e) };
}

const propose = { toolCalls: [{ name: "propose_team", arguments: { outcomeId: "out-1" } }] };
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);

describe("propose_team", () => {
  it("narrates the planner's progress, and returns a compact plan with binding issues and gates", async () => {
    const t = setup(
      [propose, (m) => {
        const r = lastTool(m).result;
        expect(r).toMatchObject({ proposed: true, proposalId: "prop-1", orchestrator: "Collections Team", pattern: "sequential", approvalGates: ["Manager Approval"], bindingIssues: 1 });
        expect(r.workers[0]).toMatchObject({ name: "Gather AR", connectors: ["Dealer Operations"], issues: ["missing tool"] });
        expect(JSON.stringify(r)).not.toContain("SECRET PROMPT");
        expect(JSON.stringify(r)).not.toContain("Cuts DSO");
        return done("Here's the proposed team.");
      }],
      async (org, outcomeId, industryId, feedback, onProgress) => {
        expect([org, outcomeId, industryId, feedback]).toEqual([ORG, "out-1", "equipment_dealer", undefined]);
        onProgress("Gathering templates, skills, policies, and connected systems...");
        onProgress("Gathering templates, skills, policies, and connected systems...");
        onProgress("Drafting your team with AI (up to ~110s for a plan this size)...");
        return {
          ok: true,
          outcome: { id: "out-1", name: "Reduce DSO", status: "awaiting_agent_plan", riskTier: "HIGH" },
          plan,
          proposalId: "prop-1",
          bindings: {
            agents: [{ name: "Gather AR", connectors: ["Dealer Operations"], issues: [{ code: "tool_not_on_server", message: "missing tool" }] }, { name: "Manager Approval", connectors: [], issues: [] }],
            issues: [{ code: "tool_not_on_server", message: "missing tool" }],
            connectorsChecked: 9,
          },
        };
      },
    );
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Propose a team", t.onEvent)).toBe("idle");

    const labels = t.events.filter((e) => e.type === "working").map((e: any) => e.label);
    expect(labels).toContain("Gathering templates, skills, policies, and connected systems");
    expect(labels.filter((l) => l.startsWith("Gathering"))).toHaveLength(1);

    const final = t.store.threadMessages(t.threadId).at(-1)!;
    const card = final.artifacts[0];
    expect(card).toMatchObject({ kind: "teamProposal", fullViewHref: "/outcomes/out-1" });
    expect(card.props.workers[0]).toMatchObject({ estimatedImpact: "Cuts DSO by 12 days", isHumanCheckpoint: false });
    expect(final.proof!.compliance).toMatchObject({ summary: "1 approval gate in the plan · 1 connector binding issue" });
    expect(final.proof!.industry).toMatchObject({ summary: "Open Receivable" });
  });

  it("says why when no plan comes back", async () => {
    const t = setup(
      [propose, (m) => { expect(lastTool(m).result).toMatchObject({ proposed: false, error: "Too large", tip: expect.any(String) }); return done("Too big."); }],
      async () => ({ ok: false, error: "Too large", likelyTooLarge: true }),
    );
    await runTurn(t.deps, as("admin"), t.threadId, "Propose", t.onEvent);
  });

  it("isn't offered to roles that can't build teams", async () => {
    const service = vi.fn();
    const t = setup([propose, (m) => { expect(lastTool(m).error).toMatch(/No tool named "propose_team"/); return done("Can't."); }], service as any);
    await runTurn(t.deps, as("outcome_owner"), t.threadId, "Propose", t.onEvent);
    expect(service).not.toHaveBeenCalled();
  });
});

describe("isUntouchedStarterFlow", () => {
  it("recognizes the starter flow a new outcome gets, and not a flow someone edited", async () => {
    const { starterFlow, stepsToGraph, isUntouchedStarterFlow } = await import("../shared/process-flow");
    expect(isUntouchedStarterFlow(starterFlow("Fleet", "LOW"), "Fleet", "LOW")).toBe(true);
    expect(isUntouchedStarterFlow(starterFlow("Fleet", "HIGH"), "Fleet", "HIGH")).toBe(true);
    expect(isUntouchedStarterFlow(starterFlow("Fleet", "LOW"), "Fleet", "HIGH")).toBe(false);
    const edited = stepsToGraph("Fleet", [
      { type: "trigger", label: "Unit returned" },
      { type: "expert_approval", label: "Branch manager approves transfer" },
      { type: "end", label: "Done" },
    ] as any);
    expect(isUntouchedStarterFlow(edited, "Fleet", "LOW")).toBe(false);
  });
});
