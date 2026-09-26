/**
 * Finding a phrase in a past conversation, and knowing what a turn cost.
 *
 * From the Cowork usability review. ⌘K matched only a conversation's title —
 * the first thing you happened to type in it — so "the one where we set the
 * canary to 10%" meant opening conversations until you found it. And a turn
 * that fans out into a team run showed nothing about what it cost, in a
 * product otherwise careful to say what a figure is.
 *
 * The cost shown is the turn's own model calls, as the provider reported them.
 * Work the turn STARTED is billed against that run, not the conversation, and
 * the label says so rather than implying a total.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { snippetAround } from "../server/astra/store";
import { buildPaletteRows } from "../client/src/astra/palette";
import { turnCostLabel } from "../client/src/astra/thread";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const store = read("server", "astra", "store.ts");
const routes = read("server", "routes", "astra.ts");
const palette = read("client", "src", "astra", "command-palette.tsx");
const engine = read("server", "astra", "engine.ts");
const thread = read("client", "src", "astra", "thread.tsx");
const db = read("server", "db.ts");

describe("finding a phrase", () => {
  it("shows it in its own words, with a little either side", () => {
    const line = "We agreed to set the canary to 10% for the first hour, then review it together.";
    const snippet = snippetAround(line, "canary to 10%", 12);
    expect(snippet).toContain("canary to 10%");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBeLessThan(line.length);
    // A short message needs no trimming, and no ellipsis.
    expect(snippetAround("Canary at 10%", "10%", 40)).toBe("Canary at 10%");
  });

  it("collapses the whitespace a markdown answer is full of", () => {
    expect(snippetAround("Line one\n\n-  bullet   two", "bullet", 40)).toBe("Line one - bullet two");
  });

  it("falls back to the start when the phrase isn't there to centre on", () => {
    expect(snippetAround("nothing matching here", "zzz", 5)).toBe("nothing ma");
  });
});

describe("the search itself", () => {
  const body = (() => {
    const at = store.indexOf("async searchMessages(");
    return store.slice(at, store.indexOf("\n  /**", at + 10));
  })();

  it("obeys the same rule as opening a conversation", () => {
    expect(body).toContain("eq(astraMessages.organizationId, orgId)");
    expect(body).toContain("or(isNull(astraThreads.actorUserId), eq(astraThreads.actorUserId, userId))");
  });

  it("returns one hit per conversation, not one per mention", () => {
    expect(body).toContain("if (seen.has(row.threadId)) continue;");
  });

  it("does nothing for a query too short to mean anything", () => {
    expect(body).toContain("if (needle.length < 2) return [];");
  });

  it("is a route behind the permission that uses Cowork", () => {
    expect(routes).toContain('router.get("/api/astra/search", checkPermission("use_astra")');
  });
});

describe("the palette", () => {
  const sources = {
    threads: [{ id: "t1", title: "Canary rollout" }],
    messages: [
      { threadId: "t1", title: "Canary rollout", snippet: "…set the canary to 10%…", role: "astra", at: null },
      { threadId: "t2", title: "Fleet review", snippet: "…canary at 10% overnight…", role: "user", at: null },
    ],
    library: null,
    prompts: [],
  };

  it("offers a conversation whose words match, under its own heading", () => {
    const rows = buildPaletteRows("canary", sources);
    const messages = rows.filter((r) => r.kind === "message");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ label: "Fleet review", href: "/t/t2" });
    expect(messages[0].detail).toContain("canary at 10%");
    expect(palette).toContain('{ kind: "message", heading: "Said in a conversation" }');
  });

  it("doesn't repeat one whose title already matched", () => {
    const rows = buildPaletteRows("canary", sources);
    expect(rows.filter((r) => r.key === "m:t1")).toHaveLength(0);
    expect(rows.filter((r) => r.key === "t:t1")).toHaveLength(1);
  });

  it("asks the server only once there is something to search for", () => {
    expect(palette).toContain("enabled: open && searched.length > 1,");
  });
});

describe("what a turn cost", () => {
  it("keeps sub-cent figures legible rather than rounding them to nothing", () => {
    expect(turnCostLabel(0.0123, 12400)).toBe("$0.012 · 12.4k tokens");
    expect(turnCostLabel(0.004)).toBe("$0.004");
    expect(turnCostLabel(1.5, 900)).toBe("$1.50 · 900 tokens");
  });

  it("is this turn's spend, not the conversation's running total", () => {
    // The checkpoint accumulates across the whole conversation.
    expect(engine).toContain("const costUsd = Math.max(0, s.cp.costUsd - s.spentBefore.costUsd);");
  });

  it("is recorded by the function that STARTS a turn, not the one that resumes it", () => {
    // Live, this was set in resolveAction instead of runTurn, so every ordinary
    // turn recorded nothing -- and the earlier test passed because it only
    // asked whether the line existed somewhere in the file.
    const body = (name: string) => {
      const at = engine.indexOf(`export async function ${name}(`);
      // To the next top-level export: turnSpend sits between these two and
      // naturally mentions spentBefore, so it would otherwise be counted in.
      const next = engine.indexOf("\nexport ", at + 10);
      return engine.slice(at, next > 0 ? next : undefined);
    };
    expect(body("runTurn")).toContain("spentBefore: { costUsd: cp.costUsd, tokens: cp.tokens.total }");
    expect(body("resolveAction")).not.toContain("spentBefore");
  });

  it("reports nothing rather than a wrong figure for a resumed turn", () => {
    // A turn finished by a confirm card was started by a different request.
    expect(engine).toContain("if (!s.spentBefore) return { costUsd: null, tokensTotal: null };");
  });

  it("says what the figure covers, and what it doesn't", () => {
    expect(thread).toContain("billed against that run, not here");
    expect(thread).toContain('data-testid="astra-message-cost"');
  });

  it("is kept with the answer it paid for, added additively at boot", () => {
    expect(db).toContain("ALTER TABLE astra_messages ADD COLUMN IF NOT EXISTS cost_usd REAL;");
    expect(db).toContain("ALTER TABLE astra_messages ADD COLUMN IF NOT EXISTS tokens_total INTEGER;");
  });
});
