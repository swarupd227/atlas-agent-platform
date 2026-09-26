/**
 * Stopping a turn that is already running.
 *
 * Cowork had no Stop. The composer disabled itself while a turn streamed and
 * the only abort was the browser's, on navigation — which drops the stream but
 * leaves the turn running on the server, spending money and possibly calling
 * tools. A turn here can fan out into an agent run, so it is longer than a
 * chat's and the want to stop it is stronger.
 *
 * Stopping is cooperative, not a kill: a request sets a flag, and the engine
 * checks it where stopping is safe — between model calls and between tool
 * calls, never inside one. So a tool that has started finishes and its result
 * is recorded, because a half-written record is worse than a slow stop, and
 * the turn then ends with what it has.
 *
 * The flag lives in memory. A restart clears it, which is right: a turn that
 * was running is gone with the process anyway.
 */

/** Threads asked to stop, with when they were asked. */
const requested = new Map<string, number>();

/** How long an unclaimed request stays meaningful. */
export const STOP_REQUEST_TTL_MS = 10 * 60_000;

export function requestStop(threadId: string, now = Date.now()): void {
  requested.set(threadId, now);
}

/** Whether a stop is pending for this thread; stale requests are dropped. */
export function isStopRequested(threadId: string, now = Date.now()): boolean {
  const at = requested.get(threadId);
  if (at === undefined) return false;
  if (now - at > STOP_REQUEST_TTL_MS) {
    requested.delete(threadId);
    return false;
  }
  return true;
}

/** Clear it, whether it was honoured or the turn ended on its own. */
export function clearStop(threadId: string): void {
  requested.delete(threadId);
}

/** For tests, and for a store that wants to start clean. */
export function resetStops(): void {
  requested.clear();
}

/**
 * What the conversation says when a turn is stopped. It is careful about two
 * things: that anything already done is still done, and that stopping is not
 * a failure — the thread goes back to idle, ready for the next message.
 */
export function stoppedMessage(didWork: boolean): string {
  return didWork
    ? "Stopped at your request. What had already run stays done — nothing was undone — and I've kept the results above."
    : "Stopped at your request, before anything ran.";
}
