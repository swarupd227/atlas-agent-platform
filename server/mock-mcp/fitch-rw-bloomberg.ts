import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const ISSUERS = [
  { id: "AAPL",  name: "Apple Inc.",                sector: "Technology",       rating: "AA+",  stress: 1.0 },
  { id: "BA",    name: "Boeing Co.",                 sector: "Aerospace",        rating: "BBB-", stress: 1.8 },
  { id: "F",     name: "Ford Motor Company",         sector: "Auto",             rating: "BB+",  stress: 1.6 },
  { id: "GE",    name: "GE Aerospace",               sector: "Industrials",      rating: "BBB+", stress: 1.2 },
  { id: "GM",    name: "General Motors",             sector: "Auto",             rating: "BBB",  stress: 1.4 },
  { id: "KHC",   name: "Kraft Heinz Co.",            sector: "Consumer Staples", rating: "BBB-", stress: 1.5 },
  { id: "LCII",  name: "LCI Industries",             sector: "Consumer Disc.",   rating: "BB",   stress: 1.7 },
  { id: "MPW",   name: "Medical Properties Trust",  sector: "REIT",             rating: "BB-",  stress: 2.1 },
  { id: "NCLH",  name: "Norwegian Cruise Line",      sector: "Leisure",          rating: "B+",   stress: 2.4 },
  { id: "T",     name: "AT&T Inc.",                  sector: "Telecom",          rating: "BBB-", stress: 1.3 },
];

function resolveIssuer(id: string | undefined): typeof ISSUERS {
  if (!id) return ISSUERS;
  const q = id.toLowerCase();
  const match = ISSUERS.filter(i => i.id.toLowerCase() === q || i.name.toLowerCase().includes(q));
  return match.length ? match : ISSUERS;
}

const TRADE_DATES = ["2025-10-01","2025-11-01","2025-12-01","2026-01-01","2026-02-01","2026-03-01","2026-04-01","2026-04-13"];

// GET /cds-spreads — 5-year CDS spread time series + current level + 30-day change
router.get("/cds-spreads", (req: Request, res: Response) => {
  const issuers = resolveIssuer(req.query.issuer_id as string | undefined);
  const tenor = (req.query.tenor as string) || "5Y";

  const data = issuers.map(issuer => {
    const iIdx = ISSUERS.findIndex(i => i.id === issuer.id);
    const baseSpread = 30 + issuer.stress * 80;
    const series = TRADE_DATES.map((date, di) => {
      const rng = seededRng(iIdx * 500 + di * 13);
      const trend = di >= 5 ? (issuer.stress - 1) * 25 * (di - 4) : 0;
      const spread = +(baseSpread + trend + (rng() - 0.4) * 20).toFixed(1);
      return { date, spread_bps: spread };
    });
    const current = series[series.length - 1].spread_bps;
    const prior30d = series[series.length - 2].spread_bps;
    const delta30d = +(current - prior30d).toFixed(1);
    const signal = delta30d > 15 ? "WIDENING_ALERT" : delta30d > 5 ? "WIDENING" : delta30d < -5 ? "TIGHTENING" : "STABLE";

    return {
      issuer_id: issuer.id,
      issuer_name: issuer.name,
      sector: issuer.sector,
      current_rating: issuer.rating,
      tenor,
      current_spread_bps: current,
      delta_30d_bps: delta30d,
      signal,
      series,
    };
  });

  res.json({ data, count: data.length, tenor, generated_at: new Date().toISOString() });
});

// GET /equity-prices — price, volume, beta, 52-week range, implied vol
router.get("/equity-prices", (req: Request, res: Response) => {
  const issuers = resolveIssuer(req.query.issuer_id as string | undefined);

  const data = issuers.map(issuer => {
    const iIdx = ISSUERS.findIndex(i => i.id === issuer.id);
    const rng = seededRng(iIdx * 777 + 42);
    const basePrice = 20 + rng() * 280;
    const beta = +(0.6 + issuer.stress * 0.4 + rng() * 0.3).toFixed(2);
    const weekHigh = +(basePrice * (1.1 + rng() * 0.2)).toFixed(2);
    const weekLow  = +(basePrice * (0.7 - (issuer.stress - 1) * 0.15)).toFixed(2);
    const currentPrice = +(weekLow + rng() * (weekHigh - weekLow)).toFixed(2);
    const impliedVol = +(15 + issuer.stress * 12 + rng() * 8).toFixed(1);
    const volume = Math.floor(1_000_000 + rng() * 50_000_000);
    const avgVolume = Math.floor(volume * (0.8 + rng() * 0.4));
    const relativeVolumeRatio = +(volume / avgVolume).toFixed(2);
    const priceToBook = +(0.8 + rng() * 4).toFixed(2);
    const signal = currentPrice < weekLow * 1.05 ? "NEAR_52W_LOW" : impliedVol > 40 ? "HIGH_VOL" : "NORMAL";

    return {
      issuer_id: issuer.id,
      issuer_name: issuer.name,
      sector: issuer.sector,
      current_price: currentPrice,
      week_52_high: weekHigh,
      week_52_low: weekLow,
      pct_from_52w_low: +(((currentPrice - weekLow) / weekLow) * 100).toFixed(1),
      implied_vol_pct: impliedVol,
      beta,
      volume_today: volume,
      avg_daily_volume: avgVolume,
      relative_volume: relativeVolumeRatio,
      price_to_book: priceToBook,
      signal,
    };
  });

  res.json({ data, count: data.length, as_of: new Date().toISOString() });
});

// GET /news-sentiment — aggregated news sentiment score and top headlines
router.get("/news-sentiment", (req: Request, res: Response) => {
  const issuers = resolveIssuer(req.query.issuer_id as string | undefined);
  const daysBack = parseInt((req.query.days_back as string) || "30", 10);

  const HEADLINE_TEMPLATES = [
    (name: string) => `${name} CFO flags refinancing risk at investor day`,
    (name: string) => `S&P places ${name} on CreditWatch Negative citing leverage`,
    (name: string) => `${name} Q1 earnings miss; free cash flow turns negative`,
    (name: string) => `Moody's downgrades ${name} to speculative grade`,
    (name: string) => `${name} secures $2B revolving credit facility`,
    (name: string) => `${name} reports record EBITDA margin improvement`,
    (name: string) => `${name} to divest non-core assets, accelerates deleveraging`,
    (name: string) => `${name} management buyback signals confidence, tightens spreads`,
  ];

  const data = issuers.map(issuer => {
    const iIdx = ISSUERS.findIndex(i => i.id === issuer.id);
    const rng = seededRng(iIdx * 999 + daysBack);
    const sentimentScore = +((1 - issuer.stress * 0.3) * 0.8 + (rng() - 0.3) * 0.4).toFixed(3);
    const articleCount = Math.floor(5 + rng() * 45);
    const negativeCount = Math.floor(articleCount * (issuer.stress - 0.8) * 0.5);
    const positiveCount = Math.floor(articleCount * Math.max(0, 1 - issuer.stress * 0.4));
    const neutralCount = articleCount - negativeCount - positiveCount;

    const stdDevSpike = issuer.stress > 1.5 && rng() > 0.5;
    const topHeadlines = [0, 1, 2].map(hi => {
      const template = HEADLINE_TEMPLATES[(iIdx + hi) % HEADLINE_TEMPLATES.length];
      const sentiment = hi === 0 && issuer.stress > 1.5 ? "negative" : hi === 2 && issuer.stress < 1.3 ? "positive" : "neutral";
      return {
        headline: template(issuer.name),
        sentiment,
        date: new Date(Date.now() - (hi * 4 + Math.floor(rng() * 5)) * 86400000).toISOString().split("T")[0],
        source: ["Reuters","Bloomberg","WSJ","FT","Barron's"][iIdx % 5],
      };
    });

    const signal = sentimentScore < -0.15 ? "NEGATIVE_ALERT" : sentimentScore < 0 ? "CAUTIOUS" : "NEUTRAL_POSITIVE";

    return {
      issuer_id: issuer.id,
      issuer_name: issuer.name,
      sector: issuer.sector,
      lookback_days: daysBack,
      sentiment_score: sentimentScore,
      article_count: articleCount,
      negative_count: negativeCount,
      positive_count: positiveCount,
      neutral_count: neutralCount,
      sigma_spike_detected: stdDevSpike,
      sigma_multiple: stdDevSpike ? +(2.5 + rng() * 2).toFixed(1) : null,
      signal,
      top_headlines: topHeadlines,
    };
  });

  res.json({ data, count: data.length, lookback_days: daysBack });
});

// GET /credit-watch-signals — aggregate rating watch signals across all data types
router.get("/credit-watch-signals", (req: Request, res: Response) => {
  const issuers = resolveIssuer(req.query.issuer_id as string | undefined);

  const data = issuers.map(issuer => {
    const iIdx = ISSUERS.findIndex(i => i.id === issuer.id);
    const rng = seededRng(iIdx * 1234 + 7);
    const cdsDelta = +(issuer.stress * 20 - 10 + (rng() - 0.3) * 15).toFixed(1);
    const equityDecline = +(-(issuer.stress - 1) * 18 - rng() * 5).toFixed(1);
    const sentimentScore = +((1 - issuer.stress * 0.3) + (rng() - 0.4) * 0.2).toFixed(2);
    const compositeScore = +(cdsDelta * 0.4 + (-equityDecline) * 0.3 + (-sentimentScore * 30) * 0.3).toFixed(1);
    const watchSignal = compositeScore > 25 ? "WATCH_NEGATIVE" : compositeScore > 12 ? "ELEVATED" : "STABLE";

    return {
      issuer_id: issuer.id,
      issuer_name: issuer.name,
      sector: issuer.sector,
      current_rating: issuer.rating,
      composite_watch_score: compositeScore,
      watch_signal: watchSignal,
      inputs: {
        cds_30d_widening_bps: cdsDelta,
        equity_30d_pct: equityDecline,
        news_sentiment_score: sentimentScore,
      },
      triggered_at: watchSignal !== "STABLE" ? new Date().toISOString() : null,
    };
  });

  const alertCount = data.filter(d => d.watch_signal === "WATCH_NEGATIVE").length;
  res.json({ data, count: data.length, alert_count: alertCount, generated_at: new Date().toISOString() });
});

export default router;
