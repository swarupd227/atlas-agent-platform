/**
 * Hearst NBA Email Orchestration — Agent Run Seeder
 *
 * Creates real platform records (agent_runtime_runs, run_traces, trace_spans)
 * for the 5 Hearst agents. Called lazily from the demo API routes — if runs
 * already exist within 48h at the current seed version, this is a no-op.
 *
 * The underlying data the agents worked on (subscriber events, CMS articles,
 * etc.) is realistic/simulated, but every agent identity, run timestamp, run
 * status, tool call, and decision record lives in the real platform DB tables.
 *
 * Seed version bump forces re-seed with enriched fields:
 *   v2 — added aiInfluencedPct breakdown (NBA), alternativesConsidered (NBA
 *        per-persona traces), timezoneLifts (Send Time Optimizer),
 *        holdValidation + brandPerformance (Performance & Learning).
 */

import { storage } from "./storage";

const HEARST_SEED_VERSION = 3;

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

function daysAgo(days: number, hour = 0, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
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

/**
 * Returns true if the most recent completed run for this agent was seeded
 * at the current HEARST_SEED_VERSION. Older runs missing the seedVersion
 * field (or with a lower version) will return false, triggering a re-seed.
 */
async function hasIntactSeed(agentId: string): Promise<boolean> {
  const runs = await storage.getAgentRuntimeRuns(agentId);
  if (!runs.length) return false;

  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const recentRuns = runs.filter(
    r =>
      r.status === "completed" &&
      r.completedAt &&
      new Date(r.completedAt).getTime() > cutoff,
  );
  if (!recentRuns.length) return false;

  // Version gate: latest run must carry the current seed version
  const latest = recentRuns[recentRuns.length - 1];
  if ((latest.inputConfig as any)?.seedVersion !== HEARST_SEED_VERSION) return false;

  // Must also have at least one trace
  const traces = await storage.getRecentCompletedTracesByAgent(agentId, 1);
  return traces.length > 0;
}

export async function seedHearstAgentRuns(): Promise<void> {
  try {
    const allReady = await Promise.all([
      hasIntactSeed(AGENTS.subscriberProfileEngine),
      hasIntactSeed(AGENTS.contentInventory),
      hasIntactSeed(AGENTS.nbaEmailDecision),
      hasIntactSeed(AGENTS.sendTimeOptimizer),
      hasIntactSeed(AGENTS.performanceLearning),
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
  if (await hasIntactSeed(AGENTS.subscriberProfileEngine)) return;

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
    inputConfig: { schedule: "0 2 * * *", environment: "production", seedVersion: HEARST_SEED_VERSION },
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
  if (await hasIntactSeed(AGENTS.contentInventory)) return;

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
    inputConfig: { schedule: "0 6 * * *", environment: "production", seedVersion: HEARST_SEED_VERSION },
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
  if (await hasIntactSeed(AGENTS.nbaEmailDecision)) return;

  const batchStartedAt = daysAgo(0, 6, 45);
  const batchCompletedAt = daysAgo(0, 7, 28);
  const batchLatencyMs = batchCompletedAt.getTime() - batchStartedAt.getTime();

  // Donut breakdown (v3): 3-slice consolidation
  const defaultSendPct = 42;
  const personalizedPct = 33;
  const holdPct = 25;
  const aiInfluencedPct = personalizedPct + holdPct; // 58
  const projectedOpenRate = 34.2;
  const baseOpenRate = 28.1;

  // Brand AI group breakdown seeded per brand for S2
  const brandAiGroups: Record<string, any[]> = {
    cosmo: [
      { label: "Receive planned Cosmo email", count: 338200, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 178000, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different Cosmo article (wellness focus)", count: 115900, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 85000, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 172900, type: "hold", color: "#EF4444" },
    ],
    elle: [
      { label: "Receive planned Elle email", count: 273600, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 154800, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different Elle article (career focus)", count: 104040, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 71400, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 116160, type: "hold", color: "#EF4444" },
    ],
    goodhousekeeping: [
      { label: "Receive planned GH email", count: 456000, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 194400, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different GH article (wellness focus)", count: 132000, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 88000, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 129600, type: "hold", color: "#EF4444" },
    ],
    harpersbazaar: [
      { label: "Receive planned HB email", count: 257400, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 122400, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different HB article (luxury focus)", count: 81600, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 51000, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 167600, type: "hold", color: "#EF4444" },
    ],
    menshealth: [
      { label: "Receive planned MH email", count: 295200, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 124800, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different MH article (nutrition focus)", count: 83200, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 64000, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 192800, type: "hold", color: "#EF4444" },
    ],
    countryliving: [
      { label: "Receive planned CL email", count: 360360, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 152380, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different CL article (home focus)", count: 101920, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 79040, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 256300, type: "hold", color: "#EF4444" },
    ],
    runnersworld: [
      { label: "Receive planned RW email", count: 182160, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 83880, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different RW article (training focus)", count: 50820, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 37800, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 65340, type: "hold", color: "#EF4444" },
    ],
    esquire: [
      { label: "Receive planned Esquire email", count: 143640, type: "planned", color: "#6366F1" },
      { label: "Same email — AI-optimized subject line", count: 60840, type: "subject-personalized", color: "#8B5CF6" },
      { label: "Different Esquire article (career focus)", count: 38760, type: "content-personalized", color: "#3B82F6" },
      { label: "Email from a different Hearst brand", count: 32680, type: "cross-brand", color: "#10B981" },
      { label: "HOLD — suppressed today", count: 104080, type: "hold", color: "#EF4444" },
    ],
  };

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
      aiInfluencedPct,
      defaultSendPct,
      personalizedPct,
      holdPct,
      projectedOpenRate,
      baseOpenRate,
      brandAiGroups,
      portfolioFatigueScore: 22,
    },
    inputConfig: { schedule: "0 2 * * *", environment: "production", seedVersion: HEARST_SEED_VERSION },
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
      alternativesConsidered: [
        {
          rank: 2,
          brand: "Cosmopolitan",
          subject: "10 Beauty Tips Every Woman Should Know",
          nbEmailScore: 0.41,
          lossReason: "Beauty affinity score 0.35 — well below Sarah's top interests (Wellness 0.88, Career 0.82). GH wellness × career crossover scored 0.33 higher.",
        },
        {
          rank: 3,
          brand: "Elle",
          subject: "The 12 Career Moves That Separate Good from Great",
          nbEmailScore: 0.68,
          lossReason: "Strong career match, but GH wellness + career crossover scored higher (0.74 vs 0.68). GH brand affinity also stronger — Sarah opened 4 of last 5 GH emails.",
        },
        {
          rank: 4,
          brand: "Good Housekeeping",
          subject: "The Home Workout Revolution",
          nbEmailScore: 0.65,
          lossReason: "Same brand as winner, lower content affinity. Morning habits article has 2.1× higher wellness × career crossover signal than general fitness content.",
        },
      ],
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
      alternativesConsidered: [
        {
          rank: 1,
          brand: "Runner's World",
          subject: "5 Training Plans for Your First Half Marathon",
          nbEmailScore: 0.19,
          lossReason: "Highest-scoring candidate but still below HOLD threshold (0.25). Fatigue cost dominates: at-risk subscriber with 3 low-engagement emails in 30 days.",
        },
        {
          rank: 2,
          brand: "Men's Health",
          subject: "The 4-Week Strength Foundation",
          nbEmailScore: 0.14,
          lossReason: "Low brand affinity — last Men's Health open 14 days ago with no click. Revenue potential low (free tier subscriber).",
        },
        {
          rank: 3,
          brand: "Esquire",
          subject: "Style Guide: The Fall Wardrobe Edit",
          nbEmailScore: 0.09,
          lossReason: "Lowest content affinity. Last Esquire open 21 days ago. No style or fashion interest signals in Marcus's affinity profile.",
        },
      ],
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
      alternativesConsidered: [
        {
          rank: 1,
          brand: "Harper's Bazaar",
          subject: "Fall Style Trends You'll Actually Wear",
          nbEmailScore: 0.22,
          lossReason: "Best available today but weekly email cap already hit (4 emails sent). HOLD — HB fall fashion exclusive tomorrow predicted to score 0.78+, protecting that engagement.",
        },
        {
          rank: 2,
          brand: "Elle",
          subject: "The Best Skincare Launches of September",
          nbEmailScore: 0.18,
          lossReason: "High beauty affinity but cannibalization risk — tomorrow's HB exclusive targets the same beauty interest cluster. Sending today would reduce tomorrow's open probability.",
        },
        {
          rank: 3,
          brand: "Cosmopolitan",
          subject: "The Dating Rules Gen Z Completely Ignores",
          nbEmailScore: 0.14,
          lossReason: "Relationship content has moderate affinity (0.79) but weekly cap exceeded. Any send today risks unsubscribe from over-saturation for this VIP subscriber.",
        },
      ],
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
        alternativesConsidered: persona.alternativesConsidered,
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
  if (await hasIntactSeed(AGENTS.sendTimeOptimizer)) return;

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
    inputConfig: { schedule: "0 3 * * 0", environment: "production", seedVersion: HEARST_SEED_VERSION },
    latencyMs,
    completedAt,
  });

  // Timezone lift data: baselineOpenRate = old 9am ET batch open rate per region
  // openRate = actual open rate after local-time personalization
  // liftPct = (openRate - baselineOpenRate) / baselineOpenRate * 100
  const timezoneLifts = [
    { zone: "US East",   abbr: "ET",   openRate: 36.2, baselineOpenRate: 28.1, liftPct: 28.8, peakHour: "7–8 AM",   sendCount: 680000, color: "#6366F1" },
    { zone: "US Central", abbr: "CT",  openRate: 33.8, baselineOpenRate: 27.1, liftPct: 24.7, peakHour: "7:30–8:30 AM", sendCount: 310000, color: "#8B5CF6" },
    { zone: "US West",   abbr: "PT",   openRate: 35.1, baselineOpenRate: 28.5, liftPct: 23.2, peakHour: "7–9 AM",   sendCount: 440000, color: "#3B82F6" },
    { zone: "Europe",    abbr: "CET",  openRate: 38.4, baselineOpenRate: 25.9, liftPct: 48.3, peakHour: "8–9 AM",   sendCount: 210000, color: "#10B981" },
    { zone: "APAC",      abbr: "AEDT", openRate: 31.2, baselineOpenRate: 24.8, liftPct: 25.8, peakHour: "8–10 AM",  sendCount: 170000, color: "#F59E0B" },
  ];

  const trace = await storage.createTrace({
    agentId: AGENTS.sendTimeOptimizer,
    environment: "prod",
    status: "completed",
    latencyMs,
    inputSummary: "Weekly send time recomputation for 6.2M subscribers",
    outputSummary: "6,220,000 personalized send windows computed · peak: Tue 7am ET · 4,320 unique time slots · Europe +48.3% lift",
    modelId: "claude-3-5-sonnet-20241022",
    toolCalls: [
      { tool: "get_esp_events", server: "Hearst Data Platform MCP Server", calls: 6220000, duration_ms: 1200000 },
      { tool: "get_send_logs", server: "Hearst Analytics MCP Server", calls: 6220000, duration_ms: 840000 },
    ],
    decisions: {
      subscribersOptimized: 6220000,
      uniqueSendWindows: 4320,
      topWindow: "Tue 7:00–8:15 AM local",
      timezoneLifts,
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
  if (await hasIntactSeed(AGENTS.performanceLearning)) return;

  const startedAt = daysAgo(0, 4, 1);
  const completedAt = daysAgo(0, 4, 28);
  const latencyMs = completedAt.getTime() - startedAt.getTime();

  // Hold validation: outcome data for held vs not-held subscribers (v3: aligned to talk track)
  const holdValidation = {
    heldNextDayOpenRate: 41.0,
    notHeldOpenRate: 29.0,
    heldRevenuePerSub: 2.84,
    notHeldRevenuePerSub: 1.92,
    unsubReductionPct: 50,
    preservedSubscribers: 12400,
    preservedRevenue: 186000,
  };

  // Per-brand performance data: predictedOpenRate derived from NBA model outputs
  // baselineOpenRate is the pre-Atlas default batch send open rate
  const brandPerformance = [
    { brand: "Cosmopolitan",   subscribers: 890000, aiGroupCount: 5, baselineOpenRate: 22.4, predictedOpenRate: 35.1, liftPct: 56.7 },
    { brand: "Good Housekeeping", subscribers: 740000, aiGroupCount: 5, baselineOpenRate: 23.1, predictedOpenRate: 33.8, liftPct: 46.3 },
    { brand: "Elle",           subscribers: 680000, aiGroupCount: 5, baselineOpenRate: 21.8, predictedOpenRate: 36.2, liftPct: 66.1 },
    { brand: "Harper's Bazaar", subscribers: 510000, aiGroupCount: 5, baselineOpenRate: 24.2, predictedOpenRate: 34.5, liftPct: 42.6 },
    { brand: "Men's Health",   subscribers: 620000, aiGroupCount: 5, baselineOpenRate: 22.8, predictedOpenRate: 31.9, liftPct: 39.9 },
    { brand: "Country Living", subscribers: 580000, aiGroupCount: 5, baselineOpenRate: 23.5, predictedOpenRate: 33.2, liftPct: 41.3 },
    { brand: "Runner's World", subscribers: 420000, aiGroupCount: 5, baselineOpenRate: 20.9, predictedOpenRate: 30.6, liftPct: 46.4 },
    { brand: "Esquire",        subscribers: 380000, aiGroupCount: 5, baselineOpenRate: 21.8, predictedOpenRate: 29.4, liftPct: 34.9 },
  ];

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
    inputConfig: { schedule: "0 4 * * 1", environment: "production", seedVersion: HEARST_SEED_VERSION },
    latencyMs,
    completedAt,
  });

  const trace = await storage.createTrace({
    agentId: AGENTS.performanceLearning,
    environment: "prod",
    status: "completed",
    latencyMs,
    inputSummary: "Weekly learning cycle: track 1.81M send outcomes, update model weights",
    outputSummary: "1,810,000 outcomes tracked · avg open-rate lift +21.7% · HOLD strategy validated · 2 anomalies detected · model weights updated",
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
      holdValidation,
      brandPerformance,
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
