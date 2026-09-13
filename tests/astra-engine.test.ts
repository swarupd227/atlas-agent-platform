/**
 * Astra turn engine (server/astra/engine.ts) against an in-memory store and a
 * scripted brain -- no database, no live model.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, capHistory, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { listAgentsTool } from "../server/astra/tools/list-agents";
import { toolInputJsonSchema } from "../server/astra/json-schema";
import type { AstraContext, AstraEvent, AstraTool, PermissionCheck } from "../server/astra/types";
import type { LLMMessage } from "../server/llm-provider";

const ORG = "org-a";
const ADMIN: AstraContext = { orgId: ORG, userId: "user-1", role: "admin" };
const FINANCE: AstraContext = { orgId: ORG, userId: "user-2", role: "finance" };

// Mirrors the real matrix for the permissions these tests use.
const can: PermissionCheck = (role, permission) => !(role === "finance" && (permission === "view_agents" || permission === "manage_mcp_servers"));

const AGENTS = [
  { id: "ag-1", name: "AR Data Gathering", status: "active", agentType: "single", description: "Pulls open AR" },
  { id: "ag-2", name: "Cash Application", status: "draft", agentType: "single", description: "Matches remittances" },
];

function makeMutationTool(runSpy = vi.fn(async (_ctx: any, input: { target: string }) => ({ payload: { changed: input.target } }))) {
  const tool: AstraTool<{ target: string }> = {
    name: "change_something",
    description: "Change something on the platform.",
    input: z.object({ target: z.string() }),
    permission: "manage_mcp_servers",
    confirm: true,
    describe: (input) => `Change ${input.target}`,
    run: runSpy,
  };
  return { tool, runSpy };
}

function setup(steps: Parameters<typeof scriptedComplete>[0], extraTools: AstraTool[] = [], overrides: Partial<EngineDeps> = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const complete = scriptedComplete(steps);
  const audit = vi.fn(async () => {});
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, listAgentsTool, ...extraTools], can),
    complete,
    can,
    audit,
    services: { listAgents: async () => AGENTS },
    model: "test-model",
    ...overrides,
  };
  const events: AstraEvent[] = [];
  return { store, threadId, complete, audit, deps, events, onEvent: (e: AstraEvent) => events.push(e) };
}

const finish = (suggestions = [{ label: "Show drafts", prompt: "Which agents are still drafts?" }]) =>
  ({ name: "finish_turn", arguments: { suggestions } });

describe("a turn", () => {
  it("answers, attaches suggestions from finish_turn, and ends idle after one model call", async () => {
    const t = setup([{ reply: "Hello — I can help with your agents.", toolCalls: [finish()] }]);
    const status = await runTurn(t.deps, ADMIN, t.threadId, "Hi", t.onEvent);

    expect(status).toBe("idle");
    expect(t.complete.requests).toHaveLength(1);
    const [user, astra] = t.store.threadMessages(t.threadId);
    expect(user.role).toBe("user");
    expect(astra.markdown).toBe("Hello — I can help with your agents.");
    expect(astra.suggestions).toEqual([{ label: "Show drafts", prompt: "Which agents are still drafts?" }]);
    expect(t.events.map((e) => e.type)).toEqual(["turn_started", "working", "message", "done"]);
  });

  it("calls a read tool, shows its card and cites it as a source", async () => {
    const t = setup([
      { toolCalls: [{ name: "list_agents", arguments: { status: "active" } }] },
      { reply: "You have 1 active agent: AR Data Gathering.", toolCalls: [finish()] },
    ]);
    await runTurn(t.deps, ADMIN, t.threadId, "Which agents are active?", t.onEvent);

    const astra = t.store.threadMessages(t.threadId).at(-1)!;
    expect(astra.markdown).toContain("AR Data Gathering");
    expect(astra.artifacts).toHaveLength(1);
    expect(astra.artifacts[0]).toMatchObject({ kind: "agentList", fullViewHref: "/agents" });
    expect((astra.artifacts[0].props as any).agents.map((a: any) => a.name)).toEqual(["AR Data Gathering"]);
    expect(astra.sources).toEqual([expect.objectContaining({ tool: "list_agents", ok: true })]);
    // The tool result went back to the model before it answered.
    const secondRequest = t.complete.requests[1].messages;
    expect(secondRequest.some((m) => m.role === "tool" && m.content.includes("AR Data Gathering"))).toBe(true);
  });

  it("fills proof segments it can't measure with not_measured, and measures compliance for a read", async () => {
    const t = setup([{ toolCalls: [{ name: "list_agents", arguments: {} }] }, { reply: "Two agents.", toolCalls: [finish()] }]);
    await runTurn(t.deps, ADMIN, t.threadId, "List agents", t.onEvent);
    const proof = t.store.threadMessages(t.threadId).at(-1)!.proof!;
    expect(proof.compliance).toMatchObject({ status: "measured", summary: expect.stringContaining("Read only") });
    expect(proof.context).toEqual({ status: "not_measured" });
    expect(proof.industry).toEqual({ status: "not_measured" });
  });

  it("marks the thread failed with the reason when the model call throws, instead of leaving it running", async () => {
    const t = setup([() => { throw new Error("upstream 529 overloaded"); }]);
    const status = await runTurn(t.deps, ADMIN, t.threadId, "Hi", t.onEvent);

    expect(status).toBe("failed");
    expect((await t.store.loadThread(t.threadId, ORG))!.status).toBe("failed");
    const last = t.store.threadMessages(t.threadId).at(-1)!;
    expect(last.role).toBe("system");
    expect(last.markdown).toContain("upstream 529 overloaded");
    expect(t.events.some((e) => e.type === "error")).toBe(true);
  });

  it("lets the next message start a fresh turn after a failure", async () => {
    const t = setup([() => { throw new Error("boom"); }, { reply: "Back again.", toolCalls: [finish()] }]);
    await runTurn(t.deps, ADMIN, t.threadId, "Hi", t.onEvent);
    expect(await runTurn(t.deps, ADMIN, t.threadId, "Hi again", t.onEvent)).toBe("idle");
  });

  it("stops honestly at the iteration cap", async () => {
    const loopForever = { toolCalls: [{ name: "list_agents", arguments: {} }] };
    const t = setup([loopForever, loopForever, loopForever], [], { maxIterations: 2 });
    const status = await runTurn(t.deps, ADMIN, t.threadId, "Keep going", t.onEvent);
    expect(status).toBe("idle");
    expect(t.complete.requests).toHaveLength(2);
    expect(t.store.threadMessages(t.threadId).at(-1)!.markdown).toContain("limit of 2 steps");
  });

  it("refuses a second turn while one is running, and a new message while an action is pending", async () => {
    const t = setup([]);
    await t.store.acquireTurn(t.threadId, ORG);
    await expect(runTurn(t.deps, ADMIN, t.threadId, "Hi", t.onEvent)).rejects.toThrow(/still working/);
  });

  it("never lets another organization load or run a thread", async () => {
    const t = setup([{ reply: "x", toolCalls: [finish()] }]);
    await expect(runTurn(t.deps, { ...ADMIN, orgId: "org-b" }, t.threadId, "Hi", t.onEvent)).rejects.toThrow(/not found/);
    expect(t.complete.requests).toHaveLength(0);
  });
});

describe("role filtering", () => {
  it("offers only the tools a role may use, and refuses a hidden tool the model calls anyway", async () => {
    const t = setup([
      (messages, options) => {
        expect(options.tools?.map((d) => d.name)).toEqual(["finish_turn"]);
        return result("", [call("list_agents", {})]);
      },
      { reply: "Your role can't list agents.", toolCalls: [finish()] },
    ]);
    await runTurn(t.deps, FINANCE, t.threadId, "List agents", t.onEvent);
    const toolMsg = t.complete.requests[1].messages.find((m) => m.role === "tool")!;
    expect(JSON.parse(toolMsg.content).error).toContain('No tool named "list_agents" is available to the finance role');
  });
});

describe("confirmation", () => {
  it("pauses a platform change on a confirm card, and runs exactly the frozen input on Confirm", async () => {
    const { tool, runSpy } = makeMutationTool();
    const t = setup(
      [
        { reply: "I'll change the widget.", toolCalls: [{ name: "change_something", arguments: { target: "widget" } }] },
        { reply: "Done — the widget is changed.", toolCalls: [finish()] },
      ],
      [tool],
    );

    const paused = await runTurn(t.deps, ADMIN, t.threadId, "Change the widget", t.onEvent);
    expect(paused).toBe("awaiting_confirmation");
    expect(runSpy).not.toHaveBeenCalled();
    const thread = (await t.store.loadThread(t.threadId, ORG))!;
    expect(thread.pendingAction).toMatchObject({ toolName: "change_something", input: { target: "widget" }, summary: "Change widget" });
    const cardMessage = t.store.threadMessages(t.threadId).at(-1)!;
    expect(cardMessage.pendingAction?.id).toBe(thread.pendingAction!.id);

    const done = await resolveAction(t.deps, ADMIN, t.threadId, thread.pendingAction!.id, "confirm", t.onEvent);
    expect(done).toBe("idle");
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy.mock.calls[0][1]).toEqual({ target: "widget" });
    expect(t.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "astra_shell.tool_executed", orgId: ORG, userId: "user-1" }));
    expect(t.store.threadMessages(t.threadId).find((m) => m.id === cardMessage.id)!.pendingAction!.decision).toBe("confirmed");
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.proof!.compliance).toMatchObject({ status: "measured", summary: expect.stringContaining("Confirmed by you") });
  });

  it("runs nothing on Not now, tells the model the user declined, and continues the turn", async () => {
    const { tool, runSpy } = makeMutationTool();
    const t = setup(
      [
        { toolCalls: [{ name: "change_something", arguments: { target: "widget" } }] },
        (messages) => {
          const toolMsg = messages.find((m) => m.role === "tool")!;
          expect(JSON.parse(toolMsg.content)).toMatchObject({ ok: false, declined: true });
          return result("Understood, I left it unchanged.", [call("finish_turn", { suggestions: [] })]);
        },
      ],
      [tool],
    );
    await runTurn(t.deps, ADMIN, t.threadId, "Change the widget", t.onEvent);
    const { pendingAction } = (await t.store.loadThread(t.threadId, ORG))!;

    expect(await resolveAction(t.deps, ADMIN, t.threadId, pendingAction!.id, "cancel", t.onEvent)).toBe("idle");
    expect(runSpy).not.toHaveBeenCalled();
    expect(t.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "astra_shell.tool_declined" }));
    expect(t.store.threadMessages(t.threadId).at(-1)!.markdown).toBe("Understood, I left it unchanged.");
  });

  it("runs a confirmed action once even if Confirm arrives twice", async () => {
    const { tool, runSpy } = makeMutationTool();
    const t = setup([{ toolCalls: [{ name: "change_something", arguments: { target: "w" } }] }, { reply: "ok", toolCalls: [finish()] }], [tool]);
    await runTurn(t.deps, ADMIN, t.threadId, "go", t.onEvent);
    const { pendingAction } = (await t.store.loadThread(t.threadId, ORG))!;

    await resolveAction(t.deps, ADMIN, t.threadId, pendingAction!.id, "confirm", t.onEvent);
    await expect(resolveAction(t.deps, ADMIN, t.threadId, pendingAction!.id, "confirm", t.onEvent)).rejects.toThrow(/already have been decided/);
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("does not let another organization confirm a pending action", async () => {
    const { tool, runSpy } = makeMutationTool();
    const t = setup([{ toolCalls: [{ name: "change_something", arguments: { target: "w" } }] }], [tool]);
    await runTurn(t.deps, ADMIN, t.threadId, "go", t.onEvent);
    const { pendingAction } = (await t.store.loadThread(t.threadId, ORG))!;
    await expect(resolveAction(t.deps, { ...ADMIN, orgId: "org-b" }, t.threadId, pendingAction!.id, "confirm", t.onEvent)).rejects.toThrow(/not found/);
    expect(runSpy).not.toHaveBeenCalled();
    expect((await t.store.loadThread(t.threadId, ORG))!.status).toBe("awaiting_confirmation");
  });

  it("resolves the paused tool by name even when the registry order changed before resume", async () => {
    const { tool, runSpy } = makeMutationTool();
    const t = setup([{ toolCalls: [{ name: "change_something", arguments: { target: "w" } }] }, { reply: "ok", toolCalls: [finish()] }], [tool]);
    await runTurn(t.deps, ADMIN, t.threadId, "go", t.onEvent);
    const { pendingAction } = (await t.store.loadThread(t.threadId, ORG))!;

    const reordered = { ...t.deps, registry: new ToolRegistry([tool, listAgentsTool, finishTurnTool], can) };
    await resolveAction(reordered, ADMIN, t.threadId, pendingAction!.id, "confirm", t.onEvent);
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("reports an audit failure after a confirmed change instead of claiming the change failed", async () => {
    const { tool } = makeMutationTool();
    const t = setup([{ toolCalls: [{ name: "change_something", arguments: { target: "w" } }] }, { reply: "Changed.", toolCalls: [finish()] }], [tool]);
    t.deps.audit = vi.fn(async () => { throw new Error("chain lock timeout"); });
    await runTurn(t.deps, ADMIN, t.threadId, "go", t.onEvent);
    const { pendingAction } = (await t.store.loadThread(t.threadId, ORG))!;
    await resolveAction(t.deps, ADMIN, t.threadId, pendingAction!.id, "confirm", t.onEvent);
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.sources).toEqual([expect.objectContaining({ tool: "change_something", ok: true })]);
    expect(final.proof!.compliance).toMatchObject({ summary: expect.stringContaining("audit record FAILED (chain lock timeout)") });
  });
});

describe("history and schemas", () => {
  it("caps history at user-turn boundaries without splitting a tool call from its results", () => {
    const messages: LLMMessage[] = [
      { role: "user", content: "1" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", name: "list_agents", arguments: {} }] },
      { role: "tool", content: "{}", tool_call_id: "c1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "2" },
      { role: "assistant", content: "", tool_calls: [{ id: "c2", name: "list_agents", arguments: {} }] },
      { role: "tool", content: "{}", tool_call_id: "c2" },
      { role: "user", content: "3" },
    ];
    const capped = capHistory(messages, 2);
    expect(capped[0]).toEqual({ role: "user", content: "2" });
    expect(capped.find((m) => m.tool_call_id === "c2")).toBeDefined();
    expect(capped.find((m) => m.tool_call_id === "c1")).toBeUndefined();
  });

  it("sends stable tool names and valid object schemas to the model", () => {
    const { tool } = makeMutationTool();
    const registry = new ToolRegistry([tool, finishTurnTool, listAgentsTool], can);
    const defs = registry.canonicalDefinitions("admin");
    expect(defs.map((d) => d.name)).toEqual(["change_something", "finish_turn", "list_agents"]);
    expect(defs.find((d) => d.name === "change_something")!.description).toContain("asked to confirm");
    expect(toolInputJsonSchema(listAgentsTool.input)).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        search: { type: "string", description: expect.any(String) },
        status: { type: "string", description: expect.any(String) },
        limit: { type: "integer", description: expect.any(String) },
      },
    });
  });

  it("rejects a non-snake_case or duplicate tool name at registration", () => {
    const { tool } = makeMutationTool();
    expect(() => new ToolRegistry([{ ...tool, name: "Change-Something" }], can)).toThrow(/snake_case/);
    expect(() => new ToolRegistry([tool, tool], can)).toThrow(/registered twice/);
  });
});

describe("boundaries (static)", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith(".ts") ? [full] : [];
    });
  }

  it("never reaches connectors or the database from the engine core", () => {
    const astraDir = join(__dirname, "..", "server", "astra");
    // Only the production wiring (store, services, routes) may touch storage/db.
    const core = ["engine.ts", "dispatch.ts", "registry.ts", "prompt.ts", "proof.ts", "types.ts", "json-schema.ts", "memory-store.ts", "scripted-brain.ts"];
    for (const file of sourceFiles(astraDir)) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/from ["'][./]*\.\.\/mcp-client["']|executeTool\(|gatherAvailableTools\(|dispatchToolCall\(/);
      if (core.some((c) => file.endsWith(join("astra", c)))) {
        expect(src, file).not.toMatch(/^import (?!type)[^;]*from ["']\.\.\/(storage|db|auth|permissions|llm-provider)["']/m);
      }
    }
  });
});
