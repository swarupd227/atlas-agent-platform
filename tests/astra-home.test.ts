/**
 * server/astra/home.ts: the briefing shown before the first message.
 */
import { describe, it, expect } from "vitest";
import { buildHome, type HomeInput } from "../server/astra/home";

const input = (over: Partial<HomeInput> = {}): HomeInput => ({
  organizationName: "Summit Equipment",
  industry: { label: "Equipment Dealers & Distribution", source: "tenant", organizationLabel: null },
  needs: { ok: true, data: { needsDecisionCount: 3, urgentCount: 1, decidableHere: 2 } },
  agents: { ok: true, data: { offered: 5, teamSteps: 0 } },
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

  it("counts the agents a person would pick, and names the team steps instead of folding them in", () => {
    // The row used to show listRunnableAgents().length, which for a role that
    // can view agents includes every team's internal workers -- 1,036 on the
    // live platform, almost all of them team implementation detail. The
    // Workspace excludes those on purpose (UX audit F-4); the briefing now
    // agrees with it, and says what else is reachable rather than hiding it.
    const row = buildHome(input({ agents: { ok: true, data: { offered: 12, teamSteps: 1024 } } })).rows.find((r) => r.id === "agents")!;
    expect(row).toMatchObject({ count: 12, detail: "1,024 team steps you can also run" });
    const none = buildHome(input({ agents: { ok: true, data: { offered: 0, teamSteps: 0 } } })).rows.find((r) => r.id === "agents")!;
    expect(none).toMatchObject({ count: 0, detail: "None yet" });
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

  it("shows no cost or value figures", () => {
    // The invariant that matters: the briefing never puts an unmeasured
    // business-value number in front of someone.
    expect(JSON.stringify(buildHome(input()).rows)).not.toMatch(/\$|cost|value|saved|ROI/i);
  });

  it("does not explain the absence of figures it never showed", () => {
    // It used to carry "Business value isn't shown here: the rates behind it
    // aren't measured" as a standing footnote. Not showing a figure needs no
    // caption; notShown is for a caveat on something the page DOES show.
    expect(buildHome(input()).notShown).toEqual([]);
  });
});
