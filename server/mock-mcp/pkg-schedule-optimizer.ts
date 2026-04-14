import { Router, type Request, type Response } from "express";

const router = Router();

const ALTERNATIVES = [
  {
    id: "ALT-A",
    label: "Alternative A — OEE-Priority",
    description: "Maximises OEE by grouping orders into substrate batches, front-loading B-Flute, and minimising changeovers through machine affinity clustering.",
    recommended: true,
    rank: 1,
    metrics: {
      oee:                 82.2,
      oeeDelta:           +11.2,
      otif:                93.6,
      otifOrders:          44,
      otifDelta:           +4,
      changeovers:         14,
      changeoverDelta:     -3,
      substrateUtilPct:    91.5,
      substrateDelta:      -8.0,
      rushCoverage:        3,
      rushCoverageTotal:   3,
      totalRuntimeMin:     432,
      idleTimeMin:          48,
      compositeScore:      87.4,
    },
    keyFeatures: [
      "B-Flute orders (WP-0001, WP-0003, WP-0005, WP-0009 + 2 others) front-loaded to 07:00–10:45",
      "All 3 RUSH orders: WP-0001 (M1 07:00), WP-0003 (M2 07:30), WP-0002 (M4 09:00)",
      "M3 maintenance block respected with 15-min buffer (last order on M3 ends 09:45)",
      "Substrate batch grouping: B→A→C transition per corrugator saves 48 min",
    ],
  },
  {
    id: "ALT-B",
    label: "Alternative B — OTIF-Priority",
    description: "Prioritises on-time delivery by scheduling all near-deadline orders first, at the cost of higher changeover frequency.",
    recommended: false,
    rank: 2,
    metrics: {
      oee:                 79.6,
      oeeDelta:            +8.6,
      otif:                95.7,
      otifOrders:          45,
      otifDelta:            +5,
      changeovers:         16,
      changeoverDelta:      -1,
      substrateUtilPct:    89.8,
      substrateDelta:      -9.6,
      rushCoverage:         3,
      rushCoverageTotal:    3,
      totalRuntimeMin:     442,
      idleTimeMin:          38,
      compositeScore:      83.1,
    },
    keyFeatures: [
      "Orders sorted strictly by deadline proximity — highest OTIF but most changeovers",
      "All 3 RUSH orders covered; 1 additional standard order on-time vs. Alternative A",
      "2 more changeovers than Alternative A (+12 min lost production time)",
      "OEE 2.6pp lower than Alternative A due to changeover overhead",
    ],
  },
  {
    id: "ALT-C",
    label: "Alternative C — Balanced",
    description: "Equal weighting of OEE and OTIF objectives; moderate performance on both dimensions with conservative changeover scheduling.",
    recommended: false,
    rank: 3,
    metrics: {
      oee:                 78.3,
      oeeDelta:            +7.3,
      otif:                91.5,
      otifOrders:          43,
      otifDelta:            +3,
      changeovers:         15,
      changeoverDelta:      -2,
      substrateUtilPct:    90.2,
      substrateDelta:      -9.0,
      rushCoverage:         3,
      rushCoverageTotal:    3,
      totalRuntimeMin:     437,
      idleTimeMin:          43,
      compositeScore:      79.8,
    },
    keyFeatures: [
      "Conservative scheduling with buffer time before maintenance windows",
      "All 3 RUSH orders covered with 30-min delivery buffer",
      "OEE and OTIF both moderate — neither optimised",
      "Recommended as a risk-averse fallback if B-Flute resupply is delayed",
    ],
  },
];

const RUSH_COVERAGE = {
  "ALT-A": [
    { orderId: "WP-2026-04150001", customer: "FreshFarm Co",      deadline: "13:00", scheduledComplete: "09:35", onTime: true, margin: "3h 25m", machine: "M1" },
    { orderId: "WP-2026-04150002", customer: "RetailEdge",         deadline: "14:00", scheduledComplete: "11:12", onTime: true, margin: "2h 48m", machine: "M4" },
    { orderId: "WP-2026-04150003", customer: "GreenLeaf Produce",  deadline: "12:30", scheduledComplete: "09:30", onTime: true, margin: "3h 00m", machine: "M2" },
  ],
  "ALT-B": [
    { orderId: "WP-2026-04150001", customer: "FreshFarm Co",      deadline: "13:00", scheduledComplete: "10:15", onTime: true, margin: "2h 45m", machine: "M1" },
    { orderId: "WP-2026-04150002", customer: "RetailEdge",         deadline: "14:00", scheduledComplete: "11:45", onTime: true, margin: "2h 15m", machine: "M4" },
    { orderId: "WP-2026-04150003", customer: "GreenLeaf Produce",  deadline: "12:30", scheduledComplete: "09:05", onTime: true, margin: "3h 25m", machine: "M2" },
  ],
  "ALT-C": [
    { orderId: "WP-2026-04150001", customer: "FreshFarm Co",      deadline: "13:00", scheduledComplete: "10:40", onTime: true, margin: "2h 20m", machine: "M1" },
    { orderId: "WP-2026-04150002", customer: "RetailEdge",         deadline: "14:00", scheduledComplete: "12:30", onTime: true, margin: "1h 30m", machine: "M4" },
    { orderId: "WP-2026-04150003", customer: "GreenLeaf Produce",  deadline: "12:30", scheduledComplete: "10:00", onTime: true, margin: "2h 30m", machine: "M2" },
  ],
};

router.post("/run-constraint-solver", (_req: Request, res: Response) => {
  res.json({
    plant:            "Westfield Packaging",
    shiftDate:        "2026-04-15",
    ordersScheduled:  47,
    machinesUsed:     8,
    shiftWindowMin:   480,
    alternativesGenerated: ALTERNATIVES.length,
    alternatives:     ALTERNATIVES,
    recommendedId:    "ALT-A",
    solvedAt:         new Date().toISOString(),
    solverDurationMs: 1240,
  });
});

router.post("/evaluate-alternative", (req: Request, res: Response) => {
  const altId = (req.body?.alternativeId || "ALT-A") as keyof typeof RUSH_COVERAGE;
  const alt = ALTERNATIVES.find(a => a.id === altId) || ALTERNATIVES[0];
  res.json({
    alternative: alt,
    rushCoverage: RUSH_COVERAGE[alt.id as keyof typeof RUSH_COVERAGE] || RUSH_COVERAGE["ALT-A"],
    evaluatedAt: new Date().toISOString(),
  });
});

router.post("/get-rush-coverage", (req: Request, res: Response) => {
  const altId = (req.body?.alternativeId || "ALT-A") as keyof typeof RUSH_COVERAGE;
  const coverage = RUSH_COVERAGE[altId] || RUSH_COVERAGE["ALT-A"];
  res.json({
    alternativeId: altId,
    rushOrders:    coverage,
    allOnTime:     coverage.every(o => o.onTime),
    summary:       `All 3 RUSH orders on-time in ${altId} with margins ranging from ${coverage.reduce((min, o) => o.margin < min ? o.margin : min, "3h 25m")} to 3h 25m.`,
    evaluatedAt:   new Date().toISOString(),
  });
});

router.post("/compute-pareto-rank", (_req: Request, res: Response) => {
  res.json({
    alternatives: ALTERNATIVES.map(a => ({
      id: a.id, label: a.label, rank: a.rank,
      compositeScore: a.metrics.compositeScore,
      oee: a.metrics.oee, otif: a.metrics.otif,
      changeovers: a.metrics.changeovers,
    })),
    paretoOptimal:     "ALT-A",
    recommendationRationale: "Alternative A achieves the highest composite score (87.4) by maximising OEE (+11.2pp) through substrate batch clustering while still covering all 3 RUSH orders with comfortable margins. Alternative B achieves +1 more OTIF order but at the cost of 2 additional changeovers and 2.6pp lower OEE. Alternative C is the most conservative option and recommended as a fallback if B-Flute resupply is delayed. Alternative A is the Pareto-optimal recommendation.",
    computedAt:       new Date().toISOString(),
  });
});

export const toolManifest = [
  { name: "run_constraint_solver",  description: "Runs solver across 47 orders/8 machines generating 3 ranked alternatives (OEE-priority, OTIF-priority, balanced).", parameters: { type: "object", properties: {}, required: [] } },
  { name: "evaluate_alternative",   description: "Evaluates a specific alternative (ALT-A/B/C) returning detailed OEE, OTIF, changeover, and substrate metrics.",      parameters: { type: "object", properties: { alternativeId: { type: "string" } }, required: [] } },
  { name: "get_rush_coverage",      description: "Returns RUSH order on-time status for each alternative — all 3 RUSH orders are on-time in all alternatives.",        parameters: { type: "object", properties: { alternativeId: { type: "string" } }, required: [] } },
  { name: "compute_pareto_rank",    description: "Returns Pareto-optimal ranking across all alternatives — identifies Alternative A as the recommendation.",           parameters: { type: "object", properties: {}, required: [] } },
];

export default router;
