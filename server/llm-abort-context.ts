/**
 * Lets whoever starts a unit of agent work cancel the model calls made inside
 * it, without threading an AbortSignal through every layer in between.
 *
 * The DAG engine gives each worker node a timeout, but the timeout only stops
 * the engine WAITING -- the request itself kept running. A node that gave up
 * at 900s left its model call going, still billing and still competing for the
 * account's per-minute token allowance with the next node (seen live: the step
 * after an abandoned one ran at half its usual speed). The engine now runs each
 * worker inside a signal scope and aborts the scope when the node times out;
 * the provider reads the scope's signal for every call it makes.
 *
 * AsyncLocalStorage carries the signal across every await in the call chain,
 * so executeWorkerAgent and the runtime between the engine and the provider
 * need no changes. A scope started inside another (a team nested in a team)
 * aborts when either its own signal or any enclosing one does.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage<AbortSignal>();

export function runWithLlmAbortSignal<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  const enclosing = scope.getStore();
  const effective = enclosing ? AbortSignal.any([enclosing, signal]) : signal;
  return scope.run(effective, fn);
}

/** The signal for the current unit of work, if one was started with runWithLlmAbortSignal. */
export function currentLlmAbortSignal(): AbortSignal | undefined {
  return scope.getStore();
}
