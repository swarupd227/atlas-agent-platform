#!/usr/bin/env bash
# =============================================================================
# ATLAS — HNP Government Beat Intelligence (HNP-GOVT) — Production Migration
# Scenario: SCN-HNP-1, Customer: Hearst Newspapers (HNP)
# Pipeline: HNP-HOUSTON-GOVT-BEAT (4 agents)
#
# SINGLE COMMAND TO RUN (from anywhere with curl + jq):
#   bash migrate_hnp_govt_to_prod.sh
#
# Optional env overrides:
#   PROD_BASE_URL=https://agent-lifecycle-management-platform.replit.app
#   MOCK_BASE_URL=https://<dev-tunnel>.replit.dev   # where mock-MCP routers live
#                                                    # (defaults to PROD_BASE_URL)
#
# REQUIREMENTS: curl, jq
#
# Recreates the full HNP-GOVT platform stack on production with identical
# definitions to the dev provisioning. Production MCP servers point to the
# mock-MCP routers (configured via MOCK_BASE_URL).
# =============================================================================

set -euo pipefail

PROD_BASE_URL="${PROD_BASE_URL:-https://agent-lifecycle-management-platform.replit.app}"
BASE_URL="$PROD_BASE_URL"
MOCK_BASE_URL="${MOCK_BASE_URL:-$PROD_BASE_URL}"

echo ""
echo "=================================================="
echo " ATLAS — HNP-GOVT Government Beat Intelligence"
echo " Pipeline:  HNP-HOUSTON-GOVT-BEAT (4 agents)"
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
echo "STEP 1: Creating 4 Knowledge Bases..." >&2

KB1=$(post_inline "KB: HNP Assembly Corpus Index" "/api/knowledge-bases" '{
  "name": "HNP Assembly Corpus Index",
  "description": "Index of all government meeting transcripts in Hearst Assembly — Houston (47 transcripts, past 90 days), San Antonio (31), Austin (28). Indexed by meeting type, date, attending officials, and keyword tags. Backed by the HNP Assembly MCP for retrieval.",
  "industry": "media",
  "tags": ["government-meetings", "transcripts", "assembly", "houston", "harris-county", "hnp-govt"],
  "status": "active"
}')

KB2=$(post_inline "KB: HNP Investigative Journalism Standards" "/api/knowledge-bases" '{
  "name": "HNP Investigative Journalism Standards",
  "description": "Internal HNP editorial standards: two-source rule, attribution requirements, right-of-reply window, AI-drafting disclosure, publishable-fact criteria. Agent outputs are checked against these standards before surfacing to reporters.",
  "industry": "media",
  "tags": ["editorial", "standards", "two-source-rule", "attribution", "ai-disclosure", "hnp-govt"],
  "status": "active"
}')

KB3=$(post_inline "KB: Texas Government Entity Ontology" "/api/knowledge-bases" '{
  "name": "Texas Government Entity Ontology",
  "description": "Structured knowledge of Texas government — Harris County, City of Houston, HCFCD, TCEQ, TxDOT — with official names, jurisdiction boundaries, parent/subsidiary relationships, FOIA officer contacts, and Texas Public Information Act response windows.",
  "industry": "government",
  "tags": ["texas", "houston", "harris-county", "ontology", "foia", "hnp-govt"],
  "status": "active"
}')

KB4=$(post_inline "KB: Elected Official Profile Index" "/api/knowledge-bases" '{
  "name": "Elected Official Profile Index",
  "description": "Profiles for all covered Texas elected officials with role, term dates, voting history on major local ordinances, and top campaign contributors. Used for context resolution and conflict-of-interest signal detection.",
  "industry": "government",
  "tags": ["officials", "campaign-finance", "voting-history", "conflict-of-interest", "hnp-govt"],
  "status": "active"
}')
echo "" >&2

# ─── STEP 2: MCP Servers (point at mock routers via MOCK_BASE_URL) ──────────
echo "STEP 2: Creating 4 MCP Servers..." >&2

MCP_ASSEMBLY=$(post_inline "MCP: HNP Assembly" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-assembly" '{
  name: "HNP Assembly MCP",
  description: "Hearst Assembly transcription corpus — government meeting transcripts (Houston/Harris County), keyword alerts, and full-text search across all meetings.",
  transportType: "http",
  url: $url,
  riskTier: "low",
  vendor: "Hearst Newspapers / Assembly",
  isMock: true
}')")

MCP_KB=$(post_inline "MCP: HNP Knowledge Base" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-knowledge-base" '{
  name: "HNP Knowledge Base MCP",
  description: "HNP institutional knowledge — investigative standards, Texas govt ontology, elected-official profiles, jurisdiction-specific FOIA rules.",
  transportType: "http",
  url: $url,
  riskTier: "low",
  vendor: "Hearst Newspapers / Editorial Standards",
  isMock: true
}')")

MCP_PR=$(post_inline "MCP: HNP Public Records" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-public-records" '{
  name: "HNP Public Records MCP",
  description: "Public records / FOIA portal — submit Texas Public Information Act requests, look up status, search prior requests, confirm agency officer routing.",
  transportType: "http",
  url: $url,
  riskTier: "medium",
  vendor: "Hearst Newspapers / Public Records Desk",
  isMock: true
}')")

MCP_CMS=$(post_inline "MCP: HNP CMS" "/api/mcp-servers" "$(jq -n --arg url "${MOCK_BASE_URL}/api/mock/hnp-cms" '{
  name: "HNP CMS MCP",
  description: "Hearst CMS — create story drafts (with watermark + source-attribution gate), assign to reporters, set tags and SEO. All drafts land in editorial queue marked DRAFT — NOT FOR PUBLICATION.",
  transportType: "http",
  url: $url,
  riskTier: "high",
  vendor: "Hearst Newspapers / CMS",
  isMock: true
}')")
echo "" >&2

# ─── STEP 3: Tools per MCP server ────────────────────────────────────────────
echo "STEP 3: Registering tools on each MCP server..." >&2

post_tool() {
  local server_id="$1" name="$2" desc="$3" risk="$4" schema="$5"
  local body
  body=$(jq -n --arg n "$name" --arg d "$desc" --arg r "$risk" --argjson s "$schema" \
    '{name: $n, description: $d, riskClassification: $r, inputSchema: $s}')
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
  echo "    ✓ tool $name" >&2
}

post_tool "$MCP_ASSEMBLY" "get_transcripts"          "List meeting transcripts in the Assembly corpus filtered by jurisdiction and lookback window." "low" '{"type":"object","properties":{"jurisdiction":{"type":"string"},"limit":{"type":"number"},"lookback_days":{"type":"number"}}}'
post_tool "$MCP_ASSEMBLY" "search_transcript_corpus" "Full-text search across all meeting transcripts. Returns matching excerpts with speaker, timestamp, and meeting metadata." "low" '{"type":"object","properties":{"query":{"type":"string"},"jurisdiction":{"type":"string"},"limit":{"type":"number"}}}'
post_tool "$MCP_ASSEMBLY" "get_transcript_by_meeting" "Retrieve a single full transcript including all excerpts, attendees, and metadata for a specific meeting ID." "low" '{"type":"object","required":["meeting_id"],"properties":{"meeting_id":{"type":"string"}}}'
post_tool "$MCP_ASSEMBLY" "get_keyword_alerts"       "Retrieve Assembly keyword alerts — auto-flagged excerpts where the corpus matched a tracked keyword." "low" '{"type":"object","properties":{"keyword":{"type":"string"},"lookback_days":{"type":"number"}}}'

post_tool "$MCP_KB" "get_investigative_standards"  "Retrieve the HNP internal investigative journalism standards — two-source rule, citation requirements, right-of-reply window, AI-drafting disclosure rules." "low" '{"type":"object","properties":{}}'
post_tool "$MCP_KB" "get_entity_ontology"          "Retrieve the Texas government entity ontology — official names, jurisdiction boundaries, parent/subsidiary relationships, and FOIA officer contacts." "low" '{"type":"object","properties":{"jurisdiction":{"type":"string"},"type":{"type":"string"}}}'
post_tool "$MCP_KB" "get_official_profile"         "Retrieve elected-official profile(s) — role, term dates, notable votes, and top campaign contributors." "low" '{"type":"object","properties":{"name":{"type":"string"},"official_id":{"type":"string"}}}'
post_tool "$MCP_KB" "get_jurisdiction_foia_rules"  "Retrieve jurisdiction-specific FOIA rules including statute, response window, fee waivers, and the Texas PIA letter template." "low" '{"type":"object","properties":{"jurisdiction":{"type":"string"}}}'

post_tool "$MCP_PR" "submit_foia_request"   "Submit a FOIA / Texas PIA request to a named government agency. Routing is rejected if the agency is not in the known agencies list." "high" '{"type":"object","required":["agency","subject","records_sought"],"properties":{"agency":{"type":"string"},"requester":{"type":"string"},"subject":{"type":"string"},"records_sought":{"type":"array","items":{"type":"string"}}}}'
post_tool "$MCP_PR" "get_foia_status"       "Look up the current status of a previously filed FOIA request by its request ID." "low" '{"type":"object","required":["request_id"],"properties":{"request_id":{"type":"string"}}}'
post_tool "$MCP_PR" "search_prior_requests" "Search prior FOIA requests filed by HNP newsrooms by query, agency, or both." "low" '{"type":"object","properties":{"query":{"type":"string"},"agency":{"type":"string"},"limit":{"type":"number"}}}'
post_tool "$MCP_PR" "get_agency_officer"    "Look up the records officer, FOIA portal URL, and standard response window for a named agency. Use BEFORE submit_foia_request to confirm correct routing." "low" '{"type":"object","required":["agency"],"properties":{"agency":{"type":"string"}}}'

post_tool "$MCP_CMS" "create_story_draft" "Create a structured story-skeleton draft in the CMS. Source-attribution gate: every draft must carry at least one citation. Marked DRAFT — NOT FOR PUBLICATION." "high" '{"type":"object","required":["working_title","newspaper","desk","body","citations"],"properties":{"working_title":{"type":"string"},"newspaper":{"type":"string"},"desk":{"type":"string"},"author_agent":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"body":{"type":"string"},"citations":{"type":"array"}}}'
post_tool "$MCP_CMS" "assign_to_reporter" "Assign a story draft to a specific reporter (or auto-assign by desk)." "medium" '{"type":"object","required":["draft_id"],"properties":{"draft_id":{"type":"string"},"reporter":{"type":"string"},"desk":{"type":"string"}}}'
post_tool "$MCP_CMS" "set_story_tags"     "Set or replace tags on a story draft." "low" '{"type":"object","required":["draft_id","tags"],"properties":{"draft_id":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}}}'
post_tool "$MCP_CMS" "set_seo_fields"     "Set SEO fields on a story draft." "low" '{"type":"object","required":["draft_id"],"properties":{"draft_id":{"type":"string"},"meta_title":{"type":"string"},"meta_description":{"type":"string"},"canonical_slug":{"type":"string"}}}'
echo "" >&2

# ─── STEP 4: Skills ──────────────────────────────────────────────────────────
echo "STEP 4: Creating 6 Skills..." >&2

mk_skill() {
  local name="$1" desc="$2" tools="$3"
  jq -n --arg n "$name" --arg d "$desc" --argjson tl "$tools" '{
    name: $n, description: $d, industry: "media", domain: "Investigative-Journalism",
    version: "1.0.0", author: "Hearst Newspapers AI Platform Team",
    trustTier: "platform-provided", complexity: "intermediate",
    dependencies: ["hearst-assembly", "hnp-cms", "tx-public-records-portal"],
    tags: ["investigative-journalism", "government-accountability", "hnp-govt", "scn-hnp-1"],
    agentTypeCompatibility: ["single", "team"],
    allowedTools: $tl,
    markdownBody: ("# " + $n + "\n\n## Purpose\n" + $d + "\n\n## Compliance Notes\n- Editorial standards enforce two-source rule and source-attribution citations.\n- AI-drafted output is disclosed and watermarked DRAFT — NOT FOR PUBLICATION."),
    status: "active"
  }'
}

S1=$(post_inline "Skill: Multi-Document Synthesis"           "/api/skills" "$(mk_skill "Multi-Document Synthesis" "Reads and synthesises content across dozens of long government meeting transcripts in parallel, building a structured commitments-and-contradictions index suitable for downstream investigative angle detection." '["get_transcripts","search_transcript_corpus","get_keyword_alerts","get_transcript_by_meeting"]')")
S2=$(post_inline "Skill: Commitment Tracking"                "/api/skills" "$(mk_skill "Commitment Tracking" "Identifies on-the-record commitments by elected officials and government agencies, classifies each as kept / broken / pending, and links each commitment to the precise transcript timestamp, speaker, and originating context." '["search_transcript_corpus","get_transcript_by_meeting","get_entity_ontology"]')")
S3=$(post_inline "Skill: Investigative Angle Assessment"     "/api/skills" "$(mk_skill "Investigative Angle Assessment" "Applies investigative-journalism heuristics to a corpus extraction and scores candidate story angles on newsworthiness (1-10), evidence strength (0-1.0), public interest (1-10), verification complexity, and estimated publication timeline." '["get_investigative_standards","get_official_profile","search_prior_requests","get_jurisdiction_foia_rules"]')")
S4=$(post_inline "Skill: Source Quote Extraction"            "/api/skills" "$(mk_skill "Source Quote Extraction" "Extracts verbatim quotes from approved transcripts with full provenance: meeting ID, timestamp, speaker, role, jurisdiction. Quotes are formatted ready for newsroom CMS ingestion with the source-attribution gate." '["get_transcript_by_meeting","search_transcript_corpus"]')")
S5=$(post_inline "Skill: FOIA Request Drafting"              "/api/skills" "$(mk_skill "FOIA Request Drafting" "Drafts jurisdiction-specific FOIA request letters using the correct statutory language, addressed to the correct records officer based on the jurisdiction ontology, and tracks the resulting filings." '["get_jurisdiction_foia_rules","get_agency_officer","search_prior_requests","submit_foia_request"]')")
S6=$(post_inline "Skill: Source Attribution Enforcement"     "/api/skills" "$(mk_skill "Source Attribution Enforcement" "Validates that every quantitative claim and every direct quote in agent output carries a source citation to a specific transcript timestamp, contract, vote roll, or FOIA response. Uncited claims are blocked from CMS submission." '["create_story_draft","assign_to_reporter","set_story_tags"]')")
echo "" >&2

# ─── STEP 5: Outcome Contract ────────────────────────────────────────────────
echo "STEP 5: Creating Outcome Contract..." >&2

OUTCOME=$(post_inline "Outcome: Government Beat Intelligence" "/api/outcomes" '{
  "name": "HNP Government Beat Intelligence — Assembly-to-Investigation Pipeline",
  "description": "Outcome contract governing the HNP-HOUSTON-GOVT-BEAT pipeline. Compresses days of manual transcript synthesis into a 45-minute brief with full provenance, suitable for breaking-event government accountability reporting.",
  "industry": "media",
  "domain": "Investigative-Journalism",
  "riskTier": "high",
  "businessOutcome": "Cut time-from-meeting-to-reporter-brief from 3 days to 45 minutes with full provenance and zero unverifiable claims",
  "successCriteria": "Reporter approves >=75% of surfaced angles; FOIA filed within 24 hours of approval; mean evidence confidence >0.82",
  "tags": ["hnp-govt", "scn-hnp-1", "government-accountability", "houston"],
  "status": "active"
}')
echo "" >&2

# ─── STEP 6: Policies ────────────────────────────────────────────────────────
echo "STEP 6: Creating 4 Governance Policies..." >&2

mk_policy() {
  local name="$1" domain="$2" desc="$3" enforcement="$4"
  jq -n --arg n "$name" --arg dm "$domain" --arg d "$desc" --arg e "$enforcement" '{
    name: $n, description: $d, domain: $dm,
    industry: "media",
    enforcementMode: $e,
    severity: "high",
    rules: [{ id: "R1", description: $d, action: $e, condition: "always" }],
    tags: ["hnp-govt", "scn-hnp-1", "editorial-oversight"],
    status: "active"
  }'
}

P1=$(post_inline "Policy: Human Reporter Gate"            "/api/policies" "$(mk_policy "Human Reporter Gate" "editorial_oversight" "No story draft enters the CMS without explicit reporter angle approval at the Review Brief gate. The AI never initiates a publication pathway. Triggers if create_story_draft is called for an angle that has not been marked APPROVED." "block")")
P2=$(post_inline "Policy: Source Attribution Requirement" "/api/policies" "$(mk_policy "Source Attribution Requirement" "editorial_standards" "Every fact in the story skeleton must carry a source citation to a specific transcript, timestamp, and speaker (or to a contract / vote roll / FOIA response). Uncited claims are blocked at the CMS gate." "block")")
P3=$(post_inline "Policy: Publication Boundary"           "/api/policies" "$(mk_policy "Publication Boundary" "editorial_oversight" "All agent outputs are marked DRAFT — NOT FOR PUBLICATION. Removal of this watermark requires editorial sign-off through the normal CMS workflow. The agent cannot publish." "warn")")
P4=$(post_inline "Policy: FOIA Accuracy Gate"             "/api/policies" "$(mk_policy "FOIA Accuracy Gate" "public_records" "FOIA request letters require reporter acknowledgement before filing. The agent cannot file unilaterally and must confirm agency routing through get_agency_officer before submit_foia_request." "warn")")
echo "" >&2

# ─── STEP 7: Ontology Concepts ───────────────────────────────────────────────
echo "STEP 7: Creating 6 Ontology Concepts..." >&2

cat > "$WORK/ontology.json" <<'ENDJSON'
{
  "concepts": [
    {"id":"hnp-govt-houston-council","industryId":"media","ontologyName":"Texas Government Entities","label":"Houston City Council","category":"legislative_body","description":"Primary legislative body for the City of Houston; 16 council members + Mayor.","synonyms":["HOU-COUNCIL","Houston Council"],"tags":["hnp-govt","texas","houston"],"source":"hnp-govt-provisioning"},
    {"id":"hnp-govt-harris-commissioners","industryId":"media","ontologyName":"Texas Government Entities","label":"Harris County Commissioners Court","category":"legislative_body","description":"Governing body of Harris County, TX; 4 commissioners + County Judge.","synonyms":["HC-COMMISSIONERS","Harris Commissioners"],"tags":["hnp-govt","texas","harris-county"],"source":"hnp-govt-provisioning"},
    {"id":"hnp-govt-hcfcd","industryId":"media","ontologyName":"Texas Government Entities","label":"Harris County Flood Control District","category":"executive_agency","description":"County agency responsible for flood-damage reduction across Harris County watersheds.","synonyms":["HCFCD"],"tags":["hnp-govt","texas","harris-county","flood-control"],"source":"hnp-govt-provisioning"},
    {"id":"hnp-govt-tceq","industryId":"media","ontologyName":"Texas Government Entities","label":"Texas Commission on Environmental Quality","category":"state_agency","description":"Primary state agency for environmental regulation in Texas.","synonyms":["TCEQ"],"tags":["hnp-govt","texas","environmental"],"source":"hnp-govt-provisioning"},
    {"id":"hnp-govt-txdot","industryId":"media","ontologyName":"Texas Government Entities","label":"Texas Department of Transportation","category":"state_agency","description":"State transportation agency responsible for highway infrastructure.","synonyms":["TxDOT"],"tags":["hnp-govt","texas","transportation"],"source":"hnp-govt-provisioning"},
    {"id":"hnp-govt-tx-pia","industryId":"media","ontologyName":"Texas Government Entities","label":"Texas Public Information Act","category":"regulation","description":"Texas Government Code Chapter 552 — the Texas open records / FOIA statute.","synonyms":["PIA","Texas FOIA","Tex. Gov't Code Ch. 552"],"tags":["hnp-govt","texas","foia","regulation"],"source":"hnp-govt-provisioning"}
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
echo "STEP 8: Creating 4 HNP-GOVT Agents..." >&2

SP01='You are HNP-GOVT-01, the Meeting Corpus Analyst for the Hearst Newspapers HNP-HOUSTON-GOVT-BEAT pipeline. Process the entire Hearst Assembly transcript corpus for a specified jurisdiction and time window. Run parallel extraction across all transcripts and produce a structured commitments-and-evidence summary suitable for downstream investigation angle detection. Every finding MUST cite the specific transcript meeting ID, timestamp in seconds, and speaker. No uncited finding is acceptable. Use get_transcripts, search_transcript_corpus, get_keyword_alerts, get_entity_ontology, and get_investigative_standards. End your response with a JSON synthesis block containing jurisdiction, transcriptsProcessed, totalHoursAnalyzed, commitmentsExtracted, commitmentsKept/Broken/Pending, namedEntities, topCommitments (with meetingId/timestampSec/speaker), topicClusters, and handoffToAgent02:true.'

SP02='You are HNP-GOVT-02, the Investigation Angle Detector for the HNP-HOUSTON-GOVT-BEAT pipeline. Receive the structured corpus extraction from HNP-GOVT-01 and apply investigative-journalism heuristics to surface publishable story angles. Score each on newsworthiness (1-10), evidenceStrength (0-1.0), publicInterest (1-10), verificationComplexity, and estimatedPublicationDays. You MUST consult get_investigative_standards. You MUST consult get_official_profile when an angle implicates a specific official. You MUST search_prior_requests to know what FOIA records HNP already has. End your response with a JSON ranked-angles block including primarySource (with meetingId/timestampSec/speaker), secondSourceRequired, interviewTargets, and handoffToReporterGate:true.'

SP03='You are HNP-GOVT-03, the Story Draft Agent for the HNP-HOUSTON-GOVT-BEAT pipeline. You are triggered ONLY after a reporter has explicitly approved one or more angles at the Review Brief gate. Produce a structured story SKELETON — not a finished article. CRITICAL CONSTRAINTS: (1) Every claim in the body must carry a citation to its source (meeting ID + timestamp + speaker, or contract reference, or FOIA response ID). (2) Direct quotes verbatim from transcript with timestamp. (3) Use [REPORTER TO ADD: ...] placeholders for reporter follow-up. (4) The CMS source-attribution gate WILL REJECT uncited drafts — do not attempt bypass. (5) The CMS will apply DRAFT — NOT FOR PUBLICATION watermark. Tools: search_transcript_corpus, get_transcript_by_meeting, create_story_draft, assign_to_reporter, set_story_tags. End with a JSON draft block.'

SP04='You are HNP-GOVT-04, the FOIA Request Generator for the HNP-HOUSTON-GOVT-BEAT pipeline. Triggered alongside HNP-GOVT-03 when reporters approve angles. Identify public records that would strengthen each claim, draft Texas Public Information Act request letters addressed to the correct records officer, and file via the public-records portal. CRITICAL: (1) Use get_agency_officer to confirm the agency exists BEFORE calling submit_foia_request — unknown agencies are rejected. (2) Use get_jurisdiction_foia_rules for correct statutory language (Tex. Gov''t Code Ch. 552). (3) Records sought must be SPECIFIC — name document type and date range. (4) Use search_prior_requests first — never duplicate a delivered request. End with a JSON filings block.'

mk_agent_payload() {
  local external_id="$1" name="$2" desc="$3" model="$4" risk="$5" sysprompt="$6" tools_json="$7"
  jq -n --arg eid "$external_id" --arg n "$name" --arg d "$desc" --arg m "$model" \
        --arg r "$risk" --arg sp "$sysprompt" --argjson tools "$tools_json" '{
    name: $n,
    description: $d,
    type: "ai-agent",
    industry: "media",
    domain: "Investigative-Journalism",
    riskTier: ($r | ascii_downcase),
    status: "active",
    autonomyLevel: "human_in_loop",
    modelProvider: "anthropic",
    modelName: $m,
    systemPrompt: $sp,
    metadata: {
      externalId: $eid,
      pipeline: "HNP-HOUSTON-GOVT-BEAT",
      scenario: "SCN-HNP-1",
      customer: "Hearst Newspapers",
      department: "Investigations"
    },
    toolsConfig: { tools: $tools },
    rollbackPlan: {
      version: "1.0.0",
      procedure: "Revert to manual reporter-driven transcript review; pause agent runtime; notify Investigations editor.",
      runbook: "HNP Editorial Operations — Manual Transcript Review Fallback"
    }
  }'
}

A1=$(post_inline "Agent: HNP-GOVT-01 Meeting Corpus Analyst" "/api/agents" "$(mk_agent_payload "HNP-GOVT-01" "HNP-GOVT-01 Meeting Corpus Analyst" "Processes the entire Hearst Assembly transcript corpus for a specified jurisdiction and time window. Runs parallel extraction across transcripts: identifies commitments, named entities, dollar amounts, and topic clusters relevant to the breaking event context." "claude-opus-4-5" "MEDIUM" "$SP01" '[
  {"id":"get_transcripts","name":"get_transcripts","description":"List meeting transcripts","rateLimit":100,"timeout":15000},
  {"id":"search_transcript_corpus","name":"search_transcript_corpus","description":"Full-text search transcripts","rateLimit":100,"timeout":15000},
  {"id":"get_transcript_by_meeting","name":"get_transcript_by_meeting","description":"Retrieve full transcript","rateLimit":100,"timeout":15000},
  {"id":"get_keyword_alerts","name":"get_keyword_alerts","description":"Auto-flagged excerpts","rateLimit":100,"timeout":10000},
  {"id":"get_entity_ontology","name":"get_entity_ontology","description":"TX govt entity definitions","rateLimit":100,"timeout":10000},
  {"id":"get_investigative_standards","name":"get_investigative_standards","description":"HNP editorial standards","rateLimit":100,"timeout":10000}
]')")

A2=$(post_inline "Agent: HNP-GOVT-02 Investigation Angle Detector" "/api/agents" "$(mk_agent_payload "HNP-GOVT-02" "HNP-GOVT-02 Investigation Angle Detector" "Receives the structured corpus extraction and applies investigative-journalism heuristics to identify publishable story angles. Scores each angle on newsworthiness, evidence strength, public interest, verification complexity, and estimated publication timeline." "claude-opus-4-5" "HIGH" "$SP02" '[
  {"id":"get_investigative_standards","name":"get_investigative_standards","description":"HNP editorial standards","rateLimit":100,"timeout":10000},
  {"id":"get_official_profile","name":"get_official_profile","description":"Official term/votes/contributors","rateLimit":100,"timeout":10000},
  {"id":"get_entity_ontology","name":"get_entity_ontology","description":"TX govt entity definitions","rateLimit":100,"timeout":10000},
  {"id":"search_prior_requests","name":"search_prior_requests","description":"Prior HNP FOIA filings","rateLimit":100,"timeout":10000},
  {"id":"get_jurisdiction_foia_rules","name":"get_jurisdiction_foia_rules","description":"Jurisdiction FOIA rules","rateLimit":100,"timeout":10000}
]')")

A3=$(post_inline "Agent: HNP-GOVT-03 Story Draft Agent" "/api/agents" "$(mk_agent_payload "HNP-GOVT-03" "HNP-GOVT-03 Story Draft Agent" "Triggered after reporter approves at least one angle at the Review Brief gate. Produces a structured story skeleton: lede options, key facts in narrative order, verbatim quotes, interview-target list, and placeholder markers for reporter-gathered material. Every claim is marked with its source citation." "claude-opus-4-5" "HIGH" "$SP03" '[
  {"id":"search_transcript_corpus","name":"search_transcript_corpus","description":"Full-text search transcripts","rateLimit":100,"timeout":15000},
  {"id":"get_transcript_by_meeting","name":"get_transcript_by_meeting","description":"Retrieve full transcript","rateLimit":100,"timeout":15000},
  {"id":"create_story_draft","name":"create_story_draft","description":"Create CMS story draft (source-attribution gate)","rateLimit":50,"timeout":20000},
  {"id":"assign_to_reporter","name":"assign_to_reporter","description":"Assign draft to reporter","rateLimit":100,"timeout":10000},
  {"id":"set_story_tags","name":"set_story_tags","description":"Set story tags","rateLimit":100,"timeout":10000}
]')")

A4=$(post_inline "Agent: HNP-GOVT-04 FOIA Request Generator" "/api/agents" "$(mk_agent_payload "HNP-GOVT-04" "HNP-GOVT-04 FOIA Request Generator" "Triggered alongside Story Draft. Analyses approved story angles to identify public records that would strengthen each claim. Generates Texas PIA letters addressed to the correct records officer based on the jurisdiction knowledge base, then files them via the public-records portal." "claude-sonnet-4-5" "MEDIUM" "$SP04" '[
  {"id":"get_jurisdiction_foia_rules","name":"get_jurisdiction_foia_rules","description":"Jurisdiction FOIA rules","rateLimit":100,"timeout":10000},
  {"id":"get_agency_officer","name":"get_agency_officer","description":"Confirm agency routing","rateLimit":100,"timeout":10000},
  {"id":"get_entity_ontology","name":"get_entity_ontology","description":"TX govt entity disambiguation","rateLimit":100,"timeout":10000},
  {"id":"search_prior_requests","name":"search_prior_requests","description":"Prior FOIA filings","rateLimit":100,"timeout":10000},
  {"id":"submit_foia_request","name":"submit_foia_request","description":"File FOIA request","rateLimit":50,"timeout":20000}
]')")
echo "" >&2

# ─── STEP 9: Per-agent wiring ────────────────────────────────────────────────
echo "STEP 9: Wiring skills/policies/KB/runtime to each agent..." >&2

patch_agent() {
  local agent_id="$1" prompt_text="$2" kb_id="$3" skills_json="$4" policies_json="$5" blueprint_json="$6"
  local f="$WORK/agent_patch_${agent_id}.json"
  jq -n --arg p "$prompt_text" --arg kb "$kb_id" \
        --argjson sk "$skills_json" --argjson pl "$policies_json" --argjson bp "$blueprint_json" '{
    preloadedSkills: $sk,
    policyBindings: $pl,
    memoryRagConfig: {
      primaryKnowledgeBase: $kb,
      embeddingModel: "text-embedding-3-small",
      topK: 8,
      scoreThreshold: 0.72,
      chunkStrategy: "fixed_with_overlap",
      sources: [{ type: "knowledge_base", id: $kb, description: "Primary KB for HNP-GOVT pipeline." }]
    },
    runtimeConfig: {
      prompt: $p,
      scheduleIntervalMinutes: 0,
      maxToolIterations: 12,
      timeoutMs: 180000,
      latencyTargetMs: 90000,
      retryPolicy: { maxRetries: 2, backoffMs: 2000 },
      humanInLoopEvents: ["reporter_brief_review", "cms_attribution_block", "foia_routing_failure"],
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

BLUEPRINT_JSON=$(jq -n --arg a1 "$A1" --arg a2 "$A2" --arg a3 "$A3" --arg a4 "$A4" '{
  pipeline: "HNP-HOUSTON-GOVT-BEAT",
  nodes: [
    { id: "n1", type: "agent_task",  label: "Corpus Synthesis",      agentId: $a1, agentExternalId: "HNP-GOVT-01" },
    { id: "n2", type: "agent_task",  label: "Angle Detection",       agentId: $a2, agentExternalId: "HNP-GOVT-02" },
    { id: "n3", type: "human_in_loop", label: "Reporter Brief Review (Human Gate)", reviewer: "Investigations Reporter" },
    { id: "n4", type: "agent_task",  label: "Story Skeleton Draft",  agentId: $a3, agentExternalId: "HNP-GOVT-03" },
    { id: "n5", type: "agent_task",  label: "FOIA Filing",           agentId: $a4, agentExternalId: "HNP-GOVT-04" },
    { id: "n6", type: "audit",       label: "Provenance Trail" }
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

P_ALL=$(jq -n --arg p1 "$P1" --arg p2 "$P2" --arg p3 "$P3" --arg p4 "$P4" \
  '[ {policyId:$p1,enforcement:"active"}, {policyId:$p2,enforcement:"active"}, {policyId:$p3,enforcement:"active"}, {policyId:$p4,enforcement:"active"} ]')

SK01=$(jq -n --arg s1 "$S1" --arg s2 "$S2" '[ {skillId:$s1,loadOrder:1}, {skillId:$s2,loadOrder:2} ]')
SK02=$(jq -n --arg s3 "$S3" '[ {skillId:$s3,loadOrder:1} ]')
SK03=$(jq -n --arg s4 "$S4" --arg s6 "$S6" '[ {skillId:$s4,loadOrder:1}, {skillId:$s6,loadOrder:2} ]')
SK04=$(jq -n --arg s5 "$S5" '[ {skillId:$s5,loadOrder:1} ]')

P01_PROMPT='Process the Hearst Assembly transcript corpus for a specified jurisdiction and time window. Run parallel extraction; produce structured commitments-and-evidence JSON. Tools: get_transcripts (start by listing the corpus), search_transcript_corpus (drainage, flood, contractor, bond), get_keyword_alerts, get_entity_ontology, get_investigative_standards. Every finding MUST cite meeting_id + timestampSec + speaker. End with the synthesis JSON block per system prompt.'
P02_PROMPT='Receive corpus extraction from HNP-GOVT-01. Apply investigative heuristics. For each candidate angle: confirm at least one transcript-level source citation, identify the second source needed for the two-source rule, list interview targets, and recommend FOIA records that would verify the claim. Tools: get_investigative_standards, get_official_profile (for any implicated official), get_entity_ontology, search_prior_requests, get_jurisdiction_foia_rules. End with the ranked-angles JSON per system prompt.'
P03_PROMPT='Triggered ONLY after reporter angle approval at Review Brief gate. Produce a structured story skeleton with cited claims and verbatim quotes. Use [REPORTER TO ADD: ...] for reporter follow-up. Tools: search_transcript_corpus, get_transcript_by_meeting, create_story_draft (CMS source-attribution gate), assign_to_reporter, set_story_tags. End with the draft JSON per system prompt.'
P04_PROMPT='Triggered alongside HNP-GOVT-03. Identify public records that would strengthen each approved angle. Confirm agency routing via get_agency_officer FIRST. Use get_jurisdiction_foia_rules for the correct statutory language. Search_prior_requests to avoid duplicates. Then submit_foia_request with specific records sought. End with the filings JSON per system prompt.'

patch_agent "$A1" "$P01_PROMPT" "$KB1" "$SK01" "$P_ALL" "$BLUEPRINT_JSON"
patch_agent "$A2" "$P02_PROMPT" "$KB2" "$SK02" "$P_ALL" "$BLUEPRINT_JSON"
patch_agent "$A3" "$P03_PROMPT" "$KB2" "$SK03" "$P_ALL" "$BLUEPRINT_JSON"
patch_agent "$A4" "$P04_PROMPT" "$KB3" "$SK04" "$P_ALL" "$BLUEPRINT_JSON"
echo "" >&2

# ─── STEP 10: KB links ───────────────────────────────────────────────────────
echo "STEP 10: Linking Knowledge Bases to agents..." >&2

link_kb() {
  local agent_id="$1" kb_id="$2" priority="$3"
  local body
  body=$(jq -n --arg kb "$kb_id" --arg pr "$priority" \
    '{ knowledgeBaseId: $kb, priority: ($pr | tonumber), retrievalConfig: { topK: 8, scoreThreshold: 0.72, hybridSearch: true } }')
  local response link_id
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
link_kb "$A2" "$KB2" 1; link_kb "$A2" "$KB4" 2
link_kb "$A3" "$KB2" 1; link_kb "$A3" "$KB1" 2
link_kb "$A4" "$KB3" 1; link_kb "$A4" "$KB2" 2
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

link_mcp "$A1" "$MCP_ASSEMBLY"; link_mcp "$A1" "$MCP_KB"
link_mcp "$A2" "$MCP_KB";       link_mcp "$A2" "$MCP_PR"
link_mcp "$A3" "$MCP_ASSEMBLY"; link_mcp "$A3" "$MCP_CMS"
link_mcp "$A4" "$MCP_PR";       link_mcp "$A4" "$MCP_KB"
echo "" >&2

# ─── STEP 12: Eval Suite ─────────────────────────────────────────────────────
echo "STEP 12: Creating Eval Suite..." >&2

EVAL_SUITE=$(post_inline "Eval Suite: HNP-GOVT Regression" "/api/evals" "$(jq -n --arg aid "$A1" '{
  agentId: $aid,
  name: "HNP Government Beat Intelligence — Regression Suite",
  type: "regression",
  industry: "media",
  scorerConfig: {
    primaryScorer: "llm_judge",
    fallbackScorer: "exact_match",
    dimensions: [
      {name: "Corpus Synthesis Fidelity", weight: 2.0, criteria: ["Commitments correctly classified kept/broken/pending","Named entities resolved against ontology","Dollar amounts within ±2% of source"]},
      {name: "Angle Newsworthiness",      weight: 1.5, criteria: ["Newsworthiness scores aligned with editorial standards","Public-interest framing present","Verification complexity quantified"]},
      {name: "Source Attribution Coverage", weight: 3.0, criteria: ["Every claim cited","Citations point to a specific transcript timestamp / contract / FOIA response","No uncited adverse allegation"]},
      {name: "Right-of-Reply Compliance", weight: 2.0, criteria: ["Subjects of adverse reporting flagged for reply outreach","Reply window respected"]},
      {name: "FOIA Routing Accuracy",     weight: 2.0, criteria: ["Correct records officer addressed","Statutory language correct (Tex. Govt Code Ch. 552)","Records sought specific and dated"]}
    ]
  },
  thresholdConfig: { minPassRate: 0.90 },
  coverageTags: ["hnp-govt","scn-hnp-1","investigative-journalism","source-attribution","foia"],
  environmentThresholds: {
    production: {minPassRate: 0.90},
    staging: {minPassRate: 0.85}
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
    echo "    ⚠ deployment create returned no id: $response" >&2
    return 0
  fi
  echo "    ✓ deployment $agent_name → $did" >&2
}

create_deploy "$A1" "HNP-GOVT-01 Meeting Corpus Analyst"
create_deploy "$A2" "HNP-GOVT-02 Investigation Angle Detector"
create_deploy "$A3" "HNP-GOVT-03 Story Draft Agent"
create_deploy "$A4" "HNP-GOVT-04 FOIA Request Generator"
echo "" >&2

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
echo "==================================================" >&2
echo " HNP-GOVT PRODUCTION MIGRATION COMPLETE" >&2
echo "==================================================" >&2
echo "" >&2
echo "Production Org ID: $PROD_ORG_ID" >&2
echo "" >&2
echo "Knowledge Bases:  $KB1  $KB2  $KB3  $KB4" >&2
echo "MCP Servers:      $MCP_ASSEMBLY  $MCP_KB  $MCP_PR  $MCP_CMS" >&2
echo "Skills (6):       $S1  $S2  $S3  $S4  $S5  $S6" >&2
echo "Policies (4):     $P1  $P2  $P3  $P4" >&2
echo "Outcome:          $OUTCOME" >&2
echo "Eval Suite:       $EVAL_SUITE" >&2
echo "" >&2
echo "Agents:" >&2
echo "  HNP-GOVT-01 Meeting Corpus Analyst:       $A1" >&2
echo "  HNP-GOVT-02 Investigation Angle Detector: $A2" >&2
echo "  HNP-GOVT-03 Story Draft Agent:            $A3" >&2
echo "  HNP-GOVT-04 FOIA Request Generator:       $A4" >&2
echo "==================================================" >&2

# Machine-readable IDs on stdout
echo "HNP_GOVT_PROD_ORG_ID=$PROD_ORG_ID"
echo "HNP_GOVT_PROD_A1=$A1"
echo "HNP_GOVT_PROD_A2=$A2"
echo "HNP_GOVT_PROD_A3=$A3"
echo "HNP_GOVT_PROD_A4=$A4"
echo "HNP_GOVT_PROD_EVAL_SUITE=$EVAL_SUITE"
