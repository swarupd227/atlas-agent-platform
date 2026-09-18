/**
 * extractStructuredOutput feeds deterministic branch rules. Agents put their
 * routing fields in a closing ```json block, often after a markdown table or
 * an illustrative snippet -- reading only the first fence lost those fields
 * and skipped every branch past the step.
 */
import { describe, it, expect } from "vitest";
import { extractStructuredOutput } from "../server/agent-runtime";

describe("extractStructuredOutput", () => {
  it("parses a bare JSON object", () => {
    expect(extractStructuredOutput('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads a closing json fence after a non-JSON fence", () => {
    const text = "Findings:\n```markdown\n| party | result |\n|---|---|\n```\nDone.\n```json\n{\"riskClearanceStatus\": \"HOLD\"}\n```";
    expect(extractStructuredOutput(text)).toEqual({ riskClearanceStatus: "HOLD" });
  });

  it("merges every JSON fence, later blocks winning", () => {
    const text = "```json\n{\"resolutionDecision\": \"match\", \"accountId\": \"A1\"}\n```\nOn review:\n```\n{\"resolutionDecision\": \"create\"}\n```";
    expect(extractStructuredOutput(text)).toEqual({ resolutionDecision: "create", accountId: "A1" });
  });

  it("finds separate objects embedded in prose", () => {
    const text = 'Search returned {"hits": 0} so the decision is {"resolutionDecision": "create", "note": "no {dupes}"}.';
    expect(extractStructuredOutput(text)).toEqual({ hits: 0, resolutionDecision: "create", note: "no {dupes}" });
  });

  it("returns null for prose with no JSON", () => {
    expect(extractStructuredOutput("No matching accounts found.")).toBeNull();
  });
});

describe("additionalAnalysisFields", () => {
  it("keeps fields beyond the generic analysis shape, such as a routing field", async () => {
    const { additionalAnalysisFields } = await import("../server/agent-runtime");
    const analysis = { summary: "No duplicates.", severity: "low", findings: [], recommendedActions: [], resolutionDecision: "create", accountId: "ACCT-1", contractQualityScore: 0.9 };
    expect(additionalAnalysisFields(analysis)).toEqual({ resolutionDecision: "create", accountId: "ACCT-1" });
  });

  it("returns null when the analysis has only generic fields", async () => {
    const { additionalAnalysisFields } = await import("../server/agent-runtime");
    expect(additionalAnalysisFields({ summary: "x", riskFactors: [] })).toBeNull();
    expect(additionalAnalysisFields(null)).toBeNull();
  });
});

describe("parseModelJsonObject", () => {
  it("reads bare, fenced and prose-embedded JSON answers as one object", async () => {
    const { parseModelJsonObject } = await import("../server/agent-runtime");
    expect(parseModelJsonObject('{"summary": "ok", "severity": "low"}')).toEqual({ summary: "ok", severity: "low" });
    expect(parseModelJsonObject('```json\n{\n  "summary": "fenced",\n  "resolutionDecision": "create"\n}\n```')).toEqual({ summary: "fenced", resolutionDecision: "create" });
    expect(parseModelJsonObject('Here is the result:\n```json\n{"summary": "after prose"}\n```')).toEqual({ summary: "after prose" });
    expect(parseModelJsonObject("No JSON at all.")).toBeNull();
    expect(parseModelJsonObject("")).toBeNull();
  });
});

describe("buildPipelineState promotes a decision the step's records agree on", () => {
  it("lifts a unanimous record field to the top level, leaves disagreements and explicit values alone", async () => {
    const { buildPipelineState, unanimousRecordFields } = await import("../server/agent-runtime");
    const labels = new Map([["n1", "Search"]]);
    const recordsOnly = 'Exact match found.\n```json\n{"processedRecords": [{"accountId": "ACCT-1", "duplicateScore": 0.9, "resolutionDecision": "match"}]}\n```';
    const state = buildPipelineState(new Map([["n1", recordsOnly]]), labels);
    expect(state.resolutionDecision).toBe("match");
    expect(state.accountId).toBe("ACCT-1");

    const split = '```json\n{"processedRecords": [{"accountId": "A", "resolutionDecision": "match"}, {"accountId": "B", "resolutionDecision": "create"}]}\n```';
    expect(buildPipelineState(new Map([["n1", split]]), labels).resolutionDecision).toBeUndefined();

    const explicit = '```json\n{"resolutionDecision": "create", "processedRecords": [{"accountId": "A", "resolutionDecision": "match"}]}\n```';
    expect(buildPipelineState(new Map([["n1", explicit]]), labels).resolutionDecision).toBe("create");

    expect(unanimousRecordFields({ processedRecords: [] })).toEqual({});
    expect(unanimousRecordFields({ processedRecords: [{ nested: { a: 1 } }] })).toEqual({});
  });
});
