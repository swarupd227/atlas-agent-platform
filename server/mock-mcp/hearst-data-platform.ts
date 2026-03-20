import { Router, type Request, type Response } from "express";

const router = Router();

const BRANDS = ["Cosmopolitan", "Esquire", "Elle", "Harper's Bazaar", "Men's Health", "Women's Health", "Oprah Daily", "Road & Track", "Car and Driver", "Popular Mechanics", "Town & Country", "House Beautiful"];

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function getSubscriberPool() {
  const rng = seededRng(8472);
  const subscribers = [];
  const stages = ["New Subscriber", "Engaged Reader", "At-Risk", "VIP", "Churned"];
  const channels = ["email", "push", "social", "direct"];
  for (let i = 0; i < 6200000; i += 62000) {
    const r = () => rng();
    const fatigueScore = Math.floor(r() * 80) + 5;
    subscribers.push({
      subscriberId: `sub-${i.toString().padStart(7, "0")}`,
      email: `subscriber${i}@example.com`,
      brands: BRANDS.slice(0, Math.floor(r() * 5) + 1),
      lifecycleStage: stages[Math.floor(r() * stages.length)],
      healthScore: Math.floor(r() * 60) + 40,
      fatigueScore,
      fatigueRisk: fatigueScore > 65 ? "high" : fatigueScore > 40 ? "medium" : "low",
      preferredChannel: channels[Math.floor(r() * channels.length)],
      optimalSendHour: Math.floor(r() * 12) + 7,
      optimalSendDay: ["Mon", "Tue", "Wed", "Thu", "Fri"][Math.floor(r() * 5)],
      lastOpenDate: new Date(Date.now() - Math.floor(r() * 14) * 86400000).toISOString().split("T")[0],
      emailsReceivedLast30Days: Math.floor(r() * 25),
      avgOpenRate: Math.round((r() * 0.35 + 0.1) * 1000) / 1000,
      contentAffinityVector: {
        fashion: Math.round(r() * 100) / 100,
        health: Math.round(r() * 100) / 100,
        automotive: Math.round(r() * 100) / 100,
        home: Math.round(r() * 100) / 100,
        entertainment: Math.round(r() * 100) / 100,
      },
    });
  }
  return subscribers;
}

router.get("/esp-events", (req: Request, res: Response) => {
  const { subscriberId, brand, limit: limitStr, lookback_days: lookbackStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 50, 200);
  const lookbackDays = parseInt(lookbackStr as string) || 30;
  const rng = seededRng(subscriberId ? subscriberId.toString().charCodeAt(3) * 17 : 4711);

  const eventTypes = ["open", "click", "unsubscribe", "soft_bounce", "hard_bounce", "spam_report"];
  const brandsToUse = brand ? [brand as string] : BRANDS.slice(0, 6);
  const events = [];

  for (let i = 0; i < limit; i++) {
    const rnd = rng();
    const daysBack = Math.floor(rnd * lookbackDays);
    const eventType = rnd < 0.45 ? "open" : rnd < 0.70 ? "click" : rnd < 0.85 ? "open" : eventTypes[Math.floor(rng() * eventTypes.length)];
    events.push({
      eventId: `evt-${Date.now()}-${i}`,
      subscriberId: subscriberId || `sub-${Math.floor(rng() * 6200000).toString().padStart(7, "0")}`,
      brand: brandsToUse[Math.floor(rng() * brandsToUse.length)],
      eventType,
      subject: `${brandsToUse[Math.floor(rng() * brandsToUse.length)]} — ${["Weekly", "Daily", "Special", "Exclusive"][Math.floor(rng() * 4)]} ${["Edition", "Update", "Picks", "Digest"][Math.floor(rng() * 4)]}`,
      eventTimestamp: new Date(Date.now() - daysBack * 86400000 - Math.floor(rng() * 86400000)).toISOString(),
      deviceType: ["mobile", "desktop", "tablet"][Math.floor(rng() * 3)],
      clientType: ["apple_mail", "gmail", "outlook", "yahoo"][Math.floor(rng() * 4)],
      engagementScore: eventType === "click" ? Math.round((0.6 + rng() * 0.4) * 100) / 100 : eventType === "open" ? Math.round((0.3 + rng() * 0.4) * 100) / 100 : 0,
    });
  }

  events.sort((a, b) => new Date(b.eventTimestamp).getTime() - new Date(a.eventTimestamp).getTime());
  res.json({ success: true, count: events.length, events });
});

router.get("/website-behavior", (req: Request, res: Response) => {
  const { subscriberId, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 30, 100);
  const rng = seededRng(subscriberId ? subscriberId.toString().charCodeAt(4) * 31 : 9123);

  const sections = ["fashion", "beauty", "health-wellness", "automotive", "home-decor", "entertainment", "travel", "food", "tech", "finance"];
  const sessions = [];

  for (let i = 0; i < limit; i++) {
    const section = sections[Math.floor(rng() * sections.length)];
    const brand = BRANDS[Math.floor(rng() * BRANDS.length)];
    const daysBack = Math.floor(rng() * 21);
    sessions.push({
      sessionId: `sess-${i}-${Date.now()}`,
      subscriberId: subscriberId || `sub-anonymous`,
      brand,
      section,
      pagesViewed: Math.floor(rng() * 8) + 1,
      timeOnSiteSecs: Math.floor(rng() * 600) + 30,
      articlesRead: Math.floor(rng() * 5),
      videoPlayed: rng() > 0.7,
      sessionDate: new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0],
      contentAffinitySignal: Math.round((0.3 + rng() * 0.7) * 100) / 100,
      source: ["email_click", "direct", "social", "search"][Math.floor(rng() * 4)],
    });
  }

  res.json({ success: true, count: sessions.length, sessions, affinityBreakdown: {
    fashion: Math.round(rng() * 100) / 100,
    health: Math.round(rng() * 100) / 100,
    automotive: Math.round(rng() * 100) / 100,
    home: Math.round(rng() * 100) / 100,
    entertainment: Math.round(rng() * 100) / 100,
  }});
});

router.get("/subscription-status", (req: Request, res: Response) => {
  const { subscriberId } = req.query;
  const rng = seededRng(subscriberId ? subscriberId.toString().length * 997 : 3333);

  const statuses = ["active", "active", "active", "trialing", "paused", "cancelled"];
  const tiers = ["free", "free", "premium", "premium_annual", "vip"];
  const status = statuses[Math.floor(rng() * statuses.length)];
  const tier = tiers[Math.floor(rng() * tiers.length)];

  const brandSubs = BRANDS.slice(0, Math.floor(rng() * 6) + 1).map(brand => ({
    brand,
    status,
    tier,
    subscribedSince: new Date(Date.now() - Math.floor(rng() * 365 * 3) * 86400000).toISOString().split("T")[0],
    renewalDate: new Date(Date.now() + Math.floor(rng() * 365) * 86400000).toISOString().split("T")[0],
    mrr: tier === "vip" ? 29.99 : tier === "premium_annual" ? 8.25 : tier === "premium" ? 12.99 : 0,
  }));

  res.json({
    success: true,
    subscriberId: subscriberId || "sub-0000000",
    overallStatus: status,
    primaryTier: tier,
    brandSubscriptions: brandSubs,
    totalMrr: brandSubs.reduce((sum, b) => sum + b.mrr, 0),
    lifetimeValue: Math.round((rng() * 850 + 50) * 100) / 100,
    churnRisk: rng() > 0.7 ? "high" : rng() > 0.4 ? "medium" : "low",
  });
});

router.get("/purchase-history", (req: Request, res: Response) => {
  const { subscriberId, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 20, 50);
  const rng = seededRng(subscriberId ? subscriberId.toString().charCodeAt(2) * 7919 : 1337);

  const txTypes = ["subscription", "single_issue", "merchandise", "event_ticket", "digital_access"];
  const transactions = [];

  for (let i = 0; i < Math.floor(rng() * limit) + 1; i++) {
    const brand = BRANDS[Math.floor(rng() * BRANDS.length)];
    const txType = txTypes[Math.floor(rng() * txTypes.length)];
    const amount = txType === "subscription" ? [9.99, 12.99, 29.99, 99.99][Math.floor(rng() * 4)] : Math.round(rng() * 80 + 5);
    transactions.push({
      transactionId: `txn-${i}-${Date.now()}`,
      subscriberId: subscriberId || "sub-0000000",
      brand,
      type: txType,
      amount,
      currency: "USD",
      status: "completed",
      purchaseDate: new Date(Date.now() - Math.floor(rng() * 365) * 86400000).toISOString().split("T")[0],
      entitlement: txType === "subscription" ? `${brand}_digital_full` : null,
    });
  }

  res.json({ success: true, count: transactions.length, transactions,
    lifetimeValue: transactions.reduce((s, t) => s + (t.amount as number), 0) });
});

router.get("/demographic-data", (req: Request, res: Response) => {
  const { subscriberId } = req.query;
  const rng = seededRng(subscriberId ? subscriberId.toString().charCodeAt(1) * 2053 : 42);

  const ageGroups = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  const incomes = ["<$50k", "$50-75k", "$75-100k", "$100-150k", "$150-250k", "$250k+"];
  const regions = ["Northeast US", "Southeast US", "Midwest US", "Southwest US", "West Coast US", "Canada", "UK", "Europe"];

  res.json({
    success: true,
    subscriberId: subscriberId || "sub-0000000",
    demographics: {
      ageGroup: ageGroups[Math.floor(rng() * ageGroups.length)],
      gender: rng() > 0.45 ? "female" : rng() > 0.1 ? "male" : "non-binary",
      householdIncome: incomes[Math.floor(rng() * incomes.length)],
      region: regions[Math.floor(rng() * regions.length)],
      educationLevel: ["high_school", "bachelors", "masters", "doctorate"][Math.floor(rng() * 4)],
      homeowner: rng() > 0.4,
      hasChildren: rng() > 0.55,
      luxuryPropensity: Math.round(rng() * 100) / 100,
      travelFrequency: ["never", "1-2/year", "3-5/year", "6+/year"][Math.floor(rng() * 4)],
    },
    source: "Experian/Acxiom enrichment",
    confidenceScore: Math.round((0.65 + rng() * 0.3) * 100) / 100,
    lastEnrichedDate: new Date(Date.now() - Math.floor(rng() * 30) * 86400000).toISOString().split("T")[0],
  });
});

export default router;
