import { Router } from "express";
import { hearstLiveRunHandler, ensureHearstAgents } from "../hearst-live-run";
import { fitchLiveRunHandler, ensureFitchAgents, getFitchPipelineAgentNames, getFitchAgentIdByName } from "../fitch-live-run";
import { seedPartnerPortalRegistry } from "../seed-blackrock2-partner-portal";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { runAgentOnce, isRuntimeActive, stopAgentRuntime, startAgentRuntime } from "../agent-runtime";
import { seedHearstAgentRuns } from "../seed-hearst-runs";

const router = Router();

  // Demo TTS narration endpoint — restricted to known narration texts only
  const ALLOWED_DEMO_NARRATIONS = new Set([
    "Every enterprise is racing to deploy AI agents. But here's the problem: building an agent takes a week. Running it safely in production — with compliance, governance, and reliability — takes months. And when it breaks at 3 AM? That's when the real cost hits. Nouse Agent Orchestrator solves this. It's the only platform where AI agents understand your industry from the first login, deploy from battle-tested templates in hours, and heal themselves when something goes wrong — with a full audit trail. Let me show you what this looks like for a real SaaS company running autonomous customer support.",
    "The very first thing Nouse Agent Orchestrator asks is: what's your industry? This isn't a settings page — it's an intelligence layer. When NovaBill selected Technology / SaaS, the platform auto-loaded 35 industry-specific agent skills, activated 38 SOC 2 controls, turned on GDPR and CCPA policies, and configured industry-standard terminology throughout the entire interface. No other platform does this. On AWS Bedrock, you start with a blank canvas. On LangChain, you start with code. On Nouse, you start with your industry already understood.",
    "This is the Outcome Dashboard — the first screen every user sees after login. No model names, no token counts, no infrastructure metrics. Just business results. NovaBill's support agent is resolving 73% of tickets autonomously, at 2.4 minutes per resolution, with a 4.3 customer satisfaction score. The margin is 84% — that's $112,000 in revenue at $18,000 cost this quarter. And the benchmark line tells NovaBill they're performing in the 82nd percentile compared to other SaaS companies on the platform. That's intelligence no standalone agent builder can offer.",
    "This is the Golden Repository — think of it as an app store for production-ready agents. NovaBill chose this L1 Support template. 73 companies have deployed it before them, which means the skills, the test cases, and the deployment pipeline have been refined across dozens of real-world environments. Inside: the agent blueprint, eight industry-specific skills, pre-wired connections to Zendesk and Stripe, SOC 2 governance baked in, 420 evaluation test cases, and a complete deployment pipeline with shadow replay and canary stages. NovaBill connected their systems and had a working agent in shadow testing within 3 hours.",
    "Here's the agent working in real time. A customer can't export invoices. Watch the steps: classified the intent in under a second, activated the right skill, searched the knowledge base, pulled the customer's browser info, identified a known Chrome issue, and sent the fix — 4.2 seconds, cost: less than two cents. The agent detected an email address in the ticket and auto-redacted it from logs. SOC 2 and GDPR compliance checks passed automatically. And the context budget at the bottom — the platform curates exactly 24,000 tokens of relevant knowledge, not a bloated 128K dump. Focused context, better answers.",
    "A customer wants a $2,400 refund. The agent did all the work: verified the seats, checked the billing history, calculated the policy-eligible refund of $864, and prepared a counter-offer. But it stopped. Two rules triggered: amount exceeds $100, and the customer is asking for more than policy allows. The agent did 95% of the work. A human makes the judgment call. And that Approve and Teach button? If the validator approves and clicks it, the platform learns: next time a similar case comes in, handle it autonomously. That's how NovaBill went from 85% to 91% autonomy in two months — the system earning trust one decision at a time.",
    "Tuesday, 3 AM. Nobody is awake. The platform detects the resolution rate for billing questions has dropped from 73% to 58%. In 7 minutes, it diagnoses the root cause: NovaBill pushed a billing system update that renamed two API fields. By 3:31, the platform has written a fix — a 12-line update to the Billing Inquiry skill. But it doesn't just deploy. It validates. Shadow replay against 420 test cases: 99.5% pass rate. Then 5% of live tickets as a canary: 96% resolution versus 57% in the control group. Then 25%. Then full deployment. By 5:15 AM, fully restored. Two hours. Zero humans. $340,000 in quarterly revenue protected.",
    "This is the evidence behind the autonomous deployment. 420 test cases from our golden evaluation dataset — refined across 73 deployments. The billing dispute category — the one that was broken — now passes at 100%. Every other category: 100%. The only flags are two pre-existing adversarial edge cases, not regressions. And the canary results: side by side, the patched version resolved tickets at 96% versus 57% for the broken version. This isn't hope-based deployment. This is evidence-based deployment. Same rigor as traditional software CI/CD, applied to AI agents.",
    "Every action the platform took — detection, diagnosis, fix, validation, deployment — is in this audit trail. 34 events, each cryptographically hash-chained so they're tamper-proof. Each event is tagged with the SOC 2 controls it provides evidence for. And on the right: a one-click compliance report. 38 SOC 2 controls, 36 fully evidenced with artifacts generated automatically from platform operations. When NovaBill's auditor asks what happened on February 4th, this is the answer — no scrambling, no screenshots. The platform generates compliance evidence as a byproduct of doing its job.",
    "Let me bring this together. In eight screens, you've seen a platform that understands your industry from the first login, deploys production-ready agents in hours from battle-tested templates, shows business results not infrastructure metrics, knows when to act and when to ask a human, heals itself and validates the fix through the same safety pipeline as any human-authored change, and generates a tamper-proof, SOC 2-compliant audit trail as a byproduct. For NovaBill, that meant $972,000 in annualized cost savings, 84% margins, and $340,000 in quarterly revenue protected while everyone slept. That's Nouse Agent Orchestrator. Not just a platform to build agents — but the platform to run them in production, safely, at scale, in your industry.",
  ]);

  const demoTtsCache = new Map<string, Buffer>();

  router.post("/api/demo/tts", async (req, res) => {
    try {
      const { text, voice } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Text is required" });
      }
      if (!ALLOWED_DEMO_NARRATIONS.has(text)) {
        return res.status(403).json({ message: "Only demo narrations are allowed" });
      }

      if (demoTtsCache.has(text)) {
        const cached = demoTtsCache.get(text)!;
        res.set("Content-Type", "audio/mpeg");
        res.set("Content-Length", String(cached.length));
        return res.send(cached);
      }

      const { textToSpeech } = await import("../replit_integrations/audio/client");
      const audioBuffer = await textToSpeech(
        text,
        voice || "nova",
        "mp3"
      );
      demoTtsCache.set(text, audioBuffer);
      res.set("Content-Type", "audio/mpeg");
      res.set("Content-Length", String(audioBuffer.length));
      res.send(audioBuffer);
    } catch (e: any) {
      console.error("TTS error:", e.message);
      res.status(500).json({ message: e.message || "TTS generation failed" });
    }
  });


  // GET /demo-api/blackrock2/partner-portal-registry
  // Lazily seeds the Partner Portal Registry MCP server (and its 6 tools) via
  // the platform storage API, then returns the server record + tools.
  router.get("/demo-api/blackrock2/partner-portal-registry", async (_req, res) => {
    try {
      const result = await seedPartnerPortalRegistry();
      return res.json({
        server: {
          id: result.server.id,
          name: result.server.name,
          description: result.server.description,
          status: result.server.status,
          riskTier: result.server.riskTier,
          allowlisted: result.server.allowlisted,
        },
        tools: result.tools.map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          riskClassification: t.riskClassification,
          enabled: t.enabled,
          annotations: t.annotations,
        })),
        created: result.created,
        message: result.created
          ? `Partner Portal Registry MCP server created with ${result.tools.length} tools.`
          : `Partner Portal Registry MCP server already exists (${result.tools.length} tools).`,
      });
    } catch (err: any) {
      console.error("[blackrock2] Failed to seed Partner Portal Registry:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── BlackRock Demo: run-pipeline (deprecated — use GET /demo-api/blackrock/live-run/stream)
  router.post("/demo-api/run-pipeline", async (_req, res) => {
    return res.status(410).json({
      deprecated: true,
      message: "This endpoint has been replaced. Use GET /demo-api/blackrock/live-run/stream?scenario=default|sod|privesc for SSE streaming.",
    });
  });

  // ── BK1 ensure-agents + live-run SSE (registered directly on app for reliable Express 5 routing)
  router.post("/demo-api/blackrock/ensure-agents", async (req, res) => {
    const { bk1EnsureAgentsHandler } = await import("../demo-routes");
    return bk1EnsureAgentsHandler(req, res);
  });
  router.get("/demo-api/blackrock/live-run/stream", async (req, res) => {
    const { bk1LiveRunStreamHandler } = await import("../demo-routes");
    return bk1LiveRunStreamHandler(req, res);
  });

  // ── BK2 ensure-agents + live-run SSE (registered directly on app for reliable Express 5 routing)
  router.post("/demo-api/blackrock2/ensure-agents", async (req, res) => {
    const { bk2EnsureAgentsHandler } = await import("../demo-routes");
    return bk2EnsureAgentsHandler(req, res);
  });
  router.get("/demo-api/blackrock2/live-run", async (req, res) => {
    const { bk2LiveRunHandler } = await import("../demo-routes");
    return bk2LiveRunHandler(req, res);
  });

  // ── Moody's ensure-agents (registered directly on app for reliable Express 5 routing) ─
  router.post("/demo-api/moodys/ensure-agents", async (req, res) => {
    const { moodysEnsureAgentsHandler } = await import("../demo-routes");
    return moodysEnsureAgentsHandler(req, res);
  });

  // ── Moody's Credit Assessment Demo Pipeline ──────────────────────────────
  router.post("/demo-api/moodys/run", async (_req, res) => {
    try {
      const {
        getMoodysState,
        setMoodysPipelineStatus,
        setMoodysAgentStatus,
        resetMoodysState,
      } = await import("../moodys-demo-store");

      const current = getMoodysState();
      const STALE_MS = 8 * 60 * 1000;
      const startedAtMs = current.startedAt ? new Date(current.startedAt).getTime() : 0;
      const isStale = current.status === "running" && (Date.now() - startedAtMs > STALE_MS);

      if (current.status === "running" && !isStale) {
        return res.status(409).json({ error: "Pipeline already running." });
      }
      if (current.status !== "idle") {
        resetMoodysState();
      }

      setMoodysPipelineStatus("running");
      res.json({ started: true, message: "Assessment package assembly started. 6 agents activated." });

      const DEP = {
        financialDataCollector: "6066aa6a-f1d4-4d05-b7fd-da2be493e4b7",
        earningsAnalyzer:       "f4bea6d9-e5d5-45de-a2b5-7e841ddeea28",
        peerComparisonBuilder:  "347d49a5-4124-41d1-96cd-06d2016b2d84",
        esgProfileAgent:        "cf00b760-cf41-4bb9-892e-b5cca3afffaa",
        newsEventScanner:       "88738a00-7523-43ff-86c6-8e6d9d007bac",
        scorecardPrePopulation: "baaaeebf-2b3e-490c-8e41-1b5a440cb857",
      } as const;

      const PROMPTS = {
        financialDataCollector: `You are the Financial Data Collector & Spreader for a credit assessment of Ford Motor Company (ticker: F).

Execute these steps in order — call each tool exactly once:
1. Call get_edgar_filings with issuer "Ford Motor Company", ticker "F", filing_types ["10-K","10-Q"], periods ["FY2025","Q3-2025","Q2-2025"]
2. Call get_moody_financials with issuer_id "F", periods 8
3. Call spread_to_chart_of_accounts with issuer_id "F", source "EDGAR", standard "US-GAAP", periods 8
4. Call compute_credit_metrics with issuer_id "F", sector "Automotive", metrics_set "standard_24"

Complete all 4 steps. This is the financial data gathering and spreading phase.`,

        earningsAnalyzer: `You are the Earnings & Management Signal Analyzer for a credit assessment of Ford Motor Company (ticker: F).

Execute these steps in order — call each tool exactly once:
1. Call get_edgar_filings with issuer "Ford Motor Company", ticker "F", filing_types ["8-K"], periods ["Q4-2025","Q3-2025"]
2. Call get_earnings_transcripts with issuer_id "F", quarters ["Q4-2025","Q3-2025"]
3. Call get_investor_presentations with issuer_id "F", event_type "earnings_call", periods ["Q4-2025","Q3-2025"]

Complete all 3 steps. Extract management tone, forward guidance, and credit-relevant signals.`,

        peerComparisonBuilder: `You are the Peer Comparison Builder for a credit assessment of Ford Motor Company (ticker: F).

Execute these steps in order — call each tool exactly once:
1. Call get_peer_group with issuer_id "F", sector "Automobile_Manufacturer", methodology_version "v2.1"
2. Call get_peer_financials with peer_ids ["GM","Stellantis","Toyota","VW","Hyundai"], metrics ["debt_ebitda","ebit_interest","fcf_debt","revenue","ebitda_margin","current_rating"]

Complete both steps and build the peer comparison matrix.`,

        esgProfileAgent: `You are the ESG & Sustainability Profile Agent for a credit assessment of Ford Motor Company (ticker: F).

Execute these steps in order — call each tool exactly once:
1. Call get_esg_ips_scores with issuer_id "F"
2. Call get_cis_score with issuer_id "F"
3. Call scan_credit_news with issuer_id "F", categories ["ESG","regulatory","sustainability"], lookback_days 180

Complete all 3 steps. Flag any ESG factors with material credit impact.`,

        newsEventScanner: `You are the News & Event Scanner for a credit assessment of Ford Motor Company (ticker: F).

Execute these steps in order — call each tool exactly once:
1. Call scan_credit_news with issuer_id "F", categories ["credit_event","earnings","M&A","litigation","regulatory"], lookback_days 365
2. Call get_legal_database with issuer_id "F", case_types ["litigation","regulatory_action"], open_only false
3. Call get_market_data with issuer_id "F", data_types ["credit_spreads","CDS","bond_yields"]

Complete all 3 steps. Classify events by credit relevance (material/contextual/informational).`,

        scorecardPrePopulation: `You are the Scorecard Pre-Population Agent. Pre-populate the Automobile Manufacturer rating scorecard for Ford Motor Company (ticker: F).

Execute these steps in order — call each tool exactly once:
1. Call get_rating_scorecard_template with sector "Automobile_Manufacturer", methodology_version "v2.1", methodology_date "2024-03"
2. Call get_current_rating with issuer_id "F"
3. Call get_moody_financials with issuer_id "F", periods 8

Complete all 3 steps. Compute scorecard-indicated rating and gap vs. current rating. All output is model-indicated only — not a rating opinion.`,
      } as const;

      (async () => {
        try {
          const parallelAgents: (keyof typeof DEP)[] = [
            "financialDataCollector",
            "earningsAnalyzer",
            "peerComparisonBuilder",
            "esgProfileAgent",
            "newsEventScanner",
          ];

          const now = () => new Date().toISOString();

          parallelAgents.forEach((key) =>
            setMoodysAgentStatus(key, { status: "running", startedAt: now() })
          );

          await Promise.all(
            parallelAgents.map(async (key) => {
              try {
                await runAgentOnce(DEP[key], PROMPTS[key], 8);
                setMoodysAgentStatus(key, {
                  status: "complete",
                  completedAt: now(),
                  durationSec: Math.round((Date.now() - new Date(getMoodysState().agents[key].startedAt!).getTime()) / 1000),
                });
              } catch (e: any) {
                console.error(`[moodys-pipeline] ${key} error:`, e.message);
                setMoodysAgentStatus(key, { status: "error", completedAt: now() });
              }
            })
          );

          setMoodysAgentStatus("scorecardPrePopulation", { status: "running", startedAt: now() });
          try {
            await runAgentOnce(DEP.scorecardPrePopulation, PROMPTS.scorecardPrePopulation, 6);
            setMoodysAgentStatus("scorecardPrePopulation", {
              status: "complete",
              completedAt: now(),
              durationSec: Math.round((Date.now() - new Date(getMoodysState().agents.scorecardPrePopulation.startedAt!).getTime()) / 1000),
            });
          } catch (e: any) {
            console.error(`[moodys-pipeline] scorecardPrePopulation error:`, e.message);
            setMoodysAgentStatus("scorecardPrePopulation", { status: "error", completedAt: now() });
          }

          setMoodysPipelineStatus("complete");
          console.log("[moodys-pipeline] All 6 agents complete.");
        } catch (err: any) {
          console.error("[moodys-pipeline] Fatal error:", err.message);
          setMoodysPipelineStatus("complete");
        }
      })();
    } catch (err: any) {
      console.error("[demo-api/moodys/run]", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // HEARST NBA EMAIL DEMO ROUTES
  // ============================================================

  const HEARST_AGENT_IDS = {
    subscriberProfileEngine: "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d",
    contentInventory: "92584a77-d150-4436-9083-a108584bc021",
    nbaEmailDecision: "151db72c-0038-4f01-a4bb-45650a82e8b6",
    sendTimeOptimizer: "7de4167e-6b0c-4f04-9fcf-3693bda1d255",
    performanceLearning: "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d",
  };

  const HEARST_BRANDS = [
    { id: "cosmo",            name: "Cosmopolitan",     color: "#E91E8C", shortName: "Cosmo", subscribers: 890000 },
    { id: "elle",             name: "Elle",             color: "#1A1A1A", shortName: "Elle",  subscribers: 720000 },
    { id: "esquire",          name: "Esquire",          color: "#1B3A6B", shortName: "Esq",   subscribers: 540000 },
    { id: "goodhousekeeping", name: "Good Housekeeping",color: "#2E7D32", shortName: "GH",    subscribers: 1200000 },
    { id: "harpersbazaar",    name: "Harper's Bazaar",  color: "#C9A84C", shortName: "HB",    subscribers: 680000 },
    { id: "countryliving",    name: "Country Living",   color: "#3E6B3E", shortName: "CL",    subscribers: 950000 },
    { id: "runnersworld",     name: "Runner's World",   color: "#E65100", shortName: "RW",    subscribers: 480000 },
    { id: "menshealth",       name: "Men's Health",     color: "#1565C0", shortName: "MH",    subscribers: 760000 },
    { id: "womenshealth",     name: "Women's Health",   color: "#EC4899", shortName: "WH",    subscribers: 620000 },
    { id: "popularmechanics", name: "Popular Mechanics",color: "#F59E0B", shortName: "PM",    subscribers: 380000 },
    { id: "cosmouk",          name: "Cosmopolitan UK",  color: "#A855F7", shortName: "CUK",   subscribers: 510000 },
    { id: "roadandtrack",     name: "Road & Track",     color: "#64748B", shortName: "R&T",   subscribers: 290000 },
  ];

  // POST /demo-api/hearst/setup — idempotent: re-runs ensureHearstAgents and returns status
  router.post("/demo-api/hearst/setup", async (_req, res) => {
    try {
      await ensureHearstAgents();
      const agents = await Promise.all(
        Object.entries(HEARST_AGENT_IDS).map(async ([key, id]) => {
          const agent = await storage.getAgent(id);
          return { key, id, name: agent?.name ?? key, found: !!agent };
        })
      );
      const allServers = await storage.getMcpServers();
      const hearstServers = allServers.filter((s: any) =>
        s.name?.startsWith("Hearst")
      );
      return res.json({
        ok: true,
        agents: { total: agents.length, found: agents.filter((a) => a.found).length, detail: agents },
        mcpServers: { total: hearstServers.length, names: hearstServers.map((s: any) => s.name) },
        message: "ensureHearstAgents() completed — agents, MCP servers, tools and links are verified.",
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /demo-api/hearst/agents — real agent status from platform
  router.get("/demo-api/hearst/agents", async (_req, res) => {
    try {
      const agents = await Promise.all(
        Object.entries(HEARST_AGENT_IDS).map(async ([key, id]) => {
          const agent = await storage.getAgent(id);
          return { key, id, name: agent?.name || key, status: agent?.status || "active", riskTier: agent?.riskTier || "MEDIUM" };
        })
      );
      return res.json({ agents });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/hearst/command-center — Screen 1 data
  router.get("/demo-api/hearst/command-center", async (_req, res) => {
    try {
      await seedHearstAgentRuns();

      // Read AI-influenced breakdown from the most recent NBA Decision Agent run
      const NBA_AGENT_ID = "151db72c-0038-4f01-a4bb-45650a82e8b6";
      const nbaRuns = await storage.getAgentRuntimeRuns(NBA_AGENT_ID);
      const latestNbaRun = nbaRuns.length ? nbaRuns[nbaRuns.length - 1] : null;
      const nbaResult = (latestNbaRun?.resultSummary as any) || {};

      const evaluated       = nbaResult.decisionsEvaluated ?? 2430000;
      const scheduled       = nbaResult.sendDecisions       ?? 1810000;
      const held            = evaluated - scheduled;
      const defaultSendPct  = nbaResult.defaultSendPct      ?? 42;
      const personalizedPct = nbaResult.personalizedPct     ?? 33;
      const holdPct         = nbaResult.holdPct             ?? 25;
      const aiInfluencedPct = nbaResult.aiInfluencedPct     ?? 58;
      const baseOpenRate    = nbaResult.baseOpenRate         ?? 28.1;
      const projectedOpenRate = nbaResult.projectedOpenRate  ?? 34.2;
      const liftPct         = ((projectedOpenRate - baseOpenRate) / baseOpenRate * 100).toFixed(1);

      // Read P&L trace for topPerformer, anomalies, revenueForecast
      const PERF_AGENT_ID_S1 = "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d";
      const perfTracesS1 = await storage.getRecentCompletedTracesByAgent(PERF_AGENT_ID_S1, 1);
      const perfDecisionsS1 = (perfTracesS1[0]?.decisions as any) || {};
      const brandPerf: any[] = perfDecisionsS1.brandPerformance ?? [];
      const topBrand = brandPerf.reduce((best: any, b: any) =>
        (!best || b.predictedOpenRate > best.predictedOpenRate) ? b : best, null);
      const BRAND_COLORS: Record<string, string> = {
        "Cosmopolitan": "#E91E8C", "Elle": "#1A1A1A", "Esquire": "#1B3A6B",
        "Good Housekeeping": "#2E7D32", "Harper's Bazaar": "#C9A84C",
        "Country Living": "#3E6B3E", "Runner's World": "#E65100", "Men's Health": "#1565C0",
      };
      const BRAND_SUBJECTS: Record<string, string> = {
        "Elle": "The 12 Career Moves That Separate Good from Great",
        "Good Housekeeping": "5 Morning Habits That Actually Boost Productivity",
        "Harper's Bazaar": "Your Fall Fashion Exclusive Preview",
        "Cosmopolitan": "10 Beauty Secrets From Top Dermatologists",
        "Men's Health": "7-Day Gut Reset That Actually Works",
        "Country Living": "50 Ways to Refresh Your Home This Weekend",
        "Runner's World": "5 Training Plans for Your First Half Marathon",
        "Esquire": "Style Guide: The Fall Wardrobe Edit",
      };
      const BRAND_WHY: Record<string, string> = {
        "Elle": "Sent to subscribers with high career-content affinity at their personalized optimal send time. Wellness+career crossover article matched top 2 interests for this cohort.",
        "Good Housekeeping": "Wellness + career crossover content resonated with premium subscribers. Personalized 7:12 AM send time drove the highest open rate for this brand.",
        "Harper's Bazaar": "Exclusive preview content creates urgency. Sent to beauty/fashion segment at their peak engagement window.",
        "Cosmopolitan": "Beauty affinity segment + personalized subject line variant drove above-average engagement.",
        "Men's Health": "Gut health content aligned with fitness-first subscribers. Personalized send time added 8% open-rate lift.",
        "Country Living": "Home & garden content drove high affiliate click-through. Sent at optimal morning engagement window.",
        "Runner's World": "Training content matched high-fitness-affinity segment. Early morning send time aligned with runner habits.",
        "Esquire": "Career & finance segment variant outperformed style-only sends for the 25–34 male cohort.",
      };
      const topBrandName = topBrand?.brand ?? "Elle";
      const topPerformer = {
        brand: topBrandName,
        brandColor: BRAND_COLORS[topBrandName] ?? "#6366F1",
        subject: BRAND_SUBJECTS[topBrandName] ?? `Today's Best from ${topBrandName}`,
        sendVolume: Math.round((topBrand?.subscribers ?? 720000) * 0.26),
        actualOpenRate: parseFloat(((topBrand?.predictedOpenRate ?? 36.2) + 6.1).toFixed(1)),
        predictedOpenRate: topBrand?.predictedOpenRate ?? 36.2,
        clickRate: 8.1,
        revenue: 8200,
        whyItWorked: BRAND_WHY[topBrandName] ?? "Personalized content and send time drove above-baseline engagement.",
      };

      const rawAnomalies: any[] = perfDecisionsS1.anomalies ?? [
        { brand: "Esquire", metric: "Open Rate", actual: "19.2%", baseline: "21.8%", severity: "warning" },
        { brand: "Country Living", metric: "Affiliate CTR", actual: "4.8%", baseline: "3.7%", severity: "info" },
      ];
      const ANOMALY_MESSAGES: Record<string, string> = {
        "Open Rate": "Open rate dropped vs. 30-day baseline — possible content fatigue in 35–44 male segment.",
        "Affiliate CTR": "Affiliate click rate above baseline. Home & garden content driving higher-than-expected AOV conversions.",
      };
      const anomalyAlerts = rawAnomalies.map((a: any, i: number) => ({
        id: `a${i + 1}`,
        severity: a.severity ?? "info",
        brand: a.brand,
        message: ANOMALY_MESSAGES[a.metric] ?? `${a.metric} deviation detected.`,
        time: i === 0 ? "38 min ago" : "2h ago",
        metric: a.metric,
        value: a.actual,
        baseline: a.baseline,
      }));

      // Read STO for deterministic timeline distribution
      const STO_AGENT_ID_S1 = "7de4167e-6b0c-4f04-9fcf-3693bda1d255";
      const stoTracesS1 = await storage.getRecentCompletedTracesByAgent(STO_AGENT_ID_S1, 1);
      const stoDecisionsS1 = (stoTracesS1[0]?.decisions as any) || {};
      const tzLifts: any[] = stoDecisionsS1.timezoneLifts ?? [];
      const zoneSends: Record<string, number> = {
        eastUs:    tzLifts[0]?.sendCount ?? 680000,
        centralUs: tzLifts[1]?.sendCount ?? 310000,
        westUs:    tzLifts[2]?.sendCount ?? 440000,
        europe:    tzLifts[3]?.sendCount ?? 210000,
        apac:      tzLifts[4]?.sendCount ?? 170000,
      };
      const zonePeaks: Record<string, number> = { eastUs: 7, centralUs: 8, westUs: 10, europe: 2, apac: 21 };

      const gaussWeight = function(h: number, peak: number): number {
        const d = Math.min(Math.abs(h - peak), 24 - Math.abs(h - peak));
        return Math.exp(-d * d / 3.0);
      }
      const zoneWeights: Record<string, number[]> = {};
      for (const [zone, peak] of Object.entries(zonePeaks)) {
        const weights = Array.from({ length: 24 }, (_, h) => gaussWeight(h, peak));
        const sum = weights.reduce((a, b) => a + b, 0);
        zoneWeights[zone] = weights.map(w => w / sum);
      }

      const totalSubscribers = HEARST_BRANDS.reduce((s, b) => s + b.subscribers, 0);
      const brandDist = HEARST_BRANDS.map((b) => {
        const base = Math.round(scheduled * (b.subscribers / totalSubscribers));
        const personalized = Math.round(base * (personalizedPct / 100));
        const holdCount = Math.round(b.subscribers * (holdPct / 100));
        return { ...b, scheduled: base - personalized, personalized, hold: holdCount };
      });

      const now = new Date();
      const currentHour = now.getHours();
      const timeline = Array.from({ length: 24 }, (_, h) => {
        const isFuture = h > currentHour;
        const peakWeight = zoneWeights["eastUs"][h];
        const maxWeight = Math.max(...zoneWeights["eastUs"]);
        return {
          hour: h,
          label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "am" : "pm"}`,
          eastUs:    isFuture ? 0 : Math.round(zoneSends.eastUs    * zoneWeights["eastUs"][h]),
          centralUs: isFuture ? 0 : Math.round(zoneSends.centralUs * zoneWeights["centralUs"][h]),
          westUs:    isFuture ? 0 : Math.round(zoneSends.westUs    * zoneWeights["westUs"][h]),
          europe:    isFuture ? 0 : Math.round(zoneSends.europe    * zoneWeights["europe"][h]),
          apac:      isFuture ? 0 : Math.round(zoneSends.apac      * zoneWeights["apac"][h]),
          actualOpenRate: isFuture ? null : parseFloat((28 + 8 * (peakWeight / maxWeight)).toFixed(1)),
          isFuture,
        };
      });

      return res.json({
        kpi: {
          evaluated,
          scheduled,
          held,
          projectedOpenRate,
          baseOpenRate,
          liftPct: parseFloat(liftPct),
          revenueForecast: 142000,
          revenueBreakdown: { subscriptions: 87000, affiliate: 55000 },
          holdRate: parseFloat(((held / evaluated) * 100).toFixed(1)),
          currentHour,
          aiInfluencedPct,
          personalizedPct,
          holdPct,
          portfolioFatigueScore: (nbaResult as any)?.portfolioFatigueScore ?? 22,
        },
        brandDist,
        donut: [
          { name: "Default Send",    value: defaultSendPct,  color: "#6B7280" },
          { name: "AI-Personalized", value: personalizedPct, color: "#6366F1" },
          { name: "HOLD",            value: holdPct,         color: "#F97316" },
        ],
        timeline,
        topPerformer,
        anomalyAlerts,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/hearst/brand/:brand — Screen 2 data
  router.get("/demo-api/hearst/brand/:brand", async (req, res) => {
    try {
      await seedHearstAgentRuns();

      const brandId = req.params.brand;
      const brand = HEARST_BRANDS.find((b) => b.id === brandId) || HEARST_BRANDS[0];
      const totalSubs = brand.subscribers;

      // Read brand-specific predicted open rate from Performance & Learning agent trace
      const PERF_AGENT_ID = "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d";
      const perfTraces = await storage.getRecentCompletedTracesByAgent(PERF_AGENT_ID, 1);
      const perfDecisions = (perfTraces[0]?.decisions as any) || {};
      const brandPerf = (perfDecisions.brandPerformance as any[] | undefined)
        ?.find((b: any) => b.brand === brand.name);
      const predictedOpenRate = brandPerf?.predictedOpenRate ?? 32.4;
      const baselineOpenRate  = brandPerf?.baselineOpenRate  ?? 22.4;

      // Read aiGroups from seeded NBA batch run resultSummary
      const NBA_AGENT_ID_S2 = "151db72c-0038-4f01-a4bb-45650a82e8b6";
      const nbaRunsS2 = await storage.getAgentRuntimeRuns(NBA_AGENT_ID_S2);
      const nbaResultS2 = (nbaRunsS2.length ? (nbaRunsS2[nbaRunsS2.length - 1]?.resultSummary as any) : null) || {};
      const seededBrandGroups: any[] = (nbaResultS2.brandAiGroups ?? {})[brand.id] ?? [];
      const aiGroups: any[] = seededBrandGroups.length > 0 ? seededBrandGroups : [
        { label: "Receive planned email", count: Math.round(totalSubs * 0.38), type: "planned", color: "#6366F1" },
        { label: "Same email — AI-optimized subject line", count: Math.round(totalSubs * 0.20), type: "subject-personalized", color: "#8B5CF6" },
        { label: "AI-selected alternative content", count: Math.round(totalSubs * 0.13), type: "content-personalized", color: "#3B82F6" },
        { label: "Email from a different Hearst brand", count: Math.round(totalSubs * 0.10), type: "cross-brand", color: "#10B981" },
        { label: "HOLD — suppressed today", count: Math.round(totalSubs * 0.19), type: "hold", color: "#EF4444" },
      ];

      const segments = ["Beauty Enthusiast", "Wellness Seeker", "Career Focused", "Entertainment Fan", "Home & Lifestyle"];
      const topics = ["Beauty & Style", "Wellness", "Career", "Entertainment", "Relationships", "Food", "Travel"];

      // Deterministic heatmap — uses brand + segment + topic indices as seed
      const brandSeed = brand.id.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      const heatmap = segments.map((_, si) =>
        topics.map((_, ti) => {
          const v = Math.abs(Math.sin((brandSeed + si * 7 + ti * 13) * 0.37)) * 0.85 + 0.1;
          return parseFloat(v.toFixed(2));
        })
      );

      // Deterministic 7-day trend — uses predictedOpenRate as anchor, no randomness
      const trendVariants = [
        { openDelta: -1.4, clickBase: 3.2, unsubBase: 0.16, revBase: 17000 },
        { openDelta: -0.8, clickBase: 3.5, unsubBase: 0.15, revBase: 18000 },
        { openDelta: -1.1, clickBase: 3.1, unsubBase: 0.17, revBase: 16500 },
        { openDelta:  0.9, clickBase: 5.8, unsubBase: 0.07, revBase: 29000 },
        { openDelta:  1.2, clickBase: 6.1, unsubBase: 0.08, revBase: 31000 },
        { openDelta:  0.7, clickBase: 5.4, unsubBase: 0.06, revBase: 28500 },
        { openDelta:  1.5, clickBase: 6.8, unsubBase: 0.07, revBase: 33000 },
      ];
      const trend7d = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const atlasActive = i >= 3;
        const tv = trendVariants[i];
        return {
          date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          openRate: parseFloat((atlasActive ? predictedOpenRate + tv.openDelta : baselineOpenRate + tv.openDelta).toFixed(1)),
          clickRate: parseFloat(tv.clickBase.toFixed(1)),
          unsubRate: tv.unsubBase,
          revenue: tv.revBase,
          atlasActive,
        };
      });

      const liftPct = brandPerf?.liftPct ?? parseFloat(
        (((predictedOpenRate - baselineOpenRate) / baselineOpenRate) * 100).toFixed(1)
      );

      return res.json({
        brand,
        metrics: {
          totalSubscribers: totalSubs,
          emailsScheduled: Math.round(totalSubs * 0.76),
          holdCount: Math.round(totalSubs * 0.24),
          predictedOpenRate,
          liftPct,
          revenueForecast: Math.round((brandPerf?.predictedOpenRate ?? 32.4) * 1100),
        },
        defaultPlan: {
          subject: `Today's ${brand.name} Newsletter`,
          targetSize: totalSubs,
          plannedSendTime: "9:00 AM ET",
          openRateEstimate: baselineOpenRate,
        },
        aiGroups,
        segments,
        topics,
        heatmap,
        trend7d,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/hearst/subscriber/:id — Screen 3 subscriber data
  router.get("/demo-api/hearst/subscriber/:id", async (req, res) => {
    try {
      await seedHearstAgentRuns();
      const personaId = req.params.id;

      // Deterministic timeline helper: uses sine function keyed by persona+day
      const detTimeline = function(personaSeed: number, openThreshold: number, visitThreshold: number, purchaseThreshold: number, openBrands: string[]) {
        return Array.from({ length: 30 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (29 - i));
          const events: any[] = [];
          const v1 = Math.abs(Math.sin(personaSeed * 5.3 + i * 1.71));
          const v2 = Math.abs(Math.sin(personaSeed * 3.1 + i * 2.43));
          const v3 = Math.abs(Math.sin(personaSeed * 7.7 + i * 3.11));
          const brandIdx = Math.floor(Math.abs(Math.sin(personaSeed + i * 0.91)) * openBrands.length);
          if (v1 > (1 - openThreshold)) events.push({ type: "open", brand: openBrands[brandIdx % openBrands.length], label: "Email opened" });
          if (v2 > (1 - visitThreshold)) events.push({ type: "visit", label: "Website visit" });
          if (v3 > (1 - purchaseThreshold)) events.push({ type: "purchase", label: "Purchase / affiliate click" });
          return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), events };
        });
      }

      const personas: Record<string, any> = {
        "sarah-m": {
          id: "sarah-m",
          name: "Sarah M.",
          location: "New York, NY",
          tier: "Premium",
          lifecycleStage: "Engaged Reader",
          healthScore: 84,
          brandMap: [
            { brand: "Good Housekeeping", color: "#2E7D32", optedIn: true, lastOpen: "1 day ago", engagement: "HIGH" },
            { brand: "Cosmopolitan", color: "#E91E8C", optedIn: true, lastOpen: "2 days ago", engagement: "HIGH" },
            { brand: "Elle", color: "#1A1A1A", optedIn: true, lastOpen: "5 days ago", engagement: "MEDIUM" },
            { brand: "Esquire", color: "#1B3A6B", optedIn: true, lastOpen: "32 days ago", engagement: "LOW" },
            { brand: "Runner's World", color: "#E65100", optedIn: false, lastOpen: "—", engagement: "BROWSE_ONLY" },
          ],
          affinityRadar: [
            { topic: "Beauty & Style", score: 35 }, { topic: "Wellness & Fitness", score: 88 },
            { topic: "Career & Finance", score: 82 }, { topic: "Entertainment", score: 54 },
            { topic: "Home & Garden", score: 63 }, { topic: "Food & Recipes", score: 47 },
            { topic: "Relationships", score: 38 }, { topic: "News & Politics", score: 29 },
          ],
          todayDecision: {
            action: "SEND",
            brand: "Good Housekeeping",
            subject: "5 Morning Habits That Actually Boost Productivity",
            sendTime: "7:12 AM ET",
            nbEmailScore: 0.74,
            factors: [
              { label: "Content match", score: 0.92, detail: "Wellness + career crossover matches top 2 interests" },
              { label: "Brand affinity", score: 0.88, detail: "GH: opened 4 of last 5 emails" },
              { label: "Revenue potential", score: 0.71, detail: "Affiliate product links — 3.2x revenue vs. avg Cosmo send" },
              { label: "Fatigue cost", score: -0.12, detail: "Received 1 email this week — low fatigue" },
              { label: "Cannibalization", score: -0.08, detail: "No competing GH content scheduled tomorrow" },
            ],
            holdThreshold: 0.25,
          },
          timeline: detTimeline(17, 0.60, 0.30, 0.10, ["Good Housekeeping", "Cosmopolitan", "Elle"]),
        },
      "marcus-t": {
        id: "marcus-t",
        name: "Marcus T.",
        location: "Chicago, IL",
        tier: "Free",
        lifecycleStage: "At-Risk",
        healthScore: 38,
        brandMap: [
          { brand: "Esquire", color: "#1B3A6B", optedIn: true, lastOpen: "21 days ago", engagement: "LOW" },
          { brand: "Men's Health", color: "#1565C0", optedIn: true, lastOpen: "14 days ago", engagement: "LOW" },
          { brand: "Runner's World", color: "#E65100", optedIn: true, lastOpen: "3 days ago", engagement: "MEDIUM" },
        ],
        affinityRadar: [
          { topic: "Beauty & Style", score: 12 }, { topic: "Wellness & Fitness", score: 71 },
          { topic: "Career & Finance", score: 45 }, { topic: "Entertainment", score: 63 },
          { topic: "Home & Garden", score: 28 }, { topic: "Food & Recipes", score: 52 },
          { topic: "Relationships", score: 33 }, { topic: "News & Politics", score: 68 },
        ],
        todayDecision: {
          action: "HOLD",
          brand: null,
          subject: null,
          sendTime: null,
          nbEmailScore: 0.19,
          factors: [
            { label: "Content match", score: 0.41, detail: "Available content only partially matches fitness interests" },
            { label: "Brand affinity", score: 0.32, detail: "Esquire: low recent engagement" },
            { label: "Revenue potential", score: 0.28, detail: "Free tier — limited conversion pathway" },
            { label: "Fatigue cost", score: -0.38, detail: "Received 3 emails this week — near threshold" },
            { label: "Cannibalization", score: -0.15, detail: "Runner's World race-prep article drops tomorrow — better timing" },
          ],
          holdThreshold: 0.25,
          holdReason: "Best score (0.19) is below HOLD threshold (0.25). Better Runner's World content is available tomorrow.",
        },
        timeline: detTimeline(43, 0.25, 0.18, 0, ["Esquire", "Runner's World"]),
      },
      "jennifer-k": {
        id: "jennifer-k",
        name: "Jennifer K.",
        location: "Austin, TX",
        tier: "Premium",
        lifecycleStage: "VIP",
        healthScore: 96,
        brandMap: [
          { brand: "Harper's Bazaar", color: "#C9A84C", optedIn: true, lastOpen: "Today", engagement: "HIGH" },
          { brand: "Elle", color: "#1A1A1A", optedIn: true, lastOpen: "Yesterday", engagement: "HIGH" },
          { brand: "Cosmopolitan", color: "#E91E8C", optedIn: true, lastOpen: "2 days ago", engagement: "HIGH" },
          { brand: "Good Housekeeping", color: "#2E7D32", optedIn: true, lastOpen: "3 days ago", engagement: "HIGH" },
          { brand: "Country Living", color: "#3E6B3E", optedIn: true, lastOpen: "4 days ago", engagement: "MEDIUM" },
        ],
        affinityRadar: [
          { topic: "Beauty & Style", score: 94 }, { topic: "Wellness & Fitness", score: 76 },
          { topic: "Career & Finance", score: 68 }, { topic: "Entertainment", score: 82 },
          { topic: "Home & Garden", score: 71 }, { topic: "Food & Recipes", score: 85 },
          { topic: "Relationships", score: 79 }, { topic: "News & Politics", score: 43 },
        ],
        todayDecision: {
          action: "HOLD",
          brand: null,
          subject: null,
          sendTime: null,
          nbEmailScore: 0.22,
          factors: [
            { label: "Content match", score: 0.71, detail: "High beauty affinity matches available content" },
            { label: "Brand affinity", score: 0.88, detail: "All 5 brands show HIGH engagement" },
            { label: "Revenue potential", score: 0.74, detail: "Premium subscriber — high LTV conversion" },
            { label: "Fatigue cost", score: -0.82, detail: "Already received 4 emails this week — at threshold" },
            { label: "Cannibalization", score: -0.41, detail: "HB fall fashion exclusive drops tomorrow — higher score" },
          ],
          holdThreshold: 0.25,
          holdReason: "VIP subscriber has hit weekly email cap. Harper's Bazaar fall fashion exclusive tomorrow will score significantly higher. Protecting tomorrow's engagement.",
        },
        timeline: detTimeline(61, 0.75, 0.50, 0.20, ["Harper's Bazaar", "Elle", "Cosmopolitan", "Good Housekeeping"]),
      },
    };

    const persona = JSON.parse(JSON.stringify(personas[personaId] || personas["sarah-m"]));

    // Merge alternativesConsidered + scoringFactors from real NBA trace decisions
    const NBA_AGENT_ID_S3 = "151db72c-0038-4f01-a4bb-45650a82e8b6";
    const nbaTracesS3 = await storage.getRecentCompletedTracesByAgent(NBA_AGENT_ID_S3, 20);
    const personaTrace = nbaTracesS3.find((t: any) => (t.promptInputs as any)?.subscriberId === personaId);
    if (personaTrace?.decisions) {
      const d = personaTrace.decisions as any;
      if (d.alternativesConsidered) {
        persona.todayDecision.alternativesConsidered = d.alternativesConsidered;
      }
      if (d.scoringFactors) {
        persona.todayDecision.scoringFactors = d.scoringFactors;
      }
    }

    return res.json(persona);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /demo-api/hearst/subscriber/:id/override
  router.post("/demo-api/hearst/subscriber/:id/override", async (req, res) => {
    const { brand, subject, reason } = req.body;
    return res.json({
      success: true,
      overrideId: `ov-${Date.now()}`,
      message: `Override logged. ${brand} "${subject}" will be sent. System will learn from this decision.`,
      learnedFrom: reason || "Manual marketer override",
    });
  });

  // GET /demo-api/hearst/agent-runs — All 5 Hearst agent last runs from real platform tables
  router.get("/demo-api/hearst/agent-runs", async (req, res) => {
    try {
      await seedHearstAgentRuns();

      const HEARST_AGENT_IDS: Record<string, string> = {
        subscriberProfileEngine: "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d",
        contentInventory: "92584a77-d150-4436-9083-a108584bc021",
        nbaEmailDecision: "151db72c-0038-4f01-a4bb-45650a82e8b6",
        sendTimeOptimizer: "7de4167e-6b0c-4f04-9fcf-3693bda1d255",
        performanceLearning: "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d",
      };

      const PIPELINE_ORDER = [
        "subscriberProfileEngine",
        "contentInventory",
        "nbaEmailDecision",
        "sendTimeOptimizer",
        "performanceLearning",
      ];

      const results = await Promise.all(
        PIPELINE_ORDER.map(async (key) => {
          const agentId = HEARST_AGENT_IDS[key];
          const [agent, runs] = await Promise.all([
            storage.getAgent(agentId, getOrgId(req)),
            storage.getAgentRuntimeRuns(agentId),
          ]);

          const lastRun = runs
            .filter(r => r.status === "completed" && r.completedAt)
            .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];

          return {
            key,
            agentId,
            agentName: agent?.name || key,
            agentStatus: agent?.status || "active",
            runId: lastRun?.id || null,
            runStatus: lastRun?.status || null,
            triggerType: lastRun?.triggerType || null,
            startedAt: lastRun?.startedAt || null,
            completedAt: lastRun?.completedAt || null,
            latencyMs: lastRun?.latencyMs || null,
            resultSummary: lastRun?.resultSummary || null,
          };
        })
      );

      return res.json({ agentRuns: results });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/hearst/subscriber/:id/trace — Per-subscriber pipeline trace from real run_traces + trace_spans
  router.get("/demo-api/hearst/subscriber/:id/trace", async (req, res) => {
    try {
      await seedHearstAgentRuns();

      const subscriberId = req.params.id;

      const PIPELINE_AGENTS: { key: string; agentId: string; label: string; order: number }[] = [
        { key: "subscriberProfileEngine", agentId: "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d", label: "Subscriber Profile Engine", order: 1 },
        { key: "contentInventory", agentId: "92584a77-d150-4436-9083-a108584bc021", label: "Content Inventory Agent", order: 2 },
        { key: "nbaEmailDecision", agentId: "151db72c-0038-4f01-a4bb-45650a82e8b6", label: "NBA Email Decision Agent", order: 3 },
        { key: "sendTimeOptimizer", agentId: "7de4167e-6b0c-4f04-9fcf-3693bda1d255", label: "Send Time Optimizer", order: 4 },
      ];

      const steps = await Promise.all(
        PIPELINE_AGENTS.map(async (pa) => {
          const agent = await storage.getAgent(pa.agentId);
          const traces = await storage.getRecentCompletedTracesByAgent(pa.agentId, 10);

          let trace = null;
          if (pa.key === "nbaEmailDecision") {
            trace = traces.find((t: any) => {
              const pi = t.promptInputs as any;
              return pi && pi.subscriberId === subscriberId;
            }) || null;
          } else {
            trace = traces[0] || null;
          }

          if (!trace) {
            return {
              ...pa,
              agentName: agent?.name || pa.label,
              agentStatus: agent?.status || "active",
              traceId: null,
              runAt: null,
              latencyMs: null,
              inputSummary: null,
              outputSummary: null,
              toolCalls: [],
              decisions: null,
            };
          }

          const spans = await storage.getTraceSpans(trace.id);
          const toolCallSpans = spans
            .filter(s => s.invocationType === "mcp_tool" && s.mcpToolName)
            .map(s => ({
              tool: s.mcpToolName,
              server: s.mcpServerName,
              durationMs: s.durationMs,
              status: s.status,
              attributes: s.attributes,
            }));

          return {
            ...pa,
            agentName: agent?.name || pa.label,
            agentStatus: agent?.status || "active",
            traceId: trace.id,
            runAt: trace.startedAt,
            latencyMs: trace.latencyMs,
            inputSummary: trace.inputSummary,
            outputSummary: trace.outputSummary,
            toolCalls: toolCallSpans,
            decisions: trace.decisions,
            promptInputs: trace.promptInputs,
          };
        })
      );

      return res.json({ subscriberId, steps });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/hearst/send-time-map — Screen 4 data
  router.get("/demo-api/hearst/send-time-map", async (_req, res) => {
    try {
      await seedHearstAgentRuns();

      // Read timezone lift data from the most recent Send Time Optimizer trace
      const STO_AGENT_ID = "7de4167e-6b0c-4f04-9fcf-3693bda1d255";
      const stoTraces = await storage.getRecentCompletedTracesByAgent(STO_AGENT_ID, 1);
      const stoDecisions = (stoTraces[0]?.decisions as any) || {};

      // Fall back to inline defaults if trace data not yet seeded
      const timezonePerf: any[] = stoDecisions.timezoneLifts ?? [
        { zone: "US East",   abbr: "ET",   openRate: 36.2, baselineOpenRate: 28.1, liftPct: 28.8, peakHour: "7–8 AM",       sendCount: 680000, color: "#6366F1" },
        { zone: "US Central", abbr: "CT",  openRate: 33.8, baselineOpenRate: 27.1, liftPct: 24.7, peakHour: "7:30–8:30 AM", sendCount: 310000, color: "#8B5CF6" },
        { zone: "US West",   abbr: "PT",   openRate: 35.1, baselineOpenRate: 28.5, liftPct: 23.2, peakHour: "7–9 AM",       sendCount: 440000, color: "#3B82F6" },
        { zone: "Europe",    abbr: "CET",  openRate: 38.4, baselineOpenRate: 25.9, liftPct: 48.3, peakHour: "8–9 AM",       sendCount: 210000, color: "#10B981" },
        { zone: "APAC",      abbr: "AEDT", openRate: 31.2, baselineOpenRate: 24.8, liftPct: 25.8, peakHour: "8–10 AM",      sendCount: 170000, color: "#F59E0B" },
      ];

      // Deterministic pre-Atlas: sharp 9am spike; all other hours are near-zero
      const beforeAtlasSends: Record<number, number> = { 8: 45000, 9: 820000, 10: 290000, 11: 18000, 12: 9000, 13: 6000, 14: 4000 };
      const beforeAtlas = Array.from({ length: 24 }, (_, h) => ({
        hour: h, label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "am" : "pm"}`,
        sends: beforeAtlasSends[h] ?? Math.round(2000 * Math.abs(Math.sin(h * 1.3))),
      }));
      // Deterministic with-Atlas: distributed across all active hours using zone Gaussian
      const withAtlasDist = [
        0, 0, 3200, 6400, 9800, 18200, 32400, 68000, 89000, 92000, 74000, 58000,
        48000, 41000, 38000, 35000, 42000, 51000, 62000, 71000, 58000, 44000, 22000, 8000,
      ];
      const withAtlas = Array.from({ length: 24 }, (_, h) => ({
        hour: h, label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "am" : "pm"}`,
        sends: withAtlasDist[h] ?? 0,
      }));

      const hotspots = [
        { id: "nyc",     city: "New York",     lat: 40.71,  lng: -74.01,  subscribers: 180000, brand: "Cosmopolitan",    color: "#E91E8C" },
        { id: "la",      city: "Los Angeles",  lat: 34.05,  lng: -118.24, subscribers: 145000, brand: "Elle",            color: "#1A1A1A" },
        { id: "chicago", city: "Chicago",      lat: 41.88,  lng: -87.63,  subscribers:  98000, brand: "Good Housekeeping", color: "#2E7D32" },
        { id: "london",  city: "London",       lat: 51.51,  lng:  -0.13,  subscribers:  87000, brand: "Harper's Bazaar", color: "#C9A84C" },
        { id: "sydney",  city: "Sydney",       lat: -33.87, lng: 151.21,  subscribers:  52000, brand: "Runner's World",  color: "#E65100" },
        { id: "toronto", city: "Toronto",      lat: 43.65,  lng: -79.38,  subscribers:  61000, brand: "Country Living",  color: "#3E6B3E" },
        { id: "miami",   city: "Miami",        lat: 25.77,  lng: -80.19,  subscribers:  74000, brand: "Cosmopolitan",    color: "#E91E8C" },
        { id: "dallas",  city: "Dallas",       lat: 32.78,  lng: -96.80,  subscribers:  69000, brand: "Good Housekeeping", color: "#2E7D32" },
      ];

      return res.json({ timezonePerf, beforeAtlas, withAtlas, hotspots, totalSent: 1810000, totalRemaining: 620000, liveOpenRate: 34.2 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/hearst/fatigue — Screen 5 data
  router.get("/demo-api/hearst/fatigue", async (_req, res) => {
    try {
      await seedHearstAgentRuns();

      // Read hold validation outcomes from the most recent Performance & Learning trace
      const PERF_AGENT_ID = "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d";
      const perfTraces = await storage.getRecentCompletedTracesByAgent(PERF_AGENT_ID, 1);
      const perfDecisions = (perfTraces[0]?.decisions as any) || {};
      const hv = perfDecisions.holdValidation || {};

      const segments = ["Multi-brand loyalist", "Single-brand devotee", "Casual reader", "New subscriber <30d", "At-risk declining"];
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

      const preAtlasBases: Record<string, number> = { "Multi-brand loyalist": 5.2, "Single-brand devotee": 2.8, "Casual reader": 1.9, "New subscriber <30d": 3.1, "At-risk declining": 4.2 };
      const withAtlasBases: Record<string, number> = { "Multi-brand loyalist": 1.4, "Single-brand devotee": 1.1, "Casual reader": 0.8, "New subscriber <30d": 1.2, "At-risk declining": 1.0 };
      const preAtlasHeatmap = segments.map((seg, si) =>
        days.map((_, di) => {
          const base = preAtlasBases[seg] ?? 3.0;
          const det = 0.8 + 0.4 * Math.abs(Math.sin(si * 6.3 + di * 2.1));
          return parseFloat((base * det).toFixed(1));
        })
      );
      const withAtlasHeatmap = segments.map((seg, si) =>
        days.map((_, di) => {
          const base = withAtlasBases[seg] ?? 1.0;
          const det = 0.8 + 0.4 * Math.abs(Math.sin(si * 4.7 + di * 3.3));
          return parseFloat((base * det).toFixed(1));
        })
      );

      const holdImpact = {
        totalHolds: 3200000,
        byReason: [
          { reason: "Fatigue threshold (3+ emails/week)", count: 1800000, color: "#EF4444" },
          { reason: "Low content affinity (score < 0.25)", count: 800000, color: "#F97316" },
          { reason: "Better email tomorrow", count: 600000, color: "#F59E0B" },
        ],
        heldNextDayOpenRate: hv.heldNextDayOpenRate ?? 41.0,
        notHeldOpenRate:     hv.notHeldOpenRate     ?? 29.0,
        heldRevenuePerSub:   hv.heldRevenuePerSub   ?? 2.84,
        notHeldRevenuePerSub: hv.notHeldRevenuePerSub ?? 1.92,
      };

      const preAtlasRates = [0.19, 0.17, 0.18, 0.15, 0.16, 0.14];
      const withAtlasRates = [0.09, 0.08, 0.08, 0.07, 0.07, 0.08];
      const unsubTrend = Array.from({ length: 12 }, (_, i) => {
        const atlasActive = i >= 6;
        const d = new Date();
        d.setDate(d.getDate() - (11 - i) * 7);
        return {
          week: `Wk ${i + 1}`,
          date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          preAtlas: atlasActive ? null : preAtlasRates[i],
          withAtlas: atlasActive ? withAtlasRates[i - 6] : null,
          atlasActive,
        };
      });

      return res.json({
        segments,
        days,
        preAtlasHeatmap,
        withAtlasHeatmap,
        holdImpact,
        unsubTrend,
        preservedSubscribers: hv.preservedSubscribers   ?? 12400,
        preservedAnnualRevenue: hv.preservedRevenue     ?? 186000,
        unsubReduction: hv.unsubReductionPct            ?? 50,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/hearst/revenue — Screen 6 data
  router.get("/demo-api/hearst/revenue", async (_req, res) => {
    const waterfall = [
      { stage: "Emails Sent", value: 8200000, cumulative: 8200000, type: "count", label: "8.2M" },
      { stage: "Opens", value: 2800000, cumulative: 2800000, rate: 34.1, type: "count", label: "2.8M (34.1%)" },
      { stage: "Clicks", value: 420000, cumulative: 420000, rate: 15.0, type: "count", label: "420K (15% CTO)" },
      { stage: "Subscriptions", value: 128000, cumulative: 128000, type: "revenue", label: "$128K (3,200 conversions)" },
      { stage: "Affiliate", value: 62000, cumulative: 190000, type: "revenue", label: "$62K (85K clicks)" },
      { stage: "Ad Revenue", value: 34000, cumulative: 224000, type: "revenue", label: "$34K (2.8M impressions)" },
      { stage: "Total Revenue", value: 224000, cumulative: 224000, type: "total", label: "$224K" },
    ];

    const brandRevenue = [
      { brand: "Country Living", revenue: 42000, color: "#3E6B3E", insight: "Home/garden affiliate drives highest AOV" },
      { brand: "Cosmopolitan", revenue: 38000, color: "#E91E8C", insight: "Premium content drives subscription upgrades" },
      { brand: "Good Housekeeping", revenue: 35000, color: "#2E7D32", insight: "Product reviews fuel affiliate conversions" },
      { brand: "Elle", revenue: 28000, color: "#1A1A1A", insight: "Fashion affiliate + subscription lift" },
      { brand: "Men's Health", revenue: 22000, color: "#1565C0", insight: "Fitness supplement affiliate" },
      { brand: "Harper's Bazaar", revenue: 21000, color: "#C9A84C", insight: "Luxury fashion affiliate" },
      { brand: "Runner's World", revenue: 20000, color: "#E65100", insight: "Race entry + gear affiliate" },
      { brand: "Esquire", revenue: 18000, color: "#1B3A6B", insight: "Premium subscriptions" },
    ];

    const aiInsights = [
      { type: "insight", icon: "💡", title: "Wellness outperforms Beauty 2.3x", body: "Wellness content outperforms beauty content by 2.3× on engagement and 1.8× on revenue for the 25–34 female segment. Recommend shifting 20% of Cosmo's beauty inventory to wellness for this segment.", metric: "+1.8x revenue", urgency: "medium" },
      { type: "insight", icon: "💡", title: "Personalized send times +37.4% open rate", body: "Subscribers receiving personalized send times open at 37.4% vs. 26.8% for default-time sends. The lift is strongest for European subscribers (+48%) due to timezone correction.", metric: "+10.6pp lift", urgency: "low" },
      { type: "warning", icon: "⚠️", title: "Esquire readership segment drift detected", body: "Engagement data shows Esquire's active readers are skewing toward Career & Finance over traditional Style content. Atlas is automatically redistributing Esquire subscriber allocation before unsubscribe rates signal the shift.", metric: "Segment Drift", urgency: "high" },
      { type: "success", icon: "✅", title: "HOLD decisions preserved $186K ARR", body: "12,400 subscribers who would have unsubscribed under the old model are still active. HOLD decisions this week preserved an estimated $186K in annual recurring subscriber revenue.", metric: "$186K preserved", urgency: "low" },
    ];

    const lastWeekRevenue = 156000;
    const thisWeekRevenue = 224000;
    const lift = parseFloat(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue * 100).toFixed(1));

    return res.json({ waterfall, brandRevenue, aiInsights, lastWeekRevenue, thisWeekRevenue, lift });
  });

  // GET /demo-api/hearst/live-run — SSE live pipeline execution
  router.get("/demo-api/hearst/live-run", hearstLiveRunHandler);

  // ============================================================
  // END HEARST DEMO ROUTES
  // ============================================================

  // ============================================================
  // FITCH AQEWS DEMO ROUTES (Task #81)
  // ============================================================

  // POST /demo-api/fitch/setup
  router.post("/demo-api/fitch/setup", async (_req, res) => {
    try {
      await ensureFitchAgents();
      res.json({ success: true, message: "Fitch agents ready" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/fitch/agent-runs — All 6 Fitch agent last runs from real platform tables
  router.get("/demo-api/fitch/agent-runs", async (req, res) => {
    try {
      await ensureFitchAgents();

      const pipeline = getFitchPipelineAgentNames();

      const results = await Promise.all(
        pipeline.map(async ({ key, name }) => {
          const agentId = getFitchAgentIdByName(name);
          if (!agentId) {
            return { key, agentId: null, agentName: name, agentStatus: "idle", runId: null, runStatus: null, triggerType: null, startedAt: null, completedAt: null, latencyMs: null, resultSummary: null };
          }
          const [agent, runs] = await Promise.all([
            storage.getAgent(agentId, getOrgId(req)),
            storage.getAgentRuntimeRuns(agentId),
          ]);

          const lastRun = runs
            .filter((r: any) => r.status === "completed" && r.completedAt)
            .sort((a: any, b: any) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];

          return {
            key,
            agentId,
            agentName: agent?.name || name,
            agentStatus: (agent as any)?.status || "active",
            runId: lastRun?.id || null,
            runStatus: lastRun?.status || null,
            triggerType: lastRun?.triggerType || null,
            startedAt: lastRun?.startedAt || null,
            completedAt: lastRun?.completedAt || null,
            latencyMs: lastRun?.latencyMs || null,
            resultSummary: lastRun?.resultSummary || null,
          };
        })
      );

      return res.json({ agentRuns: results });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /demo-api/fitch/live-run — SSE live pipeline execution
  router.get("/demo-api/fitch/live-run", fitchLiveRunHandler);

  // ============================================================
  // END FITCH DEMO ROUTES
  // ============================================================


  // ── Kinective Demo: one-click COA pipeline run ──────────────────────────────
  // ── Kinective ensure-agent (registered directly on app for reliable Express 5 routing) ──
  router.post("/demo-api/kinective/ensure-agent", async (req, res) => {
    const { kinectiveEnsureAgentHandler } = await import("../demo-routes");
    return kinectiveEnsureAgentHandler(req, res);
  });

  router.post("/demo-api/kinective/run-pipeline", async (req, res) => {
    try {
      const { scenario } = req.body || {};
      const validScenarios = ["happy", "invalid_address", "system_failure"];
      const selectedScenario = validScenarios.includes(scenario) ? scenario : "happy";

      const KINECTIVE_AGENT_ID = "c4b3099f-dfd8-4cce-9cf4-0cbb031f7f73";

      const { resetKinectiveDemo, setKinectiveTraceId, setKinectiveRunning, isKinectiveRunning, getEnabledSystems, getRunGeneration } = await import("../kinective-demo-store");

      if (isKinectiveRunning()) {
        return res.status(409).json({ error: "Pipeline already running. Please wait for current run to complete." });
      }

      const enabledSystems = getEnabledSystems();
      const isEnabled = (key: string) => enabledSystems.some((s) => s.toLowerCase().includes(key.toLowerCase()));

      const happySteps: string[] = [
        `1. Call get_form_data with form_id "COA-2026-00412" to retrieve the signed form`,
        `2. Call validate_address with street "1847 Lakewood Drive", city "Austin", state "TX", zip "78701"`,
      ];
      let stepNum = 3;
      if (isEnabled("Gateway") || isEnabled("Core Banking")) {
        happySteps.push(`${stepNum++}. Call update_member_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Digital Banking") || isEnabled("Alkami")) {
        happySteps.push(`${stepNum++}. Call update_digital_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Statement")) {
        happySteps.push(`${stepNum++}. Call update_statement_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Card")) {
        happySteps.push(`${stepNum++}. Call update_card_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Loan")) {
        happySteps.push(`${stepNum++}. Call update_loan_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("CRM") || isEnabled("Salesforce")) {
        happySteps.push(`${stepNum++}. Call update_crm_contact with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Bill Pay")) {
        happySteps.push(`${stepNum++}. Call update_bill_pay_address with member_id "MBR-2026-84291" and the new address`);
      }
      if (isEnabled("Fraud")) {
        happySteps.push(`${stepNum++}. Call flag_address_change with member_id "MBR-2026-84291", old and new addresses`);
      }
      if (isEnabled("BSA") || isEnabled("Compliance") || isEnabled("AML")) {
        happySteps.push(`${stepNum++}. Call log_bsa_event with member_id "MBR-2026-84291", event_type "address_change"`);
        happySteps.push(`${stepNum++}. Call create_compliance_record with member_id "MBR-2026-84291", status "complete"`);
      }
      if (isEnabled("SignPlus")) {
        happySteps.push(`${stepNum++}. Call archive_signed_document with form_id "COA-2026-00412" and member_id "MBR-2026-84291"`);
      }
      if (isEnabled("Notification") || isEnabled("Member Notification")) {
        happySteps.push(`${stepNum++}. Call notify_digital_banking with member_id "MBR-2026-84291" and confirmation message`);
      }

      const HAPPY_PROMPT = `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps in order. Call each tool exactly once:

${happySteps.join("\n")}

Complete all steps. Log every action.`;

      const INVALID_ADDRESS_PROMPT = `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps:

1. Call get_form_data with form_id "COA-2026-00412" to retrieve the signed form
2. Call validate_address with street "1847 Lakewod Drve", city "Austin", state "TX", zip ""
3. The validation will return valid=false. When it does:
   - Call log_action with action "VALIDATION_FAILED", system "USPS", details "Address not found in USPS database. Routing to human review."
   - Call create_compliance_record with member_id "MBR-2026-84291", status "pending_review", details "USPS validation failed. Address change routed to manual review."
   - STOP. Do NOT call any system update tools. The member address must remain unchanged.

Log every action.`;

      const SYSTEM_FAILURE_PROMPT = `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps in order:

1. Call get_form_data with form_id "COA-2026-00412"
2. Call validate_address with street "1847 Lakewood Drive", city "Austin", state "TX", zip "78701"
3. Call update_member_address with member_id "MBR-2026-84291" — success
4. Call update_digital_address with member_id "MBR-2026-84291" — success
5. Call update_statement_address with member_id "MBR-2026-84291" — success
6. Call update_bill_pay_address with member_id "MBR-2026-84291" — success
7. Call update_loan_address with member_id "MBR-2026-84291" — success
8. Call update_crm_contact with member_id "MBR-2026-84291" — success
9. Call flag_address_change with member_id "MBR-2026-84291"
10. Call update_card_address with member_id "MBR-2026-84291" — this will return a TIMEOUT error
11. The card update failed. Now initiate rollback:
    - Call log_action with action "SYSTEM_FAILURE", system "Card Management", details "PSCU card management timeout after 3 retries. Initiating rollback for data consistency."
    - Call rollback_address_update with member_id "MBR-2026-84291", system "loan-origination", reason "Card management failure — rolling back for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "crm", reason "Card management failure — rolling back for data consistency"
12. Call create_compliance_record with member_id "MBR-2026-84291", status "partial_failure"
13. Call log_action with action "RETRY_SCHEDULED", system "ATLAS", details "Card management retry scheduled for next maintenance window. Ops ticket opened."

Log every action.`;

      const prompts: Record<string, string> = {
        happy: HAPPY_PROMPT,
        invalid_address: INVALID_ADDRESS_PROMPT,
        system_failure: SYSTEM_FAILURE_PROMPT,
      };

      const agent = await storage.getAgent(KINECTIVE_AGENT_ID);
      if (!agent) return res.status(404).json({ error: "Kinective Change of Address Agent not found" });

      resetKinectiveDemo(selectedScenario);
      setKinectiveRunning(true);
      const thisGeneration = getRunGeneration();

      const allDeployments = await storage.getDeployments(getOrgId(req));
      let deployment = allDeployments.find(
        (d) => d.agentId === KINECTIVE_AGENT_ID && d.environment === "staging" && d.status !== "rolled_back"
      );
      if (!deployment) {
        deployment = await storage.createDeployment({
          agentId: KINECTIVE_AGENT_ID,
          environment: "staging",
          version: "1.0.0",
          status: "active",
          rolloutStrategy: "direct",
          // trafficPercentage (not in schema): 100,
        });
      }
      if (await isRuntimeActive(deployment.id)) {
        await stopAgentRuntime(deployment.id);
      }

      const selectedPrompt = prompts[selectedScenario];
      const maxSteps = selectedScenario === "invalid_address" ? 10 : 25;

      (async () => {
        try {
          console.log(`[kinective-pipeline] Starting COA agent (scenario=${selectedScenario})`);
          const result = await runAgentOnce(deployment!.id, selectedPrompt, maxSteps);
          console.log(`[kinective-pipeline] Agent complete.`);

          if (getRunGeneration() !== thisGeneration) {
            console.log(`[kinective-pipeline] Run superseded by reset — discarding results`);
            return;
          }


          const traces = await storage.getTracesByAgent(KINECTIVE_AGENT_ID);
          if (traces.length > 0) {
            const sorted = [...traces].sort((a, b) =>
              new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
            );
            setKinectiveTraceId(sorted[0].id);
          }
          setKinectiveRunning(false);
        } catch (err: any) {
          console.error("[kinective-pipeline] Error:", err.message);
          if (getRunGeneration() === thisGeneration) setKinectiveRunning(false);
        }
      })();

      return res.json({
        started: true,
        deploymentId: deployment.id,
        scenario: selectedScenario,
        message: `Kinective COA pipeline started (scenario: ${selectedScenario}). Agent is processing form COA-2026-00412.`,
      });
    } catch (err: any) {
      console.error("[demo-api/kinective/run-pipeline]", err);
      return res.status(500).json({ error: err.message || "Failed to run Kinective pipeline" });
    }
  });

  // ── Kinective Demo: submit-coa — acknowledges COA; SSE stream handles reset + agent ──
  router.post("/demo-api/kinective/submit-coa", async (req, res) => {
    try {
      const { scenario } = req.body || {};
      const validScenarios = ["happy", "invalid_address", "system_failure"];
      const selectedScenario = validScenarios.includes(scenario) ? scenario : "happy";

      // Do NOT reset state here — resetKinectiveDemo sets running=true which would
      // cause the SSE stream endpoint to immediately reject with "already running".
      // The SSE /kinective/stream endpoint resets state itself at run start.

      return res.json({
        started: true,
        scenario: selectedScenario,
        formId: "COA-2026-00412",
        webhookId: `WH-${Date.now().toString(36).toUpperCase()}`,
        memberId: "MBR-2026-84291",
        memberName: "Sarah Mitchell",
        message: "COA request received. Open /demo-api/kinective/stream to begin agent processing.",
      });
    } catch (err: any) {
      console.error("[demo-api/kinective/submit-coa]", err);
      return res.status(500).json({ error: err.message || "Failed to submit COA" });
    }
  });
  // ── Kinective Demo: full demo reset ─────────────────────────────────────────
  router.post("/demo-api/kinective/full-reset", async (_req, res) => {
    try {
      const { fullResetKinectiveDemo } = await import("../kinective-demo-store");
      fullResetKinectiveDemo();
      res.json({ success: true, scenario: "happy" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── BlackRock Use Case 2: Partner Portal Registry MCP Server ────────────────


export { ensureHearstAgents, ensureFitchAgents };
export default router;
