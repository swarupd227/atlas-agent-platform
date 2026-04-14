import { Router, type Request, type Response } from "express";

const router = Router();

const SHIFT_CONTEXT = {
  plant:          "Westfield Packaging",
  shiftDate:      "2026-04-15",
  shiftLabel:     "Day Shift",
  shiftStart:     "07:00",
  shiftEnd:       "15:00",
  shiftDurationMin: 480,
  crewA:          ["Tom Halverson (Lead)", "Marcus Webb", "Janelle Ortiz"],
  crewB:          ["Rita Sánchez (Lead)", "Derek Lowe", "Amy Chen"],
  machineCount:   8,
  orderCount:     47,
  productMix: {
    corrugatedRSC:   18,
    displayTray:      9,
    produceBox:      12,
    masterShipper:    8,
  },
};

// 47 orders — 3 RUSH + 44 standard
const ORDER_QUEUE = [
  // ── RUSH ORDERS ──────────────────────────────────────────────────────────
  { orderId: "WP-2026-04150001", customer: "FreshFarm Co",      product: "Corrugated RSC Box",     flute: "B",  grade: "SW",  qty: 12000, runtimeMin:  95, deadline: "13:00", priority: "RUSH",     riskScore: 91, deliveryRisk: "HIGH",   machine: "M1" },
  { orderId: "WP-2026-04150002", customer: "RetailEdge",        product: "Display Tray",            flute: "E",  grade: "SW",  qty:  8500, runtimeMin:  72, deadline: "14:00", priority: "RUSH",     riskScore: 84, deliveryRisk: "HIGH",   machine: "M4" },
  { orderId: "WP-2026-04150003", customer: "GreenLeaf Produce", product: "Produce Shipper Box",     flute: "B",  grade: "DW",  qty:  6000, runtimeMin:  60, deadline: "12:30", priority: "RUSH",     riskScore: 88, deliveryRisk: "HIGH",   machine: "M2" },
  // ── STANDARD ORDERS (sample, abridged) ────────────────────────────────────
  { orderId: "WP-2026-04150004", customer: "Apex Logistics",    product: "Master Shipper Case",     flute: "C",  grade: "DW",  qty: 5000, runtimeMin:  55, deadline: "15:00", priority: "STANDARD", riskScore: 42, deliveryRisk: "LOW",    machine: "M1" },
  { orderId: "WP-2026-04150005", customer: "NutriPack LLC",     product: "Corrugated RSC Box",      flute: "B",  grade: "SW",  qty: 9500, runtimeMin:  80, deadline: "15:00", priority: "STANDARD", riskScore: 61, deliveryRisk: "MEDIUM", machine: "M2" },
  { orderId: "WP-2026-04150006", customer: "TechShip Inc",      product: "Custom Die-Cut Box",      flute: "A",  grade: "SW",  qty: 3000, runtimeMin:  45, deadline: "15:00", priority: "STANDARD", riskScore: 28, deliveryRisk: "LOW",    machine: "M6" },
  { orderId: "WP-2026-04150007", customer: "FoodMart Chain",    product: "Display Tray",            flute: "E",  grade: "SW",  qty: 6000, runtimeMin:  50, deadline: "15:00", priority: "STANDARD", riskScore: 35, deliveryRisk: "LOW",    machine: "M4" },
  { orderId: "WP-2026-04150008", customer: "MegaStore Corp",    product: "Master Shipper Case",     flute: "C",  grade: "DW",  qty: 7500, runtimeMin:  65, deadline: "15:00", priority: "STANDARD", riskScore: 39, deliveryRisk: "LOW",    machine: "M1" },
  { orderId: "WP-2026-04150009", customer: "OrchardFresh",      product: "Produce Shipper Box",     flute: "B",  grade: "SW",  qty: 4000, runtimeMin:  40, deadline: "15:00", priority: "STANDARD", riskScore: 55, deliveryRisk: "MEDIUM", machine: "M3" },
  { orderId: "WP-2026-04150010", customer: "Coastal Brands",    product: "Corrugated RSC Box",      flute: "A",  grade: "SW",  qty: 8000, runtimeMin:  70, deadline: "15:00", priority: "STANDARD", riskScore: 22, deliveryRisk: "LOW",    machine: "M2" },
  // Additional 37 orders represented as summary for brevity
  ...Array.from({ length: 37 }, (_, i) => ({
    orderId: `WP-2026-04150${(11 + i).toString().padStart(3, "0")}`,
    customer: `Customer-${11 + i}`,
    product:  ["Corrugated RSC Box", "Display Tray", "Produce Shipper Box", "Master Shipper Case"][i % 4],
    flute:    ["B", "A", "C", "E"][i % 4] as string,
    grade:    i % 3 === 0 ? "DW" : "SW",
    qty:      3000 + (i * 500),
    runtimeMin: 30 + (i * 3),
    deadline: "15:00",
    priority: "STANDARD" as const,
    riskScore: 10 + (i * 2),
    deliveryRisk: i % 7 === 0 ? "MEDIUM" : "LOW",
    machine: `M${(i % 8) + 1}`,
  })),
];

const RUSH_ORDERS = ORDER_QUEUE.filter(o => o.priority === "RUSH");

// Delivery risk scoring
router.get("/get-order-queue", (_req: Request, res: Response) => {
  res.json({
    plant:       SHIFT_CONTEXT.plant,
    shiftDate:   SHIFT_CONTEXT.shiftDate,
    shiftLabel:  SHIFT_CONTEXT.shiftLabel,
    shiftStart:  SHIFT_CONTEXT.shiftStart,
    shiftEnd:    SHIFT_CONTEXT.shiftEnd,
    orderCount:  ORDER_QUEUE.length,
    rushCount:   RUSH_ORDERS.length,
    orders:      ORDER_QUEUE,
    productMix:  SHIFT_CONTEXT.productMix,
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/get-rush-orders", (_req: Request, res: Response) => {
  res.json({
    plant:      SHIFT_CONTEXT.plant,
    shiftDate:  SHIFT_CONTEXT.shiftDate,
    rushOrders: RUSH_ORDERS.map(o => ({
      ...o,
      hoursToDeadline:  parseFloat(((parseInt(o.deadline) - 7) * 60 / 60).toFixed(1)),
      atRisk:           true,
      riskJustification: o.orderId === "WP-2026-04150001"
        ? "B-Flute demand from 5 other orders risks inventory depletion before this order's scheduled start. Priority front-loading required."
        : o.orderId === "WP-2026-04150003"
        ? "Earliest deadline (12:30). M3 corrugator maintenance (10:00–11:30) overlaps the latest possible start window. Must complete on M1 or M2 before 10:00."
        : "M4 (Flexo Printer) operating at 85% capacity. Current queue depth of 3 orders before this one creates delivery risk.",
    })),
    totalRushCount: RUSH_ORDERS.length,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/score-delivery-risk", (_req: Request, res: Response) => {
  res.json({
    scoredOrders: ORDER_QUEUE.map(o => ({
      orderId:      o.orderId,
      customer:     o.customer,
      riskScore:    o.riskScore,
      deliveryRisk: o.deliveryRisk,
      priority:     o.priority,
    })),
    riskSummary: {
      high:   ORDER_QUEUE.filter(o => o.deliveryRisk === "HIGH").length,
      medium: ORDER_QUEUE.filter(o => o.deliveryRisk === "MEDIUM").length,
      low:    ORDER_QUEUE.filter(o => o.deliveryRisk === "LOW").length,
    },
    scoredAt: new Date().toISOString(),
  });
});

router.post("/validate-substrate-specs", (_req: Request, res: Response) => {
  const substrateStatus = [
    { flute: "B", ordersRequiring: 6,  totalQty: 39500, inventoryPct: 62, status: "AT_RISK",  riskNote: "6 orders require B-Flute. Inventory at 62% safety stock. Projected depletion by 13:00. Recommend front-loading B-Flute orders to 07:00–10:45 window." },
    { flute: "A", ordersRequiring: 8,  totalQty: 32000, inventoryPct: 88, status: "OK",       riskNote: null },
    { flute: "C", ordersRequiring: 11, totalQty: 51500, inventoryPct: 94, status: "OK",       riskNote: null },
    { flute: "E", ordersRequiring: 7,  totalQty: 28000, inventoryPct: 79, status: "OK",       riskNote: null },
  ];
  res.json({
    plant:           SHIFT_CONTEXT.plant,
    shiftDate:       SHIFT_CONTEXT.shiftDate,
    substrateStatus,
    criticalSubstrates: substrateStatus.filter(s => s.status !== "OK").map(s => s.flute),
    validatedAt:     new Date().toISOString(),
  });
});

router.get("/get-shift-context", (_req: Request, res: Response) => {
  res.json({ ...SHIFT_CONTEXT, retrievedAt: new Date().toISOString() });
});

export const toolManifest = [
  { name: "get_order_queue",          description: "Returns full 47-order Day Shift queue with priority flags, substrate specs, runtime, and delivery deadlines.",                                         parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_rush_orders",          description: "Returns the 3 RUSH orders at delivery risk with risk justification and time-to-deadline.",                                                           parameters: { type: "object", properties: {}, required: [] } },
  { name: "score_delivery_risk",      description: "Computes per-order delivery risk scores (0–100) for all 47 orders.",                                                                                 parameters: { type: "object", properties: {}, required: [] } },
  { name: "validate_substrate_specs", description: "Validates substrate requirements against roll stock — flags B-Flute at 62% as AT_RISK.",                                                             parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_shift_context",        description: "Returns shift metadata: plant, shift label, crew assignments, machine count, and order mix.",                                                        parameters: { type: "object", properties: {}, required: [] } },
];

export default router;
