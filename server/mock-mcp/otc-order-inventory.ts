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
      { warehouseId: "WH-CHI", onHand: 8,  available: 8,  reserved: 0, atpDate: "2026-04-21" },
      { warehouseId: "WH-ATL", onHand: 4,  available: 4,  reserved: 0, atpDate: "2026-04-24" },
    ],
    totalAvailable: 12,
    allocationStatus: "SPLIT_SHIP",
    splitDetail: "8 units from Chicago DC (1-day transit), 4 units surplus in Atlanta (3-day transit). Chicago fully covers this order.",
  },
  {
    sku: "TX-7250-B",
    description: "Turbine Assembly X-7250 Series B",
    requested: 4,
    locations: [
      { warehouseId: "WH-CHI", onHand: 6,  available: 4,  reserved: 2, atpDate: "2026-04-21" },
      { warehouseId: "WH-ATL", onHand: 3,  available: 3,  reserved: 0, atpDate: "2026-04-24" },
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
      { warehouseId: "WH-CHI", onHand: 2,  available: 2,  reserved: 0, atpDate: "2026-04-21" },
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
      { warehouseId: "WH-CHI", onHand: 3,  available: 3,  reserved: 0, atpDate: "2026-04-21" },
    ],
    totalAvailable: 3,
    allocationStatus: "SINGLE_SOURCE",
    splitDetail: null,
  },
];

const FULFILLMENT_OPTIONS = [
  {
    id: "OPT-A",
    label: "Single-Warehouse Fulfillment — Chicago Only",
    recommended: true,
    warehouses: ["WH-CHI"],
    coverage: "12/12 turbine units from Chicago DC",
    shipDate: "2026-04-21",
    deliveryDate: "2026-04-22",
    cost: 0,
    costLabel: "No split-ship surcharge",
    transitDays: 1,
    notes: "Chicago has all 12 turbine units available. All other SKUs (controller, filtration, electronics) also fully stocked at Chicago. Single pick ticket, single delivery.",
    checkId: "VAL-003",
    newStatus: "PASS",
  },
  {
    id: "OPT-B",
    label: "Split Shipment — Chicago + Atlanta",
    recommended: false,
    warehouses: ["WH-CHI", "WH-ATL"],
    coverage: "8 units Chicago + 4 units Atlanta",
    shipDate: "2026-04-21",
    deliveryDate: "2026-04-24",
    cost: 840,
    costLabel: "$840 split-ship surcharge",
    transitDays: 3,
    notes: "Only applicable if Atlanta allocation is needed. Chicago fully covers this order — split unnecessary.",
    checkId: "VAL-003",
    newStatus: "PASS",
  },
];

router.get("/availability", (_req: Request, res: Response) => {
  const allAvailable = INVENTORY.every(i => i.totalAvailable >= i.requested);
  const splitShipItems = INVENTORY.filter(i => i.allocationStatus === "SPLIT_SHIP");
  res.json({
    orderId: "ORD-2026-78432",
    items: INVENTORY,
    warehouses: WAREHOUSES,
    allAvailable,
    splitShipRequired: splitShipItems.length > 0,
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
    customerPreference: "earliest_delivery",
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
      "TX-7250-A": { qty: 8,  warehouse: "WH-CHI", pickTicket: "PT-CHI-" + Math.floor(Math.random() * 9000 + 1000) },
      "TX-7250-B": { qty: 4,  warehouse: "WH-CHI", pickTicket: "PT-CHI-" + Math.floor(Math.random() * 9000 + 1000) },
      "TX-7300-HD":{ qty: 1,  warehouse: "WH-CHI", pickTicket: "PT-CHI-" + Math.floor(Math.random() * 9000 + 1000) },
    },
    estimatedPickDate: "2026-04-21",
    estimatedShipDate: "2026-04-21",
    estimatedDeliveryDate: "2026-04-22",
    splitShipAvoided: true,
    savingsVsSplit: 840,
    checkId: "VAL-003",
    newStatus: "PASS",
    confirmedAt: new Date().toISOString(),
  });
});

export const toolManifest = [
  {
    name: "get_inventory_availability",
    description: "Returns SKU-level inventory availability across all warehouse locations for ORD-2026-78432. Shows on-hand, available, reserved quantities and ATP dates at Chicago DC and Atlanta Hub.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_warehouses",
    description: "Returns warehouse master data including location, distance to Meridian's Chicago plant, and estimated transit days.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_fulfillment_options",
    description: "Returns evaluated fulfillment options for ORD-2026-78432: Option A (Chicago-only, no surcharge, 1-day transit) and Option B (split Chicago+Atlanta, $840 surcharge, 3-day transit).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "confirm_inventory_allocation",
    description: "Confirms allocation of all 12 turbine units from Chicago DC (OPT-A — single warehouse, no split-ship surcharge). Issues pick tickets and clears VAL-003 hold.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export default router;
