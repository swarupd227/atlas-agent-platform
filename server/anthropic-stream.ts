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
 * Streamed, a healthy call emits events continuously while it generates, and a
 * stalled one goes silent. So the call now streams, and is abandoned as soon as
 * it has been silent for ANTHROPIC_STREAM_IDLE_TIMEOUT_MS -- raised as a
 * retryable StreamIdleTimeoutError, so the provider's retry loop tries again in
 * seconds instead of minutes. Streaming also removes the SDK's refusal of
 * non-streaming requests expected to run past 10 minutes, so a genuinely long
 * generation is no longer cut off either.
 */

/**
 * Longest silence tolerated between stream events. It must exceed the gap
 * before the first content event on the largest prompts -- time spent reading
 * the input before any token is written -- or healthy calls would be killed
 * during that pause. Agent prompts run up to roughly 60k tokens; that reading
 * time is well under a minute, and two minutes leaves a wide margin while
 * still catching a stall five times sooner than the 10-minute timeout did.
 */
export const ANTHROPIC_STREAM_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

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

/**
 * Resolves with the stream's final message. Aborts the stream if it goes quiet
 * for idleTimeoutMs (rejecting with StreamIdleTimeoutError), or if `signal`
 * aborts (rejecting with the SDK's own abort error, which is deliberately NOT
 * retryable: the caller has stopped wanting the answer).
 */
export async function awaitStreamWithIdleTimeout<T>(
  stream: IdleWatchableStream<T>,
  opts: { idleTimeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  let idled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rearm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      idled = true;
      stream.abort();
    }, opts.idleTimeoutMs);
  };
  const onCallerAbort = () => stream.abort();

  rearm();
  stream.on("connect", rearm);
  stream.on("streamEvent", rearm);
  if (opts.signal) {
    if (opts.signal.aborted) stream.abort();
    else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  try {
    return await stream.finalMessage();
  } catch (err) {
    // A caller abort wins over an idle abort that happened to fire at the same moment.
    if (idled && !opts.signal?.aborted) throw new StreamIdleTimeoutError(opts.idleTimeoutMs);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}
