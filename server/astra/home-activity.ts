/**
 * The "In progress", "Recent" and "Spend" parts of the Astra Cowork home.
 *
 * Each item is a one-line summary with a link to where the detail lives: the
 * home says what is happening, and the page (or a question to Astra) shows it.
 *
 * Spend is the model cost recorded on each run's trace, which the runtime
 * works out from the run's token counts and the provider price table. Nothing
 * is added on top: no overhead rate and no per-tool-call charge, because
 * neither is measured.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { cleanName } from "@shared/display-name";
import { db } from "../db";
import { agents, dagExecutionRuns, runTraces, workspaceRuns } from "@shared/schema";

export interface TeamRunRow {
  id: string;
  teamAgentId: string | null;
  teamName: string | null;
  status: string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string | null;
  heartbeatAt: Date | string | null;
  error: string | null;
}

export interface AgentRunRow {
  id: string;
  agentId: string;
  agentName: string | null;
  status: string;
  requestText: string;
  outputSummary: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface SpendRow {
  runs: number;
  costUsd: number;
}

export interface ActivityItem {
  id: string;
  kind: "team_run" | "agent_run";
  title: string;
  /** One line: what state it's in and for how long, or how it ended. */
  detail: string;
  status: "running" | "waiting" | "stalled" | "completed" | "failed";
  at: string | null;
  /**
   * Where the row goes, or null when there is nowhere to send anyone. A team
   * run has /dag-runs/:id; an agent run had "/workspace" hardcoded with no id,
   * which opened an empty Agent Workspace asking you to choose an agent -- and
   * could not have worked with an id either, because that page sets its runId
   * only from a live run_started stream event and cannot open a past run.
   */
  href: string | null;
  /** What to ask Astra instead, when href is null. */
  ask?: string;
  /** How many runs this line stands for, when several were grouped. */
  count?: number;
}

export interface HomeActivity {
  inProgress: ActivityItem[];
  recent: ActivityItem[];
  spend: { days: number; runs: number; costUsd: number; basis: string } | null;
}

const IN_FLIGHT_TEAM = new Set(["pending", "running", "waiting_approval"]);
const IN_FLIGHT_AGENT = new Set(["running", "awaiting_approval"]);
/** A running team run whose heartbeat is older than this has lost its process. */
const STALE_HEARTBEAT_MS = 5 * 60_000;
/**
 * Agent runs don't heartbeat, and one runs within a single request, so a run
 * still marked running after this long lost its process and won't finish.
 */
const STALE_AGENT_RUN_MS = 30 * 60_000;
const RECENT_WINDOW_MS = 7 * 86_400_000;

/**
 * A run still marked running long after it started, with nothing executing it.
 * Not awaiting_approval: that one is genuinely waiting for a person and may be
 * resumed whenever they decide.
 */
export function agentAbandoned(r: { status: string; createdAt: Date | string | null }, now: number): boolean {
  return r.status === "running" && now - ms(r.createdAt) > STALE_AGENT_RUN_MS;
}

const ms = (t: Date | string | null | undefined) => (t ? new Date(t).getTime() : NaN);
const iso = (t: Date | string | null | undefined) => (t ? new Date(t).toISOString() : null);

/** "4 min", "2 h", "3 days": how long, in words. */
export function duration(fromMs: number, toMs: number): string {
  const m = Math.max(0, Math.floor((toMs - fromMs) / 60_000));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

function oneLine(text: string | null | undefined, max = 90): string | null {
  if (!text) return null;
  const line = text.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

function teamItem(r: TeamRunRow, now: number): ActivityItem {
  const title = cleanName(r.teamName || "") || "A team that no longer exists";
  const started = ms(r.startedAt) || ms(r.createdAt);
  const href = `/dag-runs/${r.id}`;
  if (IN_FLIGHT_TEAM.has(r.status)) {
    if (r.status === "waiting_approval") {
      return { id: r.id, kind: "team_run", title, detail: `Waiting for an approval · started ${duration(started, now)} ago`, status: "waiting", at: iso(r.startedAt ?? r.createdAt), href };
    }
    const beat = ms(r.heartbeatAt);
    if (r.status === "running" && Number.isFinite(beat) && now - beat > STALE_HEARTBEAT_MS) {
      return { id: r.id, kind: "team_run", title, detail: `No sign of progress for ${duration(beat, now)}`, status: "stalled", at: iso(r.startedAt ?? r.createdAt), href };
    }
    const detail = r.status === "pending" ? `Queued ${duration(ms(r.createdAt), now)} ago` : `Running for ${duration(started, now)}`;
    return { id: r.id, kind: "team_run", title, detail, status: "running", at: iso(r.startedAt ?? r.createdAt), href };
  }
  const ended = ms(r.completedAt);
  // completed_with_skips is a run that finished: a branch it did not take is the graph working as
  // drawn, not a failure. Every journey that routes (a decision with an unused path) ends this way,
  // and reading it as "Failed" put a red dot on each of its good runs.
  const failed = r.status !== "completed" && r.status !== "completed_with_skips";
  const took = Number.isFinite(ended) && Number.isFinite(started) ? ` in ${duration(started, ended)}` : "";
  const detail = failed ? `Failed${took}${r.error ? `: ${oneLine(r.error, 70)}` : ""}` : `Finished${took}`;
  return { id: r.id, kind: "team_run", title, detail, status: failed ? "failed" : "completed", at: iso(r.completedAt ?? r.createdAt), href };
}

/**
 * What to put to Astra about this run. It names the run so the conversation
 * does not open by asking which one, and says when it ran because two runs of
 * one agent are told apart by time, not by id, in anything a person reads.
 */
export function agentRunPrompt(agentName: string, at: string | null, now = Date.now()): string {
  const when = at ? ` from ${duration(ms(at), now)} ago` : "";
  return `What happened in the ${agentName} run${when}?`;
}

function agentItem(r: AgentRunRow, now: number): ActivityItem {
  const title = cleanName(r.agentName || "") || "An agent that no longer exists";
  // No href: see ActivityItem.href. The row asks Astra, which has the run
  // tooling and answers with its proof, rather than opening a blank page.
  const href = null;
  const asked = oneLine(r.requestText, 60);
  if (IN_FLIGHT_AGENT.has(r.status)) {
    const waiting = r.status === "awaiting_approval";
    const started = ms(r.createdAt);
    const since = duration(started, now);
    const stalled = !waiting && now - started > STALE_AGENT_RUN_MS;
    const state = waiting ? `Waiting for an approval · ${since}` : stalled ? `Started ${since} ago and never finished` : `Running for ${since}`;
    return {
      id: r.id,
      kind: "agent_run",
      title,
      detail: [state, asked ? `“${asked}”` : null].filter(Boolean).join(" · "),
      status: waiting ? "waiting" : stalled ? "stalled" : "running",
      at: iso(r.createdAt),
      href,
      ask: agentRunPrompt(title, iso(r.createdAt), now),
    };
  }
  const failed = r.status !== "completed";
  // The question says what the run was for; the answer's first line is often the model clearing its throat.
  const detail = failed ? (r.status === "denied" ? "Stopped: the approval was denied" : "Failed") : asked ? `Answered “${asked}”` : "Finished";
  const at = iso(r.updatedAt ?? r.createdAt);
  return { id: r.id, kind: "agent_run", title, detail, status: failed ? "failed" : "completed", at, href, ask: agentRunPrompt(title, at, now) };
}

/**
 * Several runs of one team or agent in the same state read as one line
 * ("5 runs waiting for an approval"), linked to the newest, so a pile-up
 * doesn't push everything else off the list.
 */
export function groupRepeats(items: ActivityItem[], now: number = Date.now()): ActivityItem[] {
  const groups = new Map<string, ActivityItem[]>();
  for (const i of items) {
    // Only runs that are stuck pile up; each live run keeps its own line and timing.
    const key = i.status === "waiting" || i.status === "stalled" ? `${i.kind}|${i.title}|${i.status}` : `one|${i.kind}|${i.id}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const STATE: Record<ActivityItem["status"], string> = {
    running: "running",
    waiting: "waiting for an approval",
    stalled: "stalled",
    completed: "finished",
    failed: "failed",
  };
  return Array.from(groups.values()).map((g) => {
    if (g.length === 1) return g[0];
    const oldest = g[g.length - 1];
    return { ...g[0], detail: `${g.length} runs ${STATE[g[0].status]} · oldest ${oldest.at ? `started ${duration(ms(oldest.at), now)} ago` : "undated"}`, count: g.length };
  });
}

export function buildActivity(input: { teamRuns: TeamRunRow[]; agentRuns: AgentRunRow[]; spend: SpendRow | null; now?: number }): HomeActivity {
  const now = input.now ?? Date.now();
  const items = [
    ...input.teamRuns.map((r) => ({ item: teamItem(r, now), live: IN_FLIGHT_TEAM.has(r.status) })),
    ...input.agentRuns.map((r) => ({ item: agentItem(r, now), live: IN_FLIGHT_AGENT.has(r.status) && !agentAbandoned(r, now) })),
  ];
  const byNewest = (a: ActivityItem, b: ActivityItem) => (ms(b.at) || 0) - (ms(a.at) || 0);
  // Still shown, never hidden -- but not under "In progress". An agent run whose
  // process is gone is not progressing, and this file already says so
  // (STALE_AGENT_RUN_MS: "lost its process and won't finish"); it used to say
  // that inside the in-progress list, where one sat for four days claiming to be
  // running. It moves to the ended list, red and saying it never finished, which
  // is what happened. The row in the database still reads "running": nothing can
  // end an agent run today -- the workspace routes are create, stream, resume
  // and two reads, and cancel_run is for team runs -- so this corrects what the
  // home reports, not the record. A reaper that closes the row is the next step.
  const inProgress = groupRepeats(items.filter((i) => i.live).map((i) => i.item).sort(byNewest), now);
  const ended = items
    .filter((i) => !i.live && now - (ms(i.item.at) || 0) <= RECENT_WINDOW_MS)
    .map((i) => i.item)
    .sort(byNewest);
  // Abandoned runs go first, because sorting by recency buries exactly the rows
  // worth seeing: an abandoned run is old by definition, so six of today's runs
  // pushed the four-day-old one off a six-row list and it vanished from the home
  // altogether -- "not hidden" was true of the list it left, not of the page.
  // Grouped, so one agent piling up is one line rather than six. If abandoned
  // runs ever fill the list on their own, that is a state worth looking at.
  const abandonedRow = (i: ActivityItem) => i.kind === "agent_run" && i.status === "stalled";
  const recent = [...groupRepeats(ended.filter(abandonedRow), now), ...ended.filter((i) => !abandonedRow(i))].slice(0, 6);
  return {
    inProgress: inProgress.slice(0, 6),
    recent,
    spend: input.spend
      ? {
          days: 7,
          runs: input.spend.runs,
          costUsd: Math.round(input.spend.costUsd * 100) / 100,
          basis: "Model cost recorded on each run, from its token counts at the provider's list price. No overhead added.",
        }
      : null,
  };
}

/** The rows, read narrowly: run tables carry large JSON columns that the home never needs. */
export async function loadActivity(orgId: string, opts: { includeSpend: boolean }): Promise<HomeActivity> {
  const since = new Date(Date.now() - RECENT_WINDOW_MS);
  const orgAgentIds = (await db.select({ id: agents.id }).from(agents).where(eq(agents.organizationId, orgId))).map((a) => a.id);

  const [teamRuns, agentRuns, spend] = await Promise.all([
    orgAgentIds.length === 0
      ? Promise.resolve([] as TeamRunRow[])
      : db
          .select({
            id: dagExecutionRuns.id,
            teamAgentId: dagExecutionRuns.teamAgentId,
            teamName: agents.name,
            status: dagExecutionRuns.status,
            startedAt: dagExecutionRuns.startedAt,
            completedAt: dagExecutionRuns.completedAt,
            createdAt: dagExecutionRuns.createdAt,
            heartbeatAt: dagExecutionRuns.heartbeatAt,
            error: dagExecutionRuns.error,
          })
          .from(dagExecutionRuns)
          .leftJoin(agents, eq(agents.id, dagExecutionRuns.teamAgentId))
          .where(inArray(dagExecutionRuns.teamAgentId, orgAgentIds))
          .orderBy(desc(dagExecutionRuns.createdAt))
          .limit(40),
    db
      .select({
        id: workspaceRuns.id,
        agentId: workspaceRuns.agentId,
        agentName: agents.name,
        status: workspaceRuns.status,
        requestText: workspaceRuns.requestText,
        outputSummary: workspaceRuns.outputSummary,
        createdAt: workspaceRuns.createdAt,
        updatedAt: workspaceRuns.updatedAt,
      })
      .from(workspaceRuns)
      .leftJoin(agents, eq(agents.id, workspaceRuns.agentId))
      .where(eq(workspaceRuns.organizationId, orgId))
      .orderBy(desc(workspaceRuns.createdAt))
      .limit(40),
    opts.includeSpend
      ? db
          .select({ runs: sql<number>`count(*)::int`, costUsd: sql<number>`coalesce(sum(${runTraces.costUsd}), 0)::float` })
          .from(runTraces)
          .where(and(eq(runTraces.organizationId, orgId), gte(runTraces.startedAt, since)))
          .then((r) => r[0] ?? { runs: 0, costUsd: 0 })
      : Promise.resolve(null),
  ]);
  return buildActivity({ teamRuns, agentRuns, spend });
}
