import { describe, it, expect } from "vitest";
import { compileRedactPatterns, redactStringLeaves, redactText } from "../server/output-redaction";

describe("output redaction", () => {
  const res = compileRedactPatterns(["Solent Materials", "(", "Harbour Industrial"]);

  it("skips invalid patterns and redacts case-insensitively", () => {
    expect(res).toHaveLength(2);
    expect(redactText("solent materials plc", res)).toEqual({ value: "[REDACTED] plc", matches: 1 });
  });

  it("rewrites string leaves only, keeping JSON shape, keys and contract metadata", () => {
    const input = { severity: "Critical", summary: "Solent Materials offer", findings: [{ note: "Harbour Industrial bid" }], contractStatus: "Solent Materials", "Solent Materials": "key" };
    const { value, matches } = redactStringLeaves(input, res);
    expect(matches).toBe(2);
    expect(value.severity).toBe("Critical");
    expect(value.summary).toBe("[REDACTED] offer");
    expect(value.findings[0].note).toBe("[REDACTED] bid");
    expect(value.contractStatus).toBe("Solent Materials");
    expect(Object.keys(value)).toContain("Solent Materials");
    expect(() => JSON.parse(JSON.stringify(value))).not.toThrow();
  });

  it("is a no-op with no patterns", () => {
    const o = { a: "x" };
    expect(redactStringLeaves(o, [])).toEqual({ value: o, matches: 0 });
  });
});
