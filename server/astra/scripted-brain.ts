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

/** A CompleteFn that plays the script in order and records every request it saw. */
export function scriptedComplete(steps: ScriptStep[]): CompleteFn & { requests: Array<{ messages: LLMMessage[]; options: LLMCompletionOptions }> } {
  const requests: Array<{ messages: LLMMessage[]; options: LLMCompletionOptions }> = [];
  let index = 0;
  const fn = (async (messages: LLMMessage[], options: LLMCompletionOptions) => {
    requests.push({ messages: JSON.parse(JSON.stringify(messages)), options });
    const step = steps[index++];
    if (!step) throw new Error(`Scripted brain ran out of steps after ${steps.length}`);
    if (typeof step === "function") return step(messages, options);
    return result(step.reply ?? "", (step.toolCalls ?? []).map((c) => call(c.name, c.arguments, c.id)), step.stopReason);
  }) as CompleteFn & { requests: typeof requests };
  fn.requests = requests;
  return fn;
}
