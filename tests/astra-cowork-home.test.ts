/**
 * Astra Cowork is home. Its first screen says what is waiting, what is
 * running, what finished and what it cost, each as one line with a link to
 * the page that has the detail. Spend is only what runs recorded: no
 * overhead rate or per-tool charge is added.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildActivity, duration, agentRunPrompt, type AgentRunRow, type TeamRunRow } from "../server/astra/home-activity";
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

  it("reads several runs of one team in the same state as one line", () => {
    const a = buildActivity({
      teamRuns: [1, 2, 3].map((n) => team({ id: `w${n}`, status: "waiting_approval", startedAt: minsAgo(60 * n), createdAt: minsAgo(60 * n) })),
      agentRuns: [],
      spend: null,
      now: NOW,
    });
    expect(a.inProgress).toHaveLength(1);
    expect(a.inProgress[0]).toMatchObject({ id: "w1", count: 3, detail: "3 runs waiting for an approval · oldest started 3 h ago" });
  });

  it("keeps an agent run that lost its process OUT of in progress, and still shows it", () => {
    // It used to sit in "In progress". One did, for four days, saying "Started
    // 4 days ago and never finished" under a heading claiming it was running --
    // while this file's own threshold says such a run "lost its process and
    // won't finish". It is not hidden: it moves to the ended list, red.
    const a = buildActivity({ teamRuns: [], agentRuns: [agent({ status: "running", createdAt: minsAgo(60 * 42) })], spend: null, now: NOW });
    expect(a.inProgress).toEqual([]);
    expect(a.recent[0]).toMatchObject({ id: "w1", status: "stalled" });
    expect(a.recent[0].detail).toMatch(/^Started 42 h ago and never finished · “What does our travel policy/);
  });

  it("keeps an abandoned run visible when a busy day would sort it off the list", () => {
    // Measured live after the first fix: the abandoned run left "In progress"
    // and then did not appear anywhere, because recent sorts newest-first and
    // slices to six, and six of that day's team runs were newer. It was 4.57
    // days old, well inside the 7-day window -- the slice dropped it, not the
    // window. Abandoned runs now lead the list, so the slice cannot.
    const a = buildActivity({
      teamRuns: [1, 2, 3, 4, 5, 6].map((n) => team({ id: `t${n}`, status: "completed", completedAt: minsAgo(n), createdAt: minsAgo(n) })),
      agentRuns: [agent({ id: "zombie", status: "running", createdAt: minsAgo(60 * 42) })],
      spend: null,
      now: NOW,
    });
    expect(a.inProgress).toEqual([]);
    expect(a.recent).toHaveLength(6);
    expect(a.recent[0]).toMatchObject({ id: "zombie", status: "stalled" });
  });

  it("reads several abandoned runs of one agent as one line, not six", () => {
    const a = buildActivity({
      teamRuns: [],
      agentRuns: [1, 2, 3].map((n) => agent({ id: `z${n}`, status: "running", createdAt: minsAgo(60 * (40 + n)) })),
      spend: null,
      now: NOW,
    });
    expect(a.recent).toHaveLength(1);
    expect(a.recent[0]).toMatchObject({ count: 3 });
    expect(a.recent[0].detail).toMatch(/^3 runs stalled · oldest started 43 h ago$/);
  });

  it("leaves a run waiting on a person in progress, however long it waits", () => {
    // awaiting_approval is not abandoned: someone can still decide it, and it
    // resumes. Only "running" with nothing executing it is.
    const a = buildActivity({ teamRuns: [], agentRuns: [agent({ status: "awaiting_approval", createdAt: minsAgo(60 * 42) })], spend: null, now: NOW });
    expect(a.inProgress.map((i) => i.id)).toEqual(["w1"]);
    expect(a.inProgress[0].status).toBe("waiting");
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
    // The question, not the answer's first line, which is often "Perfect! I have the information…".
    expect(a.recent[1].detail).toBe("Answered “What does our travel policy say about taxis?”");
  });

  it("reads a run that completed with skipped steps as finished, not failed", () => {
    const a = buildActivity({
      teamRuns: [
        team({ id: "skips", status: "completed_with_skips", startedAt: minsAgo(30), completedAt: minsAgo(26) }),
        team({ id: "boom", status: "failed", startedAt: minsAgo(50), completedAt: minsAgo(45), error: "Connector timed out" }),
      ],
      agentRuns: [],
      spend: null,
      now: NOW,
    });
    expect(a.recent.find((i) => i.id === "skips")).toMatchObject({ status: "completed", detail: "Finished in 4 min" });
    // A real failure still reads as one.
    expect(a.recent.find((i) => i.id === "boom")).toMatchObject({ status: "failed" });
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
    // A failed chunk load on the first screen shows a reload, not a blank page.
    expect(app).toMatch(/<Route path="\/astra" nest>[\s\S]{0,200}<ErrorBoundary resetKey=\{location\}>\s*<AstraLayout \/>/);
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

/**
 * Where a row on the home page goes when you click it.
 *
 * Reported by the user: every Agent row opened the Agent Workspace with nothing
 * loaded. Measured live 2026-10-07 — of 7 activity rows, the 3 Team rows went to
 * /dag-runs/:id and loaded the run (10,351 chars), and all 4 Agent rows went to
 * a hardcoded "/workspace" with no run id, landing on 252 characters of empty
 * form reading "Choose an agent…". It could not have worked with an id either:
 * that page sets its runId only from a live run_started stream event.
 *
 * So an agent run has no page, and the row asks Astra instead — which has the
 * run tooling and answers in place, the way the briefing rows already do.
 */
describe("a row with no page asks instead of navigating", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

  it("gives an agent run no href, and a question to ask", () => {
    const a = buildActivity({ teamRuns: [], agentRuns: [agent({ status: "completed" })], spend: null, now: NOW });
    const row = a.recent[0];
    expect(row.href).toBeNull();
    expect(row.ask).toMatch(/^What happened in the /);
  });

  it("never points an agent run at the empty workspace again", () => {
    const a = buildActivity({
      teamRuns: [],
      agentRuns: [agent({ id: "w1", status: "running" }), agent({ id: "w2", status: "awaiting_approval" }), agent({ id: "w3", status: "failed" })],
      spend: null,
      now: NOW,
    });
    for (const row of [...a.inProgress, ...a.recent]) {
      expect(row.href).not.toBe("/workspace");
    }
  });

  it("keeps the team run's page, which works", () => {
    const a = buildActivity({ teamRuns: [team({ id: "t1" })], agentRuns: [], spend: null, now: NOW });
    expect(a.inProgress[0].href).toBe("/dag-runs/t1");
    expect(a.inProgress[0].ask).toBeUndefined();
  });

  it("names the run and when it ran, so the conversation does not open by asking which one", () => {
    // Two runs of one agent are told apart by time, not by id, in anything a
    // person reads.
    expect(agentRunPrompt("Northgate Policy Assistant", minsAgo(60 * 4), NOW))
      .toBe("What happened in the Northgate Policy Assistant run from 4 h ago?");
    expect(agentRunPrompt("An agent", null, NOW)).toBe("What happened in the An agent run?");
  });

  it("the client renders a button, not a link, when there is nowhere to go", () => {
    const home = read("client", "src", "astra", "home.tsx");
    expect(home).toContain("{i.href ? (");
    expect(home).toContain("onClick={() => onSend(i.ask");
    // Both branches share one class so they cannot drift apart visually.
    expect(home).toContain("const ROW_CLASS");
  });
});
