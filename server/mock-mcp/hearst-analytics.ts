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

router.get("/send-logs", (req: Request, res: Response) => {
  const { brand, limit: limitStr, lookback_days: lookbackStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 50, 200);
  const lookbackDays = parseInt(lookbackStr as string) || 7;
  const rng = seededRng(brand ? (brand as string).charCodeAt(0) * 1777 : 5555);

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const logs = [];

  for (let i = 0; i < limit; i++) {
    const b = brandsToUse[Math.floor(rng() * brandsToUse.length)];
    const daysBack = Math.floor(rng() * lookbackDays);
    const delivered = Math.floor(rng() * 500000) + 10000;
    const opened = Math.floor(delivered * (0.15 + rng() * 0.3));
    const clicked = Math.floor(opened * (0.1 + rng() * 0.25));
    logs.push({
      sendId: `send-${b.slice(0, 3).toLowerCase()}-${i}-${Date.now()}`,
      brand: b,
      subject: `${b} — ${["Weekly Digest", "Daily Picks", "Breaking Now", "Special Edition", "Exclusive Offer"][Math.floor(rng() * 5)]}`,
      sentAt: new Date(Date.now() - daysBack * 86400000).toISOString(),
      delivered,
      opened,
      clicked,
      unsubscribed: Math.floor(delivered * rng() * 0.003),
      softBounced: Math.floor(delivered * rng() * 0.012),
      hardBounced: Math.floor(delivered * rng() * 0.002),
      spamReported: Math.floor(delivered * rng() * 0.0005),
      openRate: Math.round((opened / delivered) * 1000) / 1000,
      clickRate: Math.round((clicked / delivered) * 1000) / 1000,
      ctr: Math.round((clicked / (opened || 1)) * 1000) / 1000,
      inboxPlacement: Math.round((0.85 + rng() * 0.14) * 1000) / 1000,
      deliveryStatus: "completed",
      esp: "Salesforce Marketing Cloud",
    });
  }

  res.json({ success: true, count: logs.length, sendLogs: logs,
    aggregates: {
      totalDelivered: logs.reduce((s, l) => s + (l.delivered as number), 0),
      avgOpenRate: Math.round((logs.reduce((s, l) => s + (l.openRate as number), 0) / (logs.length || 1)) * 1000) / 1000,
      avgClickRate: Math.round((logs.reduce((s, l) => s + (l.clickRate as number), 0) / (logs.length || 1)) * 1000) / 1000,
    },
  });
});

router.get("/conversion-data", (req: Request, res: Response) => {
  const { brand, limit: limitStr, lookback_days: lookbackStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 30, 100);
  const lookbackDays = parseInt(lookbackStr as string) || 30;
  const rng = seededRng(brand ? (brand as string).charCodeAt(1) * 2311 : 6666);

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const conversionTypes = ["subscription_start", "subscription_upgrade", "paywall_conversion", "event_registration", "digital_purchase", "affiliate_click_purchase"];
  const conversions = [];

  for (let i = 0; i < limit; i++) {
    const b = brandsToUse[Math.floor(rng() * brandsToUse.length)];
    const convType = conversionTypes[Math.floor(rng() * conversionTypes.length)];
    const daysBack = Math.floor(rng() * lookbackDays);
    const revenue = convType === "subscription_start" ? [9.99, 12.99, 29.99][Math.floor(rng() * 3)]
      : convType === "subscription_upgrade" ? [12.99, 29.99, 99.99][Math.floor(rng() * 3)]
      : Math.round((rng() * 150 + 5) * 100) / 100;
    conversions.push({
      conversionId: `conv-${i}-${Date.now()}`,
      brand: b,
      conversionType: convType,
      sendId: `send-${b.slice(0, 3).toLowerCase()}-${i}`,
      convertedAt: new Date(Date.now() - daysBack * 86400000).toISOString(),
      revenue,
      currency: "USD",
      attributionModel: "last_touch_email",
      timeToConvertHours: Math.round((rng() * 72 + 0.5) * 10) / 10,
      sourceCampaignType: ["editorial", "promotional", "triggered"][Math.floor(rng() * 3)],
    });
  }

  const totalRevenue = conversions.reduce((s, c) => s + (c.revenue as number), 0);
  res.json({ success: true, count: conversions.length, conversions,
    summary: { totalRevenue: Math.round(totalRevenue * 100) / 100, avgRevenuePerConversion: Math.round((totalRevenue / (conversions.length || 1)) * 100) / 100, conversionsByType: conversionTypes.reduce((acc, t) => { acc[t] = conversions.filter(c => c.conversionType === t).length; return acc; }, {} as Record<string, number>) },
  });
});

router.get("/deliverability", (req: Request, res: Response) => {
  const rng = seededRng(3377);

  const metrics = BRANDS.map(b => ({
    brand: b,
    inboxPlacementRate: Math.round((0.85 + rng() * 0.13) * 1000) / 1000,
    spamRate: Math.round(rng() * 0.003 * 1000) / 1000,
    senderReputationScore: Math.round((70 + rng() * 29) * 10) / 10,
    dkimPass: true,
    spfPass: true,
    dmarcPass: true,
    bounceRate: Math.round(rng() * 0.025 * 1000) / 1000,
    unsubscribeRate: Math.round(rng() * 0.004 * 1000) / 1000,
    ispBreakdown: {
      gmail: Math.round((0.82 + rng() * 0.16) * 1000) / 1000,
      outlook: Math.round((0.84 + rng() * 0.14) * 1000) / 1000,
      yahoo: Math.round((0.78 + rng() * 0.20) * 1000) / 1000,
      apple_mail: Math.round((0.90 + rng() * 0.09) * 1000) / 1000,
    },
    esp: "Salesforce Marketing Cloud",
    reportDate: new Date().toISOString().split("T")[0],
  }));

  res.json({ success: true, count: metrics.length, deliverabilityMetrics: metrics,
    portfolio: {
      avgInboxPlacement: Math.round((metrics.reduce((s, m) => s + m.inboxPlacementRate, 0) / metrics.length) * 1000) / 1000,
      avgSenderReputation: Math.round((metrics.reduce((s, m) => s + m.senderReputationScore, 0) / metrics.length) * 10) / 10,
      allDkimPassing: true,
      allSpfPassing: true,
      allDmarcPassing: true,
    },
  });
});

router.get("/affiliate-revenue", (req: Request, res: Response) => {
  const { brand, lookback_days: lookbackStr } = req.query;
  const lookbackDays = parseInt(lookbackStr as string) || 30;
  const rng = seededRng(9911);

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const affiliateNetworks = ["Skimlinks", "Amazon Associates", "CJ Affiliate", "ShareASale"];
  const records = [];

  for (const b of brandsToUse) {
    const network = affiliateNetworks[Math.floor(rng() * affiliateNetworks.length)];
    const clicks = Math.floor(rng() * 50000) + 1000;
    const conversions = Math.floor(clicks * (0.01 + rng() * 0.05));
    const revenue = Math.round((conversions * (8 + rng() * 40)) * 100) / 100;
    records.push({
      brand: b,
      network,
      periodDays: lookbackDays,
      clicks,
      conversions,
      revenue,
      avgOrderValue: Math.round((revenue / (conversions || 1)) * 100) / 100,
      topProductCategories: ["fashion", "beauty", "home", "wellness"].slice(0, Math.floor(rng() * 3) + 1),
      epc: Math.round((revenue / (clicks || 1)) * 100) / 100,
    });
  }

  const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);
  res.json({ success: true, count: records.length, affiliateRevenue: records,
    summary: { totalRevenue: Math.round(totalRevenue * 100) / 100, totalClicks: records.reduce((s, r) => s + r.clicks, 0), totalConversions: records.reduce((s, r) => s + r.conversions, 0) },
  });
});

export default router;
