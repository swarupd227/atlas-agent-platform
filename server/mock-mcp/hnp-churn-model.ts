import { Router, type Request, type Response } from "express";

const router = Router();

// ─── HNP Churn Model MCP — deterministic ML model responses ───────────────────
// Real-world pattern: Harvey 2017 showed 340% churn spike in weeks 3-6 post-storm
// in storm-affected zip codes. Historical retention rates used as baseline.

type ChurnScore = {
  subscriberId:  string;
  churnProb30d:  number;  // 0–1
  churnProb60d:  number;  // 0–1
  riskTier:      "critical" | "high" | "medium" | "low";
  primaryDriver: string;
  secondaryDrivers: string[];
  confidenceScore: number;
  modelVersion: string;
  scoredAt: string;
};

type FeatureImportance = {
  subscriberId:   string;
  features: Array<{ feature: string; importance: number; value: string; direction: "churn" | "retain" }>;
};

// Pre-computed churn scores keyed by subscriber ID
const CHURN_SCORES: Record<string, ChurnScore> = {
  "SUB-HOU-003": {  // Maria Santos — amber, storm-event new sub
    subscriberId:  "SUB-HOU-003",
    churnProb30d:  0.61,
    churnProb60d:  0.82,
    riskTier:      "critical",
    primaryDriver: "Zero brand affinity — subscribed 48 hours ago during breaking news event with no prior engagement history.",
    secondaryDrivers: [
      "Storm-event acquisition: 74% of storm-event subscribers revert to non-subscriber behaviour within 60 days once acute news cycle ends.",
      "Mobile-only, monthly plan: payment friction at renewal combined with news fatigue is highest predictor of 30-day churn.",
      "Single-topic engagement (hurricane/weather only): no cross-section breadth indicates no discovered value outside storm coverage.",
    ],
    confidenceScore: 0.88,
    modelVersion: "hnp-churn-v3.2-harvey-calibrated",
    scoredAt: "2026-04-30T10:05:00Z",
  },
  "SUB-HOU-004": {  // Kevin Obi — amber, storm-event new sub
    subscriberId:  "SUB-HOU-004",
    churnProb30d:  0.54,
    churnProb60d:  0.78,
    riskTier:      "critical",
    primaryDriver: "Storm-event subscriber with evacuation/traffic focus — historically correlated with 78% post-event cancellation rate.",
    secondaryDrivers: [
      "Monthly plan with card payment — renewal friction risk higher than annual subscribers.",
      "No notification engagement outside storm alerts.",
      "Narrow interest profile: evacuation + traffic content has no year-round Chronicle equivalent at same volume.",
    ],
    confidenceScore: 0.84,
    modelVersion: "hnp-churn-v3.2-harvey-calibrated",
    scoredAt: "2026-04-30T10:05:00Z",
  },
  "SUB-HOU-005": {  // Robert Okafor — red, pre-existing low engagement
    subscriberId:  "SUB-HOU-005",
    churnProb30d:  0.71,
    churnProb60d:  0.87,
    riskTier:      "critical",
    primaryDriver: "Pre-storm engagement had already declined to 1 session/week — storm spike is likely temporary re-engagement before cancellation (Harvey pattern match: 89% similarity).",
    secondaryDrivers: [
      "Prior churn event on record: subscriber previously cancelled and resubscribed, indicating low long-term retention probability.",
      "PayPal payment method: highest payment lapse rate of any payment method (1.3x vs card).",
      "6-month tenure: within the highest-risk 4-8 month window where subscribers have neither sunk-cost retention nor developed strong brand loyalty.",
    ],
    confidenceScore: 0.91,
    modelVersion: "hnp-churn-v3.2-harvey-calibrated",
    scoredAt: "2026-04-30T10:05:00Z",
  },
  "SUB-HOU-006": {  // Patricia Delgado — red, pre-existing low engagement
    subscriberId:  "SUB-HOU-006",
    churnProb30d:  0.48,
    churnProb60d:  0.65,
    riskTier:      "high",
    primaryDriver: "Low pre-storm engagement (2x/week) elevated to 6x/week during storm — temporary spike with high post-event reversion probability.",
    secondaryDrivers: [
      "Business/Real Estate interest profile — year-round content supply is strong, giving content retention intervention a realistic pathway.",
      "Annual plan (current) partially protects: 5-month tenure means next renewal is 7 months out — intervention has time to work.",
      "Desktop user: higher session depth and longer dwell time than mobile; correlates with 1.4x higher intervention response rate.",
    ],
    confidenceScore: 0.79,
    modelVersion: "hnp-churn-v3.2-harvey-calibrated",
    scoredAt: "2026-04-30T10:05:00Z",
  },
  "SUB-HOU-001": {  // Jennifer Wu — green
    subscriberId:  "SUB-HOU-001",
    churnProb30d:  0.07,
    churnProb60d:  0.12,
    riskTier:      "low",
    primaryDriver: "Strong multi-section engagement, annual plan, 20 months tenure — within stable retention zone.",
    secondaryDrivers: [],
    confidenceScore: 0.93,
    modelVersion: "hnp-churn-v3.2-harvey-calibrated",
    scoredAt: "2026-04-30T10:05:00Z",
  },
  "SUB-HOU-002": {  // Alejandro Rios — green
    subscriberId:  "SUB-HOU-002",
    churnProb30d:  0.05,
    churnProb60d:  0.09,
    riskTier:      "low",
    primaryDriver: "26-month tenure, multi-section breadth including Investigations — most loyal segment profile.",
    secondaryDrivers: [],
    confidenceScore: 0.96,
    modelVersion: "hnp-churn-v3.2-harvey-calibrated",
    scoredAt: "2026-04-30T10:05:00Z",
  },
};

const FEATURE_IMPORTANCE: Record<string, FeatureImportance> = {
  "SUB-HOU-003": {
    subscriberId: "SUB-HOU-003",
    features: [
      { feature: "Tenure (months)",             importance: 0.28, value: "0 months",            direction: "churn" },
      { feature: "Acquisition channel",         importance: 0.24, value: "storm-event",          direction: "churn" },
      { feature: "Content breadth (sections)",  importance: 0.19, value: "1 section",            direction: "churn" },
      { feature: "Payment method",              importance: 0.14, value: "apple-pay / monthly",  direction: "churn" },
      { feature: "Flood-zone residence",        importance: 0.08, value: "yes — zip 77085",      direction: "retain" },
      { feature: "Notification open rate",      importance: 0.07, value: "91%",                  direction: "retain" },
    ],
  },
  "SUB-HOU-005": {
    subscriberId: "SUB-HOU-005",
    features: [
      { feature: "Engagement velocity (pre→now)", importance: 0.31, value: "1→4 sessions/wk (temporary spike)", direction: "churn" },
      { feature: "Prior churn events",           importance: 0.22, value: "1 prior cancel/resub",              direction: "churn" },
      { feature: "Tenure (months)",              importance: 0.18, value: "6 months (high-risk window)",       direction: "churn" },
      { feature: "Payment method",               importance: 0.15, value: "PayPal (highest lapse rate)",       direction: "churn" },
      { feature: "Flood-zone residence",         importance: 0.09, value: "yes — zip 77069",                   direction: "retain" },
      { feature: "Notification open rate",       importance: 0.05, value: "18% (low)",                         direction: "churn" },
    ],
  },
};

// Cohort-level risk distribution
const COHORT_RISK = {
  amber: {
    cohort: "amber",
    label: "Storm-driven new subscribers",
    subscriberCount: 8000,
    avgChurnProb30d: 0.62,
    avgChurnProb60d: 0.79,
    riskDistribution: { critical: 4200, high: 2800, medium: 800, low: 200 },
    topDrivers: [
      "Storm-event acquisition with no prior engagement history",
      "Single-topic interest profile (storm/weather only)",
      "Monthly plan + mobile device combination",
    ],
    harvestComparison: "Harvey 2017: 68% of storm-event subscribers cancelled within 60 days. Target: <35% with intervention.",
  },
  red: {
    cohort: "red",
    label: "Pre-existing low engagement",
    subscriberCount: 15400,
    avgChurnProb30d: 0.71,
    avgChurnProb60d: 0.84,
    riskDistribution: { critical: 7700, high: 4600, medium: 2200, low: 900 },
    topDrivers: [
      "Engagement already declining before storm — storm spike is temporary re-engagement",
      "Prior churn events on record",
      "Monthly plan with elevated payment lapse risk",
    ],
    harvestComparison: "Harvey 2017: 73% of pre-existing low-engagement subscribers in storm-affected zips cancelled within 45 days.",
  },
  green: {
    cohort: "green",
    label: "High engagement, low churn risk",
    subscriberCount: 41000,
    avgChurnProb30d: 0.07,
    avgChurnProb60d: 0.12,
    riskDistribution: { critical: 200, high: 800, medium: 3000, low: 37000 },
    topDrivers: [],
    harvestComparison: "No intervention recommended for this cohort. Monitor for any degradation signals.",
  },
};

// ─── Tools ────────────────────────────────────────────────────────────────────

// GET /get-churn-score?subscriber_id=SUB-HOU-003
router.get("/get-churn-score", (req: Request, res: Response) => {
  const id = String(req.query.subscriber_id ?? "");
  const score = CHURN_SCORES[id];
  if (!score) {
    // Return a generic medium-risk score for unknown IDs
    return res.json({
      success: true,
      subscriberId: id,
      churnProb30d: 0.41,
      churnProb60d: 0.55,
      riskTier: "medium",
      primaryDriver: "Insufficient history for precise scoring — default medium risk assigned.",
      secondaryDrivers: [],
      confidenceScore: 0.45,
      modelVersion: "hnp-churn-v3.2-harvey-calibrated",
      scoredAt: new Date().toISOString(),
      note: "No explicit score record for this subscriber. Generic scoring applied.",
    });
  }
  return res.json({ success: true, ...score });
});

// GET /get-feature-importance?subscriber_id=SUB-HOU-005
router.get("/get-feature-importance", (req: Request, res: Response) => {
  const id = String(req.query.subscriber_id ?? "");
  const fi = FEATURE_IMPORTANCE[id];
  if (!fi) {
    return res.json({
      success: true,
      subscriberId: id,
      features: [
        { feature: "Tenure",    importance: 0.35, value: "unknown", direction: "churn" },
        { feature: "Engagement velocity", importance: 0.30, value: "unknown", direction: "churn" },
        { feature: "Content breadth",     importance: 0.20, value: "unknown", direction: "churn" },
      ],
      note: "Generic feature importance — subscriber not in pre-computed set.",
    });
  }
  return res.json({ success: true, ...fi });
});

// GET /get-cohort-risk-distribution?cohort=amber
router.get("/get-cohort-risk-distribution", (req: Request, res: Response) => {
  const cohort = String(req.query.cohort ?? "");
  if (cohort && (COHORT_RISK as any)[cohort]) {
    return res.json({ success: true, ...(COHORT_RISK as any)[cohort] });
  }
  // Return all cohorts
  return res.json({
    success: true,
    cohorts: Object.values(COHORT_RISK),
    summaryNote: "Combined at-risk population: 23,400 subscribers (amber + red cohorts). Harvey-calibrated model.",
  });
});

export default router;
