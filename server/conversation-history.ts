/**
 * Builds the flattened "User: ... / Assistant: ..." conversation history a
 * follow-up chat prompt is assembled from (server/routes/playground.ts).
 * Pure/no dependencies, deliberately kept out of routes/helpers.ts so it's
 * testable without pulling in storage/db/llm-provider.
 *
 * Bug context (test finding SC-A-04, "follow-up query handling"): a
 * follow-up like "And last month?" only ever saw its own prior turn's
 * rendered PROSE, never the actual tool call (e.g. the SQL a Data Agent ran
 * and the date range it used) -- so the model had nothing concrete to
 * reparameterize and just re-ran the previous, unrelated analysis. Callers
 * now persist each assistant turn's tool calls (shared/models/chat.ts's
 * messages.toolCalls) and this function appends them verbatim to history.
 */

export interface ChatToolCallSummary {
  tool: string;
  server?: string;
  input?: unknown;
  output?: unknown;
  status?: string;
  error?: string;
}

export function buildConversationHistoryText(
  msgs: Array<{ role: string; content: string; toolCalls?: unknown }>,
): string {
  return msgs.map(m => {
    const speaker = m.role === "user" ? "User" : "Assistant";
    let text = `${speaker}: ${m.content}`;
    const calls = Array.isArray(m.toolCalls) ? (m.toolCalls as ChatToolCallSummary[]) : [];
    for (const c of calls) {
      if (!c?.tool) continue;
      const input = c.input !== undefined ? ` with input ${JSON.stringify(c.input)}` : "";
      const outcome = c.status === "error"
        ? ` -> error: ${c.error || "failed"}`
        : c.output !== undefined ? ` -> ${JSON.stringify(c.output).slice(0, 500)}` : "";
      text += `\n  [ran tool "${c.tool}"${input}${outcome}]`;
    }
    return text;
  }).join("\n\n");
}

// Appended to a follow-up prompt right after the conversation history, so
// the model has an explicit instruction (not just an inference it might
// make) for the exact failure mode SC-A-04 reported.
export const FOLLOW_UP_CONTEXT_INSTRUCTIONS =
  "## Follow-up handling\nIf the current user message is a short follow-up that doesn't fully restate the request (e.g. \"And last month?\", \"What about the West region?\"), treat it as modifying the specific parameter it names (a date range, a filter, a segment) on the MOST RECENT prior request above, keeping everything else about that request the same -- then actually re-run the underlying query or tool call with that change and return fresh results. Do not just repeat or rephrase the previous answer.";
