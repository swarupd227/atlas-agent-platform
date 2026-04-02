import { Router, type Request, type Response } from "express";

const router = Router();

// ── Segment price trends (BB-AGT-002) ──────────────────────────────────────

router.get("/segment-price-trends", (_req: Request, res: Response) => {
  const today = new Date();
  const getDateStr = (weeksBack: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - weeksBack * 7);
    return d.toISOString().split("T")[0];
  };

  res.json({
    success: true,
    reportDate: today.toISOString().split("T")[0],
    segments: [
      {
        segment: "Full-Size Pickup",
        currentWeekAvgPrice: 38200,
        priorWeekAvgPrice: 38887,
        twoWeekAvgPrice: 39539,
        threeWeekRollingChangeRate: -0.018,
        historicalNormRate: -0.004,
        deviationSigma: 3.1,
        weeklyPrices: [
          { week: getDateStr(6), avgPrice: 41200 },
          { week: getDateStr(5), avgPrice: 40800 },
          { week: getDateStr(4), avgPrice: 40100 },
          { week: getDateStr(3), avgPrice: 39539 },
          { week: getDateStr(2), avgPrice: 38887 },
          { week: getDateStr(1), avgPrice: 38200 },
        ],
        alert: "AMBER",
        alertMessage: "Full-Size Pickup segment showing accelerating depreciation. 3-week rolling average declining 1.8%/week vs 0.4% historical norm.",
      },
      {
        segment: "Mid-Size SUV",
        currentWeekAvgPrice: 28400,
        twoWeekAvgPrice: 28200,
        threeWeekRollingChangeRate: 0.003,
        historicalNormRate: 0.001,
        deviationSigma: 0.8,
        alert: null,
      },
      {
        segment: "Luxury SUV",
        currentWeekAvgPrice: 54100,
        twoWeekAvgPrice: 53800,
        threeWeekRollingChangeRate: 0.004,
        historicalNormRate: 0.002,
        deviationSigma: 0.6,
        alert: null,
        note: "Strongest performer: limited supply driving +0.4% appreciation",
      },
      {
        segment: "Electric Vehicle",
        currentWeekAvgPrice: 31200,
        twoWeekAvgPrice: 31800,
        threeWeekRollingChangeRate: -0.009,
        historicalNormRate: -0.005,
        deviationSigma: 1.2,
        alert: "GREEN",
        alertMessage: "EV depreciation slightly above norm but within manageable range",
      },
      {
        segment: "Compact Car",
        currentWeekAvgPrice: 14800,
        twoWeekAvgPrice: 15100,
        threeWeekRollingChangeRate: -0.009,
        historicalNormRate: -0.003,
        deviationSigma: 1.9,
        alert: "YELLOW",
      },
    ],
  });
});

router.get("/auction-volume-trends", (_req: Request, res: Response) => {
  res.json({
    success: true,
    reportDate: new Date().toISOString().split("T")[0],
    portfolioVolumeChange: 0.034,
    segmentVolumeTrends: [
      {
        segment: "Full-Size Pickup",
        currentWeekVolume: 18240,
        priorFourWeekAvg: 14950,
        changePercent: 22.0,
        interpretation: "Fleet dumping pattern — large fleet operators liquidating pickup inventory",
        correlatedSignal: "OEM incentive increase on 2024 F-150 and Silverado (new model year push)",
      },
      {
        segment: "Electric Vehicle",
        currentWeekVolume: 4210,
        priorFourWeekAvg: 4180,
        changePercent: 0.7,
        interpretation: "Stable — range anxiety concerns tempered by charging infrastructure improvements",
      },
      {
        segment: "Luxury SUV",
        currentWeekVolume: 2180,
        priorFourWeekAvg: 2400,
        changePercent: -9.2,
        interpretation: "Reduced supply tightening luxury segment — supports price appreciation",
      },
    ],
    macroSignal: {
      fuelPriceChange30d: -0.35,
      fuelPriceUnit: "USD/gallon",
      fuelPriceImpact: "Declining fuel costs reduce truck premium demand pressure; supports pickup depreciation thesis",
    },
  });
});

router.get("/news-signals", (_req: Request, res: Response) => {
  res.json({
    success: true,
    analysisDate: new Date().toISOString().split("T")[0],
    lookbackDays: 14,
    articlesAnalyzed: 847,
    segmentSignals: [
      {
        segment: "Full-Size Pickup",
        articleCount: 23,
        sentimentScore: -0.62,
        keyThemes: ["fleet right-sizing", "logistics sector downsizing", "EV transition impact on truck demand"],
        articles: [
          { headline: "Major logistics firms cut fleet size amid automation wave", source: "Transport Weekly", date: "2026-03-28", sentiment: -0.8 },
          { headline: "Amazon, FedEx accelerate EV van adoption, reducing pickup procurement", source: "Fleet Owner", date: "2026-03-25", sentiment: -0.7 },
          { headline: "GM, Ford escalate 2024 model year incentives to clear dealer lots", source: "Automotive News", date: "2026-03-22", sentiment: -0.5 },
        ],
        signalStrength: "STRONG",
        impactConfidence: 0.87,
      },
      {
        segment: "Electric Vehicle",
        articleCount: 41,
        sentimentScore: 0.24,
        keyThemes: ["charging infrastructure expansion", "tax credit extension", "residual value stabilization"],
        signalStrength: "MODERATE",
        impactConfidence: 0.61,
      },
    ],
    oemIncentiveSignals: [
      { oem: "Ford", model: "F-150", incentiveType: "Cash back", amount: 3500, effectiveDate: "2026-03-01", impact: "Puts downward pressure on 2022-2023 used F-150 values" },
      { oem: "GM", model: "Silverado 1500", incentiveType: "0% APR 60 months", effectiveDate: "2026-03-15", impact: "New-car incentive cannibalizing used truck demand at auction" },
    ],
  });
});

router.get("/shift-alerts", (_req: Request, res: Response) => {
  res.json({
    success: true,
    alertDate: new Date().toISOString().split("T")[0],
    activeAlerts: [
      {
        alertId: "MSA-2026-0089",
        segment: "Full-Size Pickup",
        severity: "AMBER",
        confidence: 0.87,
        estimatedLeadTime: "2.5 weeks before weekly report surfacing",
        headline: "Full-Size Pickup segment showing accelerating depreciation. 3-week rolling average wholesale price declining 1.8%/week vs. 0.4% historical norm.",
        fusedSignals: [
          { type: "Auction Volume", detail: "Volume up 22% — fleet dumping pattern confirmed at Manheim and Adesa", confidence: 0.92 },
          { type: "OEM Incentive", detail: "New 2024 F-150 and Silverado incentives detected ($3,500 cash back / 0% APR 60mo)", confidence: 0.95 },
          { type: "Fuel Price", detail: "Retail fuel down $0.35/gal past 30 days — reducing truck premium", confidence: 0.88 },
          { type: "News Signal", detail: "3 articles on fleet right-sizing in logistics sector; sentiment score -0.62", confidence: 0.79 },
        ],
        projectedImpact: {
          nextTwoWeekPriceChange: -3.6,
          affectedValueRange: "$1,200-$2,400 per vehicle depending on trim",
          affectedLenderExposure: "Lenders with >15% pickup concentration should adjust advance rates immediately",
        },
        recommendedAction: "Publish segment advisory to affected clients. Adjust wholesale outlook for Full-Size Pickup by -3.5% over next 4 weeks.",
      },
    ],
    monitoringSegments: 12,
    cleanSegments: 10,
  });
});

// ── Competitive intelligence (BB-AGT-003) ──────────────────────────────────

router.get("/blackbook-values", (req: Request, res: Response) => {
  const segment = (req.query.segment as string) || "Mid-Size Car";
  res.json({
    success: true,
    reportDate: new Date().toISOString().split("T")[0],
    provider: "Black Book",
    segment,
    sampleVehicles: [
      { year: 2022, make: "Toyota", model: "Camry LE", conditionGrade: "3.0", tradeinValue: 18400, wholesaleValue: 17800 },
      { year: 2022, make: "Honda", model: "Accord LX", conditionGrade: "3.0", tradeinValue: 19200, wholesaleValue: 18500 },
      { year: 2021, make: "Nissan", model: "Altima S", conditionGrade: "3.0", tradeinValue: 15800, wholesaleValue: 15200 },
      { year: 2022, make: "Chevrolet", model: "Malibu LT", conditionGrade: "3.0", tradeinValue: 14100, wholesaleValue: 13600 },
    ],
    aggregateMetrics: {
      avgWholesale: 16275,
      avgTradein: 16875,
      coverageVINs: 847,
      lastUpdated: new Date().toISOString(),
      dataFreshness: "Daily auction-based refresh",
    },
  });
});

router.get("/competitor-values", (req: Request, res: Response) => {
  const segment = (req.query.segment as string) || "Mid-Size Car";
  res.json({
    success: true,
    reportDate: new Date().toISOString().split("T")[0],
    segment,
    competitors: [
      {
        provider: "KBB",
        sampleVehicles: [
          { year: 2022, make: "Toyota", model: "Camry LE", conditionGrade: "Good", tradeinValue: 19100, wholesaleValue: null },
          { year: 2022, make: "Honda", model: "Accord LX", conditionGrade: "Good", tradeinValue: 19900, wholesaleValue: null },
          { year: 2021, make: "Nissan", model: "Altima S", conditionGrade: "Good", tradeinValue: 16200, wholesaleValue: null },
        ],
        aggregateMetrics: { avgTradein: 18400, coverageVINs: 412, lastUpdated: "Weekly refresh", dataFreshness: "7-day lag" },
        divergenceNote: "KBB trade-in values average 9.5% above Black Book wholesale — expected given retail orientation",
      },
      {
        provider: "NADA",
        sampleVehicles: [
          { year: 2022, make: "Toyota", model: "Camry LE", conditionGrade: "Clean Trade", tradeinValue: 18800, roughTradeinValue: 16200 },
          { year: 2022, make: "Honda", model: "Accord LX", conditionGrade: "Clean Trade", tradeinValue: 19500, roughTradeinValue: 16800 },
          { year: 2021, make: "Nissan", model: "Altima S", conditionGrade: "Clean Trade", tradeinValue: 15900, roughTradeinValue: 13800 },
        ],
        aggregateMetrics: { avgCleanTrade: 18067, avgRoughTrade: 15600, coverageVINs: 380, lastUpdated: "Monthly refresh", dataFreshness: "30-day lag" },
      },
    ],
  });
});

router.get("/divergence-analysis", (_req: Request, res: Response) => {
  res.json({
    success: true,
    analysisDate: new Date().toISOString().split("T")[0],
    overallDivergenceScore: 4.2,
    competitiveSummary: {
      blackbookVsKBB: {
        avgDivergence: -9.5,
        interpretation: "BB wholesale systematically 9.5% below KBB trade-in — appropriate given methodology difference",
        segments_of_concern: [],
        strategicPosition: "ALIGNED — methodological difference fully explained",
      },
      blackbookVsNADA: {
        avgDivergence: -0.8,
        interpretation: "BB and NADA in close alignment on wholesale values",
        segments_of_concern: ["Full-Size Pickup"],
        strategicPosition: "ADVANTAGE — BB has 3-day data vs NADA 30-day lag giving earlier signal",
      },
    },
    segmentDivergences: [
      { segment: "Full-Size Pickup", bbAvg: 38200, kbbAvg: 41800, nadaAvg: 40100, bbVsKbbPct: -8.6, bbVsNadaPct: -4.7, explanation: "BB is ahead of curve — pickup depreciation wave not yet in KBB/NADA" },
      { segment: "Luxury SUV", bbAvg: 54100, kbbAvg: 58200, nadaAvg: 55800, bbVsKbbPct: -7.0, bbVsNadaPct: -3.0, explanation: "Normal retail-vs-wholesale spread; BB accurately reflecting auction-based reality" },
      { segment: "Electric Vehicle", bbAvg: 31200, kbbAvg: 33800, nadaAvg: 32100, bbVsKbbPct: -7.7, bbVsNadaPct: -2.8, explanation: "BB EV values more conservative; appropriate given volatility in EV residuals" },
    ],
    competitiveAdvantages: [
      "BB refreshes daily vs NADA monthly (30-day data advantage)",
      "BB captures 142K+ daily transactions vs KBB's dealership-based survey model",
      "BB Full-Size Pickup values currently 4.7% below NADA — BB will be proven correct in 2-3 weeks",
    ],
    strategicRecommendations: [
      "Publish Full-Size Pickup divergence analysis as thought leadership — demonstrates BB's early warning advantage",
      "Reach out to lenders using NADA for pickup — BB offers 4-week valuation advantage",
    ],
  });
});

router.get("/competitive-brief", (_req: Request, res: Response) => {
  res.json({
    success: true,
    briefDate: new Date().toISOString().split("T")[0],
    executiveSummary: {
      overallCompetitivePosition: "STRONG",
      dataFreshnessAdvantage: "BB leads KBB by 7 days and NADA by 30 days on Full-Size Pickup depreciation signal",
      coverageStrength: "142K+ daily auction transactions — largest daily coverage of any provider",
      keyWin: "Full-Size Pickup depreciation call is 2.5 weeks ahead of competitors — actionable advantage for lender clients",
    },
    monthlyDivergenceHistory: [
      { month: "Jan 2026", bbVsNadaAvg: 0.3, bbVsKbbAvg: -9.1 },
      { month: "Feb 2026", bbVsNadaAvg: -0.5, bbVsKbbAvg: -9.3 },
      { month: "Mar 2026", bbVsNadaAvg: -2.1, bbVsKbbAvg: -9.5, note: "Full-Size Pickup divergence accelerating — BB ahead of market" },
    ],
  });
});

export default router;
