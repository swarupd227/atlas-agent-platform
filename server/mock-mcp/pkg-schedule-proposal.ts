import { Router, type Request, type Response } from "express";

const router = Router();

// Full Gantt for Alternative A (winning schedule)
const GANTT_PROPOSAL = {
  alternativeId: "ALT-A",
  plant:         "Westfield Packaging",
  shiftDate:     "2026-04-15",
  shiftLabel:    "Day Shift 07:00–15:00",
  machines: [
    {
      id: "M1", label: "Corrugator Line 1",
      slots: [
        { start: "07:00", end: "09:35", orderId: "WP-2026-04150001", customer: "FreshFarm Co",      product: "Corrugated RSC",   flute: "B", qty: 12000, type: "RUSH",     highlight: "rush" },
        { start: "09:35", end: "09:55", orderId: null,                customer: null,                 product: "CHANGEOVER",       flute: "B→C", qty: 0,  type: "CHANGEOVER", highlight: "changeover" },
        { start: "09:55", end: "12:00", orderId: "WP-2026-04150008", customer: "MegaStore Corp",     product: "Master Shipper",   flute: "C", qty: 7500, type: "STANDARD", highlight: "standard" },
        { start: "12:00", end: "15:00", orderId: "WP-2026-04150004", customer: "Apex Logistics",    product: "Master Shipper",   flute: "C", qty: 5000, type: "STANDARD", highlight: "standard" },
      ],
    },
    {
      id: "M2", label: "Corrugator Line 2",
      slots: [
        { start: "07:30", end: "09:30", orderId: "WP-2026-04150003", customer: "GreenLeaf Produce", product: "Produce Shipper",  flute: "B", qty: 6000,  type: "RUSH",     highlight: "rush" },
        { start: "09:30", end: "09:44", orderId: null,               customer: null,                 product: "CHANGEOVER",       flute: "B→A", qty: 0,  type: "CHANGEOVER", highlight: "changeover" },
        { start: "09:44", end: "12:30", orderId: "WP-2026-04150010", customer: "Coastal Brands",    product: "Corrugated RSC",   flute: "A", qty: 8000,  type: "STANDARD", highlight: "standard" },
        { start: "12:30", end: "15:00", orderId: "WP-2026-04150006", customer: "TechShip Inc",      product: "Custom Die-Cut",   flute: "A", qty: 3000,  type: "STANDARD", highlight: "standard" },
      ],
    },
    {
      id: "M3", label: "Corrugator Line 3",
      slots: [
        { start: "07:00", end: "09:45", orderId: "WP-2026-04150009", customer: "OrchardFresh",      product: "Produce Shipper",  flute: "B", qty: 4000,  type: "STANDARD", highlight: "standard" },
        { start: "09:45", end: "10:00", orderId: null,               customer: null,                 product: "BUFFER",           flute: null, qty: 0,    type: "BUFFER",   highlight: "buffer" },
        { start: "10:00", end: "11:30", orderId: null,               customer: null,                 product: "MAINTENANCE",      flute: null, qty: 0,    type: "MAINTENANCE", highlight: "maintenance" },
        { start: "11:30", end: "15:00", orderId: "WP-2026-04150005", customer: "NutriPack LLC",     product: "Corrugated RSC",   flute: "B", qty: 9500,  type: "STANDARD", highlight: "standard" },
      ],
    },
    {
      id: "M4", label: "Flexo Printer A",
      slots: [
        { start: "09:00", end: "11:12", orderId: "WP-2026-04150002", customer: "RetailEdge",         product: "Display Tray",     flute: "E", qty: 8500,  type: "RUSH",     highlight: "rush", note: "85% throughput — minor drive belt repair" },
        { start: "11:12", end: "11:28", orderId: null,               customer: null,                 product: "CHANGEOVER",       flute: "E→B", qty: 0,  type: "CHANGEOVER", highlight: "changeover" },
        { start: "11:28", end: "15:00", orderId: "WP-2026-04150007", customer: "FoodMart Chain",    product: "Display Tray",     flute: "E", qty: 6000,  type: "STANDARD", highlight: "standard" },
      ],
    },
    {
      id: "M5", label: "Flexo Printer B",
      slots: [
        { start: "07:00", end: "15:00", orderId: "BATCH-M5",         customer: "Mixed Standard",    product: "Multi-Order Batch",flute: "C", qty: 22000, type: "STANDARD", highlight: "standard" },
      ],
    },
    {
      id: "M6", label: "Die Cutter",
      slots: [
        { start: "07:00", end: "15:00", orderId: "BATCH-M6",         customer: "Mixed Standard",    product: "Multi-Order Batch",flute: "A", qty: 18000, type: "STANDARD", highlight: "standard" },
      ],
    },
    {
      id: "M7", label: "Flexo Printer C",
      slots: [
        { start: "07:00", end: "15:00", orderId: "BATCH-M7",         customer: "Mixed Standard",    product: "Multi-Order Batch",flute: "C", qty: 20000, type: "STANDARD", highlight: "standard" },
      ],
    },
    {
      id: "M8", label: "Stitcher/Gluer",
      slots: [
        { start: "07:00", end: "15:00", orderId: "BATCH-M8",         customer: "Mixed Standard",    product: "Multi-Order Batch",flute: "A", qty: 15000, type: "STANDARD", highlight: "standard" },
      ],
    },
  ],
  summary: {
    ordersScheduled:  45,
    ordersDeferred:   2,
    deferredOrders:   ["WP-2026-04150041", "WP-2026-04150047"],
    deferredReason:   "Insufficient B-Flute inventory for end-of-shift scheduling; rescheduled to Night Shift resupply.",
    rushCovered:      3,
    rushTotal:        3,
    changeoverCount:  14,
    projectedOee:     82.2,
    projectedOtif:    93.6,
  },
};

const KPI_PROJECTIONS = {
  alternativeId:  "ALT-A",
  plant:          "Westfield Packaging",
  shiftDate:      "2026-04-15",
  baseline: {
    oee:              71.0,
    otifOrders:       40,
    otifPct:          85.1,
    changeoverCount:  17,
    substrateWastePct: 9.2,
  },
  projected: {
    oee:              82.2,
    otifOrders:       44,
    otifPct:          93.6,
    changeoverCount:  14,
    substrateWastePct: 8.5,
  },
  deltas: {
    oeeDelta:         +11.2,
    otifOrdersDelta:  +4,
    otifPctDelta:     +8.5,
    changeoverDelta:  -3,
    substrateWasteDelta: -0.7,
  },
  annualisedImpact: {
    revenueGainUSD:     214000,
    changeoverSavingsUSD: 28000,
    otifImprovementPp:    8.5,
    annualOtifTarget:    95.0,
    currentAnnualOtif:   86.4,
    projectedAnnualOtif: 88.1,
  },
  computedAt: new Date().toISOString(),
};

const APPROVAL_RECORD = {
  approvalId:      "APR-2026-04-15-001",
  alternativeId:   "ALT-A",
  plant:           "Westfield Packaging",
  shiftDate:       "2026-04-15",
  status:          "PENDING",
  submittedBy:     "Atlas PKG-004",
  submittedAt:     new Date().toISOString(),
  approver:        "Sarah Kowalski",
  approverTitle:   "Day Shift Plant Planner",
  approvalSlaMin:  15,
  approvalDeadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  notificationSent: true,
  notificationChannel: "Kiwiplan Plant Planner Dashboard",
};

const KIWIPLAN_COMMIT = {
  kiwiplanScheduleId: "KWP-SCHED-2026-0415-D",
  alternativeId:      "ALT-A",
  plant:              "Westfield Packaging",
  shiftDate:          "2026-04-15",
  shiftLabel:         "Day Shift 07:00–15:00",
  committedBy:        "Atlas PKG-004 (post-planner approval APR-2026-04-15-001)",
  committedAt:        new Date().toISOString(),
  status:             "COMMITTED",
  machinesActivated:  8,
  operatorNotifications: [
    "M1 Operator: Tom Halverson — RUSH WP-0001 starts 07:00",
    "M2 Operator: Derek Lowe — RUSH WP-0003 starts 07:30",
    "M3 Operator: Rita Sánchez — maintenance LOCKED 10:00–11:30",
    "M4 Operator: Marcus Webb — RUSH WP-0002 starts 09:00 (85% throughput)",
  ],
  kiwiplanBoardUpdated: true,
  previousScheduleArchived: true,
  rollbackWindowMin: 30,
};

router.post("/format-gantt-proposal", (_req: Request, res: Response) => {
  res.json({ ...GANTT_PROPOSAL, formattedAt: new Date().toISOString() });
});

router.post("/compute-kpi-projections", (_req: Request, res: Response) => {
  res.json({ ...KPI_PROJECTIONS, computedAt: new Date().toISOString() });
});

router.post("/publish-for-approval", (_req: Request, res: Response) => {
  res.json({ ...APPROVAL_RECORD, submittedAt: new Date().toISOString() });
});

router.post("/commit-to-kiwiplan", (_req: Request, res: Response) => {
  res.json({ ...KIWIPLAN_COMMIT, committedAt: new Date().toISOString() });
});

export const toolManifest = [
  { name: "format_gantt_proposal",   description: "Formats ALT-A as a per-machine Gantt table with time slots, RUSH highlights, changeover blocks, and maintenance windows.",             parameters: { type: "object", properties: {}, required: [] } },
  { name: "compute_kpi_projections", description: "Computes shift KPI projections: OEE +11.2pp, OTIF +4 orders, changeovers -3, substrate waste -8%. Includes annualised impact.",       parameters: { type: "object", properties: {}, required: [] } },
  { name: "publish_for_approval",    description: "Publishes schedule to plant planner approval queue (Sarah Kowalski, 15-min SLA). Returns approval ticket APR-2026-04-15-001.",         parameters: { type: "object", properties: {}, required: [] } },
  { name: "commit_to_kiwiplan",      description: "Commits approved schedule to Kiwiplan — returns Schedule ID KWP-SCHED-2026-0415-D and confirms operator notifications sent.",          parameters: { type: "object", properties: {}, required: [] } },
];

export default router;
