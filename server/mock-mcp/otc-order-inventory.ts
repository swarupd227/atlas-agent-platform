import { Router, type Request, type Response } from "express";

const router = Router();

const WAREHOUSES = [
  {
    id: "WH-CHI",
    name: "Chicago Distribution Center",
    city: "Chicago",
    state: "IL",
    lat: 41.88,
    lng: -87.63,
    distanceToCustomerMiles: 12,
    estimatedTransitDays: 1,
  },
  {
    id: "WH-ATL",
    name: "Atlanta Fulfillment Hub",
    city: "Atlanta",
    state: "GA",
    lat: 33.75,
    lng: -84.39,
    distanceToCustomerMiles: 716,
    estimatedTransitDays: 3,
  },
  {
    id: "WH-DAL",
    name: "Dallas Regional Center",
    city: "Dallas",
    state: "TX",
    lat: 32.78,
    lng: -96.80,
    distanceToCustomerMiles: 924,
    estimatedTransitDays: 4,
  },
];

const INVENTORY = [
  {
    sku: "TX-7250-A",
    description: "Turbine Assembly X-7250 Series A",
    requested: 8,
    locations: [
      { warehouseId: "WH-CHI", onHand: 8,  available: 8,  reserved: 0, atpDate: "2026-05-02" },
      { warehouseId: "WH-ATL", onHand: 4,  available: 4,  reserved: 0, atpDate: "2026-05-04" },
    ],
    totalAvailable: 12,
    allocationStatus: "SINGLE_SOURCE",
    splitDetail: "Chicago DC has all 8 required units. Atlanta's 4 units are surplus — ERP incorrectly flagged split-ship due to Atlanta stock visibility. Single-source from Chicago confirmed.",
  },
  {
    sku: "TX-7250-B",
    description: "Turbine Assembly X-7250 Series B",
    requested: 4,
    locations: [
      { warehouseId: "WH-CHI", onHand: 6,  available: 4,  reserved: 2, atpDate: "2026-05-02" },
      { warehouseId: "WH-ATL", onHand: 3,  available: 3,  reserved: 0, atpDate: "2026-05-04" },
    ],
    totalAvailable: 7,
    allocationStatus: "SINGLE_SOURCE",
    splitDetail: "4 of 6 units available at Chicago (2 reserved for prior order). Fulfilled from Chicago.",
  },
  {
    sku: "TX-7300-HD",
    description: "Turbine Assembly X-7300 Heavy Duty",
    requested: 1,
    locations: [
      { warehouseId: "WH-CHI", onHand: 2,  available: 2,  reserved: 0, atpDate: "2026-05-02" },
    ],
    totalAvailable: 2,
    allocationStatus: "SINGLE_SOURCE",
    splitDetail: null,
  },
  {
    sku: "CE-CX450-ENH",
    description: "CX-450 Enhanced Process Controller",
    requested: 2,
    locations: [
      { warehouseId: "WH-CHI", onHand: 3,  available: 3,  reserved: 0, atpDate: "2026-05-02" },
    ],
    totalAvailable: 3,
    allocationStatus: "SINGLE_SOURCE",
    splitDetail: null,
  },
];

const FULFILLMENT_OPTIONS = [
  {
    id: "OPT-A",
    label: "Priority Split-Ship from Chicago DC",
    recommended: true,
    warehouses: ["WH-CHI"],
    coverage: "12/12 turbine units from Chicago DC (2 waves)",
    wave1: { units: 6, shipDate: "2026-05-02", deliveryDate: "2026-05-02" },
    wave2: { units: 6, shipDate: "2026-05-03", deliveryDate: "2026-05-03" },
    deliveryDate: "2026-05-02 / 2026-05-03",
    shippingCost: 1_840,
    costLabel: "$1,840 priority ground (split waves)",
    transitDays: 2,
    carbonFootprintKg: 124,
    csatPrediction: 0.87,
    notes: "Two ground shipments from Chicago DC. All 12 units available; 6 units ship May 2, 6 units May 3. Meets RUSH deadline. Customer preference: 87% split-ship acceptance rate.",
    checkId: "VAL-003",
    newStatus: "PASS",
  },
  {
    id: "OPT-B",
    label: "Consolidated Single Shipment — Chicago DC",
    recommended: false,
    warehouses: ["WH-CHI"],
    coverage: "12/12 turbine units from Chicago DC (1 wave)",
    wave1: null,
    wave2: null,
    deliveryDate: "2026-05-05",
    shippingCost: 2_120,
    costLabel: "$2,120 standard consolidation",
    transitDays: 4,
    carbonFootprintKg: 98,
    csatPrediction: 0.74,
    notes: "Single consolidated shipment after all 12 units staged. Lower carbon footprint but 3-day later delivery vs Option A. Misses RUSH delivery window by 2 days.",
    checkId: "VAL-003",
    newStatus: "WARN",
  },
  {
    id: "OPT-C",
    label: "Air Express — Next Day Delivery",
    recommended: false,
    warehouses: ["WH-CHI"],
    coverage: "12/12 turbine units via air freight",
    wave1: null,
    wave2: null,
    deliveryDate: "2026-05-01",
    shippingCost: 3_400,
    costLabel: "$3,400 air express",
    transitDays: 1,
    carbonFootprintKg: 412,
    csatPrediction: 0.91,
    notes: "Next-day air from Chicago O'Hare. Earliest possible delivery. $1,560 premium vs Option A. 3.3× carbon footprint vs Option A. Recommended only if customer requires May 1 delivery.",
    checkId: "VAL-003",
    newStatus: "WARN",
  },
];

// ── Spec tool name routes ────────────────────────────────────────────────────

router.get("/get-inventory-by-location", (_req: Request, res: Response) => {
  const allAvailable = INVENTORY.every(i => i.totalAvailable >= i.requested);
  const splitShipItems = INVENTORY.filter(i => i.allocationStatus === "SPLIT_SHIP");
  const erpFlaggedSplitShip = ["TX-7250-A"]; // ERP incorrectly flagged due to Atlanta stock visibility
  res.json({
    orderId: "ORD-2026-78432",
    items: INVENTORY,
    warehouses: WAREHOUSES,
    allAvailable,
    splitShipRequired: false, // Chicago covers all units — split-ship unnecessary
    erpFlaggedSplitShip,
    erpFlagNote: "ERP system flagged TX-7250-A for split-ship due to Atlanta stock. Agent analysis confirms Chicago holds all 8 required units — Atlanta is surplus.",
    splitShipItems: splitShipItems.map(i => i.sku),
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/calculate-atp", (_req: Request, res: Response) => {
  res.json({
    orderId: "ORD-2026-78432",
    atpDate: "2026-05-02",
    atpWarehouse: "WH-CHI",
    allSkusAvailable: true,
    items: INVENTORY.map(i => ({
      sku: i.sku,
      requested: i.requested,
      available: i.locations.find(l => l.warehouseId === "WH-CHI")?.available ?? 0,
      atpDate: i.locations.find(l => l.warehouseId === "WH-CHI")?.atpDate ?? "2026-05-02",
    })),
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/get-shipping-options", (_req: Request, res: Response) => {
  res.json({
    orderId: "ORD-2026-78432",
    options: FULFILLMENT_OPTIONS,
    recommendedOptionId: "OPT-A",
    customerPreference: "split_ship_accepted",
    customerSplitShipAcceptanceRate: 0.87,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/reserve-inventory", (_req: Request, res: Response) => {
  res.json({
    orderId: "ORD-2026-78432",
    reservationConfirmed: true,
    selectedOption: "OPT-A",
    warehouse: "WH-CHI",
    warehouseName: "Chicago Distribution Center",
    allocatedUnits: {
      "TX-7250-A": { qty: 8,  warehouse: "WH-CHI", pickTicket: "PT-CHI-7842-A" },
      "TX-7250-B": { qty: 4,  warehouse: "WH-CHI", pickTicket: "PT-CHI-7842-B" },
      "TX-7300-HD":{ qty: 1,  warehouse: "WH-CHI", pickTicket: "PT-CHI-7842-C" },
    },
    estimatedPickDate: "2026-05-01",
    estimatedShipWave1: "2026-05-02",
    estimatedShipWave2: "2026-05-03",
    deliveryPromise: "May 2–3 2026",
    shippingCost: 1_840,
    carbonFootprintKg: 124,
    csatPrediction: 0.87,
    checkId: "VAL-003",
    newStatus: "PASS",
    confirmedAt: new Date().toISOString(),
  });
});

// ── Legacy route aliases (kept for backward compat) ─────────────────────────

router.get("/availability", (_req: Request, res: Response) => {
  const allAvailable = INVENTORY.every(i => i.totalAvailable >= i.requested);
  const splitShipItems = INVENTORY.filter(i => i.allocationStatus === "SPLIT_SHIP");
  res.json({
    orderId: "ORD-2026-78432",
    items: INVENTORY,
    warehouses: WAREHOUSES,
    allAvailable,
    splitShipRequired: false,
    splitShipItems: splitShipItems.map(i => i.sku),
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/warehouses", (_req: Request, res: Response) => {
  res.json({ warehouses: WAREHOUSES, count: WAREHOUSES.length });
});

router.get("/fulfillment-options", (_req: Request, res: Response) => {
  res.json({
    orderId: "ORD-2026-78432",
    options: FULFILLMENT_OPTIONS,
    recommendedOptionId: "OPT-A",
    customerPreference: "split_ship_accepted",
    customerSplitShipAcceptanceRate: 0.87,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/confirm-allocation", (_req: Request, res: Response) => {
  res.json({
    orderId: "ORD-2026-78432",
    allocationConfirmed: true,
    selectedOption: "OPT-A",
    warehouse: "WH-CHI",
    warehouseName: "Chicago Distribution Center",
    allocatedUnits: {
      "TX-7250-A": { qty: 8,  warehouse: "WH-CHI", pickTicket: "PT-CHI-7842-A" },
      "TX-7250-B": { qty: 4,  warehouse: "WH-CHI", pickTicket: "PT-CHI-7842-B" },
      "TX-7300-HD":{ qty: 1,  warehouse: "WH-CHI", pickTicket: "PT-CHI-7842-C" },
    },
    estimatedPickDate: "2026-05-01",
    estimatedShipDate: "2026-05-02",
    estimatedDeliveryDate: "2026-05-02",
    splitShipAvoided: false,
    shippingCost: 1_840,
    checkId: "VAL-003",
    newStatus: "PASS",
    confirmedAt: new Date().toISOString(),
  });
});

export const toolManifest = [
  {
    name: "get_inventory_by_location",
    description: "Returns SKU-level inventory for ORD-2026-78432. Chicago DC: TX-7250-A ×8, TX-7250-B ×4 avail (6 on-hand), TX-7300-HD ×1, CE-CX450-ENH ×2 avail. Atlanta: TX-7250-A ×4 surplus (not needed). ERP split-ship flag for TX-7250-A is a false positive — Chicago fully covers all 12 turbine units.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "calculate_atp",
    description: "Computes Available-To-Promise date for all 13 units on ORD-2026-78432 from Chicago DC. Returns per-SKU ATP dates and confirms all inventory available by 2026-05-02.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_shipping_options",
    description: "Returns three evaluated fulfillment options: Option A (split-ship $1,840 / 2-day), Option B (consolidated $2,120 / 4-day), Option C (air express $3,400 / 1-day). Each with carbon footprint and CSAT prediction.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "reserve_inventory",
    description: "Reserves all units on ORD-2026-78432 from Chicago DC under Option A. Issues deterministic pick tickets, sets delivery promise May 2–3 2026, clears VAL-003 hold.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_inventory_availability",
    description: "Legacy alias for get_inventory_by_location. Returns all warehouse inventory for ORD-2026-78432.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_warehouses",
    description: "Returns warehouse master data including location, distance to Meridian's Detroit plant, and estimated transit days.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_fulfillment_options",
    description: "Legacy alias for get_shipping_options. Returns three evaluated fulfillment options for ORD-2026-78432.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "confirm_inventory_allocation",
    description: "Legacy alias for reserve_inventory. Confirms allocation of all 13 units from Chicago DC under Option A with deterministic pick tickets.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export default router;
