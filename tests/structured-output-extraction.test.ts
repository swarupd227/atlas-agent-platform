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
