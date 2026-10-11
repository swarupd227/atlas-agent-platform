/**
 * server/final-answer.ts: the result format is asked for up front so the tool
 * loop's last turn can be the result, and that turn is accepted only when it
 * actually is one.
 */
import { describe, it, expect } from "vitest";
import {
  finalAnswerInstructions,
  analysisCallPrompt,
  structuredOutputInstructions,
  finalAnswerFromTurn,
  noToolsAnswerOutput,
  hasRecordListSchema,
  ANALYSIS_FIELDS,
} from "../server/final-answer";

const parse = (text: string): Record<string, unknown> | null => {
  try { return JSON.parse(text); } catch { return null; }
};

describe("finalAnswerInstructions", () => {
  it("asks for the analysis fields, the routing fields, and a concise answer", () => {
    const text = finalAnswerInstructions(undefined);
    expect(text).toContain("## FINAL ANSWER FORMAT");
    expect(text).toContain(ANALYSIS_FIELDS);
    expect(text).toContain("ROUTING FIELDS");
    expect(text).toContain("one sentence per finding");
    expect(text).toContain("do not restate the upstream context");
  });

  it("carries the agent's record_list schema into the processedRecords instruction", () => {
    const schema = { type: "record_list", description: "lead", fields: [{ name: "id", type: "string", description: "Lead id" }, { name: "score", type: "number", description: "0-100" }] };
    expect(hasRecordListSchema(schema)).toBe(true);
    const text = finalAnswerInstructions(schema);
    expect(text).toContain('"processedRecords"');
    expect(text).toContain("id (string): Lead id; score (number): 0-100");
  });
});

describe("structuredOutputInstructions", () => {
  it("is the schema's instruction, else the generic one for record-heavy data, else nothing", () => {
    expect(structuredOutputInstructions(null, false)).toBe("");
    expect(structuredOutputInstructions(null, true)).toContain("multiple data records");
    expect(structuredOutputInstructions({ type: "record_list", fields: [{ name: "a", type: "string" }] }, false)).toContain("Process EVERY record");
    expect(hasRecordListSchema({ type: "record_list", fields: [] })).toBe(false);
  });
});

describe("analysisCallPrompt", () => {
  it("is the fallback call's prompt with the same notes", () => {
    const text = analysisCallPrompt(undefined, false);
    expect(text.startsWith("Now analyze the tool results above.")).toBe(true);
    expect(text).toContain(ANALYSIS_FIELDS);
    expect(text).toContain("ROUTING FIELDS");
  });
});

describe("finalAnswerFromTurn", () => {
  it("accepts the turn when nothing is pending and it carries a summary", () => {
    const content = '{"summary": "Account cleared.", "severity": "low", "resolutionDecision": "match"}';
    expect(finalAnswerFromTurn([], content, parse)).toBe(content);
  });

  it("falls back when tool calls are still pending, the text is not JSON, or the summary is empty", () => {
    expect(finalAnswerFromTurn([{ name: "search" }], '{"summary": "x"}', parse)).toBeUndefined();
    expect(finalAnswerFromTurn([], "I have completed the screening.", parse)).toBeUndefined();
    expect(finalAnswerFromTurn([], '{"summary": "  "}', parse)).toBeUndefined();
    expect(finalAnswerFromTurn([], "", parse)).toBeUndefined();
    expect(finalAnswerFromTurn([], null, parse)).toBeUndefined();
  });
});

describe("noToolsAnswerOutput keeps the prose a no-tools reply wrote around its JSON", () => {
  // The runtime's parser also finds a JSON object embedded in prose; this stand-in does the same.
  const parseEmbedded = (text: string): Record<string, unknown> | null => {
    const direct = parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1").trim());
    if (direct) return direct;
    const m = /```json\s*([\s\S]*?)```/.exec(text);
    return m ? parse(m[1]) : null;
  };
  const plan = "## 1. Largest exposure and its cell\nFlood: slight frequency, severe severity, so reduce and prevent.\n\n## 3. Retention\n5% of $9,000,000 = $450,000.\n\n```json\n{\"technique\": \"Reduce and prevent\", \"retentionLevel\": 400000}\n```";

  it("records the whole reply as the analysis text and keeps the block's fields beside it", () => {
    const out = noToolsAnswerOutput(plan, parseEmbedded);
    expect(out.analysis).toBe(plan);
    expect(out.technique).toBe("Reduce and prevent");
    expect(out.retentionLevel).toBe(400000);
  });

  it("returns a reply that is only JSON parsed, fenced or not, exactly as before", () => {
    expect(noToolsAnswerOutput('{"technique": "Transfer", "retentionLevel": 1}', parseEmbedded)).toEqual({ technique: "Transfer", retentionLevel: 1 });
    expect(noToolsAnswerOutput('```json\n{"technique": "Transfer"}\n```', parseEmbedded)).toEqual({ technique: "Transfer" });
  });

  it("leaves a parsed object alone when it already carries its own summary or analysis text", () => {
    const withSummary = '{"summary": "Account cleared.", "severity": "low"}';
    expect(noToolsAnswerOutput(withSummary, parseEmbedded)).toEqual({ summary: "Account cleared.", severity: "low" });
    const prose = "Preamble.\n```json\n{\"summary\": \"Cleared.\"}\n```";
    expect(noToolsAnswerOutput(prose, parseEmbedded)).toEqual({ summary: "Cleared." });
  });

  it("records plain prose as the analysis text", () => {
    expect(noToolsAnswerOutput("No exposures were found.", parseEmbedded)).toEqual({ analysis: "No exposures were found." });
  });
});

describe("finalAnswerInstructions puts the work before the format", () => {
  it("tells the agent to call its tools first and never report a check it did not run", () => {
    const text = finalAnswerInstructions(undefined);
    const work = text.indexOf("Do the work first");
    const format = text.indexOf("reply with only a JSON object");
    expect(work).toBeGreaterThan(-1);
    expect(work).toBeLessThan(format);
    expect(text).toContain("never report a check, lookup or record you did not actually perform");
    expect(text).toContain("only after your tool calls are done");
  });
});
