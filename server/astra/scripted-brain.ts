/**
 * A deterministic stand-in for the model: a script of steps, each returning a
 * reply and/or tool calls. Used by tests, and by demos when ASTRA_BRAIN=scripted,
 * so the conversation loop can be exercised without a live model.
 */
import type { CanonicalToolCall, LLMCompletionOptions, LLMCompletionResult, LLMMessage } from "../llm-provider";
import type { CompleteFn } from "./types";

export type ScriptStep =
  | { reply?: string; toolCalls?: Array<Omit<CanonicalToolCall, "id"> & { id?: string }>; stopReason?: string }
  | ((messages: LLMMessage[], options: LLMCompletionOptions) => LLMCompletionResult | Promise<LLMCompletionResult>);

let callCounter = 0;

export function result(reply = "", toolCalls: CanonicalToolCall[] = [], stopReason?: string): LLMCompletionResult {
  return {
    content: reply,
    toolCalls,
    tokensUsed: { prompt: 10, completion: 5, total: 15 },
    costUsd: 0.0001,
    actualProvider: "scripted",
    stopReason,
  };
}

export function call(name: string, args: Record<string, unknown> = {}, id?: string): CanonicalToolCall {
  callCounter += 1;
  return { id: id ?? `call_${name}_${callCounter}`, name, arguments: args };
}

export type ScriptedComplete = CompleteFn & {
  requests: Array<{ messages: LLMMessage[]; options: LLMCompletionOptions }>;
  /**
   * Assertion failures raised by a step function. The engine catches whatever
   * the model call throws, so an `expect()` inside a step would otherwise end
   * the turn quietly and leave the test passing -- tests/setup/scripted-step-errors.ts
   * drains these after every test so that cannot happen.
   */
  stepErrors: unknown[];
};

/**
 * Every ScriptedComplete built in this worker since the last drain. The global
 * afterEach empties it, so no suite has to remember a hook of its own.
 */
const liveScripts: ScriptedComplete[] = [];

/**
 * Only an assertion failure is recorded. A step that throws on purpose is a
 * fixture, not a bug -- tests/astra-engine.test.ts makes the model throw to
 * prove the engine survives it -- and failing those tests would be wrong.
 */
function isAssertionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "AssertionError" || (err as { matcherResult?: unknown }).matcherResult != null;
}

/**
 * The first assertion failure any step raised, clearing what it read. Returns
 * undefined when every step was clean.
 */
export function takeScriptedStepError(): unknown {
  let first: unknown;
  let found = false;
  for (const script of liveScripts) {
    if (!found && script.stepErrors.length > 0) {
      first = script.stepErrors[0];
      found = true;
    }
    script.stepErrors.length = 0;
  }
  liveScripts.length = 0;
  return first;
}

/** A CompleteFn that plays the script in order and records every request it saw. */
export function scriptedComplete(steps: ScriptStep[]): ScriptedComplete {
  const requests: Array<{ messages: LLMMessage[]; options: LLMCompletionOptions }> = [];
  const stepErrors: unknown[] = [];
  let index = 0;
  const fn = (async (messages: LLMMessage[], options: LLMCompletionOptions) => {
    requests.push({ messages: JSON.parse(JSON.stringify(messages)), options });
    const step = steps[index++];
    if (!step) throw new Error(`Scripted brain ran out of steps after ${steps.length}`);
    if (typeof step === "function") {
      try {
        return await step(messages, options);
      } catch (err) {
        // Recorded as well as rethrown: the engine will swallow the rethrow.
        if (isAssertionFailure(err)) stepErrors.push(err);
        throw err;
      }
    }
    return result(step.reply ?? "", (step.toolCalls ?? []).map((c) => call(c.name, c.arguments, c.id)), step.stopReason);
  }) as ScriptedComplete;
  fn.requests = requests;
  fn.stepErrors = stepErrors;
  liveScripts.push(fn);
  return fn;
}
