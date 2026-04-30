// =============================================================================
// HNP Government Beat Intelligence — Shared definitions
//
// Used by:
//   • server/hnp-govt-live-run.ts        (live SSE pipeline)
//   • provision_hnp_govt_dev.sh          (Platform-API dev provisioning)
//   • migrate_hnp_govt_to_prod.sh        (prod migration)
//
// All MCP servers, agents, KBs, policies, and scenario prompts are declared
// here so the live-run handler and the provisioning script stay in sync.
// =============================================================================

// ─── Stable agent / MCP names ────────────────────────────────────────────────
// Agents are looked up by NAME at runtime — IDs are assigned by the platform
// when the provisioning script POSTs to /api/agents.

export const HNP_GOVT_AGENT_NAMES = {
  corpusAnalyst:    "HNP-GOVT-01 Meeting Corpus Analyst",
  angleDetector:    "HNP-GOVT-02 Investigation Angle Detector",
  storyDraftAgent:  "HNP-GOVT-03 Story Draft Agent",
  foiaGenerator:    "HNP-GOVT-04 FOIA Request Generator",
} as const;

export const HNP_GOVT_MCP_SERVER_NAMES = {
  assembly:        "HNP Assembly MCP",
  knowledgeBase:   "HNP Knowledge Base MCP",
  publicRecords:   "HNP Public Records MCP",
  cms:             "HNP CMS MCP",
} as const;

// ─── MCP server definitions ──────────────────────────────────────────────────

export type HnpToolDef = {
  name:        string;
  description: string;
  endpoint:    string;
  method:      "GET" | "POST";
  inputSchema: any;
};

export type HnpMcpServerDef = {
  name:        string;
  description: string;
  url:         string;
  vendor:      string;
  tools:       HnpToolDef[];
};

export function makeHnpGovtMcpServerDefs(baseUrl: string): HnpMcpServerDef[] {
  return [
    {
      name:        HNP_GOVT_MCP_SERVER_NAMES.assembly,
      description: "Hearst Assembly transcription corpus — government meeting transcripts (Houston/Harris County), keyword alerts, and full-text search across all meetings.",
      url:         `${baseUrl}/api/mock/hnp-assembly`,
      vendor:      "Hearst Newspapers / Assembly",
      tools: [
        {
          name:        "get_transcripts",
          description: "List meeting transcripts in the Assembly corpus filtered by jurisdiction and lookback window.",
          endpoint:    "get-transcripts",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              jurisdiction:  { type: "string", description: "Jurisdiction filter — e.g., 'City of Houston', 'Harris County'." },
              limit:         { type: "number", description: "Max transcripts to return (1-100)." },
              lookback_days: { type: "number", description: "Days back from today (1-365)." },
            },
          },
        },
        {
          name:        "search_transcript_corpus",
          description: "Full-text search across all meeting transcripts. Returns matching excerpts with speaker, timestamp, and meeting metadata.",
          endpoint:    "search-transcript-corpus",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              query:        { type: "string", description: "Search keyword or phrase." },
              jurisdiction: { type: "string", description: "Optional jurisdiction filter." },
              limit:        { type: "number", description: "Max excerpts to return (1-100)." },
            },
          },
        },
        {
          name:        "get_transcript_by_meeting",
          description: "Retrieve a single full transcript including all excerpts, attendees, and metadata for a specific meeting ID.",
          endpoint:    "get-transcript-by-meeting",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["meeting_id"],
            properties: { meeting_id: { type: "string", description: "Assembly meeting ID, e.g., 'HOU-2026-04-22-001'." } },
          },
        },
        {
          name:        "get_keyword_alerts",
          description: "Retrieve Assembly keyword alerts — auto-flagged excerpts where the corpus matched a tracked keyword (flood, drainage, contractor, etc.).",
          endpoint:    "get-keyword-alerts",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              keyword:       { type: "string", description: "Specific keyword (defaults to standard tracked keyword set)." },
              lookback_days: { type: "number", description: "Days back from today (1-365)." },
            },
          },
        },
      ],
    },
    {
      name:        HNP_GOVT_MCP_SERVER_NAMES.knowledgeBase,
      description: "HNP institutional knowledge — investigative journalism standards, Texas government entity ontology, elected-official profiles, and jurisdiction-specific FOIA rules.",
      url:         `${baseUrl}/api/mock/hnp-knowledge-base`,
      vendor:      "Hearst Newspapers / Editorial Standards",
      tools: [
        {
          name:        "get_investigative_standards",
          description: "Retrieve the HNP internal investigative journalism standards — two-source rule, citation requirements, right-of-reply window, AI-drafting disclosure rules, publishable-fact criteria.",
          endpoint:    "get-investigative-standards",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "get_entity_ontology",
          description: "Retrieve the Texas government entity ontology — official names, jurisdiction boundaries, parent/subsidiary relationships, and FOIA officer contacts.",
          endpoint:    "get-entity-ontology",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              jurisdiction: { type: "string", description: "Jurisdiction filter." },
              type:         { type: "string", description: "Entity type filter — legislative_body, executive_agency, state_agency." },
            },
          },
        },
        {
          name:        "get_official_profile",
          description: "Retrieve elected-official profile(s) — role, term dates, notable votes, and top campaign contributors.",
          endpoint:    "get-official-profile",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              name:        { type: "string", description: "Name of official." },
              official_id: { type: "string", description: "Stable official ID (e.g., OFF-WHITMIRE-J)." },
            },
          },
        },
        {
          name:        "get_jurisdiction_foia_rules",
          description: "Retrieve jurisdiction-specific FOIA / public-records rules including statute, response window, fee waivers, and the Texas PIA letter template addressed to the correct records officer.",
          endpoint:    "get-jurisdiction-foia-rules",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: { jurisdiction: { type: "string", description: "Agency or jurisdiction filter." } },
          },
        },
      ],
    },
    {
      name:        HNP_GOVT_MCP_SERVER_NAMES.publicRecords,
      description: "Public records / FOIA portal interface — submit Texas Public Information Act requests, look up status, and search prior requests.",
      url:         `${baseUrl}/api/mock/hnp-public-records`,
      vendor:      "Hearst Newspapers / Public Records Desk",
      tools: [
        {
          name:        "submit_foia_request",
          description: "Submit a FOIA / Texas PIA request to a named government agency. Returns request ID, tracking URL, and expected response date. Routing is rejected if the agency is not in the known agencies list.",
          endpoint:    "submit-foia-request",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["agency", "subject", "records_sought"],
            properties: {
              agency:         { type: "string", description: "Agency name (must match known agencies — see get_agency_officer)." },
              requester:      { type: "string", description: "Requester identification line." },
              subject:        { type: "string", description: "Short subject line for the request." },
              records_sought: { type: "array", items: { type: "string" }, description: "Specific records being requested." },
            },
          },
        },
        {
          name:        "get_foia_status",
          description: "Look up the current status of a previously filed FOIA request by its request ID.",
          endpoint:    "get-foia-status",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["request_id"],
            properties: { request_id: { type: "string", description: "FOIA tracking ID." } },
          },
        },
        {
          name:        "search_prior_requests",
          description: "Search prior FOIA requests filed by HNP newsrooms by query, agency, or both.",
          endpoint:    "search-prior-requests",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              query:  { type: "string", description: "Subject keyword." },
              agency: { type: "string", description: "Agency name filter." },
              limit:  { type: "number", description: "Max results (1-100)." },
            },
          },
        },
        {
          name:        "get_agency_officer",
          description: "Look up the records officer, FOIA portal URL, and standard response window for a named agency. Use before submit_foia_request to confirm correct routing.",
          endpoint:    "get-agency-officer",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["agency"],
            properties: { agency: { type: "string", description: "Agency name." } },
          },
        },
      ],
    },
    {
      name:        HNP_GOVT_MCP_SERVER_NAMES.cms,
      description: "Hearst CMS — create story drafts (with watermark + source-attribution gate), assign drafts to reporters, set tags and SEO fields. All drafts land in the editorial queue marked DRAFT — NOT FOR PUBLICATION.",
      url:         `${baseUrl}/api/mock/hnp-cms`,
      vendor:      "Hearst Newspapers / CMS",
      tools: [
        {
          name:        "create_story_draft",
          description: "Create a structured story-skeleton draft in the CMS. The CMS enforces the source-attribution gate: every draft must carry at least one citation tracing a claim to a transcript timestamp, contract, or public record. Draft is marked DRAFT — NOT FOR PUBLICATION.",
          endpoint:    "create-story-draft",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["working_title", "newspaper", "desk", "body", "citations"],
            properties: {
              working_title: { type: "string" },
              newspaper:     { type: "string", description: "e.g., 'Houston Chronicle'." },
              desk:          { type: "string", description: "e.g., 'Investigations', 'City Hall'." },
              author_agent:  { type: "string", description: "Defaults to HNP-GOVT-03." },
              tags:          { type: "array", items: { type: "string" } },
              body:          { type: "string", description: "Skeleton body with placeholders marked [REPORTER TO ADD]." },
              citations:     {
                type: "array",
                items: {
                  type: "object",
                  required: ["claim", "source"],
                  properties: {
                    claim:     { type: "string" },
                    source:    { type: "string", description: "Transcript meeting ID, contract reference, or FOIA request ID." },
                    timestamp: { type: "number", description: "Transcript timestamp in seconds (if applicable)." },
                    speaker:   { type: "string" },
                  },
                },
              },
            },
          },
        },
        {
          name:        "assign_to_reporter",
          description: "Assign a story draft to a specific reporter (or auto-assign by desk).",
          endpoint:    "assign-to-reporter",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["draft_id"],
            properties: {
              draft_id: { type: "string" },
              reporter: { type: "string" },
              desk:     { type: "string" },
            },
          },
        },
        {
          name:        "set_story_tags",
          description: "Set or replace the tags on a story draft.",
          endpoint:    "set-story-tags",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["draft_id", "tags"],
            properties: {
              draft_id: { type: "string" },
              tags:     { type: "array", items: { type: "string" } },
            },
          },
        },
        {
          name:        "set_seo_fields",
          description: "Set the SEO fields (meta title, meta description, canonical slug) on a story draft.",
          endpoint:    "set-seo-fields",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["draft_id"],
            properties: {
              draft_id:         { type: "string" },
              meta_title:       { type: "string" },
              meta_description: { type: "string" },
              canonical_slug:   { type: "string" },
            },
          },
        },
      ],
    },
  ];
}

// ─── Agent definitions (used both by live-run and provisioning) ──────────────

export type HnpAgentDef = {
  externalId:        string;          // e.g., HNP-GOVT-01
  name:              string;
  description:       string;
  modelProvider:     "anthropic" | "openai";
  modelName:         string;
  mcpServerNames:    string[];        // names from HNP_GOVT_MCP_SERVER_NAMES
  kbNames:           string[];        // KB names this agent reads
  maxToolIterations: number;
  riskTier:          "LOW" | "MEDIUM" | "HIGH";
  department:        string;
};

export const HNP_GOVT_AGENT_DEFS: HnpAgentDef[] = [
  {
    externalId:        "HNP-GOVT-01",
    name:              HNP_GOVT_AGENT_NAMES.corpusAnalyst,
    description:       "Processes the entire Assembly transcript corpus for a specified jurisdiction and time window. Runs parallel extraction across transcripts: identifies commitments, named entities, dollar amounts, and topic clusters relevant to the breaking event context.",
    modelProvider:     "anthropic",
    modelName:         "claude-haiku-4-5",
    mcpServerNames:    [HNP_GOVT_MCP_SERVER_NAMES.assembly, HNP_GOVT_MCP_SERVER_NAMES.knowledgeBase],
    kbNames:           ["HNP Assembly Corpus Index", "HNP Investigative Journalism Standards", "Texas Government Entity Ontology"],
    maxToolIterations: 12,
    riskTier:          "MEDIUM",
    department:        "Investigations",
  },
  {
    externalId:        "HNP-GOVT-02",
    name:              HNP_GOVT_AGENT_NAMES.angleDetector,
    description:       "Receives the structured corpus extraction and applies investigative-journalism heuristics to identify publishable story angles. Scores each angle on newsworthiness, evidence strength, public interest, verification complexity, and estimated publication timeline.",
    modelProvider:     "anthropic",
    modelName:         "claude-haiku-4-5",
    mcpServerNames:    [HNP_GOVT_MCP_SERVER_NAMES.knowledgeBase, HNP_GOVT_MCP_SERVER_NAMES.publicRecords],
    kbNames:           ["HNP Investigative Journalism Standards", "Elected Official Profile Index"],
    maxToolIterations: 10,
    riskTier:          "HIGH",
    department:        "Investigations",
  },
  {
    externalId:        "HNP-GOVT-03",
    name:              HNP_GOVT_AGENT_NAMES.storyDraftAgent,
    description:       "Triggered after reporter approves at least one angle at the Review Brief gate. Produces a structured story skeleton: lede options, key facts in narrative order, verbatim quotes, interview-target list, and placeholder markers for reporter-gathered material. Every claim is marked with its source citation.",
    modelProvider:     "anthropic",
    modelName:         "claude-haiku-4-5",
    mcpServerNames:    [HNP_GOVT_MCP_SERVER_NAMES.assembly, HNP_GOVT_MCP_SERVER_NAMES.cms],
    kbNames:           ["HNP Investigative Journalism Standards", "HNP Assembly Corpus Index"],
    maxToolIterations: 10,
    riskTier:          "HIGH",
    department:        "Investigations",
  },
  {
    externalId:        "HNP-GOVT-04",
    name:              HNP_GOVT_AGENT_NAMES.foiaGenerator,
    description:       "Triggered alongside Story Draft. Analyses approved story angles to identify public records that would strengthen each claim. Generates Texas PIA letters addressed to the correct records officer based on the jurisdiction knowledge base, then files them via the public-records portal.",
    modelProvider:     "anthropic",
    modelName:         "claude-haiku-4-5",
    mcpServerNames:    [HNP_GOVT_MCP_SERVER_NAMES.publicRecords, HNP_GOVT_MCP_SERVER_NAMES.knowledgeBase],
    kbNames:           ["Texas Government Entity Ontology", "HNP Investigative Journalism Standards"],
    maxToolIterations: 10,
    riskTier:          "MEDIUM",
    department:        "Public Records Desk",
  },
];

// ─── Knowledge Bases ─────────────────────────────────────────────────────────

export const HNP_GOVT_KB_DEFS = [
  {
    name:        "HNP Assembly Corpus Index",
    description: "Index of all government meeting transcripts in Hearst's Assembly system — Houston (47 transcripts, past 90 days), San Antonio (31), Austin (28). Indexed by meeting type, date, attending officials, and keyword tags. Backed by the HNP Assembly MCP server for retrieval.",
  },
  {
    name:        "HNP Investigative Journalism Standards",
    description: "Internal HNP editorial standards for evidence requirements, attribution rules, two-source rule, right-of-reply, AI-drafting disclosure, and what constitutes a publishable fact vs. an unverified claim. Agent outputs are checked against these standards before surfacing to reporters.",
  },
  {
    name:        "Texas Government Entity Ontology",
    description: "Structured knowledge of Texas government — Harris County, City of Houston, HCFCD, TCEQ, TxDOT — with official names, jurisdiction boundaries, parent/subsidiary relationships, FOIA officer contacts, and Texas Public Information Act response windows.",
  },
  {
    name:        "Elected Official Profile Index",
    description: "Profiles for all covered elected officials with role, term dates, voting history on major local ordinances, and top campaign contributors. Used for context resolution and for surfacing potential conflict-of-interest signals on story angles.",
  },
];

// ─── Skills ──────────────────────────────────────────────────────────────────

export const HNP_GOVT_SKILL_DEFS = [
  {
    name:        "Multi-Document Synthesis",
    domain:      "Investigative-Journalism",
    description: "Reads and synthesises content across dozens of long government meeting transcripts in parallel, building a structured commitments-and-contradictions index suitable for downstream investigative angle detection.",
  },
  {
    name:        "Commitment Tracking",
    domain:      "Investigative-Journalism",
    description: "Identifies on-the-record commitments by elected officials and government agencies, classifies each as kept / broken / pending, and links each commitment to the precise transcript timestamp, speaker, and originating context.",
  },
  {
    name:        "Investigative Angle Assessment",
    domain:      "Investigative-Journalism",
    description: "Applies investigative-journalism heuristics to a corpus extraction and scores candidate story angles on newsworthiness (1-10), evidence strength (0-1.0), public interest (1-10), verification complexity, and estimated publication timeline.",
  },
  {
    name:        "Source Quote Extraction",
    domain:      "Investigative-Journalism",
    description: "Extracts verbatim quotes from approved transcripts with full provenance: meeting ID, timestamp, speaker, role, jurisdiction. Quotes are formatted ready for newsroom CMS ingestion with the source-attribution gate.",
  },
  {
    name:        "FOIA Request Drafting",
    domain:      "Public-Records",
    description: "Drafts jurisdiction-specific FOIA request letters using the correct statutory language, addressed to the correct records officer based on the jurisdiction ontology, and tracks the resulting filings.",
  },
  {
    name:        "Source Attribution Enforcement",
    domain:      "Investigative-Journalism",
    description: "Validates that every quantitative claim and every direct quote in agent output carries a source citation to a specific transcript timestamp, contract, vote roll, or FOIA response. Uncited claims are blocked from CMS submission.",
  },
];

// ─── Governance Policies ─────────────────────────────────────────────────────

export const HNP_GOVT_POLICY_DEFS = [
  {
    name:        "Human Reporter Gate",
    domain:      "editorial_oversight",
    description: "No story draft enters the CMS without explicit reporter angle approval at the Review Brief gate. The AI never initiates a publication pathway. Triggers if create_story_draft is called for an angle that has not been marked APPROVED.",
    enforcement: "block",
  },
  {
    name:        "Source Attribution Requirement",
    domain:      "editorial_standards",
    description: "Every fact in the story skeleton must carry a source citation to a specific transcript, timestamp, and speaker (or to a contract / vote roll / FOIA response). Uncited claims are blocked at the CMS gate.",
    enforcement: "block",
  },
  {
    name:        "Publication Boundary",
    domain:      "editorial_oversight",
    description: "All agent outputs are marked DRAFT — NOT FOR PUBLICATION. Removal of this watermark requires editorial sign-off through the normal CMS workflow. The agent cannot publish.",
    enforcement: "watermark",
  },
  {
    name:        "FOIA Accuracy Gate",
    domain:      "public_records",
    description: "FOIA request letters require reporter acknowledgement before filing. The agent cannot file unilaterally and must confirm agency routing through get_agency_officer before submit_foia_request.",
    enforcement: "approval_required",
  },
];

// ─── Outcome Contract ────────────────────────────────────────────────────────

export const HNP_GOVT_OUTCOME_CONTRACT = {
  name:           "HNP Government Beat Intelligence — Assembly-to-Investigation Pipeline",
  description:    "Outcome contract governing the HNP-HOUSTON-GOVT-BEAT pipeline. Compresses days of manual transcript synthesis into a 45-minute brief with full provenance, suitable for breaking-event government accountability reporting.",
  riskTier:       "HIGH",
  kpis: [
    { name: "Time from Meeting Transcription to Reporter Brief", target: "<45 min", unit: "minutes" },
    { name: "Story Angles per Brief",                            target: "2-4 ranked", unit: "angles" },
    { name: "Evidence Confidence Mean",                          target: ">0.82", unit: "score" },
    { name: "Reporter Approval Rate",                            target: ">75% of surfaced angles", unit: "percent" },
    { name: "FOIA Conversion Rate",                              target: "filed within 24 hrs of angle approval", unit: "hours" },
  ],
  driftThreshold: "Reporter rejection rate above 30% for two consecutive weeks triggers KB review and extraction model recalibration.",
};

// ─── Ontology concepts (Texas govt) ──────────────────────────────────────────

export const HNP_GOVT_ONTOLOGY_CONCEPTS = [
  { label: "Houston City Council",                      category: "legislative_body",  description: "Primary legislative body for the City of Houston; 16 council members + Mayor.", synonyms: ["HOU-COUNCIL", "Houston Council"] },
  { label: "Harris County Commissioners Court",         category: "legislative_body",  description: "Governing body of Harris County, TX; 4 commissioners + County Judge.", synonyms: ["HC-COMMISSIONERS", "Harris Commissioners"] },
  { label: "Harris County Flood Control District",      category: "executive_agency",  description: "County agency responsible for flood-damage reduction across Harris County watersheds.", synonyms: ["HCFCD"] },
  { label: "Texas Commission on Environmental Quality", category: "state_agency",      description: "Primary state agency for environmental regulation in Texas.", synonyms: ["TCEQ"] },
  { label: "Texas Department of Transportation",        category: "state_agency",      description: "State transportation agency responsible for highway infrastructure.", synonyms: ["TxDOT"] },
  { label: "Texas Public Information Act",              category: "regulation",        description: "Texas Government Code Chapter 552 — the Texas open records / FOIA statute.", synonyms: ["PIA", "Texas FOIA", "Tex. Gov't Code Ch. 552"] },
];

// ─── Eval suite definition (used by provisioning) ────────────────────────────

export const HNP_GOVT_EVAL_SUITE = {
  name:        "HNP Government Beat Intelligence — Regression Suite",
  description: "Regression eval suite covering the full HNP-HOUSTON-GOVT-BEAT pipeline: corpus synthesis fidelity, angle ranking calibration, source-attribution enforcement, and FOIA routing accuracy.",
  dimensions: [
    { name: "Corpus Synthesis Fidelity",    weight: 2.0, criteria: ["Commitments correctly classified kept/broken/pending", "Named entities resolved against ontology", "Dollar amounts within ±2% of source"] },
    { name: "Angle Newsworthiness",         weight: 1.5, criteria: ["Newsworthiness scores aligned with editorial standards", "Public-interest framing present", "Verification complexity quantified"] },
    { name: "Source Attribution Coverage",  weight: 3.0, criteria: ["Every claim cited", "Citations point to a specific transcript timestamp / contract / FOIA response", "No uncited adverse allegation"] },
    { name: "Right-of-Reply Compliance",    weight: 2.0, criteria: ["Subjects of adverse reporting flagged for reply outreach", "Reply window respected"] },
    { name: "FOIA Routing Accuracy",        weight: 2.0, criteria: ["Correct records officer addressed", "Statutory language correct (Tex. Gov't Code Ch. 552)", "Records sought specific and dated"] },
  ],
};

// ─── Blueprint (workflow DAG) ────────────────────────────────────────────────

export const HNP_GOVT_BLUEPRINT = {
  name:        "HNP Emergency Context Brief Workflow",
  description: "DAG for the Emergency Context Brief workflow — corpus synthesis → angle detection → reporter approval gate → parallel story drafting + FOIA filing.",
  nodes: [
    { id: "n1", type: "agent_task", label: "Corpus Synthesis",      agentExternalId: "HNP-GOVT-01" },
    { id: "n2", type: "agent_task", label: "Angle Detection",       agentExternalId: "HNP-GOVT-02" },
    { id: "n3", type: "approval",   label: "Reporter Brief Review", policy: "Human Reporter Gate" },
    { id: "n4", type: "agent_task", label: "Story Skeleton Draft",  agentExternalId: "HNP-GOVT-03" },
    { id: "n5", type: "agent_task", label: "FOIA Filing",           agentExternalId: "HNP-GOVT-04" },
    { id: "n6", type: "audit",      label: "Provenance Trail" },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n3", to: "n4", condition: "approved" },
    { from: "n3", to: "n5", condition: "approved" },
    { from: "n4", to: "n6" },
    { from: "n5", to: "n6" },
  ],
};

// ─── System prompts ──────────────────────────────────────────────────────────

export const HNP_GOVT_SYSTEM_PROMPTS: Record<string, string> = {
  "HNP-GOVT-01": `You are HNP-GOVT-01, the Meeting Corpus Analyst for the Hearst Newspapers HNP-HOUSTON-GOVT-BEAT pipeline.

Your role: process the Hearst Assembly transcript corpus for a specified jurisdiction and time window, run parallel extraction across all transcripts, and produce a structured commitments-and-evidence summary suitable for downstream investigation angle detection.

You always work in the context of a breaking event injected by the orchestrator (e.g., Hurricane Mara). Your synthesis must surface: (1) on-the-record commitments and their delivery status, (2) named entities including elected officials, government agencies, and contractors, (3) dollar figures promised vs. delivered, and (4) topic clusters relevant to the breaking event.

Every finding you produce MUST cite the specific transcript meeting ID, the timestamp in seconds, and the speaker. No uncited finding is acceptable.

Tools available to you:
1. get_transcripts — list transcripts in the corpus
2. search_transcript_corpus — full-text search across all transcripts
3. get_keyword_alerts — auto-flagged excerpts on tracked keywords
4. get_entity_ontology — Texas government entity definitions
5. get_investigative_standards — HNP editorial standards (consult to confirm what counts as a publishable fact)

Work methodically. Call get_transcripts first to confirm the corpus you are processing, then run targeted searches on flood, drainage, contractor, and bond keywords. Reconcile speaker references against the entity ontology when ambiguous.

When complete, output your synthesis in this JSON block (and nothing else after it):
\`\`\`json
{
  "jurisdiction": "Harris County + City of Houston",
  "transcriptsProcessed": 47,
  "totalHoursAnalyzed": 1247,
  "commitmentsExtracted": 23,
  "commitmentsKept": 6,
  "commitmentsBroken": 11,
  "commitmentsPending": 6,
  "namedEntities": { "officials": 14, "agencies": 5, "contractors": 4 },
  "topCommitments": [
    { "commitment": "$340M drainage improvements per 2023 bond", "speaker": "Mayor Whitmire", "meetingId": "HOU-2025-...-001", "timestampSec": 1842, "status": "broken", "deliveredPct": 34 }
  ],
  "topicClusters": ["flood_control", "contractor_oversight", "campaign_contributions"],
  "handoffToAgent02": true
}
\`\`\``,

  "HNP-GOVT-02": `You are HNP-GOVT-02, the Investigation Angle Detector for the HNP-HOUSTON-GOVT-BEAT pipeline.

Your role: receive the structured corpus extraction from HNP-GOVT-01 and apply investigative-journalism heuristics to surface publishable story angles. Score each angle on newsworthiness, evidence strength, public interest, verification complexity, and estimated publication timeline. Return a ranked angle list.

You MUST consult the HNP investigative standards before scoring (two-source rule, attribution requirements, right-of-reply window). You MUST consult elected-official profiles when an angle implicates a specific official (campaign contributors are a critical conflict-of-interest signal). You MUST search prior FOIA requests to know what records are already on file vs. what would need to be requested fresh.

Tools available:
1. get_investigative_standards — HNP editorial standards
2. get_official_profile — official term, voting history, top contributors
3. get_entity_ontology — entity resolution
4. search_prior_requests — what FOIA records HNP already has
5. get_jurisdiction_foia_rules — to estimate verification complexity

Work methodically. For every angle: confirm at least one transcript-level source citation, identify the second source needed for the two-source rule, list interview targets, and recommend FOIA records that would verify the claim.

When complete, output your ranked angles in this JSON block:
\`\`\`json
{
  "anglesIdentified": 3,
  "rankedAngles": [
    {
      "angleId": "A1",
      "headline": "$340M in drainage improvements promised in 2023 bond — only 34% delivered by storm date",
      "newsworthiness": 9,
      "evidenceStrength": 0.91,
      "publicInterest": 10,
      "verificationComplexity": "low",
      "estimatedPublicationDays": 2,
      "primarySource": { "meetingId": "HOU-...", "timestampSec": 1842, "speaker": "Mayor Whitmire" },
      "secondSourceRequired": "Public Works project status spreadsheet — file FOIA",
      "interviewTargets": ["Mayor Whitmire", "Council Member Kamin (sponsor)"]
    }
  ],
  "handoffToReporterGate": true
}
\`\`\``,

  "HNP-GOVT-03": `You are HNP-GOVT-03, the Story Draft Agent for the HNP-HOUSTON-GOVT-BEAT pipeline.

You are triggered ONLY after a reporter has explicitly approved one or more angles at the Review Brief gate. You produce a structured story SKELETON — not a finished article. Your output is a 40-minute head start on an investigation that would otherwise take days.

CRITICAL CONSTRAINTS:
1. Every claim in the body must carry a citation to its source (meeting ID + timestamp + speaker, or contract reference, or FOIA response ID).
2. Direct quotes must be reproduced verbatim from the transcript, with timestamp.
3. Use placeholder markers [REPORTER TO ADD: ...] for any information that requires reporter follow-up (interviews, on-scene reporting, document review).
4. The CMS will REJECT your draft if any claim is uncited (Source Attribution gate). Do not attempt to bypass this.
5. The CMS will apply the watermark DRAFT — NOT FOR PUBLICATION. Do not attempt to publish.

Tools available:
1. search_transcript_corpus — re-read source material for verbatim quotes
2. get_transcript_by_meeting — fetch full transcript context
3. create_story_draft — submit the skeleton to the CMS
4. assign_to_reporter — assign to the Investigations desk reporter (default: Clara Mendez)
5. set_story_tags — set thematic tags

Work methodically: assemble the skeleton with cited claims and verbatim quotes, then submit via create_story_draft, then assign_to_reporter, then set_story_tags.

When complete, output:
\`\`\`json
{
  "draftCreated": true,
  "draftId": "DRAFT-...",
  "newspaper": "Houston Chronicle",
  "desk": "Investigations",
  "assignedReporter": "Clara Mendez",
  "watermark": "DRAFT — NOT FOR PUBLICATION",
  "claimsCited": 8,
  "verbatimQuotes": 4,
  "placeholderMarkers": 5,
  "handoffToFOIA": true
}
\`\`\``,

  "HNP-GOVT-04": `You are HNP-GOVT-04, the FOIA Request Generator for the HNP-HOUSTON-GOVT-BEAT pipeline.

You are triggered alongside HNP-GOVT-03 when reporters approve one or more angles. Your job: identify the public records that would strengthen each claim, draft Texas Public Information Act request letters addressed to the correct records officer, and file them via the public-records portal.

CRITICAL CONSTRAINTS:
1. Use get_agency_officer to confirm the agency exists and to retrieve the records officer name BEFORE calling submit_foia_request. If the agency is unknown the submission will be rejected.
2. Use get_jurisdiction_foia_rules to retrieve the correct statutory language template (Texas Government Code Chapter 552).
3. Records sought must be SPECIFIC — name the document type and the date range. Generic requests are rejected by agencies.
4. Search prior FOIA requests first — never duplicate a filed-and-delivered request.

Tools available:
1. get_jurisdiction_foia_rules — retrieve statute, template, and FOIA officer for a jurisdiction
2. get_agency_officer — confirm agency routing
3. get_entity_ontology — disambiguate jurisdiction
4. search_prior_requests — avoid duplicate filings
5. submit_foia_request — file the request

Work methodically. For each approved angle, confirm agency, check prior requests, then file with specific records sought.

When complete, output:
\`\`\`json
{
  "requestsFiled": 2,
  "duplicatesAvoided": 1,
  "filings": [
    { "agency": "Houston Public Works Department", "subject": "...", "requestId": "PIA-HOU-...", "expectedResponseBy": "..." }
  ]
}
\`\`\``,
};

// ─── Scenario prompts (happy + 2 exceptions) ─────────────────────────────────

export type HnpScenarioKey = "happy" | "attribution-block" | "foia-routing-fail";

export const HNP_GOVT_SCENARIO_PROMPTS: Record<HnpScenarioKey, {
  label:           string;
  agent01:         string;
  agent02:         string;
  reporterGate:    string;
  agent03:         string;
  agent04:         string;
  completeMsg:     string;
}> = {
  "happy": {
    label: "Happy Path — Full Hurricane Mara emergency context brief",
    agent01: `Hurricane Mara is forecast to make landfall in 36 hours along the Bolivar Peninsula. The newsroom needs an Emergency Context Brief synthesised from the Hearst Assembly corpus.

Process the entire Houston + Harris County corpus from the past 90 days (47 transcripts, ~1,247 hours). Surface:
1. All on-the-record drainage and flood-mitigation commitments by elected officials and HCFCD — kept, broken, or pending
2. Contractor names tied to drainage infrastructure projects in those commitments
3. Specific dollar figures promised vs. delivered
4. Council member statements on flood readiness

Call get_transcripts (jurisdiction='Harris County' then 'City of Houston'), then search_transcript_corpus on 'drainage', 'flood', 'contractor', 'bond'. Reconcile speakers against get_entity_ontology and consult get_investigative_standards before classifying anything as a publishable finding.

End your response with the synthesis JSON block per your system prompt.`,

    agent02: `HNP-GOVT-01 has produced a corpus synthesis for the Hurricane Mara Emergency Context Brief. Apply investigative heuristics to surface 3 publishable story angles:
A1: $340M drainage bond — only 34% delivered by storm date
A2: HCFCD's own risk model predicted Cat 3 + this exact landfall path
A3: Two council members who voted against the infrastructure package received contributions from the contractor that won the contract anyway

For each: consult get_investigative_standards, look up officials with get_official_profile (Pollard, Huffman for A3; Whitmire, Kamin for A1), search_prior_requests to see what FOIA records HNP already has, and use get_jurisdiction_foia_rules to estimate verification complexity.

End with the ranked-angles JSON block per your system prompt.`,

    reporterGate: "Reporter Clara Mendez reviews the brief in her Slack/Assembly interface. She approves angles A1 and A3, marks A2 as 'monitor — verify independently before publishing' (HCFCD model needs technical sourcing review). Approval payload: { approved: ['A1', 'A3'], deferred: ['A2'], reporter: 'Clara Mendez', desk: 'Investigations' }.",

    agent03: `Reporter Clara Mendez has approved angles A1 ($340M drainage bond delivery shortfall) and A3 (council member contractor contributions). Produce a structured story skeleton for the Houston Chronicle Investigations desk covering both approved angles.

For each cited claim, include the meeting ID, timestamp, speaker, and verbatim quote. Use [REPORTER TO ADD: ...] placeholders for: contractor performance documents (FOIA-pending), interviews with the affected council members, on-scene flooding reports.

Call search_transcript_corpus to retrieve the verbatim quotes (drainage, contractor, bond), then create_story_draft with at least 6 citations and 3 verbatim quotes, then assign_to_reporter (Clara Mendez, Investigations desk), then set_story_tags (['hurricane-mara','drainage-bond','contractor-oversight','accountability']).

End with the draft JSON block per your system prompt.`,

    agent04: `Reporter Clara Mendez has approved angles A1 and A3 — file FOIA requests to verify them. The records you need:

1. Houston Public Works Department — full project-by-project status of every project funded by the 2023 Drainage Infrastructure Bond Package (covering 2023-11 through current)
2. Houston Public Works Department — contractor performance reports for Allied Hydro Construction, ACE Engineering & Design, Brookline Construction Group (covering 2024-01 through current)

Use get_agency_officer to confirm 'Houston Public Works Department' routing. Use search_prior_requests with query 'drainage bond' and agency 'Houston Public Works Department' — if a related request is already delivered, avoid duplicating it. Use get_jurisdiction_foia_rules with jurisdiction 'Houston' to retrieve the Texas PIA template. Then submit_foia_request for each non-duplicate.

End with the filings JSON block per your system prompt.`,

    completeMsg: "Hurricane Mara Emergency Context Brief complete — 47 transcripts synthesised, 3 angles surfaced, 2 angles reporter-approved, draft skeleton in CMS, FOIA filed.",
  },

  "attribution-block": {
    label: "Exception — Source Attribution Gate blocks an uncited claim",
    agent01: `Run the standard corpus synthesis for Hurricane Mara per your system prompt. Use get_transcripts and search_transcript_corpus on 'drainage', 'flood', 'contractor'. End with the synthesis JSON.`,
    agent02: `Apply investigative heuristics — surface the same 3 angles (A1 drainage bond shortfall, A2 HCFCD model, A3 contractor contributions). End with ranked-angles JSON.`,
    reporterGate: "Reporter approves A1 only.",
    agent03: `Reporter Clara Mendez approved angle A1. Produce the story skeleton — BUT include one claim deliberately without a citation in the citations array (this simulates an upstream extraction error). The CMS source-attribution gate WILL reject this draft.

When the CMS rejects, do NOT attempt to bypass. Report the rejection clearly, explain which claim was uncited, and indicate that the upstream extraction needs review before resubmission.

End your response with this JSON block:
\`\`\`json
{ "draftCreated": false, "rejected": true, "rejectionReason": "BLOCKED: source-attribution gate ...", "policy": "HNP Source Attribution Requirement", "remediation": "Re-extract uncited claim with proper transcript citation" }
\`\`\``,
    agent04: `Standard FOIA filing for angle A1 — Houston Public Works drainage bond project status. Confirm agency, check prior requests, then submit_foia_request. End with filings JSON.`,
    completeMsg: "Exception scenario — Source Attribution Gate fired. Story draft was blocked because one claim was uncited. Editorial workflow correctly prevented an unverifiable claim from entering the CMS.",
  },

  "foia-routing-fail": {
    label: "Exception — FOIA routing rejected for unknown agency",
    agent01: `Run the standard corpus synthesis for Hurricane Mara per your system prompt. End with synthesis JSON.`,
    agent02: `Apply investigative heuristics to surface 3 angles. End with ranked-angles JSON.`,
    reporterGate: "Reporter approves A1 (drainage bond) and A3 (contractor contributions).",
    agent03: `Reporter approved A1 and A3. Produce the story skeleton with full citations and verbatim quotes per your system prompt. Submit, assign, tag. End with draft JSON.`,
    agent04: `File FOIAs for A1 and A3. For A1 attempt to file with the agency name 'City of Houston Drainage Office' (this is NOT a registered agency in the records portal — the request WILL be rejected). When the rejection comes back, do NOT retry blindly: call get_agency_officer to discover the correct agency name ('Houston Public Works Department'), then re-submit correctly.

For A3: file with 'Houston Public Works Department' for contractor performance reports (Allied Hydro Construction, 2024-01 through current).

End with this JSON:
\`\`\`json
{
  "requestsFiled": 2,
  "routingFailures": 1,
  "remediation": "Used get_agency_officer to discover correct agency name after initial rejection",
  "filings": [
    { "agency": "Houston Public Works Department", "subject": "...", "requestId": "PIA-..." },
    { "agency": "Houston Public Works Department", "subject": "...", "requestId": "PIA-..." }
  ]
}
\`\`\``,
    completeMsg: "Exception scenario — FOIA routing rejected, agent recovered by calling get_agency_officer to discover correct routing, both requests filed successfully.",
  },
};
