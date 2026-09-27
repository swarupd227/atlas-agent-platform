/**
 * The guard that makes every other Astra suite trustworthy.
 *
 * Suites assert on a tool's payload from inside a scripted model step. The
 * engine treats a throw from the model call as a model failure and ends the turn
 * quietly, so those assertions used to be swallowed whole -- a suite could hold
 * a false assertion and still pass, which it did until 2026-09-27.
 *
 * tests/setup/scripted-step-errors.ts now drains the recorded failures after
 * every test. This file pins the two halves of that contract, because nothing
 * else would notice if the recording quietly stopped: an assertion failure is
 * kept, and a deliberate throw is not. Both tests drain the record themselves,
 * which is also why they pass rather than tripping the global hook.
 */
import { describe, it, expect } from "vitest";
import { scriptedComplete, result, takeScriptedStepError } from "../server/astra/scripted-brain";
import type { LLMCompletionOptions, LLMMessage } from "../server/llm-provider";

const NO_MESSAGES: LLMMessage[] = [];
const NO_OPTIONS = {} as LLMCompletionOptions;

describe("assertions inside a scripted step", () => {
  it("are recorded, so the global hook can fail the test the engine would have hidden", async () => {
    const complete = scriptedComplete([
      () => {
        expect("what the tool said").toBe("something else");
        return result("unreachable");
      },
    ]);

    // How the engine sees it: the call rejects, and it moves on.
    await expect(complete(NO_MESSAGES, NO_OPTIONS)).rejects.toThrow();

    const recorded = takeScriptedStepError();
    expect(recorded).toBeInstanceOf(Error);
    expect(String(recorded)).toContain("something else");
  });

  it("drain once, so a later test is not failed by an earlier one's assertion", async () => {
    const complete = scriptedComplete([
      () => {
        expect(1).toBe(2);
        return result("unreachable");
      },
    ]);
    await expect(complete(NO_MESSAGES, NO_OPTIONS)).rejects.toThrow();
    expect(takeScriptedStepError()).toBeInstanceOf(Error);
    expect(takeScriptedStepError()).toBeUndefined();
  });
});

describe("a step that throws on purpose", () => {
  it("stays a fixture: tests that make the model blow up must still pass", async () => {
    const complete = scriptedComplete([
      () => {
        throw new Error("upstream 529 overloaded");
      },
    ]);
    await expect(complete(NO_MESSAGES, NO_OPTIONS)).rejects.toThrow("upstream 529 overloaded");
    expect(takeScriptedStepError()).toBeUndefined();
  });

  it("is told apart from an assertion by the error itself, not by which suite it is in", async () => {
    const assertion = scriptedComplete([() => { expect(true).toBe(false); return result(""); }]);
    const deliberate = scriptedComplete([() => { throw new Error("no connector configured"); }]);
    await expect(assertion(NO_MESSAGES, NO_OPTIONS)).rejects.toThrow();
    await expect(deliberate(NO_MESSAGES, NO_OPTIONS)).rejects.toThrow("no connector");
    // One of the two was worth recording.
    expect(String(takeScriptedStepError())).toContain("false");
    expect(takeScriptedStepError()).toBeUndefined();
  });
});
