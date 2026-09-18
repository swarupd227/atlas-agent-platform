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
