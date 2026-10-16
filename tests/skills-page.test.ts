/**
 * The Skills page's small pure helpers: the trust badge word and the library
 * curator's one-line account of a pass.
 */
import { describe, it, expect } from "vitest";
import { curatorRunLine, trustTierLabel } from "../client/src/pages/skills";

describe("trustTierLabel", () => {
  it("names a skill an agent proposed 'Agent', not 'Market'", () => {
    expect(trustTierLabel("agent-proposed")).toBe("Agent");
    expect(trustTierLabel("platform-provided")).toBe("Platform");
    expect(trustTierLabel("customer-created")).toBe("Custom");
    expect(trustTierLabel("marketplace")).toBe("Market");
    expect(trustTierLabel(undefined)).toBe("Market");
  });
});

describe("curatorRunLine", () => {
  const run = (over: Record<string, unknown> = {}) => ({ mode: "report", status: "done", reason: null, summary: { skills: 4, notes: 6, idle: 0, duplicateSkills: 0, duplicateNotes: 0, weak: 0, filed: 0 }, ...over }) as any;

  it("says the first pass only started the watch", () => {
    expect(curatorRunLine(run({ mode: "seed", summary: {} }))).toBe("Started watching the library");
  });

  it("says how much it looked at when there was nothing to suggest", () => {
    expect(curatorRunLine(run())).toBe("Nothing to suggest (4 skills and 6 notes looked at)");
  });

  it("lists what it found, and says plainly that report mode filed nothing", () => {
    expect(curatorRunLine(run({ summary: { idle: 2, duplicateSkills: 1, duplicateNotes: 1, weak: 1, filed: 0 } }))).toBe("2 idle skills, 1 duplicate skill, 1 duplicate note, 1 weak skill; report only, nothing suggested");
  });

  it("says how many suggestions a propose pass filed", () => {
    expect(curatorRunLine(run({ mode: "propose", summary: { idle: 1, filed: 1 } }))).toBe("1 idle skill; 1 suggested");
  });

  it("says a failed pass failed, and why", () => {
    expect(curatorRunLine(run({ status: "failed", reason: "the pass failed: db down" }))).toBe("Failed: the pass failed: db down");
  });
});
