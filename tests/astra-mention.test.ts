/**
 * @-mentions: the composer's parsing (client/src/astra/mention.ts) and the
 * server resolving "@Name" to the agent.
 */
import { describe, it, expect } from "vitest";
import { applyMention, duplicateNames, findMentionQuery, isCompletedMention, rankMentionables } from "../client/src/astra/mention";
import { resolveAgent } from "../server/astra/tools/run-agent";

const agents = [
  { id: "a1", name: "Invoice Matcher", description: null },
  { id: "a2", name: "Credit Risk Scorer", description: null },
  { id: "a3", name: "Dunning Letter Writer", description: null },
  { id: "a4", name: "Invoice Matcher", description: "EU copy" },
];

describe("findMentionQuery", () => {
  it("finds the mention being typed at the caret", () => {
    const text = "Ask @Inv";
    expect(findMentionQuery(text, text.length)).toEqual({ start: 4, query: "Inv" });
    expect(findMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("ignores email addresses, finished lines and a space straight after @", () => {
    expect(findMentionQuery("mail ops@acme.com", 17)).toBeNull();
    expect(findMentionQuery("@Inv\nnext", 9)).toBeNull();
    expect(findMentionQuery("@ hello", 7)).toBeNull();
    expect(findMentionQuery("no mention", 10)).toBeNull();
  });
});

describe("applyMention", () => {
  it("replaces the typed query with the full name and a space, keeping the rest", () => {
    const text = "Ask @inv to check today's batch";
    const m = findMentionQuery(text, 8)!;
    expect(applyMention(text, m, 8, "Invoice Matcher")).toEqual({ text: "Ask @Invoice Matcher to check today's batch", caret: 21 });
  });
});

describe("rankMentionables", () => {
  it("prefers names that start with the query, then a word that does", () => {
    expect(rankMentionables(agents, "cr").map((a) => a.id)).toEqual(["a2"]);
    expect(rankMentionables(agents, "letter").map((a) => a.id)).toEqual(["a3"]);
    expect(rankMentionables(agents, "zzz")).toEqual([]);
    expect(rankMentionables(agents, "")).toHaveLength(4);
  });

  it("flags names shared by several agents", () => {
    expect(duplicateNames(agents)).toEqual(new Set(["invoice matcher"]));
  });
});

describe("isCompletedMention", () => {
  it("treats a full agent name followed by a space as finished, so the menu doesn't reopen on it", () => {
    const text = "Ask @Invoice Matcher ";
    const m = findMentionQuery(text, text.length)!;
    expect(m.query).toBe("Invoice Matcher ");
    expect(isCompletedMention(m.query, agents)).toBe(true);
    expect(isCompletedMention("Invoice Matcher", agents)).toBe(false);
    expect(isCompletedMention("Invoice ", agents)).toBe(false);
  });
});
describe("run_agent resolves an @-mention", () => {
  it("strips the @ before matching the name", () => {
    const runnable = [{ id: "a2", name: "Credit Risk Scorer", description: null, ontologyTags: [] }];
    expect(resolveAgent(runnable as any, "@Credit Risk Scorer").agent?.id).toBe("a2");
    expect(resolveAgent(runnable as any, "@credit").agent?.id).toBe("a2");
  });
});