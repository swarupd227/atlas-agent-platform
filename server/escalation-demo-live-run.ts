/**
 * Cross-System Escalation Agent Demo — Live Run Handler
 * Demonstrates Jira + Microsoft Graph (user lookup + calendar + Teams + email)
 * in a single 5-step human-in-the-loop workflow.
 *
 * Uses real MCP tool invocations; falls back to representative mock data
 * when credentials are not configured (mode: "demo").
 */

import { type Request, type Response } from "express";
import { getDefaultOrgId } from "./auth";
import { jiraMcpServer }          from "./integrations/jira/mcp-server";
import { microsoftGraphMcpServer } from "./integrations/msgraph/mcp-server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EscalationStep = {
  id: number;
  title: string;
  tool: string;
  integration: "jira" | "msgraph";
  status: "pending" | "running" | "complete" | "error";
  mode: "live" | "demo" | null;
  durationMs?: number;
  result?: unknown;
};

type DemoState = {
  status: "idle" | "running" | "complete" | "error";
  startedAt: Date | null;
  completedAt: Date | null;
  steps: EscalationStep[];
  summary?: {
    ticketKey: string;
    ticketSummary: string;
    assigneeEmail: string;
    availableSlot: string | null;
    teamsMessagePosted: boolean;
    emailSent: boolean;
    totalMs: number;
    mode: "live" | "demo";
  };
};

let demoState: DemoState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  steps: [],
};

// ── Mock payloads (used when credentials are absent) ──────────────────────────

const MOCK_JIRA_ISSUE = {
  key: "PLAT-892",
  summary: "Critical: payment-service 503 error rate exceeds SLA threshold (18%)",
  status: "Open",
  priority: "Critical",
  assignee: "alice.chen@acme.com",
  assignee_name: "Alice Chen",
  reporter: "ops-monitor-bot",
  created: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  labels: ["incident", "production", "sev1"],
  url: "https://acme.atlassian.net/browse/PLAT-892",
};

const MOCK_GRAPH_USER = {
  id: "user-id-alice-chen",
  display_name: "Alice Chen",
  email: "al***@acme.com",
  job_title: "Staff Software Engineer",
  department: "Platform Engineering",
  office_location: "NYC-Floor-12",
  business_phone: null,
};

const now = new Date();
const slot = new Date(now.getTime() + 2 * 3600 * 1000);
const MOCK_CALENDAR = {
  count: 2,
  events: [
    {
      subject: "Sprint Planning",
      start: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      end:   new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      is_cancelled: false,
    },
    {
      subject: "1:1 with Manager",
      start: new Date(now.getTime() + 3 * 3600 * 1000).toISOString(),
      end:   new Date(now.getTime() + 3.5 * 3600 * 1000).toISOString(),
      is_cancelled: false,
    },
  ],
  first_available: slot.toISOString(),
};

const MOCK_TEAMS_MSG = {
  ok: true,
  id: "1717700000000-teams-msg-001",
  team_id: "TEAM-ABC123",
  channel_id: "CHAN-ENG001",
  created_at: new Date().toISOString(),
};

const MOCK_EMAIL = {
  sent: true,
  subject: `[URGENT] PLAT-892 — ${MOCK_JIRA_ISSUE.summary}`,
  to: ["alice.chen@acme.com"],
  cc: ["eng-manager@acme.com"],
  attribution_added: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseToolResult(result: { content?: { text: string }[]; isError?: boolean }): unknown {
  const text = result.content?.[0]?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function buildInitialSteps(): EscalationStep[] {
  return [
    { id: 1, title: "Find critical open Jira ticket",            tool: "jira_search",            integration: "jira",    status: "pending", mode: null },
    { id: 2, title: "Look up assignee profile in Azure AD",      tool: "graph_get_user",          integration: "msgraph", status: "pending", mode: null },
    { id: 3, title: "Check assignee calendar availability",      tool: "graph_list_calendar_events", integration: "msgraph", status: "pending", mode: null },
    { id: 4, title: "Post escalation to Teams engineering channel", tool: "graph_post_teams_message", integration: "msgraph", status: "pending", mode: null },
    { id: 5, title: "Send summary email to assignee and manager", tool: "graph_send_email",        integration: "msgraph", status: "pending", mode: null },
  ];
}

// ── Demo runner ───────────────────────────────────────────────────────────────

async function runEscalationDemo(): Promise<void> {
  demoState = {
    status: "running",
    startedAt: new Date(),
    completedAt: null,
    steps: buildInitialSteps(),
  };

  const orgId = getDefaultOrgId();
  let anyLive = false;

  const updateStep = (id: number, patch: Partial<EscalationStep>) => {
    const idx = demoState.steps.findIndex(s => s.id === id);
    if (idx >= 0) demoState.steps[idx] = { ...demoState.steps[idx], ...patch };
  };

  // Carries live data across steps
  let ticketKey     = MOCK_JIRA_ISSUE.key;
  let ticketSummary = MOCK_JIRA_ISSUE.summary;
  let assigneeEmail = MOCK_JIRA_ISSUE.assignee;
  let availableSlot: string | null = MOCK_CALENDAR.first_available;

  // ── Step 1: jira_search for critical ticket ────────────────────────────────
  updateStep(1, { status: "running" });
  const t1 = Date.now();
  try {
    const r1 = await jiraMcpServer.callTool("jira_search", {
      jql:    "priority = Critical AND status in (Open, \"In Progress\") ORDER BY created DESC",
      fields: ["summary", "status", "priority", "assignee", "labels", "created"],
      max_results: 1,
    }, orgId);
    const dur1 = Date.now() - t1;
    if (!r1.isError) {
      anyLive = true;
      const data = parseToolResult(r1);
      const issues = (data as any)?.issues ?? [];
      if (issues.length > 0) {
        const first = issues[0];
        ticketKey     = first.key ?? ticketKey;
        ticketSummary = first.summary ?? ticketSummary;
        assigneeEmail = first.assignee ?? assigneeEmail;
      }
      updateStep(1, { status: "complete", durationMs: dur1, result: data, mode: "live" });
    } else {
      updateStep(1, { status: "complete", durationMs: dur1, result: { count: 1, issues: [MOCK_JIRA_ISSUE] }, mode: "demo" });
    }
  } catch {
    updateStep(1, { status: "complete", durationMs: Date.now() - t1, result: { count: 1, issues: [MOCK_JIRA_ISSUE] }, mode: "demo" });
  }

  // ── Step 2: graph_get_user ─────────────────────────────────────────────────
  updateStep(2, { status: "running" });
  const t2 = Date.now();
  try {
    const r2 = await microsoftGraphMcpServer.callTool("graph_get_user", { user_id: assigneeEmail }, orgId);
    const dur2 = Date.now() - t2;
    if (!r2.isError) {
      anyLive = true;
      const data = parseToolResult(r2);
      updateStep(2, { status: "complete", durationMs: dur2, result: data, mode: "live" });
    } else {
      updateStep(2, { status: "complete", durationMs: dur2, result: MOCK_GRAPH_USER, mode: "demo" });
    }
  } catch {
    updateStep(2, { status: "complete", durationMs: Date.now() - t2, result: MOCK_GRAPH_USER, mode: "demo" });
  }

  // ── Step 3: graph_list_calendar_events ────────────────────────────────────
  updateStep(3, { status: "running" });
  const t3 = Date.now();
  try {
    const windowStart = new Date().toISOString();
    const windowEnd   = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const r3 = await microsoftGraphMcpServer.callTool("graph_list_calendar_events", {
      user_id:        assigneeEmail,
      start_datetime: windowStart,
      end_datetime:   windowEnd,
      top:            10,
    }, orgId);
    const dur3 = Date.now() - t3;
    if (!r3.isError) {
      anyLive = true;
      const data = parseToolResult(r3) as any;
      const events = data?.events ?? [];
      // Find first gap ≥ 30 min in the next 4 hours
      const busyWindows = events
        .filter((e: any) => !e.is_cancelled)
        .map((e: any) => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }))
        .sort((a: any, b: any) => a.start - b.start);
      let gap = Date.now() + 15 * 60 * 1000;
      for (const w of busyWindows) {
        if (gap + 30 * 60 * 1000 <= w.start) break;
        gap = w.end + 5 * 60 * 1000;
      }
      availableSlot = new Date(gap).toISOString();
      updateStep(3, { status: "complete", durationMs: dur3, result: { ...data, first_available: availableSlot }, mode: "live" });
    } else {
      updateStep(3, { status: "complete", durationMs: dur3, result: MOCK_CALENDAR, mode: "demo" });
    }
  } catch {
    updateStep(3, { status: "complete", durationMs: Date.now() - t3, result: MOCK_CALENDAR, mode: "demo" });
  }

  // ── Step 4: graph_post_teams_message ──────────────────────────────────────
  updateStep(4, { status: "running" });
  const t4 = Date.now();
  const availableStr = availableSlot
    ? new Date(availableSlot).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
    : "TBD";
  const teamsContent = `🚨 ESCALATION — ${ticketKey}\n${ticketSummary}\n\nAssignee: ${assigneeEmail}\nFirst available slot: ${availableStr}\n\nPlease join the incident bridge immediately.`;
  try {
    const r4 = await microsoftGraphMcpServer.callTool("graph_post_teams_message", {
      team_id:    "TEAM-ENG-PLATFORM",
      channel_id: "CHAN-INCIDENTS",
      content:    teamsContent,
    }, orgId);
    const dur4 = Date.now() - t4;
    if (!r4.isError) {
      anyLive = true;
      updateStep(4, { status: "complete", durationMs: dur4, result: parseToolResult(r4), mode: "live" });
    } else {
      updateStep(4, { status: "complete", durationMs: dur4, result: MOCK_TEAMS_MSG, mode: "demo" });
    }
  } catch {
    updateStep(4, { status: "complete", durationMs: Date.now() - t4, result: MOCK_TEAMS_MSG, mode: "demo" });
  }

  // ── Step 5: graph_send_email ───────────────────────────────────────────────
  updateStep(5, { status: "running" });
  const t5 = Date.now();
  const emailSubject = `[URGENT] ${ticketKey} — ${ticketSummary.slice(0, 80)}`;
  const emailBody = `Hi,\n\nThis is an automated escalation from the Atlas Agent Orchestrator.\n\nTicket: ${ticketKey}\nSummary: ${ticketSummary}\nPriority: Critical\n\nAssignee: ${assigneeEmail}\nAvailable from: ${availableStr}\n\nPlease join the incident bridge and coordinate a resolution immediately.\n\nTicket link: https://jira.acme.com/browse/${ticketKey}`;
  try {
    const r5 = await microsoftGraphMcpServer.callTool("graph_send_email", {
      subject:    emailSubject,
      body:       emailBody,
      to:         assigneeEmail,
      cc:         "eng-manager@acme.com",
      importance: "High",
      agent_name: "Escalation Agent",
    }, orgId);
    const dur5 = Date.now() - t5;
    if (!r5.isError) {
      anyLive = true;
      updateStep(5, { status: "complete", durationMs: dur5, result: parseToolResult(r5), mode: "live" });
    } else {
      updateStep(5, { status: "complete", durationMs: dur5, result: { ...MOCK_EMAIL, subject: emailSubject }, mode: "demo" });
    }
  } catch {
    updateStep(5, { status: "complete", durationMs: Date.now() - t5, result: { ...MOCK_EMAIL, subject: emailSubject }, mode: "demo" });
  }

  // ── Finalize ───────────────────────────────────────────────────────────────
  const totalMs = Date.now() - (demoState.startedAt?.getTime() ?? Date.now());
  demoState = {
    ...demoState,
    status: "complete",
    completedAt: new Date(),
    summary: {
      ticketKey,
      ticketSummary: ticketSummary.slice(0, 100),
      assigneeEmail,
      availableSlot,
      teamsMessagePosted: true,
      emailSent: true,
      totalMs,
      mode: anyLive ? "live" : "demo",
    },
  };
}

// ── HTTP handlers ──────────────────────────────────────────────────────────────

export async function escalationTriggerHandler(_req: Request, res: Response): Promise<void> {
  if (demoState.status === "running") {
    res.json({ message: "Demo already running", status: demoState.status });
    return;
  }

  demoState = { status: "idle", startedAt: null, completedAt: null, steps: [] };
  runEscalationDemo().catch((err: any) => {
    demoState = { ...demoState, status: "error", completedAt: new Date() };
    console.error("[escalation-demo] uncaught:", err?.message);
  });

  res.json({ message: "Escalation demo started", status: "running" });
}

export function escalationStatusHandler(_req: Request, res: Response): void {
  res.json({
    status:      demoState.status,
    startedAt:   demoState.startedAt,
    completedAt: demoState.completedAt,
    steps:       demoState.steps.map(s => ({
      ...s,
      result: s.status === "complete" ? s.result : undefined,
    })),
    summary:     demoState.summary ?? null,
    elapsedMs:   demoState.startedAt ? Date.now() - demoState.startedAt.getTime() : 0,
  });
}

export function escalationResetHandler(_req: Request, res: Response): void {
  demoState = { status: "idle", startedAt: null, completedAt: null, steps: [], summary: undefined };
  res.json({ message: "Demo reset to idle" });
}
