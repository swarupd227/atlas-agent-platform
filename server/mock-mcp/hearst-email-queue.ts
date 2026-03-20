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

const EMAIL_SUBJECTS: Record<string, string[]> = {
  "Cosmopolitan": ["Your Weekly Horoscope + Beauty Steals", "The Best Spring Dresses Under $100", "Dating in 2026: What's Changed", "Your Skin Is Trying to Tell You Something"],
  "Esquire": ["The Essential Spring Suit Guide", "What to Watch, Read, and Drink This Week", "The Best New Whiskeys, Ranked", "How to Upgrade Your Morning Routine"],
  "Elle": ["The Spring 2026 Runway Report", "Our Beauty Editor Tried 30 Foundations", "Why Everyone Is Wearing This Color", "The Sustainable Fashion Brands to Know"],
  "Harper's Bazaar": ["Inside the Season's Most Exclusive Galas", "Couture Week: All the Moments", "The Travel Destinations Worth the Splurge", "Beauty at Every Age: The New Rules"],
  "Men's Health": ["Build More Muscle in Less Time", "The Complete Nutrition Guide for Men", "Mental Health: Breaking the Stigma", "The Best Running Shoes, Tested"],
  "Women's Health": ["Your 4-Week Strength Plan", "The Gut Health Reset You Need", "Hormone Balance: What Actually Works", "30-Day Plank Challenge: Week 1"],
  "Oprah Daily": ["Oprah's Current Favorite Things", "The Books That Will Change Your Life", "Finding Joy in Everyday Moments", "The Anti-Anxiety Toolkit"],
  "Road & Track": ["We Drove the Ferrari 296 GTB", "The 10 Best Sports Cars of 2026", "F1 Season Preview: Who Will Win?", "The Manual Transmission Is Not Dead"],
  "Car and Driver": ["2026 Car of the Year: The Verdict", "Best Family SUVs: Full Comparison", "EV Range Test: 8 Cars on the Same Route", "The Used Car Market in 2026"],
  "Popular Mechanics": ["Inside NASA's Artemis III Plan", "The Best Power Tools of the Year", "Quantum Computing, Explained Simply", "DIY Solar: Complete Beginner's Guide"],
  "Town & Country": ["Inside the Season's Great Estates", "The World's Best Private Clubs", "Society's Spring Gala Circuit", "Where the Old Guard Summers in 2026"],
  "House Beautiful": ["50 Rooms That Inspired Us This Month", "The Color Trends Dominating 2026", "A Small Apartment, Brilliantly Redesigned", "The Best Plants for Low-Light Rooms"],
};

router.get("/brand-email-queues", (req: Request, res: Response) => {
  const { brand, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 60, 200);
  const rng = seededRng(8341);
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const queue = [];

  for (const b of brandsToUse) {
    const subjects = EMAIL_SUBJECTS[b] || [`${b} Weekly Newsletter`];
    const numEmails = Math.floor(rng() * 3) + 1;
    for (let i = 0; i < numEmails && queue.length < limit; i++) {
      const subject = subjects[i % subjects.length];
      const recipientCount = Math.floor(rng() * 800000) + 50000;
      const targetSegments = [
        rng() > 0.3 ? "premium_subscribers" : null,
        rng() > 0.5 ? "free_tier" : null,
        rng() > 0.7 ? "vip" : null,
      ].filter(Boolean) as string[];
      queue.push({
        emailId: `email-${b.slice(0, 3).toLowerCase()}-${i}-${Date.now()}`,
        brand: b,
        subject,
        scheduledSendDate: rng() > 0.5 ? today : tomorrow,
        scheduledSendHour: Math.floor(rng() * 12) + 7,
        priorityScore: Math.round((0.3 + rng() * 0.7) * 100) / 100,
        targetSegments: targetSegments.length ? targetSegments : ["all_subscribers"],
        recipientEstimate: recipientCount,
        campaignType: rng() > 0.6 ? "editorial" : rng() > 0.3 ? "promotional" : "transactional",
        status: rng() > 0.2 ? "queued" : "draft",
        predictedOpenRate: Math.round((0.15 + rng() * 0.3) * 1000) / 1000,
        predictedRevenue: Math.round((rng() * 20000 + 500) * 100) / 100,
        contentArticleIds: [`art-${b.slice(0, 3).toLowerCase()}-${i}`, `art-${b.slice(0, 3).toLowerCase()}-${i + 1}`],
        cannibalizes: rng() > 0.8 ? [`email-${b.slice(0, 3).toLowerCase()}-${i + 1}-prev`] : [],
      });
    }
  }

  res.json({ success: true, count: queue.length, emailQueue: queue,
    summary: {
      totalQueued: queue.filter(e => e.status === "queued").length,
      scheduledForToday: queue.filter(e => e.scheduledSendDate === today).length,
      scheduledForTomorrow: queue.filter(e => e.scheduledSendDate === tomorrow).length,
      totalRecipientEstimate: queue.reduce((s, e) => s + (e.recipientEstimate as number), 0),
    },
  });
});

router.get("/fatigue-rules", (req: Request, res: Response) => {
  const rng = seededRng(4422);

  res.json({
    success: true,
    fatigueRules: [
      {
        ruleId: "fat-001",
        name: "Weekly Send Cap",
        description: "No subscriber receives more than 5 emails per 7-day rolling window across all Hearst brands",
        type: "frequency_cap",
        threshold: 5,
        window: "7_days",
        scope: "cross_brand",
        priority: 1,
        action: "suppress",
        active: true,
      },
      {
        ruleId: "fat-002",
        name: "Fatigue Score Threshold",
        description: "Subscribers with fatigue score > 75 are suppressed from non-essential sends",
        type: "score_threshold",
        threshold: 75,
        scoreField: "fatigueScore",
        action: "hold",
        exceptionTypes: ["transactional", "account_alerts"],
        active: true,
      },
      {
        ruleId: "fat-003",
        name: "Same-Brand Same-Day Block",
        description: "A subscriber cannot receive more than 1 email per brand per day",
        type: "frequency_cap",
        threshold: 1,
        window: "1_day",
        scope: "per_brand",
        priority: 2,
        action: "suppress",
        active: true,
      },
      {
        ruleId: "fat-004",
        name: "Cool-Down Period",
        description: "After 3+ consecutive non-opens, enforce 3-day cool-down before re-engagement",
        type: "cool_down",
        consecutiveNonOpens: 3,
        coolDownDays: 3,
        action: "hold",
        active: true,
      },
      {
        ruleId: "fat-005",
        name: "High Unsubscribe Risk Guard",
        description: "Model-predicted unsubscribe probability > 0.4 triggers a hold for 24 hours",
        type: "risk_threshold",
        field: "unsubscribeRisk",
        threshold: 0.4,
        holdHours: 24,
        action: "hold",
        active: true,
      },
    ],
    globalSettings: {
      maxEmailsPerWeek: 5,
      maxEmailsPerDay: 2,
      coolDownAfterUnsub: 90,
      fatigueScoreHoldThreshold: 75,
      fatigueScoreSuppressionThreshold: 90,
      holdDecisionBoostNextDayOpenRate: "18-25%",
    },
  });
});

router.get("/business-rules", (req: Request, res: Response) => {
  const today = new Date().toISOString().split("T")[0];

  res.json({
    success: true,
    businessRules: [
      {
        ruleId: "biz-001",
        name: "Premium Content Lock",
        description: "Free-tier subscribers cannot receive premium editorial content; redirect to paywall",
        type: "access_control",
        applyTo: "free_tier",
        action: "redirect_to_paywall",
        active: true,
      },
      {
        ruleId: "biz-002",
        name: "Advertiser Exclusivity Windows",
        description: "During active ad campaigns, competing brand content is suppressed per IAB standards",
        type: "exclusivity",
        action: "suppress_competitive_content",
        active: true,
      },
      {
        ruleId: "biz-003",
        name: "CCPA Opt-Out Compliance",
        description: "Subscribers with CCPA do_not_sell flag receive no behavioral tracking or targeted content",
        type: "compliance",
        regulation: "CCPA",
        action: "restrict_personalization",
        active: true,
      },
      {
        ruleId: "biz-004",
        name: "CAN-SPAM Commercial Labeling",
        description: "All promotional emails must include physical address and clear unsubscribe link",
        type: "compliance",
        regulation: "CAN-SPAM",
        action: "require_commercial_disclosure",
        active: true,
      },
      {
        ruleId: "biz-005",
        name: "Brand Priority Ordering",
        description: "When multiple brands compete for the same send slot, priority order applies: Cosmo > Elle > MH > WH > Esquire > others",
        type: "priority",
        priorityOrder: ["Cosmopolitan", "Elle", "Men's Health", "Women's Health", "Esquire"],
        active: true,
      },
      {
        ruleId: "biz-006",
        name: "Holiday Blackout Dates",
        description: "No promotional sends on major US holidays; editorial sends allowed",
        type: "blackout",
        blackoutDates: ["2026-12-25", "2026-11-26", "2026-07-04", "2026-01-01"],
        exceptions: ["transactional"],
        active: true,
      },
    ],
    currentBlackouts: [],
    nextBlackoutDate: "2026-07-04",
    totalActiveRules: 6,
    lastUpdated: today,
  });
});

export default router;
