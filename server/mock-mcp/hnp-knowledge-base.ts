import { Router, type Request, type Response } from "express";

const router = Router();

// ─── HNP Knowledge Base mock data ─────────────────────────────────────────────

const INVESTIGATIVE_STANDARDS = {
  documentTitle: "Hearst Newspaper Group — Investigative Journalism Standards (Internal)",
  version:       "2026.1",
  updatedAt:     "2026-02-14",
  sections: [
    {
      sectionId: "STD-01",
      title:     "Two-Source Rule for Adverse Allegations",
      body:      "Any allegation of wrongdoing involving a named individual or organization requires confirmation from at least two independent, on-record sources before publication. Anonymous sourcing requires editor approval and a documented reason.",
    },
    {
      sectionId: "STD-02",
      title:     "Public-Record Citation Requirement",
      body:      "Every quantitative claim — dollar amounts, vote counts, contract values, dates — must be traceable to a primary public record (transcript, contract, vote roll, FOIA response, certified financial statement). Secondary news reporting is not sufficient.",
    },
    {
      sectionId: "STD-03",
      title:     "Verbatim Quote Integrity",
      body:      "Quoted speech must be reproduced verbatim from the original transcript or recording. Edits for clarity (e.g., bracketed substitutions) must be marked. Paraphrase is permitted only when explicitly identified as such.",
    },
    {
      sectionId: "STD-04",
      title:     "Right of Reply Window",
      body:      "Subjects of adverse reporting must be given a documented opportunity to respond no less than 24 hours before publication for non-urgent stories, and no less than 4 hours for breaking-news stories where delay would harm the public interest.",
    },
    {
      sectionId: "STD-05",
      title:     "AI-Assisted Drafting Disclosure",
      body:      "Story skeletons or draft content produced with AI assistance must carry the internal marker DRAFT — NOT FOR PUBLICATION until reviewed and signed off by an assigned reporter and an editor.",
    },
    {
      sectionId: "STD-06",
      title:     "Conflict-of-Interest Disclosure on Sourced Allegations",
      body:      "Where a story involves campaign contributions, contractor relationships, or other potential conflicts of interest, the relevant relationships must be disclosed in the story itself, not merely on file.",
    },
  ],
  publishableFactCriteria: [
    "Sourced to at least one primary public record",
    "Cross-checked against a second independent source",
    "Subject given right of reply",
    "Quantitative claim within ±2% of source figure",
    "Verbatim quotes match original recording",
  ],
  unverifiedClaimMarker: "ALLEGATION — UNVERIFIED",
};

const TEXAS_GOVT_ONTOLOGY = [
  {
    entityId:     "ENT-HOU-COUNCIL",
    canonicalName: "Houston City Council",
    type:          "legislative_body",
    jurisdiction:  "City of Houston, TX",
    parentEntity:  null,
    subsidiaries:  ["Public Safety Committee", "Capital Improvement Plan Committee", "Budget & Fiscal Affairs"],
    foiaOfficer:   { name: "Anna L. Russell", title: "City Secretary", email: "citysecretary@houstontx.gov", phone: "832-393-1100" },
    foiaStatute:   "Texas Government Code Chapter 552 (Public Information Act)",
    standardResponseDays: 10,
  },
  {
    entityId:     "ENT-HC-COMMISSIONERS",
    canonicalName: "Harris County Commissioners Court",
    type:          "legislative_body",
    jurisdiction:  "Harris County, TX",
    parentEntity:  null,
    subsidiaries:  ["Harris County Flood Control District", "Harris County Office of Homeland Security & Emergency Management"],
    foiaOfficer:   { name: "Teneshia Hudspeth", title: "Harris County Clerk", email: "info@cclerk.hctx.net", phone: "713-755-6411" },
    foiaStatute:   "Texas Government Code Chapter 552 (Public Information Act)",
    standardResponseDays: 10,
  },
  {
    entityId:     "ENT-HCFCD",
    canonicalName: "Harris County Flood Control District",
    type:          "executive_agency",
    jurisdiction:  "Harris County, TX",
    parentEntity:  "ENT-HC-COMMISSIONERS",
    subsidiaries:  [],
    foiaOfficer:   { name: "Public Information Officer, HCFCD", title: "PIO", email: "pio@hcfcd.org", phone: "713-684-4000" },
    foiaStatute:   "Texas Government Code Chapter 552 (Public Information Act)",
    standardResponseDays: 10,
  },
  {
    entityId:     "ENT-TCEQ",
    canonicalName: "Texas Commission on Environmental Quality",
    type:          "state_agency",
    jurisdiction:  "State of Texas",
    parentEntity:  null,
    subsidiaries:  [],
    foiaOfficer:   { name: "Public Information Coordinator, TCEQ", title: "PIC", email: "publicinformation@tceq.texas.gov", phone: "512-239-0028" },
    foiaStatute:   "Texas Government Code Chapter 552 (Public Information Act)",
    standardResponseDays: 10,
  },
  {
    entityId:     "ENT-TXDOT",
    canonicalName: "Texas Department of Transportation",
    type:          "state_agency",
    jurisdiction:  "State of Texas",
    parentEntity:  null,
    subsidiaries:  [],
    foiaOfficer:   { name: "TxDOT Open Records Officer", title: "Open Records Officer", email: "openrecords@txdot.gov", phone: "512-463-8585" },
    foiaStatute:   "Texas Government Code Chapter 552 (Public Information Act)",
    standardResponseDays: 10,
  },
];

const ELECTED_OFFICIAL_PROFILES = [
  {
    officialId:   "OFF-WHITMIRE-J",
    name:         "John Whitmire",
    role:         "Mayor",
    body:         "City of Houston",
    termStart:    "2024-01-02",
    termEnd:      "2028-01-01",
    notableVotes: [
      { date: "2024-09-18", item: "FY25 budget — drainage capital allocation $410M", vote: "for" },
      { date: "2025-03-12", item: "Resolution authorizing emergency procurement for hurricane preparedness", vote: "for" },
    ],
    campaignContributorsTopFive: ["Houston Police Officers' Union", "ACE Engineering & Design", "Brookline Construction Group", "Allied Hydro Construction", "Bay Area Real Estate PAC"],
  },
  {
    officialId:   "OFF-KAMIN-A",
    name:         "Abbie Kamin",
    role:         "Council Member, District C",
    body:         "City of Houston",
    termStart:    "2024-01-02",
    termEnd:      "2028-01-01",
    notableVotes: [
      { date: "2023-11-09", item: "Drainage Infrastructure Bond Package — $340M (2023 referendum-enabling vote)", vote: "for" },
      { date: "2025-03-12", item: "Emergency procurement resolution for hurricane preparedness", vote: "for" },
    ],
    campaignContributorsTopFive: ["League of Women Voters Houston", "Sierra Club Lone Star Chapter", "Texas Tenants' Union", "Houston Bar Association PAC", "United Teachers of Houston"],
  },
  {
    officialId:   "OFF-POLLARD-E",
    name:         "Edward Pollard",
    role:         "Council Member, District J",
    body:         "City of Houston",
    termStart:    "2020-01-02",
    termEnd:      "2028-01-01",
    notableVotes: [
      { date: "2023-11-09", item: "Drainage Infrastructure Bond Package — $340M", vote: "against" },
      { date: "2024-05-22", item: "Award of West Houston Detention Pond contract to Allied Hydro", vote: "against" },
    ],
    campaignContributorsTopFive: ["Allied Hydro Construction", "Brookline Construction Group", "Texas Builders Alliance PAC", "Westchase District Improvement", "ACE Engineering & Design"],
  },
  {
    officialId:   "OFF-HUFFMAN-MN",
    name:         "Mary Nan Huffman",
    role:         "Council Member, District G",
    body:         "City of Houston",
    termStart:    "2022-01-04",
    termEnd:      "2026-01-01",
    notableVotes: [
      { date: "2023-11-09", item: "Drainage Infrastructure Bond Package — $340M", vote: "against" },
      { date: "2024-05-22", item: "Award of West Houston Detention Pond contract to Allied Hydro", vote: "against" },
    ],
    campaignContributorsTopFive: ["Allied Hydro Construction", "Houston Police Officers' Union", "Memorial Villages Real Estate PAC", "Texas Builders Alliance PAC", "Bay Area Real Estate PAC"],
  },
  {
    officialId:   "OFF-HIDALGO-L",
    name:         "Lina Hidalgo",
    role:         "County Judge",
    body:         "Harris County",
    termStart:    "2023-01-02",
    termEnd:      "2027-01-01",
    notableVotes: [
      { date: "2024-04-10", item: "HCFCD five-year capital plan adoption — $2.5B", vote: "for" },
      { date: "2025-03-04", item: "Emergency operations supplemental appropriation $48M", vote: "for" },
    ],
    campaignContributorsTopFive: ["Harris County Democratic Lawyers Association", "Greater Houston Partnership", "Texas Civil Rights Project PAC", "Houston Federation of Teachers", "Greater Houston Builders Coalition"],
  },
];

const FOIA_TEMPLATES = {
  texas_pia_letter: `[Date]
[Records Officer Name and Title]
[Agency Name]
[Address]

RE: Public Information Act Request — [Subject]

To Whom It May Concern:

Pursuant to the Texas Public Information Act, Texas Government Code Chapter 552, Hearst Newspapers (Houston Chronicle / San Antonio Express-News / Austin American-Statesman) hereby requests the following public records:

1. [Specific record description with date range]
2. [Specific record description with date range]
3. [Specific record description with date range]

We respectfully request these records in electronic format if available. We further request a fee waiver pursuant to §552.267, as this request is made for a journalistic purpose in the public interest.

If any portion of this request is denied, please cite the specific statutory exception and provide a written justification as required by the Act.

Please respond within the ten business days specified by §552.221.

Sincerely,
[Reporter Name]
[Newspaper], Hearst Newspapers
[Email] | [Phone]`,
};

// ─── Tools ────────────────────────────────────────────────────────────────────

router.get("/get-investigative-standards", (_req: Request, res: Response) => {
  res.json({ success: true, ...INVESTIGATIVE_STANDARDS });
});

router.get("/get-entity-ontology", (req: Request, res: Response) => {
  const { jurisdiction, type } = req.query;
  let results = TEXAS_GOVT_ONTOLOGY;
  if (jurisdiction) {
    const j = (jurisdiction as string).toLowerCase();
    results = results.filter(e => e.jurisdiction.toLowerCase().includes(j));
  }
  if (type) {
    results = results.filter(e => e.type === type);
  }
  res.json({ success: true, count: results.length, entities: results });
});

router.get("/get-official-profile", (req: Request, res: Response) => {
  const { name, official_id } = req.query;
  let results = ELECTED_OFFICIAL_PROFILES;
  if (official_id) {
    results = results.filter(o => o.officialId === official_id);
  } else if (name) {
    const n = (name as string).toLowerCase();
    results = results.filter(o => o.name.toLowerCase().includes(n));
  }
  res.json({ success: true, count: results.length, officials: results });
});

router.get("/get-jurisdiction-foia-rules", (req: Request, res: Response) => {
  const { jurisdiction } = req.query;
  const j = ((jurisdiction as string) || "").toLowerCase();
  const matched = TEXAS_GOVT_ONTOLOGY.filter(e =>
    !j || e.jurisdiction.toLowerCase().includes(j) || e.canonicalName.toLowerCase().includes(j)
  );
  res.json({
    success:        true,
    jurisdictionFilter: jurisdiction || "all",
    statute:        "Texas Government Code Chapter 552 — Public Information Act",
    standardResponseDays: 10,
    feeWaiverProvision: "Tex. Gov't Code §552.267 — public-interest fee waiver available for journalistic requests",
    deniedResponseRequirement: "Agencies denying any portion must cite specific statutory exception and provide written justification",
    template:       FOIA_TEMPLATES.texas_pia_letter,
    agencies:       matched.map(e => ({
      entityId:        e.entityId,
      name:            e.canonicalName,
      foiaOfficer:     e.foiaOfficer,
      responseDays:    e.standardResponseDays,
    })),
  });
});

export default router;
