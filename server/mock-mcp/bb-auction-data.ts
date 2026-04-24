import { Router, type Request, type Response } from "express";

const router = Router();

const SEGMENTS = [
  "Compact Car", "Mid-Size Car", "Full-Size Car", "Luxury Car",
  "Compact SUV/CUV", "Mid-Size SUV", "Full-Size SUV", "Luxury SUV",
  "Full-Size Pickup", "Mid-Size Pickup", "Electric Vehicle", "Hybrid",
];

const AUCTION_SOURCES = ["Manheim", "Adesa", "Independent", "Dealer-Direct"];

const MAKES = ["Toyota", "Honda", "Ford", "Chevrolet", "GMC", "BMW", "Mercedes-Benz", "Tesla", "Nissan", "Dodge", "Ram", "Jeep", "Lexus", "Kia", "Hyundai"];

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = ((s * 1664525 + 1013904223) | 0) >>> 0;
    return s / 0xffffffff;
  };
}

router.get("/ingest-batch", (_req: Request, res: Response) => {
  const rng = seededRng(Date.now() % 999983);
  const date = new Date().toISOString().split("T")[0];
  const transactions: any[] = [];

  const total = 142183;
  for (let i = 0; i < 80; i++) {
    const make = MAKES[Math.floor(rng() * MAKES.length)];
    const year = 2019 + Math.floor(rng() * 6);
    const segment = SEGMENTS[Math.floor(rng() * SEGMENTS.length)];
    const source = AUCTION_SOURCES[Math.floor(rng() * AUCTION_SOURCES.length)];
    const basePrice = 12000 + Math.floor(rng() * 40000);
    transactions.push({
      vin: `VIN${String(Math.floor(rng() * 1e10)).padStart(13, "0")}`,
      year,
      make,
      model: `${make} Model ${String.fromCharCode(65 + Math.floor(rng() * 5))}`,
      segment,
      auctionSource: source,
      auctionDate: date,
      salePrice: basePrice,
      conditionGrade: ["1.0", "2.0", "3.0", "4.0"][Math.floor(rng() * 4)],
      odometer: 10000 + Math.floor(rng() * 90000),
      region: ["SE", "SW", "NE", "NW", "MW", "SC"][Math.floor(rng() * 6)],
      laneNumber: Math.floor(rng() * 20) + 1,
    });
  }

  res.json({
    success: true,
    batchDate: date,
    totalTransactions: total,
    sampledTransactions: transactions.length,
    sourceBreakdown: {
      Manheim: Math.floor(total * 0.48),
      Adesa: Math.floor(total * 0.31),
      Independent: Math.floor(total * 0.13),
      "Dealer-Direct": Math.floor(total * 0.08),
    },
    segmentBreakdown: SEGMENTS.map(s => ({
      segment: s,
      count: Math.floor(total / SEGMENTS.length * (0.7 + seededRng(s.charCodeAt(0) * 17)() * 0.6)),
    })),
    transactions,
  });
});

router.get("/outlier-detection", (_req: Request, res: Response) => {
  const date = new Date().toISOString().split("T")[0];
  res.json({
    success: true,
    batchDate: date,
    totalAnalyzed: 142183,
    outlierTests: [
      { testName: "3-sigma price deviation", description: "VIN-level sale price vs segment-condition model", flagged: 15, severity: "HIGH" },
      { testName: "Geographic arbitrage scan", description: "Same vehicle class priced >$5K differently across regions without condition justification", flagged: 5, severity: "MEDIUM" },
      { testName: "Odometer rollback heuristic", description: "Odometer reading inconsistent with age/condition trajectory", flagged: 3, severity: "HIGH" },
    ],
    priceOutliers: [
      { vin: "1HGCV1F34PA028451", make: "Honda", model: "Accord", year: 2023, segment: "Mid-Size Car", salePrice: 28400, modelPrice: 21200, deviation: 34.0, region: "NE", auctionSource: "Manheim", flagReason: "Price exceeds 3-sigma model threshold" },
      { vin: "3VWFE21C04M000001", make: "Volkswagen", model: "Jetta", year: 2022, segment: "Compact Car", salePrice: 6200, modelPrice: 14800, deviation: -58.1, region: "SE", auctionSource: "Adesa", flagReason: "Price below 3-sigma floor — possible damage/title issue" },
      { vin: "2T3BFREV0JW000002", make: "Toyota", model: "RAV4", year: 2021, segment: "Compact SUV/CUV", salePrice: 39100, modelPrice: 24600, deviation: 58.9, region: "SW", auctionSource: "Manheim", flagReason: "Extreme high outlier — potential data entry error or title washing" },
    ],
    geographicInconsistencies: [
      { segment: "Mid-Size Car", make: "Toyota", model: "Camry", year: 2023, pricePhoenix: 24800, priceAtlanta: 16800, variance: 8000, justification: null, riskLevel: "HIGH", note: "No condition difference justifies $8K spread; likely feed error or fraud" },
      { segment: "Compact SUV/CUV", make: "Honda", model: "CR-V", year: 2022, pricePhoenix: 27200, priceAtlanta: 21400, variance: 5800, justification: null, riskLevel: "MEDIUM", note: "Regional demand gap — no condition report filed to justify spread" },
    ],
    volumeAnomalies: [
      { segment: "Luxury SUV", auctionSource: "Manheim Southeast", currentWeekVolume: 187, priorWeekAvg: 283, changePercent: -33.9, riskLevel: "HIGH", note: "Sudden 34% volume drop — possible feed outage or fleet pullback" },
    ],
  });
});

router.get("/fraud-patterns", (_req: Request, res: Response) => {
  res.json({
    success: true,
    analysisDate: new Date().toISOString().split("T")[0],
    totalVINsScanned: 142183,
    suspectedFraudPatterns: [
      {
        patternId: "FP-2026-0341",
        patternType: "Multi-auction duplicate VIN",
        confidence: 0.94,
        affectedVINs: 1,
        details: {
          vin: "1HGCV1F34PA028451",
          vehicleDescription: "2023 Honda Accord EX-L",
          appearances: [
            { auction: "Manheim Atlanta", date: "2026-02-28", salePrice: 22400, buyerLicenseState: "GA", status: "sold" },
            { auction: "Adesa Dallas", date: "2026-03-03", salePrice: 21800, buyerLicenseState: "TX", status: "sold" },
            { auction: "Manheim Southeast", date: "2026-03-07", salePrice: 23100, buyerLicenseState: null, status: "listed" },
          ],
          fraudIndicators: [
            "Same VIN sold at 2 auctions in 3 days across 2 states",
            "Third listing 4 days later suggests title-washing loop",
            "Buyer state discrepancy: GA and TX both claim title transfer",
            "Odometer unchanged across all 3 appearances (31,400 mi)",
          ],
          historicalBaserate: "87% of VINs appearing at 3+ auctions in 14 days confirmed fraud",
          recommendedAction: "QUARANTINE all 3 transactions; alert NMVTIS; flag buying entities for investigation",
        },
      },
    ],
    suspicionIndex: { HIGH: 1, MEDIUM: 4, LOW: 12 },
    historicalAccuracy: { confirmedFraudRate: 0.87, falsePositiveRate: 0.07 },
  });
});

router.post("/quarantine", (_req: Request, res: Response) => {
  res.json({
    success: true,
    quarantineId: `QRN-${Date.now().toString(36).toUpperCase()}`,
    quarantinedAt: new Date().toISOString(),
    totalTransactionsQuarantined: 23,
    breakdown: {
      priceOutliers: 15,
      geographicInconsistencies: 5,
      volumeAnomalies: 2,
      fraudPatterns: 1,
    },
    impact: "23 transactions excluded from today's valuation model update. Black Book pricing integrity maintained.",
    reviewRequired: [
      { vin: "1HGCV1F34PA028451", reason: "Suspected fraud — multi-auction duplicate", priority: "URGENT" },
      { vin: "2T3BFREV0JW000002", reason: "Extreme price outlier +58.9%", priority: "HIGH" },
    ],
  });
});

router.get("/quality-report", (_req: Request, res: Response) => {
  res.json({
    success: true,
    reportDate: new Date().toISOString().split("T")[0],
    executiveSummary: {
      totalTransactions: 142183,
      passedQualityCheck: 142160,
      quarantined: 23,
      quarantineRate: 0.016,
      anomalyDetectionRate: 97.2,
      falsePositiveRate: 7.8,
      modelIntegrityStatus: "INTACT",
    },
    anomalyBreakdown: [
      { type: "Price Outlier (>3σ)", count: 15, percentOfTotal: 0.011 },
      { type: "Geographic Inconsistency", count: 5, percentOfTotal: 0.004 },
      { type: "Volume Anomaly", count: 2, percentOfTotal: 0.001 },
      { type: "Suspected Fraud Pattern", count: 1, percentOfTotal: 0.001 },
    ],
    topAnomalousSegments: ["Mid-Size Car", "Luxury SUV", "Full-Size Pickup"],
    agentPerformanceMetrics: {
      processingTimeSec: 247,
      toolCallsExecuted: 5,
      automatedDecisions: 23,
      humanEscalations: 2,
    },
  });
});

export default router;
