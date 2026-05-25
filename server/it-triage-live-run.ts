/**
 * IT Incident Triage Demo — Live Run Handler
 * Demonstrates ServiceNow + CMDB + GitHub + Jira in a single 5-step workflow.
 *
 * Each step calls the real integration MCP server (snow/github/jira).
 * When credentials are not configured for an org, the step falls back to
 * realistic mock data so the demo remains runnable without live accounts.
 */

import { type Request, type Response } from "express";
import { getDefaultOrgId } from "./auth";
import { serviceNowMcpServer } from "./integrations/servicenow/mcp-server";
import { githubMcpServer }     from "./integrations/github/mcp-server";
import { jiraMcpServer }       from "./integrations/jira/mcp-server";
import type { McpToolResult }   from "./real-mcp-base";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriageStep = {
  id: number;
  title: string;
  tool: string;
  integration: "servicenow" | "github" | "jira";
  status: "pending" | "running" | "complete" | "error";
  mode: "live" | "demo" | null;
  durationMs?: number;
  result?: unknown;
  error?: string;
};

type DemoState = {
  status: "idle" | "running" | "complete" | "error";
  startedAt: Date | null;
  completedAt: Date | null;
  steps: TriageStep[];
  summary?: {
    incidentNumber: string;
    ciName: string;
    commitsFound: number;
    jiraTicketKey: string;
    workNoteAdded: boolean;
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

// ── Demo scenario constants ────────────────────────────────────────────────────

const DEMO_INCIDENT_NUMBER   = "INC0023451";
const DEMO_CI_NAME           = "payment-service-prod";
const DEMO_GITHUB_REPO       = "acme-corp/payment-service";
const DEMO_JIRA_PROJECT_KEY  = "PAY";
const DEMO_JIRA_ISSUE_TYPE   = "Bug";

// ── Mock fallback payloads (used when credentials are not configured) ──────────

const MOCK_INCIDENT = {
  number: DEMO_INCIDENT_NUMBER,
  sys_id: "abc123def456abc123def456abc123de",
  short_description: "Payment service returning 503 errors — checkout flow impacted",
  description: "Starting at 14:32 UTC, payment-service-prod is returning HTTP 503 for ~18% of checkout requests. Error rate spiked after the 14:25 deployment of payment-service v2.4.1. Revenue impact estimated at $12K/hr.",
  state: "2", state_display: "In Progress",
  priority: "1", priority_display: "Critical",
  category: "software",
  assignment_group: "Platform Engineering",
  opened_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  caller_id: "ops-monitor-bot",
  business_service: "E-Commerce Checkout",
};

const MOCK_CI = {
  sys_id: "ci789payment456",
  name: DEMO_CI_NAME,
  sys_class_name: "cmdb_ci_app_server",
  operational_status: "1",
  operational_status_display: "Operational",
  short_description: "Payment service — production cluster (3 replicas, k8s namespace: payments)",
  ip_address: "10.4.22.100",
  fqdn: "payment-service-prod.internal.acme.com",
  location: "us-east-1",
  department: "Engineering",
  used_for: "Production",
};

const MOCK_COMMITS = {
  count: 3,
  has_more: false,
  commits: [
    { sha: "3f8a1b2", message: "feat: add retry logic for payment processor timeout", author_name: "Alice Chen", author_login: "alicechen", date: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
    { sha: "d4c9e1f", message: "fix: remove duplicate timeout config that conflicts with retry middleware", author_name: "Bob Martinez", author_login: "bobmartinez", date: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    { sha: "7a2d3c8", message: "chore: bump stripe-sdk from 12.1.0 to 12.4.2 (includes breaking timeout API change)", author_name: "Dependabot", author_login: "dependabot[bot]", date: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
  ],
};

const MOCK_JIRA_TICKET = { created: true, key: "PAY-4521", id: "10089", self: "https://acme.atlassian.net/rest/api/3/issue/10089" };

const MOCK_WORK_NOTE = { added: true, table: "incident", sys_id: MOCK_INCIDENT.sys_id, customer_visible: false };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse JSON from McpToolResult content[0].text, return null on failure */
function parseToolResult(result: McpToolResult): unknown | null {
  const text = result.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Build initial step list */
function buildInitialSteps(): TriageStep[] {
  return [
    { id: 1, title: "Read incident from ServiceNow",                         tool: "snow_get_incident",  integration: "servicenow", status: "pending", mode: null },
    { id: 2, title: "Look up affected CI in CMDB",                          tool: "snow_get_cmdb_ci",   integration: "servicenow", status: "pending", mode: null },
    { id: 3, title: "Search GitHub for recent commits on affected service",  tool: "gh_list_commits",    integration: "github",     status: "pending", mode: null },
    { id: 4, title: "Create Jira engineering ticket with incident context",  tool: "jira_create_issue",  integration: "jira",       status: "pending", mode: null },
    { id: 5, title: "Add work note back to ServiceNow incident",            tool: "snow_add_work_note", integration: "servicenow", status: "pending", mode: null },
  ];
}

// ── Main demo runner ───────────────────────────────────────────────────────────

async function runTriageDemo(): Promise<void> {
  demoState = {
    status: "running",
    startedAt: new Date(),
    completedAt: null,
    steps: buildInitialSteps(),
    summary: undefined,
  };

  const orgId = getDefaultOrgId();
  let anyLive = false;

  const updateStep = (id: number, patch: Partial<TriageStep>) => {
    const idx = demoState.steps.findIndex(s => s.id === id);
    if (idx >= 0) demoState.steps[idx] = { ...demoState.steps[idx], ...patch };
  };

  // Carries live data across steps so later steps can reference earlier results
  let incidentSysId  = MOCK_INCIDENT.sys_id;
  let incidentNumber = DEMO_INCIDENT_NUMBER;
  let ciName         = DEMO_CI_NAME;
  let commitLines    = MOCK_COMMITS.commits.map(c => `- ${c.sha} ${c.message} (${c.author_login})`).join("\n");
  let commitsFound   = MOCK_COMMITS.count;
  let jiraKey        = MOCK_JIRA_TICKET.key;

  // ── Step 1: snow_get_incident ─────────────────────────────────────────────

  updateStep(1, { status: "running" });
  const t1Start = Date.now();
  try {
    const r1 = await serviceNowMcpServer.callTool("snow_get_incident", { number: DEMO_INCIDENT_NUMBER }, orgId);
    const t1 = Date.now() - t1Start;
    if (!r1.isError) {
      anyLive = true;
      const data = parseToolResult(r1);
      const record = (data as any)?.result ?? data;
      incidentSysId  = (record as any)?.sys_id ?? incidentSysId;
      incidentNumber = (record as any)?.number ?? incidentNumber;
      updateStep(1, { status: "complete", durationMs: t1, result: data, mode: "live" });
    } else {
      updateStep(1, { status: "complete", durationMs: t1, result: MOCK_INCIDENT, mode: "demo" });
    }
  } catch (err: any) {
    updateStep(1, { status: "complete", durationMs: Date.now() - t1Start, result: MOCK_INCIDENT, mode: "demo" });
  }

  // ── Step 2: snow_get_cmdb_ci ──────────────────────────────────────────────

  updateStep(2, { status: "running" });
  const t2Start = Date.now();
  try {
    const r2 = await serviceNowMcpServer.callTool("snow_get_cmdb_ci", { name: DEMO_CI_NAME }, orgId);
    const t2 = Date.now() - t2Start;
    if (!r2.isError) {
      anyLive = true;
      const data = parseToolResult(r2);
      const first = (data as any)?.results?.[0] ?? (data as any)?.result ?? data;
      ciName = (first as any)?.name ?? ciName;
      updateStep(2, { status: "complete", durationMs: t2, result: data, mode: "live" });
    } else {
      updateStep(2, { status: "complete", durationMs: t2, result: MOCK_CI, mode: "demo" });
    }
  } catch {
    updateStep(2, { status: "complete", durationMs: Date.now() - t2Start, result: MOCK_CI, mode: "demo" });
  }

  // ── Step 3: gh_list_commits ───────────────────────────────────────────────

  updateStep(3, { status: "running" });
  const t3Start = Date.now();
  try {
    const r3 = await githubMcpServer.callTool("gh_list_commits", {
      repo:     DEMO_GITHUB_REPO,
      per_page: 5,
    }, orgId);
    const t3 = Date.now() - t3Start;
    if (!r3.isError) {
      anyLive = true;
      const data = parseToolResult(r3);
      const commits = (data as any)?.commits ?? [];
      commitsFound = (data as any)?.count ?? commits.length;
      commitLines  = commits.map((c: any) => `- ${c.sha ?? c.short_sha ?? ""} ${c.message ?? ""} (${c.author_login ?? c.author?.login ?? ""})`).join("\n");
      updateStep(3, { status: "complete", durationMs: t3, result: data, mode: "live" });
    } else {
      updateStep(3, { status: "complete", durationMs: t3, result: MOCK_COMMITS, mode: "demo" });
    }
  } catch {
    updateStep(3, { status: "complete", durationMs: Date.now() - t3Start, result: MOCK_COMMITS, mode: "demo" });
  }

  // ── Step 4: jira_create_issue ─────────────────────────────────────────────

  updateStep(4, { status: "running" });
  const t4Start = Date.now();
  const jiraSummary     = `[${incidentNumber}] ${ciName} critical — checkout 503 errors`;
  const jiraDescription = `Incident: ${incidentNumber}\nAffected CI: ${ciName}\nPriority: Critical\n\nRecent commits on ${DEMO_GITHUB_REPO}:\n${commitLines}\n\nRoot cause hypothesis: stripe-sdk v12.4.2 breaking timeout API change may conflict with retry middleware.`;
  try {
    const r4 = await jiraMcpServer.callTool("jira_create_issue", {
      project_key: DEMO_JIRA_PROJECT_KEY,
      summary:     jiraSummary,
      issue_type:  DEMO_JIRA_ISSUE_TYPE,
      description: jiraDescription,
      priority:    "Critical",
      labels:      ["incident", "production", "sev1"],
    }, orgId);
    const t4 = Date.now() - t4Start;
    if (!r4.isError) {
      anyLive = true;
      const data = parseToolResult(r4);
      jiraKey = (data as any)?.key ?? jiraKey;
      updateStep(4, { status: "complete", durationMs: t4, result: data, mode: "live" });
    } else {
      updateStep(4, { status: "complete", durationMs: t4, result: { ...MOCK_JIRA_TICKET, summary: jiraSummary }, mode: "demo" });
    }
  } catch {
    updateStep(4, { status: "complete", durationMs: Date.now() - t4Start, result: { ...MOCK_JIRA_TICKET, summary: jiraSummary }, mode: "demo" });
  }

  // ── Step 5: snow_add_work_note ────────────────────────────────────────────

  updateStep(5, { status: "running" });
  const t5Start = Date.now();
  const workNote = `Engineering ticket created: Jira ${jiraKey}. Root cause hypothesis: stripe-sdk v12.4.2 breaking timeout API change conflicts with retry middleware in recent deploy. Team notified for investigation.`;
  try {
    const r5 = await serviceNowMcpServer.callTool("snow_add_work_note", {
      number:          incidentNumber,
      sys_id:          incidentSysId !== MOCK_INCIDENT.sys_id ? incidentSysId : undefined,
      note:            workNote,
      customer_visible: false,
    }, orgId);
    const t5 = Date.now() - t5Start;
    if (!r5.isError) {
      anyLive = true;
      const data = parseToolResult(r5);
      updateStep(5, { status: "complete", durationMs: t5, result: data, mode: "live" });
    } else {
      updateStep(5, { status: "complete", durationMs: t5, result: { ...MOCK_WORK_NOTE, note: workNote }, mode: "demo" });
    }
  } catch {
    updateStep(5, { status: "complete", durationMs: Date.now() - t5Start, result: { ...MOCK_WORK_NOTE, note: workNote }, mode: "demo" });
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  const totalMs = Date.now() - (demoState.startedAt?.getTime() ?? Date.now());
  demoState = {
    ...demoState,
    status: "complete",
    completedAt: new Date(),
    summary: {
      incidentNumber,
      ciName,
      commitsFound,
      jiraTicketKey: jiraKey,
      workNoteAdded: true,
      totalMs,
      mode: anyLive ? "live" : "demo",
    },
  };
}

// ── HTTP handlers ──────────────────────────────────────────────────────────────

export async function itTriageTriggerHandler(_req: Request, res: Response): Promise<void> {
  if (demoState.status === "running") {
    res.json({ message: "Demo already running", status: demoState.status });
    return;
  }

  demoState = { status: "idle", startedAt: null, completedAt: null, steps: [] };
  runTriageDemo().catch((err: any) => {
    demoState = { ...demoState, status: "error", completedAt: new Date() };
    console.error("[it-triage] runTriageDemo uncaught:", err?.message);
  });

  res.json({ message: "IT Incident Triage demo started", status: "running" });
}

export function itTriageStatusHandler(_req: Request, res: Response): void {
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

export function itTriageResetHandler(_req: Request, res: Response): void {
  demoState = { status: "idle", startedAt: null, completedAt: null, steps: [], summary: undefined };
  res.json({ message: "Demo reset to idle" });
}
