import { Router, type Request, type Response } from "express";

const router = Router();

const MACHINES = [
  { id: "M1", type: "Corrugator",     label: "Corrugator Line 1",    availableMin: 480, maintenanceWindow: null,              oeeBaseline: 74, substrates: ["A","B","C"],   crewCert: "crewA" },
  { id: "M2", type: "Corrugator",     label: "Corrugator Line 2",    availableMin: 480, maintenanceWindow: null,              oeeBaseline: 71, substrates: ["A","B","C","E"], crewCert: "both" },
  { id: "M3", type: "Corrugator",     label: "Corrugator Line 3",    availableMin: 390, maintenanceWindow: { start: "10:00", end: "11:30", durationMin: 90, type: "PM", description: "Preventive maintenance — drive belt replacement and lubrication. OSHA 29 CFR 1910.147 lockout/tagout in effect." }, oeeBaseline: 68, substrates: ["B","C"],     crewCert: "crewB" },
  { id: "M4", type: "FlexoPrinter",   label: "Flexo Printer A",      availableMin: 408, maintenanceWindow: null,              oeeBaseline: 72, substrates: ["A","B","C","E"], crewCert: "both", note: "85% capacity — minor drive belt repair (non-maintenance-window restriction, full shift but reduced throughput)" },
  { id: "M5", type: "FlexoPrinter",   label: "Flexo Printer B",      availableMin: 480, maintenanceWindow: null,              oeeBaseline: 75, substrates: ["A","B","C","E"], crewCert: "crewA" },
  { id: "M6", type: "DieCutter",      label: "Die Cutter",           availableMin: 480, maintenanceWindow: null,              oeeBaseline: 69, substrates: ["A","B","C","E"], crewCert: "crewB" },
  { id: "M7", type: "FlexoPrinter",   label: "Flexo Printer C",      availableMin: 480, maintenanceWindow: null,              oeeBaseline: 73, substrates: ["A","C","E"],     crewCert: "crewA" },
  { id: "M8", type: "StitcherGluer",  label: "Stitcher/Gluer",       availableMin: 480, maintenanceWindow: null,              oeeBaseline: 70, substrates: ["A","B","C","E"], crewCert: "both" },
];

const ROLL_STOCK = [
  { flute: "B", label: "B-Flute",  inventoryKg: 18600, safetyStockKg: 30000, inventoryPct: 62, status: "AT_RISK",  depletionRisk: "High — 6 shift orders require B-Flute. Projected depletion by 13:00 if unoptimised. Recommend front-loading B-Flute orders to 07:00–10:45 window.", resupplyETA: "Night Shift (22:00)" },
  { flute: "A", label: "A-Flute",  inventoryKg: 26400, safetyStockKg: 30000, inventoryPct: 88, status: "OK",       depletionRisk: null, resupplyETA: "Not required" },
  { flute: "C", label: "C-Flute",  inventoryKg: 28200, safetyStockKg: 30000, inventoryPct: 94, status: "OK",       depletionRisk: null, resupplyETA: "Not required" },
  { flute: "E", label: "E-Flute",  inventoryKg: 23700, safetyStockKg: 30000, inventoryPct: 79, status: "OK",       depletionRisk: null, resupplyETA: "Not required" },
];

// Changeover matrix (minutes): row = from-substrate, col = to-substrate
const CHANGEOVER_MATRIX = {
  description: "Changeover time in minutes for substrate-type transitions per machine. Multiply by 1.2 for corrugators.",
  matrix: {
    "B→A": 18, "B→C": 14, "B→E": 22,
    "A→B": 18, "A→C": 12, "A→E": 20,
    "C→B": 14, "C→A": 12, "C→E": 16,
    "E→B": 22, "E→A": 20, "E→C": 16,
    "same": 0,
  },
  averageChangeoverMin: 16,
  baselineChangeoverCount: 17,
  optimisedTarget:         14,
};

const CAPACITY_CONSTRAINTS = {
  plant:     "Westfield Packaging",
  shiftDate: "2026-04-15",
  machines: MACHINES.map(m => ({
    id: m.id, type: m.type, availableMin: m.availableMin,
    maintenanceWindow: m.maintenanceWindow, oeeBaseline: m.oeeBaseline,
    substrates: m.substrates, crewCert: m.crewCert,
  })),
  totalAvailableMin: MACHINES.reduce((s, m) => s + m.availableMin, 0),
  substrateConstraints: ROLL_STOCK.map(r => ({ flute: r.flute, inventoryPct: r.inventoryPct, status: r.status })),
  crewConstraints: {
    crewA: { lead: "Tom Halverson", members: ["Marcus Webb", "Janelle Ortiz"], certifiedMachines: ["M1","M4","M5","M7"] },
    crewB: { lead: "Rita Sánchez",  members: ["Derek Lowe",  "Amy Chen"],     certifiedMachines: ["M2","M3","M6","M8"] },
  },
  oeeTargets: { baseline: 71, standard: 75, stretch: 80 },
  rushOrderHardConstraints: [
    { orderId: "WP-2026-04150001", deadline: "13:00", mustStartBy: "10:45", assignedMachine: "M1" },
    { orderId: "WP-2026-04150002", deadline: "14:00", mustStartBy: "12:30", assignedMachine: "M4" },
    { orderId: "WP-2026-04150003", deadline: "12:30", mustStartBy: "10:30", assignedMachine: "M2", note: "Cannot use M3 due to maintenance overlap" },
  ],
};

router.get("/get-machine-availability", (_req: Request, res: Response) => {
  res.json({
    plant:        CAPACITY_CONSTRAINTS.plant,
    shiftDate:    CAPACITY_CONSTRAINTS.shiftDate,
    machines:     MACHINES,
    totalCapacityMin: MACHINES.reduce((s, m) => s + m.availableMin, 0),
    maintenanceSummary: {
      M3: "OFFLINE 10:00–11:30 (90 min PM — drive belt + lubrication)",
      M4: "85% throughput — minor repair, full shift availability",
    },
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/get-roll-stock-inventory", (_req: Request, res: Response) => {
  res.json({
    plant:       CAPACITY_CONSTRAINTS.plant,
    shiftDate:   CAPACITY_CONSTRAINTS.shiftDate,
    rollStock:   ROLL_STOCK,
    criticalSubstrates: ROLL_STOCK.filter(r => r.status !== "OK").map(r => r.flute),
    summary:     "B-Flute at 62% safety stock — AT RISK for Day Shift demand. All other substrates OK.",
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/get-changeover-matrix", (_req: Request, res: Response) => {
  res.json({ plant: CAPACITY_CONSTRAINTS.plant, ...CHANGEOVER_MATRIX, retrievedAt: new Date().toISOString() });
});

router.get("/get-capacity-constraints", (_req: Request, res: Response) => {
  res.json({ ...CAPACITY_CONSTRAINTS, changeoverMatrix: CHANGEOVER_MATRIX, retrievedAt: new Date().toISOString() });
});

router.post("/estimate-oee", (_req: Request, res: Response) => {
  res.json({
    plant:          CAPACITY_CONSTRAINTS.plant,
    shiftDate:      CAPACITY_CONSTRAINTS.shiftDate,
    baselineOee:    71.0,
    estimatedOee:   82.2,
    oeeComponents: {
      availability:  94.5,
      performance:   89.8,
      quality:       97.1,
    },
    keyDrivers: [
      "B-Flute front-loading reduces mid-shift substrate switch (+2.1pp availability)",
      "Changeover reduction 17→14 adds 48 min production time (+3.2pp performance)",
      "RUSH order sequencing eliminates 2 emergency stoppages (+1.8pp quality)",
    ],
    estimatedAt: new Date().toISOString(),
  });
});

export const toolManifest = [
  { name: "get_machine_availability", description: "Returns all 8 machine availability statuses including M3 maintenance window (10:00–11:30) and M4 85% throughput.",                    parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_roll_stock_inventory", description: "Returns roll stock by substrate: B-Flute 62% (AT_RISK), A-Flute 88%, C-Flute 94%, E-Flute 79%.",                                     parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_changeover_matrix",    description: "Returns substrate changeover times (minutes) per machine type — baseline 17 changeovers/shift, target 14.",                            parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_capacity_constraints", description: "Returns composite capacity constraint map including machines, substrates, crew, OEE targets, and RUSH order hard constraints.",         parameters: { type: "object", properties: {}, required: [] } },
  { name: "estimate_oee",             description: "Estimates achievable OEE% from schedule config — returns 82.2% for Alternative A vs. 71.0% baseline.",                               parameters: { type: "object", properties: {}, required: [] } },
];

export default router;
