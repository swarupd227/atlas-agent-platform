/**
 * Resolving the default organization at startup, retried until it succeeds.
 *
 * Every write without an explicit organization resolves to the default org,
 * and the connector listing and the dispatcher's tenancy guard both read it.
 * It used to be looked up once, with the failure swallowed: a single
 * connection-pool timeout at boot (a deploy briefly runs two processes against
 * a small pool) left it unset for the life of the process, so mock connectors
 * vanished from listings and became callable across orgs until the next
 * restart. Retrying with backoff closes that window; the caller holds the
 * readiness signal until it resolves, so the process never serves traffic in
 * that state.
 */
export interface ResolveOptions {
  /** Upper bound on the wait between attempts. */
  maxDelayMs?: number;
  /** First wait; doubles each attempt up to maxDelayMs. */
  initialDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, waitMs: number, err: unknown) => void;
}

export async function resolveWithRetry<T>(lookup: () => Promise<T>, opts: ResolveOptions = {}): Promise<T> {
  const { maxDelayMs = 30_000, initialDelayMs = 1_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry } = opts;
  for (let attempt = 1; ; attempt++) {
    try {
      return await lookup();
    } catch (err) {
      const waitMs = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
      onRetry?.(attempt, waitMs, err);
      await sleep(waitMs);
    }
  }
}
