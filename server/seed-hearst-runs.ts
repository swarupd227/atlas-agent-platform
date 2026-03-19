/**
 * Hearst NBA Email Orchestration — Agent Run Seeder
 *
 * Creates real platform records (agent_runtime_runs, run_traces, trace_spans)
 * for the 5 Hearst agents. Called lazily from the demo API routes — if runs
 * already exist within 48h, this is a no-op.
 *
 * The underlying data the agents worked on (subscriber events, CMS articles,
 * etc.) is realistic/simulated, but every agent identity, run timestamp, run
 * status, tool call, and decision record lives in the real platform DB tables.
 */

import { storage } from "./storage";

const AGENTS = {
  subscriberProfileEngine: "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d",
  contentInventory: "92584a77-d150-4436-9083-a108584bc021",
  nbaEmailDecision: "151db72c-0038-4f01-a4bb-45650a82e8b6",
  sendTimeOptimizer: "7de4167e-6b0c-4f04-9fcf-3693bda1d255",
  performanceLearning: "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d",
} as const;

const MCP_SERVERS = {
  dataPlatform: { id: "087a3dd1-9f39-4a03-a3cf-af6ec3458cde", name: "Hearst Data Platform MCP Server" },
  cms: { id: "7bef66a7-25fd-4aca-afa0-d70c80ee5d28", name: "Hearst CMS MCP Server" },
  emailQueue: { id: "12957574-8fea-4060-a05e-87bd779da5c9", name: "Hearst Email Queue MCP Server" },
  analytics: { id: "1a24362d-f0eb-4b52-8d47-067b0408494f", name: "Hearst Analytics MCP Server" },
} as const;

type McpServerKey = keyof typeof MCP_SERVERS;

function hoursAgo(h: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d;
}

function daysAgo(days: number, hour = 0, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Returns true if this agent was seeded within the last 48 hours.
 *
 * Checks `completedAt >= now - 48h` (matching the spec) and only counts
 * `status = "completed"` rows so that in-flight or failed runs do not block
 * a required seed. All 5 seeded agents use `completedAt` within the last 48h
 * (set to realistic times today), so the window remains valid across the full
 * pipeline regardless of cadence (daily vs. weekly).
 */
async function hasRecentlySeeded(agentId: string): Promise<boolean> {
  const runs = await storage.getAgentRuntimeRuns(agentId);
  if (!runs.length) return false;
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return runs.some(
    r =>
      r.status === "completed" &&
      r.completedAt &&
      new Date(r.completedAt).getTime() > cutoff,
  );
}

async function createSpans(
  runId: string,
  tools: { server: McpServerKey; tool: string; durationMs: number; attributes?: Record<string, unknown> }[],
  baseTime: Date
): Promise<void> {
  let offset = 0;
  for (const t of tools) {
    const srv = MCP_SERVERS[t.server];
    const startedAt = new Date(baseTime.getTime() + offset);
    offset += t.durationMs + 120;
    const endedAt = new Date(baseTime.getTime() + offset);
    await storage.createTraceSpan({
      runId,
      spanName: `tools/${t.tool}`,
      spanKind: "client",
      invocationType: "mcp_tool",
      mcpMethod: "tools/call",
      mcpServerId: srv.id,
      mcpServerName: srv.name,
      mcpToolName: t.tool,
      status: "ok",
      durationMs: t.durationMs,
      attributes: t.attributes || {},
      startedAt,
      endedAt,
    });
  }
}

export async function seedHearstAgentRuns(): Promise<void> {
  try {
    const allReady = await Promise.all([
      hasRecentlySeeded(AGENTS.subscriberProfileEngine),
      hasRecentlySeeded(AGENTS.contentInventory),
      hasRecentlySeeded(AGENTS.nbaEmailDecision),
      hasRecentlySeeded(AGENTS.sendTimeOptimizer),
      hasRecentlySeeded(AGENTS.performanceLearning),
    ]);
    if (allReady.every(Boolean)) return;

    await seedProfileEngine();
    await seedContentInventory();
    await seedNBADecisionAgent();
    await seedSendTimeOptimizer();
    await seedPerformanceLearning();
  } catch (err) {
    console.error("[Hearst seed] Error seeding agent runs:", err);
  }
}

async function seedProfileEngine(): Promise<void> {
  if (await hasRecentlySeeded(AGENTS.subscriberProfileEngine)) return;

  const startedAt = daysAgo(0, 2, 4);
  const completedAt = daysAgo(0, 2, 47);
  const latencyMs = completedAt.getTime() - startedAt.getTime();

  const run = await storage.createAgentRuntimeRun({
    agentId: AGENTS.subscriberProfileEngine,
    status: "completed",
    triggerType: "scheduled",
    resultSummary: {
      subscribersProcessed: 6220000,
      profilesRefreshed: 6220000,
      newFatigueAlerts: 84200,
      lifecycleUpdates: 12400,
      avgAffinityVectors: 8,
    },
    inputConfig: { schedule: "0 2 * * *", environment: "production" },
    latencyMs,
    completedAt,
  });

  const trace = await storage.createTrace({
    agentId: AGENTS.subscriberProfileEngine,
    environment: "prod",
    status: "completed",
    latencyMs,
    inputSummary: "Nightly batch: refresh 6.2M subscriber profiles across 8 Hearst brands",
    outputSummary: "6,220,000 profiles refreshed · 84,200 new fatigue alerts · 12,400 lifecycle updates",
    modelId: "claude-3-5-sonnet-20241022",
    toolCalls: [
      { tool: "get_esp_events", server: "Hearst Data Platform MCP Server", calls: 6220000, duration_ms: 1840000 },
      { tool: "get_website_behavior", server: "Hearst Data Platform MCP Server", calls: 6220000, duration_ms: 920000 },
      { tool: "get_subscription_status", server: "Hearst Data Platform MCP Server", calls: 6220000, duration_ms: 340000 },
      { tool: "get_demographic_data", server: "Hearst Data Platform MCP Server", calls: 6220000, duration_ms: 480000 },
    ],
    decisions: {
      profilesRefreshed: 6220000,
      fatigueAlertsRaised: 84200,
      lifecycleStageTransitions: 12400,
    },
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    startedAt,
    endedAt: completedAt,
  });

  await createSpans(trace.id, [
    { server: "dataPlatform", tool: "get_esp_events", durationMs: 1840000, attributes: { records: 6220000, source: "Salesforce Marketing Cloud" } },
    { server: "dataPlatform", tool: "get_website_behavior", durationMs: 920000, attributes: { records: 6220000, source: "Adobe Analytics" } },
    { server: "dataPlatform", tool: "get_subscription_status", durationMs: 340000, attributes: { records: 6220000 } },
    { server: "dataPlatform", tool: "get_demographic_data", durationMs: 480000, attributes: { records: 6220000, source: "Experian/Acxiom" } },
  ], startedAt);
}

async function seedContentInventory(): Promise<void> {
  if (await hasRecentlySeeded(AGENTS.contentInventory)) return;

  const startedAt = daysAgo(0, 6, 12);
  const completedAt = daysAgo(0, 6, 19);
  const latencyMs = completedAt.getTime() - startedAt.getTime();

  const run = await storage.createAgentRuntimeRun({
    agentId: AGENTS.contentInventory,
    status: "completed",
    triggerType: "scheduled",
    resultSummary: {
      brandsScanned: 8,
      articlesScored: 312,
      emailSendable: 47,
      freshItems: 23,
      deprecatedItems: 12,
    },
    inputConfig: { schedule: "0 6 * * *", environment: "production" },
    latencyMs,
    completedAt,
  });

  const trace = await storage.createTrace({
    agentId: AGENTS.contentInventory,
    environment: "prod",
    status: "completed",
    latencyMs,
    inputSummary: "Daily content catalog refresh across 8 Hearst brands",
    outputSummary: "312 articles scored · 47 email-sendable · 23 fresh · top content: Elle career, GH wellness, MH fitness",
    modelId: "claude-3-5-sonnet-20241022",
    toolCalls: [
      { tool: "get_editorial_calendar", server: "Hearst CMS MCP Server", calls: 8, duration_ms: 1200 },
      { tool: "get_cms_articles", server: "Hearst CMS MCP Server", calls: 312, duration_ms: 84000 },
      { tool: "get_content_performance", server: "Hearst CMS MCP Server", calls: 312, duration_ms: 62000 },
      { tool: "get_newsletter_archives", server: "Hearst CMS MCP Server", calls: 8, duration_ms: 3400 },
      { tool: "get_brand_email_queues", server: "Hearst Email Queue MCP Server", calls: 8, duration_ms: 2100 },
    ],
    decisions: {
      articlesScored: 312,
      emailSendable: 47,
      topCandidates: [
        { title: "5 Morning Habits That Actually Boost Productivity", brand: "Good Housekeeping", score: 0.91 },
        { title: "The 12 Career Moves That Separate Good from Great", brand: "Elle", score: 0.88 },
        { title: "7-Day Gut Reset That Actually Works", brand: "Men's Health", score: 0.84 },
        { title: "Your Fall Fashion Exclusive Preview", brand: "Harper's Bazaar", score: 0.96 },
      ],
    },
    tokenUsage: { promptTokens: 142000, completionTokens: 28000, totalTokens: 170000 },
    startedAt,
    endedAt: completedAt,
  });

  await createSpans(trace.id, [
    { server: "cms", tool: "get_editorial_calendar", durationMs: 1200, attributes: { brands: 8 } },
    { server: "cms", tool: "get_cms_articles", durationMs: 84000, attributes: { articlesScanned: 312, brands: 8 } },
    { server: "cms", tool: "get_content_performance", durationMs: 62000, attributes: { articlesScored: 312 } },
    { server: "cms", tool: "get_newsletter_archives", durationMs: 3400, attributes: { editions: 64 } },
    { server: "emailQueue", tool: "get_brand_email_queues", durationMs: 2100, attributes: { brands: 8, pendingCampaigns: 24 } },
  ], startedAt);
}

async function seedNBADecisionAgent(): Promise<void> {
  if (await hasRecentlySeeded(AGENTS.nbaEmailDecision)) return;

  const batchStartedAt = daysAgo(0, 6, 45);
  const batchCompletedAt = daysAgo(0, 7, 28);
  const batchLatencyMs = batchCompletedAt.getTime() - batchStartedAt.getTime();

  await storage.createAgentRuntimeRun({
    agentId: AGENTS.nbaEmailDecision,
    status: "completed",
    triggerType: "scheduled",
    resultSummary: {
      decisionsEvaluated: 2430000,
      sendDecisions: 1810000,
      holdDecisions: 620000,
      holdRate: 25.5,
      avgNbEmailScore: 0.58,
      holdThreshold: 0.25,
    },
    inputConfig: { schedule: "0 2 * * *", environment: "production" },
    latencyMs: batchLatencyMs,
    completedAt: batchCompletedAt,
  });

  const personas = [
    {
      id: "sarah-m",
      name: "Sarah M.",
      decision: "SEND",
      brand: "Good Housekeeping",
      subject: "5 Morning Habits That Actually Boost Productivity",
      sendTime: "7:12 AM ET",
      nbEmailScore: 0.74,
      factors: [
        { label: "content_affinity (w1=0.25)", score: 0.92, contribution: 0.23, detail: "Wellness + career crossover matches top 2 interest clusters" },
        { label: "recency_novelty (w2=0.15)", score: 0.81, contribution: 0.12, detail: "Fresh content, not seen in prior 14 days" },
        { label: "brand_affinity (w3=0.15)", score: 0.88, contribution: 0.13, detail: "GH: opened 4 of last 5 emails" },
        { label: "revenue_potential (w4=0.20)", score: 0.71, contribution: 0.14, detail: "Article includes upgrade prompt (38% conversion history)" },
        { label: "fatigue_cost (w5=0.15)", score: -0.12, contribution: -0.02, detail: "Received 1 email this week — low fatigue" },
        { label: "cannibalization_cost (w6=0.10)", score: -0.08, contribution: -0.01, detail: "No competing GH content scheduled tomorrow" },
      ],
      healthScore: 84,
      fatigueScore: 0.18,
      candidatesScored: 47,
      holdReason: null,
    },
    {
      id: "marcus-t",
      name: "Marcus T.",
      decision: "HOLD",
      brand: null,
      subject: null,
      sendTime: null,
      nbEmailScore: 0.19,
      factors: [
        { label: "content_affinity (w1=0.25)", score: 0.42, contribution: 0.11, detail: "Some fitness content matches Runner's World interest" },
        { label: "recency_novelty (w2=0.15)", score: 0.38, contribution: 0.06, detail: "Content partially seen 8 days ago" },
        { label: "brand_affinity (w3=0.15)", score: 0.22, contribution: 0.03, detail: "Esquire + Men's Health: low recent engagement (21d / 14d)" },
        { label: "revenue_potential (w4=0.20)", score: 0.18, contribution: 0.04, detail: "Free tier — limited monetization signals" },
        { label: "fatigue_cost (w5=0.15)", score: -0.61, contribution: -0.09, detail: "At-risk subscribers respond poorly to high-volume sends" },
        { label: "cannibalization_cost (w6=0.10)", score: -0.24, contribution: -0.02, detail: "Fatigue risk higher than content value" },
      ],
      healthScore: 38,
      fatigueScore: 0.71,
      candidatesScored: 47,
      holdReason: "Score 0.19 below HOLD threshold 0.25. Subscriber shows at-risk signals — sending today risks accelerating unsubscribe. HOLD protects tomorrow's engagement window.",
    },
    {
      id: "jennifer-k",
      name: "Jennifer K.",
      decision: "HOLD",
      brand: null,
      subject: null,
      sendTime: null,
      nbEmailScore: 0.22,
      factors: [
        { label: "content_affinity (w1=0.25)", score: 0.71, contribution: 0.18, detail: "High beauty affinity matches available content" },
        { label: "recency_novelty (w2=0.15)", score: 0.68, contribution: 0.10, detail: "Fresh content across HB and Elle" },
        { label: "brand_affinity (w3=0.15)", score: 0.88, contribution: 0.13, detail: "All 5 opted-in brands show HIGH engagement" },
        { label: "revenue_potential (w4=0.20)", score: 0.74, contribution: 0.15, detail: "Premium subscriber — high LTV conversion potential" },
        { label: "fatigue_cost (w5=0.15)", score: -0.82, contribution: -0.12, detail: "Already received 4 emails this week — at weekly cap" },
        { label: "cannibalization_cost (w6=0.10)", score: -0.41, contribution: -0.04, detail: "HB fall fashion exclusive drops tomorrow — higher score predicted" },
      ],
      healthScore: 91,
      fatigueScore: 0.88,
      candidatesScored: 47,
      holdReason: "VIP subscriber has hit weekly email cap. Harper's Bazaar fall fashion exclusive tomorrow will score significantly higher. Protecting tomorrow's engagement.",
    },
  ];

  for (const persona of personas) {
    const startedAt = new Date(batchStartedAt.getTime() + Math.random() * 1200000);
    const completedAt = new Date(startedAt.getTime() + 340 + Math.random() * 200);
    const latencyMs = completedAt.getTime() - startedAt.getTime();

    const trace = await storage.createTrace({
      agentId: AGENTS.nbaEmailDecision,
      environment: "prod",
      status: "completed",
      latencyMs,
      inputSummary: `NBA email decision for subscriber ${persona.id} (${persona.name})`,
      outputSummary: persona.decision === "SEND"
        ? `SEND — ${persona.brand}: "${persona.subject}" at ${persona.sendTime} · NBEmail_Score ${persona.nbEmailScore}`
        : `HOLD — Score ${persona.nbEmailScore} below threshold 0.25 · ${persona.holdReason}`,
      modelId: "claude-3-5-sonnet-20241022",
      promptInputs: {
        subscriberId: persona.id,
        subscriberName: persona.name,
        healthScore: persona.healthScore,
        fatigueScore: persona.fatigueScore,
        candidateEmailsCount: persona.candidatesScored,
      },
      toolCalls: [
        { tool: "get_fatigue_rules", server: "Hearst Email Queue MCP Server", calls: 1 },
        { tool: "get_business_rules", server: "Hearst Email Queue MCP Server", calls: 1 },
        { tool: "get_brand_email_queues", server: "Hearst Email Queue MCP Server", calls: 8 },
      ],
      decisions: {
        action: persona.decision,
        nbEmailScore: persona.nbEmailScore,
        holdThreshold: 0.25,
        winningEmail: persona.decision === "SEND" ? {
          brand: persona.brand,
          subject: persona.subject,
          sendTime: persona.sendTime,
        } : null,
        holdReason: persona.holdReason,
        scoringFactors: persona.factors,
        candidatesEvaluated: persona.candidatesScored,
      },
      tokenUsage: { promptTokens: 4200, completionTokens: 820, totalTokens: 5020 },
      startedAt,
      endedAt: completedAt,
    });

    await createSpans(trace.id, [
      { server: "emailQueue", tool: "get_fatigue_rules", durationMs: 48, attributes: { subscriberId: persona.id, fatigueScore: persona.fatigueScore } },
      { server: "emailQueue", tool: "get_business_rules", durationMs: 31, attributes: { subscriberId: persona.id } },
      { server: "emailQueue", tool: "get_brand_email_queues", durationMs: 92, attributes: { subscriberId: persona.id, candidateEmails: persona.candidatesScored } },
    ], startedAt);
  }
}

async function seedSendTimeOptimizer(): Promise<void> {
  if (await hasRecentlySeeded(AGENTS.sendTimeOptimizer)) return;

  const startedAt = daysAgo(0, 3, 2);
  const completedAt = daysAgo(0, 3, 47);
  const latencyMs = completedAt.getTime() - startedAt.getTime();

  const run = await storage.createAgentRuntimeRun({
    agentId: AGENTS.sendTimeOptimizer,
    status: "completed",
    triggerType: "scheduled",
    resultSummary: {
      subscribersOptimized: 6220000,
      uniqueSendWindows: 4320,
      avgWindowMs: 845,
      peakHour: 7,
      peakDow: "Tuesday",
    },
    inputConfig: { schedule: "0 3 * * 0", environment: "production" },
    latencyMs,
    completedAt,
  });

  const trace = await storage.createTrace({
    agentId: AGENTS.sendTimeOptimizer,
    environment: "prod",
    status: "completed",
    latencyMs,
    inputSummary: "Weekly send time recomputation for 6.2M subscribers",
    outputSummary: "6,220,000 personalized send windows computed · peak: Tue 7am ET · 4,320 unique time slots",
    modelId: "claude-3-5-sonnet-20241022",
    toolCalls: [
      { tool: "get_esp_events", server: "Hearst Data Platform MCP Server", calls: 6220000, duration_ms: 1200000 },
      { tool: "get_send_logs", server: "Hearst Analytics MCP Server", calls: 6220000, duration_ms: 840000 },
    ],
    decisions: {
      subscribersOptimized: 6220000,
      uniqueSendWindows: 4320,
      topWindow: "Tue 7:00–8:15 AM local",
    },
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    startedAt,
    endedAt: completedAt,
  });

  await createSpans(trace.id, [
    { server: "dataPlatform", tool: "get_esp_events", durationMs: 1200000, attributes: { records: 6220000, lookbackDays: 180 } },
    { server: "analytics", tool: "get_send_logs", durationMs: 840000, attributes: { records: 6220000, lookbackDays: 180 } },
  ], startedAt);
}

async function seedPerformanceLearning(): Promise<void> {
  if (await hasRecentlySeeded(AGENTS.performanceLearning)) return;

  const startedAt = daysAgo(0, 4, 1);
  const completedAt = daysAgo(0, 4, 28);
  const latencyMs = completedAt.getTime() - startedAt.getTime();

  const run = await storage.createAgentRuntimeRun({
    agentId: AGENTS.performanceLearning,
    status: "completed",
    triggerType: "scheduled",
    resultSummary: {
      outcomesTracked: 1810000,
      modelWeightsUpdated: true,
      anomaliesDetected: 2,
      avgOpenRateLift: 0.217,
      holdStrategyValidated: true,
    },
    inputConfig: { schedule: "0 4 * * 1", environment: "production" },
    latencyMs,
    completedAt,
  });

  const trace = await storage.createTrace({
    agentId: AGENTS.performanceLearning,
    environment: "prod",
    status: "completed",
    latencyMs,
    inputSummary: "Weekly learning cycle: track 1.81M send outcomes, update model weights",
    outputSummary: "1,810,000 outcomes tracked · avg open-rate lift +21.7% · 2 anomalies detected · model weights updated",
    modelId: "claude-3-5-sonnet-20241022",
    toolCalls: [
      { tool: "get_send_logs", server: "Hearst Analytics MCP Server", calls: 1, duration_ms: 124000 },
      { tool: "get_conversion_data", server: "Hearst Analytics MCP Server", calls: 1, duration_ms: 84000 },
      { tool: "get_deliverability_metrics", server: "Hearst Analytics MCP Server", calls: 8, duration_ms: 14000 },
      { tool: "get_affiliate_revenue", server: "Hearst Analytics MCP Server", calls: 1, duration_ms: 22000 },
    ],
    decisions: {
      outcomesTracked: 1810000,
      openRateLift: 0.217,
      modelWeightsUpdated: true,
      anomalies: [
        { brand: "Esquire", metric: "Open Rate", actual: "19.2%", baseline: "21.8%", severity: "warning" },
        { brand: "Country Living", metric: "Affiliate CTR", actual: "4.8%", baseline: "3.7%", severity: "info" },
      ],
    },
    tokenUsage: { promptTokens: 88000, completionTokens: 12000, totalTokens: 100000 },
    startedAt,
    endedAt: completedAt,
  });

  await createSpans(trace.id, [
    { server: "analytics", tool: "get_send_logs", durationMs: 124000, attributes: { outcomesTracked: 1810000 } },
    { server: "analytics", tool: "get_conversion_data", durationMs: 84000, attributes: { conversionEvents: 42300 } },
    { server: "analytics", tool: "get_deliverability_metrics", durationMs: 14000, attributes: { brands: 8 } },
    { server: "analytics", tool: "get_affiliate_revenue", durationMs: 22000, attributes: { totalRevenue: 142000 } },
  ], startedAt);
}
