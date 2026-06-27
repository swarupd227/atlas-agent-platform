// n8n connector — outbound bridge (Nous → n8n).
// Calls an n8n workflow via its Webhook node and returns the response so a
// Nous workflow/agent can delegate deterministic automation to n8n.

export interface N8nCallInput {
  /** Full n8n webhook URL, e.g. http://localhost:5678/webhook/abc123 */
  webhookUrl: string;
  payload?: unknown;
  method?: "POST" | "GET" | "PUT";
  /** Optional n8n API key / webhook auth header value. */
  apiKey?: string;
  timeoutMs?: number;
}

export interface N8nCallResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

export async function callN8nWorkflow(input: N8nCallInput): Promise<N8nCallResult> {
  const { webhookUrl, payload, method = "POST", apiKey, timeoutMs = 30000 } = input;
  if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
    return { ok: false, status: 0, data: null, error: "A valid n8n webhookUrl (http/https) is required" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(webhookUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-N8N-API-KEY": apiKey } : {}),
      },
      body: method === "GET" || payload == null ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : `n8n returned ${res.status}` };
  } catch (err: any) {
    const aborted = err?.name === "AbortError";
    return { ok: false, status: 0, data: null, error: aborted ? `n8n call timed out after ${timeoutMs}ms` : (err?.message || "n8n call failed") };
  } finally {
    clearTimeout(timer);
  }
}
