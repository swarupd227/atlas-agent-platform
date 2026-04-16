import { Router } from "express";
import { hearstLiveRunHandler, ensureHearstAgents } from "../hearst-live-run";
import { fitchLiveRunHandler, ensureFitchAgents, getFitchPipelineAgentNames, getFitchAgentIdByName } from "../fitch-live-run";
import { fitchRWLiveRunHandler, fitchRWSetupHandler, fitchRWResetHandler, getFitchRWAgentRuns } from "../fitch-rw-live-run";
import { littlerLiveRunHandler } from "../littler-live-run";
import { otcQuoteLiveRunHandler } from "../otc-quote-live-run";
import { otcOrderLiveRunHandler, getOtcOrderAgentRuns, resetOtcOrderDemo, ensureOtcOrderAgents } from "../otc-order-live-run";
import { pkgSchedLiveRunHandler, resetPkgSchedDemo, getPkgSchedAgentRuns } from "../pkg-sched-live-run";
import { onespanLiveRunHandler, onespanSetupHandler, onespanResetHandler, getOnespanAgentRuns } from "../onespan-live-run";

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

  // ============================================================
  // LITTLER MENDELSON DEMO ROUTES
  // Multi-State Policy Compliance Engine
  // ============================================================

  // GET /demo-api/littler/compliance-run — SSE live compliance analysis
  router.get("/demo-api/littler/compliance-run", littlerLiveRunHandler);

  // ============================================================
  // END LITTLER DEMO ROUTES
  // ============================================================

  // ============================================================
  // OTC QUOTE DEMO ROUTES — Intelligent Quote Configuration
  // NovaTech Industries · Meridian Manufacturing · Q-78432
  // ============================================================

  // GET /demo-api/otc-quote/live-run — SSE 4-step quote pipeline
  router.get("/demo-api/otc-quote/live-run", otcQuoteLiveRunHandler);

  // ============================================================
  // END OTC QUOTE DEMO ROUTES
  // ============================================================

  // ============================================================
  // OTC ORDER DEMO ROUTES — Order Validation & Promise Engine
  // NovaTech Industries · Meridian Manufacturing · ORD-2026-78432
  // ============================================================

  router.post("/demo-api/otc-order/setup", async (req, res) => {
    try {
      await ensureOtcOrderAgents();
      res.json({ ok: true, message: "OTC Order agents and MCP servers ready." });
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e?.message ?? "Setup failed" });
    }
  });
  router.get("/demo-api/otc-order/live-run",   otcOrderLiveRunHandler);
  router.get("/demo-api/otc-order/agent-runs", getOtcOrderAgentRuns);
  router.post("/demo-api/otc-order/reset",     resetOtcOrderDemo);

  // ============================================================
  // END OTC ORDER DEMO ROUTES
  // ============================================================

  // ============================================================
  // ADVANTIVE SCN-1.1 — PACKAGING SCHEDULING DEMO ROUTES
  // ============================================================

  // GET /demo-api/pkg-sched/live-run  — SSE stream (4-agent pipeline)
  router.get("/demo-api/pkg-sched/live-run",   pkgSchedLiveRunHandler);

  // GET /demo-api/pkg-sched/agent-runs  — Per-agent run history
  router.get("/demo-api/pkg-sched/agent-runs", async (_req, res) => {
    try {
      const runs = await getPkgSchedAgentRuns();
      return res.json({ runs });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /demo-api/pkg-sched/reset  — Reset pipeline state
  router.post("/demo-api/pkg-sched/reset", (_req, res) => {
    resetPkgSchedDemo();
    return res.json({ ok: true, message: "PKG scheduling demo state reset." });
  });

  // ============================================================
  // END ADVANTIVE SCN-1.1 PACKAGING SCHEDULING DEMO ROUTES
  // ============================================================

  // ============================================================
  // ONESPAN SCN-OS-1.0 — DIGITAL AGREEMENTS INTELLIGENCE DEMO
  // ============================================================

  // GET /demo-api/onespan/live-run  — SSE stream (4-agent pipeline)
  router.get("/demo-api/onespan/live-run", onespanLiveRunHandler);

  // GET /demo-api/onespan/agent-runs  — Per-agent run history
  router.get("/demo-api/onespan/agent-runs", getOnespanAgentRuns);

  // POST /demo-api/onespan/setup  — Force-provision all agents
  router.post("/demo-api/onespan/setup", onespanSetupHandler);

  // POST /demo-api/onespan/reset  — Clear run history
  router.post("/demo-api/onespan/reset", onespanResetHandler);

  // ============================================================
  // END ONESPAN SCN-OS-1.0 DIGITAL AGREEMENTS INTELLIGENCE DEMO
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

  // ─── Shared real-agent execution helpers for all 6 SH demos ─────────────────
  // Each stage of the demo fires runAgentOnce() with a stage-specific prompt so
  // the agent actually executes via LLM, creating real Runs & Traces records.

  async function ensureSHAgentDeployment(agent: any, orgId: string): Promise<string> {
    const allDeps = await storage.getDeploymentsByAgentId(agent.id, undefined, orgId);
    const live = allDeps.find(d => ["active", "deployed", "promoted"].includes(d.status));
    if (live) return live.id;
    const dep = await storage.createDeployment({
      agentId: agent.id,
      agentName: agent.name,
      environment: "prod",
      status: "active",
      industry: (agent.runtimeConfig as any)?.industry || "general",
      organizationId: orgId,
    } as any);
    return dep.id;
  }

  function fireSHAgentStage(deploymentId: string, stagePrompt: string): void {
    // Non-blocking: pipeline UI advances deterministically; LLM execution
    // happens in the background and writes the real run_trace record.
    runAgentOnce(deploymentId, stagePrompt, 4).catch((err: any) =>
      console.error("[sh-demo] runAgentOnce error:", err.message)
    );
  }

  // ─── Self-Healing Healthcare Live Demo ────────────────────────────────────────
  // Server-side state machine: one active demo session at a time.
  // Incident auto-advances through stages with realistic delays so the prospect
  // can watch Atlas detect → diagnose → hypothesize → remediate → resolve in
  // roughly 95 seconds of wall-clock time.

  type SHLiveDemoState = {
    status: "idle" | "running" | "complete";
    pipelineId: string | null;
    triggeredAt: Date | null;
    completedAt: Date | null;
    agentId: string | null;
    deploymentId: string | null;
  };

  let shHealthDemo: SHLiveDemoState = {
    status: "idle",
    pipelineId: null,
    triggeredAt: null,
    completedAt: null,
    agentId: null,
    deploymentId: null,
  };

  const SH_STAGE_SEQUENCE: Array<{ stage: string; delayMs: number }> = [
    { stage: "diagnosed",   delayMs: 25_000 },
    { stage: "hypothesis",  delayMs: 20_000 },
    { stage: "remediation", delayMs: 20_000 },
    { stage: "resolved",    delayMs: 30_000 },
  ];

  async function buildStagePatch(stage: string): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = { stage };

    if (stage === "diagnosed") {
      patch.diagnosisDetails = {
        rootCause: "RxNorm value set version mismatch — EHR upgraded to 2025-03-01 release without coordinating with FHIR validation service",
        skillsInvoked: [
          {
            skillName: "Batch Anomaly Triage Skill",
            description: "Monitors FHIR batch ingestion error rates using CUSUM change-point detection.",
            finding: "Error rate spike to 18.4% detected within 4 minutes. Pattern: schema_change (confidence 0.94)",
            duration: "4 minutes",
          },
          {
            skillName: "FHIR Schema Validation Skill",
            description: "Validates FHIR R4 resources against HL7 schema and active value set versions.",
            finding: "1,847 MedicationRequest resources failing. Breaking change: RxNorm codes not found in active value set",
            duration: "8 minutes",
          },
          {
            skillName: "Drug-Interaction Cross-Check Skill",
            description: "Cross-checks patient medication lists against contraindication databases.",
            finding: "312 patients with medication gaps. 3 contraindicated pairs — IMMEDIATE clinical alerts. 47 serious interactions for pharmacist review.",
            duration: "12 minutes",
          },
        ],
        affectedPatients: 312,
        criticalPatients: 3,
        affectedResources: 1847,
        detectionLatency: "4 minutes (vs ~2.5 hours without Atlas monitoring)",
      };
    } else if (stage === "hypothesis") {
      patch.hypothesis = {
        confidence: 0.96,
        primaryHypothesis: "EHR vendor RxNorm value set version change broke FHIR validation. Non-breaking fix: update FHIR profile to accept both old and new codes. Vendor rollback requested in parallel.",
        runbookCandidates: [
          {
            runbookName: "FHIR Schema Drift Response",
            triggerCondition: "breaking schema change confirmed",
            expectedOutcome: "Lenient validation mode activated; vendor contacted; affected records quarantined",
            estimatedDuration: "45 minutes",
          },
          {
            runbookName: "Clinical Data Batch Revalidation Protocol",
            triggerCondition: "feed restored and profile updated",
            expectedOutcome: "All 1,847 records revalidated; drug-interaction checks restored",
            estimatedDuration: "60 minutes",
          },
        ],
      };
    } else if (stage === "remediation") {
      patch.remediation = {
        status: "in_progress",
        runbooksTriggered: [
          {
            runbookName: "FHIR Schema Drift Response",
            status: "completed",
            result: "Lenient validation mode activated. EHR vendor contacted — rollback ETA 2 hours. 312 patients in pharmacist review queue.",
          },
          {
            runbookName: "Clinical Informatics Escalation Protocol",
            status: "completed",
            result: "Clinical Informatics on-call paged. CMIO briefed on 3 critical patient exposures. No harm events confirmed.",
          },
        ],
        policiesEnforced: [
          {
            policyName: "Patient Safety Guardrail Policy",
            rule: "Contraindicated Interaction Hold",
            decision: "BLOCKED automated processing for 3 critical patients. Clinical hold activated.",
            outcome: "No autonomous action on contraindicated patients",
          },
          {
            policyName: "HIPAA Data Handling Policy",
            rule: "Access Audit Logging",
            decision: "All PHI access during healing logged with patient tokens only",
            outcome: "100% audit trail maintained",
          },
        ],
      };
      patch.businessImpact = {
        withAtlas: "Detected in 4 min. Clinical holds activated in 12 min. Full remediation in 28 min. 0 patient harm events.",
        withoutAtlas: "Detection: 2.5 hours. Remediation: 6–8 FTE-hours. Drug-interaction offline 8+ hours.",
        patientsAtRisk: 312,
        criticalSafetyExposure: "3 patients with contraindicated drug combinations had interaction checks offline for 4.2 hours",
        financialExposure: "$0 achieved vs est. $2.4M liability exposure from undetected contraindicated interactions",
        complianceExposure: "HIPAA: Potential breach notification if harm had occurred",
        estimatedExposureWindow: "4.2 hours",
      };
      patch.industryGuardrails = [
        { framework: "HIPAA Security Rule",      constraint: "PHI minimization — patient tokens only in logs",           status: "enforced" },
        { framework: "FDA 21 CFR Part 11",       constraint: "Immutable audit trail for all record modifications",       status: "enforced" },
        { framework: "HL7 FHIR R4",              constraint: "No non-conformant resources committed to production",      status: "enforced" },
        { framework: "Patient Safety Guardrail", constraint: "Clinical hold on contraindicated patients — no auto-action", status: "enforced" },
      ];
    } else if (stage === "resolved") {
      patch.resolution = {
        atlasAutonomousActions: [
          "Feed anomaly detected in 4 minutes",
          "Schema drift classified in 12 minutes",
          "3 critical patients placed on clinical hold immediately",
          "312 patients routed to pharmacist review queue",
          "EHR vendor contacted with RxNorm diff report",
          "Lenient validation mode activated for non-breaking changes",
        ],
        requiresHumanAction: [
          "Pharmacist review of 47 serious interaction cases",
          "Clinical Informatics sign-off to complete reconciliation",
          "EHR vendor coordination for permanent RxNorm fix",
        ],
        withoutAtlas: "Manual detection ~2.5 hours later. Reconciliation of 1,847 records: 6–8 hours for 2–3 FTEs. Drug-interaction offline throughout.",
      };
      patch.resolvedAt = new Date();
      patch.status = "resolved";
    }

    return patch;
  }

  const SH_HEALTH_STAGE_PROMPTS: Record<string, string> = {
    detected:    "URGENT: FHIR batch ingestion error rate has spiked to 18.4%. RxNorm value set version mismatch detected across 1,847 MedicationRequest resources. Drug-interaction validation is offline for 312 patients. Begin autonomous investigation per HIPAA and FDA 21 CFR Part 11 protocols.",
    diagnosed:   "Root cause confirmed: RxNorm value set version mismatch caused by EHR vendor upgrade to 2025-03-01 release without prior coordination. 1,847 MedicationRequest resources failing. 312 patients have medication gaps including 3 critical contraindicated drug pairs requiring immediate clinical holds. Formulate remediation hypothesis.",
    hypothesis:  "Formulating remediation plan. Primary hypothesis: activate lenient FHIR validation mode to accept both old and new RxNorm codes; simultaneously request EHR vendor rollback. Execute FHIR Schema Drift Response runbook and route 312 affected patients to pharmacist review queue with immediate clinical hold for 3 critical patients.",
    remediation: "Executing remediation. Activating lenient validation mode per FHIR Schema Drift Response runbook. Routing 312 patients to pharmacist review queue. Activating clinical hold for 3 critical contraindicated patients per Patient Safety Guardrail Policy. Paging Clinical Informatics on-call. Briefing CMIO. Ensuring HIPAA audit logging maintained throughout.",
    resolved:    "Validating resolution. Confirming all autonomous actions complete: lenient validation mode active, 312 patients in pharmacist review queue, 3 critical patients on clinical hold, EHR vendor contacted with RxNorm diff report. Drug-interaction validation restored. Compiling HIPAA, FDA 21 CFR Part 11, and HL7 FHIR R4 compliance audit trail.",
  };

  function scheduleNextStage(pipelineId: string, seqIdx: number) {
    if (seqIdx >= SH_STAGE_SEQUENCE.length) {
      shHealthDemo.status = "complete";
      shHealthDemo.completedAt = new Date();
      return;
    }
    const { stage, delayMs } = SH_STAGE_SEQUENCE[seqIdx];
    setTimeout(async () => {
      if (shHealthDemo.pipelineId !== pipelineId) return;
      try {
        const patch = await buildStagePatch(stage);
        await storage.updateHealingPipeline(pipelineId, patch as any);
        if (shHealthDemo.deploymentId) {
          fireSHAgentStage(shHealthDemo.deploymentId, SH_HEALTH_STAGE_PROMPTS[stage] || stage);
        }
        scheduleNextStage(pipelineId, seqIdx + 1);
      } catch (err: any) {
        console.error("[demo/sh-health] stage advance error:", err.message);
      }
    }, delayMs);
  }

  router.post("/api/demo/sh-health/trigger", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const allAgents = await storage.getAgents(orgId);
      const agent = allAgents.find(a => a.name === "Clinical Data Integrity Monitor");
      if (!agent) return res.status(404).json({ message: "Clinical Data Integrity Monitor agent not found" });

      // Clean up previous demo run
      if (shHealthDemo.pipelineId) {
        await storage.deleteHealingPipeline(shHealthDemo.pipelineId).catch(() => {});
      }

      // Ensure a deployment exists so runAgentOnce can create real Runs & Traces
      const deploymentId = await ensureSHAgentDeployment(agent, orgId);

      const newPipeline = await storage.createHealingPipeline({
        title: "FHIR EHR Feed Schema Drift — Drug-Interaction Validation Gap",
        agentId: agent.id,
        agentName: agent.name,
        industry: "healthcare",
        severity: "critical",
        priority: "critical",
        stage: "detected",
        issueType: "schema_drift",
        issueDescription: "FHIR batch ingestion error rate spiked to 18.4%. RxNorm value set version mismatch detected across 1,847 MedicationRequest resources. Drug-interaction validation offline for 312 patients.",
        triggerSource: "atlas_monitoring",
      } as any);

      shHealthDemo = {
        status: "running",
        pipelineId: newPipeline.id,
        triggeredAt: new Date(),
        completedAt: null,
        agentId: agent.id,
        deploymentId,
      };

      // Fire the real agent for the detect stage immediately
      fireSHAgentStage(deploymentId, SH_HEALTH_STAGE_PROMPTS.detected);
      scheduleNextStage(newPipeline.id, 0);

      res.json({ pipelineId: newPipeline.id, agentId: agent.id, message: "Demo incident triggered" });
    } catch (err: any) {
      console.error("[demo/sh-health/trigger]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/api/demo/sh-health/status", async (_req, res) => {
    try {
      let pipeline = null;
      if (shHealthDemo.pipelineId) {
        pipeline = await storage.getHealingPipeline(shHealthDemo.pipelineId) ?? null;
      }
      const elapsedSeconds = shHealthDemo.triggeredAt
        ? Math.floor((Date.now() - shHealthDemo.triggeredAt.getTime()) / 1000)
        : 0;
      res.json({
        status: shHealthDemo.status,
        triggeredAt: shHealthDemo.triggeredAt,
        completedAt: shHealthDemo.completedAt,
        elapsedSeconds,
        pipeline,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/api/demo/sh-health/reset", async (_req, res) => {
    try {
      if (shHealthDemo.pipelineId) {
        await storage.deleteHealingPipeline(shHealthDemo.pipelineId).catch(() => {});
      }
      shHealthDemo = { status: "idle", pipelineId: null, triggeredAt: null, completedAt: null, agentId: null, deploymentId: null };
      res.json({ message: "Demo reset to idle" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Self-Healing Financial / Fraud Demo Live Session ────────────────────────

  type SHFinLiveDemoState = {
    status: "idle" | "running" | "complete";
    pipelineId: string | null;
    triggeredAt: Date | null;
    completedAt: Date | null;
    agentId: string | null;
    deploymentId: string | null;
  };

  let shFinDemo: SHFinLiveDemoState = {
    status: "idle",
    pipelineId: null,
    triggeredAt: null,
    completedAt: null,
    agentId: null,
    deploymentId: null,
  };

  const SH_FIN_STAGE_SEQUENCE: Array<{ stage: string; delayMs: number }> = [
    { stage: "diagnosed",   delayMs: 25_000 },
    { stage: "hypothesis",  delayMs: 20_000 },
    { stage: "remediation", delayMs: 20_000 },
    { stage: "resolved",    delayMs: 30_000 },
  ];

  async function buildFinStagePatch(stage: string): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = { stage };

    if (stage === "diagnosed") {
      patch.diagnosisDetails = {
        rootCause: "Population shift: BNPL merchant category (MCC 6012) grew 340% over 60 days — severely underrepresented in champion model training data",
        driftPSI: 0.31,
        skillsInvoked: [
          {
            skillName: "Model Precision Monitoring Skill",
            description: "Tracks real-time fraud model precision using rolling 4-hour windows with CUSUM alerting.",
            finding: "Precision collapsed from 95.2% to 87.1% over 6 hours. 47 false negatives detected. BNPL cohort over-represented at 340%.",
            duration: "6 hours continuous — alert triggered at threshold breach",
          },
          {
            skillName: "Feature Drift Analysis Skill",
            description: "Identifies which feature distributions have shifted to explain model performance degradation.",
            finding: "BNPL merchant category (MCC 6012) 340% over-represented vs training distribution. Geographic Zone 7 FPR: 38%.",
            duration: "28 minutes",
          },
          {
            skillName: "Challenger Model Evaluation Skill",
            description: "Evaluates alternative model candidates against 30-day hold-out data.",
            finding: "Challenger v4.2.1 (BNPL-augmented): Precision 93.6%, FPR 2.8%, Gini coefficient +9pp vs champion. Approved for shadow deployment.",
            duration: "45 minutes",
          },
        ],
        falseNegativesLast24h: 47,
        estimatedFraudExposure: 284000,
        precisionDrop: { from: 95.2, to: 87.1 },
        falseNegativesPerHour: 2,
      };
    } else if (stage === "hypothesis") {
      patch.hypothesis = {
        confidence: 0.97,
        primaryHypothesis: "Activate pre-trained challenger fraud-model-v4.2.1-bnpl-augmented via shadow mode traffic split, then execute zero-downtime champion-challenger cutover once validation passes.",
        runbookCandidates: [
          {
            runbookName: "Shadow Challenger Model Activation",
            triggerCondition: "Challenger shows +2pp improvement over champion in shadow traffic",
            expectedOutcome: "12,847 transactions sampled. 94.1% agreement. Cutover approved.",
            estimatedDuration: "4h shadow + 90s zero-downtime cutover",
          },
          {
            runbookName: "Regulatory Model Change Notification",
            triggerCondition: "Gini coefficient improvement exceeds 5pp (SR 11-7 material change threshold)",
            expectedOutcome: "SR 11-7 documentation package prepared and submitted to Model Risk Committee",
            estimatedDuration: "15 minutes automated documentation",
          },
        ],
      };
    } else if (stage === "remediation") {
      patch.remediation = {
        status: "in_progress",
        runbooksTriggered: [
          {
            runbookName: "Shadow Challenger Model Activation",
            status: "completed",
            result: "12,847 transactions sampled over 4 hours. Challenger agreement 94.1%. Statistical significance achieved. Precision: 93.6% vs champion 87.1%.",
          },
          {
            runbookName: "Regulatory Model Change Notification",
            status: "in_progress",
            result: "SR 11-7 material change package auto-generated. Gini improvement 9pp exceeds 5pp threshold. Model Risk Committee notified — sign-off required before cutover.",
          },
        ],
        policiesEnforced: [
          {
            policyName: "SR 11-7 Model Risk Management Policy",
            rule: "Material Change Documentation",
            decision: "BLOCKED autonomous cutover — Gini improvement 9pp exceeds 5pp material change threshold. Human sign-off required.",
            outcome: "Model Risk Committee sign-off package prepared and submitted",
          },
          {
            policyName: "FCRA Adverse Action Policy",
            rule: "Adverse Action Reason Code Audit",
            decision: "All automated declines during precision drift period logged with reason codes",
            outcome: "100% FCRA audit trail maintained",
          },
          {
            policyName: "PCI-DSS v4.0 Data Handling Policy",
            rule: "Cardholder data minimization in model logs",
            decision: "Transaction IDs only — no raw PAN data in drift analysis logs",
            outcome: "PCI-DSS scope maintained",
          },
        ],
      };
      patch.businessImpact = {
        withAtlas: "Detected within 2h. Challenger validated via 12,847-transaction shadow. SR 11-7 docs auto-generated. Fraud capped at $284K. Zero downtime.",
        withoutAtlas: "Detection at next daily review (18h). Model Risk Committee 3–5 days. $1.4M cumulative fraud exposure.",
        fraudExposurePer24h: 284000,
        falseNegativesPerHour: 2,
        financialExposure: "$284K capped vs est. $1.4M without Atlas",
        precisionRestored: "93.6% (from 87.1%)",
      };
      patch.industryGuardrails = [
        { framework: "SR 11-7",    constraint: "No deployment without validation + Material Change notification for >5pp Gini", status: "enforced" },
        { framework: "FCRA",       constraint: "Adverse action reason codes stored for all automated declines",                  status: "enforced" },
        { framework: "PCI-DSS v4.0", constraint: "No raw cardholder data in model logs or drift analysis",                      status: "enforced" },
        { framework: "GDPR Art. 22", constraint: "Automated decision explainability maintained throughout model switch",         status: "enforced" },
      ];
    } else if (stage === "resolved") {
      patch.resolution = {
        atlasAutonomousActions: [
          "Precision drift detected within 2 hours of onset",
          "BNPL root cause identified in 28 minutes",
          "Challenger v4.2.1 evaluated against 30-day hold-out data",
          "12,847-transaction shadow deployment executed and validated",
          "SR 11-7 material change documentation auto-generated",
          "All FCRA adverse action audit logs maintained",
        ],
        requiresHumanAction: [
          "Model Risk Committee sign-off on material change",
          "Final champion-challenger cutover approval",
        ],
        withoutAtlas: "18h detection lag → 3–5 day committee process → $1.4M cumulative fraud exposure with precision offline.",
      };
      patch.resolvedAt = new Date();
      patch.status = "resolved";
    }

    return patch;
  }

  function scheduleNextFinStage(pipelineId: string, seqIdx: number) {
    if (seqIdx >= SH_FIN_STAGE_SEQUENCE.length) {
      shFinDemo.status = "complete";
      shFinDemo.completedAt = new Date();
      return;
    }
    const { stage, delayMs } = SH_FIN_STAGE_SEQUENCE[seqIdx];
    setTimeout(async () => {
      if (shFinDemo.pipelineId !== pipelineId) return;
      try {
        const patch = await buildFinStagePatch(stage);
        await storage.updateHealingPipeline(pipelineId, patch as any);
        if (shFinDemo.deploymentId) {
          fireSHAgentStage(shFinDemo.deploymentId, SH_FIN_STAGE_PROMPTS[stage] || stage);
        }
        scheduleNextFinStage(pipelineId, seqIdx + 1);
      } catch (err: any) {
        console.error("[demo/sh-fin] stage advance error:", err.message);
      }
    }, delayMs);
  }

  const SH_FIN_STAGE_PROMPTS: Record<string, string> = {
    detected:    "URGENT: Production fraud model precision has dropped from 95.2% to 87.1% over 6 hours. BNPL merchant category (MCC 6012) grew 340% and has shifted the transaction distribution beyond the model training envelope. 47 false negatives detected — estimated $284K fraud exposure. Begin model drift investigation per SR 11-7 and FCRA protocols.",
    diagnosed:   "Root cause confirmed: population shift in BNPL merchant category (MCC 6012). PSI drift score 0.31 exceeds threshold 0.2. Challenger model v4.2.1 BNPL-augmented shows 93.6% precision vs champion 87.1%. Gini coefficient improvement 9pp exceeds SR 11-7 material change threshold of 5pp. Formulate champion-challenger swap plan.",
    hypothesis:  "Formulating remediation plan. Hypothesis: activate pre-trained challenger model v4.2.1-bnpl-augmented in shadow mode for 4-hour traffic split validation on 12,847 transactions. If validation passes, execute zero-downtime cutover. Prepare SR 11-7 material change documentation package for Model Risk Committee approval per FCRA and PCI-DSS requirements.",
    remediation: "Executing remediation. Shadow Challenger Model Activation runbook initiated — sampling 12,847 transactions. Regulatory Model Change Notification auto-generating SR 11-7 material change package. BLOCKING autonomous cutover: Gini improvement 9pp exceeds 5pp material change threshold — Model Risk Committee sign-off required. PCI-DSS cardholder data audit trail maintained.",
    resolved:    "Validating resolution. Shadow challenger validated on 12,847 transactions with 94.1% agreement. SR 11-7 material change documentation submitted to Model Risk Committee. Fraud exposure capped at $284K vs estimated $1.4M without intervention. Zero downtime achieved. Compiling FCRA, PCI-DSS, SR 11-7, and GDPR compliance audit trail.",
  };

  router.post("/api/demo/sh-fin/trigger", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const allAgents = await storage.getAgents(orgId);
      const agent = allAgents.find(a => a.name === "Fraud Detection Model Recovery Agent");
      if (!agent) return res.status(404).json({ message: "Fraud Detection Model Recovery Agent not found" });

      if (shFinDemo.pipelineId) {
        await storage.deleteHealingPipeline(shFinDemo.pipelineId).catch(() => {});
      }

      const deploymentId = await ensureSHAgentDeployment(agent, orgId);

      const newPipeline = await storage.createHealingPipeline({
        title: "Fraud Model Precision Drift — BNPL Merchant Category Population Shift",
        agentId: agent.id,
        agentName: agent.name,
        industry: "financial_services",
        severity: "critical",
        priority: "critical",
        stage: "detected",
        issueType: "model_drift",
        issueDescription: "Production fraud model precision dropped from 95.2% to 87.1% over 6 hours. BNPL merchant category (MCC 6012) growth shifted transaction distribution beyond model training envelope. 47 false negatives — $284K estimated fraud exposure.",
        triggerSource: "atlas_monitoring",
      } as any);

      shFinDemo = {
        status: "running",
        pipelineId: newPipeline.id,
        triggeredAt: new Date(),
        completedAt: null,
        agentId: agent.id,
        deploymentId,
      };

      fireSHAgentStage(deploymentId, SH_FIN_STAGE_PROMPTS.detected);
      scheduleNextFinStage(newPipeline.id, 0);

      res.json({ pipelineId: newPipeline.id, agentId: agent.id, message: "Demo incident triggered" });
    } catch (err: any) {
      console.error("[demo/sh-fin/trigger]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/api/demo/sh-fin/status", async (_req, res) => {
    try {
      let pipeline = null;
      if (shFinDemo.pipelineId) {
        pipeline = await storage.getHealingPipeline(shFinDemo.pipelineId) ?? null;
      }
      const elapsedSeconds = shFinDemo.triggeredAt
        ? Math.floor((Date.now() - shFinDemo.triggeredAt.getTime()) / 1000)
        : 0;
      res.json({
        status: shFinDemo.status,
        triggeredAt: shFinDemo.triggeredAt,
        completedAt: shFinDemo.completedAt,
        elapsedSeconds,
        pipeline,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/api/demo/sh-fin/reset", async (_req, res) => {
    try {
      if (shFinDemo.pipelineId) {
        await storage.deleteHealingPipeline(shFinDemo.pipelineId).catch(() => {});
      }
      shFinDemo = { status: "idle", pipelineId: null, triggeredAt: null, completedAt: null, agentId: null, deploymentId: null };
      res.json({ message: "Demo reset to idle" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Self-Healing Manufacturing / Factory Demo Live Session ──────────────────

  type SHMfgLiveDemoState = {
    status: "idle" | "running" | "complete";
    pipelineId: string | null;
    triggeredAt: Date | null;
    completedAt: Date | null;
    agentId: string | null;
    deploymentId: string | null;
  };

  let shMfgDemo: SHMfgLiveDemoState = {
    status: "idle",
    pipelineId: null,
    triggeredAt: null,
    completedAt: null,
    agentId: null,
    deploymentId: null,
  };

  const SH_MFG_STAGE_SEQUENCE: Array<{ stage: string; delayMs: number }> = [
    { stage: "diagnosed",   delayMs: 25_000 },
    { stage: "hypothesis",  delayMs: 20_000 },
    { stage: "remediation", delayMs: 20_000 },
    { stage: "resolved",    delayMs: 30_000 },
  ];

  async function buildMfgStagePatch(stage: string): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = { stage };

    if (stage === "diagnosed") {
      patch.diagnosisDetails = {
        rootCause: "CNC-Line-7 main spindle bearing exhibiting Stage 3 wear pattern: harmonic distortion at 3× bearing pass frequency outer race (BPFO). Remaining useful life 8–12 days at current production load.",
        vibrationAmplitude: { current: 12.3, baseline: 4.7, threshold: 14.1, unit: "mm/s²" },
        bearingStage: 3,
        predictedDaysToFailure: 10,
        skillsInvoked: [
          {
            skillName: "IoT Vibration Signal Analysis Skill",
            description: "Continuous FFT analysis of 1,024-point vibration waveforms from spindle bearing accelerometers at 25.6 kHz sampling rate.",
            finding: "BPFO harmonic at 3× (187.5 Hz) amplitude: 12.3 mm/s². 162% increase over 14-day rolling baseline. ISO 10816 Zone C/D boundary crossed.",
            duration: "Continuous — alert at 15-minute rolling window breach",
          },
          {
            skillName: "Bearing Wear Classification Skill",
            description: "ML classifier trained on 2,400 historical bearing failure signatures across 18 CNC machine types. Maps FFT features to ISO 13373 wear stages.",
            finding: "Stage 3 classification (confidence 94%). Predicted failure window: 8–12 days. Immediate maintenance window scheduling recommended.",
            duration: "22 minutes",
          },
          {
            skillName: "Production Impact Analysis Skill",
            description: "Evaluates active production orders on affected equipment and calculates rerouting feasibility to alternate machines.",
            finding: "3 active orders (OD-4417, OD-4421, OD-4433) on CNC-Line-7. CNC-Line-5 has 34% spare capacity — certified for all 3 part families.",
            duration: "8 minutes",
          },
        ],
        activeOrders: [
          { orderId: "OD-4417", partFamily: "Turbine Housing Bracket", quantity: 240, dueDate: "2026-04-18" },
          { orderId: "OD-4421", partFamily: "Hydraulic Manifold Block", quantity: 96,  dueDate: "2026-04-20" },
          { orderId: "OD-4433", partFamily: "Drive Shaft Collar",      quantity: 180, dueDate: "2026-04-22" },
        ],
        estimatedFailureCost: 340000,
        scheduledMaintenanceCost: 12000,
      };
    } else if (stage === "hypothesis") {
      patch.hypothesis = {
        confidence: 0.94,
        primaryHypothesis: "Schedule bearing replacement during Saturday 02:00–06:00 maintenance window (lowest production demand). Immediately reroute 3 active orders to CNC-Line-5. Apply OSHA-mandated 40% speed reduction on CNC-Line-7 in the interim.",
        runbookCandidates: [
          {
            runbookName: "OSHA Speed Reduction Protocol",
            triggerCondition: "Stage 3 bearing wear — immediate safety action",
            expectedOutcome: "CNC-Line-7 spindle speed reduced to 60% rated RPM. Extends safe operating window by 6 days.",
            estimatedDuration: "3 minutes automated parameter push via MTConnect",
          },
          {
            runbookName: "Optimal Maintenance Window Scheduler",
            triggerCondition: "Bearing replacement required within 10-day window",
            expectedOutcome: "Maintenance slot reserved: Saturday 02:00–06:00. Technician and parts (SKF 6210-2RS/C3) confirmed in CMMS.",
            estimatedDuration: "12 minutes (CMMS + parts availability check)",
          },
          {
            runbookName: "Production Order Rerouting Protocol",
            triggerCondition: "Active orders on affected machine",
            expectedOutcome: "OD-4417, OD-4421, OD-4433 rerouted to CNC-Line-5. ISO 9001 quality cert cross-verified. No schedule slip.",
            estimatedDuration: "18 minutes (ERP update + quality cert verification)",
          },
        ],
      };
    } else if (stage === "remediation") {
      patch.remediation = {
        status: "in_progress",
        runbooksTriggered: [
          {
            runbookName: "OSHA Speed Reduction Protocol",
            status: "completed",
            result: "CNC-Line-7 spindle speed reduced to 60% rated RPM via MTConnect parameter push. Operator notified. Safe operating window extended to T+16 days.",
          },
          {
            runbookName: "Optimal Maintenance Window Scheduler",
            status: "completed",
            result: "Maintenance slot confirmed: Saturday 02:00–06:00. Technician assigned. SKF 6210-2RS/C3 bearing in local inventory (bin A-14). CMMS work order WO-28834 raised.",
          },
          {
            runbookName: "Production Order Rerouting Protocol",
            status: "completed",
            result: "OD-4417, OD-4421, OD-4433 rerouted to CNC-Line-5. ISO 9001 quality certification cross-verified for all 3 part families. ERP updated. No delivery schedule impact.",
          },
        ],
        policiesEnforced: [
          {
            policyName: "OSHA CFR 1910.217 Machine Safety Policy",
            rule: "Stage 3 Bearing Wear Speed Restriction",
            decision: "Autonomous 40% spindle speed reduction applied immediately — OSHA non-negotiable safety guardrail",
            outcome: "CNC-Line-7 operating at safe speed. Extended safe window: T+16 days",
          },
          {
            policyName: "ISO 9001 Quality Assurance Policy",
            rule: "Alternate Machine Quality Certification Check",
            decision: "CNC-Line-5 verified against quality certs for Turbine Housing Bracket, Hydraulic Manifold Block, Drive Shaft Collar",
            outcome: "All 3 part families certified on Line-5 — rerouting approved",
          },
          {
            policyName: "IEC 62443 OT Network Security Policy",
            rule: "MTConnect parameter changes require authenticated session",
            decision: "Automated MTConnect push executed under service account MFG-SVC-07 with MFA",
            outcome: "Full audit trail maintained in OT network log",
          },
        ],
      };
      patch.businessImpact = {
        withAtlas: "Stage 3 wear detected 10 days pre-failure. OSHA speed reduction applied in 3 min. Maintenance scheduled Saturday. 3 orders rerouted with zero schedule slip. Zero unplanned downtime.",
        withoutAtlas: "Failure at T+8–12 days. 23-hour emergency shutdown. SKF bearing emergency sourcing (3-day lead). $340K damage + lost production + quality escapes on in-process parts.",
        maintenanceCost: "$12K planned vs $340K unplanned failure",
        downtimeAvoided: "23 hours (est. $14,700/hr production loss)",
        ordersProtected: "3 production orders — no delivery impact",
      };
      patch.industryGuardrails = [
        { framework: "OSHA CFR 1910.217", constraint: "Mandatory speed restriction at Stage 3 bearing wear — no override", status: "enforced" },
        { framework: "ISO 9001",          constraint: "Quality cert verification before alternate machine rerouting",        status: "enforced" },
        { framework: "ISO 55001",         constraint: "Asset lifecycle event logged in CMMS with predicted vs actual RUL",   status: "enforced" },
        { framework: "IEC 62443",         constraint: "All OT network parameter changes via authenticated MTConnect session", status: "enforced" },
      ];
    } else if (stage === "resolved") {
      patch.resolution = {
        atlasAutonomousActions: [
          "Stage 3 bearing wear detected via FFT analysis — 10 days to predicted failure",
          "OSHA-mandated 40% spindle speed reduction applied via MTConnect in 3 minutes",
          "Maintenance window optimized: Saturday 02:00–06:00 (lowest demand slot)",
          "SKF 6210-2RS/C3 bearing availability confirmed in local inventory",
          "CMMS work order WO-28834 raised with full diagnostic payload",
          "3 production orders rerouted to CNC-Line-5 — ISO 9001 quality certs cross-verified",
          "ERP delivery schedule updated — zero customer-facing impact",
        ],
        requiresHumanAction: [
          "Physical bearing replacement execution by qualified technician (Saturday window)",
          "Post-maintenance vibration baseline re-measurement and sign-off",
        ],
        withoutAtlas: "Bearing failure at T+8–12 days → 23-hour emergency shutdown → $340K damage + emergency parts + quality escapes.",
      };
      patch.resolvedAt = new Date();
      patch.status = "resolved";
    }

    return patch;
  }

  function scheduleNextMfgStage(pipelineId: string, seqIdx: number) {
    if (seqIdx >= SH_MFG_STAGE_SEQUENCE.length) {
      shMfgDemo.status = "complete";
      shMfgDemo.completedAt = new Date();
      return;
    }
    const { stage, delayMs } = SH_MFG_STAGE_SEQUENCE[seqIdx];
    setTimeout(async () => {
      if (shMfgDemo.pipelineId !== pipelineId) return;
      try {
        const patch = await buildMfgStagePatch(stage);
        await storage.updateHealingPipeline(pipelineId, patch as any);
        if (shMfgDemo.deploymentId) {
          fireSHAgentStage(shMfgDemo.deploymentId, SH_MFG_STAGE_PROMPTS[stage] || stage);
        }
        scheduleNextMfgStage(pipelineId, seqIdx + 1);
      } catch (err: any) {
        console.error("[demo/sh-mfg] stage advance error:", err.message);
      }
    }, delayMs);
  }

  const SH_MFG_STAGE_PROMPTS: Record<string, string> = {
    detected:    "URGENT: CNC-Line-7 spindle bearing vibration spiked to 12.3 mm/s² (baseline 4.7). BPFO harmonic at 3× (187.5 Hz) is 162% above 14-day rolling average. ISO 13373 Stage 3 wear classification — predicted failure in 8–12 days. 3 active production orders (OD-4417, OD-4421, OD-4433) at risk. Begin autonomous predictive maintenance response per ISO 55001 and OSHA protocols.",
    diagnosed:   "Root cause confirmed: CNC-Line-7 main spindle bearing exhibiting Stage 3 wear pattern. Remaining useful life 8–12 days at current production load. FFT analysis shows BPFO harmonic amplitude 12.3 mm/s² — ISO 10816 Zone C/D boundary crossed. CNC-Line-5 has 34% spare capacity certified for all 3 affected part families. Formulate maintenance scheduling and rerouting plan.",
    hypothesis:  "Formulating remediation plan. Hypothesis: (1) Apply OSHA-mandated 40% speed reduction on CNC-Line-7 immediately via MTConnect. (2) Reroute 3 active production orders to CNC-Line-5. (3) Schedule bearing replacement during Saturday 02:00–06:00 maintenance window. Parts (SKF 6210-2RS/C3) and technician availability confirmed in CMMS.",
    remediation: "Executing remediation. Pushing CNC-Line-7 spindle speed reduction to 60% rated RPM via MTConnect per OSHA safety protocol. Rerouting OD-4417, OD-4421, OD-4433 to CNC-Line-5. Reserving Saturday 02:00–06:00 maintenance slot in CMMS. EPA waste disposal request filed for used bearing. ISO 9001 maintenance record logged.",
    resolved:    "Validating resolution. CNC-Line-7 speed reduction confirmed: 60% RPM, vibration stabilized at 9.1 mm/s². All 3 production orders rerouted to CNC-Line-5 — on-time delivery maintained for all due dates. Bearing replacement scheduled Saturday 02:00–06:00. ISO 55001, OSHA, ISO 9001, and EPA compliance audit trail complete. Catastrophic failure averted: $340K vs $12K scheduled maintenance cost.",
  };

  router.post("/api/demo/sh-mfg/trigger", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const allAgents = await storage.getAgents(orgId);
      const agent = allAgents.find(a => a.name === "Factory Floor Anomaly Recovery Agent");
      if (!agent) return res.status(404).json({ message: "Factory Floor Anomaly Recovery Agent not found" });

      if (shMfgDemo.pipelineId) {
        await storage.deleteHealingPipeline(shMfgDemo.pipelineId).catch(() => {});
      }

      const deploymentId = await ensureSHAgentDeployment(agent, orgId);

      const newPipeline = await storage.createHealingPipeline({
        title: "CNC-Line-7 Bearing Wear Stage 3 — 10 Days to Predicted Failure",
        agentId: agent.id,
        agentName: agent.name,
        industry: "manufacturing",
        severity: "high",
        priority: "high",
        stage: "detected",
        issueType: "equipment_anomaly",
        issueDescription: "CNC-Line-7 spindle bearing vibration at 12.3 mm/s² (baseline 4.7). BPFO harmonic 162% above 14-day average. ISO 13373 Stage 3 wear classification — 10 days to predicted failure. 3 active production orders at risk.",
        triggerSource: "atlas_monitoring",
      } as any);

      shMfgDemo = {
        status: "running",
        pipelineId: newPipeline.id,
        triggeredAt: new Date(),
        completedAt: null,
        agentId: agent.id,
        deploymentId,
      };

      fireSHAgentStage(deploymentId, SH_MFG_STAGE_PROMPTS.detected);
      scheduleNextMfgStage(newPipeline.id, 0);

      res.json({ pipelineId: newPipeline.id, agentId: agent.id, message: "Demo incident triggered" });
    } catch (err: any) {
      console.error("[demo/sh-mfg/trigger]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/api/demo/sh-mfg/status", async (_req, res) => {
    try {
      let pipeline = null;
      if (shMfgDemo.pipelineId) {
        pipeline = await storage.getHealingPipeline(shMfgDemo.pipelineId) ?? null;
      }
      const elapsedSeconds = shMfgDemo.triggeredAt
        ? Math.floor((Date.now() - shMfgDemo.triggeredAt.getTime()) / 1000)
        : 0;
      res.json({
        status: shMfgDemo.status,
        triggeredAt: shMfgDemo.triggeredAt,
        completedAt: shMfgDemo.completedAt,
        elapsedSeconds,
        pipeline,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/api/demo/sh-mfg/reset", async (_req, res) => {
    try {
      if (shMfgDemo.pipelineId) {
        await storage.deleteHealingPipeline(shMfgDemo.pipelineId).catch(() => {});
      }
      shMfgDemo = { status: "idle", pipelineId: null, triggeredAt: null, completedAt: null, agentId: null, deploymentId: null };
      res.json({ message: "Demo reset to idle" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Self-Healing Retail / Order Fulfillment Demo Live Session ───────────────

  type SHRetailLiveDemoState = {
    status: "idle" | "running" | "complete";
    pipelineId: string | null;
    triggeredAt: Date | null;
    completedAt: Date | null;
    agentId: string | null;
    deploymentId: string | null;
  };

  let shRetailDemo: SHRetailLiveDemoState = {
    status: "idle",
    pipelineId: null,
    triggeredAt: null,
    completedAt: null,
    agentId: null,
    deploymentId: null,
  };

  const SH_RETAIL_STAGE_SEQUENCE: Array<{ stage: string; delayMs: number }> = [
    { stage: "diagnosed",   delayMs: 25_000 },
    { stage: "hypothesis",  delayMs: 20_000 },
    { stage: "remediation", delayMs: 20_000 },
    { stage: "resolved",    delayMs: 30_000 },
  ];

  async function buildRetailStagePatch(stage: string): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = { stage };

    if (stage === "diagnosed") {
      patch.diagnosisDetails = {
        rootCause: "Primary WMS database connection pool exhausted (0/200 connections available). Flash sale traffic 340% above baseline overwhelmed DB thread pool. API error rate: 87%. 1,847 in-flight orders at risk of loss or duplication.",
        wmsErrorRate: 87,
        queueDepth: 12847,
        connectionPool: { available: 0, total: 200 },
        ordersAtRisk: 1847,
        sameDayDeliveries: 312,
        slaExposure: 340000,
        skillsInvoked: [
          {
            skillName: "WMS Health Monitoring Skill",
            description: "Continuous monitoring of WMS API health, error rates, DB connection pool depth, and order queue latency across all fulfillment nodes.",
            finding: "Primary WMS API error rate: 87% (alert threshold 2%, critical 20%). DB connection pool: 0/200. Queue depth: 12,847 pending operations. Latency p99: 42 seconds.",
            duration: "4 minutes — alert triggered on error rate crossing 20% threshold",
          },
          {
            skillName: "SLA Breach Detection Skill",
            description: "Quantifies SLA penalty exposure across all at-risk orders, prioritized by delivery commitment and penalty tier.",
            finding: "1,847 orders in-flight · $340K SLA penalty exposure · 312 same-day delivery commitments ($180 penalty/order) · 482 next-day ($45/order) · 1,053 standard ($12/order).",
            duration: "3 minutes",
          },
          {
            skillName: "Fallback Routing Engine Skill",
            description: "Evaluates alternate fulfillment paths across secondary DCs, 3PL partners, and in-store pickup. Validates inventory availability and delivery time eligibility.",
            finding: "DC-West: capacity 1,200 orders (same-day eligible). 3PL-FedEx: capacity 400 orders (next-day eligible). 247 retail stores: local pickup eligible. All 1,847 orders can be rerouted.",
            duration: "6 minutes",
          },
        ],
        routingPlan: [
          { destination: "DC-West (Secondary)",  orderCount: 1200, eligibility: "Same-day + next-day" },
          { destination: "3PL-FedEx",             orderCount: 400,  eligibility: "Next-day" },
          { destination: "Retail Stores (247)",   orderCount: 247,  eligibility: "Local pickup" },
        ],
      };
    } else if (stage === "hypothesis") {
      patch.hypothesis = {
        confidence: 0.96,
        primaryHypothesis: "Immediately preserve all 1,847 in-flight orders to durable queue to prevent loss, activate fallback routing to DC-West/3PL-FedEx/stores, dispatch proactive customer notifications within CP-01 30-minute window, and prepare SLA breach escalation package.",
        runbookCandidates: [
          {
            runbookName: "WMS Outage Response Protocol",
            triggerCondition: "WMS API error rate > 20% for 2+ minutes",
            expectedOutcome: "WMS switched to degraded mode · All in-flight order state preserved to durable queue · Zero order loss or duplication",
            estimatedDuration: "90 seconds automated failover",
          },
          {
            runbookName: "Overflow Order Rerouting Protocol",
            triggerCondition: "Primary WMS unavailable — 1,847 orders queued",
            expectedOutcome: "1,200 orders → DC-West, 400 → 3PL-FedEx, 247 → retail stores. Delivery commitments preserved for 94% of orders.",
            estimatedDuration: "18 minutes (routing + ERP update + carrier API calls)",
          },
          {
            runbookName: "Customer Notification Blast Protocol",
            triggerCondition: "CP-01: at-risk customer notification required within 30 min",
            expectedOutcome: "1,847 customers notified via SMS + email within 22 minutes. Personalized message with new ETA and order tracking link.",
            estimatedDuration: "22 minutes (CP-01 compliant)",
          },
          {
            runbookName: "SLA Breach Escalation Protocol",
            triggerCondition: "SLA penalty exposure > $100K",
            expectedOutcome: "Escalation package auto-generated. VP Operations + Carrier Account Mgr notified. $340K exposure → $28K actual penalties with proactive remediation.",
            estimatedDuration: "8 minutes automated documentation",
          },
        ],
      };
    } else if (stage === "remediation") {
      patch.remediation = {
        status: "in_progress",
        runbooksTriggered: [
          {
            runbookName: "WMS Outage Response Protocol",
            status: "completed",
            result: "WMS switched to degraded mode in 90 seconds. 1,847 in-flight orders preserved to durable Kafka queue. Zero order loss. Zero duplicate shipments.",
          },
          {
            runbookName: "Overflow Order Rerouting Protocol",
            status: "completed",
            result: "1,200 orders routed to DC-West (same-day preserved), 400 to 3PL-FedEx (next-day), 247 to retail stores (local pickup). ERP updated. Carrier APIs confirmed.",
          },
          {
            runbookName: "Customer Notification Blast Protocol",
            status: "completed",
            result: "1,847 SMS + email notifications dispatched in 22 minutes. CP-01 30-minute window met. Personalized ETAs included. 94% delivery commitment preserved.",
          },
          {
            runbookName: "SLA Breach Escalation Protocol",
            status: "in_progress",
            result: "SLA exposure quantified: $340K gross → $28K net with proactive remediation credits. Escalation package submitted to VP Operations and Carrier Account Manager.",
          },
        ],
        policiesEnforced: [
          {
            policyName: "Consumer Protection Policy (CP-01)",
            rule: "At-risk customer notification within 30 minutes of outage",
            decision: "1,847 customer notifications dispatched at T+22min — CP-01 window met",
            outcome: "100% of at-risk customers notified within regulatory window",
          },
          {
            policyName: "PCI-DSS v4.0 Data Handling Policy",
            rule: "No cardholder PAN data in routing logs or recovery queue",
            decision: "Order recovery queue contains order ID, item list, delivery address only — zero PAN data",
            outcome: "PCI-DSS scope maintained throughout failover",
          },
          {
            policyName: "GDPR / CCPA Data Minimization Policy",
            rule: "Only order ID, delivery address, and item list shared with 3PL partners",
            decision: "3PL-FedEx data transfer limited to operational minimum — no customer PII beyond delivery address",
            outcome: "GDPR Art. 5(1)(c) and CCPA data minimization satisfied",
          },
          {
            policyName: "SLA Escalation Policy",
            rule: "Escalate to VP Operations if SLA exposure > $100K or 500+ orders at risk",
            decision: "$340K exposure exceeds $100K threshold — escalation auto-triggered with full breach analysis",
            outcome: "VP Operations and Carrier Account Manager notified with remediation plan",
          },
        ],
      };
      patch.businessImpact = {
        withAtlas: "WMS outage detected in 4 minutes. 1,847 orders preserved with zero loss. Fallback routing completed in 18 minutes. 1,847 customers notified in 22 minutes. SLA exposure reduced from $340K to $28K.",
        withoutAtlas: "Detection at 45–90 minutes. Manual rerouting 3–4 hours. Orders lost or duplicated. Customers discover issue via WISMO calls. Full $340K SLA penalties + 12% churn on affected cohort.",
        ordersProtected: "1,847 orders — zero loss, zero duplication",
        slaReduction: "$340K exposure → $28K net (92% reduction via proactive remediation)",
        notificationCompliance: "CP-01 met: 22 minutes (30-minute window)",
      };
      patch.industryGuardrails = [
        { framework: "Consumer Protection CP-01", constraint: "Customer notification within 30 minutes of service disruption",                              status: "enforced" },
        { framework: "PCI-DSS v4.0",              constraint: "Zero cardholder PAN data in any recovery queue or routing log",                             status: "enforced" },
        { framework: "GDPR Art. 5(1)(c)",         constraint: "Data minimization — only operational minimum shared with 3PL partners",                     status: "enforced" },
        { framework: "CCPA §1798.100",            constraint: "No additional PI collection during failover — existing consent scope only",                  status: "enforced" },
      ];
    } else if (stage === "resolved") {
      patch.resolution = {
        atlasAutonomousActions: [
          "WMS outage detected in 4 minutes (vs 45–90 min manual monitoring)",
          "1,847 in-flight orders preserved to durable queue — zero loss, zero duplication",
          "WMS switched to degraded mode in 90 seconds via automated failover",
          "Fallback routing completed: 1,200 → DC-West, 400 → 3PL-FedEx, 247 → retail stores",
          "1,847 customer notifications dispatched in 22 minutes (CP-01: 30-min window met)",
          "SLA exposure quantified and escalation package submitted — $340K → $28K net",
          "ERP and carrier APIs updated with new routing assignments",
        ],
        requiresHumanAction: [
          "VP Operations sign-off on SLA penalty negotiation with carriers",
          "Post-incident WMS capacity review and DB connection pool sizing",
        ],
        withoutAtlas: "45–90 min detection, 3–4 hr manual rerouting, order loss/duplication, $340K SLA penalties, 12% churn on affected customer cohort.",
      };
      patch.resolvedAt = new Date();
      patch.status = "resolved";
    }

    return patch;
  }

  function scheduleNextRetailStage(pipelineId: string, seqIdx: number) {
    if (seqIdx >= SH_RETAIL_STAGE_SEQUENCE.length) {
      shRetailDemo.status = "complete";
      shRetailDemo.completedAt = new Date();
      return;
    }
    const { stage, delayMs } = SH_RETAIL_STAGE_SEQUENCE[seqIdx];
    setTimeout(async () => {
      if (shRetailDemo.pipelineId !== pipelineId) return;
      try {
        const patch = await buildRetailStagePatch(stage);
        await storage.updateHealingPipeline(pipelineId, patch as any);
        if (shRetailDemo.deploymentId) {
          fireSHAgentStage(shRetailDemo.deploymentId, SH_RETAIL_STAGE_PROMPTS[stage] || stage);
        }
        scheduleNextRetailStage(pipelineId, seqIdx + 1);
      } catch (err: any) {
        console.error("[demo/sh-retail] stage advance error:", err.message);
      }
    }, delayMs);
  }

  const SH_RETAIL_STAGE_PROMPTS: Record<string, string> = {
    detected:    "URGENT: Primary WMS API error rate has spiked to 87%. DB connection pool exhausted — 0 of 200 connections available. Flash sale traffic is 340% above baseline. 1,847 in-flight orders at risk, 312 same-day delivery commitments, $340K SLA penalty exposure. Begin autonomous incident response per PCI-DSS and consumer protection protocols.",
    diagnosed:   "Root cause confirmed: DB connection pool exhaustion caused by flash sale traffic spike. Primary WMS API at 0/200 connections. Read replicas have 34% spare capacity. Failover WMS available. 312 same-day delivery orders need immediate routing to backup fulfillment center. Formulate failover and connection pool scaling plan.",
    hypothesis:  "Formulating remediation plan. Hypothesis: (1) Activate WMS read-replica failover immediately. (2) Route 312 same-day delivery orders to backup fulfillment center (BFC-East, 41 min drive time). (3) Scale DB connection pool to 400 connections. (4) Enable request queuing for remaining 1,847 orders. (5) Activate SLA breach notification per consumer protection policy.",
    remediation: "Executing remediation. WMS read-replica failover activated — processing restored at 94% capacity. 312 same-day delivery orders rerouted to BFC-East with updated tracking notifications sent. DB connection pool scaled to 400. Request queuing enabled for 1,847 in-flight orders. SLA breach notifications sent for affected customers per consumer protection policy. PCI-DSS payment data isolation maintained.",
    resolved:    "Validating resolution. WMS API error rate restored to 0.3%. All 1,847 in-flight orders processing normally. 312 same-day deliveries rerouted — 287 on-track, 25 flagged for SLA compensation. DB connection pool stable at 400/400. Flash sale revenue recovered: $2.1M protected. Consumer protection, PCI-DSS, GDPR, and SLA audit trail compiled.",
  };

  router.post("/api/demo/sh-retail/trigger", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const allAgents = await storage.getAgents(orgId);
      const agent = allAgents.find(a => a.name === "Order Fulfillment Recovery Agent");
      if (!agent) return res.status(404).json({ message: "Order Fulfillment Recovery Agent not found" });

      if (shRetailDemo.pipelineId) {
        await storage.deleteHealingPipeline(shRetailDemo.pipelineId).catch(() => {});
      }

      const deploymentId = await ensureSHAgentDeployment(agent, orgId);

      const newPipeline = await storage.createHealingPipeline({
        title: "Primary WMS API Cascade Failure — Flash Sale Peak Traffic",
        agentId: agent.id,
        agentName: agent.name,
        industry: "retail",
        severity: "critical",
        priority: "critical",
        stage: "detected",
        issueType: "system_outage",
        issueDescription: "Primary WMS API error rate: 87% (DB connection pool exhausted — 0/200 connections available). Flash sale traffic 340% above baseline. 1,847 in-flight orders at risk. 312 same-day delivery commitments. $340K SLA penalty exposure.",
        triggerSource: "atlas_monitoring",
      } as any);

      shRetailDemo = {
        status: "running",
        pipelineId: newPipeline.id,
        triggeredAt: new Date(),
        completedAt: null,
        agentId: agent.id,
        deploymentId,
      };

      fireSHAgentStage(deploymentId, SH_RETAIL_STAGE_PROMPTS.detected);
      scheduleNextRetailStage(newPipeline.id, 0);

      res.json({ pipelineId: newPipeline.id, agentId: agent.id, message: "Demo incident triggered" });
    } catch (err: any) {
      console.error("[demo/sh-retail/trigger]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/api/demo/sh-retail/status", async (_req, res) => {
    try {
      let pipeline = null;
      if (shRetailDemo.pipelineId) {
        pipeline = await storage.getHealingPipeline(shRetailDemo.pipelineId) ?? null;
      }
      const elapsedSeconds = shRetailDemo.triggeredAt
        ? Math.floor((Date.now() - shRetailDemo.triggeredAt.getTime()) / 1000)
        : 0;
      res.json({
        status: shRetailDemo.status,
        triggeredAt: shRetailDemo.triggeredAt,
        completedAt: shRetailDemo.completedAt,
        elapsedSeconds,
        pipeline,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/api/demo/sh-retail/reset", async (_req, res) => {
    try {
      if (shRetailDemo.pipelineId) {
        await storage.deleteHealingPipeline(shRetailDemo.pipelineId).catch(() => {});
      }
      shRetailDemo = { status: "idle", pipelineId: null, triggeredAt: null, completedAt: null, agentId: null, deploymentId: null };
      res.json({ message: "Demo reset to idle" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Self-Healing Energy / Grid Operations Demo Live Session ─────────────────

  type SHEnergyLiveDemoState = {
    status: "idle" | "running" | "complete";
    pipelineId: string | null;
    triggeredAt: Date | null;
    completedAt: Date | null;
    agentId: string | null;
    deploymentId: string | null;
  };

  let shEnergyDemo: SHEnergyLiveDemoState = {
    status: "idle",
    pipelineId: null,
    triggeredAt: null,
    completedAt: null,
    agentId: null,
    deploymentId: null,
  };

  const SH_ENERGY_STAGE_SEQUENCE: Array<{ stage: string; delayMs: number }> = [
    { stage: "diagnosed",   delayMs: 25_000 },
    { stage: "hypothesis",  delayMs: 20_000 },
    { stage: "remediation", delayMs: 20_000 },
    { stage: "resolved",    delayMs: 30_000 },
  ];

  async function buildEnergyStagePatch(stage: string): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = { stage };

    if (stage === "diagnosed") {
      patch.diagnosisDetails = {
        rootCause: "Unplanned offshore wind farm outage: Circuit breaker trip on Offshore Wind Array W-12 (847 MW). 40% of regional wind generation capacity lost simultaneously. Grid frequency falling at 0.08 Hz/second toward under-frequency load shedding threshold.",
        frequencyHz: { current: 59.63, nominal: 60.00, nercLimit: 59.95, projectedMinimum: 59.40 },
        shortfallMW: 847,
        householdsAtRisk: 680000,
        nercPenaltyExposure: { min: 1000000, max: 25000000 },
        nercWindowMinutes: 10,
        elapsedMinutes: 1.2,
        skillsInvoked: [
          {
            skillName: "Generation Shortfall Detection Skill",
            description: "High-frequency SCADA telemetry analysis (50,000 points at 4-second intervals) to detect generation-load imbalances and forecast frequency trajectory.",
            finding: "847 MW shortfall detected. W-12 circuit breaker trip confirmed via SCADA. Frequency falling at 0.08 Hz/s. Projected minimum: 59.40 Hz in 3 minutes (UFLS threshold: 59.50 Hz).",
            duration: "< 4 seconds — real-time SCADA event processing",
          },
          {
            skillName: "Demand Response Activation Skill",
            description: "Evaluates DR participant availability, contract status, and curtailment feasibility across industrial and commercial load zones.",
            finding: "12 industrial DR participants available. Combined curtailment: 350 MW. Average activation time: 90 seconds. All participants within contracted curtailment windows.",
            duration: "18 seconds",
          },
          {
            skillName: "Peaker Unit Dispatch Skill",
            description: "Coordinates quick-start combustion turbine dispatch, FERC market notifications, and ramp scheduling to restore generation balance.",
            finding: "CT-3 (120 MW), CT-7 (130 MW), CT-11 (110 MW) available — 360 MW combined. EPA permit hours confirmed: 847 hrs remaining. Full output in 8 minutes.",
            duration: "24 seconds",
          },
          {
            skillName: "Load Zone Rebalancing Skill",
            description: "Calculates transmission switching and interchange adjustments to minimize power flow disruption across load zones.",
            finding: "137 MW interchange adjustment available from Zone 4B. Transmission path N-1 secure. Power flow recalculation complete.",
            duration: "12 seconds",
          },
        ],
        recoveryPlan: [
          { source: "Demand Response (12 industrial participants)", mw: 350, timeMin: 1.5 },
          { source: "Peaker CT-3 / CT-7 / CT-11",                  mw: 360, timeMin: 8.0 },
          { source: "Zone 4B Interchange Adjustment",               mw: 137, timeMin: 3.5 },
        ],
      };
    } else if (stage === "hypothesis") {
      patch.hypothesis = {
        confidence: 0.98,
        primaryHypothesis: "Three-pronged frequency recovery: (1) immediate 350 MW DR curtailment to arrest frequency decline, (2) dispatch CT-3/CT-7/CT-11 for 360 MW generation recovery by T+8min, (3) 137 MW Zone 4B interchange adjustment. Total: 847 MW — full shortfall covered within NERC BAL-003 10-minute window.",
        runbookCandidates: [
          {
            runbookName: "Demand Response Program Activation",
            triggerCondition: "Frequency below 59.95 Hz with ≥200 MW shortfall — autonomous",
            expectedOutcome: "350 MW curtailed across 12 industrial participants in 90 seconds",
            estimatedDuration: "90 seconds automated activation",
          },
          {
            runbookName: "Peaker Unit Dispatch Protocol",
            triggerCondition: "Generation shortfall ≥500 MW — confirm-before action",
            expectedOutcome: "CT-3/CT-7/CT-11 committed. 360 MW at full output by T+8min. FERC market notified within 5 minutes.",
            estimatedDuration: "8 minutes ramp to full output",
          },
          {
            runbookName: "Load Zone Rebalancing Protocol",
            triggerCondition: "N-1 transmission path available with headroom",
            expectedOutcome: "137 MW Zone 4B interchange. Power flow recalculated. N-1 reliability maintained.",
            estimatedDuration: "3.5 minutes",
          },
          {
            runbookName: "NERC Reliability Event Reporting",
            triggerCondition: "Generation loss ≥300 MW — confirm-before regulatory filing",
            expectedOutcome: "NERC event report generated and submitted. Mandatory for losses ≥300 MW.",
            estimatedDuration: "Automated report generation — human sign-off required",
          },
        ],
      };
    } else if (stage === "remediation") {
      patch.remediation = {
        status: "in_progress",
        runbooksTriggered: [
          {
            runbookName: "Demand Response Program Activation",
            status: "completed",
            result: "350 MW curtailed. 12 industrial participants activated in 90 seconds. ArcelorMittal Steel (85 MW), Dow Chemical (62 MW), 10 commercial participants (203 MW). Frequency decline arrested.",
          },
          {
            runbookName: "Peaker Unit Dispatch Protocol",
            status: "completed",
            result: "CT-3 (120 MW) + CT-7 (130 MW) + CT-11 (110 MW) committed. FERC market notification sent at T+4min (5-minute window met). EPA permit hours confirmed: 847 hrs remaining. Units at full output T+8.1min.",
          },
          {
            runbookName: "Load Zone Rebalancing Protocol",
            status: "completed",
            result: "137 MW Zone 4B interchange adjustment applied. Transmission switching completed. N-1 reliability maintained across all monitored paths.",
          },
          {
            runbookName: "NERC Reliability Event Reporting",
            status: "in_progress",
            result: "847 MW event report auto-generated (exceeds 300 MW mandatory threshold). Submitted to NERC via E-Tag system. Human sign-off required for final regulatory certification.",
          },
        ],
        policiesEnforced: [
          {
            policyName: "NERC BAL-003 Reliability Standards Policy",
            rule: "Frequency restoration to 59.95–60.05 Hz within 10-minute window",
            decision: "All three recovery vectors activated immediately — NERC BAL-003 compliance is non-negotiable",
            outcome: "Frequency trajectory restored. On track for recovery within 9.2 minutes.",
          },
          {
            policyName: "FERC Order 881 Market Rules Policy",
            rule: "Market notification within 5 minutes of peaker unit commitment",
            decision: "FERC notification transmitted at T+4 minutes — within 5-minute window",
            outcome: "FERC Order 881 compliant. Market integrity maintained.",
          },
          {
            policyName: "EPA Clean Air Act Emissions Cap Policy",
            rule: "Peaker dispatch requires verification of remaining EPA permit hours",
            decision: "CT-3/CT-7/CT-11 permit check: 847 operating hours remaining — dispatch authorized",
            outcome: "Emissions compliance maintained. No cap violation.",
          },
          {
            policyName: "ERCOT Emergency Dispatch Protocol",
            rule: "Emergency notification to ERCOT when frequency falls below 59.70 Hz",
            decision: "ERCOT emergency notification sent at T+0 (frequency: 59.63 Hz — below 59.70 Hz trigger)",
            outcome: "ERCOT notified and coordinating. Regulatory obligation met.",
          },
        ],
      };
      patch.businessImpact = {
        withAtlas: "847 MW shortfall detected in <4 seconds. DR activated in 90 seconds. Peakers online T+8min. Frequency restored at 9.2 minutes — within NERC 10-minute window. Zero blackouts. $0 NERC penalties.",
        withoutAtlas: "Detection 45+ minutes via operator monitoring. Manual DR activation 15–30 min. Peaker dispatch 45+ min. Frequency collapses to UFLS threshold → rolling blackouts → 8–18 hour restoration. $25M NERC penalties.",
        householdsProtected: "680,000 households — zero blackout",
        nercCompliance: "9.2 min (NERC window: 10 min)",
        penaltyAvoided: "$1M–$25M NERC penalty avoided",
      };
      patch.industryGuardrails = [
        { framework: "NERC BAL-003",      constraint: "Frequency restoration to 59.95–60.05 Hz within 10 minutes — mandatory",            status: "enforced" },
        { framework: "FERC Order 881",    constraint: "Peaker commitment market notification within 5 minutes",                             status: "enforced" },
        { framework: "EPA Clean Air Act", constraint: "Peaker dispatch only within permitted operating hours — auto-verified pre-dispatch",  status: "enforced" },
        { framework: "IEC 62351",         constraint: "All SCADA OT network commands authenticated and encrypted",                          status: "enforced" },
        { framework: "ERCOT Protocol",    constraint: "Emergency notification when frequency < 59.70 Hz",                                   status: "enforced" },
      ];
    } else if (stage === "resolved") {
      patch.resolution = {
        atlasAutonomousActions: [
          "847 MW generation shortfall detected in <4 seconds via SCADA telemetry",
          "Demand Response activated: 350 MW curtailed across 12 industrial participants in 90 seconds",
          "EPA permit hours pre-verified for CT-3/CT-7/CT-11 before dispatch commitment",
          "FERC Order 881 market notification sent at T+4 minutes (5-minute window met)",
          "137 MW Zone 4B interchange adjustment applied — N-1 reliability maintained",
          "ERCOT emergency notification transmitted at T+0 (frequency 59.63 Hz < 59.70 Hz trigger)",
          "NERC BAL-003 event report auto-generated and submitted via E-Tag system",
        ],
        requiresHumanAction: [
          "Final NERC Reliability Event Report regulatory certification (mandatory human sign-off for ≥300 MW events)",
          "Post-event grid stability review and W-12 wind farm restoration approval",
        ],
        withoutAtlas: "45+ min detection → frequency collapse → rolling blackouts affecting 680K households → 8–18 hr restoration → $25M NERC penalties.",
      };
      patch.resolvedAt = new Date();
      patch.status = "resolved";
    }

    return patch;
  }

  function scheduleNextEnergyStage(pipelineId: string, seqIdx: number) {
    if (seqIdx >= SH_ENERGY_STAGE_SEQUENCE.length) {
      shEnergyDemo.status = "complete";
      shEnergyDemo.completedAt = new Date();
      return;
    }
    const { stage, delayMs } = SH_ENERGY_STAGE_SEQUENCE[seqIdx];
    setTimeout(async () => {
      if (shEnergyDemo.pipelineId !== pipelineId) return;
      try {
        const patch = await buildEnergyStagePatch(stage);
        await storage.updateHealingPipeline(pipelineId, patch as any);
        if (shEnergyDemo.deploymentId) {
          fireSHAgentStage(shEnergyDemo.deploymentId, SH_ENERGY_STAGE_PROMPTS[stage] || stage);
        }
        scheduleNextEnergyStage(pipelineId, seqIdx + 1);
      } catch (err: any) {
        console.error("[demo/sh-energy] stage advance error:", err.message);
      }
    }, delayMs);
  }

  const SH_ENERGY_STAGE_PROMPTS: Record<string, string> = {
    detected:    "URGENT: Circuit breaker trip on Offshore Wind Array W-12. 847 MW generation shortfall — 40% of regional wind capacity offline. Grid frequency falling: 59.63 Hz (nominal 60.00 Hz, NERC BAL-003 lower limit 59.95 Hz). 680,000 households at risk. 10-minute NERC BAL-003 recovery window starts now. Begin autonomous grid stability response per NERC, FERC, and ERCOT protocols.",
    diagnosed:   "Root cause confirmed: W-12 Array transformer protection relay trip. 847 MW offline. Grid frequency at 59.63 Hz — 370 mHz below NERC limit. Pumped hydro (Hoover East, 420 MW) available in 4 minutes. Spinning reserves (NV Gas Peakers, 180 MW) available in 2 minutes. 247 MW demand response available via ERCOT interruptible contracts. Formulate frequency restoration plan.",
    hypothesis:  "Formulating remediation plan. Hypothesis to restore frequency within NERC 10-min window: (1) Dispatch Hoover East pumped hydro 420 MW in 4 min. (2) Activate NV Gas Peakers 180 MW spinning reserves in 2 min. (3) Trigger 247 MW ERCOT demand response interruptible load. (4) Request W-12 Array protection relay inspection. Total: 847 MW recovery path within 9.2 minutes.",
    remediation: "Executing remediation. Activating NV Gas Peakers 180 MW spinning reserves — online in 2 min. Dispatching Hoover East pumped hydro 420 MW — online in 4 min. Triggering 247 MW ERCOT demand response — interruptible load curtailed. Frequency trajectory improving: 59.63→59.89 Hz. NERC BAL-003 compliance maintained. FERC reporting initiated. W-12 relay inspection team dispatched.",
    resolved:    "Validating resolution. Grid frequency restored to 59.97 Hz — within NERC BAL-003 compliance. Total recovery time: 9.2 minutes (within 10-minute window). 680,000 households maintained power continuously. Autonomous actions: 847 MW generation deficit covered, demand response coordinated, W-12 inspection initiated. Compiling NERC, FERC, ERCOT, and EPA compliance audit trail.",
  };

  router.post("/api/demo/sh-energy/trigger", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const allAgents = await storage.getAgents(orgId);
      const agent = allAgents.find(a => a.name === "Grid Operations Stability Agent");
      if (!agent) return res.status(404).json({ message: "Grid Operations Stability Agent not found" });

      if (shEnergyDemo.pipelineId) {
        await storage.deleteHealingPipeline(shEnergyDemo.pipelineId).catch(() => {});
      }

      const deploymentId = await ensureSHAgentDeployment(agent, orgId);

      const newPipeline = await storage.createHealingPipeline({
        title: "Offshore Wind Farm W-12 Outage — 847 MW Generation Shortfall",
        agentId: agent.id,
        agentName: agent.name,
        industry: "energy",
        severity: "critical",
        priority: "critical",
        stage: "detected",
        issueType: "generation_shortfall",
        issueDescription: "Circuit breaker trip on Offshore Wind Array W-12. 847 MW generation shortfall (40% of regional wind capacity). Grid frequency falling: 59.63 Hz (nominal 60.00 Hz, NERC lower limit 59.95 Hz). 680,000 households at risk. NERC BAL-003 10-minute recovery window starts now.",
        triggerSource: "atlas_monitoring",
      } as any);

      shEnergyDemo = {
        status: "running",
        pipelineId: newPipeline.id,
        triggeredAt: new Date(),
        completedAt: null,
        agentId: agent.id,
        deploymentId,
      };

      fireSHAgentStage(deploymentId, SH_ENERGY_STAGE_PROMPTS.detected);
      scheduleNextEnergyStage(newPipeline.id, 0);

      res.json({ pipelineId: newPipeline.id, agentId: agent.id, message: "Demo incident triggered" });
    } catch (err: any) {
      console.error("[demo/sh-energy/trigger]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/api/demo/sh-energy/status", async (_req, res) => {
    try {
      let pipeline = null;
      if (shEnergyDemo.pipelineId) {
        pipeline = await storage.getHealingPipeline(shEnergyDemo.pipelineId) ?? null;
      }
      const elapsedSeconds = shEnergyDemo.triggeredAt
        ? Math.floor((Date.now() - shEnergyDemo.triggeredAt.getTime()) / 1000)
        : 0;
      res.json({
        status: shEnergyDemo.status,
        triggeredAt: shEnergyDemo.triggeredAt,
        completedAt: shEnergyDemo.completedAt,
        elapsedSeconds,
        pipeline,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/api/demo/sh-energy/reset", async (_req, res) => {
    try {
      if (shEnergyDemo.pipelineId) {
        await storage.deleteHealingPipeline(shEnergyDemo.pipelineId).catch(() => {});
      }
      shEnergyDemo = { status: "idle", pipelineId: null, triggeredAt: null, completedAt: null, agentId: null, deploymentId: null };
      res.json({ message: "Demo reset to idle" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Self-Healing Insurance / Claims Workflow Demo Live Session ──────────────

  type SHInsuranceLiveDemoState = {
    status: "idle" | "running" | "complete";
    pipelineId: string | null;
    triggeredAt: Date | null;
    completedAt: Date | null;
    agentId: string | null;
    deploymentId: string | null;
  };

  let shInsuranceDemo: SHInsuranceLiveDemoState = {
    status: "idle",
    pipelineId: null,
    triggeredAt: null,
    completedAt: null,
    agentId: null,
    deploymentId: null,
  };

  const SH_INSURANCE_STAGE_SEQUENCE: Array<{ stage: string; delayMs: number }> = [
    { stage: "diagnosed",   delayMs: 25_000 },
    { stage: "hypothesis",  delayMs: 20_000 },
    { stage: "remediation", delayMs: 20_000 },
    { stage: "resolved",    delayMs: 30_000 },
  ];

  async function buildInsuranceStagePatch(stage: string): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = { stage };

    if (stage === "diagnosed") {
      patch.diagnosisDetails = {
        rootCause: "Fraud triage model training data contained Zone 7 geographic bias — 340% over-representation of historical fraud cases from a single ZIP code cluster caused the ML classifier to systematically flag non-fraudulent claims from that region. False-positive rate spiked from 3.2% baseline to 22.7% over 48 hours.",
        modelFpr: { before: 3.2, after: 22.7, threshold: 5.0, restored: 2.8 },
        affectedClaims: 847,
        estimatedMisclassified: 620,
        vulnerableClaimants: 47,
        totalAmountDelayed: 2100000,
        noPriorAlert: true,
        skillsInvoked: [
          {
            skillName: "False-Positive Rate Monitoring Skill",
            description: "CUSUM (cumulative sum) statistical process control analysis on rolling 24h claim triage decisions. Detects systemic FPR drift and isolates segment-specific vs. model-wide failure modes.",
            finding: "FPR spiked from 3.2% to 22.7% over 48 hours. CUSUM h-statistic: 8.4 (threshold 5.0 = systemic failure). Zone 7 ZIP codes (92101–92115): FPR 41.3%. All other zones: 3.6%. Root cause: training set Zone 7 over-representation 340% above national distribution.",
            duration: "12 minutes",
          },
          {
            skillName: "Claimant Impact Assessment Skill",
            description: "Quantifies financial and welfare impact across affected claimants. Identifies vulnerable populations (elderly, disability claimants) and determines compensation requirements under state prompt-payment statutes.",
            finding: "847 claims flagged since model update. 620 estimated misclassified (73.2% error rate in Zone 7). 47 vulnerable claimants (23 elderly, 24 disability). Total delayed payout: $2.1M. Daily interest accrual at statutory rate: $1,470/day. SOX materiality threshold ($500K) exceeded.",
            duration: "28 seconds",
          },
          {
            skillName: "Claims Re-Routing to Human Review Skill",
            description: "Evaluates adjuster capacity and priority scoring across misclassified claims. Prioritizes by vulnerability status, claim age, and payout size.",
            finding: "620 claims queued for human review. Priority 1: 47 vulnerable claimants (elderly/disability) — expedited 24h SLA. Priority 2: 94 claims >$10K — 72h SLA. Priority 3: 479 standard claims — 5-day SLA. Adjuster capacity: 8 available (2 overflow allocated from reserve pool).",
            duration: "15 seconds",
          },
          {
            skillName: "Regulatory Disclosure Skill",
            description: "Generates mandatory adverse action letters, state insurance department notifications, and GDPR Article 22 automated-decision explanations.",
            finding: "12 state insurance departments require systemic error notification within 30 days (AZ, CA, TX, FL, NY, OH, PA, IL, MI, GA, NC, WA). 47 GDPR Art. 22 explanations required within 72 hours for EU-linked claims. Adverse action letters: 620 claims.",
            duration: "8 seconds",
          },
        ],
        impactByPriority: [
          { priority: "Priority 1 — Vulnerable (elderly/disability)", count: 47, sla: "24h expedited", amount: 180000 },
          { priority: "Priority 2 — High-value (>$10K)",              count: 94, sla: "72h",           amount: 890000 },
          { priority: "Priority 3 — Standard",                        count: 479, sla: "5-day",        amount: 1030000 },
        ],
      };
    } else if (stage === "hypothesis") {
      patch.hypothesis = {
        confidence: 0.97,
        primaryHypothesis: "Four-phase recovery: (1) isolate model and activate rules-based fallback scoring to stop further misclassifications, (2) route 620 affected claims to human adjuster review with vulnerability prioritization, (3) initiate NAIC-compliant fairness audit before any threshold recalibration, (4) generate and file state regulator packages and GDPR Article 22 notices for all affected claimants.",
        runbookCandidates: [
          {
            runbookName: "Fraud Model Isolation Protocol",
            triggerCondition: "CUSUM h-statistic > 5.0 — autonomous",
            expectedOutcome: "Model v2.3.1 isolated. Rules-based fallback scoring activated. FPR returns to baseline 2.8%. No further misclassifications.",
            estimatedDuration: "< 60 seconds automated cutover",
          },
          {
            runbookName: "Human Review Queue Activation Protocol",
            triggerCondition: "Estimated misclassified claims > 50 — autonomous",
            expectedOutcome: "620 claims queued with priority scoring. 47 vulnerable claimants flagged for 24h expedited review. 2 overflow adjusters allocated.",
            estimatedDuration: "2 minutes to populate priority queues",
          },
          {
            runbookName: "Claimant Notification and Remediation Protocol",
            triggerCondition: "Misclassified claims affecting vulnerable claimants or amounts > $500K — autonomous (letters) + confirm-before (payments)",
            expectedOutcome: "620 adverse action letters drafted. 47 expedited notification letters sent. GDPR Article 22 explanations queued. Statutory interest compensation calculated.",
            estimatedDuration: "Automated letter generation; payment batch confirm-before",
          },
          {
            runbookName: "State Insurance Regulator Filing Protocol",
            triggerCondition: "Systemic AI model error — confirm-before regulatory filing",
            expectedOutcome: "12 state insurance department notification packages prepared. Incident timeline, affected claims summary, and remediation plan included. Human sign-off required before submission.",
            estimatedDuration: "Report generation automated — regulatory officer sign-off required",
          },
        ],
      };
    } else if (stage === "remediation") {
      patch.remediation = {
        status: "in_progress",
        runbooksTriggered: [
          {
            runbookName: "Fraud Model Isolation Protocol",
            status: "completed",
            result: "Model v2.3.1 isolated at T+3min. Rules-based fallback scoring activated across all claim intake channels. Real-time FPR monitoring confirms: 22.7% → 2.8% (restored). Zero additional misclassifications since cutover.",
          },
          {
            runbookName: "Human Review Queue Activation Protocol",
            status: "completed",
            result: "620 claims routed to human review. Priority queue populated: 47 vulnerable (24h SLA), 94 high-value (72h SLA), 479 standard (5-day SLA). 2 overflow adjusters allocated from reserve pool. Queue estimated clearance: 4.2 business days.",
          },
          {
            runbookName: "Claimant Notification and Remediation Protocol",
            status: "in_progress",
            result: "620 adverse action letter drafts generated. 47 expedited letters queued for immediate send. GDPR Article 22 explanation packages prepared for 11 EU-linked claims (72h window: 61 hours remaining). Statutory interest accrual calculation complete: $1,470/day. Payment batch requires human approval before processing.",
          },
          {
            runbookName: "State Insurance Regulator Filing Protocol",
            status: "in_progress",
            result: "12 state filing packages auto-generated. Contents: incident timeline, CUSUM analysis report, affected claims count, Zone 7 bias analysis, remediation steps. Awaiting regulatory officer sign-off before submission to state insurance departments.",
          },
        ],
        policiesEnforced: [
          {
            policyName: "NAIC Model Audit Regulation — Fairness Audit Gate",
            rule: "Recalibrated fraud threshold cannot be deployed until NAIC-01 fairness audit confirms no disparate impact across protected demographic segments",
            decision: "Model recalibration to threshold 0.65 blocked pending fairness audit. New model v2.4.0 staged but NOT deployed. Fairness audit initiated — results expected in 3 business days.",
            outcome: "NAIC compliance enforced. No premature recalibration. Audit in progress.",
          },
          {
            policyName: "State Fair Claims Handling Policy (SFCH-01)",
            rule: "Prompt payment restoration required; vulnerable claimants (elderly, disability) receive expedited 24-hour processing and priority queue placement",
            decision: "47 vulnerable claimants placed in Priority 1 queue (24h SLA). All 620 claims receive SFCH-01-compliant expedited handling. Statutory interest accrual tracked.",
            outcome: "SFCH-01 compliant. Vulnerable claimant protections active.",
          },
          {
            policyName: "GDPR Article 22 — Automated Decision Explanation",
            rule: "EU claimants subject to automated adverse decisions must receive human review option and algorithmic explanation within 72 hours",
            decision: "11 EU-linked claims identified. GDPR Article 22 explanation packages queued. 72-hour compliance window: 61 hours remaining. Human review option explicitly offered.",
            outcome: "GDPR Article 22 compliant. Explanations queued for delivery.",
          },
          {
            policyName: "SOX Internal Controls — Material Impact Threshold",
            rule: "Claims reserve impact > $500K triggers SOX material impact notification to Chief Actuarial Officer and external auditors",
            decision: "Total delayed payout $2.1M exceeds $500K SOX materiality threshold. CAO notification sent automatically. External audit team alerted. Reserve adjustment entry flagged for Q2 financial statements.",
            outcome: "SOX notification sent. External auditors informed. Reserve entry flagged.",
          },
        ],
      };
      patch.businessImpact = {
        withAtlas: "FPR spike detected in 2 hours via CUSUM monitoring. Model isolated in 3 minutes. 620 claims re-routed within 5 hours. Regulator filing packages prepared before regulators inquire. Claimant harm minimized.",
        withoutAtlas: "Detection 5–10 days via regulator inquiry or legal notice. 1,000+ additional claims misclassified in that window. Class-action lawsuit risk. State license suspension risk. $25M+ settlement exposure.",
        affectedClaims: "847 claims (620 misclassified) — human review underway",
        vulnerableClaimants: "47 vulnerable claimants — 24h expedited queue",
        amountRestored: "$2.1M in delayed payouts processing",
        penaltyAvoided: "NAIC/state fines + $25M+ class-action exposure avoided",
      };
      patch.industryGuardrails = [
        { framework: "NAIC Model Audit Reg.", constraint: "Fairness audit required before any recalibrated threshold deployment — hard block enforced", status: "enforced" },
        { framework: "SFCH-01 (State Fair Claims)", constraint: "Vulnerable claimants (elderly/disability) in 24h priority queue — non-negotiable", status: "enforced" },
        { framework: "GDPR Article 22", constraint: "EU claimant algorithmic explanations + human review offer within 72 hours", status: "enforced" },
        { framework: "SOX Internal Controls", constraint: "$2.1M > $500K materiality threshold — CAO + external auditor notified automatically", status: "enforced" },
        { framework: "NAIC Unfair Claims Act", constraint: "Adverse action letters required for all misclassified claimants — 620 letters queued", status: "enforced" },
      ];
    } else if (stage === "resolved") {
      patch.resolution = {
        atlasAutonomousActions: [
          "CUSUM FPR monitoring detected 22.7% spike (7× baseline) — flagged within 2 hours of onset",
          "Root cause isolated: Zone 7 geographic bias in training data (340% over-representation)",
          "Fraud model v2.3.1 isolated; rules-based fallback activated — FPR restored to 2.8% in < 60 seconds",
          "620 misclassified claims routed to human review with priority scoring",
          "47 vulnerable claimants (elderly/disability) placed in 24h Priority 1 expedited queue",
          "GDPR Article 22 explanation packages queued for 11 EU-linked claims (72h window tracking)",
          "SOX material impact notification sent to CAO and external auditors ($2.1M > $500K threshold)",
          "12 state insurance department filing packages auto-generated (incident + CUSUM report + remediation plan)",
          "Statutory interest accrual ($1,470/day) calculated and logged for compensation processing",
        ],
        requiresHumanAction: [
          "Regulatory officer sign-off required before submitting 12 state insurance department filing packages",
          "Human approval required before processing $2.1M payment batch to claimants (statutory + interest)",
          "NAIC fairness audit results review and model v2.4.0 deployment authorization (3 business days)",
          "Legal review of class-action exposure assessment before external communications",
        ],
        withoutAtlas: "5–10 days detection via regulator inquiry. 1,000+ additional misclassifications. $25M+ class-action exposure. State license suspension risk. Manual remediation weeks-long.",
      };
      patch.resolvedAt = new Date();
      patch.status = "resolved";
    }

    return patch;
  }

  function scheduleNextInsuranceStage(pipelineId: string, seqIdx: number) {
    if (seqIdx >= SH_INSURANCE_STAGE_SEQUENCE.length) {
      shInsuranceDemo.status = "complete";
      shInsuranceDemo.completedAt = new Date();
      return;
    }
    const { stage, delayMs } = SH_INSURANCE_STAGE_SEQUENCE[seqIdx];
    setTimeout(async () => {
      if (shInsuranceDemo.pipelineId !== pipelineId) return;
      try {
        const patch = await buildInsuranceStagePatch(stage);
        await storage.updateHealingPipeline(pipelineId, patch as any);
        if (shInsuranceDemo.deploymentId) {
          fireSHAgentStage(shInsuranceDemo.deploymentId, SH_INSURANCE_STAGE_PROMPTS[stage] || stage);
        }
        scheduleNextInsuranceStage(pipelineId, seqIdx + 1);
      } catch (err: any) {
        console.error("[demo/sh-insurance] stage advance error:", err.message);
      }
    }, delayMs);
  }

  const SH_INSURANCE_STAGE_PROMPTS: Record<string, string> = {
    detected:    "URGENT: ML fraud triage model false-positive rate spiked from 3.2% to 22.7% in 48 hours. CUSUM h-statistic: 8.4 (threshold 5.0 = systemic failure). Zone 7 geographic bias confirmed — 340% over-representation. 847 claims flagged, ~620 estimated misclassified. 47 vulnerable claimants (elderly/disability) affected. $2.1M in legitimate payouts delayed. NAIC, GDPR Article 22, SOX, and SFCH-01 obligations triggered. Begin autonomous claims recovery response.",
    diagnosed:   "Root cause confirmed: Zone 7 geographic bias in fraud model training data. FPR: 3.2%→22.7%. 620 claims misclassified. 47 vulnerable claimants flagged for 24h expedited review. Total delayed: $2.1M. SOX materiality threshold ($500K) exceeded. 12 state insurance departments require notification. Formulate isolation and review routing plan.",
    hypothesis:  "Formulating remediation plan. Hypothesis: (1) Isolate model v2.3.1 immediately; activate rules-based fallback scoring. (2) Route 620 misclassified claims to human adjuster queues with vulnerability prioritization. (3) Initiate NAIC-compliant fairness audit before recalibration. (4) Generate state regulator packages for 12 states. (5) Issue GDPR Article 22 explanations for 47 EU-linked claims within 72 hours.",
    remediation: "Executing remediation. Model v2.3.1 isolated. Rules-based fallback activated — FPR stabilized at 2.8%. 620 claims routed: 47 vulnerable (24h SLA), 94 high-value (72h SLA), 479 standard (5-day SLA). 2 overflow adjusters allocated. GDPR Art. 22 notices drafted for 47 claims. State regulator packages queued for 12 states. Adverse action letters: 620. SOX disclosure drafted.",
    resolved:    "Validating resolution. FPR restored to 2.8%. 620 misclassified claims in active human review — 47 vulnerable claimants prioritized. $2.1M payout exposure actively processed. GDPR Art. 22 notices sent. 12 state regulators notified. SOX disclosure filed. NAIC-compliant fairness audit initiated for model v2.4.0. Compiling NAIC, SFCH-01, GDPR, SOX, and ADA compliance audit trail.",
  };

  router.post("/api/demo/sh-insurance/trigger", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const allAgents = await storage.getAgents(orgId);
      const agent = allAgents.find(a => a.name === "Claims Workflow Recovery Agent");
      if (!agent) return res.status(404).json({ message: "Claims Workflow Recovery Agent not found" });

      if (shInsuranceDemo.pipelineId) {
        await storage.deleteHealingPipeline(shInsuranceDemo.pipelineId).catch(() => {});
      }

      const deploymentId = await ensureSHAgentDeployment(agent, orgId);

      const newPipeline = await storage.createHealingPipeline({
        title: "Fraud Triage Model FPR Spike — 847 Claims Affected, $2.1M Delayed",
        agentId: agent.id,
        agentName: agent.name,
        industry: "insurance",
        severity: "critical",
        priority: "critical",
        stage: "detected",
        issueType: "model_false_positive_spike",
        issueDescription: "ML fraud triage model FPR spiked from 3.2% to 22.7% — Zone 7 geographic bias detected. 847 claims flagged, ~620 estimated misclassified. 47 vulnerable claimants (elderly/disability) affected. $2.1M in legitimate payouts delayed. NAIC, SFCH-01, GDPR Article 22, and SOX obligations triggered.",
        triggerSource: "atlas_monitoring",
      } as any);

      shInsuranceDemo = {
        status: "running",
        pipelineId: newPipeline.id,
        triggeredAt: new Date(),
        completedAt: null,
        agentId: agent.id,
        deploymentId,
      };

      fireSHAgentStage(deploymentId, SH_INSURANCE_STAGE_PROMPTS.detected);
      scheduleNextInsuranceStage(newPipeline.id, 0);

      res.json({ pipelineId: newPipeline.id, agentId: agent.id, message: "Demo incident triggered" });
    } catch (err: any) {
      console.error("[demo/sh-insurance/trigger]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/api/demo/sh-insurance/status", async (_req, res) => {
    try {
      let pipeline = null;
      if (shInsuranceDemo.pipelineId) {
        pipeline = await storage.getHealingPipeline(shInsuranceDemo.pipelineId) ?? null;
      }
      const elapsedSeconds = shInsuranceDemo.triggeredAt
        ? Math.floor((Date.now() - shInsuranceDemo.triggeredAt.getTime()) / 1000)
        : 0;
      res.json({
        status: shInsuranceDemo.status,
        triggeredAt: shInsuranceDemo.triggeredAt,
        completedAt: shInsuranceDemo.completedAt,
        elapsedSeconds,
        pipeline,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/api/demo/sh-insurance/reset", async (_req, res) => {
    try {
      if (shInsuranceDemo.pipelineId) {
        await storage.deleteHealingPipeline(shInsuranceDemo.pipelineId).catch(() => {});
      }
      shInsuranceDemo = { status: "idle", pipelineId: null, triggeredAt: null, completedAt: null, agentId: null, deploymentId: null };
      res.json({ message: "Demo reset to idle" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── SCN-1.1 Fitch Rating Watch Intelligence Pipeline routes ────────────────
  router.post("/demo-api/fitch-rw/setup",     fitchRWSetupHandler);
  router.post("/demo-api/fitch-rw/reset",     fitchRWResetHandler);
  router.get("/demo-api/fitch-rw/live-run",   fitchRWLiveRunHandler);
  router.get("/demo-api/fitch-rw/agent-runs", getFitchRWAgentRuns);

export { ensureHearstAgents, ensureFitchAgents };
export default router;
