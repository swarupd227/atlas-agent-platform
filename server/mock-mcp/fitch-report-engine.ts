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

const RATING_ACTIONS: Record<string, string> = {
  deteriorating: "Rating Watch Negative",
  stable: "Affirm",
  improving: "Positive Outlook",
};

router.get("/report-templates", (req: Request, res: Response) => {
  const { report_type } = req.query;
  const templates = [
    {
      template_id: "ASMT-FULL-001",
      name: "Full Credit Assessment Package",
      report_type: "credit_assessment",
      sections: [
        "Executive Summary & Rating Action",
        "CAMELS Score Summary",
        "Capital Adequacy Analysis",
        "Asset Quality Deep Dive",
        "Earnings & Revenue Analysis",
        "Liquidity & Funding Profile",
        "Sensitivity & Market Risk",
        "Management Quality Assessment",
        "Peer Comparison",
        "Scenario Analysis & Stress Testing",
        "Rating Rationale & Outlook",
        "Appendix: Key Financial Tables",
      ],
      estimated_pages: 28,
      turnaround_hours: 48,
      analyst_hours: 12,
    },
    {
      template_id: "ASMT-WATCH-002",
      name: "Rating Watch Alert",
      report_type: "watch_alert",
      sections: ["Watch Trigger Summary","Credit Concerns","Monitoring Checklist","Next Steps"],
      estimated_pages: 4,
      turnaround_hours: 4,
      analyst_hours: 2,
    },
    {
      template_id: "ASMT-PEER-003",
      name: "Peer Benchmarking Report",
      report_type: "peer_comparison",
      sections: ["Peer Group Definition","CAMELS Benchmarks","Trend Analysis","Quartile Rankings","Commentary"],
      estimated_pages: 12,
      turnaround_hours: 24,
      analyst_hours: 6,
    },
    {
      template_id: "ASMT-STRESS-004",
      name: "Stress Test Summary",
      report_type: "stress_test",
      sections: ["Scenario Definitions","Capital Impact Analysis","Liquidity Buffer Assessment","Conclusion"],
      estimated_pages: 8,
      turnaround_hours: 12,
      analyst_hours: 4,
    },
  ];

  const filtered = report_type ? templates.filter(t => t.report_type === report_type) : templates;
  res.json({ status: "ok", template_count: filtered.length, templates: filtered });
});

router.get("/historical-reports", (req: Request, res: Response) => {
  const { bank_id, report_type, limit: limitStr } = req.query;
  const bankName = BANK_NAMES[bank_id as string] || "Community Bank";
  const rng = seededRng((bank_id as string || "").length * 29 + 9999);
  const limit = Math.min(parseInt(limitStr as string) || 10, 20);

  const reports: any[] = [];
  for (let i = 0; i < limit; i++) {
    const rt = (report_type as string) || ["credit_assessment","watch_alert","peer_comparison"][Math.floor(rng() * 3)];
    const daysAgo = Math.floor(rng() * 730);
    const rating = ["A","A-","BBB+","BBB","BBB-","BB+"][Math.floor(rng() * 6)];
    reports.push({
      report_id: `RPT-${(bank_id as string || "BANK").replace("RSSD-","")}-${Date.now() - i * 1000}`,
      bank_id,
      bank_name: bankName,
      report_type: rt,
      created_at: new Date(Date.now() - daysAgo * 86400000).toISOString().split("T")[0],
      rating_at_publication: rating,
      outlook: ["Stable","Negative","Watch Negative","Positive"][Math.floor(rng() * 4)],
      analyst: ["J. Peterson","M. Chen","R. Williams","K. Patel"][Math.floor(rng() * 4)],
      status: i === 0 ? "current" : "superseded",
      pdf_available: true,
      pages: Math.floor(rng() * 20) + 8,
    });
  }

  res.json({
    status: "ok",
    bank_id,
    report_count: reports.length,
    reports,
  });
});

router.post("/generate-package", (req: Request, res: Response) => {
  const { bank_id, report_type, composite_score, trend, component_scores } = req.body || {};
  const bankName = BANK_NAMES[bank_id] || "Community Bank";
  const rng = seededRng((bank_id || "").length * 41 + 7777);

  const score = parseFloat(composite_score) || 42.0;
  const riskLevel = score > 65 ? "CRITICAL" : score > 45 ? "HIGH" : score > 25 ? "MEDIUM" : "LOW";
  const trendLabel = (trend as string) || "stable";
  const ratingAction = RATING_ACTIONS[trendLabel] || "Affirm";
  const rating = score > 65 ? "BB" : score > 45 ? "BBB-" : score > 25 ? "BBB" : "BBB+";

  const cs = component_scores || {};
  const reportId = `RPT-${Date.now()}-${Math.floor(rng() * 9999)}`;

  const pkg = {
    report_id: reportId,
    bank_id,
    bank_name: bankName,
    report_type: report_type || "credit_assessment",
    template: "ASMT-FULL-001",
    generated_at: new Date().toISOString(),
    status: "completed",
    rating,
    rating_action: ratingAction,
    outlook: trendLabel === "deteriorating" ? "Negative" : trendLabel === "improving" ? "Positive" : "Stable",

    executive_summary: `${bankName} is assigned a credit rating of ${rating} with ${trendLabel === "deteriorating" ? "Negative" : trendLabel === "improving" ? "Positive" : "Stable"} outlook. The composite CAMELS-derived risk score of ${score.toFixed(1)} places the institution in the ${riskLevel} risk tier. ${trendLabel === "deteriorating" ? "Deteriorating credit metrics and elevated CRE concentration warrant heightened surveillance." : trendLabel === "improving" ? "Improving capital and asset quality metrics support a stable-to-positive credit trajectory." : "Credit fundamentals are broadly stable with manageable headwinds from the interest rate environment."}`,

    camels_summary: {
      capital: { score: +(cs.capital_adequacy || 28).toFixed(1), grade: "B+" },
      asset_quality: { score: +(cs.asset_quality || 35).toFixed(1), grade: "B" },
      management: { score: +(20 + rng() * 20).toFixed(1), grade: "A-" },
      earnings: { score: +(cs.earnings_stability || 22).toFixed(1), grade: "B+" },
      liquidity: { score: +(cs.liquidity_risk || 30).toFixed(1), grade: "B" },
      sensitivity: { score: +(cs.rate_sensitivity || 25).toFixed(1), grade: "B-" },
    },

    key_concerns: [
      score > 40 ? "CRE concentration exceeds 300% of tier-1 capital — regulatory threshold breached" : "CRE concentration within policy limits",
      cs.liquidity_risk > 35 ? "Elevated wholesale funding dependency reduces funding stability" : "Deposit base is stable and diversified",
      cs.rate_sensitivity > 25 ? "Meaningful HTM portfolio with unrealized losses limits balance sheet flexibility" : "Interest rate risk is well-managed",
      trendLabel === "deteriorating" ? "NLP signals show deteriorating management tone in recent earnings calls" : "Management commentary reflects disciplined credit culture",
    ],

    rating_rationale: `The ${rating} rating reflects ${bankName}'s ${score > 45 ? "elevated" : "moderate"} risk profile characterized by ${score > 45 ? "heightened" : "manageable"} asset quality concerns, ${trendLabel === "deteriorating" ? "declining" : "stable"} earnings trajectory, and ${score > 50 ? "tightening" : "adequate"} liquidity position. The CAMELS composite score of ${score.toFixed(1)} ${score > 65 ? "signals critical stress warranting immediate surveillance" : score > 45 ? "indicates heightened supervisory concern" : "reflects a stable credit profile within peer norms"}.`,

    peer_comparison: {
      peer_group: "Community Bank $10–50B",
      peer_count: 312,
      composite_score_percentile: Math.min(95, Math.floor(score * 1.2)),
      capital_vs_median: +(rng() * 2 - 0.5).toFixed(2),
      npl_vs_median: +(rng() * 1.5 - 0.3).toFixed(2),
      nim_vs_median: +(rng() * 0.6 - 0.2).toFixed(2),
    },

    pages: 28,
    pdf_url: `/reports/${reportId}.pdf`,
    analyst_assigned: ["J. Peterson","M. Chen","R. Williams"][Math.floor(rng() * 3)],
  };

  res.json({ status: "ok", package: pkg });
});

router.get("/compliance-checklist", (req: Request, res: Response) => {
  const { bank_id, checklist_type } = req.query;
  const rng = seededRng((bank_id as string || "").length * 13 + 4321);

  const items = [
    { item_id: "CMP-001", category: "capital", description: "Tier-1 capital ratio ≥ 6% (well-capitalized threshold)", status: rng() > 0.15 ? "pass" : "fail", regulatory_ref: "12 CFR 6.4" },
    { item_id: "CMP-002", category: "capital", description: "CET1 ratio ≥ 4.5%", status: rng() > 0.1 ? "pass" : "fail", regulatory_ref: "Basel III / 12 CFR 3.10" },
    { item_id: "CMP-003", category: "cre", description: "CRE concentration ≤ 300% of total capital", status: rng() > 0.4 ? "pass" : "fail", regulatory_ref: "SR 07-1 Guidance" },
    { item_id: "CMP-004", category: "cre", description: "C&D concentration ≤ 100% of total capital", status: rng() > 0.35 ? "pass" : "fail", regulatory_ref: "SR 07-1 Guidance" },
    { item_id: "CMP-005", category: "liquidity", description: "LCR ≥ 100% (Large Bank Minimum)", status: rng() > 0.2 ? "pass" : "fail", regulatory_ref: "12 CFR 249" },
    { item_id: "CMP-006", category: "liquidity", description: "Brokered deposit limit compliance", status: rng() > 0.1 ? "pass" : "fail", regulatory_ref: "12 USC 1831f" },
    { item_id: "CMP-007", category: "credit", description: "Loan loss allowance adequacy (CECL)", status: rng() > 0.15 ? "pass" : "fail", regulatory_ref: "ASC 326" },
    { item_id: "CMP-008", category: "aml", description: "BSA/AML program complete and current", status: rng() > 0.05 ? "pass" : "fail", regulatory_ref: "31 USC 5318" },
  ];

  const filtered = checklist_type ? items.filter(i => i.category === checklist_type) : items;
  res.json({
    status: "ok",
    bank_id,
    item_count: filtered.length,
    pass_count: filtered.filter(i => i.status === "pass").length,
    fail_count: filtered.filter(i => i.status === "fail").length,
    items: filtered,
  });
});

export default router;
