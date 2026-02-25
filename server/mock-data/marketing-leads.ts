function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const FIN_COMPANIES = [
  "BlackRock", "Vanguard", "JP Morgan AM", "State Street", "PIMCO",
  "Allianz", "AXA Investment", "HSBC AM", "Nomura", "DBS Bank",
  "Schroders", "Fidelity", "Goldman Sachs AM", "Morgan Stanley IM",
  "BNP Paribas AM", "UBS AM", "Invesco", "T. Rowe Price",
  "Wellington Management", "Capital Group", "Lazard AM", "Nuveen",
  "Franklin Templeton", "Manulife IM", "Amundi", "Legal & General",
  "Aberdeen", "Macquarie AM", "Natixis IM", "Northern Trust AM"
];

const JOB_TITLES = [
  "Head of Research", "CIO", "Portfolio Manager", "Credit Analyst",
  "VP Risk", "CFO", "Director of Fixed Income", "Senior Analyst",
  "Managing Director", "Head of Credit", "Chief Risk Officer",
  "VP Portfolio Strategy", "Head of Compliance", "Senior Portfolio Manager",
  "Director of Investment Operations", "Quantitative Analyst",
  "Head of ESG", "Risk Manager", "Treasury Director", "VP Credit Risk"
];

const FIRST_NAMES = [
  "James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia",
  "William", "Isabella", "Richard", "Mia", "Thomas", "Charlotte", "Daniel",
  "Amelia", "Christopher", "Harper", "Andrew", "Evelyn", "Benjamin", "Abigail",
  "Matthew", "Emily", "Joshua", "Elizabeth", "Alexander", "Avery", "Nicholas",
  "Ella", "Hiroshi", "Yuki", "Wei", "Mei", "Raj", "Priya", "Carlos", "Maria",
  "Pierre", "Claire", "Hans", "Ingrid", "Ahmed", "Fatima", "Chen", "Lin",
  "Kenji", "Sakura", "Ravi", "Ananya"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore",
  "Jackson", "Martin", "Lee", "Thompson", "White", "Harris", "Clark",
  "Lewis", "Robinson", "Walker", "Young", "Tanaka", "Nakamura", "Wang",
  "Zhang", "Kumar", "Patel", "Mueller", "Schmidt", "Dubois", "Rossi",
  "Kim", "Park", "Santos", "Silva", "Johansson"
];

const BIZ_LINES = ["Ratings", "Solutions", "Learning", "CreditSights"] as const;
const LEAD_SOURCES = ["webinar", "whitepaper", "conference", "website"] as const;
const REGIONS = ["AMER", "EMEA", "APAC"] as const;

const ACTIVITY_TYPES = [
  "email_open", "email_click", "page_visit", "content_download",
  "webinar_registration", "webinar_attended", "form_submit", "video_view"
] as const;

const CONTENT_TITLES = [
  "2026 Global Credit Outlook", "ESG Rating Methodology Update",
  "Sovereign Debt Analysis Framework", "CLO Market Quarterly Review",
  "Infrastructure Finance Trends", "Bank Capital Adequacy Report",
  "Corporate Default Study 2025", "Structured Finance Primer",
  "Emerging Markets Credit Watch", "Green Bond Standards Guide",
  "Private Credit Risk Assessment", "Insurance Sector Outlook",
  "Commercial Mortgage Monitor", "Asset-Backed Securities Guide",
  "Municipal Bond Analysis", "Leveraged Loan Market Update"
];

export interface MarketingLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  jobTitle: string;
  businessLine: typeof BIZ_LINES[number];
  leadSource: typeof LEAD_SOURCES[number];
  engagementScore: number;
  marketoId: string;
  salesforceContactId: string;
  salesforceAccountId: string;
  isRatedEntity: boolean;
  region: typeof REGIONS[number];
  lastActivityDate: string;
  status: string;
  ownerName: string;
  activityHistory: ActivityEntry[];
}

export interface ActivityEntry {
  id: string;
  type: typeof ACTIVITY_TYPES[number];
  timestamp: string;
  details: string;
}

export interface SmartList {
  id: number;
  name: string;
  description: string;
  filterRules: string;
  leadCount: number;
}

export interface VisitorSegment {
  id: string;
  name: string;
  description: string;
  definition: object;
}

export interface Campaign {
  id: number;
  name: string;
  type: string;
  status: string;
  description: string;
}

const STATUSES = ["New", "Open", "Contacted", "MQL", "SQL", "Opportunity", "Customer", "Nurture"];
const OWNER_NAMES = [
  "Alex Rivera", "Jordan Chen", "Morgan Blake", "Taylor Kim",
  "Casey O'Brien", "Quinn Foster", "Drew Hamilton", "Sam Nakamura"
];

function generateLeads(count: number = 1000): MarketingLead[] {
  const rand = seededRandom(42);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

  const leads: MarketingLead[] = [];

  for (let i = 0; i < count; i++) {
    const company = pick(FIN_COMPANIES);
    const domain = company.toLowerCase().replace(/[^a-z]/g, "") + ".com";
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
    const daysAgo = randInt(0, 180);
    const lastActivity = new Date(Date.now() - daysAgo * 86400000);

    const activityCount = randInt(2, 12);
    const activityHistory: ActivityEntry[] = [];
    for (let a = 0; a < activityCount; a++) {
      const actDaysAgo = randInt(daysAgo, daysAgo + 90);
      activityHistory.push({
        id: `ACT-${i + 1}-${a + 1}`,
        type: pick(ACTIVITY_TYPES),
        timestamp: new Date(Date.now() - actDaysAgo * 86400000).toISOString(),
        details: pick(CONTENT_TITLES),
      });
    }
    activityHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    leads.push({
      id: `LEAD-${String(i + 1).padStart(4, "0")}`,
      firstName,
      lastName,
      email: `${username}@${domain}`,
      company,
      jobTitle: pick(JOB_TITLES),
      businessLine: pick(BIZ_LINES),
      leadSource: pick(LEAD_SOURCES),
      engagementScore: randInt(10, 98),
      marketoId: `MKT-${String(randInt(100000, 999999))}`,
      salesforceContactId: `003${String(randInt(100000000, 999999999))}`,
      salesforceAccountId: `001${String(randInt(100000000, 999999999))}`,
      isRatedEntity: rand() < 0.15,
      region: pick(REGIONS),
      lastActivityDate: lastActivity.toISOString().split("T")[0],
      status: pick(STATUSES),
      ownerName: pick(OWNER_NAMES),
      activityHistory,
    });
  }

  return leads;
}

function generateSmartLists(): SmartList[] {
  return [
    { id: 1001, name: "High Intent – Ratings", description: "Leads with engagement score >75 interested in Ratings content", filterRules: "engagementScore > 75 AND businessLine = 'Ratings'", leadCount: 127 },
    { id: 1002, name: "Webinar Attendees Q1 2026", description: "All leads who attended webinars in Q1 2026", filterRules: "activityType = 'webinar_attended' AND date >= '2026-01-01'", leadCount: 234 },
    { id: 1003, name: "CreditSights Trial Prospects", description: "Leads exploring CreditSights with moderate+ engagement", filterRules: "businessLine = 'CreditSights' AND engagementScore > 40", leadCount: 89 },
    { id: 1004, name: "EMEA Enterprise Accounts", description: "Senior decision-makers at EMEA financial institutions", filterRules: "region = 'EMEA' AND jobTitle CONTAINS 'Head|Director|CIO|CFO'", leadCount: 156 },
    { id: 1005, name: "Rated Entity Contacts", description: "Contacts at entities rated by the organization", filterRules: "isRatedEntity = true", leadCount: 148 },
    { id: 1006, name: "Content Download – ESG", description: "Leads who downloaded ESG-related content", filterRules: "activity.details CONTAINS 'ESG' AND activityType = 'content_download'", leadCount: 67 },
    { id: 1007, name: "Dormant High-Value", description: "Previously engaged senior contacts with no activity in 60+ days", filterRules: "engagementScore > 60 AND daysSinceLastActivity > 60", leadCount: 45 },
    { id: 1008, name: "Solutions Cross-Sell", description: "Ratings customers who may benefit from Solutions products", filterRules: "businessLine = 'Ratings' AND status IN ('Customer','Opportunity')", leadCount: 93 },
  ];
}

function generateSegments(): VisitorSegment[] {
  return [
    { id: "seg-001", name: "Ratings Content Consumers", description: "Visitors who viewed 3+ ratings methodology pages", definition: { metric: "pageViews", filter: "url CONTAINS '/ratings/'", threshold: 3 } },
    { id: "seg-002", name: "Webinar Registrants", description: "Users who registered for any upcoming webinar", definition: { metric: "formSubmit", filter: "formType = 'webinar_registration'", threshold: 1 } },
    { id: "seg-003", name: "High Engagement Visitors", description: "Visitors with 5+ page views and 3+ minutes avg time on site", definition: { metric: "composite", filters: ["pageViews >= 5", "avgTimeOnPage >= 180"] } },
    { id: "seg-004", name: "ESG Research Audience", description: "Visitors consuming ESG and sustainability content", definition: { metric: "pageViews", filter: "url CONTAINS '/esg/' OR content_tag = 'ESG'", threshold: 2 } },
    { id: "seg-005", name: "Return Visitors – Enterprise", description: "Enterprise domain visitors returning 3+ times in 30 days", definition: { metric: "visits", filter: "domain IN enterprise_list", threshold: 3, window: "30d" } },
    { id: "seg-006", name: "Conversion Funnel – Trial Request", description: "Visitors who reached the trial request page", definition: { metric: "pageView", filter: "url = '/request-trial'", threshold: 1 } },
  ];
}

function generateCampaigns(): Campaign[] {
  return [
    { id: 2001, name: "Q1 2026 Ratings Awareness", type: "nurture", status: "active", description: "Multi-touch nurture for new ratings methodology awareness" },
    { id: 2002, name: "CreditSights Trial Conversion", type: "drip", status: "active", description: "7-day drip sequence for CreditSights trial signups" },
    { id: 2003, name: "ESG Webinar Follow-Up", type: "trigger", status: "active", description: "Post-webinar engagement sequence with content offers" },
    { id: 2004, name: "EMEA Executive Outreach", type: "account_based", status: "active", description: "Targeted ABM campaign for EMEA enterprise accounts" },
    { id: 2005, name: "Dormant Re-Engagement", type: "re-engagement", status: "active", description: "Win-back sequence for leads inactive 60+ days" },
    { id: 2006, name: "Solutions Cross-Sell", type: "cross_sell", status: "paused", description: "Cross-sell Solutions products to existing Ratings clients" },
  ];
}

function generateWebAnalytics(rand: () => number) {
  const pages = [
    { url: "/ratings/methodology", title: "Rating Methodology Overview", category: "Ratings" },
    { url: "/ratings/sovereign", title: "Sovereign Ratings", category: "Ratings" },
    { url: "/ratings/corporate", title: "Corporate Ratings", category: "Ratings" },
    { url: "/solutions/analytics", title: "Analytics Solutions", category: "Solutions" },
    { url: "/solutions/data-feeds", title: "Data Feed Solutions", category: "Solutions" },
    { url: "/learning/courses", title: "Training Courses", category: "Learning" },
    { url: "/creditsights/research", title: "CreditSights Research", category: "CreditSights" },
    { url: "/esg/framework", title: "ESG Rating Framework", category: "ESG" },
    { url: "/esg/scores", title: "ESG Scores Database", category: "ESG" },
    { url: "/webinars", title: "Upcoming Webinars", category: "Events" },
    { url: "/request-demo", title: "Request a Demo", category: "Conversion" },
    { url: "/request-trial", title: "Free Trial Signup", category: "Conversion" },
    { url: "/blog", title: "Market Insights Blog", category: "Content" },
    { url: "/about/contact", title: "Contact Us", category: "Company" },
  ];

  const referralSources = [
    { source: "google", medium: "organic", sessions: Math.floor(rand() * 5000 + 8000) },
    { source: "linkedin", medium: "social", sessions: Math.floor(rand() * 2000 + 3000) },
    { source: "email", medium: "newsletter", sessions: Math.floor(rand() * 1500 + 2500) },
    { source: "direct", medium: "none", sessions: Math.floor(rand() * 3000 + 4000) },
    { source: "bloomberg", medium: "referral", sessions: Math.floor(rand() * 800 + 1200) },
    { source: "reuters", medium: "referral", sessions: Math.floor(rand() * 600 + 900) },
    { source: "google", medium: "cpc", sessions: Math.floor(rand() * 1000 + 1500) },
    { source: "twitter", medium: "social", sessions: Math.floor(rand() * 400 + 600) },
  ];

  const conversionFunnel = [
    { step: "Homepage Visit", count: Math.floor(rand() * 10000 + 25000), rate: 100 },
    { step: "Content Page View", count: Math.floor(rand() * 5000 + 12000), rate: 52.3 },
    { step: "Resource Download", count: Math.floor(rand() * 2000 + 3500), rate: 18.7 },
    { step: "Demo/Trial Request", count: Math.floor(rand() * 500 + 800), rate: 5.2 },
    { step: "Sales Qualified", count: Math.floor(rand() * 200 + 350), rate: 2.1 },
    { step: "Closed Won", count: Math.floor(rand() * 50 + 80), rate: 0.5 },
  ];

  return {
    pages: pages.map(p => ({
      ...p,
      pageViews: Math.floor(rand() * 3000 + 500),
      uniqueVisitors: Math.floor(rand() * 2000 + 300),
      avgTimeOnPage: Math.floor(rand() * 240 + 30),
      bounceRate: +(rand() * 40 + 20).toFixed(1),
    })),
    referralSources,
    conversionFunnel,
  };
}

let _cachedLeads: MarketingLead[] | null = null;
let _cachedSmartLists: SmartList[] | null = null;
let _cachedSegments: VisitorSegment[] | null = null;
let _cachedCampaigns: Campaign[] | null = null;

export function getLeads(): MarketingLead[] {
  if (!_cachedLeads) _cachedLeads = generateLeads(1000);
  return _cachedLeads;
}

export function getSmartLists(): SmartList[] {
  if (!_cachedSmartLists) _cachedSmartLists = generateSmartLists();
  return _cachedSmartLists;
}

export function getSegments(): VisitorSegment[] {
  if (!_cachedSegments) _cachedSegments = generateSegments();
  return _cachedSegments;
}

export function getCampaigns(): Campaign[] {
  if (!_cachedCampaigns) _cachedCampaigns = generateCampaigns();
  return _cachedCampaigns;
}

export function getWebAnalytics() {
  const rand = seededRandom(99);
  return generateWebAnalytics(rand);
}

export function findLeadById(id: string): MarketingLead | undefined {
  return getLeads().find(l => l.id === id);
}

export function findLeadsByEmail(email: string): MarketingLead[] {
  return getLeads().filter(l => l.email.toLowerCase().includes(email.toLowerCase()));
}

export function findLeadsByCompany(company: string): MarketingLead[] {
  return getLeads().filter(l => l.company.toLowerCase().includes(company.toLowerCase()));
}

export function findLeadsByRegion(region: string): MarketingLead[] {
  return getLeads().filter(l => l.region === region);
}

export function findLeadsByScoreRange(min: number, max: number): MarketingLead[] {
  return getLeads().filter(l => l.engagementScore >= min && l.engagementScore <= max);
}

export function findLeadsByBusinessLine(line: string): MarketingLead[] {
  return getLeads().filter(l => l.businessLine === line);
}

export function findLeadsByStatus(status: string): MarketingLead[] {
  return getLeads().filter(l => l.status === status);
}
