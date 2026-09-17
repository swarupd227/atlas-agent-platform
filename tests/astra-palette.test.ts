/**
 * client/src/astra/palette.ts: the ⌘K palette's rows and ranking.
 */
import { describe, it, expect } from "vitest";
import { buildPaletteRows, rank } from "../client/src/astra/palette";

const sources = {
  threads: [
    { id: "t1", title: "Rental fleet utilization outcome", status: "idle" },
    { id: "t2", title: "Credit checks for new dealers", status: "awaiting_confirmation" },
  ],
  library: [
    { id: "conversations", label: "Conversations", items: [{ id: "t1", name: "Rental fleet utilization outcome", detail: null, href: "/t/t1", inShell: true }] },
    { id: "agents", label: "Agents", items: [{ id: "a1", name: "Credit Risk Scorer", detail: "Scores dealer credit", href: "/agents/a1" }, { id: "a2", name: "Invoice Matcher", detail: null, href: "/agents/a2" }] },
    { id: "outcomes", label: "Outcomes", items: [{ id: "o1", name: "Faster credit decisions", detail: null, href: "/outcomes/o1" }] },
  ],
  prompts: [{ label: "Turn a goal into an outcome", prompt: "I have a goal" }, { label: "Which agents are live?", prompt: "Which agents are live?" }],
};

describe("buildPaletteRows", () => {
  it("always offers to send what was typed as the first row", () => {
    const rows = buildPaletteRows("credit", sources);
    expect(rows[0]).toEqual({ kind: "ask", key: "ask", label: 'Ask Astra "credit"', text: "credit" });
  });

  it("then conversations, then library items (not conversations twice), ranked by where the match falls", () => {
    const rows = buildPaletteRows("credit", sources);
    expect(rows.map((r) => r.kind)).toEqual(["ask", "conversation", "item", "item"]);
    expect(rows.filter((r) => r.kind === "item").map((r) => r.label)).toEqual(["Credit Risk Scorer", "Faster credit decisions"]);
    expect(rows[1]).toMatchObject({ label: "Credit checks for new dealers", detail: "waiting on you", href: "/t/t2" });
  });

  it("with nothing typed shows recent conversations and prompts, and no library dump", () => {
    const rows = buildPaletteRows("", sources);
    expect(rows.map((r) => r.kind)).toEqual(["conversation", "conversation", "prompt", "prompt"]);
  });

  it("marks same-named items in a section so they can be told apart", () => {
    const lib = [{ id: "teams", label: "Teams", items: [{ id: "t-aaaa", name: "Rental Orchestrator", detail: null, href: "/agents/t-aaaa" }, { id: "t-bbbb", name: "Rental Orchestrator", detail: null, href: "/agents/t-bbbb" }, { id: "t-cccc", name: "Rental Billing", detail: null, href: "/agents/t-cccc" }] }];
    const items = buildPaletteRows("rental", { ...sources, library: lib }).filter((r) => r.kind === "item") as Array<{ label: string; duplicate?: boolean }>;
    expect(items.map((r) => [r.label, !!r.duplicate])).toEqual([["Rental Orchestrator", true], ["Rental Orchestrator", true], ["Rental Billing", false]]);
  });

  it("works before the library has loaded", () => {
    expect(buildPaletteRows("invoice", { ...sources, library: null }).map((r) => r.kind)).toEqual(["ask"]);
  });
});

describe("rank", () => {
  it("prefers a prefix, then a word start, then a substring", () => {
    expect(rank("Invoice Matcher", "inv")).toBe(0);
    expect(rank("Invoice Matcher", "mat")).toBe(1);
    expect(rank("Invoice Matcher", "tch")).toBe(2);
    expect(rank("Invoice Matcher", "zzz")).toBe(-1);
  });
});
