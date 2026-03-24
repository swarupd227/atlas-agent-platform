import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const BANK_NAMES: Record<string, string> = {
  "RSSD-3511777": "Silicon Valley Bank",
  "RSSD-1029867": "Pacific Western Bank",
  "RSSD-1462895": "Signature Bank",
  "RSSD-3232316": "First National Community Bancorp",
  "RSSD-2928050": "Heartland Financial",
};

const EARNINGS_CALL_EXCERPTS: Record<string, string[]> = {
  "RSSD-3511777": [
    "Our HTM securities portfolio now represents 56% of total assets, primarily in longer-duration MBS and Treasuries. Rising rates have created meaningful unrealized losses that, while GAAP OCI, do affect tangible book value.",
    "We are seeing elevated deposit outflows from our venture-backed client segment. We remain well-capitalized and have taken steps to shore up liquidity through FHLB advances.",
    "The pace of VC investment has slowed, affecting client deposit behavior. We're diversifying our funding base and reducing reliance on wholesale markets.",
  ],
  "RSSD-1029867": [
    "Deposit costs have risen materially as we compete with higher-yielding alternatives. Our loan-to-deposit ratio is approaching 90%, limiting our flexibility.",
    "CRE office exposure represents 28% of our loan portfolio. We are conducting stress tests on our office properties given remote work trends.",
    "We've seen some credit migration in our construction book, with two loans downgraded to substandard. We've increased reserves accordingly.",
  ],
  "RSSD-1462895": [
    "Crypto-adjacent deposit accounts now represent approximately 20% of total deposits, introducing concentration risk in this customer segment.",
    "We have actively managed interest rate risk through swaps and caps on the asset side of the balance sheet.",
    "NYCB's recent comments on multifamily loan performance are consistent with our observation of increased stress in that segment.",
  ],
  "RSSD-3232316": [
    "Net interest margin has compressed by 18 basis points quarter-over-quarter as deposit costs continue to reprice.",
    "Our CRE portfolio is performing well. LTV ratios average 58% across the book with minimal past-due exposure.",
    "We grew our capital ratios this quarter through retained earnings and a modest common equity issuance.",
  ],
};

const FILING_RISK_PHRASES = [
  "concentration risk", "credit deterioration", "rising deposit costs", "unrealized losses",
  "CRE exposure", "liquidity pressure", "office portfolio stress", "interest rate risk",
  "wholesale funding dependence", "regulatory scrutiny", "loan loss provision",
];

const POSITIVE_PHRASES = [
  "well-capitalized", "strong loan performance", "diversified revenue", "capital accretion",
  "stable deposit base", "improving efficiency ratio", "robust credit quality",
  "disciplined underwriting", "credit reserve build", "solid core deposit franchise",
];

router.get("/earnings-call-transcripts", (req: Request, res: Response) => {
  const { bank_id, quarter, sentiment_filter } = req.query;
  const bankName = BANK_NAMES[bank_id as string] || "Community Bank";
  const rng = seededRng((bank_id as string || "").length * 53 + 7777);

  const quarters = quarter ? [quarter as string] : ["2023-Q3","2023-Q4","2024-Q1","2024-Q2","2024-Q3","2024-Q4"];
  const excerpts = EARNINGS_CALL_EXCERPTS[bank_id as string] || [
    "Loan growth moderated this quarter as we remained disciplined on pricing and structure.",
    "Credit quality metrics are stable. Our allowance coverage ratio is within our target range.",
    "We are closely monitoring our CRE exposure given industry-wide headwinds.",
  ];

  const transcripts = quarters.slice(0, 4).map((q, i) => {
    const sentimentScore = +(-0.3 + rng() * 0.8).toFixed(3);
    const sentiment = sentimentScore > 0.2 ? "positive" : sentimentScore > -0.1 ? "neutral" : "negative";

    if (sentiment_filter && sentiment !== sentiment_filter) return null;

    const riskPhrases = FILING_RISK_PHRASES.filter(() => rng() > 0.6).slice(0, 4);
    const positivePhrases = POSITIVE_PHRASES.filter(() => rng() > 0.6).slice(0, 3);

    return {
      bank_id,
      bank_name: bankName,
      quarter: q,
      event_type: "earnings_call",
      sentiment_score: sentimentScore,
      sentiment_label: sentiment,
      speaker_excerpt: excerpts[i % excerpts.length],
      risk_phrases_detected: riskPhrases,
      positive_phrases_detected: positivePhrases,
      management_tone: sentimentScore > 0.1 ? "confident" : sentimentScore > -0.15 ? "cautious" : "defensive",
      analyst_questions_negative: Math.floor(rng() * 6),
      analyst_questions_total: Math.floor(rng() * 5) + 5,
      forward_guidance: rng() > 0.5 ? "maintained" : "lowered",
      word_count: Math.floor(rng() * 3000) + 5000,
      source: "Refinitiv StreetEvents",
    };
  }).filter(Boolean);

  res.json({
    status: "ok",
    bank_id,
    transcript_count: transcripts.length,
    avg_sentiment: +((transcripts as any[]).reduce((s, t) => s + t.sentiment_score, 0) / (transcripts.length || 1)).toFixed(3),
    transcripts,
  });
});

router.get("/sec-filings", (req: Request, res: Response) => {
  const { bank_id, filing_type, flag_filter } = req.query;
  const bankName = BANK_NAMES[bank_id as string] || "Community Bank";
  const rng = seededRng((bank_id as string || "").length * 37 + 4444);

  const filingTypes = filing_type ? [filing_type as string] : ["10-K","10-Q","8-K"];
  const filings: any[] = [];

  for (const ft of filingTypes) {
    const count = ft === "10-K" ? 2 : ft === "10-Q" ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const riskDisclosures: string[] = [];
      const flags: string[] = [];

      if (rng() > 0.5) { riskDisclosures.push("Interest rate risk may adversely affect net interest income and the fair value of our securities portfolio."); flags.push("interest_rate_risk"); }
      if (rng() > 0.6) { riskDisclosures.push("Our commercial real estate portfolio is subject to deterioration in property values and tenant credit quality."); flags.push("cre_concentration"); }
      if (rng() > 0.7) { riskDisclosures.push("We have identified material weakness related to internal controls over financial reporting."); flags.push("material_weakness"); }
      if (rng() > 0.65) { riskDisclosures.push("Deposit outflows could require us to liquidate securities at a loss."); flags.push("liquidity_risk"); }

      const flagged = flag_filter ? flags.includes(flag_filter as string) : true;
      if (!flagged && flag_filter) continue;

      filings.push({
        bank_id,
        bank_name: bankName,
        filing_type: ft,
        period: `${2023 + Math.floor(rng() * 2)}-Q${Math.ceil(rng() * 4)}`,
        filing_date: `${2023 + Math.floor(rng() * 2)}-${String(Math.ceil(rng() * 12)).padStart(2,"0")}-15`,
        risk_disclosures: riskDisclosures,
        risk_flags: flags,
        new_risk_language: rng() > 0.6,
        auditor_going_concern: rng() > 0.9,
        restatement: rng() > 0.95,
        sec_comment_letter_open: rng() > 0.85,
        sentiment_score: +(-0.4 + rng() * 0.7).toFixed(3),
        source: "SEC EDGAR",
        accession: `0001564590-${Math.floor(rng() * 99999999).toString().padStart(8,"0")}-${Math.floor(rng() * 99999)}`,
      });
    }
  }

  res.json({
    status: "ok",
    bank_id,
    filing_count: filings.length,
    material_weakness_count: filings.filter(f => f.risk_flags.includes("material_weakness")).length,
    filings,
  });
});

router.get("/news-sentiment", (req: Request, res: Response) => {
  const { bank_id, days_back: daysStr, min_relevance } = req.query;
  const bankName = BANK_NAMES[bank_id as string] || "Community Bank";
  const rng = seededRng((bank_id as string || "").length * 19 + 2222);
  const daysBack = parseInt(daysStr as string) || 30;
  const minRelevance = parseFloat(min_relevance as string) || 0;

  const headlines = [
    { title: `${bankName} Reports Q4 Earnings Beat, NIM Compression Continues`, sentiment: -0.12 },
    { title: `${bankName} Increases Loan Loss Reserves Amid Office Market Pressure`, sentiment: -0.42 },
    { title: `Regulators Scrutinize CRE Concentrations at Mid-Size Banks Including ${bankName}`, sentiment: -0.55 },
    { title: `${bankName} CEO Comments on Deposit Stability at Banking Conference`, sentiment: 0.18 },
    { title: `${bankName} Prices $200M Subordinated Notes to Bolster Capital Buffer`, sentiment: 0.05 },
    { title: `FDIC Publishes Problem Bank List; Regional Banks Face Increased Scrutiny`, sentiment: -0.48 },
    { title: `${bankName} Expands C&I Portfolio, Reduces Reliance on CRE`, sentiment: 0.25 },
    { title: `Banking Sector Stress: Analysts Downgrade ${bankName} on Asset Quality Concerns`, sentiment: -0.62 },
  ];

  const now = Date.now();
  const articles = headlines.map((h, i) => {
    const relevance = +(0.5 + rng() * 0.5).toFixed(2);
    if (relevance < minRelevance) return null;
    const daysAgo = Math.floor(rng() * daysBack);
    return {
      bank_id,
      bank_name: bankName,
      headline: h.title,
      published_at: new Date(now - daysAgo * 86400000).toISOString().split("T")[0],
      source: ["Wall Street Journal","Bloomberg","Reuters","American Banker","SNL Financial"][Math.floor(rng() * 5)],
      sentiment_score: +(h.sentiment + (rng() - 0.5) * 0.15).toFixed(3),
      relevance_score: relevance,
      topics_detected: ["CRE","capital","liquidity","credit quality","NIM","deposits"].filter(() => rng() > 0.5),
      event_type: i % 3 === 0 ? "earnings" : i % 3 === 1 ? "regulatory" : "market_event",
      impact_level: Math.abs(h.sentiment) > 0.4 ? "high" : Math.abs(h.sentiment) > 0.2 ? "medium" : "low",
    };
  }).filter(Boolean);

  const avgSentiment = +((articles as any[]).reduce((s, a) => s + a.sentiment_score, 0) / (articles.length || 1)).toFixed(3);

  res.json({
    status: "ok",
    bank_id,
    period_days: daysBack,
    article_count: articles.length,
    avg_sentiment: avgSentiment,
    negative_articles: (articles as any[]).filter(a => a.sentiment_score < -0.2).length,
    positive_articles: (articles as any[]).filter(a => a.sentiment_score > 0.2).length,
    articles,
  });
});

export default router;
