/**
 * An answer that nothing was dispatched for is a narrative, and the card says so.
 *
 * Live 2026-10-05, run f31cf17f of "Cloud E2E Refund Handling Orchestrator":
 * the ANSWER panel read
 *   {"paymentStatus":"Processed after manager approval","customerNotified":true}
 * while the platform-verified log, further down the same panel, read 0 tool
 * calls for every step. No refund was processed and no customer was notified.
 * The team's one tool was {"name":"refund_processing_system","description":...}
 * -- a name and a description with no server behind it -- and the step that
 * made the claim had no tools at all.
 *
 * The log was right and was doing its job. What was wrong is that the claim sat
 * at the top in the headline position and its refutation was below the fold.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const card = read("client", "src", "astra", "renderers", "team-run.tsx");
const services = read("server", "astra", "services.ts");
const runtime = read("server", "agent-runtime.ts");

describe("the card warns before it quotes", () => {
  it("shows the warning only when no tool call completed", () => {
    expect(card).toContain("run.toolCalls === 0");
    expect(card).toContain('data-testid="astra-team-run-no-tool-calls"');
  });

  it("puts it above the answer, not after it", () => {
    // Below the answer it is the same scroll problem in a smaller font.
    const warn = card.indexOf('data-testid="astra-team-run-no-tool-calls"');
    const answer = card.indexOf("<Markdown text={run.answer}");
    expect(warn).toBeGreaterThan(-1);
    expect(answer).toBeGreaterThan(-1);
    expect(warn).toBeLessThan(answer);
  });

  it("says completed, not dispatched", () => {
    // The count is of calls that SUCCEEDED, so a run whose only call errored
    // also reads 0. "Nothing was dispatched" would be the wrong words there.
    const line = card.slice(card.indexOf('data-testid="astra-team-run-no-tool-calls"'));
    expect(line.slice(0, 400)).toContain("No tool calls completed in this run");
    expect(line.slice(0, 400)).not.toMatch(/nothing was dispatched/i);
  });
});

describe("the number the warning rests on is the dispatcher's, not the model's", () => {
  it("the run view carries the run's own total", () => {
    expect(services).toContain("toolCalls: row.totalToolCalls ?? 0");
  });

  it("that total counts the dispatcher's results, not anything an agent said", () => {
    // This is the invariant the warning depends on. If toolsUsed is ever built
    // from the model's narrative instead of toolCallResults, the card starts
    // telling people an answer is unverified -- or worse, stays silent on one
    // that is -- on the strength of what the model claimed it did.
    expect(runtime).toContain("toolsUsed: toolCallResults.filter(r => !r.error).map(r => ({ server: r.serverName, tool: r.toolName }))");
    expect(runtime).toContain("toolCallCount: Array.isArray(result.summary.toolsUsed) ? result.summary.toolsUsed.length : 0");
  });

  it("the verified log the user scrolled to reads the same ground truth", () => {
    // buildVerifiedToolCallLog filters the step records for api_call. Same
    // source, so the warning and the log can't disagree.
    expect(runtime).toContain('const calls = (steps || []).filter((s: any) => s.type === "api_call")');
    expect(runtime).toContain("PLATFORM-VERIFIED TOOL CALL LOG (ground truth, not the model's narrative)");
  });
});
