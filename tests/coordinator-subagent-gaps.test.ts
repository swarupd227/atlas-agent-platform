/**
 * Three changes from measuring the platform against the coordinator-subagent
 * patterns: a run says when two steps did the same work, a flow can be authored
 * with a coverage review that catches a too-narrow decomposition, and the rule
 * that fires a revision reads a pronounced verdict instead of the word "fail"
 * wherever it appears.
 *
 * The overlap cases all carry real source lists: a test that passes on two empty
 * lists is the usual way this kind of check looks finished without being it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { findRetrievalOverlaps, describeOverlap } from "../shared/retrieval-overlap";
import { verdictFrom, VERDICT_WORDS, REWORK_REQUESTED_RULE } from "../shared/rework-rule";
import { VERDICT_RE } from "../server/dag-execution-engine";
import { evaluateRule } from "../server/rule-evaluator";
import type { CitedSource } from "../shared/retrieval-citations";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const src = (chunkId: string, title: string, chunkIndex = 0): CitedSource =>
  ({ label: `S${chunkIndex + 1}`, sourceId: title.toLowerCase().replace(/\W+/g, "-"), title, chunkIndex, chunkId, excerpt: "…" });

describe("two steps that retrieved the same passages", () => {
  it("reports the pair, with what they shared", () => {
    const overlaps = findRetrievalOverlaps({
      evidence_collector: [src("c1", "Retention Policy"), src("c2", "Retention Policy", 1)],
      market_scanner: [src("c1", "Retention Policy"), src("c2", "Retention Policy", 1)],
    });
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].a).toBe("evidence_collector");
    expect(overlaps[0].b).toBe("market_scanner");
    expect(overlaps[0].sharedChunkIds.sort()).toEqual(["c1", "c2"]);
    expect(overlaps[0].ratio).toBe(1);
    expect(describeOverlap(overlaps[0])).toContain("2 passages");
    expect(describeOverlap(overlaps[0])).toContain("Retention Policy");
  });

  it("does NOT count two passages from one document as duplicated work", () => {
    // The case that decides whether this check is useful or merely noisy: chunk 3
    // and chunk 7 of the same policy are different evidence.
    const overlaps = findRetrievalOverlaps({
      a: [src("c3", "Retention Policy", 3)],
      b: [src("c7", "Retention Policy", 7)],
    });
    expect(overlaps).toEqual([]);
  });

  it("says nothing about disjoint sets, a lone step, or a step that retrieved nothing", () => {
    expect(findRetrievalOverlaps({ a: [src("c1", "A")], b: [src("c2", "B")] })).toEqual([]);
    expect(findRetrievalOverlaps({ a: [src("c1", "A")] })).toEqual([]);
    expect(findRetrievalOverlaps({ a: [src("c1", "A")], b: [] })).toEqual([]);
    expect(findRetrievalOverlaps({})).toEqual([]);
  });

  it("ignores a shared passage or two between large sets, and reports the worst pair first", () => {
    const many = (n: number, from = 0) => Array.from({ length: n }, (_, i) => src(`c${from + i}`, "Big", from + i));
    // 1 shared of 10 is noise; 2 of 2 is not.
    const overlaps = findRetrievalOverlaps({
      wide_a: many(10),
      wide_b: [src("c0", "Big"), ...many(9, 100)],
      narrow_a: [src("x1", "Small"), src("x2", "Small", 1)],
      narrow_b: [src("x1", "Small"), src("x2", "Small", 1)],
    });
    expect(overlaps.map((o) => [o.a, o.b])).toEqual([["narrow_a", "narrow_b"]]);
  });

  it("states what was shared and concludes nothing", () => {
    const [o] = findRetrievalOverlaps({ a: [src("c1", "Policy")], b: [src("c1", "Policy")] });
    const line = describeOverlap(o);
    expect(line).toMatch(/both used/);
    for (const verdict of ["waste", "duplicate work", "should", "error", "wrong"]) {
      expect(line.toLowerCase()).not.toContain(verdict);
    }
  });

  it("is recorded where no prompt can see it", () => {
    const engine = read("server", "dag-execution-engine.ts");
    expect(engine).toContain('export const RETRIEVAL_OVERLAP_STATE_KEY = "__retrieval_overlap";');
    // buildAgentInput skips __-prefixed keys, which is what keeps this off every
    // downstream prompt. If that skip goes, the finding starts costing tokens.
    expect(engine).toContain('key.startsWith("__")');
    expect(engine).toContain("findRetrievalOverlaps(sourcesByStep)");
    // And it never fails a run.
    const block = engine.slice(engine.indexOf("const overlaps = findRetrievalOverlaps"), engine.indexOf("const rewind = this.decideRevision"));
    expect(block).not.toMatch(/success = false|throw |status: "failed"/);
  });

  it("is shown to the person who can judge it", () => {
    const monitor = read("client", "src", "pages", "dag-run-monitor.tsx");
    expect(monitor).toContain("__retrieval_overlap");
    expect(monitor).toContain('data-testid="card-retrieval-overlap"');
  });
});

describe("the rule that sends work back", () => {
  it("reads a verdict as pronounced, not the word in a sentence", () => {
    expect(verdictFrom("## QA: FAIL — three defects")).toBe("FAIL");
    expect(verdictFrom("FAIL: three defects")).toBe("FAIL");
    expect(verdictFrom("**FAIL** - rework needed")).toBe("FAIL");
    expect(verdictFrom("BLOCKED: waiting on legal")).toBe("BLOCKED");
    expect(verdictFrom("## Review: PASS")).toBe("PASS");
  });

  it("does not fire on a passing review that mentions failure", () => {
    // The trap this change exists to close: a coverage reviewer passing the work
    // with "nothing failed" used to send the run back to its planning step and
    // re-run every approval gate on the way.
    const passing = "## Coverage: PASS — every planned question is answered and nothing failed.";
    expect(verdictFrom(passing)).toBe("PASS");
    expect(evaluateRule(REWORK_REQUESTED_RULE, { output: passing, verdict: verdictFrom(passing) }).result).toBe(false);
    expect(evaluateRule(REWORK_REQUESTED_RULE, { output: "the deploy failed yesterday; this draft is fine" }).result).toBe(false);
  });

  it("still fires on every way a reviewer asks for rework", () => {
    for (const facts of [
      { verdict: "FAIL" },
      { verdict: "BLOCKED" },
      { verdict: "REJECTED" },
      { accepted: false },
      { approved: false },
      { redraft: true },
      { rejected: true },
      { requiresRevision: true },
    ]) {
      expect(evaluateRule(REWORK_REQUESTED_RULE, { output: "…", ...facts }).result, JSON.stringify(facts)).toBe(true);
    }
  });

  it("no longer matches the bare word anywhere in the output", () => {
    const conditions = REWORK_REQUESTED_RULE.conditions as Array<{ field?: string; value?: unknown }>;
    expect(conditions.some((c) => c.field === "output" && c.value === "fail")).toBe(false);
  });

  it("reads the same verdict words the facts check does", () => {
    // One list, or a verdict routes one way and is audited another.
    for (const word of VERDICT_WORDS) expect(VERDICT_RE.source).toContain(word);
  });

  it("is computed from the reviewer's own output, and does not overwrite one it stated", () => {
    const engine = read("server", "dag-execution-engine.ts");
    expect(engine).toContain("const pronounced = verdictFrom(text);");
    expect(engine).toContain("...(structured.verdict === undefined && pronounced ? { verdict: pronounced } : {})");
  });
});

describe("a flow that checks its own coverage", () => {
  const page = read("client", "src", "pages", "process-flows.tsx");

  it("is offered as a starter template", () => {
    expect(page).toContain('key: "research"');
    expect(page).toContain('name: "Research & Report"');
  });

  it("sends the run back to planning when a question is unanswered", () => {
    const tpl = page.slice(page.indexOf('key: "research"'));
    expect(tpl).toContain('from: "cover", to: "plan"');
    expect(tpl).toMatch(/maxRounds: 2/);
    // Both branches out of the review, or neither fires and the run dead-ends.
    expect(tpl).toContain('from: "cover", to: "report"');
  });

  it("tells the reviewer to answer with the field, not the word", () => {
    const tpl = page.slice(page.indexOf('key: "research"'), page.indexOf('key: "research"') + 3000);
    expect(tpl).toContain("requiresRevision");
    expect(tpl).toMatch(/Do not use the word fail/i);
  });

  it("is described to whoever drafts a team, with the same warning", () => {
    const proposal = read("server", "team-proposal.ts");
    expect(proposal).toContain("COVERING THE WHOLE ASK");
    expect(proposal).toContain("requiresRevision");
    expect(proposal).toMatch(/not to use the word "fail"/i);
  });
});
