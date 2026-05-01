import { Router, type Request, type Response } from "express";

const router = Router();

// ─── HNP Subscriber MCP — Houston Chronicle subscriber behavioural data ────────
// Hurricane Mara context: 280,000 digital subscribers; 64,400 in storm-affected zip codes.

type Subscriber = {
  subscriberId: string;
  name: string;
  email: string;
  zipCode: string;
  newspaper: string;
  subscriptionStart: string;
  plan: "monthly" | "annual";
  acquisitionChannel: "organic" | "storm-event" | "promo" | "referral";
  tenureMonths: number;
  sessionsPerWeekPre:  number;  // avg before storm
  sessionsPerWeekNow:  number;  // last 7 days
  topSections: string[];
  notificationOpenRate: number; // 0-1
  device: "mobile" | "desktop" | "both";
  paymentMethod: "card" | "paypal" | "apple-pay";
  pastChurnEvents: number;      // prior cancel/resubscribe events
  floodAffected: boolean;
  cohort: "green" | "amber" | "red";
  cohortLabel: string;
};

const SUBSCRIBERS: Subscriber[] = [
  // ── GREEN cohort (41,000 total — high engagement, low churn risk) ─────────────
  {
    subscriberId: "SUB-HOU-001",
    name: "Jennifer Wu",
    email: "jwu@example.com",
    zipCode: "77004",
    newspaper: "Houston Chronicle",
    subscriptionStart: "2024-08-20",
    plan: "annual",
    acquisitionChannel: "organic",
    tenureMonths: 20,
    sessionsPerWeekPre: 5,
    sessionsPerWeekNow: 8,
    topSections: ["City Hall", "Environment & Climate", "Business"],
    notificationOpenRate: 0.72,
    device: "both",
    paymentMethod: "card",
    pastChurnEvents: 0,
    floodAffected: false,
    cohort: "green",
    cohortLabel: "High engagement, low churn risk",
  },
  {
    subscriberId: "SUB-HOU-002",
    name: "Alejandro Rios",
    email: "arios@example.com",
    zipCode: "77002",
    newspaper: "Houston Chronicle",
    subscriptionStart: "2023-03-10",
    plan: "annual",
    acquisitionChannel: "organic",
    tenureMonths: 26,
    sessionsPerWeekPre: 6,
    sessionsPerWeekNow: 9,
    topSections: ["Harris County", "Sports", "Investigations"],
    notificationOpenRate: 0.81,
    device: "desktop",
    paymentMethod: "card",
    pastChurnEvents: 0,
    floodAffected: false,
    cohort: "green",
    cohortLabel: "High engagement, low churn risk",
  },
  // ── AMBER cohort (8,000 total — storm-event new subscribers, high 60-day churn risk) ─
  {
    subscriberId: "SUB-HOU-003",
    name: "Maria Santos",
    email: "msantos@example.com",
    zipCode: "77085",
    newspaper: "Houston Chronicle",
    subscriptionStart: "2026-04-28",
    plan: "monthly",
    acquisitionChannel: "storm-event",
    tenureMonths: 0,
    sessionsPerWeekPre: 0,
    sessionsPerWeekNow: 12,
    topSections: ["Hurricane Mara", "Breaking News", "Weather"],
    notificationOpenRate: 0.91,
    device: "mobile",
    paymentMethod: "apple-pay",
    pastChurnEvents: 0,
    floodAffected: true,
    cohort: "amber",
    cohortLabel: "Storm-driven new subscriber — 60-day churn risk",
  },
  {
    subscriberId: "SUB-HOU-004",
    name: "Kevin Obi",
    email: "kobi@example.com",
    zipCode: "77089",
    newspaper: "Houston Chronicle",
    subscriptionStart: "2026-04-29",
    plan: "monthly",
    acquisitionChannel: "storm-event",
    tenureMonths: 0,
    sessionsPerWeekPre: 0,
    sessionsPerWeekNow: 8,
    topSections: ["Hurricane Mara", "Traffic", "Evacuation"],
    notificationOpenRate: 0.88,
    device: "mobile",
    paymentMethod: "card",
    pastChurnEvents: 0,
    floodAffected: true,
    cohort: "amber",
    cohortLabel: "Storm-driven new subscriber — 60-day churn risk",
  },
  // ── RED cohort (15,000 total — pre-existing low engagement, high 30-day churn risk) ─
  {
    subscriberId: "SUB-HOU-005",
    name: "Robert Okafor",
    email: "rokafor@example.com",
    zipCode: "77069",
    newspaper: "Houston Chronicle",
    subscriptionStart: "2025-10-15",
    plan: "monthly",
    acquisitionChannel: "promo",
    tenureMonths: 6,
    sessionsPerWeekPre: 1,
    sessionsPerWeekNow: 4,
    topSections: ["Breaking News", "Sports"],
    notificationOpenRate: 0.18,
    device: "mobile",
    paymentMethod: "paypal",
    pastChurnEvents: 1,
    floodAffected: true,
    cohort: "red",
    cohortLabel: "Pre-existing low engagement — high 30-day churn risk",
  },
  {
    subscriberId: "SUB-HOU-006",
    name: "Patricia Delgado",
    email: "pdelgado@example.com",
    zipCode: "77059",
    newspaper: "Houston Chronicle",
    subscriptionStart: "2024-12-01",
    plan: "monthly",
    acquisitionChannel: "referral",
    tenureMonths: 5,
    sessionsPerWeekPre: 2,
    sessionsPerWeekNow: 6,
    topSections: ["Business", "Real Estate"],
    notificationOpenRate: 0.22,
    device: "desktop",
    paymentMethod: "card",
    pastChurnEvents: 0,
    floodAffected: false,
    cohort: "red",
    cohortLabel: "Pre-existing low engagement — high 30-day churn risk",
  },
];

// Cohort aggregate statistics (Houston Chronicle, storm-affected zip codes)
const COHORT_STATS = {
  totalSubscribers:       280000,
  stormAffectedZips:      ["77085", "77089", "77069", "77059", "77033", "77051"],
  stormAffectedCount:     64400,
  cohorts: {
    green: { count: 41000, label: "High engagement, low churn risk",                 color: "green",  avgSessionsPerWeek: 7.2, avgChurnProb30d: 0.08 },
    amber: { count:  8000, label: "Storm-driven new subscribers — 60-day churn risk", color: "amber",  avgSessionsPerWeek: 9.1, avgChurnProb30d: 0.62 },
    red:   { count: 15400, label: "Pre-existing low engagement — 30-day churn risk",  color: "red",    avgSessionsPerWeek: 3.4, avgChurnProb30d: 0.71 },
  },
  dataAsOf: "2026-04-30T10:00:00Z",
  context:  "Hurricane Mara landfall +24 hours. Historical Harvey pattern: 340% cancellation spike in storm-affected zips, weeks 3–6 post-event.",
};

// ─── Segment store (persisted in-memory for this demo session) ─────────────────
const SEGMENT_UPDATES: Record<string, { segment: string; updatedAt: string }> = {};

// ─── Tools ────────────────────────────────────────────────────────────────────

// GET /get-subscriber-profile?subscriber_id=...
router.get("/get-subscriber-profile", (req: Request, res: Response) => {
  const id = String(req.query.subscriber_id ?? "");
  const sub = SUBSCRIBERS.find(s => s.subscriberId === id);
  if (!sub) {
    return res.json({
      success: false,
      error: `Subscriber ${id} not found`,
      availableIds: SUBSCRIBERS.map(s => s.subscriberId),
    });
  }
  const update = SEGMENT_UPDATES[id];
  return res.json({
    success: true,
    subscriber: {
      ...sub,
      currentSegment: update?.segment ?? sub.cohort,
      lastUpdated: update?.updatedAt ?? sub.subscriptionStart,
    },
  });
});

// GET /get-engagement-signals?cohort=amber&limit=10
router.get("/get-engagement-signals", (req: Request, res: Response) => {
  const cohort = String(req.query.cohort ?? "");
  const limit  = Math.min(parseInt(String(req.query.limit ?? "10"), 10), 50);
  let subs = cohort ? SUBSCRIBERS.filter(s => s.cohort === cohort) : SUBSCRIBERS;
  subs = subs.slice(0, limit);
  return res.json({
    success: true,
    cohort: cohort || "all",
    count: subs.length,
    signals: subs.map(s => ({
      subscriberId: s.subscriberId,
      cohort: s.cohort,
      sessionsPerWeekPre:  s.sessionsPerWeekPre,
      sessionsPerWeekNow:  s.sessionsPerWeekNow,
      engagementVelocity:  +(s.sessionsPerWeekNow - s.sessionsPerWeekPre).toFixed(1),
      notificationOpenRate: s.notificationOpenRate,
      topSections: s.topSections,
      floodAffected: s.floodAffected,
      tenureMonths: s.tenureMonths,
      acquisitionChannel: s.acquisitionChannel,
    })),
    notes: "Engagement velocity = sessions/week now minus sessions/week pre-storm. Positive = storm-driven spike.",
  });
});

// POST /update-subscriber-segment
router.post("/update-subscriber-segment", (req: Request, res: Response) => {
  const { subscriber_id, segment, reason } = req.body || {};
  if (!subscriber_id || !segment) {
    return res.status(400).json({ success: false, error: "subscriber_id and segment are required" });
  }
  const sub = SUBSCRIBERS.find(s => s.subscriberId === subscriber_id);
  if (!sub) {
    return res.status(404).json({ success: false, error: `Subscriber ${subscriber_id} not found` });
  }
  SEGMENT_UPDATES[subscriber_id] = { segment, updatedAt: new Date().toISOString() };
  return res.json({
    success: true,
    subscriberId: subscriber_id,
    previousSegment: sub.cohort,
    newSegment: segment,
    reason: reason ?? "pipeline assignment",
    updatedAt: SEGMENT_UPDATES[subscriber_id].updatedAt,
  });
});

// GET /get-cohort-stats
router.get("/get-cohort-stats", (_req: Request, res: Response) => {
  return res.json({ success: true, ...COHORT_STATS });
});

// POST /send-trigger-event
router.post("/send-trigger-event", (req: Request, res: Response) => {
  const { event_type, cohort, subscriber_ids, payload } = req.body || {};
  if (!event_type) {
    return res.status(400).json({ success: false, error: "event_type is required" });
  }
  const affected = subscriber_ids?.length ?? (cohort === "amber" ? 8000 : cohort === "red" ? 15400 : 64400);
  return res.json({
    success: true,
    eventId: `EVT-${Date.now()}`,
    eventType: event_type,
    cohort: cohort ?? "all",
    subscribersQueued: affected,
    estimatedDeliveryMs: affected * 0.5,
    scheduledAt: new Date().toISOString(),
    payload: payload ?? {},
  });
});

export default router;
