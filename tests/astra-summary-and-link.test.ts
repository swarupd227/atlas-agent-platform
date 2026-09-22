/**
 * Astra Cowork answers with a summary and a link: the reply is a sentence or
 * two with the real numbers, and the detail is one click away on a card that
 * links to its full page. So every card a tool returns names that page, and
 * the links go to the page that actually shows the thing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { buildAstraSystemPrompt } from "../server/astra/prompt";
import { policyFromSearch } from "../client/src/pages/governance-overview";

const TOOLS = join(__dirname, "..", "server", "astra", "tools");

/**
 * Cards with nothing to open yet: a draft that isn't saved, a proposal that
 * isn't built, and an industry description that has no page of its own.
 */
const NO_PAGE = new Set(["outcomeDraft", "teamProposal", "text"]);

describe("every card links to its full page", () => {
  const cards: Array<{ file: string; kind: string; linked: boolean }> = [];
  for (const file of readdirSync(TOOLS).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(TOOLS, file), "utf8");
    const re = /artifact:\s*\{\s*kind:\s*"([A-Za-z]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // The card object ends before the next property of the tool result.
      const rest = src.slice(m.index, m.index + 900);
      const end = rest.search(/\n\s{0,8}(proof|payload):|\n\s*\};?\n/);
      const body = end > 0 ? rest.slice(0, end) : rest;
      cards.push({ file, kind: m[1], linked: body.includes("fullViewHref") });
    }
  }

  it("finds the cards", () => {
    expect(cards.length).toBeGreaterThan(20);
  });

  it("gives each one a full view, unless there is nothing to open yet", () => {
    const missing = cards.filter((c) => !c.linked && !NO_PAGE.has(c.kind)).map((c) => `${c.file}: ${c.kind}`);
    expect(missing).toEqual([]);
  });
});

describe("the links go to the page that shows the thing", () => {
  it("policy cards and Library rows open Governance, not the regulation catalogue", () => {
    expect(readFileSync(join(TOOLS, "governance.ts"), "utf8")).not.toContain("/governance/policy-engine");
    const routes = readFileSync(join(__dirname, "..", "server", "routes", "astra.ts"), "utf8");
    expect(routes).not.toContain('href: "/governance/policy-engine"');
    expect(routes).toContain("href: `/governance?policy=${encodeURIComponent(p.id)}`");
  });

  it("Governance opens the policy named in the link", () => {
    expect(policyFromSearch("?policy=abc-123")).toBe("abc-123");
    expect(policyFromSearch("?policy=")).toBeNull();
    expect(policyFromSearch("")).toBeNull();
  });
});

describe("the reply is a summary", () => {
  const prompt = buildAstraSystemPrompt({ orgId: "o", userId: "u", role: "admin" } as any, { toolNames: [], organizationName: null, packs: [] } as any);

  it("tells Astra to summarise and point to the card, not reproduce it", () => {
    expect(prompt).toContain("Reply with a summary, not the detail");
    expect(prompt).toContain("each card links to its full page");
    expect(prompt).toContain("Never reproduce a list, table or page in the reply");
  });
});
