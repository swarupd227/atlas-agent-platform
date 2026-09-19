import { describe, it, expect } from "vitest";
import {
  parseClarifyResponse,
  readClarifications,
  formatClarifications,
  buildClarifyPrompt,
  MAX_CLARIFY_QUESTIONS,
} from "../server/process-flow-clarify";

describe("process flow clarifying questions", () => {
  it("nothing missing means ready: an empty list", () => {
    expect(parseClarifyResponse('{"questions": []}')).toEqual([]);
  });

  it("an unreadable reply never blocks drawing the flow", () => {
    expect(parseClarifyResponse("not json")).toEqual([]);
    expect(parseClarifyResponse('{"questions": "none"}')).toEqual([]);
    expect(parseClarifyResponse("null")).toEqual([]);
  });

  it("keeps well-formed questions with options, ids in order", () => {
    const qs = parseClarifyResponse(JSON.stringify({
      questions: [
        { question: "What amount needs manager approval?", why: "Sets the decision threshold.", options: ["$5K", "$10K", "$25K"] },
        { question: "Who approves the launch?", why: "Names the approver.", options: [] },
      ],
    }));
    expect(qs).toEqual([
      { id: "q1", question: "What amount needs manager approval?", why: "Sets the decision threshold.", options: ["$5K", "$10K", "$25K"] },
      { id: "q2", question: "Who approves the launch?", why: "Names the approver.", options: [] },
    ]);
  });

  it(`asks at most ${MAX_CLARIFY_QUESTIONS}, drops blanks and duplicates, caps options`, () => {
    const qs = parseClarifyResponse(JSON.stringify({
      questions: [
        { question: "" },
        { question: "A?", options: ["1", "2", "2", "3", "4", "5", ""] },
        { question: "a?" },
        { question: "B?" },
        { question: "C?" },
        { question: "D?" },
      ],
    }));
    expect(qs.map((q) => q.question)).toEqual(["A?", "B?", "C?"]);
    expect(qs[0].options).toEqual(["1", "2", "3", "4"]);
  });

  it("only answered clarifications reach the generator", () => {
    const c = readClarifications([
      { question: "Threshold?", answer: "$10K" },
      { question: "Approver?", answer: "  " },
      { question: "", answer: "x" },
      "junk",
    ]);
    expect(c).toEqual([{ question: "Threshold?", answer: "$10K" }]);
    expect(readClarifications(undefined)).toEqual([]);
  });

  it("answers are stated to the generator as facts; none adds nothing", () => {
    expect(formatClarifications([])).toBe("");
    const block = formatClarifications([{ question: "Threshold?", answer: "$10K" }]);
    expect(block).toContain("treat these as facts");
    expect(block).toContain("- Threshold? Answer: $10K");
  });

  it("the prompt carries the description and the documents", () => {
    const p = buildClarifyPrompt({ description: "Invoices over a limit need approval", sourcesText: "SOP TEXT" });
    expect(p).toContain("Invoices over a limit need approval");
    expect(p).toContain("SOP TEXT");
    expect(p).toContain(`at most ${MAX_CLARIFY_QUESTIONS} questions`);
  });
});
