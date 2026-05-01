import { Router, type Request, type Response } from "express";

const router = Router();

// ─── HNP Content API MCP — article recommendations and recovery content ────────

type Article = {
  articleId:   string;
  headline:    string;
  section:     string;
  subSection?: string;
  publishedAt: string;
  wordCount:   number;
  summary:     string;
  url:         string;
  tags:        string[];
  isPaywalled: boolean;
  engagementScore: number;  // internal popularity score 0-100
};

// Houston Chronicle non-storm editorial content — demonstrates year-round value
const ARTICLE_POOL: Article[] = [
  // Business / Economy
  {
    articleId: "CHR-2026-04-10-001",
    headline: "Houston's Petrochemical Corridor Sees $3.2B in New Investment as Energy Transition Accelerates",
    section: "Business", subSection: "Energy",
    publishedAt: "2026-04-10", wordCount: 1840, engagementScore: 87,
    summary: "Shell, LyondellBasell and a cohort of climate-tech startups are staking out positions along the Houston Ship Channel as federal clean hydrogen incentives reshape the economics of refining.",
    url: "https://www.houstonchronicle.com/business/energy/petrochemical-3b-investment-2026",
    tags: ["energy", "business", "houston-economy", "petrochemical", "hydrogen"],
    isPaywalled: true,
  },
  {
    articleId: "CHR-2026-04-18-002",
    headline: "Houston Real Estate: Inner Loop Prices Hold Despite Rate Pressure. Third Ward Sees Surge.",
    section: "Business", subSection: "Real Estate",
    publishedAt: "2026-04-18", wordCount: 1420, engagementScore: 79,
    summary: "Median sale price in Houston's Inner Loop held at $485,000 in Q1 2026 while Third Ward saw 18% year-over-year appreciation as buyers move closer to the Medical Center.",
    url: "https://www.houstonchronicle.com/business/real-estate/inner-loop-prices-q1-2026",
    tags: ["real-estate", "housing", "houston", "third-ward", "inner-loop"],
    isPaywalled: true,
  },
  // City Hall / Local Government
  {
    articleId: "CHR-2026-04-14-003",
    headline: "Mayor Whitmire's First 100 Days: Where He's Delivered and Where He Hasn't",
    section: "City Hall",
    publishedAt: "2026-04-14", wordCount: 2200, engagementScore: 94,
    summary: "A Chronicle accountability review of Whitmire's 27 campaign commitments — 8 completed, 12 in progress, 7 stalled. Drainage reform and public safety have moved fastest; homelessness policy lags.",
    url: "https://www.houstonchronicle.com/politics/whitmire-100-days-accountability",
    tags: ["city-hall", "mayor", "whitmire", "accountability", "houston-politics"],
    isPaywalled: true,
  },
  {
    articleId: "CHR-2026-03-28-004",
    headline: "Houston's 'Potholes on Demand' App Logs 40,000 Complaints. How Many Got Fixed?",
    section: "City Hall",
    publishedAt: "2026-03-28", wordCount: 1100, engagementScore: 82,
    summary: "A Chronicle data analysis found the city's 311 pothole repair app resolved only 61% of reported issues within the promised 30-day window. District J has the longest backlogs.",
    url: "https://www.houstonchronicle.com/city-hall/311-pothole-app-performance-2026",
    tags: ["city-hall", "infrastructure", "311", "potholes", "accountability"],
    isPaywalled: false,
  },
  // Environment & Climate
  {
    articleId: "CHR-2026-04-22-005",
    headline: "Harris County's New Flood-Buyout Program: 1,200 Families, $280M, and a 10-Year Wait List",
    section: "Environment & Climate",
    publishedAt: "2026-04-22", wordCount: 1980, engagementScore: 91,
    summary: "After Harvey and Imelda, Harris County launched the most ambitious flood-buyout program in Texas history. The Chronicle followed four families through a system that promises relief but delivers it at a pace that rarely matches the flooding cycle.",
    url: "https://www.houstonchronicle.com/environment/flood-buyout-families-harris-county",
    tags: ["flooding", "harris-county", "buyout-program", "environment", "housing"],
    isPaywalled: true,
  },
  {
    articleId: "CHR-2026-04-05-006",
    headline: "Bayou Preservation Association: 'Brays Bayou Widening Is the Right Move — If Done Right'",
    section: "Environment & Climate", subSection: "Water",
    publishedAt: "2026-04-05", wordCount: 1300, engagementScore: 73,
    summary: "Environmental groups broadly support the $340M drainage bond project but are watching contractor timelines and environmental impact protocols closely. Three disputed sites reviewed.",
    url: "https://www.houstonchronicle.com/environment/brays-bayou-widening-environmental-review",
    tags: ["flooding", "drainage", "bayou", "infrastructure", "environment"],
    isPaywalled: true,
  },
  // Sports
  {
    articleId: "CHR-2026-04-20-007",
    headline: "Astros Opening Week: Who's Hot, Who's Not, and What the Analytics Say About This Roster",
    section: "Sports", subSection: "Astros",
    publishedAt: "2026-04-20", wordCount: 1600, engagementScore: 88,
    summary: "After a 5-2 opening week, Chronicle analytics reporter breaks down the underlying numbers — Jose Altuve's sprint speed, a surprisingly effective bullpen, and one lineup slot that needs rethinking.",
    url: "https://www.houstonchronicle.com/sports/astros/opening-week-analytics-2026",
    tags: ["astros", "baseball", "sports", "houston", "analytics"],
    isPaywalled: true,
  },
  {
    articleId: "CHR-2026-04-08-008",
    headline: "Houston Rockets 2026 Draft Preview: Four Players the Front Office is Watching",
    section: "Sports", subSection: "Rockets",
    publishedAt: "2026-04-08", wordCount: 1450, engagementScore: 76,
    summary: "With two first-round picks and cap space to spend, the Rockets front office is laser-focused on these prospects at this year's NBA Combine. Chronicle breaks down the film.",
    url: "https://www.houstonchronicle.com/sports/rockets/2026-draft-preview",
    tags: ["rockets", "nba", "draft", "sports", "houston"],
    isPaywalled: true,
  },
  // Investigations
  {
    articleId: "CHR-2026-04-02-009",
    headline: "Toxic Legacy: The Superfund Sites That Flooded During Harvey — and Still Haven't Been Cleaned Up",
    section: "Investigations",
    publishedAt: "2026-04-02", wordCount: 3100, engagementScore: 96,
    summary: "A nine-month Chronicle investigation found 14 EPA-listed Superfund sites in the Houston metro that were submerged during Hurricane Harvey. Seven still show detectable contamination in adjacent soil and waterways.",
    url: "https://www.houstonchronicle.com/investigations/superfund-harvey-contamination-2026",
    tags: ["investigations", "environment", "superfund", "harvey", "epa", "contamination"],
    isPaywalled: true,
  },
  // Arts & Culture
  {
    articleId: "CHR-2026-04-25-010",
    headline: "The Menil's Newest Acquisition: A $24M Rothko the Public Has Never Seen",
    section: "Arts & Culture",
    publishedAt: "2026-04-25", wordCount: 900, engagementScore: 71,
    summary: "The Menil Collection has acquired a previously unknown Mark Rothko from a private European estate — the only large-format Rothko outside a museum to enter a public collection in 15 years.",
    url: "https://www.houstonchronicle.com/arts/menil-rothko-acquisition-2026",
    tags: ["arts", "menil", "museum", "culture", "houston"],
    isPaywalled: false,
  },
];

// Recovery resources — relevant for flood-affected zip codes
const RECOVERY_CONTENT: Record<string, any> = {
  "77085": {
    zipCode: "77085",
    recoveryGuideTitle: "Hurricane Mara Recovery Guide: Meyerland & Braeburn",
    sections: [
      {
        title: "Immediate Safety",
        content: "Do not re-enter flooded structures until cleared by City of Houston Public Works. Call 311 to report downed lines or gas leaks.",
        resources: ["311 (City of Houston)", "Entergy Houston: 713-228-1341", "CenterPoint Energy: 1-800-332-7143"],
      },
      {
        title: "Shelter & Temporary Housing",
        content: "Westside Tennis Club shelter open 24/7 through May 15. Harris County Judge's Office managing hotel voucher program for FEMA-declared households.",
        resources: ["Westside Tennis Club: 19115 Shadowwood Dr", "Harris County Judge hotline: 713-274-1111"],
      },
      {
        title: "FEMA Assistance",
        content: "Meyerland and Braeburn zip codes are in the federal disaster declaration area. Apply at DisasterAssistance.gov or call 1-800-621-FEMA. Individual Assistance for home repair and rental assistance available.",
        resources: ["DisasterAssistance.gov", "FEMA: 1-800-621-3362"],
      },
      {
        title: "Flood Damage Reporting",
        content: "Harris County Flood Control District is documenting damage for the post-event report to TxDOT and the Army Corps of Engineers. Report property flooding at: HCFCD Damage Portal.",
        resources: ["HCFCD: 713-684-4000", "www.harriscountyfloods.com"],
      },
      {
        title: "Cleanup & Contractor Safety",
        content: "Harris County has issued a warning about unlicensed contractors. Verify all contractors at: Texas Residential Construction Commission. Never pay more than 10% upfront.",
        resources: ["Texas Residential Construction Commission: 512-463-2909", "Harris County DA fraud hotline: 713-274-5810"],
      },
    ],
    chronicleRecoveryDesk: "The Chronicle's Storm Recovery desk is publishing daily updates. Visit: houstonchronicle.com/hurricane-mara-recovery",
  },
};

const SECTION_TOP_STORIES: Record<string, Article[]> = {
  "Business":              ARTICLE_POOL.filter(a => a.section === "Business"),
  "City Hall":             ARTICLE_POOL.filter(a => a.section === "City Hall"),
  "Environment & Climate": ARTICLE_POOL.filter(a => a.section === "Environment & Climate"),
  "Sports":                ARTICLE_POOL.filter(a => a.section === "Sports"),
  "Investigations":        ARTICLE_POOL.filter(a => a.section === "Investigations"),
  "Arts & Culture":        ARTICLE_POOL.filter(a => a.section === "Arts & Culture"),
};

// Interest → section mapping
const INTEREST_TO_SECTIONS: Record<string, string[]> = {
  "energy":          ["Business"],
  "real-estate":     ["Business"],
  "sports":          ["Sports"],
  "city-politics":   ["City Hall"],
  "environment":     ["Environment & Climate"],
  "investigations":  ["Investigations"],
  "arts":            ["Arts & Culture"],
  "business":        ["Business"],
  "flooding":        ["Environment & Climate", "Investigations"],
};

// ─── Tools ────────────────────────────────────────────────────────────────────

// GET /get-articles-by-interest-profile?interests=energy,sports&limit=3&exclude_storm=true
router.get("/get-articles-by-interest-profile", (req: Request, res: Response) => {
  const interestsParam = String(req.query.interests ?? "");
  const limit = Math.min(parseInt(String(req.query.limit ?? "3"), 10), 10);
  const excludeStorm = req.query.exclude_storm === "true";

  let articles: Article[] = [];
  if (interestsParam) {
    const interests = interestsParam.split(",").map(i => i.trim().toLowerCase());
    const targetSections = new Set<string>();
    interests.forEach(interest => {
      (INTEREST_TO_SECTIONS[interest] ?? []).forEach(s => targetSections.add(s));
    });
    articles = ARTICLE_POOL.filter(a => targetSections.has(a.section));
  } else {
    articles = [...ARTICLE_POOL];
  }

  if (excludeStorm) {
    articles = articles.filter(a => !a.tags.includes("hurricane-mara") && !a.tags.includes("flooding") || a.section === "Investigations");
  }

  // Sort by engagement score desc
  articles = articles.sort((a, b) => b.engagementScore - a.engagementScore).slice(0, limit);

  return res.json({
    success: true,
    requestedInterests: interestsParam || "all",
    articlesReturned: articles.length,
    articles,
    curatorNote: "Articles selected for year-round Chronicle value demonstration — not storm coverage. Showing breadth of local journalism.",
  });
});

// GET /get-recovery-resource-content?zip_code=77085
router.get("/get-recovery-resource-content", (req: Request, res: Response) => {
  const zip = String(req.query.zip_code ?? "").replace(/\s/g, "");
  const content = RECOVERY_CONTENT[zip];
  if (!content) {
    // Generic recovery content
    return res.json({
      success: true,
      zipCode: zip,
      recoveryGuideTitle: "Hurricane Mara Recovery Guide — Houston Metro",
      sections: [
        { title: "FEMA Assistance", content: "Apply at DisasterAssistance.gov or call 1-800-621-FEMA.", resources: ["DisasterAssistance.gov"] },
        { title: "Harris County Resources", content: "Harris County Judge hotline: 713-274-1111", resources: ["713-274-1111"] },
      ],
      chronicleRecoveryDesk: "houstonchronicle.com/hurricane-mara-recovery",
      note: `No zip-specific recovery guide available for ${zip}. Returning general Houston recovery resources.`,
    });
  }
  return res.json({ success: true, ...content });
});

// GET /get-section-top-stories?section=Business&limit=3
router.get("/get-section-top-stories", (req: Request, res: Response) => {
  const section = String(req.query.section ?? "");
  const limit   = Math.min(parseInt(String(req.query.limit ?? "3"), 10), 10);
  let articles  = section ? (SECTION_TOP_STORIES[section] ?? []) : ARTICLE_POOL;
  articles = articles.sort((a, b) => b.engagementScore - a.engagementScore).slice(0, limit);
  return res.json({
    success: true,
    section: section || "all",
    articlesReturned: articles.length,
    articles,
    availableSections: Object.keys(SECTION_TOP_STORIES),
  });
});

export default router;
