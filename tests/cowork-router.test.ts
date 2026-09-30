/**
 * The Cowork pack pre-router (Phase 3, item 6). Before the model's first call
 * of a turn the engine asks an injected router which studio packs the message
 * will need, and loads the ones it names; when the turn ends it tells the
 * router which packs the model loaded itself. The production wiring backs the
 * router with the decision seam on "cowork_router": measured in shadow, used
 * once routed. The engine reaches nothing new, and without a router a turn is
 * exactly what it was.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { runTurn, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext, AstraTool } from "../server/astra/types";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role });

const coreTool: AstraTool = { name: "list_things", description: "Core.", input: z.object({}), confirm: false, run: async () => ({ payload: { ok: true } }) };
const govTool: AstraTool = { name: "explain_policies", description: "Governance.", input: z.object({}), confirm: false, pack: "governance", run: async () => ({ payload: { policies: 3 } }) };
const deployTool: AstraTool = { name: "deploy_agent", description: "Deploy.", input: z.object({}), confirm: false, pack: "deploy", permission: "deploy_staging_pilot", run: async () => ({ payload: {} }) };
const registry = () => new ToolRegistry([finishTurnTool, loadToolsTool, coreTool, govTool, deployTool], hasPermission);
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);

function setup(steps: Parameters<typeof scriptedComplete>[0], predict: (...a: any[]) => Promise<string[]>) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const complete = scriptedComplete(steps);
  const route = { predict: vi.fn(predict), record: vi.fn() };
  const deps: EngineDeps = { store, registry: registry(), complete, can: hasPermission, audit: vi.fn(async () => {}), services: {}, model: "test", route };
  return { store, threadId, deps, complete, route };
}
const offeredTools = (t: ReturnType<typeof setup>, i: number) => (t.complete.requests[i].options.tools ?? []).map((d: any) => d.name);

describe("a router that predicts a pack", () => {
  it("loads it before the model's first call, so the turn starts with its tools and spends no step on load_tools", async () => {
    const t = setup([{ toolCalls: [{ name: "explain_policies", arguments: {} }] }, done("Three policies apply.")], async () => ["governance"]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Which policies apply to the billing agent?", () => {})).toBe("idle");
    expect(t.route.predict).toHaveBeenCalledTimes(1);
    const [, text, offered] = t.route.predict.mock.calls[0];
    expect(text).toBe("Which policies apply to the billing agent?");
    expect(offered.map((p: any) => p.id)).toEqual(["governance", "deploy"]);
    expect(offered[0].description).toContain("Governance: ");
    expect(offeredTools(t, 0)).toContain("explain_policies");
    expect((await t.store.loadThread(t.threadId, ORG))!.checkpoint.loadedPacks).toEqual(["governance"]);
    // The router loaded it, the model did not: nothing to record as the model's own.
    expect(t.route.record).toHaveBeenCalledWith(expect.anything(), "Which policies apply to the billing agent?", expect.any(Array), []);
  });

  it("can only add a pack the role could load itself, and ignores names it was not offered", async () => {
    const t = setup([done("Noted.")], async () => ["deploy", "not_a_pack", "governance", "governance"]);
    await runTurn(t.deps, as("finance"), t.threadId, "Deploy the agent", () => {});
    // finance has no tool in the deploy pack, so it was never on offer.
    expect(t.route.predict.mock.calls[0][2].map((p: any) => p.id)).toEqual(["governance"]);
    expect((await t.store.loadThread(t.threadId, ORG))!.checkpoint.loadedPacks).toEqual(["governance"]);
  });
});

describe("a router that predicts nothing (shadow)", () => {
  it("leaves the turn as it was and is told which packs the model loaded itself", async () => {
    const t = setup([
      { toolCalls: [{ name: "load_tools", arguments: { pack: "governance" } }] },
      { toolCalls: [{ name: "explain_policies", arguments: {} }] },
      done("Three policies apply."),
    ], async () => []);
    await runTurn(t.deps, as("admin"), t.threadId, "Which policies apply?", () => {});
    expect(offeredTools(t, 0)).not.toContain("explain_policies");
    expect(offeredTools(t, 0)).toContain("load_tools");
    expect(t.route.record).toHaveBeenCalledTimes(1);
    const [, text, offered, loaded] = t.route.record.mock.calls[0];
    expect(text).toBe("Which policies apply?");
    expect(offered.map((p: any) => p.id)).toEqual(["governance", "deploy"]);
    expect(loaded).toEqual(["governance"]);
  });

  it("asks nothing and records nothing once every pack is loaded", async () => {
    const t = setup([
      { toolCalls: [{ name: "load_tools", arguments: { pack: "governance" } }] }, { toolCalls: [{ name: "load_tools", arguments: { pack: "deploy" } }] }, done("Loaded."),
      done("Still here."),
    ], async () => []);
    await runTurn(t.deps, as("admin"), t.threadId, "Load everything", () => {});
    t.route.predict.mockClear(); t.route.record.mockClear();
    await runTurn(t.deps, as("admin"), t.threadId, "And again", () => {});
    expect(t.route.predict).not.toHaveBeenCalled();
    expect(t.route.record).not.toHaveBeenCalled();
  });

  it("a router that throws costs the turn nothing", async () => {
    const t = setup([done("Fine.")], async () => { throw new Error("Jev HTTP 529"); });
    t.route.record.mockImplementation(() => { throw new Error("audit down"); });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Hello", () => {})).toBe("idle");
    expect((await t.store.loadThread(t.threadId, ORG))!.checkpoint.loadedPacks).toBeUndefined();
  });
});

describe("without a router", () => {
  it("a turn runs exactly as before", async () => {
    const store = new MemoryThreadStore();
    const threadId = store.createThread(ORG);
    const complete = scriptedComplete([done("Hello.")]);
    const deps: EngineDeps = { store, registry: registry(), complete, can: hasPermission, audit: vi.fn(async () => {}), services: {}, model: "test" };
    expect(await runTurn(deps, as("admin"), threadId, "Hello", () => {})).toBe("idle");
    expect((await store.loadThread(threadId, ORG))!.checkpoint.turn.routing).toBeUndefined();
  });
});

describe("the wiring", () => {
  it("backs the router with the decision seam on cowork_router, one yes/no per pack, and the engine imports nothing for it", () => {
    const wiring = read("server", "astra", "wiring.ts");
    expect(wiring).toContain('import { relevanceHint, recordRelevance } from "../relevance-hints";');
    expect(wiring).toContain('predict: (ctx, text, offered) => relevanceHint({ site: "cowork_router", task: text, items: offered.map((p) => ({ name: p.id, description: p.description })), orgId: ctx.orgId, noun: "pack" }),');
    expect(wiring).toContain('record: (ctx, text, offered, loaded) => recordRelevance({ site: "cowork_router", task: text, items: offered.map((p) => ({ name: p.id, description: p.description })), used: loaded, orgId: ctx.orgId, noun: "pack" }),');
    const engine = read("server", "astra", "engine.ts");
    expect(engine).not.toContain("relevance-hints");
    expect(engine).not.toContain("decision-provider");
  });
});
