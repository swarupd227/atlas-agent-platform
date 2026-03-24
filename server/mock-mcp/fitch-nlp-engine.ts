import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const BANKS = [
  { id: "RSSD-0000001", name: "JPMorgan Chase"   },
  { id: "RSSD-0000002", name: "Bank of America"  },
  { id: "RSSD-0000003", name: "Wells Fargo"      },
  { id: "RSSD-0000004", name: "Citigroup"        },
  { id: "RSSD-0000005", name: "Goldman Sachs"    },
  { id: "RSSD-0000006", name: "Morgan Stanley"   },
  { id: "RSSD-0000007", name: "U.S. Bancorp"     },
  { id: "RSSD-0000008", name: "Truist Financial" },
  { id: "RSSD-0000009", name: "PNC Financial"    },
  { id: "RSSD-0000010", name: "RegionalBank-West"},
];

function stressMultiplier(idx: number): number {
  if (idx === 9) return 2.2;
  if (idx === 7) return 1.5;
  if (idx === 8) return 1.3;
  return 0.7 + idx * 0.05;
}

// GET /transcript-sentiment
router.get("/transcript-sentiment", (req: Request, res: Response) => {
  const { bank_id, quarter } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const q = (quarter as string) || "2024-Q2";

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const sm = stressMultiplier(bIdx);
    const rng = seededRng(bIdx * 901 + q.charCodeAt(5));
    const base = -0.3 - (sm - 1) * 0.8;
    return {
      bank_id: bank.id,
      bank_name: bank.name,
      quarter: q,
      sentiment: {
        credit_quality:   +Math.max(-2, Math.min(2, base + rng() * 0.6 - 0.3)).toFixed(2),
        forward_guidance: +Math.max(-2, Math.min(2, base + rng() * 0.8 - 0.4)).toFixed(2),
        sector_concerns:  +Math.max(-2, Math.min(2, base * 1.2 + rng() * 0.5 - 0.25)).toFixed(2),
        composite:        +Math.max(-2, Math.min(2, base * 1.1 + rng() * 0.4 - 0.2)).toFixed(2),
      },
      tone_classification: sm > 1.8 ? "Defensive" : sm > 1.2 ? "Cautious" : "Constructive",
      flagged_phrases: sm > 1.5 ? ["deposit outflows", "unrealized losses", "liquidity pressure"] :
                       sm > 1.1 ? ["margin compression", "credit normalization"] : [],
    };
  });

  res.json({ data, count: data.length, quarter: q });
});

// GET /filing-language-changes
router.get("/filing-language-changes", (req: Request, res: Response) => {
  const { bank_id, filing_year } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const year = (filing_year as string) || "2024";

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const sm = stressMultiplier(bIdx);
    const rng = seededRng(bIdx * 444 + parseInt(year));
    return {
      bank_id: bank.id,
      bank_name: bank.name,
      filing_year: year,
      new_risk_factors: Math.round(sm * (1 + rng() * 4)),
      strengthened_language_count: Math.round(sm * (2 + rng() * 6)),
      mda_sentiment_shift: +(-0.1 * sm + rng() * 0.15 - 0.075).toFixed(3),
      new_topics: sm > 1.5 ? ["deposit concentration", "HTM portfolio", "interest rate exposure"] :
                  sm > 1.1 ? ["credit normalization", "margin pressure"] : ["operational resilience"],
      material_weakness_flag: sm > 2.0,
      going_concern_language: sm > 2.1,
    };
  });

  res.json({ data, count: data.length });
});

// GET /news-signals
router.get("/news-signals", (req: Request, res: Response) => {
  const { bank_id, days_back } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const days = parseInt(days_back as string) || 90;

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const sm = stressMultiplier(bIdx);
    const rng = seededRng(bIdx * 211 + days);
    const total = Math.round(20 + rng() * 180);
    const crisisCount = sm > 2 ? Math.round(total * 0.15) : 0;
    const materialCount = Math.round(total * 0.08 * sm);
    const emergingCount = Math.round(total * 0.15 * (sm > 1.2 ? sm : 1));
    return {
      bank_id: bank.id,
      bank_name: bank.name,
      days_covered: days,
      article_count: total,
      classifications: {
        routine:  Math.max(0, total - crisisCount - materialCount - emergingCount),
        emerging: Math.max(0, emergingCount),
        material: Math.max(0, materialCount),
        crisis:   Math.max(0, crisisCount),
      },
      overall_classification: sm > 2 ? "crisis" : sm > 1.6 ? "material" : sm > 1.2 ? "emerging" : "routine",
      top_topics: sm > 1.5 ? ["regulatory scrutiny", "deposit flight", "liquidity"] :
                  sm > 1.1 ? ["margin pressure", "credit quality"] : ["strategy", "earnings"],
      sigma_spike: +(sm * (0.5 + rng() * 2)).toFixed(2),
    };
  });

  res.json({ data, count: data.length });
});

// GET /news-volume-trend — rolling 13-week volume + σ-deviation per bank
router.get("/news-volume-trend", (req: Request, res: Response) => {
  const { bank_id } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const sm = stressMultiplier(bIdx);
    const rng = seededRng(bIdx * 155);
    const baseVol = Math.round(15 + rng() * 40);

    const weeks: any[] = [];
    let prevVol = baseVol;
    for (let w = 13; w >= 1; w--) {
      const rngW = seededRng(bIdx * 155 + w * 17);
      const spike = w <= 3 && sm > 1.5 ? sm * 1.8 : 1;
      const vol = Math.round(prevVol * (0.85 + rngW() * 0.3) * spike);
      weeks.push({ week_offset: -w, article_count: vol, sigma_deviation: +((vol / baseVol - 1) / 0.3).toFixed(2) });
      prevVol = vol;
    }

    return {
      bank_id: bank.id,
      bank_name: bank.name,
      baseline_weekly_volume: baseVol,
      current_week_volume: weeks[12].article_count,
      current_sigma: weeks[12].sigma_deviation,
      sigma_alert: Math.abs(weeks[12].sigma_deviation) > 2.0,
      trend: weeks,
    };
  });

  res.json({ data, count: data.length });
});

export default router;
