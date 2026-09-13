/**
 * Waiting on an Anthropic call without being able to tell a stalled request
 * from a slow one.
 *
 * Agent-runtime calls used to be non-streaming. A non-streaming response
 * arrives all at once at the end, so a connection that has stalled looks
 * exactly like a long answer still being written -- until the SDK's 10-minute
 * timeout. Observed live on one content-planning journey: a step that normally
 * takes ~300s failed at 900s (a 600s timeout plus a retry that did not fit its
 * node limit), and the brief-writing step failed at 1,241s after two
 * consecutive 600s timeouts on the same request. Across all runs, roughly 30%
 * of agent time was spent waiting on requests like these.
 *
 * Streamed, a healthy call emits events continuously while it writes TEXT, and
 * a stalled one goes silent. So the call now streams, and is abandoned once it
 * has been silent for too long -- raised as a retryable StreamIdleTimeoutError,
 * so the provider's retry loop tries again in minutes instead of ten. Streaming
 * also removes the SDK's refusal of non-streaming requests expected to run past
 * 10 minutes, so a genuinely long generation is no longer cut off either.
 *
 * "Silent for too long" depends on what the model is producing. Tool calls are
 * NOT streamed continuously: the API emits a tool's input one complete key and
 * value at a time, so a call whose argument is one large value (a deck
 * assembler passing a fill map of ~180 shape replacements to
 * fill_document_template) streams nothing at all while that value is written --
 * for minutes, on a perfectly healthy call. Server-side tools go quiet the same
 * way while their sandbox runs. The first version of this watchdog used one
 * 2-minute limit for everything and killed every such call (live: the Deck
 * Studio assembler failed after 1,600s of retries, having built a deck in ~250s
 * before streaming). So the short limit applies while the model is writing
 * text, and once the response begins a tool call the limit becomes
 * ANTHROPIC_TOOL_IDLE_TIMEOUT_MS -- the same ten minutes these calls always had.
 */

/**
 * Longest silence tolerated while the model is writing text. It must exceed
 * the gap before the first content event on the largest prompts -- time spent
 * reading the input before any token is written -- or healthy calls would be
 * killed during that pause. Agent prompts run up to roughly 60k tokens; that
 * reading time is well under a minute, and two minutes leaves a wide margin
 * while still catching a stall five times sooner than the old 10-minute timeout.
 */
export const ANTHROPIC_STREAM_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Longest silence tolerated once the response has started a tool call, for the
 * rest of that call. Equal to the SDK's non-streaming timeout, so a call that
 * builds a large tool input waits exactly as long as it did before streaming.
 */
export const ANTHROPIC_TOOL_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export class StreamIdleTimeoutError extends Error {
  readonly idleTimeoutMs: number;

  constructor(idleTimeoutMs: number) {
    super(
      `Anthropic stream received no events for ${Math.round(idleTimeoutMs / 1000)}s -- the request looks stalled, abandoning it so it can be retried`,
    );
    this.name = "StreamIdleTimeoutError";
    this.idleTimeoutMs = idleTimeoutMs;
  }
}

/** The part of the SDK's MessageStream this relies on. */
export interface IdleWatchableStream<T> {
  on(event: "connect" | "streamEvent", listener: (...args: any[]) => void): unknown;
  abort(): void;
  finalMessage(): Promise<T>;
}

/** Content blocks during and after which the API legitimately sends nothing for long stretches. */
const TOOL_BLOCK_TYPES = new Set(["tool_use", "server_tool_use"]);

function startsToolBlock(event: unknown): boolean {
  const e = event as { type?: string; content_block?: { type?: string } } | undefined;
  return e?.type === "content_block_start" && TOOL_BLOCK_TYPES.has(e.content_block?.type ?? "");
}

/**
 * Resolves with the stream's final message. Aborts the stream if it goes quiet
 * for longer than the current limit (rejecting with StreamIdleTimeoutError), or
 * if `signal` aborts (rejecting with the SDK's own abort error, which is
 * deliberately NOT retryable: the caller has stopped wanting the answer).
 *
 * The limit is `idleTimeoutMs` until the response starts a tool call, then
 * `toolIdleTimeoutMs` for the remainder of the call.
 */
export async function awaitStreamWithIdleTimeout<T>(
  stream: IdleWatchableStream<T>,
  opts: { idleTimeoutMs: number; toolIdleTimeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  const toolLimit = Math.max(opts.toolIdleTimeoutMs ?? ANTHROPIC_TOOL_IDLE_TIMEOUT_MS, opts.idleTimeoutMs);
  let limit = opts.idleTimeoutMs;
  let firedAfterMs: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rearm = () => {
    if (timer) clearTimeout(timer);
    const armedFor = limit;
    timer = setTimeout(() => {
      firedAfterMs = armedFor;
      stream.abort();
    }, armedFor);
  };
  const onEvent = (event?: unknown) => {
    if (startsToolBlock(event)) limit = toolLimit;
    rearm();
  };
  const onCallerAbort = () => stream.abort();

  rearm();
  stream.on("connect", () => rearm());
  stream.on("streamEvent", onEvent);
  if (opts.signal) {
    if (opts.signal.aborted) stream.abort();
    else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  try {
    return await stream.finalMessage();
  } catch (err) {
    // A caller abort wins over an idle abort that happened to fire at the same moment.
    if (firedAfterMs !== undefined && !opts.signal?.aborted) throw new StreamIdleTimeoutError(firedAfterMs);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}
