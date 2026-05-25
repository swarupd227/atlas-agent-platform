/**
 * IT Incident Triage Demo — Live Run Handler
 * Demonstrates ServiceNow + CMDB + GitHub + Jira in a single 5-step workflow.
 * Uses scripted mock data so the demo runs without live credentials configured.
 */

import { type Request, type Response } from "express";

export type TriageStep = {
  id: number;
  title: string;
  tool: string;
  integration: "servicenow" | "github" | "jira";
  status: "pending" | "running" | "complete" | "error";
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
  };
};

let demoState: DemoState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  steps: [],
};

// ── Mock data payloads ────────────────────────────────────────────────────────

const MOCK_INCIDENT = {
  number: "INC0023451",
  sys_id: "abc123def456abc123def456abc123de",
  short_description: "Payment service returning 503 errors — checkout flow impacted",
  description: "Starting at 14:32 UTC, the payment-service-prod CI is returning HTTP 503 for ~18% of checkout requests. Error rate spiked after the 14:25 deployment of payment-service v2.4.1. Revenue impact estimated at $12K/hr.",
  state: "2",
  state_display: "In Progress",
  priority: "1",
  priority_display: "Critical",
  category: "software",
  assignment_group: "Platform Engineering",
  opened_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  caller_id: "ops-monitor-bot",
  business_service: "E-Commerce Checkout",
};

const MOCK_CI = {
  sys_id: "ci789payment456",
  name: "payment-service-prod",
  sys_class_name: "cmdb_ci_app_server",
  operational_status: "1",
  operational_status_display: "Operational",
  short_description: "Payment service — production cluster (3 replicas, k8s namespace: payments)",
  ip_address: "10.4.22.100",
  fqdn: "payment-service-prod.internal.acme.com",
  location: "us-east-1",
  department: "Engineering",
  used_for: "Production",
  related_incidents: 3,
  last_patched: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split("T")[0],
};

const MOCK_COMMITS = [
  {
    sha: "3f8a1b2",
    full_sha: "3f8a1b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
    message: "feat: add retry logic for payment processor timeout",
    author_name: "Alice Chen",
    author_login: "alicechen",
    date: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    html_url: "https://github.com/acme-corp/payment-service/commit/3f8a1b2",
  },
  {
    sha: "d4c9e1f",
    full_sha: "d4c9e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
    message: "fix: remove duplicate timeout config that conflicts with retry middleware",
    author_name: "Bob Martinez",
    author_login: "bobmartinez",
    date: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    html_url: "https://github.com/acme-corp/payment-service/commit/d4c9e1f",
  },
  {
    sha: "7a2d3c8",
    full_sha: "7a2d3c8b9e1f4a2d5c6b7e8f9a1b2c3d4e5f6a7b",
    message: "chore: bump stripe-sdk from 12.1.0 to 12.4.2 (includes breaking timeout API change)",
    author_name: "Dependabot",
    author_login: "dependabot[bot]",
    date: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    html_url: "https://github.com/acme-corp/payment-service/commit/7a2d3c8",
  },
];

const MOCK_JIRA_TICKET = {
  key: "PAY-4521",
  id: "10089",
  self: "https://acme.atlassian.net/rest/api/3/issue/10089",
  created: true,
};

const MOCK_WORK_NOTE = {
  added: true,
  table: "incident",
  sys_id: MOCK_INCIDENT.sys_id,
  customer_visible: false,
};

// ── Step definitions ──────────────────────────────────────────────────────────

function buildInitialSteps(): TriageStep[] {
  return [
    {
      id: 1,
      title: "Read incident from ServiceNow",
      tool: "snow_get_incident",
      integration: "servicenow",
      status: "pending",
    },
    {
      id: 2,
      title: "Look up affected CI in CMDB",
      tool: "snow_get_cmdb_ci",
      integration: "servicenow",
      status: "pending",
    },
    {
      id: 3,
      title: "Search GitHub for recent commits on affected service",
      tool: "gh_list_commits",
      integration: "github",
      status: "pending",
    },
    {
      id: 4,
      title: "Create Jira engineering ticket with incident context",
      tool: "jira_create_issue",
      integration: "jira",
      status: "pending",
    },
    {
      id: 5,
      title: "Add work note back to ServiceNow incident",
      tool: "snow_add_work_note",
      integration: "servicenow",
      status: "pending",
    },
  ];
}

// ── Sleep helper ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main demo runner ──────────────────────────────────────────────────────────

async function runTriageDemo(): Promise<void> {
  demoState = {
    status: "running",
    startedAt: new Date(),
    completedAt: null,
    steps: buildInitialSteps(),
  };

  const updateStep = (id: number, patch: Partial<TriageStep>) => {
    const idx = demoState.steps.findIndex(s => s.id === id);
    if (idx >= 0) {
      demoState.steps[idx] = { ...demoState.steps[idx], ...patch };
    }
  };

  const runStep = async (
    id: number,
    durationMs: number,
    resultFn: () => unknown
  ) => {
    updateStep(id, { status: "running" });
    await sleep(durationMs);
    updateStep(id, { status: "complete", durationMs, result: resultFn() });
  };

  try {
    // Step 1: Read ServiceNow incident
    await runStep(1, 1400, () => MOCK_INCIDENT);

    // Step 2: Look up CMDB CI
    await runStep(2, 1100, () => MOCK_CI);

    // Step 3: Search GitHub commits
    await runStep(3, 1800, () => ({
      count: MOCK_COMMITS.length,
      has_more: false,
      commits: MOCK_COMMITS,
    }));

    // Step 4: Create Jira ticket
    const incidentSummary = `[INC0023451] Payment service 503 errors — checkout flow (${MOCK_CI.name})`;
    await runStep(4, 2100, () => ({
      ...MOCK_JIRA_TICKET,
      summary: incidentSummary,
      description: `Incident ${MOCK_INCIDENT.number} — ${MOCK_INCIDENT.short_description}\n\nPriority: ${MOCK_INCIDENT.priority_display}\nAffected CI: ${MOCK_CI.name}\nAssignment group: ${MOCK_INCIDENT.assignment_group}\n\nRecent commits to ${MOCK_CI.name}:\n${MOCK_COMMITS.map(c => `- ${c.sha} ${c.message} (${c.author_login})`).join("\n")}\n\nRoot cause hypothesis: stripe-sdk v12.4.2 breaking timeout API change may conflict with new retry middleware.`,
    }));

    // Step 5: Add work note back to ServiceNow
    await runStep(5, 900, () => ({
      ...MOCK_WORK_NOTE,
      note: `Engineering ticket created: Jira ${MOCK_JIRA_TICKET.key}. Root cause hypothesis: stripe-sdk v12.4.2 breaking timeout API change may conflict with retry middleware added in commit 3f8a1b2. Engineering team notified for investigation.`,
    }));

    const totalMs = Date.now() - (demoState.startedAt?.getTime() ?? Date.now());

    demoState = {
      ...demoState,
      status: "complete",
      completedAt: new Date(),
      summary: {
        incidentNumber: MOCK_INCIDENT.number,
        ciName: MOCK_CI.name,
        commitsFound: MOCK_COMMITS.length,
        jiraTicketKey: MOCK_JIRA_TICKET.key,
        workNoteAdded: true,
        totalMs,
      },
    };
  } catch (err: any) {
    demoState = {
      ...demoState,
      status: "error",
      completedAt: new Date(),
    };
  }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

export async function itTriageTriggerHandler(_req: Request, res: Response): Promise<void> {
  if (demoState.status === "running") {
    res.json({ message: "Demo already running", status: demoState.status });
    return;
  }

  demoState = { status: "idle", startedAt: null, completedAt: null, steps: [] };
  runTriageDemo().catch(() => {});

  res.json({ message: "IT Incident Triage demo started", status: "running" });
}

export function itTriageStatusHandler(_req: Request, res: Response): void {
  res.json({
    status: demoState.status,
    startedAt: demoState.startedAt,
    completedAt: demoState.completedAt,
    steps: demoState.steps.map(s => ({
      ...s,
      result: s.status === "complete" ? s.result : undefined,
    })),
    summary: demoState.summary ?? null,
    elapsedMs: demoState.startedAt
      ? Date.now() - demoState.startedAt.getTime()
      : 0,
  });
}

export function itTriageResetHandler(_req: Request, res: Response): void {
  demoState = {
    status: "idle",
    startedAt: null,
    completedAt: null,
    steps: [],
    summary: undefined,
  };
  res.json({ message: "Demo reset to idle" });
}
