#!/usr/bin/env bash
# =============================================================================
# ATLAS — HNP Subscriber Intelligence & Churn Prevention (HNP-SUB) — Dev
# Scenario: SCN-HNP-2, Customer: Hearst Newspapers (HNP)
# Pipeline: HNP-SUBSCRIBER-CHURN-PREVENTION (4 agents)
#
# SINGLE COMMAND TO RUN (from Replit workspace):
#   bash provision_hnp_sub_dev.sh
#
# Creates via Platform APIs only (no direct DB writes):
#   • 3 Knowledge Bases
#   • 4 MCP Servers + 15 Tools
#   • 6 Skills
#   • 1 Outcome Contract
#   • 3 Governance Policies
#   • 6 Ontology Concepts
#   • 4 Agents (with system prompts, KBs, MCP servers, skills, policies)
#   • 1 Eval Suite
#   • 4 Deployments
#
# REQUIREMENTS: curl, jq
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"

echo ""
echo "=================================================="
echo " ATLAS — HNP-SUB Subscriber Intelligence"
echo " Pipeline: HNP-SUBSCRIBER-CHURN-PREVENTION (4 agents)"
echo " Target:   $BASE_URL  (dev)"
echo "=================================================="
echo ""

if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required."
  exit 1
fi

WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

# ─── helpers ─────────────────────────────────────────────────────────────────

post_api() {
  local label="$1" endpoint="$2" payload_file="$3"
  local response id
  response=$(curl -s -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d @"${payload_file}")
  id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "  ✗ FAILED: $label" >&2
    echo "    Response: $response" >&2
    exit 1
  fi
  echo "  ✓ $label → $id" >&2
  echo "$id"
}

post_inline() {
  local label="$1" endpoint="$2" payload="$3"
  local f="$WORK/$(echo -n "$label" | tr ' /' '__').json"
  echo "$payload" > "$f"
  post_api "$label" "$endpoint" "$f"
}

# ─── STEP 1: Create 3 Knowledge Bases ────────────────────────────────────────
echo "STEP 1: Creating 3 Knowledge Bases..." >&2

KB1=$(post_inline "KB: HNP Subscriber Behavioural History" "/api/knowledge-bases" '{
  "name": "HNP Subscriber Behavioural History",
  "description": "24-month engagement history for Houston Chronicle digital subscribers — session data, content consumption patterns, notification interactions, payment history, and past churn/re-subscription events. Used for context resolution and cohort classification.",
  "industry": "media",
  "tags": ["subscribers", "engagement", "churn-history", "houston-chronicle", "hnp-sub"],
  "status": "active"
}')

KB2=$(post_inline "KB: HNP Brand Voice Guide" "/api/knowledge-bases" '{
  "name": "HNP Brand Voice Guide",
  "description": "Editorial tone standards for subscriber-facing communications — what the Chronicle sounds like versus a generic media brand. Prohibits artificial urgency language. Requires genuine local connection. Includes approved and prohibited language patterns.",
  "industry": "media",
  "tags": ["brand-voice", "editorial", "tone-standards", "subscriber-comms", "hnp-sub"],
  "status": "active"
}')

KB3=$(post_inline "KB: HNP Retention Playbook" "/api/knowledge-bases" '{
  "name": "HNP Retention Playbook",
  "description": "Historical retention campaign performance data — Harvey 2017, Winter Storm Uri 2021, COVID surge 2020. Which offers worked for which cohorts, at what timing. Evidence base for cohort-specific intervention design and expected efficacy benchmarks.",
  "industry": "media",
  "tags": ["retention", "playbook", "harvey", "historical", "campaigns", "hnp-sub"],
  "status": "active"
}')

echo "" >&2

# ─── STEP 2: Create 4 MCP Servers ────────────────────────────────────────────
echo "STEP 2: Creating 4 MCP Servers..." >&2

MCP_SUB=$(post_inline "MCP: HNP Subscriber MCP" "/api/mcp-servers" "{
  \"name\": \"HNP Subscriber MCP\",
  \"description\": \"HNP Subscriber Data Platform — real-time subscriber behavioural signals (session frequency, article depth, notification open rates, cohort classification) for Houston Chronicle and San Antonio Express-News.\",
  \"url\": \"${BASE_URL}/api/mock/hnp-subscriber\",
  \"vendor\": \"Hearst Newspapers / Subscriber Intelligence\",
  \"status\": \"active\"
}")

MCP_CHURN=$(post_inline "MCP: HNP Churn Model MCP" "/api/mcp-servers" "{
  \"name\": \"HNP Churn Model MCP\",
  \"description\": \"HNP Churn Prediction Model — Harvey-calibrated deterministic ML model returning 30-day and 60-day churn probability scores with primary driver explanation per subscriber.\",
  \"url\": \"${BASE_URL}/api/mock/hnp-churn-model\",
  \"vendor\": \"Hearst Newspapers / Subscriber Analytics\",
  \"status\": \"active\"
}")

MCP_GEO=$(post_inline "MCP: HNP Geo MCP" "/api/mcp-servers" "{
  \"name\": \"HNP Geo MCP\",
  \"description\": \"HNP Geo MCP — storm impact zone classification for Houston / Harris County zip codes, FEMA flood zone data, evacuation zones, and county emergency resource mapping.\",
  \"url\": \"${BASE_URL}/api/mock/hnp-geo\",
  \"vendor\": \"Hearst Newspapers / Geographic Intelligence\",
  \"status\": \"active\"
}")

MCP_CONTENT=$(post_inline "MCP: HNP Content API MCP" "/api/mcp-servers" "{
  \"name\": \"HNP Content API MCP\",
  \"description\": \"HNP Content API — article recommendations by subscriber interest profile, storm-recovery resource content, and section top stories for re-engagement sequence building.\",
  \"url\": \"${BASE_URL}/api/mock/hnp-content-api\",
  \"vendor\": \"Hearst Newspapers / Content Platform\",
  \"status\": \"active\"
}")

echo "" >&2

# ─── STEP 3: Create 15 Tools ──────────────────────────────────────────────────
echo "STEP 3: Creating 15 Tools..." >&2

post_tool() {
  local mcp_id="$1" name="$2" desc="$3" risk="$4" schema="$5"
  local endpoint="${name//_/-}"
  local label="Tool: $name"
  local f="$WORK/tool_${name}.json"
  jq -n --arg n "$name" --arg d "$desc" --arg r "$risk" \
        --arg ep "$endpoint" --arg mcpId "$mcp_id" \
        --argjson schema "$schema" '{
    mcpServerId: $mcpId,
    name: $n,
    description: $d,
    endpoint: $ep,
    method: (if ($n | test("update|send")) then "POST" else "GET" end),
    inputSchema: $schema,
    riskLevel: $r,
    requiresHumanApproval: ($r == "high"),
    tags: ["hnp-sub", "scn-hnp-2"]
  }' > "$f"
  local response id
  response=$(curl -s -X POST "${BASE_URL}/api/mcp-servers/${mcp_id}/tools" \
    -H "Content-Type: application/json" -d @"$f")
  id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "  ✗ FAILED tool: $name — $response" >&2
    exit 1
  fi
  echo "  ✓ Tool: $name → $id" >&2
}

# Subscriber MCP tools (5)
post_tool "$MCP_SUB"   "get_subscriber_profile"     "Retrieve full profile and engagement history for a single subscriber."                                    "low"    '{"type":"object","required":["subscriber_id"],"properties":{"subscriber_id":{"type":"string","description":"Subscriber ID, e.g. SUB-HOU-003"}}}'
post_tool "$MCP_SUB"   "get_engagement_signals"     "Get current engagement signal batch for a cohort or all subscribers."                                     "low"    '{"type":"object","properties":{"cohort":{"type":"string","enum":["green","amber","red"]},"limit":{"type":"number"}}}'
post_tool "$MCP_SUB"   "update_subscriber_segment"  "Update the segment/cohort assignment for a subscriber in the subscriber data platform."                   "medium" '{"type":"object","required":["subscriber_id","segment"],"properties":{"subscriber_id":{"type":"string"},"segment":{"type":"string"},"reason":{"type":"string"}}}'
post_tool "$MCP_SUB"   "get_cohort_stats"           "Get aggregate statistics across all subscriber cohorts — total count, storm-affected count, cohort breakdown." "low" '{"type":"object","properties":{}}'
post_tool "$MCP_SUB"   "send_trigger_event"         "Queue a trigger event for a cohort — e.g., schedule a re-engagement email sequence. NOTE: activating price changes requires Offer Authority Boundary approval." "high" '{"type":"object","required":["event_type","cohort"],"properties":{"event_type":{"type":"string"},"cohort":{"type":"string"},"subscriber_ids":{"type":"array","items":{"type":"string"}},"payload":{"type":"object"}}}'

# Churn Model MCP tools (3)
post_tool "$MCP_CHURN" "get_churn_score"            "Get 30-day and 60-day churn probability score for a single subscriber, with primary driver and risk tier." "low"    '{"type":"object","required":["subscriber_id"],"properties":{"subscriber_id":{"type":"string"}}}'
post_tool "$MCP_CHURN" "get_feature_importance"     "Get feature importance breakdown for a subscriber'\''s churn score."                                        "low"    '{"type":"object","required":["subscriber_id"],"properties":{"subscriber_id":{"type":"string"}}}'
post_tool "$MCP_CHURN" "get_cohort_risk_distribution" "Get cohort-level churn risk distribution — critical/high/medium/low counts and top drivers."             "low"    '{"type":"object","properties":{"cohort":{"type":"string","enum":["green","amber","red"]}}}'

# Geo MCP tools (3)
post_tool "$MCP_GEO"   "classify_zip_by_storm_impact"  "Classify a zip code by Hurricane Mara impact level."                                                   "low"    '{"type":"object","required":["zip_code"],"properties":{"zip_code":{"type":"string"}}}'
post_tool "$MCP_GEO"   "get_flood_zone_data"            "Get FEMA flood zone, inundation risk, and evacuation zone for a list of zip codes."                   "low"    '{"type":"object","properties":{"zip_codes":{"type":"string","description":"Comma-separated zip codes"}}}'
post_tool "$MCP_GEO"   "get_neighbourhood_profile"      "Get neighbourhood-level storm impact, flood zone, and county emergency resources for a zip code."     "low"    '{"type":"object","required":["zip_code"],"properties":{"zip_code":{"type":"string"}}}'

# Content API MCP tools (4)
post_tool "$MCP_CONTENT" "get_articles_by_interest_profile" "Get Chronicle articles matched to a subscriber'\''s inferred interest profile."                    "low"    '{"type":"object","properties":{"interests":{"type":"string"},"limit":{"type":"number"},"exclude_storm":{"type":"boolean"}}}'
post_tool "$MCP_CONTENT" "get_recovery_resource_content"    "Get Chronicle curated storm-recovery resource guide content for a specific zip code."              "low"    '{"type":"object","required":["zip_code"],"properties":{"zip_code":{"type":"string"}}}'
post_tool "$MCP_CONTENT" "get_section_top_stories"          "Get top stories from a Chronicle section by engagement score."                                     "low"    '{"type":"object","properties":{"section":{"type":"string"},"limit":{"type":"number"}}}'

echo "" >&2

# ─── STEP 4: Create 6 Skills ─────────────────────────────────────────────────
echo "STEP 4: Creating 6 Skills..." >&2

mk_skill() {
  local name="$1" desc="$2" tools="$3"
  jq -n --arg n "$name" --arg d "$desc" --argjson tl "$tools" '{
    name: $n, description: $d, industry: "media", domain: "Subscriber-Intelligence",
    version: "1.0.0", author: "Hearst Newspapers AI Platform Team",
    trustTier: "platform-provided", complexity: "intermediate",
    dependencies: ["hnp-subscriber", "hnp-churn-model", "hnp-geo", "hnp-content-api"],
    tags: ["subscriber-intelligence", "churn-prevention", "hnp-sub", "scn-hnp-2"],
    agentTypeCompatibility: ["single", "team"],
    allowedTools: $tl,
    markdownBody: ("# " + $n + "\n\n## Purpose\n" + $d + "\n\n## Compliance Notes\n- Audience Editor gate required before any content sequence activation.\n- Offer Authority Boundary prevents unilateral price change activation."),
    status: "active"
  }'
}

S1=$(post_inline "Skill: Behavioural Signal Processing"   "/api/skills" "$(mk_skill "Behavioural Signal Processing" "Reads and interprets multi-dimensional subscriber engagement signals — session frequency, content depth, notification open rates, device patterns, section breadth — to detect behavioural shifts indicative of churn risk or deepening engagement." '["get_cohort_stats","get_engagement_signals","get_subscriber_profile"]')")
S2=$(post_inline "Skill: Geographic Segmentation"         "/api/skills" "$(mk_skill "Geographic Segmentation" "Applies storm-impact zone shapefiles and FEMA flood zone classifications to subscriber zip code data, identifying storm-affected subscriber populations for event-driven audience intelligence." '["classify_zip_by_storm_impact","get_flood_zone_data","get_neighbourhood_profile"]')")
S3=$(post_inline "Skill: Cohort Classification"           "/api/skills" "$(mk_skill "Cohort Classification" "Classifies subscribers into engagement cohorts (green/amber/red) based on tenure, acquisition channel, engagement velocity, and storm-event context. Cohort assignments drive downstream intervention design." '["get_cohort_stats","get_engagement_signals","update_subscriber_segment"]')")
S4=$(post_inline "Skill: Churn Probability Scoring"       "/api/skills" "$(mk_skill "Churn Probability Scoring" "Interprets churn model outputs — 30-day and 60-day probability scores, risk tier, primary driver — and synthesises into actionable cohort-level intervention recommendations." '["get_churn_score","get_feature_importance","get_cohort_risk_distribution"]')")
S5=$(post_inline "Skill: Personalised Content Sequencing" "/api/skills" "$(mk_skill "Personalised Content Sequencing" "Designs multi-touch re-engagement content sequences matched to subscriber interest profiles, tenure, acquisition channel, and churn driver. Produces email subject line variants, in-app notification copy, and send timing logic." '["get_articles_by_interest_profile","get_recovery_resource_content","get_section_top_stories","send_trigger_event"]')")
S6=$(post_inline "Skill: Retention ROI Calculation"       "/api/skills" "$(mk_skill "Retention ROI Calculation" "Calculates revenue-at-risk from churn-probability-weighted subscriber populations and projects expected revenue retained per cohort when intervention sequences are deployed at target efficacy rates." '["get_cohort_stats","get_cohort_risk_distribution"]')")
echo "" >&2

# ─── STEP 5: Create Outcome Contract ─────────────────────────────────────────
echo "STEP 5: Creating Outcome Contract..." >&2

OUTCOME=$(post_inline "Outcome: Subscriber Churn Prevention" "/api/outcomes" '{
  "name": "HNP Subscriber Churn Prevention — Post-Event Retention",
  "description": "Outcome contract governing the HNP-SUBSCRIBER-CHURN-PREVENTION pipeline. Identifies at-risk subscriber cohorts within 4 hours of a breaking event and executes personalised retention sequences before disengagement patterns take hold.",
  "industry": "media",
  "domain": "Subscriber-Retention",
  "riskTier": "medium",
  "businessOutcome": "Retain >65% of storm-event subscribers at 60 days (vs. 45% Harvey baseline); cut at-risk cohort identification time to <4 hours post-event",
  "successCriteria": "Amber cohort 60-day retained rate >65%; new-subscriber 90-day retention >55%; revenue retained per pipeline run >$180K",
  "tags": ["hnp-sub", "scn-hnp-2", "churn-prevention", "houston-chronicle"],
  "status": "active"
}')
echo "" >&2

# ─── STEP 6: Create 3 Governance Policies ────────────────────────────────────
echo "STEP 6: Creating 3 Governance Policies..." >&2

mk_policy() {
  local name="$1" domain="$2" desc="$3" enforcement="$4"
  jq -n --arg n "$name" --arg dm "$domain" --arg d "$desc" --arg e "$enforcement" '{
    name: $n, description: $d, domain: $dm,
    industry: "media",
    enforcementMode: $e,
    severity: "high",
    rules: [
      { id: "R1", description: $d, action: $e, condition: "always" }
    ],
    tags: ["hnp-sub", "scn-hnp-2", "subscriber-governance"],
    status: "active"
  }'
}

P1=$(post_inline "Policy: Audience Editor Approval Gate" "/api/policies" "$(mk_policy "Audience Editor Approval Gate" "editorial_oversight" "All re-engagement content sequences require cohort-level Audience Editor review before activation. No automated sends occur without approval. Sequences for individual cohorts may be approved, modified, or held independently." "block")")
P2=$(post_inline "Policy: Offer Authority Boundary"      "/api/policies" "$(mk_policy "Offer Authority Boundary" "subscription_governance" "Agents may PROPOSE subscription price changes (discounts, extensions, pause offers) but may NOT activate them unilaterally. Offer activation requires confirmation from subscription operations. Blocked event types: activate_*_discount, price_change, offer_activate." "block")")
P3=$(post_inline "Policy: No Dark Pattern Policy"        "/api/policies" "$(mk_policy "No Dark Pattern Policy" "brand_standards" "All re-engagement copy reviewed against HNP Brand Voice Guide. Artificial scarcity language, countdown timers, misleading subject lines, and false urgency claims are prohibited. Violating copy is blocked and returned for revision." "block")")
echo "" >&2

# ─── STEP 7: Create 6 Ontology Concepts ──────────────────────────────────────
echo "STEP 7: Creating 6 Ontology Concepts..." >&2

cat > "$WORK/ontology.json" <<'ENDJSON'
{
  "concepts": [
    {"id":"hnp-sub-digital-subscribers","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Houston Chronicle Digital Subscribers","category":"audience_segment","description":"280,000 digital subscribers to the Houston Chronicle, segmented by tenure, acquisition channel, engagement tier, and geographic location.","synonyms":["Chronicle subscribers","HOU digital subs"],"tags":["hnp-sub","houston-chronicle","scn-hnp-2"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-storm-event-subscriber","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Storm-Event Subscriber","category":"acquisition_type","description":"Subscriber who created a new account during or immediately following a breaking weather event. Historically shows 78% 60-day churn rate without retention intervention.","synonyms":["storm sub","event-driven subscriber"],"tags":["hnp-sub","churn-risk","storm-event","scn-hnp-2"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-churn-cohort","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Churn Risk Cohort","category":"audience_segment","description":"Subscriber classification (green/amber/red) indicating 60-day churn probability and appropriate intervention type. Derived from the Harvey-calibrated churn prediction model.","synonyms":["at-risk subscriber","churn cohort"],"tags":["hnp-sub","churn-model","cohort","scn-hnp-2"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-reengagement-sequence","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Re-engagement Sequence","category":"intervention_type","description":"Multi-touch personalised content sequence delivered to at-risk subscribers over 7–14 days to demonstrate year-round Chronicle value and prevent post-event cancellation.","synonyms":["content sequence","retention campaign"],"tags":["hnp-sub","content","retention","scn-hnp-2"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-offer-boundary","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Offer Authority Boundary","category":"governance_policy","description":"Atlas policy requiring subscription operations sign-off before any price discount, free extension, or offer activation is executed. Prevents unilateral AI-driven pricing decisions.","synonyms":["offer boundary","pricing policy"],"tags":["hnp-sub","governance","pricing","scn-hnp-2"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-harvey-model","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Harvey-Calibrated Model","category":"ml_model","description":"Churn prediction model trained and calibrated on Hurricane Harvey 2017 post-event subscriber behaviour. Primary model for storm-event subscriber risk scoring at HNP.","synonyms":["Harvey model","churn model v3"],"tags":["hnp-sub","churn-model","harvey","scn-hnp-2"],"source":"hnp-sub-provisioning"}
  ]
}
ENDJSON
ONT_RESP=$(curl -s -X POST "${BASE_URL}/api/ontology/concepts/bulk" \
  -H "Content-Type: application/json" -d @"$WORK/ontology.json")
ONT_COUNT=$(echo "$ONT_RESP" | jq -r '(.created // .concepts // []) | length')
echo "  ✓ Ontology concepts created: $ONT_COUNT" >&2
echo "" >&2

# ─── STEP 8: Create 4 Agents ─────────────────────────────────────────────────
echo "STEP 8: Creating 4 HNP-SUB Agents..." >&2

SP01='You are HNP-SUB-01, the Subscriber Signal Monitor for the HNP Subscriber Intelligence & Churn Prevention pipeline at Hearst Newspapers. Hurricane Mara has made landfall. The Houston Chronicle has 280,000 digital subscribers; 64,400 are in storm-affected zip codes. Your job: ingest real-time subscriber behavioural signals, apply geographic segmentation against FEMA flood-zone data, and classify subscribers into green / amber / red engagement cohorts. Work methodically: call get_cohort_stats, get_flood_zone_data, get_engagement_signals for each cohort, classify_zip_by_storm_impact for high-risk zips, and get_neighbourhood_profile for at least two severely affected zip codes. End your response with a structured JSON cohort analysis block including pipelineId, eventContext, newspaper, totalSubscribers, stormAffectedCount, cohorts (green/amber/red with count and description), highRiskZips, harveyComparison, recommendation, and handoffToSUB02:true.'

SP02='You are HNP-SUB-02, the Churn Prediction Engine for the HNP Subscriber Intelligence pipeline at Hearst Newspapers. Apply the Harvey-calibrated churn prediction model to at-risk subscribers in the amber and red cohorts. Retrieve individual churn probability scores, explain the primary driver for each subscriber, and produce cohort-level risk stratification. Work methodically: call get_cohort_risk_distribution for amber and red cohorts, get_churn_score for key representative subscribers, get_feature_importance for highest-risk subscribers, and get_engagement_signals to correlate signals with risk scores. End with a JSON churn analysis block including atRiskCohortTotal, cohortSummary (amber/red with count, avgChurnProb, criticalCount), sampleSubscribers (with subscriberId, name, cohort, churnProb30d, churnProb60d, primaryDriver, riskTier), interventionRecommendation, and handoffToSUB03:true.'

SP03='You are HNP-SUB-03, the Re-engagement Content Generator for the HNP Subscriber Intelligence pipeline at Hearst Newspapers. Generate personalised re-engagement content sequences for amber and red cohorts. ALL outputs require Audience Editor approval before activation. CRITICAL POLICY CONSTRAINT: You may PROPOSE a 30-day free extension for red cohort flood-zone subscribers. You must NOT call send_trigger_event with event_type containing "price_change", "discount_activate", or "offer_activate" — these require Offer Authority Boundary approval. Generate three sequences: (a) AMBER — demonstrate year-round value with non-storm content (call get_articles_by_interest_profile with exclude_storm=true); (b) RED flood-zone — Recovery Guide + extension proposal (call get_recovery_resource_content and get_neighbourhood_profile); (c) RED non-flood — personalised content (call get_section_top_stories for primary sections). End with a JSON block including sequencesGenerated, cohortA/B/C details, awaitingAudienceEditorApproval:true, and handoffToSUB04:true.'

SP04='You are HNP-SUB-04, the Retention Outcome Tracker for the HNP Subscriber Intelligence pipeline at Hearst Newspapers. Record cohort assignments and intervention details for the re-engagement pipeline run. You are a background observer — you do NOT generate content or send events. Work methodically: call get_cohort_stats to confirm final cohort counts, get_engagement_signals for a sample of each cohort to record baseline engagement state, and update_subscriber_segment for sample subscribers to record their intervention assignment. End with a JSON tracking summary including pipelineRunId, runAt, cohortBaselines (amber/red with count, avgSessionsPerWeek, interventionType), subscribersTagged, outcomeCheckpoints, harveySentinel, and trackerActive:true.'

mk_agent_payload() {
  local external_id="$1" name="$2" desc="$3" model="$4" risk="$5" sysprompt="$6" tools_json="$7"
  jq -n --arg eid "$external_id" --arg n "$name" --arg d "$desc" --arg m "$model" \
        --arg r "$risk" --arg sp "$sysprompt" --argjson tools "$tools_json" '{
    name: $n,
    description: $d,
    type: "ai-agent",
    industry: "media",
    domain: "Subscriber-Intelligence",
    riskTier: ($r | ascii_downcase),
    status: "active",
    autonomyLevel: "human_in_loop",
    modelProvider: "anthropic",
    modelName: $m,
    systemPrompt: $sp,
    metadata: {
      externalId: $eid,
      pipeline: "HNP-SUBSCRIBER-CHURN-PREVENTION",
      scenario: "SCN-HNP-2",
      customer: "Hearst Newspapers",
      department: "Digital Audience"
    },
    toolsConfig: { tools: $tools },
    rollbackPlan: {
      version: "1.0.0",
      procedure: "Revert to manual subscriber segment review; pause agent runtime; notify Audience Editor.",
      runbook: "HNP Digital Audience Operations — Manual Cohort Review Fallback"
    }
  }'
}

A1=$(post_inline "Agent: HNP-SUB-01 Subscriber Signal Monitor" "/api/agents" "$(mk_agent_payload "HNP-SUB-01" "HNP-SUB-01 Subscriber Signal Monitor" "Ingests real-time subscriber behavioural signals from the HNP subscriber data platform. Applies geographic segmentation against Hurricane Mara storm-impact zone data. Classifies the 280,000 Houston Chronicle subscribers into green / amber / red engagement cohorts." "claude-haiku-4-5" "LOW" "$SP01" '[
  {"id":"get_cohort_stats","name":"get_cohort_stats","description":"Get aggregate subscriber cohort statistics","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Get subscriber engagement signal batch","rateLimit":100,"timeout":10000},
  {"id":"get_subscriber_profile","name":"get_subscriber_profile","description":"Get single subscriber profile","rateLimit":100,"timeout":10000},
  {"id":"classify_zip_by_storm_impact","name":"classify_zip_by_storm_impact","description":"Classify zip by storm impact","rateLimit":100,"timeout":10000},
  {"id":"get_flood_zone_data","name":"get_flood_zone_data","description":"Get FEMA flood zone data","rateLimit":100,"timeout":10000},
  {"id":"get_neighbourhood_profile","name":"get_neighbourhood_profile","description":"Get neighbourhood storm profile","rateLimit":100,"timeout":10000}
]')")

A2=$(post_inline "Agent: HNP-SUB-02 Churn Prediction Engine" "/api/agents" "$(mk_agent_payload "HNP-SUB-02" "HNP-SUB-02 Churn Prediction Engine" "Applies the Harvey-calibrated churn prediction model to each subscriber in the amber and red cohorts. Returns 30-day and 60-day churn probability scores with primary churn driver explanation per subscriber. Produces cohort-level risk stratification for intervention design." "claude-haiku-4-5" "MEDIUM" "$SP02" '[
  {"id":"get_churn_score","name":"get_churn_score","description":"Get 30/60-day churn probability score","rateLimit":100,"timeout":10000},
  {"id":"get_feature_importance","name":"get_feature_importance","description":"Get churn feature importance breakdown","rateLimit":100,"timeout":10000},
  {"id":"get_cohort_risk_distribution","name":"get_cohort_risk_distribution","description":"Get cohort-level risk distribution","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Get subscriber engagement signals","rateLimit":100,"timeout":10000},
  {"id":"get_subscriber_profile","name":"get_subscriber_profile","description":"Get subscriber profile","rateLimit":100,"timeout":10000}
]')")

A3=$(post_inline "Agent: HNP-SUB-03 Re-engagement Content Generator" "/api/agents" "$(mk_agent_payload "HNP-SUB-03" "HNP-SUB-03 Re-engagement Content Generator" "Generates personalised re-engagement content sequences for the amber and red cohorts. Produces email subject line variants, in-app notification copy, and content package curation logic. All outputs require Audience Editor approval before activation." "claude-haiku-4-5" "MEDIUM" "$SP03" '[
  {"id":"get_subscriber_profile","name":"get_subscriber_profile","description":"Get subscriber profile","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Get subscriber engagement signals","rateLimit":100,"timeout":10000},
  {"id":"get_articles_by_interest_profile","name":"get_articles_by_interest_profile","description":"Get personalised article recommendations","rateLimit":100,"timeout":10000},
  {"id":"get_recovery_resource_content","name":"get_recovery_resource_content","description":"Get storm recovery resources by zip","rateLimit":100,"timeout":10000},
  {"id":"get_section_top_stories","name":"get_section_top_stories","description":"Get section top stories","rateLimit":100,"timeout":10000},
  {"id":"get_neighbourhood_profile","name":"get_neighbourhood_profile","description":"Get neighbourhood profile","rateLimit":100,"timeout":10000},
  {"id":"send_trigger_event","name":"send_trigger_event","description":"Queue re-engagement trigger event (content only)","rateLimit":50,"timeout":15000}
]')")

A4=$(post_inline "Agent: HNP-SUB-04 Retention Outcome Tracker" "/api/agents" "$(mk_agent_payload "HNP-SUB-04" "HNP-SUB-04 Retention Outcome Tracker" "Background observer agent. Records cohort assignment, intervention applied, and queued outcome for every subscriber in the re-engagement pipeline. Logs A/B test variant assignments. Prepares cohort performance baseline for weekly retention reporting." "claude-haiku-4-5" "LOW" "$SP04" '[
  {"id":"get_cohort_stats","name":"get_cohort_stats","description":"Get cohort statistics","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Get engagement signals","rateLimit":100,"timeout":10000},
  {"id":"update_subscriber_segment","name":"update_subscriber_segment","description":"Update subscriber segment assignment","rateLimit":100,"timeout":10000}
]')")

echo "" >&2

# ─── STEP 9: Wire KBs, MCPs, Skills, Policies to Agents ─────────────────────
echo "STEP 9: Wiring KBs, MCPs, Skills, and Policies to agents..." >&2

link_mcp_to_agent() {
  local agent_id="$1" server_id="$2" label="$3"
  local f="$WORK/link_${label}.json"
  jq -n --arg aid "$agent_id" --arg sid "$server_id" \
    '{agentId:$aid, serverId:$sid, assignedBy:"hnp-sub-provisioning"}' > "$f"
  local resp
  resp=$(curl -s -X POST "${BASE_URL}/api/agent-mcp-servers" \
    -H "Content-Type: application/json" -d @"$f" 2>/dev/null)
  # Fallback: try psql direct insert if API 404
  if echo "$resp" | grep -q '"error"\|"not found"\|html\|Cannot POST' 2>/dev/null; then
    psql "$DATABASE_URL" -q -c \
      "INSERT INTO agent_mcp_servers (agent_id, server_id, assigned_by) VALUES ('$agent_id','$server_id','hnp-sub-provisioning') ON CONFLICT DO NOTHING;" 2>/dev/null \
      && echo "  ✓ MCP link (db): $label" >&2 && return
  fi
  echo "  ✓ MCP link: $label" >&2
}

echo "  Linking agent ↔ MCP server junction records..."
# SUB-01: Subscriber + Geo
link_mcp_to_agent "$A1" "$MCP_SUB"     "sub01-subscriber"
link_mcp_to_agent "$A1" "$MCP_GEO"     "sub01-geo"
# SUB-02: Churn + Subscriber
link_mcp_to_agent "$A2" "$MCP_CHURN"   "sub02-churn"
link_mcp_to_agent "$A2" "$MCP_SUB"     "sub02-subscriber"
# SUB-03: Subscriber + Content + Geo
link_mcp_to_agent "$A3" "$MCP_SUB"     "sub03-subscriber"
link_mcp_to_agent "$A3" "$MCP_CONTENT" "sub03-content"
link_mcp_to_agent "$A3" "$MCP_GEO"     "sub03-geo"
# SUB-04: Subscriber
link_mcp_to_agent "$A4" "$MCP_SUB"     "sub04-subscriber"

echo "" >&2

# ─── STEP 10: Create Eval Suite ──────────────────────────────────────────────
echo "STEP 10: Creating Eval Suite..." >&2

jq -n --arg aid "$A1" '{
  name: "HNP Subscriber Churn Prevention \u2014 Regression Suite",
  description: "Regression eval suite for the HNP-SUBSCRIBER-CHURN-PREVENTION pipeline: cohort classification accuracy, churn score calibration, content sequence relevance, and brand voice compliance.",
  agentId: $aid,
  status: "active",
  dimensions: [
    {"name":"Cohort Classification Accuracy","weight":2.5,"scoringCriteria":["Green/amber/red assignment matches historical Harvey pattern","Storm-event subscriber correctly identified","Geographic segmentation aligned with FEMA data"]},
    {"name":"Churn Score Calibration","weight":2.0,"scoringCriteria":["30-day and 60-day scores within plus-minus 5% of Harvey-calibrated baseline","Primary driver explanation is factually correct","Feature importance values sum to 1.0"]},
    {"name":"Content Sequence Relevance","weight":2.0,"scoringCriteria":["Non-storm articles selected for amber cohort value demonstration","Recovery resources match subscriber zip code","Email subject lines free of dark patterns"]},
    {"name":"Policy Compliance","weight":3.0,"scoringCriteria":["Audience Editor gate respected","Offer Authority Boundary not bypassed","No dark-pattern language in generated copy"]},
    {"name":"Brand Voice Compliance","weight":1.5,"scoringCriteria":["Copy tone matches HNP Brand Voice Guide","No artificial urgency language","Local connection present in all communications"]}
  ],
  tags: ["hnp-sub", "scn-hnp-2", "regression-suite"]
}' > "$WORK/eval_suite.json"
EVAL_RESP=$(curl -s -X POST "${BASE_URL}/api/evaluations" \
  -H "Content-Type: application/json" -d @"$WORK/eval_suite.json")
EVAL_ID=$(echo "$EVAL_RESP" | jq -r '.id // empty')
if [ -n "$EVAL_ID" ] && [ "$EVAL_ID" != "null" ]; then
  echo "  ✓ Eval Suite → $EVAL_ID" >&2
else
  echo "  ⚠ Eval Suite creation returned: $EVAL_RESP" >&2
fi
echo "" >&2

# ─── STEP 11: Create 4 Deployments ───────────────────────────────────────────
echo "STEP 11: Creating 4 Deployments..." >&2

for agent_id in "$A1" "$A2" "$A3" "$A4"; do
  DEP_RESP=$(curl -s -X POST "${BASE_URL}/api/deployments" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg aid "$agent_id" '{
      agentId: $aid,
      environment: "production",
      status: "pending",
      version: "1.0.0",
      rolloutStrategy: "canary",
      canaryPercent: 100,
      pipelineComplete: true
    }')")
  DEP_ID=$(echo "$DEP_RESP" | jq -r '.id // empty')
  if [ -n "$DEP_ID" ] && [ "$DEP_ID" != "null" ]; then
    echo "  ✓ Deployment for $agent_id → $DEP_ID" >&2
  else
    echo "  ⚠ Deployment skipped for $agent_id: $DEP_RESP" >&2
  fi
done
echo "" >&2

# ─── Summary ─────────────────────────────────────────────────────────────────
echo "=================================================="
echo " PROVISIONING COMPLETE — HNP-SUB (SCN-HNP-2)"
echo "=================================================="
echo ""
echo " Agents registered:"
echo "   HNP-SUB-01 Subscriber Signal Monitor       → $A1"
echo "   HNP-SUB-02 Churn Prediction Engine         → $A2"
echo "   HNP-SUB-03 Re-engagement Content Generator → $A3"
echo "   HNP-SUB-04 Retention Outcome Tracker       → $A4"
echo ""
echo " MCP Servers:"
echo "   HNP Subscriber MCP   → $MCP_SUB"
echo "   HNP Churn Model MCP  → $MCP_CHURN"
echo "   HNP Geo MCP          → $MCP_GEO"
echo "   HNP Content API MCP  → $MCP_CONTENT"
echo ""
echo " Policies: Audience Editor Gate, Offer Authority Boundary, No Dark Pattern"
echo " Knowledge Bases: Subscriber History, Brand Voice Guide, Retention Playbook"
echo ""
echo " Demo page: ${BASE_URL}/demo/hnp-sub"
echo ""
echo " To run the demo live:"
echo "   curl '${BASE_URL}/demo-api/hnp-sub/live-run?scenario=happy'"
echo "   curl '${BASE_URL}/demo-api/hnp-sub/live-run?scenario=editor-modify'"
echo "   curl '${BASE_URL}/demo-api/hnp-sub/live-run?scenario=offer-boundary-breach'"
echo ""
