/**
 * Per-request options for Anthropic calls that already sit inside the
 * platform's own retry loop (withRetry in llm-provider.ts).
 *
 * The SDK retries on its own by default (maxRetries 2), and it does so
 * silently, underneath withRetry's logged, jittered attempts. A request that
 * hangs therefore burns the SDK's full 10-minute timeout up to three times
 * before withRetry ever sees an error -- about 30 minutes that surfaces as a
 * single "attempt 1/3" line. Observed live: a DAG node produced nothing for 15
 * minutes, its own node timeout fired and the run moved on, and 19 seconds
 * later the platform began a retry of that abandoned request.
 *
 * With the SDK's retries off, withRetry is the one retry loop and every attempt
 * appears in the logs. The timeout is set explicitly rather than inherited so
 * it is visible here, and it is deliberately NOT shorter than the SDK default:
 * measured generation runs at roughly 44 tokens/second, so a healthy call
 * writing 16-21k tokens needs 6-8 minutes, and a shorter ceiling would cut off
 * work that was succeeding. Ten minutes is also the most the SDK allows a
 * non-streaming request.
 *
 * Applied per request rather than on the client, because the same client is
 * shared with callers that have no outer retry (the Files API path via
 * getRawClient); turning the SDK's retries off client-wide would silently
 * remove the only retry those callers have.
 */
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export interface AnthropicRequestOptions {
  timeout: number;
  maxRetries: number;
  headers?: Record<string, string>;
}

export function anthropicRequestOptions(betas?: readonly string[] | null): AnthropicRequestOptions {
  return {
    timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
    maxRetries: 0,
    ...(betas && betas.length > 0 ? { headers: { "anthropic-beta": betas.join(",") } } : {}),
  };
}
