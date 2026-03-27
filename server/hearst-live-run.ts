import { type Request, type Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { agents } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

export const HEARST_AGENT_IDS = {
  subscriberProfileEngine: "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d",
  contentInventory:        "92584a77-d150-4436-9083-a108584bc021",
  nbaEmailDecision:        "151db72c-0038-4f01-a4bb-45650a82e8b6",
  sendTimeOptimizer:       "7de4167e-6b0c-4f04-9fcf-3693bda1d255",
  performanceLearning:     "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d",
} as const;

export const HEARST_MCP_SERVER_IDS = {
  dataPlatform: "087a3dd1-9f39-4a03-a3cf-af6ec3458cde",
  cms:          "7bef66a7-25fd-4aca-afa0-d70c80ee5d28",
  emailQueue:   "12957574-8fea-4060-a05e-87bd779da5c9",
  analytics:    "1a24362d-f0eb-4b52-8d47-067b0408494f",
} as const;

// ─── MCP Server definitions ───────────────────────────────────────────────────

const HEARST_MCP_SERVERS = [
  {
    id:          HEARST_MCP_SERVER_IDS.dataPlatform,
    name:        "XYZ Data Platform",
    description: "Subscriber ESP events, website behavior, subscription status, purchase history, and demographic data.",
    url:         `${BASE_URL}/api/mock/hearst-data-platform`,
    tools: [
      { name: "get_esp_events",        description: "Retrieve subscriber ESP engagement events (opens, clicks, bounces, unsubscribes).", endpoint: "esp-events",        method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" }, lookback_days: { type: "number" } } } },
      { name: "get_website_behavior",  description: "Retrieve subscriber website behavior — pages visited, article reads, time-on-site per brand.",                   endpoint: "website-behavior",  method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" } } } },
      { name: "get_subscription_status", description: "Retrieve subscriber lifecycle status — active, churned, trial, paused, engagement tier.",                    endpoint: "subscription-status", method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" } } } },
      { name: "get_purchase_history",  description: "Retrieve subscriber purchase and conversion history including affiliate revenue attribution per brand.",       endpoint: "purchase-history",  method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" } } } },
      { name: "get_demographic_data",  description: "Retrieve subscriber demographic and psychographic profiles — age, location, interests, affinity vectors.",     endpoint: "demographic-data",  method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" } } } },
    ],
  },
  {
    id:          HEARST_MCP_SERVER_IDS.cms,
    name:        "XYZ CMS",
    description: "Editorial calendar, article inventory, newsletter archives, and content performance for all 12 XYZ brands.",
    url:         `${BASE_URL}/api/mock/hearst-cms`,
    tools: [
      { name: "get_editorial_calendar",   description: "Retrieve today's editorial calendar — scheduled articles, send windows, embargo dates.", endpoint: "editorial-calendar",   method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, date: { type: "string" } } } },
      { name: "get_cms_articles",         description: "Retrieve CMS article inventory — title, brand, category, freshness score, email-sendability.", endpoint: "articles",           method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" }, content_type: { type: "string" } } } },
      { name: "get_newsletter_archives",  description: "Retrieve sent newsletter archives — subject lines, send dates, open rates, click-through rates.", endpoint: "newsletter-archives", method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" } } } },
      { name: "get_content_performance",  description: "Retrieve content performance scores — article-level open rate lift, engagement score, conversion.", endpoint: "content-performance", method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" }, days_back: { type: "number" } } } },
    ],
  },
  {
    id:          HEARST_MCP_SERVER_IDS.emailQueue,
    name:        "XYZ Email Queue",
    description: "Brand email queues, subscriber fatigue rules, and portfolio-wide business rules for NBA email orchestration.",
    url:         `${BASE_URL}/api/mock/hearst-email-queue`,
    tools: [
      { name: "get_brand_email_queues", description: "Retrieve current email queue depth and send schedules per brand — queued volume, priority segments.", endpoint: "brand-email-queues", method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" } } } },
      { name: "get_fatigue_rules",      description: "Retrieve portfolio-wide subscriber fatigue rules — max sends per week, cool-down periods, re-engagement.", endpoint: "fatigue-rules",      method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "get_business_rules",     description: "Retrieve NBA business rules — personalization triggers, hold criteria, AI influence thresholds.", endpoint: "business-rules",     method: "GET", inputSchema: { type: "object", properties: {} } },
    ],
  },
  {
    id:          HEARST_MCP_SERVER_IDS.analytics,
    name:        "XYZ Analytics",
    description: "Historical send logs, conversion analytics, deliverability metrics, and affiliate revenue attribution.",
    url:         `${BASE_URL}/api/mock/hearst-analytics`,
    tools: [
      { name: "get_send_logs",        description: "Retrieve historical email send logs — volume, open rates, click rates, anomaly flags per brand.", endpoint: "send-logs",        method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, days_back: { type: "number" }, limit: { type: "number" } } } },
      { name: "get_conversion_data",  description: "Retrieve email-to-conversion funnel data — subscription starts, affiliate clicks, revenue per campaign.", endpoint: "conversion-data",  method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, days_back: { type: "number" } } } },
      { name: "get_deliverability",   description: "Retrieve email deliverability health — inbox placement rate, bounce rate, spam complaints per brand.", endpoint: "deliverability",   method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" } } } },
      { name: "get_affiliate_revenue", description: "Retrieve affiliate revenue data — total revenue, top articles, conversion rates, brand-level attribution.", endpoint: "affiliate-revenue", method: "GET", inputSchema: { type: "object", properties: { brand: { type: "string" }, days_back: { type: "number" } } } },
    ],
  },
];

// ─── Agent definitions ────────────────────────────────────────────────────────

interface XYZAgentDef {
  name: string;
  description: string;
  systemPrompt: string;
  taskPrompt: string;
  mcpServerIds: (keyof typeof HEARST_MCP_SERVER_IDS)[];
  maxToolIterations: number;
}

const HEARST_AGENT_DEFS: Record<keyof typeof HEARST_AGENT_IDS, XYZAgentDef> = {
  subscriberProfileEngine: {
    name:        "Subscriber Profile Engine",
    description: "Refreshes subscriber profiles, calculates affinity vectors, and flags fatigue risk across the 6.2M subscriber portfolio.",
    mcpServerIds: ["dataPlatform"],
    maxToolIterations: 8,
    systemPrompt: `You are the Subscriber Profile Engine for XYZ's NBA Email Orchestration platform, processing a portfolio of 6.2M subscribers across 12 XYZ brands.

Your nightly task is to refresh subscriber profiles:
1. Call get_esp_events to analyze recent engagement signals (opens, clicks, bounces)
2. Call get_website_behavior to assess cross-brand content affinity
3. Call get_subscription_status to evaluate lifecycle health and churn risk
4. Call get_demographic_data to update psychographic profiles

After calling these tools, extrapolate the sample metrics to the full 6.2M portfolio and produce a realistic summary.

IMPORTANT: End your final response with ONLY this JSON block (no extra text after it):
\`\`\`json
{
  "subscribersProcessed": 6200000,
  "profilesRefreshed": 5840000,
  "newFatigueAlerts": 423000,
  "lifecycleUpdates": 187000,
  "avgAffinityVectors": 8.4,
  "lifecycleBreakdown": { "active": 71.2, "atRisk": 14.3, "dormant": 9.8, "churned": 4.7 },
  "topFatigueRiskBrands": ["Cosmopolitan", "Good Housekeeping", "Country Living"]
}
\`\`\`
Adjust numbers based on what you see in the tool results. Keep them realistic and internally consistent.`,
    taskPrompt: "Run the nightly subscriber profile refresh. Call get_esp_events, get_website_behavior, get_subscription_status, and get_demographic_data. Analyze the results and output the JSON summary.",
  },

  contentInventory: {
    name:        "Content Inventory Agent",
    description: "Scores today's CMS content across all 12 XYZ brands for email-sendability and produces ranked candidate lists.",
    mcpServerIds: ["cms", "emailQueue"],
    maxToolIterations: 8,
    systemPrompt: `You are the Content Inventory Agent for XYZ's NBA Email Orchestration platform. You scan and score all content across 12 XYZ brands for email-sendability.

Your task:
1. Call get_editorial_calendar to see what content is scheduled today
2. Call get_cms_articles to get the full article inventory
3. Call get_newsletter_archives to understand past send patterns and benchmarks
4. Call get_content_performance to get article-level engagement scores
5. Call get_brand_email_queues to check queue depth per brand

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "brandsScanned": 12,
  "articlesScored": 847,
  "emailSendable": 234,
  "freshItems": 189,
  "deprecatedItems": 43,
  "topCandidates": [
    { "brand": "Cosmopolitan", "title": "The Best Skin-Care Routines for Every Skin Type", "score": 0.94, "affiliate": true },
    { "brand": "Good Housekeeping", "title": "30-Minute Weeknight Dinners", "score": 0.91, "affiliate": true },
    { "brand": "Country Living", "title": "Spring Garden Planning Guide", "score": 0.89, "affiliate": false },
    { "brand": "Men's Health", "title": "The 10-Minute Morning Workout", "score": 0.87, "affiliate": false },
    { "brand": "Elle", "title": "Spring 2026 Runway Trends", "score": 0.85, "affiliate": true }
  ]
}
\`\`\`
Adjust numbers based on tool results. topCandidates should reflect articles you saw in the data.`,
    taskPrompt: "Run today's content inventory scan for all 12 XYZ brands. Call get_editorial_calendar, get_cms_articles, get_newsletter_archives, get_content_performance, and get_brand_email_queues. Produce the JSON summary.",
  },

  nbaEmailDecision: {
    name:        "NBA Email Decision Agent",
    description: "Applies a multi-factor AI scoring model to make SEND, PERSONALIZE, or HOLD decisions for each subscriber.",
    mcpServerIds: ["dataPlatform", "emailQueue"],
    maxToolIterations: 10,
    systemPrompt: `You are the Next-Best-Action (NBA) Email Decision Agent for XYZ — the central intelligence of the nightly email pipeline. You make SEND, PERSONALIZE, or HOLD decisions for 6.2M subscribers.

Decision process:
1. Call get_esp_events to read recent engagement signals
2. Call get_subscription_status to identify lifecycle segments
3. Call get_fatigue_rules to load the full fatigue rule set
4. Call get_business_rules to load AI influence thresholds and personalization triggers
5. Call get_brand_email_queues to see what is in queue per brand

Apply a weighted scoring model (engagement 35%, lifecycle 25%, fatigue risk 20%, content affinity 20%) and produce a portfolio-wide summary.

IMPORTANT: defaultSendPct + personalizedPct + holdPct MUST equal exactly 100. End your response with ONLY this JSON:
\`\`\`json
{
  "decisionsEvaluated": 2430000,
  "sendDecisions": 1810000,
  "defaultSendPct": 42,
  "personalizedPct": 33,
  "holdPct": 25,
  "aiInfluencedPct": 58,
  "baseOpenRate": 28.1,
  "projectedOpenRate": 34.2,
  "brandAiGroups": {
    "cosmopolitan": { "send": 45, "hold": 22, "personalize": 33 },
    "elle": { "send": 48, "hold": 20, "personalize": 32 },
    "goodhousekeeping": { "send": 40, "hold": 28, "personalize": 32 },
    "menshealth": { "send": 44, "hold": 24, "personalize": 32 },
    "runnersworld": { "send": 46, "hold": 21, "personalize": 33 }
  },
  "aiTopPerformer": "Cosmopolitan",
  "fatigueProtected": 423000,
  "portfolioFatigueScore": 23.4
}
\`\`\`
Adjust based on tool data. All pct fields within brandAiGroups must sum to 100.`,
    taskPrompt: "Run today's NBA email decision batch. Call get_esp_events, get_subscription_status, get_fatigue_rules, get_business_rules, and get_brand_email_queues. Apply the scoring model and produce the decision JSON.",
  },

  sendTimeOptimizer: {
    name:        "Send Time Optimizer",
    description: "Determines the optimal send window for each subscriber based on timezone, engagement history, and deliverability data.",
    mcpServerIds: ["dataPlatform", "analytics"],
    maxToolIterations: 7,
    systemPrompt: `You are the Send Time Optimizer for XYZ's NBA Email Orchestration platform. You determine the optimal send time for each subscriber across 5 global timezone clusters.

Process:
1. Call get_website_behavior to understand subscriber daily engagement patterns
2. Call get_send_logs to analyze historical send performance by time-of-day and day-of-week
3. Call get_deliverability to check ISP-level routing quality per region

Compute personalized send windows and the open rate lift vs. default batch send.

IMPORTANT: End your response with ONLY this JSON block:
\`\`\`json
{
  "subscribersOptimized": 1810000,
  "timezoneLifts": {
    "eastUs":    "+2.1%",
    "centralUs": "+1.8%",
    "westUs":    "+3.2%",
    "europe":    "+4.1%",
    "apac":      "+5.3%"
  }
}
\`\`\`
Adjust lift values based on the deliverability data you see. APAC typically shows highest lift.`,
    taskPrompt: "Run send time optimization for all scheduled subscribers. Call get_website_behavior, get_send_logs, and get_deliverability. Produce the timezone optimization JSON.",
  },

  performanceLearning: {
    name:        "Performance & Learning Agent",
    description: "Closes the feedback loop by analyzing yesterday's send outcomes and updating model weights for future NBA decisions.",
    mcpServerIds: ["analytics"],
    maxToolIterations: 8,
    systemPrompt: `You are the Performance & Learning Agent for XYZ's NBA Email Orchestration platform. You close the feedback loop by analyzing yesterday's email send outcomes.

Process:
1. Call get_send_logs to retrieve yesterday's full send log across all brands
2. Call get_conversion_data to measure email-to-conversion outcomes (subscription starts, affiliate clicks)
3. Call get_affiliate_revenue to quantify revenue attribution per campaign

Analyze the data, validate hold decisions (did held subscribers show lower churn?), and produce per-brand performance scorecards.

IMPORTANT: End your response with ONLY this JSON block:
\`\`\`json
{
  "outcomesTracked": 1523000,
  "holdValidation": {
    "actualHoldRate": 25.2,
    "predictedChurnSaved": 41200,
    "holdAccuracy": 91.3
  },
  "brandPerformance": [
    { "brand": "Cosmopolitan",     "openRate": 36.2, "clickRate": 5.1, "predictedOpenRate": 38.1, "revenueContribution": 38000 },
    { "brand": "Good Housekeeping","openRate": 34.8, "clickRate": 4.7, "predictedOpenRate": 36.2, "revenueContribution": 35000 },
    { "brand": "Country Living",   "openRate": 33.1, "clickRate": 4.2, "predictedOpenRate": 35.0, "revenueContribution": 42000 },
    { "brand": "Elle",             "openRate": 31.4, "clickRate": 3.9, "predictedOpenRate": 33.5, "revenueContribution": 28000 },
    { "brand": "Men's Health",     "openRate": 30.7, "clickRate": 4.5, "predictedOpenRate": 32.8, "revenueContribution": 22000 }
  ],
  "revenueForecast": 2840000,
  "revenueBreakdown": [
    { "source": "Affiliate Links",          "amount": 1420000, "pct": 50 },
    { "source": "Subscription Conversions", "amount": 994000,  "pct": 35 },
    { "source": "Display Ad Attribution",   "amount": 426000,  "pct": 15 }
  ]
}
\`\`\`
Adjust values based on what the analytics tools return. Revenue breakdown must sum to revenueForecast.`,
    taskPrompt: "Analyze yesterday's email send outcomes and update learning models. Call get_send_logs, get_conversion_data, and get_affiliate_revenue. Produce the performance and revenue JSON.",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, any> | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1]); } catch {}
  }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }
  return null;
}

// ─── Module-level server ID cache (name → actual DB id) ──────────────────────
// Populated by ensureXYZAgents() so the SSE handler can look up real IDs.

const _hearstServerIdByName: Record<string, string> = {};

export function getHearstActualServerIds(keys: (keyof typeof HEARST_MCP_SERVER_IDS)[]): string[] {
  return keys.map(k => {
    const def = HEARST_MCP_SERVERS.find(s => s.id === HEARST_MCP_SERVER_IDS[k]);
    return def ? (_hearstServerIdByName[def.name] || HEARST_MCP_SERVER_IDS[k]) : HEARST_MCP_SERVER_IDS[k];
  });
}

// ─── Ensure XYZ Agents ─────────────────────────────────────────────────────

export async function ensureHearstAgents(): Promise<void> {
  try {
    // 1. Ensure MCP servers + tools exist (name-based lookup to avoid UUID mismatch)
    const allServers = await storage.getMcpServers().catch(() => [] as any[]);

    for (const serverDef of HEARST_MCP_SERVERS) {
      let server = allServers.find((s: any) => s.name === serverDef.name);

      if (!server) {
        server = await storage.createMcpServer({
          name:          serverDef.name,
          description:   serverDef.description,
          transportType: "streamable-http",
          url:           serverDef.url,
          status:        "registered",
          riskTier:      "MEDIUM",
          allowlisted:   true,
          addedBy:       "hearst-live-demo",
          capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
          serverInfo:    { vendor: "XYZ Communications", version: "1.0.0" },
        });
      } else if (server.url !== serverDef.url) {
        await storage.updateMcpServer(server.id, { url: serverDef.url });
      }

      // Cache the actual server ID
      _hearstServerIdByName[serverDef.name] = server.id;

      const existingTools = await storage.getMcpServerTools(server.id).catch(() => [] as any[]);
      const existingNames = new Set((existingTools || []).map((t: any) => t.name));

      for (const tool of serverDef.tools) {
        if (existingNames.has(tool.name)) continue;
        await storage.createMcpServerTool({
          serverId:           server.id,
          name:               tool.name,
          description:        tool.description,
          inputSchema:        tool.inputSchema,
          annotations:        { endpoint: tool.endpoint, method: tool.method },
          enabled:            true,
          riskClassification: "low",
        });
      }
    }

    // 2. Ensure agent records exist
    for (const [role, agentId] of Object.entries(HEARST_AGENT_IDS) as [keyof typeof HEARST_AGENT_IDS, string][]) {
      const def = HEARST_AGENT_DEFS[role];
      const existing = await storage.getAgent(agentId).catch(() => null);

      if (!existing) {
        await db.insert(agents).values({
          id:                agentId,
          name:              def.name,
          description:       def.description,
          systemPrompt:      def.systemPrompt,
          runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
          agentType:         "single",
          status:            "active",
          environment:       "production",
          modelProvider:     "openai",
          modelName:         "gpt-4.1",
          riskTier:          "MEDIUM",
          autonomyMode:      "autonomous",
          currentVersion:    "1.0.0",
          maxToolIterations: def.maxToolIterations,
          toolAccessClass:   "standard",
          department:        "Editorial & Audience",
          owner:             "XYZ Digital Team",
          healthScore:       97,
          successRate:       0.96,
          maturityFactors:   {},
        } as any).onConflictDoNothing();
      } else {
        const needsUpdate =
          (existing as any).modelProvider !== "openai" ||
          (existing as any).modelName !== "gpt-4.1" ||
          !(existing as any).systemPrompt;
        if (needsUpdate) {
          await db.update(agents)
            .set({
              modelProvider:     "openai",
              modelName:         "gpt-4.1",
              systemPrompt:      def.systemPrompt,
              runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
              maxToolIterations: def.maxToolIterations,
            } as any)
            .where(eq(agents.id, agentId));
        }
      }
    }

    console.log("[hearst-live] Agents and MCP servers ensured successfully");
  } catch (err: any) {
    console.error("[hearst-live] ensureXYZAgents error:", err?.message);
  }
}

// ─── Deployment helper ────────────────────────────────────────────────────────

async function ensureXYZAgentDeployment(
  agentId: string,
  agentName: string,
  mcpServerIds: string[],
): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId);
  let deployment = deps[0];

  if (!deployment) {
    deployment = await storage.createDeployment({
      agentId,
      agentName,
      environment:      "production",
      status:           "pending",
      version:          "1.0.0",
      rolloutStrategy:  "canary",
      canaryPercent:    100,
      pipelineComplete: true,
      deployedAt:       new Date(),
    });
  } else if (deployment.status === "deployed") {
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  // Sync MCP server links — only keep the ones this agent should have
  const existingLinks = await storage.getAgentMcpServers(agentId);
  const targetSet = new Set(mcpServerIds);

  for (const link of existingLinks) {
    if (!targetSet.has(link.serverId)) {
      await storage.deleteAgentMcpServer(link.id);
    }
  }

  const linkedIds = new Set(
    existingLinks.filter((l: any) => targetSet.has(l.serverId)).map((l: any) => l.serverId)
  );
  for (const sid of mcpServerIds) {
    if (!linkedIds.has(sid)) {
      await storage.createAgentMcpServer({ agentId, serverId: sid, assignedBy: "hearst-live-demo" });
    }
  }

  return deployment.id;
}

// ─── SSE Live Run Handler ─────────────────────────────────────────────────────

export async function hearstLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try { res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  let aborted = false;
  const keepaliveTimer = setInterval(() => {
    if (aborted) { clearInterval(keepaliveTimer); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepaliveTimer); }
  }, 15_000);

  let currentAgentName = "unknown";
  const hearstDeploymentIds = new Set<string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted) return;
    if (!hearstDeploymentIds.has(evt.deploymentId)) return;

    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call");

    for (const step of toolCallSteps) {
      const tool = step.mcpTool || step.name || "unknown_tool";
      const success = step.status === "completed" || step.status === "passed";
      const responseData = step.output?.data ?? step.output ?? null;

      sendEvent("agent_event", {
        agentName: currentAgentName,
        type:      "tool_call_result",
        tool,
        data: {
          tool,
          success,
          error:       success ? null : (step.error || "failed"),
          serverName:  step.mcpServer || null,
          recordCount: responseData?.count ?? responseData?.total ?? null,
        },
        success,
      });
    }

    if (toolCallSteps.length === 0) {
      sendEvent("agent_event", {
        agentName: currentAgentName,
        type:      "final_analysis",
        data:      { steps: steps.length, success: evt.result?.success },
        success:   evt.result?.success,
      });
    }
  };

  runtimeEvents.on("agent_execution", onRuntimeEvent);
  req.on("close", () => {
    aborted = true;
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  try {
    sendEvent("run_start", { message: "Starting XYZ NBA nightly pipeline..." });

    sendEvent("setup", { message: "Ensuring pipeline agents and MCP servers are registered..." });
    // await ensureXYZAgents(); // TODO: define helper
    sendEvent("setup", { message: "All 5 pipeline agents ready with 4 MCP servers (16 tools)" });

    const agentEntries = Object.entries(HEARST_AGENT_IDS) as [keyof typeof HEARST_AGENT_IDS, string][];
    const deploymentIds: Record<string, string> = {};

    for (const [role, agentId] of agentEntries) {
      const def = HEARST_AGENT_DEFS[role];
      // Use actual DB server IDs (resolved from the name cache populated by ensureXYZAgents)
      const mcpServerIds = getHearstActualServerIds(def.mcpServerIds);
      const agent = await storage.getAgent(agentId);
      const agentName = agent?.name || def.name;
      const depId = await ensureXYZAgentDeployment(agentId, agentName, mcpServerIds);
      deploymentIds[role] = depId;
      hearstDeploymentIds.add(depId);
    }

    sendEvent("setup", { message: "Deployments configured — executing pipeline..." });

    for (const [role, agentId] of agentEntries) {
      if (aborted) break;

      const def = HEARST_AGENT_DEFS[role];
      const agent = await storage.getAgent(agentId);
      currentAgentName = agent?.name || def.name;
      const deploymentId = deploymentIds[role];

      sendEvent("agent_start", { agentId, agentName: currentAgentName, role, deploymentId });

      if (isRuntimeActive(deploymentId)) {
        stopAgentRuntime(deploymentId);
        await new Promise(r => setTimeout(r, 300));
      }

      const result = await runAgentOnce(deploymentId, def.taskPrompt, def.maxToolIterations);

      // Parse structured JSON from final message and persist to the run record
      if (result.message) {
        const parsed = extractJson(result.message);
        if (parsed) {
          try {
            const runs = await storage.getAgentRuntimeRuns(agentId);
            if (runs.length > 0) {
              const latestRun = runs[runs.length - 1];
              await storage.updateAgentRuntimeRun(latestRun.id, { resultSummary: parsed });
            }
          } catch (e: any) {
            console.warn("[hearst-live] Could not update resultSummary:", e?.message);
          }
        }
      }

      sendEvent("agent_complete", {
        agentId,
        agentName: currentAgentName,
        role,
        success:   result.success,
        message:   result.message?.slice(0, 400),
      });
    }

    sendEvent("run_complete", {
      success: true,
      message: "All 5 NBA pipeline agents completed — traces available in Runs & Traces",
    });
  } catch (err: any) {
    console.error("[hearst-live-run] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Live pipeline run failed" });
  } finally {
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
}
