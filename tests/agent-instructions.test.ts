/**
 * Changing what an agent is told to do, from the conversation.
 *
 * The second gap an outside-in look found: after watching an automation run
 * once, the most common sentence anyone says is "be stricter about coastal
 * wind", and there was no update_agent tool at all -- only the agent page.
 *
 * What this file pins is the four things that make the edit honest rather than
 * merely possible:
 * - the two fields are different promises and the card shows both, because
 *   editing one while the other says something else is how an agent ends up
 *   ignoring the change;
 * - the field is REPLACED, so the tool takes the whole text;
 * - the edit reaches a live deployment's next run with nothing gating it;
 * - an agent drafted from a process-flow step loses the edit the next time that
 *   flow is synced, which only this warning would ever tell anyone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call, assertNoStepErrors, type ScriptedComplete } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { AGENT_INSTRUCTION_TOOLS } from "../server/astra/tools/agent-instructions";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "insurance" });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const STANDING = "You assess coastal property risk. Flag anything within 1 mile of the shoreline.";
const TASK = "Score the submission's wind exposure and write the aggregate.";

interface Options {
  standing?: string;
  task?: string;
  deployments?: Array<{ id: string; environment: string; status: string; version: string | null }>;
  fromFlow?: { teamName: string; stepLabel: string } | null;
  evalSuites?: number;
  autonomyMode?: string;
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const applied: any[] = [];
  const task = opts.task ?? TASK;
  const services = {
    listAgents: vi.fn(async () => [{ id: "a1", name: "Wind Exposure Scorer", organizationId: ORG }]),
    agentInstructionContext: vi.fn(async (_org: string, agentId: string) => ({
      agent: { id: agentId, name: "Wind Exposure Scorer", status: "active", riskTier: "HIGH", autonomyMode: opts.autonomyMode ?? "assisted", agentType: "single", outcomeId: "out-1" },
      standing: opts.standing ?? STANDING,
      task,
      taskFallsBackToDescription: !task,
      description: "Scores wind exposure",
      drivenBy: task ? "task" : "description",
      deployments: opts.deployments ?? [],
      fromFlow: opts.fromFlow ?? null,
      evalSuites: opts.evalSuites ?? 0,
    })),
    updateAgentInstructionsAs: vi.fn(async (_org: string, _uid: string | null, actor: string, input: any) => {
      applied.push({ actor, ...input });
      return { agent: { id: input.agentId, name: "Wind Exposure Scorer" }, target: input.target, before: input.target === "standing" ? (opts.standing ?? STANDING) : task, after: input.text };
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const complete = scriptedComplete(steps);
  lastComplete = complete;
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, ...AGENT_INSTRUCTION_TOOLS], hasPermission),
    complete,
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, applied, onEvent: () => {} };
}

const look = (args: Record<string, unknown> = { agent: "Wind Exposure Scorer" }) => ({ toolCalls: [{ name: "get_agent_instructions", arguments: args }] });
const change = (args: Record<string, unknown>) => ({ toolCalls: [{ name: "update_agent_instructions", arguments: args }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
const STRICTER = "You assess coastal property risk. Flag anything within 5 miles of the shoreline, and treat any named-storm history as high risk.";

beforeEach(() => vi.clearAllMocks());

/**
 * The engine catches whatever complete() throws, so an expect() inside a script
 * step would end the turn quietly and leave the test passing. This rethrows it.
 */
let lastComplete: ScriptedComplete | null = null;
afterEach(() => assertNoStepErrors(lastComplete));

describe("reading what an agent is told", () => {
  it("gives both fields, and says which one the runtime would use for the task", async () => {
    const t = setup([
      look(),
      (m) => {
        const p = lastTool(m).result;
        expect(p.standingInstructions).toBe(STANDING);
        expect(p.taskInstructions).toBe(TASK);
        expect(p.message).toContain("standing instructions set");
        return done("Here they are.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "What is the wind scorer told to do?", t.onEvent);
  });

  it("says when it has no task instructions of its own, because then its description is the task", async () => {
    const t = setup([look(), (m) => { expect(lastTool(m).result.note).toContain("handed its description"); return done("It uses its description."); }], { task: "" });
    await runTurn(t.deps, as("admin"), t.threadId, "What is it told?", t.onEvent);
  });
});

describe("changing them", () => {
  it("shows the text now beside the text after, and leaves the other field alone", async () => {
    const t = setup([change({ agent: "Wind Exposure Scorer", target: "standing", instructions: STRICTER }), done("Changed.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Be stricter about coastal wind", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe("Change Wind Exposure Scorer's standing instructions");
    const details = action.details!.join("\n");
    expect(details).toContain("Now:");
    expect(details).toContain("1 mile of the shoreline");
    expect(details).toContain("After:");
    expect(details).toContain("5 miles of the shoreline");
    // The field it is NOT changing is on the card too: an edit to one while the
    // other contradicts it is how an agent appears to ignore the change.
    expect(details).toContain("Its task instructions are untouched");
    expect(t.services.updateAgentInstructionsAs).not.toHaveBeenCalled();

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.applied).toEqual([{ actor: "admin", agentId: "a1", target: "standing", text: STRICTER }]);
  });

  it("says a live deployment picks this up at its next run, with nothing gating it", async () => {
    const t = setup([change({ agent: "Wind Exposure Scorer", target: "standing", instructions: STRICTER }), done("Changed.")], {
      deployments: [{ id: "d1", environment: "prod", status: "active", version: "3" }],
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Be stricter", t.onEvent);
    const warning = (await pending(t)).warnings!.find((w) => w.title.includes("prod"))!;
    expect(warning.title).toContain("reaches prod at the next run");
    expect(warning.detail).toContain("Nothing gates it");
  });

  it("warns that a flow sync would take the edit back, because only this says so", async () => {
    const t = setup([change({ agent: "Wind Exposure Scorer", target: "standing", instructions: STRICTER }), done("Changed.")], {
      fromFlow: { teamName: "E&S Binding Team", stepLabel: "Score wind exposure" },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Be stricter", t.onEvent);
    const warning = (await pending(t)).warnings!.find((w) => w.title.includes("drafted from the step"))!;
    expect(warning.detail).toContain("losing this edit");
    expect(warning.detail).toContain("change the step too");
  });

  it("points at the evals, because a pass rate from before the change says nothing about after it", async () => {
    const t = setup([change({ agent: "Wind Exposure Scorer", target: "task", instructions: "Score wind exposure including named-storm history." }), done("Changed.")], { evalSuites: 2 });
    await runTurn(t.deps, as("admin"), t.threadId, "Change the task", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).toContain("Its 2 eval suites were written against the old instructions");
  });

  it("flags an autonomous agent, which acts on the new text unsupervised", async () => {
    const t = setup([change({ agent: "Wind Exposure Scorer", target: "standing", instructions: STRICTER }), done("Changed.")], { autonomyMode: "autonomous" });
    await runTurn(t.deps, as("admin"), t.threadId, "Be stricter", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).toContain("This agent acts without asking");
  });

  it("refuses text identical to what is already there", async () => {
    const t = setup([change({ agent: "Wind Exposure Scorer", target: "standing", instructions: STANDING }), (m) => { expect(lastTool(m).error).toContain("word for word"); return done("No change."); }]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Set it to the same thing", t.onEvent)).toBe("idle");
    expect(t.services.updateAgentInstructionsAs).not.toHaveBeenCalled();
  });

  it("refuses an agent that isn't this organization's", async () => {
    const t = setup([change({ agent: "Someone Else", target: "standing", instructions: STRICTER }), (m) => { expect(lastTool(m).error).toContain('No agent named "Someone Else"'); return done("Not here."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Change it", t.onEvent);
  });

  it("is not offered to a role that can't change agents, while reading them is", () => {
    const registry = setup([]).deps.registry;
    const names = (role: RoleId) => registry.canonicalDefinitions(role).map((d) => d.name);
    expect(names("admin")).toContain("update_agent_instructions");
    expect(names("outcome_owner")).toContain("get_agent_instructions");
    expect(names("outcome_owner")).not.toContain("update_agent_instructions");
  });

  it("takes the whole field, so the tool's own description says a fragment deletes the rest", () => {
    const tool = AGENT_INSTRUCTION_TOOLS.find((t) => t.name === "update_agent_instructions")!;
    expect(tool.description).toContain("COMPLETE new text");
    expect(tool.description).toContain("it replaces the field");
  });
});

describe("what the change is recorded as", () => {
  it("keeps the text before and after on the audit event, and names the surface", () => {
    const action = read("server", "agent-instructions.ts");
    expect(action).toContain('action: "agent.config_changed"');
    expect(action).toContain("before,");
    expect(action).toContain("after: text,");
    expect(action).toContain('via: "Astra Cowork"');
  });

  it("merges into runtimeConfig rather than replacing it, so nobody's model options are dropped", () => {
    const action = read("server", "agent-instructions.ts");
    expect(action).toContain("runtimeConfig: { ...rt, prompt: text }");
  });

  it("tells the model both fields exist and that an edit is not free", () => {
    const prompt = read("server", "astra", "prompt.ts");
    expect(prompt).toContain("pass the COMPLETE new text");
    expect(prompt).toContain("loses the edit the next time that flow is synced");
  });
});
