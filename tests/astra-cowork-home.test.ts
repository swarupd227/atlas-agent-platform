/**
 * Astra Cowork is home. Its first screen says what is waiting, what is
 * running, what finished and what it cost, each as one line with a link to
 * the page that has the detail. Spend is only what runs recorded: no
 * overhead rate or per-tool charge is added.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildActivity, duration, type AgentRunRow, type TeamRunRow } from "../server/astra/home-activity";
import { greetingFor, waitingLine, timeAgo } from "../client/src/astra/home";
import { homeRoute } from "../client/src/lib/home-route";

const NOW = new Date("2026-09-22T09:00:00Z").getTime();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const team = (over: Partial<TeamRunRow>): TeamRunRow => ({
  id: "t1",
  teamAgentId: "a1",
  teamName: "Claims Intake Team",
  status: "running",
  startedAt: minsAgo(12),
  completedAt: null,
  createdAt: minsAgo(12),
  heartbeatAt: minsAgo(1),
  error: null,
  ...over,
});
const agent = (over: Partial<AgentRunRow>): AgentRunRow => ({
  id: "w1",
  agentId: "a2",
  agentName: "Policy Assistant",
  status: "completed",
  requestText: "What does our travel policy say about taxis?",
  outputSummary: "Taxis are covered when no **public transport** runs after 10pm.",
  createdAt: minsAgo(90),
  updatedAt: minsAgo(88),
  ...over,
});

describe("in progress", () => {
  it("lists running, queued and waiting runs, newest first", () => {
    const a = buildActivity({
      teamRuns: [
        team({ id: "t1" }),
        team({ id: "t2", status: "waiting_approval", startedAt: minsAgo(30), createdAt: minsAgo(30) }),
        team({ id: "t3", status: "pending", startedAt: null, createdAt: minsAgo(2) }),
      ],
      agentRuns: [agent({ id: "w2", status: "awaiting_approval", createdAt: minsAgo(5) })],
      spend: null,
      now: NOW,
    });
    expect(a.inProgress.map((i) => i.id)).toEqual(["t3", "w2", "t1", "t2"]);
    expect(a.inProgress.find((i) => i.id === "t1")?.detail).toBe("Running for 12 min");
    expect(a.inProgress.find((i) => i.id === "t2")).toMatchObject({ status: "waiting", detail: "Waiting for an approval · started 30 min ago" });
    expect(a.inProgress.find((i) => i.id === "t3")?.detail).toBe("Queued 2 min ago");
    expect(a.inProgress.find((i) => i.id === "t1")?.href).toBe("/dag-runs/t1");
  });

  it("says when a running team has stopped making progress, rather than calling it running", () => {
    const a = buildActivity({ teamRuns: [team({ heartbeatAt: minsAgo(40) })], agentRuns: [], spend: null, now: NOW });
    expect(a.inProgress[0]).toMatchObject({ status: "stalled", detail: "No sign of progress for 40 min" });
  });

  it("names a run whose team was deleted instead of showing an id", () => {
    const a = buildActivity({ teamRuns: [team({ teamName: null })], agentRuns: [], spend: null, now: NOW });
    expect(a.inProgress[0].title).toBe("A team that no longer exists");
  });
});

describe("finished this week", () => {
  it("summarises each finished run in one line and leaves out anything older than 7 days", () => {
    const a = buildActivity({
      teamRuns: [
        team({ id: "t9", status: "failed", startedAt: minsAgo(70), completedAt: minsAgo(60), error: "Connector timed out after 30s" }),
        team({ id: "old", status: "completed", startedAt: minsAgo(60 * 24 * 8), completedAt: minsAgo(60 * 24 * 8) }),
      ],
      agentRuns: [agent({})],
      spend: null,
      now: NOW,
    });
    expect(a.recent.map((i) => i.id)).toEqual(["t9", "w1"]);
    expect(a.recent[0]).toMatchObject({ status: "failed", detail: "Failed in 10 min: Connector timed out after 30s" });
    // Markdown is stripped: the line is plain text.
    expect(a.recent[1].detail).toBe("Taxis are covered when no public transport runs after 10pm.");
  });

  it("says a denied run was stopped by the approval, not that it failed", () => {
    const a = buildActivity({ teamRuns: [], agentRuns: [agent({ status: "denied" })], spend: null, now: NOW });
    expect(a.recent[0].detail).toBe("Stopped: the approval was denied");
  });
});

describe("spend", () => {
  it("is the recorded model cost, rounded to cents, with its basis stated", () => {
    const a = buildActivity({ teamRuns: [], agentRuns: [], spend: { runs: 58, costUsd: 12.3456 }, now: NOW });
    expect(a.spend).toMatchObject({ days: 7, runs: 58, costUsd: 12.35 });
    expect(a.spend?.basis).toMatch(/No overhead added/);
  });

  it("is left out entirely when the role can't see run costs", () => {
    expect(buildActivity({ teamRuns: [], agentRuns: [], spend: null, now: NOW }).spend).toBeNull();
  });

  it("adds no invented rates", () => {
    const src = readFileSync(join(__dirname, "..", "server", "astra", "home-activity.ts"), "utf8");
    expect(src).not.toMatch(/INFRA_OVERHEAD_RATE|TOOL_CALL_COST|0\.15/);
  });
});

describe("greeting", () => {
  it("follows the viewer's clock", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(14)).toBe("Good afternoon");
    expect(greetingFor(20)).toBe("Good evening");
  });

  it("says what is waiting and moving in one sentence", () => {
    expect(waitingLine(3, 2)).toBe("3 things are waiting on you, and 2 runs are in progress.");
    expect(waitingLine(1, 0)).toBe("1 thing is waiting on you.");
    expect(waitingLine(0, 1)).toBe("Nothing is waiting on you, and 1 run is in progress.");
    expect(waitingLine(null, null)).toBe("Ask for anything your agents can do.");
  });

  it("shows short relative times", () => {
    expect(timeAgo(minsAgo(0), NOW)).toBe("just now");
    expect(timeAgo(minsAgo(5), NOW)).toBe("5m ago");
    expect(timeAgo(minsAgo(180), NOW)).toBe("3h ago");
    expect(timeAgo(null, NOW)).toBe("");
  });

  it("words durations", () => {
    expect(duration(NOW - 30_000, NOW)).toBe("under a minute");
    expect(duration(NOW - 3 * 3_600_000, NOW)).toBe("3 h");
    expect(duration(NOW - 3 * 86_400_000, NOW)).toBe("3 days");
  });
});

describe("Astra Cowork is the default surface", () => {
  it("home is Cowork when it's on and the role may open it", () => {
    expect(homeRoute({ astraEnabled: true, astraAllowed: true })).toBe("/astra");
    expect(homeRoute({ astraEnabled: false, astraAllowed: true })).toBe("/dashboard");
    expect(homeRoute({ astraEnabled: true, astraAllowed: false })).toBe("/dashboard");
  });

  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

  it("sign-in, the landing page and the logo go to home, not the dashboard", () => {
    const app = read("client", "src", "App.tsx");
    expect(app).toContain('<Route path="/home" component={HomeRedirect} />');
    expect(app).toContain('isAuthenticated ? <Redirect to="/home" replace /> : <Landing />');
    expect(read("client", "src", "pages", "landing.tsx")).not.toContain('href="/dashboard"');
    expect(read("client", "src", "components", "app-sidebar.tsx")).not.toContain('<Link href="/dashboard" className="flex items-center gap-2.5');
  });

  it("is called Astra Cowork; Ask Astra stays only as the verb for asking", () => {
    const sidebar = read("client", "src", "components", "app-sidebar.tsx");
    expect(sidebar).toContain("Astra Cowork");
    expect(sidebar).not.toMatch(/>\s*Ask Astra\s*</);
    expect(read("client", "src", "astra", "astra-layout.tsx")).toContain('"Astra Cowork"');
  });
});
