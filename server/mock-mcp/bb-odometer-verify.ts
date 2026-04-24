import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = ((s * 1664525 + 1013904223) | 0) >>> 0;
    return s / 0xffffffff;
  };
}

const MAKES = ["Chevrolet", "Ford", "Toyota", "Honda", "BMW", "Ram", "GMC", "Nissan"];
const MODELS: Record<string, string[]> = {
  Chevrolet: ["Silverado 1500", "Tahoe", "Suburban"],
  Ford:      ["F-150", "Explorer", "Expedition"],
  Toyota:    ["Camry", "Highlander", "Tundra"],
  Honda:     ["Accord", "Pilot", "Ridgeline"],
  BMW:       ["3 Series", "X5", "5 Series"],
  Ram:       ["1500", "2500", "ProMaster"],
  GMC:       ["Sierra 1500", "Yukon", "Canyon"],
  Nissan:    ["Altima", "Frontier", "Pathfinder"],
};
const AUCTIONS = ["Manheim Atlanta", "Adesa Dallas", "Manheim Chicago", "Adesa Phoenix", "Manheim LA", "NAAA Southeast"];
const REGIONS  = ["SE", "SW", "NE", "NW", "MW", "SC"];

const FLAGGED_VINS = [
  {
    vin:   "1GCUYDED3NZ182741",
    make:  "Chevrolet",
    model: "Silverado 1500",
    year:  2021,
    history: [
      { date: "2025-08-14", auction: "Manheim Chicago",   miles: 57240, price: 32800, region: "MW" },
      { date: "2025-11-03", auction: "Adesa Dallas",       miles: 59830, price: 31500, region: "SC" },
      { date: "2026-01-22", auction: "Manheim Atlanta",    miles: 62183, price: 30100, region: "SE" },
      { date: "2026-03-28", auction: "NAAA Southeast",     miles: 58947, price: 33400, region: "SE" },
    ],
    rollbackMiles: 3236,
    severity: "HIGH",
    serviceRecordMiles: 63100,
    serviceRecordDate: "2026-03-01",
    valuationOverstatement: 9708,
    recommendedAction: "Quarantine and flag dealer for investigation",
  },
  {
    vin:   "3TMCZ5AN1NM489012",
    make:  "Toyota",
    model: "Tacoma",
    year:  2022,
    history: [
      { date: "2025-09-18", auction: "Manheim LA",         miles: 31450, price: 38200, region: "NW" },
      { date: "2025-12-07", auction: "Adesa Phoenix",       miles: 33890, price: 37100, region: "SW" },
      { date: "2026-02-14", auction: "Manheim LA",         miles: 29100, price: 39900, region: "NW" },
    ],
    rollbackMiles: 4790,
    severity: "CRITICAL",
    serviceRecordMiles: 34500,
    serviceRecordDate: "2026-01-30",
    valuationOverstatement: 14370,
    recommendedAction: "Immediate quarantine. Dealer license review required.",
  },
  {
    vin:   "1FTFW1E84NFB73291",
    make:  "Ford",
    model: "F-150",
    year:  2020,
    history: [
      { date: "2025-07-22", auction: "Adesa Dallas",       miles: 78340, price: 28500, region: "SC" },
      { date: "2025-10-15", auction: "Manheim Atlanta",    miles: 80910, price: 27800, region: "SE" },
      { date: "2026-03-05", auction: "NAAA Southeast",     miles: 79230, price: 29200, region: "SE" },
    ],
    rollbackMiles: 1680,
    severity: "MEDIUM",
    serviceRecordMiles: 81400,
    serviceRecordDate: "2026-02-10",
    valuationOverstatement: 5040,
    recommendedAction: "Flag for dealer review. Possible odometer cable tampering.",
  },
];

const AGGRESSIVE_VIN = FLAGGED_VINS[1];

const SERVICE_CONFLICT_VIN = {
  vin:   "5UXCR6C09N9J12843",
  make:  "BMW",
  model: "X5",
  year:  2022,
  auctionMiles: 65200,
  auctionDate:  "2026-04-10",
  auction:      "Manheim Chicago",
  carfaxMiles:  71400,
  carfaxDate:   "2026-04-02",
  discrepancy:  6200,
  status:       "SERVICE_CONFLICT",
  notes: "CARFAX shows 71,400 miles on 4/2 (BMW dealer service). Auction shows 65,200 miles on 4/10 — 6,200 fewer miles 8 days later. Cannot determine direction of fraud without title history. Escalated for manual review.",
  recommendedAction: "Manual escalation — cannot auto-resolve. Title history pull required.",
};

router.get("/scan-batch", (_req: Request, res: Response) => {
  const rng = seededRng(Date.now() % 99991);
  const date = new Date().toISOString().split("T")[0];
  const totalVins = 142183;

  const cleanVinSample: any[] = [];
  for (let i = 0; i < 12; i++) {
    const make  = MAKES[Math.floor(rng() * MAKES.length)];
    const models = MODELS[make] || ["Model A"];
    const startMiles = 20000 + Math.floor(rng() * 60000);
    cleanVinSample.push({
      vin:          `VIN${String(Math.floor(rng() * 1e10)).padStart(13, "0")}`,
      make,
      model:        models[Math.floor(rng() * models.length)],
      year:         2019 + Math.floor(rng() * 6),
      prevMiles:    startMiles,
      currentMiles: startMiles + 3000 + Math.floor(rng() * 12000),
      status:       "CLEAN",
    });
  }

  res.json({
    success:       true,
    scanDate:      date,
    totalVinsScanned: totalVins,
    rollbacksDetected: FLAGGED_VINS.length,
    serviceConflicts:  1,
    cleanVins:         totalVins - FLAGGED_VINS.length - 1,
    detectionRatePct:  99.87,
    flaggedVins: FLAGGED_VINS.map(v => ({
      vin:           v.vin,
      make:          v.make,
      model:         v.model,
      year:          v.year,
      severity:      v.severity,
      rollbackMiles: v.rollbackMiles,
      lastAuction:   v.history[v.history.length - 1].auction,
      lastDate:      v.history[v.history.length - 1].date,
    })),
    serviceConflictVins: [
      {
        vin:        SERVICE_CONFLICT_VIN.vin,
        make:       SERVICE_CONFLICT_VIN.make,
        model:      SERVICE_CONFLICT_VIN.model,
        year:       SERVICE_CONFLICT_VIN.year,
        status:     SERVICE_CONFLICT_VIN.status,
        discrepancy: SERVICE_CONFLICT_VIN.discrepancy,
      },
    ],
    cleanVinSample,
  });
});

router.get("/vin-history", (req: Request, res: Response) => {
  const vin = (req.query.vin as string) || FLAGGED_VINS[0].vin;
  const match = FLAGGED_VINS.find(v => v.vin === vin);

  if (!match) {
    res.json({ success: true, vin, status: "CLEAN", history: [], rollbackDetected: false });
    return;
  }

  res.json({
    success:         true,
    vin:             match.vin,
    vehicle:         `${match.year} ${match.make} ${match.model}`,
    rollbackDetected: true,
    rollbackMiles:   match.rollbackMiles,
    severity:        match.severity,
    history:         match.history,
    rollbackWindow: {
      from: match.history[match.history.length - 2],
      to:   match.history[match.history.length - 1],
      milesReversed: match.rollbackMiles,
      daysElapsed: Math.floor(
        (new Date(match.history[match.history.length - 1].date).getTime() -
         new Date(match.history[match.history.length - 2].date).getTime()) /
        86400000
      ),
    },
  });
});

router.get("/service-records", (_req: Request, res: Response) => {
  res.json({
    success: true,
    recordsChecked: FLAGGED_VINS.length + 1,
    results: [
      ...FLAGGED_VINS.map(v => ({
        vin:                  v.vin,
        vehicle:              `${v.year} ${v.make} ${v.model}`,
        serviceRecordMiles:   v.serviceRecordMiles,
        serviceRecordDate:    v.serviceRecordDate,
        auctionMiles:         v.history[v.history.length - 1].miles,
        auctionDate:          v.history[v.history.length - 1].date,
        verdict:              "CONFIRMED_ROLLBACK",
        serviceSource:        "CARFAX",
        discrepancy:          v.serviceRecordMiles - v.history[v.history.length - 1].miles,
        confidenceScore:      v.severity === "CRITICAL" ? 0.99 : v.severity === "HIGH" ? 0.96 : 0.88,
      })),
      {
        vin:                SERVICE_CONFLICT_VIN.vin,
        vehicle:            `${SERVICE_CONFLICT_VIN.year} ${SERVICE_CONFLICT_VIN.make} ${SERVICE_CONFLICT_VIN.model}`,
        serviceRecordMiles: SERVICE_CONFLICT_VIN.carfaxMiles,
        serviceRecordDate:  SERVICE_CONFLICT_VIN.carfaxDate,
        auctionMiles:       SERVICE_CONFLICT_VIN.auctionMiles,
        auctionDate:        SERVICE_CONFLICT_VIN.auctionDate,
        verdict:            "INDETERMINATE",
        serviceSource:      "CARFAX",
        discrepancy:        SERVICE_CONFLICT_VIN.discrepancy,
        confidenceScore:    0.0,
        notes:              SERVICE_CONFLICT_VIN.notes,
      },
    ],
  });
});

router.get("/financial-impact", (_req: Request, res: Response) => {
  const perMileValue = 3.0;
  const impacts = FLAGGED_VINS.map(v => ({
    vin:                   v.vin,
    vehicle:               `${v.year} ${v.make} ${v.model}`,
    rollbackMiles:         v.rollbackMiles,
    valuationOverstatement: v.valuationOverstatement,
    priceInflation:        Math.round(v.valuationOverstatement / v.history[v.history.length - 1].price * 100 * 10) / 10,
    severity:              v.severity,
    salePrice:             v.history[v.history.length - 1].price,
    trueMarketValue:       v.history[v.history.length - 1].price - v.valuationOverstatement,
  }));

  const totalOverstatement = impacts.reduce((s, i) => s + i.valuationOverstatement, 0);
  const escConflict = Math.round(SERVICE_CONFLICT_VIN.discrepancy * perMileValue);

  res.json({
    success:                  true,
    totalVinsAnalyzed:        FLAGGED_VINS.length + 1,
    confirmedRollbacks:       FLAGGED_VINS.length,
    totalValuationOverstatement: totalOverstatement,
    serviceConflictExposure:  escConflict,
    totalFinancialRisk:       totalOverstatement + escConflict,
    perMileAdjustmentRate:    perMileValue,
    impacts,
    industryContext: {
      annualOdometerFraudCost: "1.0B+",
      fraudRatePct:            0.1,
      bbDailyRisk:             Math.round(totalOverstatement * 14.2),
    },
  });
});

router.get("/fraud-report", (_req: Request, res: Response) => {
  const date = new Date().toISOString().split("T")[0];
  const totalOverstatement = FLAGGED_VINS.reduce((s, v) => s + v.valuationOverstatement, 0);
  const escConflict = Math.round(SERVICE_CONFLICT_VIN.discrepancy * 3.0);

  res.json({
    success:      true,
    reportId:     `BB-OFR-${date.replace(/-/g, "")}-001`,
    generatedAt:  new Date().toISOString(),
    reportTitle:  "Odometer Fraud Detection Report — Daily Scan",
    scanDate:     date,
    executive: {
      totalVinsScanned:        142183,
      rollbacksDetected:       FLAGGED_VINS.length,
      serviceConflictsEscalated: 1,
      totalFinancialRisk:      totalOverstatement + escConflict,
      valuationProtected:      totalOverstatement + escConflict,
      detectionRatePct:        99.87,
      processingTimeSec:       214,
    },
    findings: FLAGGED_VINS.map((v, i) => ({
      rank:        i + 1,
      vin:         v.vin,
      vehicle:     `${v.year} ${v.make} ${v.model}`,
      severity:    v.severity,
      rollbackMiles: v.rollbackMiles,
      valuationOverstatement: v.valuationOverstatement,
      auctionHistory: v.history.length,
      lastAuction:   v.history[v.history.length - 1].auction,
      recommendedAction: v.recommendedAction,
    })),
    escalations: [
      {
        vin:    SERVICE_CONFLICT_VIN.vin,
        vehicle: `${SERVICE_CONFLICT_VIN.year} ${SERVICE_CONFLICT_VIN.make} ${SERVICE_CONFLICT_VIN.model}`,
        type:   "SERVICE_RECORD_CONFLICT",
        reason: SERVICE_CONFLICT_VIN.notes,
        recommendedAction: SERVICE_CONFLICT_VIN.recommendedAction,
        exposureRisk: escConflict,
      },
    ],
    dealerAlerts: FLAGGED_VINS.filter(v => v.severity !== "MEDIUM").map(v => ({
      vin:    v.vin,
      dealer: v.history[v.history.length - 1].auction,
      action: "DEALER_NETWORK_ALERT",
    })),
    modelImpact: {
      quarantinedFromPricingModel: FLAGGED_VINS.length,
      pricingModelIntegrity:       "PROTECTED",
      nextReviewDate:              new Date(Date.now() + 86400000).toISOString().split("T")[0],
    },
  });
});

export default router;
