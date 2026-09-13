/**
 * Astra turn engine.
 *
 * Modelled on workspace-run.ts's advance() -- checkpointed message history,
 * pending tool calls with an index, pause on a gate, resume by index -- with
 * the differences that matter for a user-facing orchestrator:
 *  - tool names are stable (resume resolves by name, not position);
 *  - a model error marks the thread failed instead of leaving it "running";
 *  - resume is a compare-and-swap on the exact pending action, scoped to the
 *    caller's organization, so a double click or another tenant runs nothing;
 *  - every dependency (store, model call, permissions, audit, services) is
 *    injected, so the engine imports no database code.
 */
import type { LLMMessage } from "../llm-provider";
import type {
  AstraContext,
  AstraEvent,
  AstraMessageRecord,
  AstraServices,
  AuditFn,
  Checkpoint,
  CompleteFn,
  OnAstraEvent,
  PendingAction,
  PermissionCheck,
  Suggestion,
  ThreadState,
  ThreadStore,
  TurnAccumulator,
} from "./types";
import { ToolRegistry } from "./registry";
import { dispatchAstraTool, RateLimiter } from "./dispatch";
import { buildAstraSystemPrompt, type PromptGrounding } from "./prompt";
import { completeProof, mergeProof } from "./proof";

export const FINISH_TURN = "finish_turn";

export interface EngineDeps {
  store: ThreadStore;
  registry: ToolRegistry;
  complete: CompleteFn;
  can: PermissionCheck;
  audit: AuditFn;
  services: AstraServices;
  model: string;
  /** Grounding for the system prompt, beyond the tool list. */
  grounding?: (ctx: AstraContext) => Promise<Omit<PromptGrounding, "toolNames">>;
  maxIterations?: number;
  /** User turns of history replayed to the model. */
  historyTurns?: number;
  maxTokens?: number;
  rateLimit?: RateLimiter;
  now?: () => number;
}

export class AstraBusyError extends Error {
  constructor() {
    super("Astra is still working on the previous message in this thread.");
    this.name = "AstraBusyError";
  }
}

export class AstraNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "AstraNotFoundError";
  }
}

const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_HISTORY_TURNS = 12;
const DEFAULT_MAX_TOKENS = 8192;

export function emptyCheckpoint(): Checkpoint {
  return {
    messages: [],
    pendingToolCalls: [],
    pendingToolIndex: 0,
    iterationsUsed: 0,
    costUsd: 0,
    tokens: { prompt: 0, completion: 0, total: 0 },
    turn: freshTurn(),
  };
}

function freshTurn(): TurnAccumulator {
  return { artifacts: [], sources: [], suggestions: [], proof: null, lastAssistantText: "" };
}

/**
 * The last N user turns of history. Cuts only at a real user message, so an
 * assistant tool call is never separated from its tool results.
 */
export function capHistory(messages: LLMMessage[], turns: number): LLMMessage[] {
  const userIdx: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === "user") userIdx.push(i);
  });
  if (userIdx.length <= turns) return messages;
  return messages.slice(userIdx[userIdx.length - turns]);
}

function preview(value: unknown): string {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return "[unserializable]";
  }
}

function parseSuggestions(raw: unknown): Suggestion[] {
  const list = (raw as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  return list
    .map((s: any) => (typeof s === "string" ? { label: s, prompt: s } : { label: String(s?.label ?? s?.prompt ?? ""), prompt: String(s?.prompt ?? s?.label ?? "") }))
    .filter((s) => s.label && s.prompt)
    .slice(0, 4);
}

interface Session {
  deps: EngineDeps;
  ctx: AstraContext;
  threadId: string;
  cp: Checkpoint;
  emit: OnAstraEvent;
  /** The action the user just confirmed, handed to the tool it resumes. */
  approved?: PendingAction;
}

/** Send a user message and run the turn until it finishes, fails or pauses for confirmation. */
export async function runTurn(
  deps: EngineDeps,
  ctx: AstraContext,
  threadId: string,
  userText: string,
  onEvent: OnAstraEvent,
): Promise<ThreadState["status"]> {
  // Lock first, then read: reading before the lock could pick up a checkpoint
  // that a turn finishing in between is about to replace, and lose its messages.
  if (!(await deps.store.acquireTurn(threadId, ctx.orgId))) {
    const current = await deps.store.loadThread(threadId, ctx.orgId);
    if (!current) throw new AstraNotFoundError("Thread");
    if (current.pendingAction) {
      throw new Error("This thread is waiting for you to confirm or dismiss an action before it can continue.");
    }
    throw new AstraBusyError();
  }
  const thread = await deps.store.loadThread(threadId, ctx.orgId);
  if (!thread) throw new AstraNotFoundError("Thread");

  const cp = thread.checkpoint;
  // A turn that crashed mid-batch (e.g. a restart) leaves tool calls without results.
  closeDanglingToolCalls(cp, "The previous turn stopped before this ran.");
  cp.turn = freshTurn();
  cp.iterationsUsed = 0;
  cp.messages.push({ role: "user", content: userText });

  await deps.store.appendMessage(ctx.orgId, {
    threadId,
    role: "user",
    markdown: userText,
    artifacts: [],
    sources: [],
    suggestions: [],
    proof: null,
    pendingAction: null,
  });
  onEvent({ type: "turn_started", threadId });

  return loop({ deps, ctx, threadId, cp, emit: onEvent }, null);
}

/** The user pressed Confirm or Not now on a pending action. */
export async function resolveAction(
  deps: EngineDeps,
  ctx: AstraContext,
  threadId: string,
  actionId: string,
  decision: "confirm" | "cancel",
  onEvent: OnAstraEvent,
): Promise<ThreadState["status"]> {
  const claimed = await deps.store.claimPendingAction(threadId, ctx.orgId, actionId);
  if (!claimed || !claimed.pendingAction) {
    throw new AstraNotFoundError("Pending action (it may already have been decided)");
  }
  const action = claimed.pendingAction;
  const cp = claimed.checkpoint;
  const call = cp.pendingToolCalls[cp.pendingToolIndex];
  if (!call || call.id !== action.toolCallId) {
    await failThread({ deps, ctx, threadId, cp, emit: onEvent }, "The paused action no longer matches this thread's state, so nothing was run.");
    return "failed";
  }

  if (action.messageId) {
    await deps.store.markActionDecided(ctx.orgId, action.messageId, decision === "confirm" ? "confirmed" : "declined");
  }
  onEvent({ type: "turn_started", threadId });
  const session: Session = { deps, ctx, threadId, cp, emit: onEvent };

  if (decision === "cancel") {
    cp.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify({ ok: false, declined: true, message: "The user chose Not now. Nothing was changed." }),
    });
    cp.turn.sources.push({ tool: call.name, ok: false });
    await deps.audit({
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "astra_shell.tool_declined",
      objectId: call.name,
      details: { threadId, toolCallId: call.id, input: action.input },
    }).catch(() => {});
    cp.pendingToolIndex += 1;
    return continueCalls(session, null);
  }

  // Confirm runs the input frozen when the turn paused -- never anything sent with the click.
  call.arguments = action.input;
  session.approved = action;
  return continueCalls(session, cp.pendingToolIndex);
}

async function loop(s: Session, approvedIndex: number | null): Promise<ThreadState["status"]> {
  const { deps, ctx, cp, emit } = s;
  const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  if (cp.pendingToolCalls.length > 0 && cp.pendingToolIndex < cp.pendingToolCalls.length) {
    return continueCalls(s, approvedIndex);
  }

  while (true) {
    if (cp.iterationsUsed >= maxIterations) {
      return finishTurn(s, cp.turn.lastAssistantText
        ? `${cp.turn.lastAssistantText}\n\nI stopped here: this turn reached its limit of ${maxIterations} steps.`
        : `I stopped before finishing: this turn reached its limit of ${maxIterations} steps. Tell me which part to continue.`);
    }

    const tools = deps.registry.canonicalDefinitions(ctx.role);
    const grounding = deps.grounding ? await deps.grounding(ctx).catch(() => ({})) : {};
    const system = buildAstraSystemPrompt(ctx, { ...grounding, toolNames: tools.map((t) => t.name) });

    emit({ type: "working", label: cp.iterationsUsed === 0 ? "Thinking" : "Reading the results" });
    let completion;
    try {
      completion = await deps.complete(
        [{ role: "system", content: system }, ...capHistory(cp.messages, deps.historyTurns ?? DEFAULT_HISTORY_TURNS)],
        { model: deps.model, tools: tools.length > 0 ? tools : undefined, maxTokens: deps.maxTokens ?? DEFAULT_MAX_TOKENS },
      );
    } catch (err: any) {
      await failThread(s, `I couldn't reach the model: ${err?.message ?? "unknown error"}. Nothing was changed. Try again in a moment.`);
      return "failed";
    }

    cp.iterationsUsed += 1;
    cp.costUsd += completion.costUsd ?? 0;
    cp.tokens.prompt += completion.tokensUsed?.prompt ?? 0;
    cp.tokens.completion += completion.tokensUsed?.completion ?? 0;
    cp.tokens.total += completion.tokensUsed?.total ?? 0;
    if (completion.content?.trim()) cp.turn.lastAssistantText = completion.content.trim();

    const toolCalls = completion.toolCalls ?? [];
    if (toolCalls.length === 0) {
      cp.messages.push({ role: "assistant", content: completion.content ?? "" });
      if (completion.stopReason === "max_tokens") {
        return finishTurn(s, `${completion.content ?? ""}\n\n(My reply was cut off at the length limit.)`.trim());
      }
      return finishTurn(s, completion.content ?? "");
    }

    cp.messages.push({ role: "assistant", content: completion.content ?? "", tool_calls: toolCalls });
    cp.pendingToolCalls = toolCalls;
    cp.pendingToolIndex = 0;

    const status = await continueCalls(s, null, true);
    if (status !== "running") return status;
  }
}

/**
 * Execute pending tool calls from pendingToolIndex. Returns "running" when the
 * batch completed and the loop should ask the model again, or a final status
 * when the turn ended (finish_turn), paused or failed.
 */
async function continueCalls(s: Session, approvedIndex: number | null, fromLoop = false): Promise<ThreadState["status"]> {
  const { deps, ctx, threadId, cp, emit } = s;
  let finished = false;

  for (let i = cp.pendingToolIndex; i < cp.pendingToolCalls.length; i++) {
    const call = cp.pendingToolCalls[i];
    cp.pendingToolIndex = i;

    if (call.name === FINISH_TURN) {
      cp.turn.suggestions = parseSuggestions(call.arguments);
      cp.messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true }) });
      finished = true;
      continue;
    }

    const tool = deps.registry.get(call.name, ctx.role);
    if (!tool) {
      cp.messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ ok: false, error: `No tool named "${call.name}" is available to the ${ctx.role} role.` }),
      });
      cp.turn.sources.push({ tool: call.name, ok: false });
      continue;
    }

    emit({ type: "tool_start", tool: tool.name, input: call.arguments });
    const outcome = await dispatchAstraTool(
      {
        tool,
        rawInput: call.arguments,
        toolCallId: call.id,
        approved: approvedIndex === i,
        ctx: {
          ...ctx,
          threadId,
          services: deps.services,
          onProgress: emit,
          can: deps.can,
          ...(approvedIndex === i && s.approved ? { confirmation: s.approved } : {}),
        },
      },
      { can: deps.can, audit: deps.audit, rateLimit: deps.rateLimit, now: deps.now },
    );

    if (outcome.kind === "needs_confirmation") {
      return pauseForConfirmation(s, outcome.action);
    }

    if (outcome.ok) {
      const { result } = outcome;
      cp.messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, result: result.payload }) });
      cp.turn.sources.push({ tool: tool.name, ok: true, latencyMs: outcome.latencyMs });
      if (result.artifact) cp.turn.artifacts.push(result.artifact);
      cp.turn.proof = mergeProof(cp.turn.proof, result.proof);
      emit({ type: "tool_result", tool: tool.name, ok: true, preview: preview(result.payload), artifact: result.artifact });
    } else {
      cp.messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: outcome.error }) });
      cp.turn.sources.push({ tool: tool.name, ok: false, latencyMs: outcome.latencyMs });
      emit({ type: "tool_result", tool: tool.name, ok: false, preview: outcome.error });
    }
  }

  cp.pendingToolCalls = [];
  cp.pendingToolIndex = 0;

  if (finished) return finishTurn(s, cp.turn.lastAssistantText);
  // Called from resolveAction: re-enter the loop to ask the model again.
  if (!fromLoop) return loop(s, null);
  await deps.store.saveState(threadId, ctx.orgId, { status: "running", checkpoint: cp, pendingAction: null });
  return "running";
}

async function pauseForConfirmation(s: Session, action: PendingAction): Promise<ThreadState["status"]> {
  const { deps, ctx, threadId, cp, emit } = s;
  const message = await deps.store.appendMessage(ctx.orgId, {
    threadId,
    role: "astra",
    markdown: cp.turn.lastAssistantText,
    artifacts: [],
    sources: [],
    suggestions: [],
    proof: null,
    pendingAction: action,
  });
  const pending: PendingAction = { ...action, messageId: message.id };
  await deps.store.saveState(threadId, ctx.orgId, { status: "awaiting_confirmation", checkpoint: cp, pendingAction: pending });
  const withAction: AstraMessageRecord = { ...message, pendingAction: pending };
  emit({ type: "awaiting_confirmation", action: pending, message: withAction });
  emit({ type: "done", status: "awaiting_confirmation" });
  return "awaiting_confirmation";
}

async function finishTurn(s: Session, markdown: string): Promise<ThreadState["status"]> {
  const { deps, ctx, threadId, cp, emit } = s;
  const text = markdown.trim() || (cp.turn.sources.length > 0 ? "Done." : "I don't have anything to add.");
  // Save before emitting, so a reload shows exactly what the stream showed.
  const message = await deps.store.appendMessage(ctx.orgId, {
    threadId,
    role: "astra",
    markdown: text,
    artifacts: cp.turn.artifacts,
    sources: cp.turn.sources,
    suggestions: cp.turn.suggestions,
    proof: cp.turn.sources.length > 0 ? completeProof(cp.turn.proof) : null,
    pendingAction: null,
  });
  closeDanglingToolCalls(cp, "Not run: the turn ended before reaching this step.");
  await deps.store.saveState(threadId, ctx.orgId, { status: "idle", checkpoint: cp, pendingAction: null });
  emit({ type: "message", message });
  emit({ type: "done", status: "idle" });
  return "idle";
}

/**
 * Every assistant tool call must be followed by a result before the next model
 * request (Anthropic rejects the history otherwise). Give unrun calls an
 * explicit "not run" result and clear the pending batch.
 */
export function closeDanglingToolCalls(cp: Checkpoint, reason: string): void {
  for (let i = cp.pendingToolIndex; i < cp.pendingToolCalls.length; i++) {
    const call = cp.pendingToolCalls[i];
    const alreadyAnswered = cp.messages.some((m) => m.role === "tool" && m.tool_call_id === call.id);
    if (!alreadyAnswered) {
      cp.messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: reason }) });
    }
  }
  cp.pendingToolCalls = [];
  cp.pendingToolIndex = 0;
}

async function failThread(s: Session, reason: string): Promise<void> {
  const { deps, ctx, threadId, cp, emit } = s;
  closeDanglingToolCalls(cp, "Not run: the turn failed before reaching this step.");
  const message = await deps.store.appendMessage(ctx.orgId, {
    threadId,
    role: "system",
    markdown: reason,
    artifacts: [],
    sources: cp.turn.sources,
    suggestions: [],
    proof: null,
    pendingAction: null,
  }).catch(() => null);
  await deps.store.saveState(threadId, ctx.orgId, { status: "failed", checkpoint: cp, pendingAction: null }).catch(() => {});
  if (message) emit({ type: "message", message });
  emit({ type: "error", message: reason });
  emit({ type: "done", status: "failed" });
}

export type { AstraEvent };
