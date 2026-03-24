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

// GET /report-template — assessment package structure scaffold
router.get("/report-template", (_req: Request, res: Response) => {
  res.json({
    template_id: "AQEWS-QUARTERLY-V3",
    version: "3.1",
    sections: [
      { id: "exec_summary",    title: "Executive Summary",             required: true  },
      { id: "composite_score", title: "Composite Risk Score Overview", required: true  },
      { id: "ratio_analysis",  title: "18-Ratio Deep-Dive Analysis",   required: true  },
      { id: "nlp_signals",     title: "NLP & Market Signal Panel",     required: true  },
      { id: "peer_benchmarks", title: "G-SIB Peer Benchmarking",       required: true  },
      { id: "svb_comparison",  title: "SVB Backtesting Comparison",    required: false },
      { id: "watch_list",      title: "Watch List & Action Items",     required: true  },
      { id: "analyst_note",    title: "Analyst Recommendation",        required: true  },
    ],
    metadata: {
      framework: "CAMELS",
      data_sources: ["FFIEC Call Reports", "SEC EDGAR", "Bloomberg NLP", "Earnings Transcripts"],
      scoring_model: "AQEWS-v3 (55% quantitative / 45% qualitative)",
    },
  });
});

// GET /analyst-notes — prior quarter analyst observations per bank
router.get("/analyst-notes", (req: Request, res: Response) => {
  const { bank_id } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;

  const noteTemplates = [
    (name: string, score: number) =>
      `${name} continues to show resilient asset quality metrics. CET1 remains above peer median. Monitor CRE concentration as a secondary risk factor. Score: ${score}/100. Action: Active Monitor.`,
    (name: string, score: number) =>
      `${name} exhibits deteriorating NPA trajectory. Loan deposit ratio above G-SIB cohort median. NLP signals show increasing management caution language. Score: ${score}/100. Action: Watch.`,
    (name: string, score: number) =>
      `${name} flagged for elevated charge-off rate and MD&A sentiment shift. Three new risk factors identified in annual filing. Recommend Immediate Review. Score: ${score}/100. Action: Immediate Review.`,
  ];

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const rng = seededRng(bIdx * 731);
    const stress = bIdx >= 8 ? 2 : bIdx >= 6 ? 1 : 0;
    const baseScore = [35, 48, 61][stress];
    const score = Math.round(baseScore + rng() * 10 - 5);
    return {
      bank_id: bank.id,
      bank_name: bank.name,
      prior_quarter: "2024-Q1",
      note: noteTemplates[stress](bank.name, score),
      prior_score: score,
      action_flag: ["Active Monitor", "Watch", "Immediate Review"][stress],
    };
  });

  res.json({ data, count: data.length });
});

// GET /rating-history — last 8 quarters of Fitch Viability Rating actions
router.get("/rating-history", (req: Request, res: Response) => {
  const { bank_id } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const quarters = ["2022-Q3","2022-Q4","2023-Q1","2023-Q2","2023-Q3","2023-Q4","2024-Q1","2024-Q2"];

  const ratingScale = ["aaa","aa+","aa","aa-","a+","a","a-","bbb+","bbb","bbb-","bb+","bb","bb-"];

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const baseRating = [2, 3, 3, 4, 2, 3, 6, 7, 6, 9][bIdx] ?? 5;
    const rng = seededRng(bIdx * 501);

    const history = quarters.map((q, qi) => {
      const drift = bIdx >= 8 ? Math.floor(qi * 0.5) : 0;
      const ratingIdx = Math.min(ratingScale.length - 1, baseRating + drift + (rng() > 0.9 ? 1 : 0));
      const action = qi > 0 && ratingIdx > baseRating + drift - 1 && bIdx >= 7 && qi >= 4
        ? "Negative Watch" : qi === 0 ? "Affirmation" : "Stable";
      return { quarter: q, viability_rating: ratingScale[ratingIdx], rating_action: action };
    });

    return { bank_id: bank.id, bank_name: bank.name, history };
  });

  res.json({ data, count: data.length });
});

export default router;
