import { Router, type Request, type Response } from "express";

const router = Router();

const CREDIT_PROFILE = {
  customerId: "CUST-00892",
  customerName: "Meridian Manufacturing",
  creditRating: "A+",
  creditLimit: 500_000,
  currentExposure: 459_500,
  exposurePct: 91.9,
  openAR: {
    current: 148_200,
    days30: 52_400,
    days60: 0,
    days90plus: 0,
    total: 200_600,
  },
  pendingOrders: [
    { orderId: "ORD-2026-75811", value: 128_900, status: "shipped", shipDate: "2026-04-08" },
    { orderId: "ORD-2026-77203", value: 102_000, status: "in_warehouse", shipDate: "2026-04-18" },
    { orderId: "ORD-2026-78011", value: 28_000,  status: "processing",  shipDate: "2026-04-22" },
  ],
  newOrderValue: 429_711,
  projectedExposureIfApproved: 889_211,
  projectedExposurePct: 177.8,
  avgDaysToPay: 32,
  paymentHistory: "EXCELLENT",
  nsf: 0,
  latePayments12mo: 0,
  relationship: {
    yearsSince: 7,
    annualSpend: 28_400_000,
    lifetimeOrders: 412,
  },
};

const CREDIT_ANALYSIS = {
  blockerType: "CREDIT_EXPOSURE",
  severity: "HIGH",
  detail: "Current exposure $459,500 (91.9% of $500K limit). New order $429,711 would push to $889K (177.8% of limit) — requires credit action.",
  resolution: {
    option: "TEMPORARY_LIMIT_INCREASE",
    label: "Temporary Credit Limit Increase",
    newLimit: 950_000,
    duration: "60 days",
    rationale: "Meridian A+ rating, 7-year relationship, $28.4M annual spend, zero late payments in 12 months, zero NSF. Projected inbound AR $200,600 due within 30 days (reduces exposure to $688,600 within 30 days). Risk committee pre-authorization threshold: $1M for A/A+ customers. No escalation required.",
    riskScore: "LOW",
    approvalLevel: "AUTOMATED",
    approvedBy: "Atlas OTC-AGT-003 (automated — within pre-auth threshold)",
  },
  checkId: "VAL-002",
  newStatus: "PASS",
};

const AR_AGING = [
  { bucket: "Current (0-30)",  amount: 148_200, invoiceCount: 3, pct: 73.9 },
  { bucket: "31-60 days",      amount:  52_400, invoiceCount: 1, pct: 26.1 },
  { bucket: "61-90 days",      amount:       0, invoiceCount: 0, pct:  0.0 },
  { bucket: "91+ days",        amount:       0, invoiceCount: 0, pct:  0.0 },
];

// Spec tool name routes ──────────────────────────────────────────────────────

router.get("/get-credit-exposure", (_req: Request, res: Response) => {
  res.json({
    customerId: CREDIT_PROFILE.customerId,
    currentExposure: CREDIT_PROFILE.currentExposure,
    exposurePct: CREDIT_PROFILE.exposurePct,
    creditLimit: CREDIT_PROFILE.creditLimit,
    newOrderValue: CREDIT_PROFILE.newOrderValue,
    projectedExposure: CREDIT_PROFILE.projectedExposureIfApproved,
    projectedExposurePct: CREDIT_PROFILE.projectedExposurePct,
    analysis: CREDIT_ANALYSIS,
    pendingOrders: CREDIT_PROFILE.pendingOrders,
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/get-payment-history", (_req: Request, res: Response) => {
  res.json({
    customerId: CREDIT_PROFILE.customerId,
    customerName: CREDIT_PROFILE.customerName,
    paymentHistory: CREDIT_PROFILE.paymentHistory,
    avgDaysToPay: CREDIT_PROFILE.avgDaysToPay,
    nsf: CREDIT_PROFILE.nsf,
    latePayments12mo: CREDIT_PROFILE.latePayments12mo,
    aging: AR_AGING,
    totalAR: CREDIT_PROFILE.openAR.total,
    relationship: CREDIT_PROFILE.relationship,
    riskFlag: false,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/calculate-risk-score", (_req: Request, res: Response) => {
  res.json({
    customerId: CREDIT_PROFILE.customerId,
    riskScore: "LOW",
    creditRating: CREDIT_PROFILE.creditRating,
    riskFactors: {
      paymentBehavior: "EXCELLENT (0 late payments, 0 NSF in 12 months)",
      relationship: `${CREDIT_PROFILE.relationship.yearsSince}-year relationship, $${(CREDIT_PROFILE.relationship.annualSpend / 1_000_000).toFixed(1)}M annual spend`,
      arQuality: "100% current-to-60d AR, zero aged",
      inboundAR: "$200,600 due within 30 days — reduces projected exposure to $688,600",
    },
    recommendation: "APPROVE_WITH_TEMP_LIMIT_INCREASE",
    preAuthThresholdSatisfied: true,
    escalationRequired: false,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/approve-credit-limit", (_req: Request, res: Response) => {
  res.json({
    customerId: CREDIT_PROFILE.customerId,
    resolution: "LIMIT_INCREASED",
    previousLimit: CREDIT_PROFILE.creditLimit,
    newLimit: CREDIT_ANALYSIS.resolution.newLimit,
    duration: CREDIT_ANALYSIS.resolution.duration,
    expiresAt: "2026-06-14",
    approvedBy: CREDIT_ANALYSIS.resolution.approvedBy,
    riskScore: CREDIT_ANALYSIS.resolution.riskScore,
    checkId: "VAL-002",
    newStatus: "PASS",
    approvedAt: new Date().toISOString(),
    memo: "Temporary limit extension to $950K for 60 days. Meridian A+ rated, 7yr relationship, zero delinquency. Inbound AR $200,600 expected within 30 days. Standard pre-auth threshold satisfied.",
  });
});

// Legacy routes ─────────────────────────────────────────────────────────────

router.get("/credit-profile", (_req: Request, res: Response) => {
  res.json({ profile: CREDIT_PROFILE, retrievedAt: new Date().toISOString() });
});

router.get("/ar-aging", (_req: Request, res: Response) => {
  res.json({
    customerId: CREDIT_PROFILE.customerId,
    customerName: CREDIT_PROFILE.customerName,
    aging: AR_AGING,
    totalAR: CREDIT_PROFILE.openAR.total,
    riskFlag: false,
    retrievedAt: new Date().toISOString(),
  });
});

router.get("/exposure-analysis", (_req: Request, res: Response) => {
  res.json({
    customerId: CREDIT_PROFILE.customerId,
    currentExposure: CREDIT_PROFILE.currentExposure,
    exposurePct: CREDIT_PROFILE.exposurePct,
    creditLimit: CREDIT_PROFILE.creditLimit,
    newOrderValue: CREDIT_PROFILE.newOrderValue,
    projectedExposure: CREDIT_PROFILE.projectedExposureIfApproved,
    projectedExposurePct: CREDIT_PROFILE.projectedExposurePct,
    analysis: CREDIT_ANALYSIS,
    pendingOrders: CREDIT_PROFILE.pendingOrders,
    retrievedAt: new Date().toISOString(),
  });
});

router.post("/approve-limit-increase", (_req: Request, res: Response) => {
  res.json({
    customerId: CREDIT_PROFILE.customerId,
    resolution: "LIMIT_INCREASED",
    previousLimit: CREDIT_PROFILE.creditLimit,
    newLimit: CREDIT_ANALYSIS.resolution.newLimit,
    duration: CREDIT_ANALYSIS.resolution.duration,
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    approvedBy: CREDIT_ANALYSIS.resolution.approvedBy,
    riskScore: CREDIT_ANALYSIS.resolution.riskScore,
    checkId: "VAL-002",
    newStatus: "PASS",
    approvedAt: new Date().toISOString(),
    memo: "Temporary limit extension to $950K for 60 days. Meridian A+ rated, 7yr relationship, zero delinquency. Inbound AR $200,600 expected within 30 days. Standard pre-auth threshold satisfied.",
  });
});

export const toolManifest = [
  {
    name: "get_credit_exposure",
    description: "Returns current credit exposure ($459,500 at 91.9% of $500K limit) and projects exposure to 177.8% if ORD-2026-78432 ($429,711) is approved. Returns blocker analysis and resolution recommendation.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_payment_history",
    description: "Returns Meridian Manufacturing's payment history (EXCELLENT), AR aging buckets, avg days-to-pay (32), NSF count (0), and 7-year relationship metrics.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "calculate_risk_score",
    description: "Computes a composite risk score for Meridian Manufacturing considering payment behavior, AR quality, inbound AR, and relationship. Returns LOW risk and APPROVE_WITH_TEMP_LIMIT_INCREASE recommendation.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "approve_credit_limit",
    description: "Approves a temporary 60-day credit limit increase to $950K for Meridian Manufacturing. Automated under pre-authorization threshold for A+ customers. Clears VAL-002 hold.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_credit_profile",
    description: "Legacy alias — returns Meridian Manufacturing's full credit profile including credit limit, current exposure, payment history, and relationship metrics.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_ar_aging",
    description: "Legacy alias — returns current AR aging buckets for Meridian Manufacturing.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_exposure_analysis",
    description: "Legacy alias for get_credit_exposure.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "approve_credit_limit_increase",
    description: "Legacy alias for approve_credit_limit.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export default router;
