/**
 * Studio packs (server/astra/packs.ts): pack tools are offered only once the
 * thread loads the pack, loading persists, and roles only see packs they have
 * tools in.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { runTurn, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { buildAstraSystemPrompt } from "../server/astra/prompt";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext, AstraTool } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role });

const coreTool: AstraTool = { name: "list_things", description: "Core.", input: z.object({}), confirm: false, run: async () => ({ payload: { ok: true } }) };
const govTool: AstraTool = { name: "explain_policies", description: "Governance.", input: z.object({}), confirm: false, pack: "governance", run: async () => ({ payload: { policies: 3 } }) };
const deployTool: AstraTool = { name: "deploy_agent", description: "Deploy.", input: z.object({}), confirm: false, pack: "deploy", permission: "deploy_staging_pilot", run: async () => ({ payload: {} }) };

const registry = () => new ToolRegistry([finishTurnTool, loadToolsTool, coreTool, govTool, deployTool], hasPermission);
const names = (defs: Array<{ name: string }>) => defs.map((d) => d.name);
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);

describe("pack filtering", () => {
  it("offers core tools and load_tools until a pack is loaded, then that pack's tools", () => {
    const r = registry();
    expect(names(r.canonicalDefinitions("admin"))).toEqual(["finish_turn", "list_things", "load_tools"]);
    expect(names(r.canonicalDefinitions("admin", ["governance"]))).toEqual(["explain_policies", "finish_turn", "list_things", "load_tools"]);
    expect(names(r.canonicalDefinitions("admin", ["governance", "deploy"]))).toEqual(["deploy_agent", "explain_policies", "finish_turn", "list_things"]);
  });

  it("lists only packs the role has tools in", () => {
    const r = registry();
    expect(r.packsFor("admin", []).map((p) => p.id)).toEqual(["governance", "deploy"]);
    expect(r.packsFor("finance", []).map((p) => p.id)).toEqual(["governance"]);
    expect(r.packsFor("finance", ["governance"])).toEqual([expect.objectContaining({ id: "governance", loaded: true })]);
  });

  it("resolves a pack tool by name even when its pack isn't loaded, so a paused confirmation always resumes", () => {
    expect(registry().get("explain_policies", "admin")?.name).toBe("explain_policies");
  });

  it("tells the model which packs it can load, and which are loaded", () => {
    const prompt = buildAstraSystemPrompt(as("admin"), {
      toolNames: ["list_things"],
      packs: [{ id: "governance", label: "Governance", description: "Policies.", loaded: true }, { id: "deploy", label: "Deploy & Operate", description: "Deployments.", loaded: false }],
    });
    expect(prompt).toContain("Studio packs loaded in this conversation: Governance.");
    expect(prompt).toContain("deploy (Deployments.)");
  });
});

describe("load_tools in a turn", () => {
  function setup(steps: Parameters<typeof scriptedComplete>[0]) {
    const store = new MemoryThreadStore();
    const threadId = store.createThread(ORG);
    const complete = scriptedComplete(steps);
    const deps: EngineDeps = { store, registry: registry(), complete, can: hasPermission, audit: vi.fn(async () => {}), services: {}, model: "test" };
    return { store, threadId, deps, complete };
  }

  it("makes the pack's tools available from the next step, and keeps them for the next turn", async () => {
    const t = setup([
      { toolCalls: [{ name: "load_tools", arguments: { pack: "governance" } }] },
      { toolCalls: [{ name: "explain_policies", arguments: {} }] },
      done("Three policies apply."),
      done("Still loaded."),
    ]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Which policies apply?", () => {})).toBe("idle");
    const offered = t.complete.requests.map((r) => (r.options.tools ?? []).map((d: any) => d.name));
    expect(offered[0]).not.toContain("explain_policies");
    expect(offered[1]).toContain("explain_policies");
    const toolResults = t.complete.requests[2].messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content as string));
    expect(toolResults[0]).toMatchObject({ ok: true, loaded: "governance", tools: ["explain_policies"] });
    expect(toolResults[1]).toMatchObject({ ok: true, result: { policies: 3 } });

    await runTurn(t.deps, as("admin"), t.threadId, "And again?", () => {});
    expect((t.complete.requests[3].options.tools ?? []).map((d: any) => d.name)).toContain("explain_policies");
    expect((await t.store.loadThread(t.threadId, ORG))!.checkpoint.loadedPacks).toEqual(["governance"]);
  });

  it("refuses a pack that doesn't exist or that the role has no tools in", async () => {
    const t = setup([
      { toolCalls: [{ name: "load_tools", arguments: { pack: "deploy" } }] },
      (m) => {
        const last = JSON.parse(m.filter((x) => x.role === "tool").at(-1)!.content as string);
        expect(last).toMatchObject({ ok: false, error: expect.stringContaining("No pack \"deploy\" is available to the finance role") });
        return done("Can't.");
      },
    ]);
    await runTurn(t.deps, as("finance"), t.threadId, "Deploy it", () => {});
    expect((await t.store.loadThread(t.threadId, ORG))!.checkpoint.loadedPacks).toBeUndefined();
  });
});
