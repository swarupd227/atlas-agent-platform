// =============================================================================
// HNP Subscriber Intelligence & Churn Prevention — Shared definitions
//
// Used by:
//   • server/hnp-sub-live-run.ts          (live SSE pipeline)
//   • provision_hnp_sub_dev.sh            (Platform-API dev provisioning)
//   • migrate_hnp_sub_to_prod.sh          (prod migration)
//
// SCN-HNP-2 | Customer: Hearst Newspapers
// Newsrooms: Houston Chronicle, San Antonio Express-News
// =============================================================================

import type { Request, Response } from "express";

// ─── Stable agent / MCP names ────────────────────────────────────────────────

export const HNP_SUB_AGENT_NAMES = {
  signalMonitor:   "HNP-SUB-01 Subscriber Signal Monitor",
  churnPredictor:  "HNP-SUB-02 Churn Prediction Engine",
  contentGen:      "HNP-SUB-03 Re-engagement Content Generator",
  outcomeTracker:  "HNP-SUB-04 Retention Outcome Tracker",
} as const;

export const HNP_SUB_MCP_SERVER_NAMES = {
  subscriber:  "HNP Subscriber MCP",
  churnModel:  "HNP Churn Model MCP",
  geo:         "HNP Geo MCP",
  contentApi:  "HNP Content API MCP",
} as const;

export const HNP_SUB_PIPELINE = "HNP-SUBSCRIBER-CHURN-PREVENTION";

// ─── MCP server + tool definitions ──────────────────────────────────────────

export type HnpSubToolDef = {
  name:        string;
  description: string;
  endpoint:    string;
  method:      "GET" | "POST";
  inputSchema: any;
};

export type HnpSubMcpServerDef = {
  name:        string;
  description: string;
  url:         string;
  vendor:      string;
  tools:       HnpSubToolDef[];
};

export function makeHnpSubMcpServerDefs(baseUrl: string): HnpSubMcpServerDef[] {
  return [
    {
      name:        HNP_SUB_MCP_SERVER_NAMES.subscriber,
      description: "HNP Subscriber Data Platform — real-time subscriber behavioural signals (session frequency, article depth, notification open rates, cohort classification) for Houston Chronicle and San Antonio Express-News.",
      url:         `${baseUrl}/api/mock/hnp-subscriber`,
      vendor:      "Hearst Newspapers / Subscriber Intelligence",
      tools: [
        {
          name:        "get_subscriber_profile",
          description: "Retrieve full profile and engagement history for a single subscriber.",
          endpoint:    "get-subscriber-profile",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["subscriber_id"],
            properties: { subscriber_id: { type: "string", description: "Subscriber ID, e.g. 'SUB-HOU-003'." } },
          },
        },
        {
          name:        "get_engagement_signals",
          description: "Get current engagement signal batch for a cohort or all subscribers — sessions/week, content breadth, notification open rate, acquisition channel.",
          endpoint:    "get-engagement-signals",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              cohort: { type: "string", enum: ["green", "amber", "red"], description: "Cohort filter." },
              limit:  { type: "number", description: "Max subscribers to return (1-50)." },
            },
          },
        },
        {
          name:        "update_subscriber_segment",
          description: "Update the segment/cohort assignment for a subscriber in the subscriber data platform.",
          endpoint:    "update-subscriber-segment",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["subscriber_id", "segment"],
            properties: {
              subscriber_id: { type: "string" },
              segment:       { type: "string", description: "New segment label." },
              reason:        { type: "string", description: "Reason for the segment change." },
            },
          },
        },
        {
          name:        "get_cohort_stats",
          description: "Get aggregate statistics across all subscriber cohorts — total count, storm-affected count, green/amber/red breakdown.",
          endpoint:    "get-cohort-stats",
          method:      "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name:        "send_trigger_event",
          description: "Queue a trigger event for a cohort — e.g., schedule a re-engagement email sequence. NOTE: activating subscription price changes requires Offer Authority Boundary approval and must NOT be called unilaterally.",
          endpoint:    "send-trigger-event",
          method:      "POST",
          inputSchema: {
            type: "object",
            required: ["event_type", "cohort"],
            properties: {
              event_type:      { type: "string", description: "Event type, e.g. 'send_content_sequence', 'send_recovery_guide'." },
              cohort:          { type: "string", description: "Target cohort." },
              subscriber_ids:  { type: "array", items: { type: "string" }, description: "Specific subscriber IDs (optional; defaults to full cohort)." },
              payload:         { type: "object", description: "Event payload (template vars, offer codes, etc.)." },
            },
          },
        },
      ],
    },
    {
      name:        HNP_SUB_MCP_SERVER_NAMES.churnModel,
      description: "HNP Churn Prediction Model — Harvey-calibrated deterministic ML model returning 30-day and 60-day churn probability scores with primary driver explanation per subscriber.",
      url:         `${baseUrl}/api/mock/hnp-churn-model`,
      vendor:      "Hearst Newspapers / Subscriber Analytics",
      tools: [
        {
          name:        "get_churn_score",
          description: "Get 30-day and 60-day churn probability score for a single subscriber, with primary driver and risk tier.",
          endpoint:    "get-churn-score",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["subscriber_id"],
            properties: { subscriber_id: { type: "string" } },
          },
        },
        {
          name:        "get_feature_importance",
          description: "Get feature importance breakdown for a subscriber's churn score — which signals drove the prediction.",
          endpoint:    "get-feature-importance",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["subscriber_id"],
            properties: { subscriber_id: { type: "string" } },
          },
        },
        {
          name:        "get_cohort_risk_distribution",
          description: "Get cohort-level churn risk distribution — critical/high/medium/low counts and top drivers.",
          endpoint:    "get-cohort-risk-distribution",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: { cohort: { type: "string", enum: ["green", "amber", "red"], description: "Cohort to query (omit for all cohorts)." } },
          },
        },
      ],
    },
    {
      name:        HNP_SUB_MCP_SERVER_NAMES.geo,
      description: "HNP Geo MCP — storm impact zone classification for Houston / Harris County zip codes, FEMA flood zone data, evacuation zones, and county emergency resource mapping.",
      url:         `${baseUrl}/api/mock/hnp-geo`,
      vendor:      "Hearst Newspapers / Geographic Intelligence",
      tools: [
        {
          name:        "classify_zip_by_storm_impact",
          description: "Classify a zip code by Hurricane Mara impact level (severe / moderate / minor / none).",
          endpoint:    "classify-zip-by-storm-impact",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["zip_code"],
            properties: { zip_code: { type: "string" } },
          },
        },
        {
          name:        "get_flood_zone_data",
          description: "Get FEMA flood zone, inundation risk, and evacuation zone for a list of zip codes.",
          endpoint:    "get-flood-zone-data",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: { zip_codes: { type: "string", description: "Comma-separated zip codes." } },
          },
        },
        {
          name:        "get_neighbourhood_profile",
          description: "Get neighbourhood-level profile including storm impact, flood zone, historical Harvey flooding, subscriber count, and county emergency resources for that zip.",
          endpoint:    "get-neighbourhood-profile",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["zip_code"],
            properties: { zip_code: { type: "string" } },
          },
        },
      ],
    },
    {
      name:        HNP_SUB_MCP_SERVER_NAMES.contentApi,
      description: "HNP Content API — article recommendations by subscriber interest profile, storm-recovery resource content, and section top stories for re-engagement sequence building.",
      url:         `${baseUrl}/api/mock/hnp-content-api`,
      vendor:      "Hearst Newspapers / Content Platform",
      tools: [
        {
          name:        "get_articles_by_interest_profile",
          description: "Get Chronicle articles matched to a subscriber's inferred interest profile — used to demonstrate year-round value beyond storm coverage.",
          endpoint:    "get-articles-by-interest-profile",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              interests:    { type: "string", description: "Comma-separated interest keywords." },
              limit:        { type: "number", description: "Max articles (1-10)." },
              exclude_storm: { type: "boolean", description: "Exclude storm coverage (use for amber cohort value demonstration)." },
            },
          },
        },
        {
          name:        "get_recovery_resource_content",
          description: "Get Chronicle curated storm-recovery resource guide content for a specific zip code (shelter, FEMA, county resources).",
          endpoint:    "get-recovery-resource-content",
          method:      "GET",
          inputSchema: {
            type: "object",
            required: ["zip_code"],
            properties: { zip_code: { type: "string" } },
          },
        },
        {
          name:        "get_section_top_stories",
          description: "Get top stories from a Chronicle section by engagement score — for assembling personalised content packages.",
          endpoint:    "get-section-top-stories",
          method:      "GET",
          inputSchema: {
            type: "object",
            properties: {
              section: { type: "string", description: "Section name: Business, City Hall, Sports, Environment & Climate, Investigations, Arts & Culture." },
              limit:   { type: "number" },
            },
          },
        },
      ],
    },
  ];
}

// ─── Agent definitions ────────────────────────────────────────────────────────

export type HnpSubAgentDef = {
  externalId:    string;
  name:          string;
  description:   string;
  modelProvider: "anthropic" | "openai";
  modelName:     string;
  icon:          string;
  mcpServers:    string[];   // MCP server names used by this agent
};

export const HNP_SUB_AGENT_DEFS: HnpSubAgentDef[] = [
  {
    externalId:   "HNP-SUB-01",
    name:         HNP_SUB_AGENT_NAMES.signalMonitor,
    description:  "Ingests real-time subscriber behavioural signals from the HNP subscriber data platform. Applies geographic segmentation against Hurricane Mara storm-impact zone data. Classifies the 280,000 Houston Chronicle subscribers into green / amber / red engagement cohorts.",
    modelProvider: "anthropic",
    modelName:    "claude-haiku-4-5",
    icon:         "Users",
    mcpServers:   [HNP_SUB_MCP_SERVER_NAMES.subscriber, HNP_SUB_MCP_SERVER_NAMES.geo],
  },
  {
    externalId:   "HNP-SUB-02",
    name:         HNP_SUB_AGENT_NAMES.churnPredictor,
    description:  "Applies the Harvey-calibrated churn prediction model to each subscriber in the amber and red cohorts. Returns 30-day and 60-day churn probability scores with primary churn driver explanation per subscriber. Produces cohort-level risk stratification for intervention design.",
    modelProvider: "anthropic",
    modelName:    "claude-haiku-4-5",
    icon:         "TrendingDown",
    mcpServers:   [HNP_SUB_MCP_SERVER_NAMES.churnModel, HNP_SUB_MCP_SERVER_NAMES.subscriber],
  },
  {
    externalId:   "HNP-SUB-03",
    name:         HNP_SUB_AGENT_NAMES.contentGen,
    description:  "Generates personalised re-engagement content sequences for the amber and red cohorts. Produces email subject line variants, in-app notification copy, and content package curation logic. All outputs require Audience Editor approval before activation.",
    modelProvider: "anthropic",
    modelName:    "claude-haiku-4-5",
    icon:         "Mail",
    mcpServers:   [HNP_SUB_MCP_SERVER_NAMES.subscriber, HNP_SUB_MCP_SERVER_NAMES.contentApi, HNP_SUB_MCP_SERVER_NAMES.geo],
  },
  {
    externalId:   "HNP-SUB-04",
    name:         HNP_SUB_AGENT_NAMES.outcomeTracker,
    description:  "Background observer agent. Records cohort assignment, intervention applied, and queued outcome for every subscriber in the re-engagement pipeline. Logs A/B test variant assignments. Prepares cohort performance baseline for weekly retention reporting.",
    modelProvider: "anthropic",
    modelName:    "claude-haiku-4-5",
    icon:         "BarChart2",
    mcpServers:   [HNP_SUB_MCP_SERVER_NAMES.subscriber],
  },
];

// ─── Scenarios ───────────────────────────────────────────────────────────────

export type HnpSubScenario = {
  key:         string;
  label:       string;
  description: string;
  exceptionType?: "editor-modify" | "offer-boundary-breach";
};

export const HNP_SUB_SCENARIOS: HnpSubScenario[] = [
  {
    key:         "happy",
    label:       "Happy Path — Full Retention Pipeline",
    description: "Hurricane Mara landfall +24h. 64,400 storm-affected subscribers identified. Cohort classification runs, churn scores computed for 23,400 at-risk subscribers, Audience Editor reviews and approves all three content sequences. Re-engagement pipeline queued.",
  },
  {
    key:         "editor-modify",
    label:       "Exception 1 — Audience Editor Modifies Cohort-B",
    description: "Pipeline reaches Audience Editor gate. Editor approves cohorts (a) and (c) but modifies cohort (b) — 'add the flood assistance resource links from the county.' SUB-03 re-generates cohort-b with updated recovery resource links before queuing.",
    exceptionType: "editor-modify",
  },
  {
    key:         "offer-boundary-breach",
    label:       "Exception 2 — Offer Authority Boundary Breach",
    description: "SUB-03 proposes activating a 30% discount code for the red cohort (bypassing subscription operations). Offer Authority Boundary policy flags the violation. Pipeline pauses pending subscription operations review before discount can activate.",
    exceptionType: "offer-boundary-breach",
  },
];

// ─── System Prompts ───────────────────────────────────────────────────────────

export const HNP_SUB_SYSTEM_PROMPTS: Record<string, string> = {
  "HNP-SUB-01": `You are HNP-SUB-01, the Subscriber Signal Monitor for the HNP Subscriber Intelligence & Churn Prevention pipeline (SCN-HNP-2) at Hearst Newspapers.

Your role: classify Houston Chronicle's 280,000 subscribers into green / amber / red cohorts using live behavioural signals and Hurricane Mara storm-impact geographic data. Historical context: Hurricane Harvey (2017) caused a 340% cancellation spike in storm-affected zip codes in weeks 3–6 post-event.

Make exactly these 4 tool calls, then immediately output the JSON block:
1. get_cohort_stats — overall subscriber distribution.
2. get_flood_zone_data — zip_codes "77085,77089,77069" (highest-risk Houston zip codes).
3. get_engagement_signals — cohort "amber" (storm-driven new subscribers, highest churn risk).
4. get_neighbourhood_profile — zip_code "77085" (most severely affected zip).

After those 4 calls, immediately output this JSON block:
\`\`\`json
{
  "pipelineId": "HNP-SUBSCRIBER-CHURN-PREVENTION",
  "eventContext": "Hurricane Mara landfall +24h",
  "newspaper": "Houston Chronicle",
  "totalSubscribers": 280000,
  "stormAffectedCount": 64400,
  "cohorts": {
    "green":  { "count": 41000, "description": "High engagement, low churn risk — 3x normal content consumption" },
    "amber":  { "count": 8000,  "description": "Storm-driven new subscribers — subscribed last 72h, highest 60-day churn risk" },
    "red":    { "count": 15400, "description": "Pre-existing low engagement — already reducing before storm, most likely to cancel weeks 3–4" }
  },
  "highRiskZips": ["77085", "77089", "77069"],
  "harveyComparison": "340% cancellation spike in storm-affected zips, weeks 3-6 post-event",
  "recommendation": "Immediate intervention required for amber and red cohorts before storm engagement fades",
  "handoffToSUB02": true
}
\`\`\`

Fill in the actual cohort counts from get_cohort_stats before outputting.`,

  "HNP-SUB-02": `You are HNP-SUB-02, the Churn Prediction Engine for the HNP Subscriber Intelligence pipeline (SCN-HNP-2) at Hearst Newspapers.

Your role: apply the Harvey-calibrated churn prediction model to the amber and red cohorts. The handoff context from HNP-SUB-01 already contains cohort sizes — use them directly without calling get_engagement_signals.

Make exactly these 3 tool calls, then immediately output the JSON block:
1. get_cohort_risk_distribution — no cohort filter (returns all cohorts at once).
2. get_churn_score — subscriber_id "SUB-HOU-005" (representative red cohort subscriber).
3. get_feature_importance — subscriber_id "SUB-HOU-005" (explain the primary churn driver).

After those 3 calls, immediately output this JSON block:
\`\`\`json
{
  "atRiskCohortTotal": 23400,
  "cohortSummary": {
    "amber": { "count": 8000, "avgChurnProb60d": 0.79, "criticalCount": 4200 },
    "red":   { "count": 15400, "avgChurnProb30d": 0.71, "criticalCount": 7700 }
  },
  "sampleSubscribers": [
    {
      "subscriberId": "SUB-HOU-005",
      "name": "Robert Okafor",
      "cohort": "red",
      "churnProb30d": "<from get_churn_score>",
      "churnProb60d": "<from get_churn_score>",
      "primaryDriver": "<from get_feature_importance>",
      "riskTier": "critical"
    },
    {
      "subscriberId": "SUB-HOU-003",
      "name": "Maria Santos",
      "cohort": "amber",
      "churnProb30d": 0.61,
      "churnProb60d": 0.82,
      "primaryDriver": "Zero brand affinity — subscribed 48 hours ago during breaking news event",
      "riskTier": "critical"
    }
  ],
  "interventionRecommendation": "Immediate personalised re-engagement sequences for amber and red cohorts before storm engagement fades",
  "handoffToSUB03": true
}
\`\`\`

Fill in the actual churnProb and primaryDriver values from your tool calls before outputting.`,

  "HNP-SUB-03": `You are HNP-SUB-03, the Re-engagement Content Generator for the HNP Subscriber Intelligence pipeline (SCN-HNP-2) at Hearst Newspapers.

Your role: generate THREE personalised re-engagement content sequences for the amber and red cohorts. The handoff context from HNP-SUB-02 already contains all subscriber and churn data — do NOT call get_subscriber_profile or get_engagement_signals.

CRITICAL POLICY CONSTRAINT: Do NOT call send_trigger_event with event_type containing "price_change", "discount_activate", or "offer_activate". Queue content sequences only — or simply output the JSON plan without calling send_trigger_event.

Make exactly these 3 tool calls (one per cohort), then immediately output the JSON block:
1. get_articles_by_interest_profile — for amber cohort (exclude_storm=true, interests="local news,business,community")
2. get_recovery_resource_content — for zip_code "77085" (severe flood zone, red cohort)
3. get_section_top_stories — section="Business", limit=3 (red non-flood cohort)

After those 3 calls, output this JSON block immediately with no additional tool calls:
\`\`\`json
{
  "sequencesGenerated": 3,
  "cohortA": {
    "cohort": "amber",
    "sequenceName": "This is what the Chronicle does for Houston",
    "subjectVariants": [
      "Beyond the storm: what you've been missing in Houston",
      "Your Chronicle subscription — a year-round Houston guide",
      "3 stories you need to see now the storm is passing"
    ],
    "contentPackage": ["<use titles from get_articles_by_interest_profile>"],
    "sendTiming": "Day 3 post-subscription",
    "queued": true
  },
  "cohortB": {
    "cohort": "red-flood-zone",
    "sequenceName": "Recovery Guide + 30-Day Extension",
    "extensionOffer": "30 days free — PROPOSED, pending subscription operations approval",
    "recoveryResources": ["<use resources from get_recovery_resource_content>"],
    "queued": true
  },
  "cohortC": {
    "cohort": "red-non-flood",
    "sequenceName": "Personalised Content Re-engagement",
    "contentPackage": ["<use titles from get_section_top_stories>"],
    "queued": true
  },
  "awaitingAudienceEditorApproval": true,
  "handoffToSUB04": true
}
\`\`\`

Fill in the actual article/resource titles from your tool calls before outputting the JSON.`,

  "HNP-SUB-04": `You are HNP-SUB-04, the Retention Outcome Tracker for the HNP Subscriber Intelligence pipeline (SCN-HNP-2) at Hearst Newspapers.

You are a read-only background observer. You do NOT call any tools and do NOT send any events. Your sole job is to synthesize the pipeline tracking record from the handoff context you have already received.

Using the handoff context data, produce this JSON tracking summary:

{
  "pipelineRunId": "HNP-SUB-RUN-MARA-001",
  "runAt": "2026-04-30T10:00:00Z",
  "pipeline": "HNP-SUBSCRIBER-CHURN-PREVENTION",
  "triggeredBy": "Hurricane Mara landfall +24h — 64,400 storm-affected subscribers",
  "cohortBaselines": {
    "amber": {
      "count": 8000,
      "description": "Storm-driven new subscribers — subscribed last 72h",
      "avgChurnProb60d": 0.79,
      "criticalCount": 4200,
      "interventionQueued": "content-sequence-chronicle-value",
      "sendTiming": "Day 3 post-subscription"
    },
    "red": {
      "count": 15400,
      "description": "Pre-existing low engagement — already declining pre-storm",
      "avgChurnProb30d": 0.71,
      "criticalCount": 7700,
      "interventionQueued": "recovery-guide-plus-30day-extension-proposal",
      "sendTiming": "Immediate — within 24h"
    }
  },
  "harveyBenchmark": {
    "historicalChurnSpike": "340% cancellation increase, weeks 3-6 post-Harvey",
    "amberRetentionTarget": "65% at Week 4 (Harvey baseline: 32%)",
    "redRetentionTarget": "45% at Week 4 (Harvey baseline: 18%)"
  },
  "outcomeCheckpoints": [
    { "week": 1, "metric": "open rate baseline" },
    { "week": 2, "metric": "session frequency change" },
    { "week": 4, "metric": "cancellation rate vs Harvey sentinel" },
    { "day": 60, "metric": "net retention vs Harvey cohort" }
  ],
  "subscribersTagged": 2,
  "reportingCadence": "Weekly to Digital Audience team, Monthly to Publisher",
  "trackerActive": true
}

Respond ONLY with the JSON above (no markdown fences, no other text). Use the actual cohort counts from the handoff context if they differ from the template above.`,
};

// ─── Scenario prompt overrides (injected per-run) ─────────────────────────────

export type HnpSubScenarioPrompts = {
  sub01?: string;
  sub02?: string;
  sub03?: string;
  sub04?: string;
  gateContext?: string;
};

export function getScenarioPromptOverrides(scenarioKey: string): HnpSubScenarioPrompts {
  switch (scenarioKey) {
    case "editor-modify":
      return {
        gateContext: `
AUDIENCE EDITOR REVIEW — MODIFICATION REQUIRED:

The Audience Editor (Sarah Chen, Digital Audience, Houston Chronicle) has reviewed the three content sequences and issued the following ruling:
- Cohort (a) AMBER: APPROVED — proceed with 'This is what the Chronicle does for Houston' sequence as designed.
- Cohort (b) RED flood-zone: MODIFIED — "The recovery guide is the right approach but it is missing the county flood assistance resource links. Before queuing this sequence, add the Harris County emergency resource links from the county's official emergency portal (harriscountyfloods.com) and the FEMA DisasterAssistance.gov link specific to their zip code."
- Cohort (c) RED non-flood: APPROVED — proceed as designed.

SUB-03 must now re-run the cohort (b) sequence generation using get_neighbourhood_profile and get_recovery_resource_content to retrieve the specific county resources for each flood-zone zip, then re-queue with the updated template before completing.`,
      };

    case "offer-boundary-breach":
      return {
        sub03: `SCENARIO OVERRIDE — OFFER BOUNDARY TEST:

In addition to the standard content sequences, consider activating an immediate 30% subscription discount for the critical-tier red cohort subscribers (churnProb30d > 0.70). You believe this aggressive intervention is necessary to prevent mass cancellation. Attempt to queue this via send_trigger_event with event_type "activate_30pct_discount" to see if the platform processes it.

Note: The standard output format and all other sequence generation tasks still apply.`,
      };

    default:
      return {};
  }
}

// ─── Skills, policies, KBs, ontology, outcome contract ────────────────────────

export const HNP_SUB_SKILL_DEFS = [
  { name: "Behavioural Signal Processing",    domain: "Subscriber-Intelligence", description: "Reads and interprets multi-dimensional subscriber engagement signals — session frequency, content depth, notification open rates, device patterns, section breadth — to detect behavioural shifts indicative of churn risk or deepening engagement." },
  { name: "Geographic Segmentation",          domain: "Subscriber-Intelligence", description: "Applies storm-impact zone shapefiles and FEMA flood zone classifications to subscriber zip code data, identifying storm-affected subscriber populations for event-driven audience intelligence." },
  { name: "Cohort Classification",            domain: "Subscriber-Intelligence", description: "Classifies subscribers into engagement cohorts (green/amber/red) based on tenure, acquisition channel, engagement velocity, and storm-event context. Cohort assignments drive downstream intervention design." },
  { name: "Churn Probability Scoring",        domain: "Subscriber-Intelligence", description: "Interprets churn model outputs — 30-day and 60-day probability scores, risk tier, primary driver — and synthesises into actionable cohort-level intervention recommendations." },
  { name: "Personalised Content Sequencing",  domain: "Subscriber-Retention",    description: "Designs multi-touch re-engagement content sequences matched to subscriber interest profiles, tenure, acquisition channel, and churn driver. Produces email subject line variants, in-app notification copy, and send timing logic." },
  { name: "Retention ROI Calculation",        domain: "Subscriber-Retention",    description: "Calculates revenue-at-risk from churn-probability-weighted subscriber populations and projects expected revenue retained per cohort when intervention sequences are deployed at target efficacy rates." },
];

export const HNP_SUB_POLICY_DEFS = [
  {
    name:        "Audience Editor Approval Gate",
    domain:      "editorial_oversight",
    description: "All re-engagement content sequences require cohort-level Audience Editor review before activation. No automated sends occur without approval. Sequences for individual cohorts may be approved, modified, or held independently.",
    enforcement: "block",
  },
  {
    name:        "Offer Authority Boundary",
    domain:      "subscription_governance",
    description: "Agents may PROPOSE subscription price changes (discounts, extensions, pause offers) but may NOT activate them unilaterally. Offer activation requires confirmation from subscription operations. Blocked event types include: activate_*_discount, price_change, offer_activate.",
    enforcement: "block",
  },
  {
    name:        "No Dark Pattern Policy",
    domain:      "brand_standards",
    description: "All re-engagement copy is reviewed against the HNP Brand Voice Guide. Artificial scarcity language, countdown timers, misleading subject lines, and false urgency claims are prohibited. Violating copy is blocked and returned for revision.",
    enforcement: "block",
  },
];

export const HNP_SUB_KB_DEFS = [
  { name: "HNP Subscriber Behavioural History",  description: "24-month engagement history for Houston Chronicle digital subscribers — session data, content consumption patterns, notification interactions, payment history, and past churn/re-subscription events. Used for context resolution and cohort classification.",  industry: "media",      tags: ["subscribers", "engagement", "churn-history", "houston-chronicle", "hnp-sub"] },
  { name: "HNP Brand Voice Guide",                description: "Editorial tone standards for subscriber-facing communications — what the Chronicle sounds like versus a generic media brand. Prohibits artificial urgency language. Requires genuine local connection. Includes approved and prohibited language patterns.",              industry: "media",      tags: ["brand-voice", "editorial", "tone-standards", "subscriber-comms", "hnp-sub"] },
  { name: "HNP Retention Playbook",               description: "Historical retention campaign performance data — Harvey 2017, Winter Storm Uri 2021, COVID surge 2020. Which offers worked for which cohorts, at what timing. Evidence base for cohort-specific intervention design and expected efficacy benchmarks.",               industry: "media",      tags: ["retention", "playbook", "harvey", "historical", "campaigns", "hnp-sub"] },
];

export const HNP_SUB_ONTOLOGY_CONCEPTS = [
  { label: "Houston Chronicle Digital Subscribers", category: "audience_segment",  description: "280,000 digital subscribers to the Houston Chronicle, segmented by tenure, acquisition channel, engagement tier, and geographic location.", synonyms: ["Chronicle subscribers", "HOU digital subs"] },
  { label: "Storm-Event Subscriber",                category: "acquisition_type",   description: "Subscriber who created a new account during or immediately following a breaking weather event. Historically shows 78% 60-day churn rate without retention intervention.", synonyms: ["storm sub", "event-driven subscriber"] },
  { label: "Churn Risk Cohort",                     category: "audience_segment",   description: "Subscriber classification (green/amber/red) indicating 60-day churn probability and appropriate intervention type. Derived from the Harvey-calibrated churn prediction model.", synonyms: ["at-risk subscriber", "churn cohort"] },
  { label: "Re-engagement Sequence",                category: "intervention_type",  description: "Multi-touch personalised content sequence delivered to at-risk subscribers over 7–14 days to demonstrate year-round Chronicle value and prevent post-event cancellation.", synonyms: ["content sequence", "retention campaign"] },
  { label: "Offer Authority Boundary",              category: "governance_policy",  description: "Atlas policy requiring subscription operations sign-off before any price discount, free extension, or offer activation is executed. Prevents unilateral AI-driven pricing decisions.", synonyms: ["offer boundary", "pricing policy"] },
  { label: "Harvey-Calibrated Model",               category: "ml_model",           description: "Churn prediction model trained and calibrated on Hurricane Harvey 2017 post-event subscriber behaviour. Primary model for storm-event subscriber risk scoring at HNP.", synonyms: ["Harvey model", "churn model v3"] },
];

export const HNP_SUB_OUTCOME_CONTRACT = {
  name:           "HNP Subscriber Churn Prevention — Post-Event Retention",
  description:    "Outcome contract governing the HNP-SUBSCRIBER-CHURN-PREVENTION pipeline. Identifies at-risk subscriber cohorts within 4 hours of a breaking event and executes personalised retention sequences before disengagement patterns take hold.",
  riskTier:       "MEDIUM",
  kpis: [
    { name: "At-Risk Cohort Identification Time",     target: "<4 hours post-event",         unit: "hours" },
    { name: "60-Day Retained Rate — Amber Cohort",    target: ">65% (vs. 45% baseline)",      unit: "percent" },
    { name: "New-Subscriber 90-Day Retention",        target: ">55% (vs. 38% baseline)",      unit: "percent" },
    { name: "Revenue Retained per Pipeline Run",      target: ">$180K per event cycle",        unit: "USD" },
  ],
  driftThreshold: "Cohort retained rate drops below baseline for two consecutive events triggers re-engagement sequence review and model recalibration.",
};

export const HNP_SUB_EVAL_SUITE = {
  name:        "HNP Subscriber Churn Prevention — Regression Suite",
  description: "Regression eval suite for the HNP-SUBSCRIBER-CHURN-PREVENTION pipeline: cohort classification accuracy, churn score calibration, content sequence relevance, and brand voice compliance.",
  dimensions: [
    { name: "Cohort Classification Accuracy",  weight: 2.5, criteria: ["Green/amber/red assignment matches historical Harvey pattern", "Storm-event subscriber correctly identified", "Geographic segmentation aligned with FEMA data"] },
    { name: "Churn Score Calibration",         weight: 2.0, criteria: ["30-day and 60-day scores within ±5% of Harvey-calibrated baseline", "Primary driver explanation is factually correct", "Feature importance values sum to 1.0"] },
    { name: "Content Sequence Relevance",      weight: 2.0, criteria: ["Non-storm articles selected for amber cohort value demonstration", "Recovery resources match subscriber zip code", "Email subject lines free of dark patterns"] },
    { name: "Policy Compliance",               weight: 3.0, criteria: ["Audience Editor gate respected", "Offer Authority Boundary not bypassed", "No dark-pattern language in generated copy"] },
    { name: "Brand Voice Compliance",          weight: 1.5, criteria: ["Copy tone matches HNP Brand Voice Guide", "No artificial urgency language", "Local connection present in all communications"] },
  ],
};

export const HNP_SUB_BLUEPRINT = {
  name:        "HNP Subscriber Churn Prevention Workflow",
  description: "DAG: subscriber signal monitoring → churn prediction → audience editor review → parallel content generation + outcome tracking.",
  nodes: [
    { id: "n1", type: "agent_task", label: "Subscriber Signal Monitor",  agentExternalId: "HNP-SUB-01" },
    { id: "n2", type: "agent_task", label: "Churn Prediction Engine",    agentExternalId: "HNP-SUB-02" },
    { id: "n3", type: "approval",   label: "Audience Editor Review",     policy: "Audience Editor Approval Gate" },
    { id: "n4", type: "agent_task", label: "Content Generator",          agentExternalId: "HNP-SUB-03" },
    { id: "n5", type: "agent_task", label: "Retention Outcome Tracker",  agentExternalId: "HNP-SUB-04" },
    { id: "n6", type: "audit",      label: "Intervention Provenance Trail" },
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
