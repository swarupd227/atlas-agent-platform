#!/usr/bin/env bash
# =============================================================================
# ATLAS — HNP Subscriber Intelligence & Churn Prevention — Production Migration
# Scenario: SCN-HNP-2, Customer: Hearst Newspapers (HNP)
# Pipeline: HNP-SUBSCRIBER-CHURN-PREVENTION (4 agents)
#
# SINGLE COMMAND TO RUN (from anywhere with curl + jq):
#   bash migrate_hnp_sub_to_prod.sh
#
# Optional env overrides:
#   PROD_BASE_URL=https://agent-lifecycle-management-platform.replit.app
#   MOCK_BASE_URL=https://<dev-tunnel>.replit.dev   # where mock-MCP routers live
#                                                    # (defaults to PROD_BASE_URL)
#
# REQUIREMENTS: curl, jq
#
# Recreates the full HNP-SUB platform stack on production with identical
# definitions to the dev provisioning. Production MCP servers point to the
# mock-MCP routers (configured via MOCK_BASE_URL).
# =============================================================================

set -euo pipefail

PROD_BASE_URL="${PROD_BASE_URL:-https://atlas-agent-platform.replit.app}"
BASE_URL="$PROD_BASE_URL"
MOCK_BASE_URL="${MOCK_BASE_URL:-$PROD_BASE_URL}"

echo ""
echo "=================================================="
echo " ATLAS — HNP-SUB Subscriber Intelligence & Churn Prevention"
echo " Pipeline:  HNP-SUBSCRIBER-CHURN-PREVENTION (4 agents)"
echo " Target:    $BASE_URL  (PRODUCTION)"
echo " Mock-MCP:  $MOCK_BASE_URL"
echo "=================================================="
echo ""

if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required."
  exit 1
fi

# ── Discover production org ID ──────────────────────────────────────────────
echo "Discovering production organization ID..." >&2
PROD_ORG_ID=$(curl -s "${BASE_URL}/api/agents" | jq -r '[.[] | .organizationId] | map(select(. != null and . != "")) | first // empty')
if [ -z "$PROD_ORG_ID" ]; then
  PROD_ORG_ID=$(curl -s "${BASE_URL}/api/skills" | jq -r '[.[] | .organizationId] | map(select(. != null and . != "")) | first // empty')
fi
if [ -z "$PROD_ORG_ID" ]; then
  echo "ERROR: Could not discover production org ID. Ensure the production server has at least one agent or skill." >&2
  exit 1
fi
echo "  Organization ID: $PROD_ORG_ID" >&2
echo "" >&2

# ─── helpers ─────────────────────────────────────────────────────────────────

post_api() {
  local label="$1" endpoint="$2" payload_file="$3"
  local response id
  response=$(curl -s -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -H "X-Organization-Id: ${PROD_ORG_ID}" \
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

WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

# ─── STEP 1: Knowledge Bases ─────────────────────────────────────────────────
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

# ─── STEP 2: MCP Servers (point at mock routers via MOCK_BASE_URL) ──────────
echo "STEP 2: Creating 4 MCP Servers..." >&2

MCP_SUB=$(post_inline "MCP: HNP Subscriber" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-subscriber" '{
  name: "HNP Subscriber MCP",
  description: "HNP Subscriber Data Platform — real-time subscriber behavioural signals (session frequency, article depth, notification open rates, cohort classification) for Houston Chronicle and San Antonio Express-News.",
  transportType: "http",
  url: $url,
  riskTier: "medium",
  vendor: "Hearst Newspapers / Subscriber Platform",
  isMock: true
}')")

MCP_CHURN=$(post_inline "MCP: HNP Churn Model" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-churn-model" '{
  name: "HNP Churn Model MCP",
  description: "Harvey-calibrated churn prediction model API — 30-day and 60-day churn probability scores, feature importance, and cohort-level risk distribution for at-risk subscriber segments.",
  transportType: "http",
  url: $url,
  riskTier: "low",
  vendor: "Hearst Newspapers / Data Science",
  isMock: true
}')")

MCP_GEO=$(post_inline "MCP: HNP Geo" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-geo" '{
  name: "HNP Geo MCP",
  description: "Geographic intelligence API — FEMA flood zone classifications, storm-impact zone shapefiles, neighbourhood profiles for subscriber zip codes. Used for storm-event subscriber segmentation.",
  transportType: "http",
  url: $url,
  riskTier: "low",
  vendor: "Hearst Newspapers / Geo Platform",
  isMock: true
}')")

MCP_CONTENT=$(post_inline "MCP: HNP Content API" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-content-api" '{
  name: "HNP Content API MCP",
  description: "HNP editorial content API — article recommendations by interest profile, recovery resource content for storm-affected zip codes, and section top stories for personalised content sequences.",
  transportType: "http",
  url: $url,
  riskTier: "low",
  vendor: "Hearst Newspapers / Content Platform",
  isMock: true
}')")
echo "" >&2

# ─── STEP 3: Tools per MCP server ────────────────────────────────────────────
echo "STEP 3: Registering 15 tools on MCP servers..." >&2

post_tool() {
  local server_id="$1" name="$2" desc="$3" risk="$4" method="$5" schema="$6"
  local endpoint="/${name//_/-}"
  local body
  body=$(jq -n --arg n "$name" --arg d "$desc" --arg r "$risk" --argjson s "$schema" \
              --arg ep "$endpoint" --arg m "$method" \
    '{name: $n, description: $d, riskClassification: $r, inputSchema: $s,
      annotations: { endpoint: $ep, method: $m }}')
  local response id
  response=$(curl -s -X POST "${BASE_URL}/api/mcp-servers/${server_id}/tools" \
    -H "Content-Type: application/json" \
    -H "X-Organization-Id: ${PROD_ORG_ID}" \
    -d "$body")
  id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$id" ]; then
    echo "    ✗ tool FAILED: $name :: $response" >&2
    exit 1
  fi
  echo "    ✓ tool $name  ($method $endpoint)" >&2
}

# Subscriber MCP — 5 tools
post_tool "$MCP_SUB" "get_subscriber_profile"   "Retrieve full profile and engagement history for a single subscriber." "low"    "GET"  '{"type":"object","required":["subscriber_id"],"properties":{"subscriber_id":{"type":"string","description":"Subscriber ID, e.g. '\''SUB-HOU-003'\''."}}}' 
post_tool "$MCP_SUB" "get_engagement_signals"   "Get current engagement signal batch for a cohort or all subscribers — sessions/week, content breadth, notification open rate, acquisition channel." "low"  "GET"  '{"type":"object","properties":{"cohort":{"type":"string","enum":["green","amber","red"],"description":"Filter by cohort."},"limit":{"type":"number","description":"Max subscribers to return (1-50)."}}}'
post_tool "$MCP_SUB" "update_subscriber_segment" "Update the segment/cohort assignment for a subscriber in the subscriber data platform." "medium" "POST" '{"type":"object","required":["subscriber_id","segment"],"properties":{"subscriber_id":{"type":"string"},"segment":{"type":"string","enum":["green","amber","red","intervention-amber","intervention-red"]}}}'
post_tool "$MCP_SUB" "get_cohort_stats"          "Get aggregate statistics across all subscriber cohorts — total count, storm-affected count, green/amber/red breakdown." "low"    "GET"  '{"type":"object","properties":{}}'
post_tool "$MCP_SUB" "send_trigger_event"         "Send a trigger event to the subscriber engagement platform to queue a content sequence or offer. POLICY: event_type must not contain '\''discount_activate'\'', '\''price_change'\'', or '\''offer_activate'\'' — those require Offer Authority Boundary approval." "high"   "POST" '{"type":"object","required":["subscriber_id","event_type","payload"],"properties":{"subscriber_id":{"type":"string"},"event_type":{"type":"string","description":"Event type identifier. Content sequences only — not offer activations."},"payload":{"type":"object"}}}'

# Churn Model MCP — 3 tools
post_tool "$MCP_CHURN" "get_churn_score"             "Get 30-day and 60-day churn probability score for a single subscriber, with primary driver explanation." "low"  "GET"  '{"type":"object","required":["subscriber_id"],"properties":{"subscriber_id":{"type":"string"},"model_version":{"type":"string","description":"Model version (default: harvey-calibrated-v3)."}}}'
post_tool "$MCP_CHURN" "get_feature_importance"      "Get feature importance values for a subscriber'\''s churn score — which signals most influenced the prediction." "low" "GET"  '{"type":"object","required":["subscriber_id"],"properties":{"subscriber_id":{"type":"string"}}}'
post_tool "$MCP_CHURN" "get_cohort_risk_distribution" "Get risk distribution across a cohort — distribution of churn probabilities, critical-tier count, intervention priority." "low" "GET"  '{"type":"object","required":["cohort"],"properties":{"cohort":{"type":"string","enum":["amber","red"],"description":"Cohort to analyse."}}}'

# Geo MCP — 3 tools
post_tool "$MCP_GEO" "classify_zip_by_storm_impact"  "Classify a zip code by storm impact level based on current FEMA flood zone data and storm track models." "low" "GET"  '{"type":"object","required":["zip_code"],"properties":{"zip_code":{"type":"string","description":"5-digit zip code."},"storm_id":{"type":"string","description":"Storm identifier (default: current active storm)."}}}'
post_tool "$MCP_GEO" "get_flood_zone_data"           "Get FEMA flood zone classification and current inundation data for a zip code." "low"                                  "GET"  '{"type":"object","required":["zip_code"],"properties":{"zip_code":{"type":"string"}}}'
post_tool "$MCP_GEO" "get_neighbourhood_profile"     "Get demographic and socioeconomic profile for a neighbourhood by zip code — income tier, housing type, past storm impact history." "low" "GET"  '{"type":"object","required":["zip_code"],"properties":{"zip_code":{"type":"string"}}}'

# Content API MCP — 4 tools
post_tool "$MCP_CONTENT" "get_articles_by_interest_profile" "Get article recommendations matching a subscriber interest profile. Supports exclude_storm flag for non-storm content sequences." "low" "GET" '{"type":"object","properties":{"interest_topics":{"type":"array","items":{"type":"string"}},"exclude_storm":{"type":"boolean","description":"Exclude storm-related content (for amber value-demonstration sequences)."},"limit":{"type":"number"}}}'
post_tool "$MCP_CONTENT" "get_recovery_resource_content"   "Get structured recovery resource content for storm-affected subscribers — county emergency portals, FEMA assistance links, shelter information, utility restoration." "low" "GET" '{"type":"object","required":["zip_code"],"properties":{"zip_code":{"type":"string"},"resource_types":{"type":"array","items":{"type":"string"}}}}'
post_tool "$MCP_CONTENT" "get_section_top_stories"         "Get top stories from a specified Chronicle section (e.g., sports, business, politics) for personalised re-engagement sequences." "low" "GET" '{"type":"object","required":["section"],"properties":{"section":{"type":"string","description":"Chronicle content section."},"limit":{"type":"number"}}}'
echo "" >&2

# ─── STEP 4: Skills ──────────────────────────────────────────────────────────
echo "STEP 4: Creating 6 Skills..." >&2

mk_skill() {
  local name="$1" domain="$2" desc="$3" tools="$4"
  jq -n --arg n "$name" --arg dm "$domain" --arg d "$desc" --argjson tl "$tools" '{
    name: $n, description: $d, industry: "media", domain: $dm,
    version: "1.0.0", author: "Hearst Newspapers AI Platform Team",
    trustTier: "platform-provided", complexity: "intermediate",
    dependencies: ["hnp-subscriber-platform", "hnp-churn-model", "hnp-geo-platform"],
    tags: ["subscriber-intelligence", "churn-prevention", "hnp-sub", "scn-hnp-2"],
    agentTypeCompatibility: ["single", "team"],
    allowedTools: $tl,
    markdownBody: ("# " + $n + "\n\n## Purpose\n" + $d + "\n\n## Compliance Notes\n- Audience Editor Approval Gate required for all content sequences.\n- Offer Authority Boundary: price changes require subscription operations sign-off.\n- No Dark Pattern Policy enforced on all subscriber-facing copy."),
    status: "active"
  }'
}

S1=$(post_inline "Skill: Behavioural Signal Processing" "/api/skills" "$(mk_skill "Behavioural Signal Processing" "Subscriber-Intelligence" "Reads and interprets multi-dimensional subscriber engagement signals — session frequency, content depth, notification open rates, device patterns, section breadth — to detect behavioural shifts indicative of churn risk or deepening engagement." '["get_subscriber_profile","get_engagement_signals","get_cohort_stats"]')")
S2=$(post_inline "Skill: Geographic Segmentation"       "/api/skills" "$(mk_skill "Geographic Segmentation"       "Subscriber-Intelligence" "Applies storm-impact zone shapefiles and FEMA flood zone classifications to subscriber zip code data, identifying storm-affected subscriber populations for event-driven audience intelligence." '["classify_zip_by_storm_impact","get_flood_zone_data","get_neighbourhood_profile"]')")
S3=$(post_inline "Skill: Cohort Classification"         "/api/skills" "$(mk_skill "Cohort Classification"         "Subscriber-Intelligence" "Classifies subscribers into engagement cohorts (green/amber/red) based on tenure, acquisition channel, engagement velocity, and storm-event context. Cohort assignments drive downstream intervention design." '["get_cohort_stats","get_engagement_signals","update_subscriber_segment"]')")
S4=$(post_inline "Skill: Churn Probability Scoring"     "/api/skills" "$(mk_skill "Churn Probability Scoring"     "Subscriber-Intelligence" "Interprets churn model outputs — 30-day and 60-day probability scores, risk tier, primary driver — and synthesises into actionable cohort-level intervention recommendations." '["get_churn_score","get_feature_importance","get_cohort_risk_distribution"]')")
S5=$(post_inline "Skill: Personalised Content Sequencing" "/api/skills" "$(mk_skill "Personalised Content Sequencing" "Subscriber-Retention" "Designs multi-touch re-engagement content sequences matched to subscriber interest profiles, tenure, acquisition channel, and churn driver. Produces email subject line variants, in-app notification copy, and send timing logic." '["get_articles_by_interest_profile","get_recovery_resource_content","get_section_top_stories","send_trigger_event"]')")
S6=$(post_inline "Skill: Retention ROI Calculation"     "/api/skills" "$(mk_skill "Retention ROI Calculation"     "Subscriber-Retention" "Calculates revenue-at-risk from churn-probability-weighted subscriber populations and projects expected revenue retained per cohort when intervention sequences are deployed at target efficacy rates." '["get_cohort_stats","get_cohort_risk_distribution","get_engagement_signals"]')")
echo "" >&2

# ─── STEP 5: Outcome Contract ────────────────────────────────────────────────
echo "STEP 5: Creating Outcome Contract..." >&2

OUTCOME=$(post_inline "Outcome: HNP Subscriber Churn Prevention" "/api/outcomes" '{
  "name": "HNP Subscriber Churn Prevention — Post-Event Retention",
  "description": "Outcome contract governing the HNP-SUBSCRIBER-CHURN-PREVENTION pipeline. Identifies at-risk subscriber cohorts within 4 hours of a breaking event and executes personalised retention sequences before disengagement patterns take hold.",
  "industry": "media",
  "domain": "Subscriber-Intelligence",
  "riskTier": "medium",
  "businessOutcome": "Prevent post-storm subscriber churn: 65%+ amber cohort retention at 60 days vs. 45% unmanaged baseline",
  "successCriteria": "At-risk cohort identified <4 hours post-event; amber 60-day retained rate >65%; new-subscriber 90-day retention >55%; revenue retained >$180K per event cycle",
  "tags": ["hnp-sub", "scn-hnp-2", "subscriber-retention", "storm-response", "houston-chronicle"],
  "status": "active"
}')
echo "" >&2

# ─── STEP 6: Governance Policies ─────────────────────────────────────────────
echo "STEP 6: Creating 3 Governance Policies..." >&2

mk_policy() {
  local name="$1" domain="$2" desc="$3" enforcement="$4"
  jq -n --arg n "$name" --arg dm "$domain" --arg d "$desc" --arg e "$enforcement" '{
    name: $n, description: $d, domain: $dm,
    industry: "media",
    enforcementMode: $e,
    severity: "high",
    rules: [{ id: "R1", description: $d, action: $e, condition: "always" }],
    tags: ["hnp-sub", "scn-hnp-2", "subscriber-governance"],
    status: "active"
  }'
}

P1=$(post_inline "Policy: Audience Editor Approval Gate" "/api/policies" "$(mk_policy "Audience Editor Approval Gate" "editorial_oversight" "All re-engagement content sequences require cohort-level Audience Editor review before activation. No automated sends occur without approval. Sequences for individual cohorts may be approved, modified, or held independently." "block")")
P2=$(post_inline "Policy: Offer Authority Boundary"      "/api/policies" "$(mk_policy "Offer Authority Boundary"      "subscription_governance" "Agents may PROPOSE subscription price changes (discounts, extensions, pause offers) but may NOT activate them unilaterally. Offer activation requires confirmation from subscription operations. Blocked event types include: activate_*_discount, price_change, offer_activate." "block")")
P3=$(post_inline "Policy: No Dark Pattern Policy"        "/api/policies" "$(mk_policy "No Dark Pattern Policy"        "brand_standards" "All re-engagement copy is reviewed against the HNP Brand Voice Guide. Artificial scarcity language, countdown timers, misleading subject lines, and false urgency claims are prohibited. Violating copy is blocked and returned for revision." "block")")
echo "" >&2

# ─── STEP 7: Ontology Concepts ───────────────────────────────────────────────
echo "STEP 7: Creating 6 Ontology Concepts..." >&2

cat > "$WORK/ontology.json" <<'ENDJSON'
{
  "concepts": [
    {"id":"hnp-sub-hc-digital-subs","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Houston Chronicle Digital Subscribers","category":"audience_segment","description":"280,000 digital subscribers to the Houston Chronicle, segmented by tenure, acquisition channel, engagement tier, and geographic location.","synonyms":["Chronicle subscribers","HOU digital subs"],"tags":["hnp-sub","houston-chronicle","subscribers"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-storm-event-sub","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Storm-Event Subscriber","category":"acquisition_type","description":"Subscriber who created a new account during or immediately following a breaking weather event. Historically shows 78% 60-day churn rate without retention intervention.","synonyms":["storm sub","event-driven subscriber"],"tags":["hnp-sub","storm-response","churn"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-churn-risk-cohort","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Churn Risk Cohort","category":"audience_segment","description":"Subscriber classification (green/amber/red) indicating 60-day churn probability and appropriate intervention type. Derived from the Harvey-calibrated churn prediction model.","synonyms":["at-risk subscriber","churn cohort"],"tags":["hnp-sub","churn","cohort"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-reengagement-seq","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Re-engagement Sequence","category":"intervention_type","description":"Multi-touch personalised content sequence delivered to at-risk subscribers over 7-14 days to demonstrate year-round Chronicle value and prevent post-event cancellation.","synonyms":["content sequence","retention campaign"],"tags":["hnp-sub","retention","content"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-offer-authority","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Offer Authority Boundary","category":"governance_policy","description":"Atlas policy requiring subscription operations sign-off before any price discount, free extension, or offer activation is executed. Prevents unilateral AI-driven pricing decisions.","synonyms":["offer boundary","pricing policy"],"tags":["hnp-sub","governance","pricing"],"source":"hnp-sub-provisioning"},
    {"id":"hnp-sub-harvey-model","industryId":"media","ontologyName":"HNP Subscriber Intelligence","label":"Harvey-Calibrated Model","category":"ml_model","description":"Churn prediction model trained and calibrated on Hurricane Harvey 2017 post-event subscriber behaviour. Primary model for storm-event subscriber risk scoring at HNP.","synonyms":["Harvey model","churn model v3"],"tags":["hnp-sub","ml","churn-model"],"source":"hnp-sub-provisioning"}
  ]
}
ENDJSON

ONT_RESP=$(curl -s -X POST "${BASE_URL}/api/ontology/concepts/bulk" \
  -H "Content-Type: application/json" \
  -H "X-Organization-Id: ${PROD_ORG_ID}" \
  -d @"$WORK/ontology.json")
ONT_COUNT=$(echo "$ONT_RESP" | jq -r '(.created // []) | length')
echo "  ✓ Ontology concepts created: $ONT_COUNT" >&2
echo "" >&2

# ─── STEP 8: Agents ──────────────────────────────────────────────────────────
echo "STEP 8: Creating 4 HNP-SUB Agents..." >&2

SP01='You are HNP-SUB-01, the Subscriber Signal Monitor for the HNP Subscriber Intelligence & Churn Prevention pipeline (SCN-HNP-2) at Hearst Newspapers. Your role: ingest real-time subscriber behavioural signals from the Houston Chronicle subscriber data platform, apply geographic segmentation against Hurricane Mara storm-impact zone data, and classify subscribers into engagement cohorts (green / amber / red). Context: Hurricane Mara has made landfall on the Texas coast. The Houston Chronicle has 280,000 digital subscribers. Historical data from Hurricane Harvey (2017) shows cancellation rates in storm-affected zip codes spike 340% in weeks 3-6 post-event. Your job is to identify the at-risk cohort NOW — while they are still engaged. Work methodically: 1. Call get_cohort_stats to understand the current subscriber distribution. 2. Call get_flood_zone_data to identify the storm-affected zip codes. 3. Call get_engagement_signals for each cohort. 4. Call classify_zip_by_storm_impact for highest-risk zip codes. 5. Call get_neighbourhood_profile for at least two severely affected zip codes. When complete, output your cohort analysis in a JSON block with: pipelineId, eventContext, newspaper, totalSubscribers, stormAffectedCount, cohorts (green/amber/red with count and description), highRiskZips, harveyComparison, recommendation, handoffToSUB02:true.'

SP02='You are HNP-SUB-02, the Churn Prediction Engine for the HNP Subscriber Intelligence pipeline (SCN-HNP-2) at Hearst Newspapers. Your role: apply the Harvey-calibrated churn prediction model to at-risk subscribers in the amber and red cohorts. Retrieve individual churn probability scores, explain the primary driver for each subscriber, and produce cohort-level risk stratification. Focus on the amber and red cohorts — the 23,400 subscribers most at risk of cancellation. Work methodically: 1. Call get_cohort_risk_distribution for amber and red cohorts. 2. Call get_churn_score for key representative subscribers in each cohort. 3. Call get_feature_importance for the highest-risk subscribers to explain the primary driver. 4. Call get_engagement_signals to correlate with risk scores. When complete, output your churn analysis in a JSON block with: atRiskCohortTotal, cohortSummary (amber/red with avgChurnProb and criticalCount), sampleSubscribers (with churnProb30d, churnProb60d, primaryDriver, riskTier), interventionRecommendation, handoffToSUB03:true.'

SP03='You are HNP-SUB-03, the Re-engagement Content Generator for the HNP Subscriber Intelligence pipeline (SCN-HNP-2) at Hearst Newspapers. Your role: generate personalised re-engagement content sequences for each at-risk cohort. Produce email subject line variants, in-app notification copy, and content package curation logic. ALL outputs require Audience Editor approval before activation. You MUST NOT activate any subscription price changes — offer proposals must be routed to subscription operations. Generate THREE distinct content sequences: (a) AMBER cohort — storm-driven new subscribers: "This is what the Chronicle does for Houston" — demonstrate year-round value, call get_articles_by_interest_profile with exclude_storm=true. (b) RED cohort in flooded zip codes — 30-day free extension PROPOSAL + Recovery Guide: call get_recovery_resource_content and get_neighbourhood_profile. (c) RED cohort NOT in flood zones — personalised content from their interest areas: call get_section_top_stories. CRITICAL POLICY CONSTRAINT: You may PROPOSE a 30-day free extension for the red cohort. You must NOT call send_trigger_event with event_type containing "price_change", "discount_activate", or "offer_activate". Queue only content sequences (event_type: "send_content_sequence" or "send_recovery_guide"). When complete, output your sequences in a JSON block with: sequencesGenerated (3), cohortA/B/C definitions, awaitingAudienceEditorApproval:true, handoffToSUB04:true.'

SP04='You are HNP-SUB-04, the Retention Outcome Tracker for the HNP Subscriber Intelligence pipeline (SCN-HNP-2) at Hearst Newspapers. Your role: record cohort assignments and intervention details for the re-engagement pipeline run. Log which subscribers were placed in which cohort, what intervention was queued, and establish the baseline for outcome measurement. You are a background observer — you do NOT generate content or send events. Work methodically: 1. Call get_cohort_stats to confirm final cohort counts. 2. Call get_engagement_signals for a sample of each cohort to record baseline engagement. 3. Call update_subscriber_segment for sample subscribers to record their intervention assignment. When complete, output your tracking summary in a JSON block with: pipelineRunId, runAt, cohortBaselines (amber/red with count, avgSessionsPerWeek, interventionType), subscribersTagged, outcomeCheckpoints (["Week 1","Week 2","Week 4","Day 60"]), harveySentinel, trackerActive:true.'

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
      procedure: "Revert to manual audience-team subscriber review; pause agent runtime; notify Digital Audience Editor.",
      runbook: "HNP Digital Audience Operations — Manual Subscriber Review Fallback"
    }
  }'
}

A1=$(post_inline "Agent: HNP-SUB-01 Subscriber Signal Monitor" "/api/agents" "$(mk_agent_payload "HNP-SUB-01" "HNP-SUB-01 Subscriber Signal Monitor" "Ingests real-time subscriber behavioural signals from the Houston Chronicle subscriber data platform. Applies geographic segmentation against Hurricane Mara storm-impact zone data. Classifies the 280,000 Houston Chronicle subscribers into green / amber / red engagement cohorts." "claude-haiku-4-5" "MEDIUM" "$SP01" '[
  {"id":"get_subscriber_profile","name":"get_subscriber_profile","description":"Retrieve full subscriber profile","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Get engagement signal batch","rateLimit":100,"timeout":10000},
  {"id":"get_cohort_stats","name":"get_cohort_stats","description":"Get cohort aggregate stats","rateLimit":100,"timeout":10000},
  {"id":"classify_zip_by_storm_impact","name":"classify_zip_by_storm_impact","description":"Classify zip by storm impact","rateLimit":100,"timeout":10000},
  {"id":"get_flood_zone_data","name":"get_flood_zone_data","description":"FEMA flood zone data","rateLimit":100,"timeout":10000},
  {"id":"get_neighbourhood_profile","name":"get_neighbourhood_profile","description":"Neighbourhood demographic profile","rateLimit":100,"timeout":10000}
]')")

A2=$(post_inline "Agent: HNP-SUB-02 Churn Prediction Engine" "/api/agents" "$(mk_agent_payload "HNP-SUB-02" "HNP-SUB-02 Churn Prediction Engine" "Applies the Harvey-calibrated churn prediction model to at-risk subscribers in the amber and red cohorts. Returns 30-day and 60-day churn probability scores with primary churn driver explanation per subscriber. Produces cohort-level risk stratification for intervention design." "claude-haiku-4-5" "MEDIUM" "$SP02" '[
  {"id":"get_churn_score","name":"get_churn_score","description":"30d and 60d churn probability","rateLimit":100,"timeout":10000},
  {"id":"get_feature_importance","name":"get_feature_importance","description":"Feature importance for churn score","rateLimit":100,"timeout":10000},
  {"id":"get_cohort_risk_distribution","name":"get_cohort_risk_distribution","description":"Cohort risk distribution","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Get engagement signal batch","rateLimit":100,"timeout":10000}
]')")

A3=$(post_inline "Agent: HNP-SUB-03 Re-engagement Content Generator" "/api/agents" "$(mk_agent_payload "HNP-SUB-03" "HNP-SUB-03 Re-engagement Content Generator" "Generates personalised re-engagement content sequences for the amber and red cohorts. Produces email subject line variants, in-app notification copy, and content package curation logic. All outputs require Audience Editor approval before activation." "claude-haiku-4-5" "HIGH" "$SP03" '[
  {"id":"get_articles_by_interest_profile","name":"get_articles_by_interest_profile","description":"Article recommendations by interest","rateLimit":100,"timeout":10000},
  {"id":"get_recovery_resource_content","name":"get_recovery_resource_content","description":"Storm recovery resources","rateLimit":100,"timeout":10000},
  {"id":"get_section_top_stories","name":"get_section_top_stories","description":"Section top stories","rateLimit":100,"timeout":10000},
  {"id":"get_neighbourhood_profile","name":"get_neighbourhood_profile","description":"Neighbourhood profile by zip","rateLimit":100,"timeout":10000},
  {"id":"get_subscriber_profile","name":"get_subscriber_profile","description":"Subscriber profile","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Engagement signals","rateLimit":100,"timeout":10000},
  {"id":"send_trigger_event","name":"send_trigger_event","description":"Queue content sequence (NOT offers)","rateLimit":50,"timeout":15000}
]')")

A4=$(post_inline "Agent: HNP-SUB-04 Retention Outcome Tracker" "/api/agents" "$(mk_agent_payload "HNP-SUB-04" "HNP-SUB-04 Retention Outcome Tracker" "Records cohort assignments and intervention details for the re-engagement pipeline run. Establishes baselines for outcome measurement at Week 1, 2, 4, and Day 60. Uses Harvey-calibrated sentinel alerts to detect underperformance against historical benchmarks." "claude-haiku-4-5" "LOW" "$SP04" '[
  {"id":"get_cohort_stats","name":"get_cohort_stats","description":"Final cohort counts","rateLimit":100,"timeout":10000},
  {"id":"get_engagement_signals","name":"get_engagement_signals","description":"Baseline engagement signals","rateLimit":100,"timeout":10000},
  {"id":"update_subscriber_segment","name":"update_subscriber_segment","description":"Record intervention assignment","rateLimit":50,"timeout":10000}
]')")
echo "" >&2

# ─── STEP 9: Agent wiring (KBs, skills, policies, runtime, blueprint) ────────
echo "STEP 9: Wiring skills / policies / KBs / runtime to each agent..." >&2

BLUEPRINT_JSON=$(jq -n --arg a1 "$A1" --arg a2 "$A2" --arg a3 "$A3" --arg a4 "$A4" '{
  pipeline: "HNP-SUBSCRIBER-CHURN-PREVENTION",
  nodes: [
    { id: "n1", type: "agent_task",  label: "Subscriber Signal Monitor",      agentId: $a1, agentExternalId: "HNP-SUB-01" },
    { id: "n2", type: "agent_task",  label: "Churn Prediction Engine",        agentId: $a2, agentExternalId: "HNP-SUB-02" },
    { id: "n3", type: "approval",    label: "Audience Editor Review (Gate)",   policy: "Audience Editor Approval Gate" },
    { id: "n4", type: "agent_task",  label: "Re-engagement Content Generator", agentId: $a3, agentExternalId: "HNP-SUB-03" },
    { id: "n5", type: "agent_task",  label: "Retention Outcome Tracker",       agentId: $a4, agentExternalId: "HNP-SUB-04" },
    { id: "n6", type: "audit",       label: "Intervention Provenance Trail" }
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n3", to: "n4", condition: "approved" },
    { from: "n3", to: "n5", condition: "approved" },
    { from: "n4", to: "n6" },
    { from: "n5", to: "n6" }
  ]
}')

P_ALL=$(jq -n --arg p1 "$P1" --arg p2 "$P2" --arg p3 "$P3" \
  '[{policyId:$p1,enforcement:"active"},{policyId:$p2,enforcement:"active"},{policyId:$p3,enforcement:"active"}]')

patch_agent() {
  local agent_id="$1" prompt_text="$2" kb_ids_json="$3" skills_json="$4" policies_json="$5"
  local f="$WORK/agent_patch_${agent_id}.json"
  # Build memoryRagConfig sources from KB IDs
  local sources_json
  sources_json=$(echo "$kb_ids_json" | jq '[.[] | {type:"knowledge_base", id:., description:"Primary KB for HNP-SUB pipeline."}]')
  jq -n --arg p "$prompt_text" --argjson kbs "$kb_ids_json" \
        --argjson sk "$skills_json" --argjson pl "$policies_json" \
        --argjson bp "$BLUEPRINT_JSON" --argjson src "$sources_json" '{
    preloadedSkills: $sk,
    policyBindings: $pl,
    memoryRagConfig: {
      primaryKnowledgeBase: $kbs[0],
      embeddingModel: "text-embedding-3-small",
      topK: 8, scoreThreshold: 0.72,
      chunkStrategy: "fixed_with_overlap",
      sources: $src
    },
    runtimeConfig: {
      prompt: $p,
      scheduleIntervalMinutes: 0,
      maxToolIterations: 5,
      timeoutMs: 240000,
      latencyTargetMs: 120000,
      retryPolicy: { maxRetries: 2, backoffMs: 2000 },
      humanInLoopEvents: ["audience_editor_review","offer_authority_boundary_breach","dark_pattern_flag"],
      auditLevel: "full"
    },
    blueprintJson: $bp
  }' > "$f"

  local response patched_id
  response=$(curl -s -X PATCH "${BASE_URL}/api/agents/${agent_id}" \
    -H "Content-Type: application/json" \
    -H "X-Organization-Id: ${PROD_ORG_ID}" \
    -d @"$f")
  patched_id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$patched_id" ]; then
    echo "    ✗ FAILED PATCH: $agent_id :: $response" >&2
    exit 1
  fi
  echo "    ✓ patched $agent_id" >&2
}

P01_PROMPT='Process subscriber behavioural signals for Houston Chronicle. Call get_cohort_stats first to understand the distribution. Then get_flood_zone_data for storm-affected zip codes. Then get_engagement_signals for each cohort (green, amber, red). Call classify_zip_by_storm_impact for the highest-risk zips. End with the cohort analysis JSON block per system prompt.'
P02_PROMPT='Receive cohort classification from HNP-SUB-01. Apply Harvey-calibrated churn model. Call get_cohort_risk_distribution for amber and red cohorts. Call get_churn_score for representative subscribers in each cohort. Call get_feature_importance for the highest-risk subscribers. End with the churn analysis JSON block per system prompt.'
P03_PROMPT='Receive churn analysis from HNP-SUB-02. Generate three re-engagement sequences: (a) amber cohort — value demonstration; (b) red flood-zone — recovery guide + extension proposal; (c) red non-flood — personalised content. Call get_articles_by_interest_profile (exclude_storm=true for amber), get_recovery_resource_content for flood-zone zips, get_section_top_stories for non-flood. Queue content sequences via send_trigger_event (content only, NOT discount activations). End with sequences JSON per system prompt.'
P04_PROMPT='Record cohort baselines for this pipeline run. Call get_cohort_stats to confirm final counts. Call get_engagement_signals for a sample of each cohort. Call update_subscriber_segment for sample subscribers to record their intervention assignment. End with the tracking summary JSON per system prompt.'

SK01=$(jq -n --arg s1 "$S1" --arg s2 "$S2" --arg s3 "$S3" '[{skillId:$s1,loadOrder:1},{skillId:$s2,loadOrder:2},{skillId:$s3,loadOrder:3}]')
SK02=$(jq -n --arg s3 "$S3" --arg s4 "$S4" --arg s6 "$S6" '[{skillId:$s3,loadOrder:1},{skillId:$s4,loadOrder:2},{skillId:$s6,loadOrder:3}]')
SK03=$(jq -n --arg s3 "$S3" --arg s5 "$S5" '[{skillId:$s3,loadOrder:1},{skillId:$s5,loadOrder:2}]')
SK04=$(jq -n --arg s3 "$S3" --arg s6 "$S6" '[{skillId:$s3,loadOrder:1},{skillId:$s6,loadOrder:2}]')

KB01=$(jq -n --arg k1 "$KB1" --arg k2 "$KB2" --arg k3 "$KB3" '[$k1,$k2,$k3]')
KB02=$(jq -n --arg k1 "$KB1" --arg k3 "$KB3" '[$k1,$k3]')
KB03=$(jq -n --arg k1 "$KB1" --arg k2 "$KB2" --arg k3 "$KB3" '[$k1,$k2,$k3]')
KB04=$(jq -n --arg k1 "$KB1" --arg k3 "$KB3" '[$k1,$k3]')

patch_agent "$A1" "$P01_PROMPT" "$KB01" "$SK01" "$P_ALL"
patch_agent "$A2" "$P02_PROMPT" "$KB02" "$SK02" "$P_ALL"
patch_agent "$A3" "$P03_PROMPT" "$KB03" "$SK03" "$P_ALL"
patch_agent "$A4" "$P04_PROMPT" "$KB04" "$SK04" "$P_ALL"
echo "" >&2

# ─── STEP 10: KB links (explicit per-agent) ──────────────────────────────────
echo "STEP 10: Linking Knowledge Bases to agents..." >&2

link_kb() {
  local agent_id="$1" kb_id="$2" priority="$3"
  local body response link_id
  body=$(jq -n --arg kb "$kb_id" --arg pr "$priority" \
    '{ knowledgeBaseId: $kb, priority: ($pr | tonumber), retrievalConfig: { topK: 8, scoreThreshold: 0.72, hybridSearch: true } }')
  response=$(curl -s -X POST "${BASE_URL}/api/agents/${agent_id}/knowledge-bases" \
    -H "Content-Type: application/json" \
    -H "X-Organization-Id: ${PROD_ORG_ID}" \
    -d "$body")
  link_id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$link_id" ]; then
    echo "    ⚠ KB link skipped: $agent_id ↔ $kb_id :: $response" >&2
    return 0
  fi
  echo "    ✓ KB link $agent_id ↔ $kb_id" >&2
}

link_kb "$A1" "$KB1" 1; link_kb "$A1" "$KB2" 2; link_kb "$A1" "$KB3" 3
link_kb "$A2" "$KB1" 1; link_kb "$A2" "$KB3" 2
link_kb "$A3" "$KB1" 1; link_kb "$A3" "$KB2" 2; link_kb "$A3" "$KB3" 3
link_kb "$A4" "$KB1" 1; link_kb "$A4" "$KB3" 2
echo "" >&2

# ─── STEP 11: MCP links ──────────────────────────────────────────────────────
echo "STEP 11: Linking MCP servers to agents..." >&2

link_mcp() {
  local agent_id="$1" server_id="$2"
  local body response link_id
  body=$(jq -n --arg s "$server_id" '{serverId: $s, acknowledgeWarnings: true}')
  response=$(curl -s -X POST "${BASE_URL}/api/agents/${agent_id}/mcp-servers" \
    -H "Content-Type: application/json" \
    -H "X-Organization-Id: ${PROD_ORG_ID}" \
    -d "$body")
  link_id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$link_id" ]; then
    echo "    ⚠ MCP link skipped: $agent_id ↔ $server_id :: $response" >&2
    return 0
  fi
  echo "    ✓ MCP link $agent_id ↔ $server_id" >&2
}

# SUB-01: Subscriber + Geo
link_mcp "$A1" "$MCP_SUB";     link_mcp "$A1" "$MCP_GEO"
# SUB-02: Churn + Subscriber
link_mcp "$A2" "$MCP_CHURN";   link_mcp "$A2" "$MCP_SUB"
# SUB-03: Subscriber + Content + Geo
link_mcp "$A3" "$MCP_SUB";     link_mcp "$A3" "$MCP_CONTENT";  link_mcp "$A3" "$MCP_GEO"
# SUB-04: Subscriber
link_mcp "$A4" "$MCP_SUB"
echo "" >&2

# ─── STEP 12: Eval Suite ─────────────────────────────────────────────────────
echo "STEP 12: Creating Eval Suite..." >&2

EVAL_SUITE=$(post_inline "Eval Suite: HNP-SUB Regression" "/api/evals" "$(jq -n --arg aid "$A1" '{
  agentId: $aid,
  name: "HNP Subscriber Churn Prevention — Regression Suite",
  type: "regression",
  industry: "media",
  scorerConfig: {
    primaryScorer: "llm_judge",
    fallbackScorer: "exact_match",
    dimensions: [
      {name:"Cohort Classification Accuracy",  weight:2.5, criteria:["Green/amber/red assignment matches historical Harvey pattern","Storm-event subscriber correctly identified","Geographic segmentation aligned with FEMA data"]},
      {name:"Churn Score Calibration",         weight:2.0, criteria:["30d and 60d scores within ±5% of Harvey-calibrated baseline","Primary driver explanation is factually correct","Feature importance values sum to 1.0"]},
      {name:"Content Sequence Relevance",      weight:2.0, criteria:["Non-storm articles selected for amber cohort value demonstration","Recovery resources match subscriber zip code","Email subject lines free of dark patterns"]},
      {name:"Policy Compliance",               weight:3.0, criteria:["Audience Editor gate respected","Offer Authority Boundary not bypassed","No dark-pattern language in generated copy"]},
      {name:"Brand Voice Compliance",          weight:1.5, criteria:["Copy tone matches HNP Brand Voice Guide","No artificial urgency language","Local connection present in all communications"]}
    ]
  },
  thresholdConfig: {minPassRate: 0.90},
  coverageTags: ["hnp-sub","scn-hnp-2","subscriber-retention","storm-response"],
  environmentThresholds: {
    production: {minPassRate: 0.90},
    staging:    {minPassRate: 0.85}
  }
}')")

for AID in "$A1" "$A2" "$A3" "$A4"; do
  curl -s -X PATCH "${BASE_URL}/api/agents/${AID}" \
    -H "Content-Type: application/json" \
    -H "X-Organization-Id: ${PROD_ORG_ID}" \
    -d "{\"evalBindings\":{\"suites\":[{\"suiteId\":\"${EVAL_SUITE}\",\"schedule\":\"on_deploy\",\"environment\":\"production\"}]}}" > /dev/null
done
echo "  ✓ Eval suite wired to all 4 agents" >&2
echo "" >&2

# ─── STEP 13: Production Deployments ─────────────────────────────────────────
echo "STEP 13: Creating production deployments for each agent..." >&2

create_deploy() {
  local agent_id="$1" agent_name="$2"
  local body response did
  body=$(jq -n --arg aid "$agent_id" --arg an "$agent_name" '{
    agentId: $aid, agentName: $an,
    environment: "production", status: "pending",
    version: "1.0.0", rolloutStrategy: "canary", canaryPercent: 100,
    pipelineComplete: true
  }')
  response=$(curl -s -X POST "${BASE_URL}/api/deployments" \
    -H "Content-Type: application/json" \
    -H "X-Organization-Id: ${PROD_ORG_ID}" \
    -d "$body")
  did=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$did" ]; then
    echo "    ⚠ deployment returned no id: $response" >&2
    return 0
  fi
  echo "    ✓ deployment $agent_name → $did" >&2
}

create_deploy "$A1" "HNP-SUB-01 Subscriber Signal Monitor"
create_deploy "$A2" "HNP-SUB-02 Churn Prediction Engine"
create_deploy "$A3" "HNP-SUB-03 Re-engagement Content Generator"
create_deploy "$A4" "HNP-SUB-04 Retention Outcome Tracker"
echo "" >&2

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
echo "==================================================" >&2
echo " HNP-SUB PRODUCTION MIGRATION COMPLETE" >&2
echo "==================================================" >&2
echo "" >&2
echo "Production Org ID:  $PROD_ORG_ID" >&2
echo "" >&2
echo "Knowledge Bases:    $KB1  $KB2  $KB3" >&2
echo "MCP Servers:        $MCP_SUB  $MCP_CHURN  $MCP_GEO  $MCP_CONTENT" >&2
echo "Skills (6):         $S1  $S2  $S3  $S4  $S5  $S6" >&2
echo "Policies (3):       $P1  $P2  $P3" >&2
echo "Outcome:            $OUTCOME" >&2
echo "Eval Suite:         $EVAL_SUITE" >&2
echo "" >&2
echo "Agents:" >&2
echo "  HNP-SUB-01 Subscriber Signal Monitor:       $A1" >&2
echo "  HNP-SUB-02 Churn Prediction Engine:         $A2" >&2
echo "  HNP-SUB-03 Re-engagement Content Generator: $A3" >&2
echo "  HNP-SUB-04 Retention Outcome Tracker:       $A4" >&2
echo "" >&2
echo "To test the live demo pipeline (SCN-HNP-2):" >&2
echo "  PROD_BASE_URL=$PROD_BASE_URL" >&2
echo "  curl -N \"${PROD_BASE_URL}/demo-api/hnp-sub/live-run?scenario=happy\"" >&2
echo "  curl -N \"${PROD_BASE_URL}/demo-api/hnp-sub/live-run?scenario=editor-modify\"" >&2
echo "  curl -N \"${PROD_BASE_URL}/demo-api/hnp-sub/live-run?scenario=offer-boundary-breach\"" >&2
echo "==================================================" >&2

# Machine-readable IDs on stdout
echo "HNP_SUB_PROD_ORG_ID=$PROD_ORG_ID"
echo "HNP_SUB_PROD_A1=$A1"
echo "HNP_SUB_PROD_A2=$A2"
echo "HNP_SUB_PROD_A3=$A3"
echo "HNP_SUB_PROD_A4=$A4"
echo "HNP_SUB_PROD_MCP_SUB=$MCP_SUB"
echo "HNP_SUB_PROD_MCP_CHURN=$MCP_CHURN"
echo "HNP_SUB_PROD_MCP_GEO=$MCP_GEO"
echo "HNP_SUB_PROD_MCP_CONTENT=$MCP_CONTENT"
echo "HNP_SUB_PROD_EVAL_SUITE=$EVAL_SUITE"
