import { Router, type Request, type Response } from "express";

const router = Router();

const BRANDS = ["Cosmopolitan", "Esquire", "Elle", "Harper's Bazaar", "Men's Health", "Women's Health", "Oprah Daily", "Road & Track", "Car and Driver", "Popular Mechanics", "Town & Country", "House Beautiful"];

const CONTENT_CATEGORIES: Record<string, string[]> = {
  "Cosmopolitan": ["fashion", "beauty", "relationships", "sex-health", "celebrities", "pop-culture"],
  "Esquire": ["menswear", "grooming", "politics", "culture", "food-drink", "watches"],
  "Elle": ["runway", "beauty-trends", "designers", "sustainability", "wellness"],
  "Harper's Bazaar": ["couture", "luxury", "art", "travel", "philanthropy"],
  "Men's Health": ["fitness", "nutrition", "mental-health", "gear", "sex-relationships"],
  "Women's Health": ["fitness", "nutrition", "mental-health", "pregnancy", "wellness"],
  "Oprah Daily": ["mindfulness", "relationships", "books", "food", "home", "purpose"],
  "Road & Track": ["cars", "racing", "reviews", "buying-guides", "motorsport"],
  "Car and Driver": ["car-reviews", "comparisons", "ev-news", "buying-guides", "industry"],
  "Popular Mechanics": ["technology", "science", "DIY", "gear", "space", "military"],
  "Town & Country": ["luxury-living", "royals", "society", "travel", "arts"],
  "House Beautiful": ["interior-design", "decorating", "renovation", "gardens", "shopping"],
};

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const ARTICLE_SUBJECTS: Record<string, string[]> = {
  "Cosmopolitan": ["The 12 Best Mascaras of 2026", "Dating Red Flags You're Probably Ignoring", "Your Complete Spring Fashion Guide", "50 Questions to Ask Your Partner", "Celebs Who Spoke Out This Week"],
  "Esquire": ["The Best Suits Under $1,000", "The Books Every Man Should Read", "Inside the New Luxury Watch Boom", "How to Dress for Every Season", "The 10 Best Whiskeys Right Now"],
  "Elle": ["The Return of the Trench Coat", "Our Beauty Editor's Morning Routine", "Why Quiet Luxury is Here to Stay", "The Top Sustainable Fashion Brands", "Elle's Exclusive Spring Runway Picks"],
  "Men's Health": ["The 6-Week Muscle-Building Program", "100 Foods That Fight Inflammation", "Therapy Made Easier: 5 Apps to Try", "The Best Running Shoes of 2026", "Boost Your Testosterone Naturally"],
  "Women's Health": ["The 30-Day Ab Challenge", "What Your Period Pain Is Telling You", "Gut Health: The Complete Guide", "Strength Training for Beginners", "The Hormone Health Diet"],
  "Harper's Bazaar": ["Inside Valentino's Latest Collection", "The Best Destination Spas of 2026", "Philanthropy's New Power Players", "Art Basel Miami: What You Missed", "Couture Week: Standout Moments"],
  "Oprah Daily": ["30 Books to Read Before Summer", "Finding Your Purpose After 50", "The Anti-Anxiety Food Guide", "Oprah's Favorite Things 2026", "Building Healthier Relationships"],
  "Road & Track": ["We Drove the New Ferrari 296", "The 10 Best Sports Cars Under $60K", "Formula 1 2026 Season Preview", "EV Range Wars: Who Wins?", "The Art of the Manual Transmission"],
  "Car and Driver": ["2026 Car of the Year Winners", "Chevy vs Ford: Truck Showdown", "The Complete EV Buying Guide", "10 Cars to Watch at Geneva 2026", "Best Family SUVs: Full Rankings"],
  "Popular Mechanics": ["How NASA is Planning to Return to the Moon", "The Best Power Tools of 2026", "Understanding Quantum Computing", "Build a Solar Generator: Step-by-Step", "Military Tech That's Changing War"],
  "Town & Country": ["Inside the Royal Estate Sale of the Season", "The Best Hotels in the Maldives", "New York Society's Spring Galas", "The Timeless Art of Entertaining", "How the Ultra-Wealthy Travel"],
  "House Beautiful": ["30 Kitchen Renovations Under $15K", "The Color Trends Dominating 2026", "How to Make Small Spaces Feel Bigger", "Designer Living Rooms to Inspire You", "The Best Indoor Plants for Every Room"],
};

router.get("/editorial-calendar", (req: Request, res: Response) => {
  const { brand, lookback_days: lookbackStr, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 30, 100);
  const lookbackDays = parseInt(lookbackStr as string) || 14;
  const rng = seededRng(brand ? (brand as string).length * 331 : 7777);

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const entries = [];

  for (let i = 0; i < limit; i++) {
    const b = brandsToUse[Math.floor(rng() * brandsToUse.length)];
    const categories = CONTENT_CATEGORIES[b] || ["general"];
    const cat = categories[Math.floor(rng() * categories.length)];
    const daysFromNow = Math.floor(rng() * (lookbackDays * 2)) - lookbackDays;
    entries.push({
      entryId: `cal-${i}-${b.slice(0, 3)}`,
      brand: b,
      category: cat,
      title: `${b} — ${cat.replace(/-/g, " ")} feature`,
      scheduledDate: new Date(Date.now() + daysFromNow * 86400000).toISOString().split("T")[0],
      publishType: rng() > 0.6 ? "newsletter" : rng() > 0.3 ? "article" : "social",
      targetAudience: rng() > 0.5 ? "subscribers" : "all",
      priorityScore: Math.round(rng() * 100) / 100,
    });
  }

  res.json({ success: true, count: entries.length, entries });
});

router.get("/articles", (req: Request, res: Response) => {
  const { brand, category, email_sendable: emailSendableStr, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 50, 200);
  const onlyEmailSendable = emailSendableStr === "true";
  const rng = seededRng(brand ? (brand as string).charCodeAt(0) * 1009 : 6543);

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const articles = [];

  for (let i = 0; i < limit; i++) {
    const b = brandsToUse[Math.floor(rng() * brandsToUse.length)];
    const categories = CONTENT_CATEGORIES[b] || ["general"];
    const cat = category ? (category as string) : categories[Math.floor(rng() * categories.length)];
    const subjects = ARTICLE_SUBJECTS[b] || [`${b} Feature Article`];
    const subject = subjects[Math.floor(rng() * subjects.length)];
    const freshnessDays = Math.floor(rng() * 60);
    const freshnessScore = Math.max(0, 1 - freshnessDays / 60);
    const emailSendable = freshnessScore > 0.3 && rng() > 0.25;
    if (onlyEmailSendable && !emailSendable) continue;

    articles.push({
      articleId: `art-${b.slice(0, 3).toLowerCase()}-${i}`,
      brand: b,
      title: subject,
      category: cat,
      publishedDate: new Date(Date.now() - freshnessDays * 86400000).toISOString().split("T")[0],
      freshnessScore: Math.round(freshnessScore * 100) / 100,
      emailSendable,
      wordCount: Math.floor(rng() * 2000) + 400,
      readTimeMinutes: Math.ceil((Math.floor(rng() * 2000) + 400) / 250),
      topicTags: [cat, ...categories.slice(0, 2)].filter(Boolean),
      historicalCtr: Math.round((0.02 + rng() * 0.15) * 1000) / 1000,
      historicalOpenRate: Math.round((0.15 + rng() * 0.35) * 1000) / 1000,
      canonicalUrl: `https://www.${b.toLowerCase().replace(/[^a-z]/g, "")}.com/articles/${subject.toLowerCase().replace(/[^a-z]/g, "-").slice(0, 40)}`,
    });
  }

  res.json({ success: true, count: articles.length, articles });
});

router.get("/newsletter-archives", (req: Request, res: Response) => {
  const { brand, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 20, 60);
  const rng = seededRng(brand ? (brand as string).charCodeAt(1) * 787 : 2468);

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const newsletters = [];

  for (let i = 0; i < limit; i++) {
    const b = brandsToUse[Math.floor(rng() * brandsToUse.length)];
    const daysBack = Math.floor(rng() * 180) + 1;
    newsletters.push({
      newsletterId: `nl-${b.slice(0, 3).toLowerCase()}-${i}`,
      brand: b,
      subject: ARTICLE_SUBJECTS[b]?.[i % (ARTICLE_SUBJECTS[b]?.length || 1)] || `${b} Newsletter Edition`,
      sentDate: new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0],
      recipientCount: Math.floor(rng() * 500000) + 50000,
      openRate: Math.round((0.15 + rng() * 0.3) * 1000) / 1000,
      clickRate: Math.round((0.02 + rng() * 0.12) * 1000) / 1000,
      unsubscribeRate: Math.round(rng() * 0.005 * 1000) / 1000,
      revenueAttributed: Math.round((rng() * 15000 + 500) * 100) / 100,
      topArticleIds: [`art-${b.slice(0, 3).toLowerCase()}-${i}`, `art-${b.slice(0, 3).toLowerCase()}-${i + 1}`],
    });
  }

  res.json({ success: true, count: newsletters.length, newsletters });
});

router.get("/content-performance", (req: Request, res: Response) => {
  const { articleId, brand, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(limitStr as string) || 30, 100);
  const rng = seededRng(articleId ? (articleId as string).length * 2017 : 8765);

  const brandsToUse = brand ? [brand as string] : BRANDS;
  const records = [];

  for (let i = 0; i < limit; i++) {
    const b = brandsToUse[Math.floor(rng() * brandsToUse.length)];
    records.push({
      articleId: articleId || `art-${b.slice(0, 3).toLowerCase()}-${i}`,
      brand: b,
      performancePeriod: "last_30_days",
      opens: Math.floor(rng() * 80000) + 5000,
      clicks: Math.floor(rng() * 15000) + 500,
      ctr: Math.round((0.02 + rng() * 0.15) * 1000) / 1000,
      avgTimeOnPage: Math.floor(rng() * 300) + 45,
      scrollDepth: Math.round((0.3 + rng() * 0.6) * 100) / 100,
      conversionRate: Math.round(rng() * 0.035 * 1000) / 1000,
      revenueAttributed: Math.round((rng() * 8000 + 100) * 100) / 100,
      audienceSegments: {
        premium: Math.round((0.3 + rng() * 0.4) * 100) / 100,
        free: Math.round(rng() * 0.3 * 100) / 100,
        vip: Math.round(rng() * 0.2 * 100) / 100,
      },
      bestPerformingSegment: rng() > 0.5 ? "premium" : "vip",
    });
  }

  res.json({ success: true, count: records.length, performanceRecords: records });
});

export default router;
