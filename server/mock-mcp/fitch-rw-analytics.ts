import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const RATING_UNIVERSE = [
  { id: "AAPL",  name: "Apple Inc.",               sector: "Technology",       rating: "AA+",  stress: 1.0, net_debt_ebitda: 0.8,  ebit_coverage: 28.0, fcf_debt: 32.0 },
  { id: "BA",    name: "Boeing Co.",                sector: "Aerospace",        rating: "BBB-", stress: 1.8, net_debt_ebitda: 4.2,  ebit_coverage: 2.1,  fcf_debt: 3.2  },
  { id: "F",     name: "Ford Motor Company",        sector: "Auto",             rating: "BB+",  stress: 1.6, net_debt_ebitda: 3.4,  ebit_coverage: 3.5,  fcf_debt: 6.1  },
  { id: "GE",    name: "GE Aerospace",              sector: "Industrials",      rating: "BBB+", stress: 1.2, net_debt_ebitda: 1.8,  ebit_coverage: 9.2,  fcf_debt: 14.3 },
  { id: "GM",    name: "General Motors",            sector: "Auto",             rating: "BBB",  stress: 1.4, net_debt_ebitda: 2.6,  ebit_coverage: 5.4,  fcf_debt: 9.0  },
  { id: "KHC",   name: "Kraft Heinz Co.",           sector: "Consumer Staples", rating: "BBB-", stress: 1.5, net_debt_ebitda: 3.8,  ebit_coverage: 3.1,  fcf_debt: 5.4  },
  { id: "LCII",  name: "LCI Industries",            sector: "Consumer Disc.",   rating: "BB",   stress: 1.7, net_debt_ebitda: 3.9,  ebit_coverage: 2.8,  fcf_debt: 4.5  },
  { id: "MPW",   name: "Medical Properties Trust",  sector: "REIT",             rating: "BB-",  stress: 2.1, net_debt_ebitda: 7.1,  ebit_coverage: 1.6,  fcf_debt: 1.2  },
  { id: "NCLH",  name: "Norwegian Cruise Line",     sector: "Leisure",          rating: "B+",   stress: 2.4, net_debt_ebitda: 9.8,  ebit_coverage: 1.1,  fcf_debt: -1.8 },
  { id: "T",     name: "AT&T Inc.",                 sector: "Telecom",          rating: "BBB-", stress: 1.3, net_debt_ebitda: 3.1,  ebit_coverage: 4.2,  fcf_debt: 7.3  },
];

// Rating notch ordering for relative positioning
const RATING_ORDER = ["AAA","AA+","AA","AA-","A+","A","A-","BBB+","BBB","BBB-","BB+","BB","BB-","B+","B","B-","CCC+","CCC","CC","C","D"];

function ratingNotch(r: string): number { return RATING_ORDER.indexOf(r); }

function resolveIssuer(id: string | undefined) {
  if (!id) return null;
  const q = id.toLowerCase();
  return RATING_UNIVERSE.find(i => i.id.toLowerCase() === q || i.name.toLowerCase().includes(q)) || null;
}

// GET /peer-cohort — select peer group for a given issuer by sector + rating band
router.get("/peer-cohort", (req: Request, res: Response) => {
  const issuerQ   = req.query.issuer_id as string | undefined;
  const sectorQ   = req.query.sector as string | undefined;
  const ratingQ   = req.query.rating as string | undefined;

  let anchor = resolveIssuer(issuerQ);

  const targetSector  = sectorQ || anchor?.sector;
  const targetRatingN = ratingQ ? ratingNotch(ratingQ) : (anchor ? ratingNotch(anchor.rating) : 8);

  const peers = RATING_UNIVERSE.filter(i => {
    const notchDiff = Math.abs(ratingNotch(i.rating) - targetRatingN);
    const sectorMatch = !targetSector || i.sector.toLowerCase() === targetSector.toLowerCase();
    const crossSector  = !sectorMatch && notchDiff <= 2;
    return (sectorMatch || crossSector) && notchDiff <= 4 && (!anchor || i.id !== anchor.id);
  }).slice(0, 8);

  res.json({
    anchor_issuer: anchor ? { id: anchor.id, name: anchor.name, rating: anchor.rating, sector: anchor.sector } : null,
    cohort_size:   peers.length,
    methodology:   "Fitch Rating Watch — Peer Selection v3.1 (sector-first, ±2 notch cross-sector fallback)",
    peers: peers.map(p => ({
      issuer_id:   p.id,
      issuer_name: p.name,
      sector:      p.sector,
      rating:      p.rating,
      notch_diff:  Math.abs(ratingNotch(p.rating) - ratingNotch(anchor?.rating || "BBB")),
    })),
  });
});

// GET /ratio-benchmarks — median / quartile benchmarks for a cohort
router.get("/ratio-benchmarks", (req: Request, res: Response) => {
  const issuerQ   = req.query.issuer_id as string | undefined;
  const peerIdsQ  = req.query.peer_ids as string | undefined;

  const anchor = resolveIssuer(issuerQ);
  const peerIds = peerIdsQ ? peerIdsQ.split(",").map(s => s.trim()) : [];
  const cohort  = peerIds.length > 0
    ? RATING_UNIVERSE.filter(i => peerIds.includes(i.id))
    : RATING_UNIVERSE.filter(i => !anchor || i.id !== anchor.id).slice(0, 6);

  function quartile(vals: number[], q: 0.25 | 0.5 | 0.75) {
    const sorted = [...vals].sort((a, b) => a - b);
    const pos    = (sorted.length - 1) * q;
    const lower  = Math.floor(pos);
    const frac   = pos - lower;
    return +(sorted[lower] + frac * (sorted[lower + 1] - sorted[lower])).toFixed(2);
  }

  const RATIO_KEYS: { key: keyof typeof RATING_UNIVERSE[0]; label: string; higherIsWorse: boolean }[] = [
    { key: "net_debt_ebitda", label: "Net Debt / EBITDA",    higherIsWorse: true  },
    { key: "ebit_coverage",   label: "EBIT Interest Cover",  higherIsWorse: false },
    { key: "fcf_debt",        label: "FCF / Gross Debt (%)", higherIsWorse: false },
  ];

  const benchmarks = RATIO_KEYS.map(rk => {
    const vals  = cohort.map(p => p[rk.key] as number);
    const p25   = quartile(vals, 0.25);
    const p50   = quartile(vals, 0.5);
    const p75   = quartile(vals, 0.75);
    const anchorVal = anchor ? +(anchor[rk.key] as number).toFixed(2) : null;
    const relPos = anchorVal != null
      ? (rk.higherIsWorse
        ? (anchorVal > p75 ? "WEAK" : anchorVal > p50 ? "BELOW_MEDIAN" : anchorVal > p25 ? "ABOVE_MEDIAN" : "STRONG")
        : (anchorVal < p25 ? "WEAK" : anchorVal < p50 ? "BELOW_MEDIAN" : anchorVal < p75 ? "ABOVE_MEDIAN" : "STRONG"))
      : null;

    return {
      ratio_key:        rk.key,
      label:            rk.label,
      higher_is_worse:  rk.higherIsWorse,
      cohort_p25:       p25,
      cohort_median:    p50,
      cohort_p75:       p75,
      anchor_value:     anchorVal,
      relative_position: relPos,
    };
  });

  res.json({
    anchor_issuer: anchor ? { id: anchor.id, name: anchor.name, rating: anchor.rating } : null,
    cohort_size:   cohort.length,
    benchmarks,
    cohort_members: cohort.map(p => ({ id: p.id, name: p.name, rating: p.rating })),
  });
});

// GET /rating-distribution — distribution of ratings within a cohort
router.get("/rating-distribution", (req: Request, res: Response) => {
  const sectorQ  = req.query.sector as string | undefined;
  const cohort   = sectorQ
    ? RATING_UNIVERSE.filter(i => i.sector.toLowerCase() === sectorQ.toLowerCase())
    : RATING_UNIVERSE;

  const dist: Record<string, number> = {};
  for (const i of cohort) {
    dist[i.rating] = (dist[i.rating] || 0) + 1;
  }

  const sorted = Object.entries(dist)
    .sort(([a], [b]) => ratingNotch(a) - ratingNotch(b))
    .map(([rating, count]) => ({ rating, count, pct: +((count / cohort.length) * 100).toFixed(1) }));

  const igCount = cohort.filter(i => ratingNotch(i.rating) <= ratingNotch("BBB-")).length;
  const hyCound = cohort.length - igCount;

  res.json({
    sector:        sectorQ || "all",
    cohort_size:   cohort.length,
    ig_count:      igCount,
    hy_count:      hyCound,
    ig_pct:        +((igCount / cohort.length) * 100).toFixed(1),
    hy_pct:        +((hyCound / cohort.length) * 100).toFixed(1),
    distribution:  sorted,
  });
});

// GET /relative-position — compute an issuer's position vs. cohort across all ratios
router.get("/relative-position", (req: Request, res: Response) => {
  const issuerQ = req.query.issuer_id as string | undefined;
  const issuer  = resolveIssuer(issuerQ);

  if (!issuer) {
    return res.status(400).json({ error: "issuer_id required and must match a known issuer" });
  }

  const sector = issuer.sector;
  const cohort = RATING_UNIVERSE.filter(i => i.id !== issuer.id);

  function percentileRank(val: number, vals: number[], higherIsWorse: boolean): number {
    const countBelow = vals.filter(v => higherIsWorse ? v > val : v < val).length;
    return +((countBelow / vals.length) * 100).toFixed(0);
  }

  const RATIOS = [
    { key: "net_debt_ebitda" as const, label: "Net Debt / EBITDA",    higherIsWorse: true,  weight: 0.40 },
    { key: "ebit_coverage"   as const, label: "EBIT Interest Cover",  higherIsWorse: false, weight: 0.35 },
    { key: "fcf_debt"        as const, label: "FCF / Gross Debt (%)", higherIsWorse: false, weight: 0.25 },
  ];

  const positions = RATIOS.map(r => {
    const peerVals  = cohort.map(p => p[r.key] as number);
    const anchorVal = issuer[r.key] as number;
    const pctRank   = percentileRank(anchorVal, peerVals, r.higherIsWorse);
    const quartile  = pctRank >= 75 ? "Q4_STRONG" : pctRank >= 50 ? "Q3_ABOVE_MED" : pctRank >= 25 ? "Q2_BELOW_MED" : "Q1_WEAK";
    return { ...r, anchor_value: anchorVal, percentile_rank: pctRank, quartile };
  });

  const weightedScore = positions.reduce((acc, p) => acc + p.percentile_rank * p.weight, 0);
  const overallTier   = weightedScore >= 70 ? "STRONG" : weightedScore >= 45 ? "ADEQUATE" : weightedScore >= 25 ? "WEAK" : "VERY_WEAK";

  return res.json({
    issuer_id:       issuer.id,
    issuer_name:     issuer.name,
    current_rating:  issuer.rating,
    sector,
    peer_count:      cohort.length,
    overall_score:   +weightedScore.toFixed(1),
    overall_tier:    overallTier,
    ratios:          positions,
    watch_implication: weightedScore < 30
      ? "NEGATIVE_WATCH_SUPPORTED"
      : weightedScore < 50
      ? "MONITORING_WARRANTED"
      : "NO_ACTION_INDICATED",
  });
});

export default router;
