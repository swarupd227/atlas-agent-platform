import { describe, it, expect } from "vitest";
import { buildConversationHistoryText, FOLLOW_UP_CONTEXT_INSTRUCTIONS } from "../server/conversation-history";

/**
 * server/conversation-history.ts (test finding SC-A-04, "follow-up query
 * handling"): a follow-up like "And last month?" must see the ACTUAL prior
 * tool call (SQL + date range), not just the rendered prose, or the model
 * has nothing concrete to reparameterize.
 */

describe("buildConversationHistoryText", () => {
  it("renders plain user/assistant turns with no toolCalls exactly as before", () => {
    const text = buildConversationHistoryText([
      { role: "user", content: "How many customers are inactive?" },
      { role: "assistant", content: "312 customers have been inactive for 60+ days." },
    ]);
    expect(text).toBe(
      "User: How many customers are inactive?\n\nAssistant: 312 customers have been inactive for 60+ days."
    );
  });

  it("appends the tool call verbatim after an assistant turn that ran one", () => {
    const text = buildConversationHistoryText([
      { role: "user", content: "How many customers are inactive?" },
      {
        role: "assistant",
        content: "312 customers have been inactive for 60+ days.",
        toolCalls: [{ tool: "sql_execute_query", input: { sql: "SELECT count(*) FROM customers WHERE last_purchase < now() - interval '60 days'" }, output: { rows: [{ count: 312 }] }, status: "success" }],
      },
    ]);
    expect(text).toContain('[ran tool "sql_execute_query" with input {"sql":"SELECT count(*) FROM customers WHERE last_purchase < now() - interval \'60 days\'"}');
    expect(text).toContain('{"rows":[{"count":312}]}');
  });

  it("renders a failed tool call's error instead of its (absent) output", () => {
    const text = buildConversationHistoryText([
      { role: "assistant", content: "I couldn't run that query.", toolCalls: [{ tool: "sql_execute_query", status: "error", error: "syntax error" }] },
    ]);
    expect(text).toContain('[ran tool "sql_execute_query" -> error: syntax error]');
  });

  it("truncates a very long tool output to 500 chars", () => {
    const bigOutput = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `Customer ${i}` })) };
    const text = buildConversationHistoryText([
      { role: "assistant", content: "Here are the results.", toolCalls: [{ tool: "sql_execute_query", output: bigOutput, status: "success" }] },
    ]);
    const toolLine = text.split("\n").find(l => l.includes("[ran tool"))!;
    expect(toolLine.length).toBeLessThan(600);
  });

  it("ignores malformed toolCalls entries (no tool name) without throwing", () => {
    const text = buildConversationHistoryText([
      { role: "assistant", content: "ok", toolCalls: [{ notATool: true } as any] },
    ]);
    expect(text).toBe("Assistant: ok");
  });

  it("treats a non-array toolCalls (e.g. null from an older row) as no tool calls", () => {
    const text = buildConversationHistoryText([
      { role: "assistant", content: "ok", toolCalls: null },
    ]);
    expect(text).toBe("Assistant: ok");
  });

  it("handles an empty message list", () => {
    expect(buildConversationHistoryText([])).toBe("");
  });

  it("multiple turns each keep their own tool calls attached to the right turn", () => {
    const text = buildConversationHistoryText([
      { role: "user", content: "inactive customers?" },
      { role: "assistant", content: "312 inactive.", toolCalls: [{ tool: "sql_execute_query", input: { sql: "...60 days..." } }] },
      { role: "user", content: "And last month?" },
    ]);
    const lines = text.split("\n\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("312 inactive.");
    expect(lines[1]).toContain("60 days");
    expect(lines[2]).toBe("User: And last month?");
  });
});

describe("FOLLOW_UP_CONTEXT_INSTRUCTIONS", () => {
  it("explicitly instructs re-running the query with a modified parameter, not repeating the prior answer", () => {
    expect(FOLLOW_UP_CONTEXT_INSTRUCTIONS).toMatch(/re-run/i);
    expect(FOLLOW_UP_CONTEXT_INSTRUCTIONS).toMatch(/do not just repeat/i);
  });
});
