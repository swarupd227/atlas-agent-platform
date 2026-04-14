import { Router, type Request, type Response } from "express";

const router = Router();

const ORDER = {
  orderId: "ORD-2026-78432",
  quoteRef: "Q-78432",
  customer: "Meridian Manufacturing",
  customerId: "CUST-00892",
  orderDate: "2026-04-14",
  requestedShipDate: "2026-05-02",
  orderType: "RUSH",
  poNumber: "MER-PO-9921",
  totalValue: 429_711,
  currency: "USD",
  lineCount: 48,
  lines: [
    { lineNo: 1, sku: "TX-7250-A", description: "Turbine Assembly X-7250 Series A", qty: 8,  unitPrice: 16_343, extPrice: 130_744 },
    { lineNo: 2, sku: "TX-7250-B", description: "Turbine Assembly X-7250 Series B", qty: 4,  unitPrice: 18_706, extPrice:  74_824 },
    { lineNo: 3, sku: "TX-7300-HD","description": "Turbine Assembly X-7300 HD",      qty: 1,  unitPrice: 34_049, extPrice:  34_049 },
    { lineNo: 4, sku: "FK-S200-STD","description":"Series K-200 Filtration Unit",    qty: 4,  unitPrice:  5_116, extPrice:  20_464 },
    { lineNo: 5, sku: "FK-S300-PRO","description":"Series K-300 Pro Filtration",     qty: 2,  unitPrice:  7_409, extPrice:  14_818 },
    { lineNo: 6, sku: "FK-PUMP-BT", "description":"Booster Pump Assembly",           qty: 4,  unitPrice:  3_616, extPrice:  14_464 },
    { lineNo: 7, sku: "CE-CX450-ENH","description":"CX-450 Enhanced Controller",     qty: 2,  unitPrice: 13_946, extPrice:  27_892 },
    { lineNo: 8, sku: "CE-PLC-SAFE","description":"PLC Safety Controller",           qty: 2,  unitPrice: 10_948, extPrice:  21_896 },
    { lineNo: 9, sku: "CE-HMI-10T", "description":"10-inch HMI Touchscreen Panel",  qty: 2,  unitPrice:  6_709, extPrice:  13_418 },
    { lineNo: 10,"sku":"TX-SEAL-KIT","description":"High-Pressure Seal Kit",         qty: 8,  unitPrice:  1_633, extPrice:  13_064 },
    { lineNo: 11,"sku":"TX-LUB-SYS", "description":"Lubrication System Module",     qty: 4,  unitPrice:  7_853, extPrice:  31_412 },
    { lineNo: 12,"sku":"FK-ACS-SPR", "description":"Filter Cartridge Spare Set",    qty: 4,  unitPrice:    838, extPrice:   3_352 },
  ],
  shipTo: {
    company: "Meridian Manufacturing — Detroit Plant",
    address1: "2847 Industrial Parkway",
    address2: "",
    city: "Detroit",
    state: "MI",
    zip: "48210",
    country: "US",
    attention: "J. Davis, Plant Manager",
  },
  shipToIssue: {
    type: "ADDRESS_MISMATCH",
    severity: "WARNING",
    detail: "Ship-to record CUST-00892-SHIP-04 has 'Suite 110' appended in ERP master (2847 Industrial Parkway Suite 110) but PO MER-PO-9921 specifies no suite. Industrial facility — Suite 110 does not exist. Requires validation.",
    erpAddress: "2847 Industrial Parkway Suite 110, Detroit MI 48210",
    poAddress: "2847 Industrial Parkway, Detroit MI 48210",
    recommendation: "Remove 'Suite 110' — industrial facility confirmed via 8 prior delivery records (2022–2026). Atlas confidence: 94%.",
  },
  internalRef: "NVT-OMS-2026-78432",
  createdBy: "Atlas OTC-AGT-002",
  salesRep: "Sarah Chen",
  territory: "Midwest",
};

const VALIDATION_CHECKS = [
  { checkId: "VAL-001", name: "Order Header Completeness",    status: "PASS",  detail: "All required header fields present. PO number, customer ID, order date validated." },
  { checkId: "VAL-002", name: "Customer Account Standing",    status: "HOLD",  detail: "Credit exposure at 92% of limit. OTC-AGT-003 reviewing — see credit check for details." },
  { checkId: "VAL-003", name: "Product Availability Check",   status: "HOLD",  detail: "12 turbine units requested. Inventory split across Chicago (8) and Atlanta (4). OTC-AGT-004 resolving fulfillment option." },
  { checkId: "VAL-004", name: "Ship-To Address Validation",   status: "WARN",  detail: "Suite-number discrepancy detected between ERP master and PO. Atlas recommends removal — industrial facility. Confirm to clear." },
  { checkId: "VAL-005", name: "Pricing & Contract Alignment", status: "PASS",  detail: "Order value $429,711 matches approved quote Q-78432. Contract MSA-2024-0892 in force." },
  { checkId: "VAL-006", name: "Export Control Screening",     status: "PASS",  detail: "No restricted party hits. EAR99 classification confirmed for all 48 order lines." },
  { checkId: "VAL-007", name: "RUSH Order Prioritization",    status: "PASS",  detail: "RUSH flag accepted. Expedite fee $1,800 applied per MSA §7.4(b). Warehouse notified." },
  { checkId: "VAL-008", name: "Revenue Recognition (ASC 606)","status": "PASS", detail: "Performance obligations identified. Ship-and-bill treatment confirmed. Rev-rec memo generated." },
];

router.get("/order", (_req: Request, res: Response) => {
  res.json({ order: ORDER, retrievedAt: new Date().toISOString() });
});

router.get("/validation-checks", (_req: Request, res: Response) => {
  const passCount = VALIDATION_CHECKS.filter(c => c.status === "PASS").length;
  const holdCount = VALIDATION_CHECKS.filter(c => c.status === "HOLD").length;
  const warnCount = VALIDATION_CHECKS.filter(c => c.status === "WARN").length;
  res.json({
    orderId: ORDER.orderId,
    checks: VALIDATION_CHECKS,
    summary: { total: VALIDATION_CHECKS.length, pass: passCount, hold: holdCount, warn: warnCount },
    canRelease: holdCount === 0,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/resolve-address", (_req: Request, res: Response) => {
  res.json({
    orderId: ORDER.orderId,
    resolution: "SUITE_REMOVED",
    resolvedAddress: {
      ...ORDER.shipTo,
      address2: "",
    },
    rationale: "Industrial facility confirmed via 8 prior delivery records (2022–2026) to 2847 Industrial Parkway Detroit MI 48210. Suite 110 does not exist at this facility — removed from ERP master.",
    atlasConfidence: 0.94,
    checkId: "VAL-004",
    newStatus: "PASS",
    resolvedAt: new Date().toISOString(),
  });
});

// Spec tool name aliases — map to same deterministic data
router.post("/validate-customer-identity", (_req: Request, res: Response) => {
  res.json({
    customerId: ORDER.customerId,
    customerName: ORDER.customer,
    identityVerified: true,
    accountStatus: "ACTIVE",
    contractRef: "MSA-2024-0892",
    creditRating: "A+",
    sanctionsCheck: "CLEAR",
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/validate-ship-address", (_req: Request, res: Response) => {
  res.json({
    orderId: ORDER.orderId,
    resolution: "SUITE_REMOVED",
    resolvedAddress: { ...ORDER.shipTo, address2: "" },
    rationale: "Industrial facility confirmed via 8 prior delivery records (2022–2026) to 2847 Industrial Parkway Detroit MI 48210. Suite 110 does not exist at this facility — removed from ERP master.",
    atlasConfidence: 0.94,
    checkId: "VAL-004",
    newStatus: "PASS",
    resolvedAt: new Date().toISOString(),
  });
});

router.post("/calculate-taxes", (_req: Request, res: Response) => {
  res.json({
    orderId: ORDER.orderId,
    shipToState: "MI",
    taxRate: 0.06,
    taxableAmount: 429_711,
    taxAmount: 25_782.66,
    exemptionCode: "MANUFACTURING_EXEMPTION",
    nexusState: true,
    checkId: "VAL-005",
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/check-compliance", (_req: Request, res: Response) => {
  res.json({
    orderId: ORDER.orderId,
    exportControl: { status: "CLEAR", classification: "EAR99", restrictedParty: false },
    ofac: { status: "CLEAR", hits: 0 },
    revenueRecognition: { status: "PASS", treatment: "ship-and-bill", asc606Memo: "Generated" },
    checkId: "VAL-006",
    allClear: true,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/release", (_req: Request, res: Response) => {
  res.json({
    orderId: ORDER.orderId,
    status: "RELEASED",
    releasedAt: new Date().toISOString(),
    releasedBy: "Atlas OTC-AGT-002 (automated — all holds cleared)",
    erpConfirmation: "ERP-TXN-2026-78432",
    warehousePickTickets: ["PT-CHI-7842-A", "PT-CHI-7842-B", "PT-CHI-7842-C"],
    estimatedShipWave1: "2026-05-02",
    estimatedShipWave2: "2026-05-03",
    estimatedShipDate: "2026-05-02",
    estimatedDeliveryDate: "2026-05-03",
    deliveryPromise: "May 2–3, 2026",
    nextSteps: [
      "Pick tickets PT-CHI-7842-A/B/C transmitted to Chicago DC — 2-wave ship May 2–3",
      "Customer confirmation email queued to j.davis@meridian-mfg.com",
      "Invoice draft $429,711 + RUSH surcharge $1,840 created — pending ship confirmation",
    ],
  });
});

export const toolManifest = [
  {
    name: "validate_customer_identity",
    description: "Validates Meridian Manufacturing customer identity, account standing, MSA contract reference, A+ credit rating, and OFAC sanctions screening for ORD-2026-78432.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "validate_ship_address",
    description: "Resolves ship-to address discrepancy for ORD-2026-78432: removes spurious Suite 110 from ERP master record using prior delivery history. Returns corrected address and VAL-004 PASS status.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "calculate_taxes",
    description: "Computes Illinois sales tax for ORD-2026-78432, applies manufacturing exemption where applicable, and confirms ASC 606 revenue recognition treatment.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "check_compliance",
    description: "Runs export control screening (EAR99), OFAC restricted-party check, and ASC 606 revenue recognition validation for all 48 line items on ORD-2026-78432.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "release_order",
    description: "Releases order ORD-2026-78432 into ERP once all 8 validation holds are cleared. Returns deterministic ERP transaction ID, warehouse pick ticket, and estimated ship/delivery dates.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_order",
    description: "Retrieves the full purchase order details for ORD-2026-78432 including line items, ship-to address, order type, and internal references.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_validation_checks",
    description: "Returns the 8-point order validation checklist for ORD-2026-78432 with PASS/HOLD/WARN status for each check and a canRelease flag.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export default router;
