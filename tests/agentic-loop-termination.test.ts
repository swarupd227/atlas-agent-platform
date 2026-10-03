/**
 * How the three agent loops end.
 *
 * Each loop already continued on tool calls and stopped when the model made
 * none, with its tool results appended to the history in between. What the
 * review of 2026-10-03 found short of the mark: a reply cut off at the output
 * limit was finished as if it were an answer, and the deployed agent's loop
 * stopped quietly when its step budget ran out. These pin the stop reason
 * being read where each loop ends, one continuation of a cut-off reply with
 * the cut-off text kept, and the budget being said on the run.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { hasPermission } from "../server/permissions";
import { CONTINUE_CUT_OFF_REPLY } from "../shared/cut-off-reply";
import type { AstraContext } from "../server/astra/types";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const ctx: AstraContext = { orgId: "org-1", userId: "u1", role: "admin", industryId: "insurance" };

function setup(steps: Parameters<typeof scriptedComplete>[0]) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ctx.orgId);
  const complete = scriptedComplete(steps);
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, loadToolsTool], hasPermission),
    complete,
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services: {},
    model: "test",
  };
  return { store, threadId, deps, complete };
}
const lastAstraText = (store: MemoryThreadStore, threadId: string) => store.threadMessages(threadId).filter((m) => m.role === "astra").at(-1)?.markdown ?? "";

describe("a Cowork turn whose reply was cut off", () => {
  it("asks the model once to finish, keeps the cut-off text, and ends on the finished reply", async () => {
    const t = setup([
      () => result("The three steps are: first, read the", [], "max_tokens"),
      () => result(" submission; second, score it; third, decide.", [], "end_turn"),
    ]);
    await runTurn(t.deps, ctx, t.threadId, "What are the steps?", () => {});
    expect(t.complete.requests).toHaveLength(2);
    const second = t.complete.requests[1].messages;
    expect(second.at(-1)).toMatchObject({ role: "user", content: CONTINUE_CUT_OFF_REPLY });
    expect(second.at(-2)).toMatchObject({ role: "assistant", content: "The three steps are: first, read the" });
    expect(lastAstraText(t.store, t.threadId)).toBe("The three steps are: first, read the submission; second, score it; third, decide.");
  });

  it("asks only once; a second cut-off stands and is said", async () => {
    const t = setup([
      () => result("Part one", [], "max_tokens"),
      () => result(" part two", [], "max_tokens"),
      () => result(" never asked", [], "end_turn"),
    ]);
    await runTurn(t.deps, ctx, t.threadId, "Go on", () => {});
    expect(t.complete.requests).toHaveLength(2);
    expect(lastAstraText(t.store, t.threadId)).toBe("Part one part two\n\n(My reply was cut off at the length limit.)");
  });

  it("ends an ordinary reply as before, without a second request", async () => {
    const t = setup([() => result("Done in one.", [], "end_turn")]);
    await runTurn(t.deps, ctx, t.threadId, "Hi", () => {});
    expect(t.complete.requests).toHaveLength(1);
    expect(lastAstraText(t.store, t.threadId)).toBe("Done in one.");
  });

  it("still says so when the step budget runs out", () => {
    const src = read("server", "astra", "engine.ts");
    expect(src).toContain("this turn reached its limit of ${maxIterations} steps");
  });
});

describe("the Workspace run", () => {
  const src = read("server", "workspace-run.ts");
  it("asks once to finish a cut-off reply, then surfaces a second cut-off as before", () => {
    const nudge = src.indexOf("if (cp.cutOffText === undefined) {");
    const surfaced = src.indexOf('name: "Response truncated at token limit"');
    expect(nudge).toBeGreaterThan(0);
    expect(nudge).toBeLessThan(surfaced);
    expect(src).toContain('cp.messages.push({ role: "user", content: CONTINUE_CUT_OFF_REPLY } as any);');
    expect(src).toContain('outcome: "max_tokens_continued"');
  });
  it("keeps the cut-off text in the answer it finalizes", () => {
    expect(src).toContain('return finalize((cp.cutOffText ?? "") + (llm.content || "") || "Done.", "completed");');
  });
  it("already says so when the step budget runs out", () => {
    expect(src).toContain("You've used all the tool-call steps available for this request");
  });
});

describe("the deployed agent's run", () => {
  const src = read("server", "agent-runtime.ts");
  it("reads the stop reason at both places a reply can end the loop, and asks once to finish a cut-off reply", () => {
    expect(src).toContain('if (truncationNudged || currentToolCalls.length > 0 || finalStopReason !== "max_tokens") return;');
    expect(src).toContain('await finishCutOffReply("planning");');
    expect(src).toContain('await finishCutOffReply("tool_continuation");');
    expect(src).toContain("currentContent = `${cutOff}${nudged.content || \"\"}`;");
  });
  it("says on the run when the tool-step budget ran out, and names it as the reason the loop ended", () => {
    expect(src).toContain("if (iterationsUsed >= MAX_TOOL_ITERATIONS && !costCapReached) {");
    expect(src).toContain("name: `Stopped at the tool-step limit (${MAX_TOOL_ITERATIONS})`,");
    expect(src).toContain('iterationCapReached ? { terminationReason: "iteration_cap_reached" } : {}');
  });
  it("keeps the budget and the cost cap as guards around a loop that continues on tool calls", () => {
    expect(src).toContain("while (currentToolCalls.length > 0 && iterationsUsed < MAX_TOOL_ITERATIONS && !costCapReached) {");
  });
});
