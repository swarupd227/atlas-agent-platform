/**
 * Drawing a process flow from a conversation.
 *
 * The Studio has drawn flows from a description since it was built, behind its
 * "Describe workflow" panel. Cowork could talk about a process all day and
 * produce nothing — and a conversation is the better place for it, because the
 * clarifying questions the Studio asks in a modal are just talking.
 *
 * Two things this has to get right. The drafting must be the Studio's own, or
 * the two will draw different flows from the same words within a month. And
 * the flow shown on the card must be the flow that gets saved — so the drawn
 * graph travels in the frozen input rather than being drafted a second time.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { createProcessFlowTool, flowShape, stepLines } from "../server/astra/tools/process-flow";
import { askAstraAbout } from "../client/src/pages/process-flows";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const services = read("server", "astra", "services.ts");
const improvements = read("server", "routes", "improvements.ts");
const draftModule = read("server", "process-flow-draft.ts");
const slash = read("client", "src", "astra", "slash.ts");

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "user-1", role });

const nodes = [
  { id: "n1", type: "trigger", label: "Claim arrives", actor: "System" },
  { id: "n2", type: "make_decision", label: "Over £10k?", actor: "System" },
  { id: "n3", type: "expert_approval", label: "Underwriter signs off", actor: "Manager" },
  { id: "n4", type: "end", label: "Claim settled", actor: "System" },
];
const edges = [
  { id: "e1", from: "n1", to: "n2" },
  { id: "e2", from: "n2", to: "n3", label: "Over", condition: "amount > 10000" },
  { id: "e3", from: "n2", to: "n4", label: "Under", condition: "amount <= 10000" },
];

function setup(steps: Parameters<typeof scriptedComplete>[0], draft: Record<string, unknown> | Error, warnings: string[] = []) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const saved: any[] = [];
  const svc = {
    draftFlow: vi.fn(async () => {
      if (draft instanceof Error) throw draft;
      return { name: "Claims intake", nodes, edges, warnings, ...draft };
    }),
    saveFlow: vi.fn(async (orgId: string, name: string, graph: any) => {
      saved.push({ orgId, name, graph });
      return { id: "flow-1", name };
    }),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, createProcessFlowTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services: svc as any,
    model: "test",
  };
  return { store, threadId, deps, svc, saved, onEvent: () => {} };
}

const drawIt = (args: Record<string, unknown> = {}) => ({ toolCalls: [{ name: "create_process_flow", arguments: { description: "A claim arrives; over £10k an underwriter signs off; otherwise it settles.", ...args } }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);

describe("the card", () => {
  it("shows the shape of the flow and its steps before anything is saved", async () => {
    const t = setup([drawIt()], {});
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Draw our claims process", t.onEvent)).toBe("awaiting_confirmation");
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe('Create process flow "Claims intake"');
    const details = action.details!.join("\n");
    expect(details).toContain("4 steps · 1 decision · 1 approval · 2 conditional paths");
    expect(details).toContain("1. Claim arrives — System");
    expect(details).toContain("3. Underwriter signs off — Manager");
    expect(t.svc.saveFlow).not.toHaveBeenCalled();
  });

  it("puts what the compiler flagged in front of the person, not after saving", async () => {
    const t = setup([drawIt()], {}, ["The decision \"Over £10k?\" has a branch with no condition."]);
    await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.details!.join("\n")).toContain("Worth checking before you run it:");
    expect(action.details!.join("\n")).toContain("has a branch with no condition");
  });

  it("says plainly when there was nothing to flag, rather than staying silent", async () => {
    const t = setup([drawIt()], {});
    await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent);
    expect((await t.store.loadThread(t.threadId, ORG))!.pendingAction!.details!.join("\n")).toContain("The compiler found nothing to flag.");
  });

  it("says saving it doesn't run anything", async () => {
    const t = setup([drawIt()], {});
    await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent);
    expect((await t.store.loadThread(t.threadId, ORG))!.pendingAction!.details!.join("\n")).toContain("Nothing runs until you turn it into an automation");
  });
});

describe("holding what was drawn", () => {
  it("saves the flow from the card, not a second drawing of it", () => {
    // A confirm card's frozen input is what it SHOWS; run() is handed the
    // model's own arguments (see dispatch.ts), so the drawn graph is held.
    const tool = read("server", "astra", "tools", "process-flow.ts");
    expect(tool).toContain("holdDraft(draftKey(ctx.orgId, input)");
    expect(tool).toContain("const frozen = takeDraft(draftKey(ctx.orgId, input));");
  });

  it("refuses rather than saving a flow nobody has seen", () => {
    const tool = read("server", "astra", "tools", "process-flow.ts");
    expect(tool).toContain("no longer held (the server restarted)");
  });
});

describe("saving it", () => {
  it("saves the flow that was shown, without drawing a second one", async () => {
    const t = setup([drawIt(), (m) => { expect(lastTool(m).result).toMatchObject({ created: true, steps: 4, openIn: "/process-flows?flowId=flow-1" }); return done("Drawn."); }], {});
    await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);

    // Drafted once, in the preview; the confirm saves what that produced.
    expect(t.svc.draftFlow).toHaveBeenCalledTimes(1);
    expect(t.saved[0].graph.nodes).toHaveLength(4);
    expect(t.saved[0].name).toBe("Claims intake");
  });

  it("links to the Studio, which is where you edit it", async () => {
    // The turn continues after the tool runs, so the script needs the model's
    // closing answer as well as the call that opened the card.
    const t = setup([drawIt(), done("Drawn — open it in the Studio.")], {});
    await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    const message = t.store.threadMessages(t.threadId).at(-1)!;
    expect(message.role).toBe("astra");
    expect(JSON.stringify(message.artifacts)).toContain("Claims intake");
  });

  it("Not now saves nothing", async () => {
    const t = setup([drawIt(), (m) => { expect(lastTool(m)).toMatchObject({ declined: true }); return done("Left it."); }], {});
    await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "cancel", t.onEvent);
    expect(t.svc.saveFlow).not.toHaveBeenCalled();
  });
});

describe("when it can't draw one", () => {
  it("asks for a description rather than drawing an empty flow", async () => {
    const t = setup([{ toolCalls: [{ name: "create_process_flow", arguments: {} }] }, (m) => { expect(lastTool(m).error).toContain("Describe the process"); return done("What happens first?"); }], {});
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Draw a flow", t.onEvent)).toBe("idle");
    expect(t.svc.draftFlow).not.toHaveBeenCalled();
  });

  it("says so when the draft came back with no steps", async () => {
    const t = setup([drawIt(), (m) => { expect(lastTool(m).error).toContain("Say what starts it"); return done("Tell me more."); }], { nodes: [], edges: [] });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent)).toBe("idle");
  });

  it("passes on the reason drafting failed instead of a generic error", async () => {
    const t = setup([drawIt(), (m) => { expect(lastTool(m).error).toContain("isn't configured"); return done("Can't."); }], new Error("Drafting a flow isn't configured on this deployment."));
    await runTurn(t.deps, as("admin"), t.threadId, "Draw it", t.onEvent);
  });
});

describe("one generator, two callers", () => {
  it("the Studio's route now calls the shared module rather than its own prompt", () => {
    expect(improvements).toContain("const draft = await draftProcessFlow({");
    // The prompt lives in one place; the route must not carry a second copy.
    expect(improvements).not.toContain("You are a business process design assistant");
    expect(draftModule).toContain("You are a business process design assistant");
  });

  it("Astra drafts through the same module, and compiles what it drew", () => {
    expect(services).toContain("await draftProcessFlow({ description: input.description, fileIds: input.fileIds, orgId });");
    // The same check the Studio's "Check flow" button runs.
    expect(services).toContain("compileProcessFlow(graph)");
  });

  it("takes an attached document as the description, which is how people start", () => {
    expect(draftModule).toContain("derive the workflow from them");
    expect(draftModule).toContain("buildSourceDocuments");
    expect(services).toContain("fileIds: input.fileIds");
  });
});

describe("the shape, in words", () => {
  it("counts only what is there", () => {
    expect(flowShape(nodes, edges)).toBe("4 steps · 1 decision · 1 approval · 2 conditional paths");
    expect(flowShape([{ id: "n1", type: "trigger", label: "Starts" }], [])).toBe("1 step");
  });

  it("lists the first steps and says how many more there are", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `n${i}`, type: "take_action", label: `Step ${i}` }));
    const lines = stepLines(many);
    expect(lines).toHaveLength(13);
    expect(lines.at(-1)).toBe("…and 3 more");
  });
});

describe("coming back to a flow from the Studio", () => {
  it("hands over which flow it is, and leaves the change to the person", () => {
    const studio = read("client", "src", "pages", "process-flows.tsx");
    const layout = read("client", "src", "astra", "astra-layout.tsx");
    expect(studio).toContain('data-testid="button-ask-astra-about-flow"');
    // The id travels, so the conversation doesn't open by asking which flow.
    expect(askAstraAbout("Claims intake", "flow-1")).toBe('In the process flow "Claims intake" (flow flow-1), ');
    // Put in the box, not sent: a message sent by a link is one nobody chose.
    expect(layout).toContain('setComposerInsert({ text: asked, nonce: Date.now(), replace: true });');
    expect(layout).toContain('params.delete("ask");');
  });

  it("is only offered for a flow that has been saved", () => {
    const studio = read("client", "src", "pages", "process-flows.tsx");
    const at = studio.indexOf('data-testid="button-ask-astra-about-flow"');
    expect(studio.slice(at - 600, at)).toContain("{savedFlowId && (");
  });
});

describe("/flow", () => {
  it("covers drawing a new flow and changing one that exists", () => {
    expect(slash).toContain('name: "flow"');
    expect(slash).toContain("If I named an existing flow, find it and change only what I asked for");
    expect(slash).toContain("show me the steps before creating it");
  });
});
