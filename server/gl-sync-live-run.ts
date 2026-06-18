import { type Request, type Response } from "express";
import { db } from "./db";
import { agents, mcpServers } from "@shared/schema";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, type RuntimeProgressEvent } from "./agent-runtime";
import {
  getGlSyncScenario,
  getGlSyncGeneration,
  isGlSyncRunning,
  resetGlSync,
  setGlSyncRunning,
  setAgentStatus,
  updateStats,
  setExceptions,
  setHumanGate,
  GL_SYNC_AGENTS,
  type GlSyncScenario,
} from "./gl-sync-demo-store";

const PORT = process.env.PORT || 5000;
const BASE = `http://localhost:${PORT}`;

// ── Agent & MCP IDs ───────────────────────────────────────────────────────────
const AGENT_IDS = {
  A0: "a0000000-0000-4000-8000-000000000000",
  A1: "a1000000-0000-4000-8000-000000000001",
  A2: "a2000000-0000-4000-8000-000000000002",
  A3: "a3000000-0000-4000-8000-000000000003",
  A4: "a4000000-0000-4000-8000-000000000004",
  A5: "a5000000-0000-4000-8000-000000000005",
  A6: "a6000000-0000-4000-8000-000000000006",
};

const MCP_IDS = {
  GATEWAY_GL:          "c1000000-0000-4000-8000-000000000001",
  SAGE_INTACCT:        "c2000000-0000-4000-8000-000000000002",
  RECONCILIATION:      "c3000000-0000-4000-8000-000000000003",
  FILE_DELIVERY:       "c4000000-0000-4000-8000-000000000004",
  NOTIFICATION:        "c5000000-0000-4000-8000-000000000005",
};

const MCP_DEFS = [
  {
    id: MCP_IDS.GATEWAY_GL,
    name: "Kinective Gateway GL",
    url: `${BASE}/api/mock/kinective-gateway-gl`,
    tools: [
      { name: "get_gl_account_catalog",   endpoint: "/get-gl-account-catalog",   method: "GET",  desc: "Retrieve the Symitar GL account catalog for Cascade Ridge Credit Union." },
      { name: "get_prior_day_gl_entries", endpoint: "/get-prior-day-gl-entries", method: "GET",  desc: "Extract all prior-day GL movements from Symitar via PowerOn." },
      { name: "get_control_total",        endpoint: "/get-control-total",        method: "GET",  desc: "Retrieve the Symitar control total (debit/credit) for the business date." },
    ],
  },
  {
    id: MCP_IDS.SAGE_INTACCT,
    name: "Sage Intacct GL",
    url: `${BASE}/api/mock/sage-intacct`,
    tools: [
      { name: "list_gl_accounts",        endpoint: "/list-gl-accounts",        method: "GET",  desc: "List all active GL accounts in Sage Intacct with type and normal balance." },
      { name: "list_dimensions",         endpoint: "/list-dimensions",         method: "GET",  desc: "List all dimension values (branch, department, cost-center) in Intacct." },
      { name: "post_journal_entry",      endpoint: "/post-journal-entry",      method: "POST", desc: "Post a batch of journal entries to Sage Intacct." },
      { name: "get_journal_entry_status",endpoint: "/get-journal-entry-status",method: "GET",  desc: "Check the status of a posted journal entry batch by ID." },
    ],
  },
  {
    id: MCP_IDS.RECONCILIATION,
    name: "Reconciliation Ledger",
    url: `${BASE}/api/mock/reconciliation-ledger`,
    tools: [
      { name: "get_watermark",        endpoint: "/get-watermark",        method: "GET",  desc: "Get the last successfully synced business date watermark." },
      { name: "set_watermark",        endpoint: "/set-watermark",        method: "POST", desc: "Update the watermark after a successful sync cycle." },
      { name: "check_idempotency_key",endpoint: "/check-idempotency-key",method: "GET",  desc: "Check whether a given sync run key has already been processed." },
      { name: "record_posting",       endpoint: "/record-posting",       method: "POST", desc: "Record a completed posting in the reconciliation ledger." },
    ],
  },
  {
    id: MCP_IDS.FILE_DELIVERY,
    name: "File Delivery (SFTP)",
    url: `${BASE}/api/mock/file-delivery`,
    tools: [
      { name: "deliver_file",       endpoint: "/deliver-file",       method: "POST", desc: "Deliver an extract file to a remote SFTP destination." },
      { name: "get_delivery_status",endpoint: "/get-delivery-status",method: "GET",  desc: "Check delivery status for a given delivery ID." },
    ],
  },
  {
    id: MCP_IDS.NOTIFICATION,
    name: "GL Notification Service",
    url: `${BASE}/api/mock/gl-notification`,
    tools: [
      { name: "send_notification",      endpoint: "/send-notification",      method: "POST", desc: "Send an email or Slack notification to GL team members." },
      { name: "get_notification_history",endpoint: "/get-notification-history",method: "GET",  desc: "Retrieve recent notification history." },
    ],
  },
];

// A0-A6 MCP server assignments
const AGENT_MCP_MAP: Record<string, string[]> = {
  [AGENT_IDS.A0]: [MCP_IDS.RECONCILIATION, MCP_IDS.NOTIFICATION],
  [AGENT_IDS.A1]: [MCP_IDS.GATEWAY_GL, MCP_IDS.SAGE_INTACCT],
  [AGENT_IDS.A2]: [MCP_IDS.GATEWAY_GL, MCP_IDS.RECONCILIATION],
  [AGENT_IDS.A3]: [MCP_IDS.GATEWAY_GL, MCP_IDS.SAGE_INTACCT],
  [AGENT_IDS.A4]: [MCP_IDS.SAGE_INTACCT],
  [AGENT_IDS.A5]: [MCP_IDS.SAGE_INTACCT, MCP_IDS.RECONCILIATION],
  [AGENT_IDS.A6]: [MCP_IDS.GATEWAY_GL, MCP_IDS.SAGE_INTACCT, MCP_IDS.RECONCILIATION, MCP_IDS.FILE_DELIVERY, MCP_IDS.NOTIFICATION],
};

const AGENT_DEFS = [
  {
    id: AGENT_IDS.A0,
    name: "GL Sync Orchestrator",
    description: "Initiates the prior-day GL synchronization cycle, enforces idempotency, and verifies the watermark before handing off to downstream agents.",
    systemPrompt: `You are the GL Sync Orchestrator for Cascade Ridge Credit Union. Your role is to safely initiate the daily prior-day GL synchronization cycle.

Responsibilities:
1. Check idempotency to prevent duplicate runs — verify the run key has not already been processed
2. Retrieve the watermark to confirm the last successful sync date
3. Confirm the cycle is safe to proceed and report readiness to the pipeline

Always check idempotency FIRST before any other action. If the key has already been processed, report the duplicate and halt. Do not proceed if the watermark date indicates the sync has already run today.`,
  },
  {
    id: AGENT_IDS.A1,
    name: "GL Account Catalog Agent",
    description: "Validates the GL account crosswalk between Symitar core accounts and Sage Intacct account IDs before extraction begins.",
    systemPrompt: `You are the GL Account Catalog Agent for Cascade Ridge Credit Union. Your role is to validate the account crosswalk before any GL data is processed.

Responsibilities:
1. Retrieve the GL account catalog from Symitar (core account codes + descriptions)
2. Retrieve the list of GL accounts from Sage Intacct
3. Verify every core account maps to an Intacct account ID
4. Report any unmapped accounts — these would block the transformation step

Report the total mapped accounts, any gaps, and confirm the catalog is ready for extraction.`,
  },
  {
    id: AGENT_IDS.A2,
    name: "Core GL Extraction Agent",
    description: "Extracts all prior-day GL movements from Symitar via PowerOn and validates the control total.",
    systemPrompt: `You are the Core GL Extraction Agent for Cascade Ridge Credit Union. Your role is to extract all prior-day GL movements from the Symitar core system.

Responsibilities:
1. Extract all prior-day GL entries for the business date
2. Retrieve the control total (debit + credit + entry count + control hash)
3. Verify the extraction is balanced (debit total = credit total)
4. Report the extraction summary: total entries, debit total, credit total, control hash, and PowerOn job ID

If the extraction is unbalanced, report the discrepancy immediately and do not proceed.`,
  },
  {
    id: AGENT_IDS.A3,
    name: "GL Transformation Agent",
    description: "Maps extracted core account codes to Sage Intacct GL account IDs using the account crosswalk.",
    systemPrompt: `You are the GL Transformation Agent for Cascade Ridge Credit Union. Your role is to validate the account mapping for all extracted GL entries.

Responsibilities:
1. Retrieve the Symitar GL account catalog to review all source account codes
2. Retrieve the Sage Intacct account list to verify all target mappings
3. Confirm each core account code (1010, 1310, 1320, etc.) maps cleanly to the corresponding Intacct ID
4. Report transformation readiness: total entries ready for posting, any transformation failures

The transformation is a core control: every entry must have a valid Intacct account ID before posting proceeds.`,
  },
  {
    id: AGENT_IDS.A4,
    name: "Dimension & Compliance Agent",
    description: "Attaches required dimension values (branch, department, cost-center) to all journal entries and flags entries with missing dimensions.",
    systemPrompt: `You are the Dimension & Compliance Agent for Cascade Ridge Credit Union. Your role is to ensure all journal entries carry complete dimension assignments before posting.

Responsibilities:
1. List all dimension values from Sage Intacct: branches, departments, cost-centers
2. Verify all active branches are registered in Intacct — pay attention to recently opened branches
3. Identify any journal entries that cannot be dimensioned due to missing branch codes
4. Flag exceptions for human review when dimensions are incomplete

CRITICAL: If any branch dimension is missing from the Intacct dimension table (e.g., a newly opened branch whose dimension has not yet propagated), the affected entries MUST be moved to the exception queue. Do NOT post undimensioned entries.`,
  },
  {
    id: AGENT_IDS.A5,
    name: "Journal Posting Agent",
    description: "Posts the transformed and dimensioned journal entry batch to Sage Intacct and verifies acceptance.",
    systemPrompt: `You are the Journal Posting Agent for Cascade Ridge Credit Union. Your role is to post the prepared journal entry batch to Sage Intacct.

Responsibilities:
1. Post the journal entry batch to Sage Intacct (include entry count and journal_entry_id)
2. Check the journal entry status to confirm acceptance
3. Report: entries accepted, entries rejected, Intacct batch ID, posting timestamp
4. If any entries are rejected, capture the rejection detail and exception count

Use journal_entry_id format: JE-{YYYY-MM-DD}-GL-001. Always verify the posting status after submitting.`,
  },
  {
    id: AGENT_IDS.A6,
    name: "Reconciliation & Exception Agent",
    description: "Verifies Intacct control totals against Symitar, updates the watermark, delivers the reconciliation report, and sends notifications.",
    systemPrompt: `You are the Reconciliation & Exception Agent for Cascade Ridge Credit Union. Your role is to close out the GL sync cycle with full reconciliation.

Responsibilities:
1. Get the Symitar control total for the business date
2. Check the posted journal entry status to get the Intacct total
3. Compare totals — if they match, the cycle is BALANCED; if they diverge, report the variance and classify it
4. Update the sync watermark to the current business date
5. Record the posting in the reconciliation ledger
6. Deliver the reconciliation report file via SFTP
7. Send a completion notification to the GL team

If a control total variance is detected: report the exact variance amount, identify the source entry, and mark the cycle as PENDING_REVIEW. Do not update the watermark if there is an unresolved variance.`,
  },
];

// ── Ensure all agents and MCPs exist ─────────────────────────────────────────
export async function ensureGlSyncAgentSetup(): Promise<void> {
  // 1. Ensure MCP servers + tools
  for (const mcp of MCP_DEFS) {
    const allMcps = await storage.getMcpServers();
    const existing = allMcps.find((s: any) => s.id === mcp.id);
    if (!existing) {
      await db.insert(mcpServers).values({
        id: mcp.id,
        name: mcp.name,
        description: `GL Sync mock MCP server — ${mcp.name}`,
        transportType: "streamable-http",
        url: mcp.url,
        status: "production-enabled",
        riskTier: "HIGH",
        allowlisted: true,
        industryId: "financial_services",
        addedBy: "gl-sync-demo",
        capabilities: { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo: { vendor: "Kinective / Cascade Ridge", version: "1.0.0", environment: "demo" },
      } as any);
    } else if ((existing as any).url !== mcp.url) {
      await storage.updateMcpServer(mcp.id, { url: mcp.url });
    }

    const existingTools = (await storage.getMcpServerTools(mcp.id)) ?? [];
    const existingNames = new Set(existingTools.map((t: any) => t.name));

    for (const tool of mcp.tools) {
      if (!existingNames.has(tool.name)) {
        await storage.createMcpServerTool({
          serverId: mcp.id,
          name: tool.name,
          description: tool.desc,
          inputSchema: { type: "object", properties: {} },
          outputSchema: null,
          annotations: { endpoint: tool.endpoint, method: tool.method },
          riskClassification: "medium",
          owner: "GL Sync Demo",
          enabled: true,
        });
      }
    }
  }

  // 2. Ensure agents + MCP bindings
  for (const def of AGENT_DEFS) {
    const existing = await storage.getAgent(def.id);
    if (!existing) {
      await db.insert(agents).values({
        id: def.id,
        name: def.name,
        description: def.description,
        systemPrompt: def.systemPrompt,
        runtimeConfig: { prompt: def.description, scheduleIntervalMinutes: 0 },
        agentType: "single",
        status: "active",
        environment: "production",
        modelProvider: "anthropic",
        modelName: "claude-opus-4-5",
        riskTier: "HIGH",
        autonomyMode: "autonomous",
        currentVersion: "1.0.0",
        maxToolIterations: 10,
        toolAccessClass: "standard",
        department: "Finance & Accounting",
        owner: "Kinective GL Sync Demo",
        healthScore: 97,
        successRate: 0.98,
        maturityFactors: {},
      } as any);
    } else {
      const needsUpdate = !(existing as any).systemPrompt || (existing as any).modelProvider !== "anthropic";
      if (needsUpdate) {
        await storage.updateAgent(def.id, {
          systemPrompt: def.systemPrompt,
          modelProvider: "anthropic",
          modelName: "claude-opus-4-5",
          runtimeConfig: { prompt: def.description, scheduleIntervalMinutes: 0 },
        } as any);
      }
    }

    const mcpServerIds = AGENT_MCP_MAP[def.id] || [];
    const existingLinks = (await storage.getAgentMcpServers(def.id)) ?? [];
    const linkedIds = new Set(existingLinks.map((l: any) => l.serverId));

    for (const mcpId of mcpServerIds) {
      if (!linkedIds.has(mcpId)) {
        await storage.createAgentMcpServer({ agentId: def.id, serverId: mcpId, assignedBy: "gl-sync-demo" });
      }
    }
  }
}

// ── Tool → Agent index map for SSE events ────────────────────────────────────
const TOOL_AGENT_MAP: Record<string, number> = {
  get_watermark:              0,
  check_idempotency_key:      0,
  get_gl_account_catalog:     1,
  list_gl_accounts:           1,
  get_prior_day_gl_entries:   2,
  get_control_total:          2,
  list_dimensions:            4,
  post_journal_entry:         5,
  get_journal_entry_status:   5,
  record_posting:             5,
  set_watermark:              6,
  deliver_file:               6,
  get_delivery_status:        6,
  send_notification:          6,
  get_notification_history:   6,
};

const TOOL_SYSTEM_MAP: Record<string, string> = {
  get_watermark:              "Reconciliation Ledger",
  check_idempotency_key:      "Reconciliation Ledger",
  get_gl_account_catalog:     "Kinective Gateway GL",
  list_gl_accounts:           "Sage Intacct",
  get_prior_day_gl_entries:   "Kinective Gateway GL",
  get_control_total:          "Kinective Gateway GL",
  list_dimensions:            "Sage Intacct",
  post_journal_entry:         "Sage Intacct",
  get_journal_entry_status:   "Sage Intacct",
  record_posting:             "Reconciliation Ledger",
  set_watermark:              "Reconciliation Ledger",
  deliver_file:               "File Delivery (SFTP)",
  get_delivery_status:        "File Delivery (SFTP)",
  send_notification:          "Notification Service",
  get_notification_history:   "Notification Service",
};

const YESTERDAY = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

function buildAgentPrompt(agentIndex: number, scenario: GlSyncScenario, context: Record<string, any>): string {
  const bDate = YESTERDAY();
  const runKey = `GL-SYNC-${bDate}-001`;

  const base: Record<number, string> = {
    0: `Initiate the prior-day GL synchronization cycle for Cascade Ridge Credit Union.
Business date: ${bDate}. Run key: ${runKey}.
Step 1: Call check_idempotency_key with key="${runKey}" — confirm this run has NOT already been processed.
Step 2: Call get_watermark — confirm the last sync date and that this business date is next in sequence.
Report both results. Confirm the pipeline is clear to proceed.`,

    1: `Validate the GL account crosswalk for the ${bDate} GL sync cycle.
Step 1: Call get_gl_account_catalog — retrieve all Symitar core account codes.
Step 2: Call list_gl_accounts — retrieve all Sage Intacct account IDs.
Step 3: Verify each core account (1010, 1100, 1310, 1320, 1330, 1400, 1510, 1610, 2010, 2020, 2030, 2040, 2110, 2210, 3010, 3020, 4010, 4020, 4030, 5010, 5020, 6010, 6020, 6030, 6040) maps to an Intacct account.
Report: total accounts cataloged, any unmapped accounts, crosswalk readiness status.`,

    2: `Extract all prior-day GL movements from Symitar for business date ${bDate}.
Step 1: Call get_prior_day_gl_entries — extract all GL movements.
Step 2: Call get_control_total — get the official control total.
Step 3: Verify debit_total == credit_total (balanced book entry).
Report: total entries extracted, debit total, credit total, control hash, and extraction status.`,

    3: `Validate the transformation mapping for the ${context.entryCount || 1742} GL entries extracted for ${bDate}.
Step 1: Call get_gl_account_catalog — confirm source account codes.
Step 2: Call list_gl_accounts — confirm all target Intacct IDs.
Step 3: For each account in the catalog, verify a corresponding Intacct ID exists. 
Report: transformation readiness, entries ready to post, any mapping failures.`,

    4: scenario === "dimension_mismatch"
      ? `Review dimension completeness for all ${context.entryCount || 1742} GL entries for ${bDate}.
Step 1: Call list_dimensions — retrieve all branch, department, and cost-center dimension values from Intacct.
Step 2: Check specifically if branch BR-14 (Kirkland) is listed and whether its dimension mapping is complete.
Step 3: Identify entries using account GL-1330-LOAN-COM (Commercial Loans) — these 47 entries reference the Kirkland branch which opened 6 days ago. Confirm whether the dimension is propagated.
Report: total entries dimensioned, entries missing branch dimension, exception count, affected accounts.`
      : `Review dimension completeness for all ${context.entryCount || 1742} GL entries for ${bDate}.
Step 1: Call list_dimensions — retrieve all branch, department, and cost-center dimension values from Intacct.
Step 2: Verify all 14 branches (BR-01 through BR-14) are registered with complete mappings.
Step 3: Confirm all entries can be fully dimensioned.
Report: branches validated, dimension coverage, readiness for posting.`,

    5: `Post the GL journal entry batch to Sage Intacct for business date ${bDate}.
Journal entry ID: JE-${bDate}-GL-001. Entry count: ${context.entriesToPost || 1742}.
Step 1: Call post_journal_entry with journal_entry_id="JE-${bDate}-GL-001" and entry_count=${context.entriesToPost || 1742}.
Step 2: Call get_journal_entry_status with journal_entry_id="JE-${bDate}-GL-001".
Report: entries accepted, entries rejected (if any), Intacct batch ID, posting status.`,

    6: scenario === "control_total_variance"
      ? `Reconcile the GL sync cycle for ${bDate} — IMPORTANT: verify for FX rate variance.
Step 1: Call get_control_total — get the Symitar control total ($47,382,156.29).
Step 2: Call get_journal_entry_status with journal_entry_id="JE-${bDate}-GL-001" — get Intacct total.
Step 3: Compare totals. The Intacct total will be $47,381,156.29 due to FX entry TRX-FX-0047 using settlement rate. Report the $1,000.00 variance.
Step 4: DO NOT update watermark — mark cycle as PENDING_REVIEW due to variance.
Step 5: Call send_notification with subject="GL Sync PENDING_REVIEW — $1,000 FX variance detected (${bDate})" to alert the GL Controller.
Report: variance amount, affected entry, cycle status PENDING_REVIEW.`
      : `Close out the GL sync cycle for ${bDate}.
Step 1: Call get_control_total — get the Symitar control total.
Step 2: Call get_journal_entry_status with journal_entry_id="JE-${bDate}-GL-001" — verify Intacct total.
Step 3: Confirm totals match — mark cycle as BALANCED.
Step 4: Call set_watermark with sync_date="${bDate}" — advance the watermark.
Step 5: Call record_posting with idempotency_key="GL-SYNC-${bDate}-001", je_id="JE-${bDate}-GL-001", entries_posted=${context.entriesPosted || 1742}, status="COMPLETE".
Step 6: Call deliver_file with file_name="CASCADE-RIDGE-GL-${bDate}-RECON.csv".
Step 7: Call send_notification with subject="GL Sync Complete — ${context.entriesPosted || 1742} entries posted (${bDate})".
Report the final reconciliation summary.`,
  };

  return base[agentIndex] || `Complete your assigned task for the GL sync cycle dated ${bDate}.`;
}

// ── SSE Live-Run Handler ──────────────────────────────────────────────────────
export async function glSyncLiveRunHandler(req: Request, res: Response): Promise<void> {
  const scenarioParam = (req.query.scenario as string) || "happy";
  const validScenarios: GlSyncScenario[] = ["happy", "dimension_mismatch", "control_total_variance"];
  const scenario: GlSyncScenario = validScenarios.includes(scenarioParam as any) ? scenarioParam as GlSyncScenario : "happy";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (type: string, payload: object) => {
    try { res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  let aborted = false;
  req.on("close", () => { aborted = true; });

  const keepalive = setInterval(() => {
    if (!aborted) try { res.write(": ping\n\n"); } catch {}
  }, 15000);

  try {
    if (isGlSyncRunning()) {
      sendEvent("error", { message: "GL Sync pipeline already running — wait for it to complete." });
      res.end();
      clearInterval(keepalive);
      return;
    }

    const bDate = YESTERDAY();
    resetGlSync(scenario);
    setGlSyncRunning(true);
    const thisGen = getGlSyncGeneration();
    updateStats({ businessDate: bDate });

    sendEvent("run_start", { scenario, businessDate: bDate, institution: "Cascade Ridge Credit Union" });

    sendEvent("setup", { message: "Ensuring 7 GL sync agents and 5 MCP servers..." });
    await ensureGlSyncAgentSetup();
    sendEvent("setup", { message: "All agents ready — GL sync pod online" });

    // Shared context object — grows as each agent completes
    const ctx: Record<string, any> = {};

    const agentList = AGENT_DEFS;

    for (let i = 0; i < agentList.length; i++) {
      if (aborted || getGlSyncGeneration() !== thisGen) break;

      // A3 (Transformation) has no distinct tools beyond A1 — keep it quick
      const agentDef = agentList[i];

      // Ensure a deployment for this agent
      const allDeployments = await storage.getDeployments();
      let dep = (allDeployments as any[]).find((d: any) => d.agentId === agentDef.id && d.status !== "rolled_back");
      if (!dep) {
        dep = await storage.createDeployment({
          agentId: agentDef.id,
          environment: "staging",
          version: "1.0.0",
          status: "active",
          rolloutStrategy: "direct",
          trafficPercentage: 100,
        } as any);
      }

      if (await isRuntimeActive(dep.id)) await stopAgentRuntime(dep.id);

      setAgentStatus(i, "running", { startedAt: new Date().toISOString() });
      sendEvent("agent_start", {
        agentIndex: i,
        agentId: agentDef.id,
        agentName: GL_SYNC_AGENTS[i].name,
        role: GL_SYNC_AGENTS[i].role,
      });

      const onProgress = (evt: RuntimeProgressEvent) => {
        if (aborted) return;
        const { type, data } = evt;
        if (data?.server === "unknown") return;
        const tool = data?.tool || "unknown";
        const agentIdx = TOOL_AGENT_MAP[tool] ?? i;

        if (type === "tool_call_start") {
          sendEvent("agent_event", {
            type: "tool_call_start",
            agentIndex: agentIdx,
            tool,
            system: TOOL_SYSTEM_MAP[tool] || "Unknown",
          });
        } else if (type === "tool_call_result") {
          const success = data?.success ?? true;
          sendEvent("agent_event", {
            type: "tool_call_result",
            agentIndex: agentIdx,
            tool,
            system: TOOL_SYSTEM_MAP[tool] || "Unknown",
            success,
            error: !success ? (data?.error || "failed") : null,
          });
        }
      };

      const maxSteps = i === 6 ? 10 : i === 0 ? 5 : 6;
      const prompt = buildAgentPrompt(i, scenario, ctx);
      const result = await runAgentOnce(dep.id, prompt, maxSteps, onProgress as any);

      // Capture latest trace ID for this agent
      const traces = await storage.getTracesByAgent(agentDef.id);
      const sorted = [...traces].sort((a: any, b: any) =>
        new Date((b as any).startedAt || 0).getTime() - new Date((a as any).startedAt || 0).getTime()
      );
      const traceId = sorted[0] ? (sorted[0] as any).id : null;

      const toolCalls = result.steps?.length ?? 0;

      // Scenario-specific post-processing
      if (i === 2) {
        updateStats({ entriesExtracted: 1742, debitTotal: 47382156.29, creditTotal: 47382156.29, controlHash: "SHA256-7f4e2a1b9c3d5e8f" });
        ctx.entryCount = 1742; ctx.debitTotal = 47382156.29;
        sendEvent("gl_stats", { entriesExtracted: 1742, debitTotal: 47382156.29, creditTotal: 47382156.29, controlHash: "SHA256-7f4e2a1b9c3d5e8f" });
      }

      if (i === 4) {
        const excepted = scenario === "dimension_mismatch" ? 47 : 0;
        const toPost = 1742 - excepted;
        updateStats({ entriesExcepted: excepted, entriesTransformed: toPost });
        ctx.entriesToPost = toPost; ctx.excCount = excepted;
        if (excepted > 0) {
          const exc = { count: 47, reason: "Missing branch dimension BR-14 (Kirkland — new branch, 6 days old)", accounts: ["GL-1330-LOAN-COM"] };
          setExceptions(exc);
          sendEvent("exception", { count: 47, reason: exc.reason, accounts: exc.accounts, queue: "EXC-BR14-001" });
        }
      }

      if (i === 5) {
        const posted = scenario === "dimension_mismatch" ? 1695 : 1742;
        const intacctTotal = scenario === "control_total_variance" ? 47381156.29 : 47382156.29 - (scenario === "dimension_mismatch" ? 1247388.41 : 0);
        updateStats({ entriesPosted: posted, intacctTotal, jeId: `JE-${bDate}-GL-001` });
        ctx.entriesPosted = posted; ctx.intacctTotal = intacctTotal;
        sendEvent("posting_result", {
          jeId: `JE-${bDate}-GL-001`,
          entriesPosted: posted,
          entriesExcepted: scenario === "dimension_mismatch" ? 47 : 0,
          intacctTotal,
        });
      }

      if (i === 6) {
        const variance = scenario === "control_total_variance" ? -1000.00 : 0;
        const balanced = variance === 0;
        updateStats({ balanced, variance });
        if (!balanced) {
          const gate = {
            gateType: "control_total_variance",
            message: `Control total variance of $1,000.00 detected between Symitar ($47,382,156.29) and Intacct ($47,381,156.29). FX entry TRX-FX-0047 used settlement rate vs T-1 mid-rate. GL Controller review required.`,
            context: { symitarTotal: 47382156.29, intacctTotal: 47381156.29, variance: -1000.00, entry: "TRX-FX-0047", cycleStatus: "PENDING_REVIEW" },
          };
          setHumanGate(gate);
          sendEvent("human_gate", gate);
        }
        if (scenario === "dimension_mismatch") {
          sendEvent("human_gate", {
            gateType: "dimension_remediation",
            message: "47 commercial loan entries for Kirkland Branch (BR-14) require dimension mapping update before they can be posted. Route to GL team for remediation.",
            context: { exceptionQueue: "EXC-BR14-001", count: 47, branch: "BR-14 (Kirkland)", account: "GL-1330-LOAN-COM" },
          });
        }
      }

      const agentSummary =
        i === 0 ? `Idempotency verified — cycle clear to proceed. Watermark: ${ctx.watermark || "prior business day"}.`
        : i === 1 ? "GL account crosswalk validated — all 25 core accounts map to Intacct IDs."
        : i === 2 ? `Extracted 1,742 entries. Debit = Credit = $47,382,156.29. Control hash verified.`
        : i === 3 ? "Transformation mapping complete — all entries mapped to Intacct account IDs."
        : i === 4 ? (scenario === "dimension_mismatch" ? "47 entries excepted — Kirkland branch dimension (BR-14) not yet in Intacct." : "All 14 branches dimensioned. Entries fully attributed.")
        : i === 5 ? (scenario === "dimension_mismatch" ? "1,695 entries posted to Intacct. 47 in exception queue EXC-BR14-001." : "1,742 entries posted to Intacct. Batch accepted.")
        : scenario === "control_total_variance" ? "Variance $1,000.00 detected — FX rate divergence. Cycle marked PENDING_REVIEW. GL Controller notified."
        : scenario === "dimension_mismatch" ? "1,695 entries reconciled. Exception queue created. Watermark NOT advanced — 47 entries pending remediation."
        : "All 1,742 entries reconciled. Watermark advanced. Report delivered. GL team notified.";

      setAgentStatus(i, result.success ? "complete" : "error", {
        completedAt: new Date().toISOString(),
        traceId,
        summary: agentSummary,
        toolCallCount: toolCalls,
      });

      sendEvent("agent_complete", {
        agentIndex: i,
        agentId: agentDef.id,
        agentName: GL_SYNC_AGENTS[i].name,
        success: result.success,
        toolCallCount: toolCalls,
        traceId,
        summary: agentSummary,
      });

      // Brief pause between agents
      await new Promise<void>(r => setTimeout(r, 300));
    }

    if (getGlSyncGeneration() !== thisGen) {
      setGlSyncRunning(false);
      sendEvent("run_complete", { scenario, success: false, message: "Run superseded by reset" });
      return;
    }

    const finalMessage =
      scenario === "happy" ? "GL sync complete — 1,742 entries posted, balanced, watermark advanced."
      : scenario === "dimension_mismatch" ? "GL sync partial — 1,695 posted, 47 in exception queue for Kirkland branch dimension."
      : "GL sync PENDING_REVIEW — $1,000 FX variance detected, GL Controller alerted.";

    const finalSuccess = scenario !== "control_total_variance";
    setGlSyncRunning(false);

    sendEvent("run_complete", {
      scenario,
      success: finalSuccess,
      message: finalMessage,
      stats: {
        businessDate: bDate,
        entriesExtracted: 1742,
        entriesPosted: scenario === "dimension_mismatch" ? 1695 : 1742,
        entriesExcepted: scenario === "dimension_mismatch" ? 47 : 0,
        balanced: scenario !== "control_total_variance",
        variance: scenario === "control_total_variance" ? -1000 : 0,
      },
    });

  } catch (err: any) {
    console.error("[gl-sync/live-run] Error:", err?.message, err?.stack);
    sendEvent("error", { message: err?.message || "GL sync pipeline failed" });
    try { setGlSyncRunning(false); } catch {}
  } finally {
    clearInterval(keepalive);
    if (!aborted) res.end();
  }
}

export async function resetGlSyncHandler(req: Request, res: Response): Promise<void> {
  const scenario = (req.body?.scenario as GlSyncScenario) || "happy";
  resetGlSync(scenario);
  res.json({ success: true, scenario, message: "GL sync demo reset." });
}

export async function getGlSyncStatusHandler(_req: Request, res: Response): Promise<void> {
  const { getGlSyncState } = await import("./gl-sync-demo-store");
  res.json(getGlSyncState());
}
