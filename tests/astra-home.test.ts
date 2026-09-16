/**
 * server/astra/home.ts: the briefing shown before the first message.
 */
import { describe, it, expect } from "vitest";
import { buildHome, type HomeInput } from "../server/astra/home";

const input = (over: Partial<HomeInput> = {}): HomeInput => ({
  organizationName: "Summit Equipment",
  industry: { label: "Equipment Dealers & Distribution", source: "tenant", organizationLabel: null },
  needs: { ok: true, data: { needsDecisionCount: 3, urgentCount: 1, decidableHere: 2 } },
  agents: { ok: true, data: { runnable: 5 } },
  outcomes: { ok: true, data: { total: 4, pendingReview: 1 } },
  connectors: { ok: true, data: { total: 6, connected: 2, notConnected: 1 } },
  ...over,
});

describe("buildHome", () => {
  it("counts what needs attention, and every row asks Astra rather than asserting the number", () => {
    const home = buildHome(input());
    expect(home.rows.map((r) => r.id)).toEqual(["needs", "agents", "outcomes", "connectors", "industry"]);
    expect(home.rows[0]).toMatchObject({ count: 3, detail: "1 urgent · 2 you can decide here", tone: "attention" });
    expect(home.rows.find((r) => r.id === "industry")).toMatchObject({ detail: "Equipment Dealers & Distribution, set for Summit Equipment", tone: "neutral" });
    for (const row of home.rows) expect(row.prompt.length).toBeGreaterThan(10);
  });

  it("leaves out a section the role can't see, rather than showing it as empty", () => {
    const home = buildHome(input({ connectors: null }));
    expect(home.rows.map((r) => r.id)).not.toContain("connectors");
  });

  it("says a section couldn't load instead of showing zero", () => {
    const row = buildHome(input({ outcomes: { ok: false, reason: "the data isn't available right now" } })).rows.find((r) => r.id === "outcomes")!;
    expect(row).toMatchObject({ count: null, tone: "unavailable" });
    expect(row.detail).toMatch(/^Couldn't load/);
  });

  it("says when the organization has no industry, and names a personal view", () => {
    expect(buildHome(input({ industry: { label: null, source: "none", organizationLabel: null } })).rows.at(-1)).toMatchObject({ detail: "Not set for Summit Equipment", tone: "attention" });
    expect(buildHome(input({ industry: { label: "Healthcare", source: "request", organizationLabel: "Insurance" } })).rows.at(-1)!.detail).toBe("Viewing Healthcare · Summit Equipment is Insurance");
  });

  it("shows no cost or value figures, and says why", () => {
    const home = buildHome(input());
    expect(JSON.stringify(home.rows)).not.toMatch(/\$|cost|value|saved|ROI/i);
    expect(home.notShown.join(" ")).toMatch(/aren't measured/);
  });
});
