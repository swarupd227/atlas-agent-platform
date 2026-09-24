/**
 * Watching a turn whose live updates stopped. Pure: no React, no DOM.
 *
 * The turn keeps running on the server when the stream drops (a proxy
 * timeout, a lost network, a deploy mid-turn), so the conversation is watched
 * until it settles instead of telling the person to reload. A turn that never
 * settles is one whose process died; the server frees the conversation a few
 * minutes later (STALE_RUNNING_MINUTES in server/astra/store.ts), and the
 * watch gives up at the same point rather than polling forever.
 */

/** How long between checks, backing off from every 2s to every 10s. */
export function nextDelayMs(attempt: number): number {
  return Math.min(10_000, 2_000 + attempt * 1_000);
}

/** Whether to look again: only while the turn is running, and only for so long. */
export function keepWatching(status: string, elapsedMs: number, limitMs = 4 * 60_000): boolean {
  return status === "running" && elapsedMs < limitMs;
}

/** What to say once watching stops. */
export function watchOutcome(status: string): { settled: boolean; message: string | null } {
  if (status === "running") {
    return {
      settled: false,
      message: "That turn stopped reporting and hasn't finished. It was probably interrupted on the server; the conversation frees itself in a few minutes, and nothing it had already done is lost.",
    };
  }
  if (status === "failed") return { settled: true, message: "That turn ended in an error. What it had already done is saved." };
  return { settled: true, message: null };
}
