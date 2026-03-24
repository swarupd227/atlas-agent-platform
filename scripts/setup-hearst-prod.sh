#!/usr/bin/env bash
# =============================================================================
# setup-hearst-prod.sh
# Verifies and repairs the Hearst NBA demo resources on the ATLAS platform.
#
# USAGE:
#   # Against production:
#   PROD_URL=https://agent-lifecycle-management-platform.replit.app bash scripts/setup-hearst-prod.sh
#
#   # Against local dev:
#   PROD_URL=http://localhost:5000 bash scripts/setup-hearst-prod.sh
#
# WHAT THIS DOES:
#   1. Verifies all 5 Hearst agents exist (by their fixed UUIDs)
#   2. Locates the 4 Hearst MCP servers by name (creates any missing ones)
#   3. Patches MCP server URLs to use PROD_URL (fixes localhost refs)
#   4. Verifies each MCP server has the correct tools (adds any missing)
#   5. Ensures every agent is linked to its required MCP servers
#   6. Smoke-tests all key REST and mock MCP endpoints
#
# NOTES:
#   - Agents are inserted with fixed UUIDs by ensureHearstAgents() at server
#     startup. This script verifies they exist and reports status.
#   - MCP server IDs are auto-generated; this script always looks them up
#     by name, never by UUID.
#   - Run this script after every fresh deployment or database reset.
#   - Requires: curl, jq
# =============================================================================

set -euo pipefail

PROD_URL="${PROD_URL:-https://agent-lifecycle-management-platform.replit.app}"
PROD_URL="${PROD_URL%/}"   # strip trailing slash

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BLUE='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "  ${YELLOW}!${NC} $*"; }
info() { echo -e "  ${BLUE}→${NC} $*"; }
hdr()  { echo -e "\n${BOLD}$*${NC}"; }

ERRORS=0

# ── Helpers ───────────────────────────────────────────────────────────────────

# GET path → sets $RESP_BODY and $RESP_STATUS
api_get() {
  local path="$1"
  local raw
  raw=$(curl -s -w "\n__STATUS__%{http_code}" -H "Accept: application/json" "${PROD_URL}${path}")
  RESP_STATUS=$(echo "$raw" | grep -o '__STATUS__[0-9]*' | grep -o '[0-9]*')
  RESP_BODY=$(echo "$raw" | sed 's/__STATUS__[0-9]*$//')
}

# POST JSON → sets $RESP_BODY and $RESP_STATUS
api_post() {
  local path="$1" body="$2"
  local raw
  raw=$(curl -s -w "\n__STATUS__%{http_code}" \
    -X POST -H "Content-Type: application/json" -H "Accept: application/json" \
    -d "$body" "${PROD_URL}${path}")
  RESP_STATUS=$(echo "$raw" | grep -o '__STATUS__[0-9]*' | grep -o '[0-9]*')
  RESP_BODY=$(echo "$raw" | sed 's/__STATUS__[0-9]*$//')
}

# PATCH JSON → sets $RESP_STATUS only
api_patch() {
  local path="$1" body="$2"
  RESP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PATCH -H "Content-Type: application/json" -H "Accept: application/json" \
    -d "$body" "${PROD_URL}${path}")
}

# ── Known Agent UUIDs ─────────────────────────────────────────────────────────
declare -a AGENT_IDS=(
  "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d"
  "92584a77-d150-4436-9083-a108584bc021"
  "151db72c-0038-4f01-a4bb-45650a82e8b6"
  "7de4167e-6b0c-4f04-9fcf-3693bda1d255"
  "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d"
)
declare -A AGENT_NAMES=(
  ["3a2e02ad-f07a-42ff-9c16-d9b4956dc34d"]="Subscriber Profile Engine"
  ["92584a77-d150-4436-9083-a108584bc021"]="Content Inventory Agent"
  ["151db72c-0038-4f01-a4bb-45650a82e8b6"]="NBA Email Decision Agent"
  ["7de4167e-6b0c-4f04-9fcf-3693bda1d255"]="Send Time Optimizer"
  ["8cb64dc1-278e-44bf-8f42-9b11a1c4f82d"]="Performance & Learning Agent"
)

# ── MCP Server definitions ────────────────────────────────────────────────────
declare -a MCP_NAMES=(
  "Hearst Data Platform"
  "Hearst CMS"
  "Hearst Email Queue"
  "Hearst Analytics"
)
declare -A MCP_URLS=(
  ["Hearst Data Platform"]="/api/mock/hearst-data-platform"
  ["Hearst CMS"]="/api/mock/hearst-cms"
  ["Hearst Email Queue"]="/api/mock/hearst-email-queue"
  ["Hearst Analytics"]="/api/mock/hearst-analytics"
)
declare -A MCP_EXPECTED_TOOLS=(
  ["Hearst Data Platform"]=5
  ["Hearst CMS"]=4
  ["Hearst Email Queue"]=3
  ["Hearst Analytics"]=4
)
declare -A MCP_PROBE_PATHS=(
  ["Hearst Data Platform"]="/api/mock/hearst-data-platform/esp-events"
  ["Hearst CMS"]="/api/mock/hearst-cms/articles"
  ["Hearst Email Queue"]="/api/mock/hearst-email-queue/fatigue-rules"
  ["Hearst Analytics"]="/api/mock/hearst-analytics/deliverability"
)

# ── Agent → required MCP server links ────────────────────────────────────────
# Stored as parallel arrays of (agentId, serverName) pairs
LINK_AGENTS=(
  "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d"
  "92584a77-d150-4436-9083-a108584bc021"
  "92584a77-d150-4436-9083-a108584bc021"
  "151db72c-0038-4f01-a4bb-45650a82e8b6"
  "151db72c-0038-4f01-a4bb-45650a82e8b6"
  "7de4167e-6b0c-4f04-9fcf-3693bda1d255"
  "7de4167e-6b0c-4f04-9fcf-3693bda1d255"
  "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d"
)
LINK_SERVERS=(
  "Hearst Data Platform"
  "Hearst CMS"
  "Hearst Email Queue"
  "Hearst Data Platform"
  "Hearst Email Queue"
  "Hearst Data Platform"
  "Hearst Analytics"
  "Hearst Analytics"
)

# ── Tool definitions (16 total, for filling in any that are missing) ──────────
# Format: "ServerName|||tool_name|||description|||endpoint"
TOOL_DEFS=(
  "Hearst Data Platform|||get_esp_events|||Retrieve subscriber ESP engagement events (opens, clicks, bounces, unsubscribes).|||esp-events"
  "Hearst Data Platform|||get_website_behavior|||Retrieve subscriber website behavior — pages visited, article reads, time-on-site per brand.|||website-behavior"
  "Hearst Data Platform|||get_subscription_status|||Retrieve subscriber lifecycle status — active, churned, trial, paused, engagement tier.|||subscription-status"
  "Hearst Data Platform|||get_purchase_history|||Retrieve subscriber purchase and conversion history including affiliate revenue attribution per brand.|||purchase-history"
  "Hearst Data Platform|||get_demographic_data|||Retrieve subscriber demographic and psychographic profiles — age, location, interests, affinity vectors.|||demographic-data"
  "Hearst CMS|||get_editorial_calendar|||Retrieve today's editorial calendar — scheduled articles, send windows, embargo dates.|||editorial-calendar"
  "Hearst CMS|||get_cms_articles|||Retrieve CMS article inventory — title, brand, category, freshness score, email-sendability.|||articles"
  "Hearst CMS|||get_newsletter_archives|||Retrieve sent newsletter archives — subject lines, send dates, open rates, click-through rates.|||newsletter-archives"
  "Hearst CMS|||get_content_performance|||Retrieve content performance scores — article-level open rate lift, engagement score, conversion.|||content-performance"
  "Hearst Email Queue|||get_brand_email_queues|||Retrieve current email queue depth and send schedules per brand — queued volume, priority segments.|||brand-email-queues"
  "Hearst Email Queue|||get_fatigue_rules|||Retrieve portfolio-wide subscriber fatigue rules — max sends per week, cool-down periods, re-engagement.|||fatigue-rules"
  "Hearst Email Queue|||get_business_rules|||Retrieve NBA business rules — personalization triggers, hold criteria, AI influence thresholds.|||business-rules"
  "Hearst Analytics|||get_send_logs|||Retrieve historical email send logs — volume, open rates, click rates, anomaly flags per brand.|||send-logs"
  "Hearst Analytics|||get_conversion_data|||Retrieve email-to-conversion funnel data — subscription starts, affiliate clicks, revenue per campaign.|||conversion-data"
  "Hearst Analytics|||get_deliverability|||Retrieve email deliverability health — inbox placement rate, bounce rate, spam complaints per brand.|||deliverability"
  "Hearst Analytics|||get_affiliate_revenue|||Retrieve affiliate revenue data — total revenue, top articles, conversion rates, brand-level attribution.|||affiliate-revenue"
)

# Runtime lookup: serverName → DB UUID (populated in Step 2)
declare -A MCP_IDS

# =============================================================================
echo -e "\n${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        ATLAS · Hearst NBA Demo — Production Setup Check       ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo -e "  Target: ${BLUE}${PROD_URL}${NC}"

# =============================================================================
hdr "Step 1 — Verify Hearst agents (5 expected)"
# =============================================================================

for agent_id in "${AGENT_IDS[@]}"; do
  agent_name="${AGENT_NAMES[$agent_id]}"
  api_get "/api/agents/${agent_id}"

  if [[ "$RESP_STATUS" == "200" ]]; then
    ok "Agent present: ${agent_name}"
    ok "  UUID: ${agent_id}"
  elif [[ "$RESP_STATUS" == "404" ]]; then
    fail "Agent MISSING: ${agent_name} (${agent_id})"
    warn "  Trigger: restart the server so ensureHearstAgents() re-runs"
  else
    fail "Unexpected HTTP ${RESP_STATUS} for agent: ${agent_name}"
  fi
done

# =============================================================================
hdr "Step 2 — Locate Hearst MCP servers by name (creates any missing)"
# =============================================================================

info "Fetching MCP server list …"
api_get "/api/mcp-servers"
if [[ "$RESP_STATUS" != "200" ]]; then
  fail "Cannot GET /api/mcp-servers (HTTP ${RESP_STATUS}) — aborting"
  exit 1
fi
ALL_SERVERS="$RESP_BODY"

for srv_name in "${MCP_NAMES[@]}"; do
  # jq lookup by name — returns ID or empty string
  srv_id=$(echo "$ALL_SERVERS" | jq -r --arg n "$srv_name" \
    '.[] | select(.name == $n) | .id' 2>/dev/null | head -1)

  if [[ -n "$srv_id" ]]; then
    ok "MCP server found: ${srv_name}"
    ok "  ID: ${srv_id}"
    MCP_IDS["$srv_name"]="$srv_id"
  else
    warn "MCP server NOT found: '${srv_name}' — creating …"
    correct_url="${PROD_URL}${MCP_URLS[$srv_name]}"
    create_body=$(jq -n \
      --arg name "$srv_name" \
      --arg url  "$correct_url" \
      '{
        name: $name,
        description: ("Hearst NBA demo MCP server — " + $name),
        transportType: "streamable-http",
        url: $url,
        status: "registered",
        riskTier: "MEDIUM",
        allowlisted: true,
        addedBy: "setup-hearst-prod-script",
        capabilities: { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo: { vendor: "Hearst Communications", version: "1.0.0" }
      }')
    api_post "/api/mcp-servers" "$create_body"
    if [[ "$RESP_STATUS" == "201" ]]; then
      srv_id=$(echo "$RESP_BODY" | jq -r '.id')
      ok "Created MCP server: ${srv_name} → ${srv_id}"
      MCP_IDS["$srv_name"]="$srv_id"
    else
      fail "Failed to create '${srv_name}' (HTTP ${RESP_STATUS}): $(echo "$RESP_BODY" | jq -r '.message // .')"
    fi
  fi
done

# =============================================================================
hdr "Step 3 — Patch MCP server URLs to use ${PROD_URL}"
# =============================================================================

for srv_name in "${MCP_NAMES[@]}"; do
  srv_id="${MCP_IDS[$srv_name]:-}"
  [[ -z "$srv_id" ]] && warn "Skipping URL patch for ${srv_name} (no ID)" && continue

  correct_url="${PROD_URL}${MCP_URLS[$srv_name]}"
  api_get "/api/mcp-servers/${srv_id}"
  current_url=$(echo "$RESP_BODY" | jq -r '.url // ""')

  if [[ "$current_url" == "$correct_url" ]]; then
    ok "URL correct: ${srv_name}"
  else
    info "Patching URL: ${current_url:-(empty)} → ${correct_url}"
    api_patch "/api/mcp-servers/${srv_id}" "{\"url\": \"${correct_url}\"}"
    if [[ "$RESP_STATUS" == "200" ]]; then
      ok "URL updated: ${srv_name}"
    else
      fail "Failed to patch URL for ${srv_name} (HTTP ${RESP_STATUS})"
    fi
  fi
done

# =============================================================================
hdr "Step 4 — Verify MCP server tools (16 total across 4 servers)"
# =============================================================================

for srv_name in "${MCP_NAMES[@]}"; do
  srv_id="${MCP_IDS[$srv_name]:-}"
  expected="${MCP_EXPECTED_TOOLS[$srv_name]}"
  [[ -z "$srv_id" ]] && warn "Skipping tools check for ${srv_name} (no ID)" && continue

  api_get "/api/mcp-servers/${srv_id}/tools"
  if [[ "$RESP_STATUS" != "200" ]]; then
    fail "Cannot fetch tools for ${srv_name} (HTTP ${RESP_STATUS})"
    continue
  fi

  tool_count=$(echo "$RESP_BODY" | jq 'length')
  existing_tool_names=$(echo "$RESP_BODY" | jq -r '.[].name')

  if [[ "$tool_count" -ge "$expected" ]]; then
    ok "${srv_name}: ${tool_count}/${expected} tools present"
  else
    warn "${srv_name}: ${tool_count}/${expected} tools — adding missing ones …"

    for tool_def in "${TOOL_DEFS[@]}"; do
      IFS='|||' read -r def_server tool_name tool_desc tool_endpoint <<< "$tool_def"
      [[ "$def_server" != "$srv_name" ]] && continue
      echo "$existing_tool_names" | grep -qxF "$tool_name" && continue  # already there

      tool_body=$(jq -n \
        --arg serverId "$srv_id" \
        --arg name     "$tool_name" \
        --arg desc     "$tool_desc" \
        --arg endpoint "$tool_endpoint" \
        '{
          serverId: $serverId,
          name: $name,
          description: $desc,
          inputSchema: { type: "object", properties: { brand: { type: "string" }, limit: { type: "number" } } },
          annotations: { endpoint: $endpoint, method: "GET" },
          enabled: true,
          riskClassification: "low",
          requiresApproval: false
        }')
      api_post "/api/mcp-servers/${srv_id}/tools" "$tool_body"
      if [[ "$RESP_STATUS" == "201" ]]; then
        ok "  Added tool: ${tool_name}"
      else
        fail "  Failed to add tool '${tool_name}' (HTTP ${RESP_STATUS})"
      fi
    done
  fi
done

# =============================================================================
hdr "Step 5 — Verify agent → MCP server links (8 links required)"
# =============================================================================

num_links=${#LINK_AGENTS[@]}
for (( i=0; i<num_links; i++ )); do
  agent_id="${LINK_AGENTS[$i]}"
  srv_name="${LINK_SERVERS[$i]}"
  agent_name="${AGENT_NAMES[$agent_id]}"
  srv_id="${MCP_IDS[$srv_name]:-}"

  if [[ -z "$srv_id" ]]; then
    warn "Skipping link ${agent_name} → ${srv_name} (server ID unknown)"
    continue
  fi

  # Check if already linked
  api_get "/api/agents/${agent_id}/mcp-servers"
  if [[ "$RESP_STATUS" != "200" ]]; then
    fail "Cannot fetch links for ${agent_name} (HTTP ${RESP_STATUS})"
    continue
  fi

  already_linked=$(echo "$RESP_BODY" | jq -r --arg sid "$srv_id" \
    '.[] | select(.serverId == $sid) | .id' | head -1)

  if [[ -n "$already_linked" ]]; then
    ok "${agent_name} → ${srv_name}: linked"
  else
    info "Linking ${agent_name} → ${srv_name} …"
    api_post "/api/agents/${agent_id}/mcp-servers" \
      "{\"serverId\": \"${srv_id}\", \"acknowledgeWarnings\": true}"
    if [[ "$RESP_STATUS" == "200" || "$RESP_STATUS" == "201" ]]; then
      ok "${agent_name} → ${srv_name}: link created"
    elif [[ "$RESP_STATUS" == "409" ]]; then
      ok "${agent_name} → ${srv_name}: already linked (409 = OK)"
    else
      fail "Failed to link ${agent_name} → ${srv_name} (HTTP ${RESP_STATUS})"
    fi
  fi
done

# =============================================================================
hdr "Step 6 — Smoke test all endpoints"
# =============================================================================

# Demo API endpoints
for path in \
  "/demo-api/hearst/command-center" \
  "/demo-api/hearst/agent-runs" \
  "/demo-api/hearst/fatigue" \
  "/demo-api/hearst/send-time-map" \
  "/demo-api/hearst/revenue"; do
  api_get "$path"
  if [[ "$RESP_STATUS" == "200" ]]; then
    ok "REST OK: GET ${path}"
  else
    fail "REST FAIL: GET ${path} → HTTP ${RESP_STATUS}"
  fi
done

# Mock MCP endpoints
for srv_name in "${MCP_NAMES[@]}"; do
  probe="${MCP_PROBE_PATHS[$srv_name]}"
  api_get "$probe"
  if [[ "$RESP_STATUS" == "200" ]]; then
    ok "Mock MCP OK: GET ${probe}"
  else
    fail "Mock MCP FAIL: GET ${probe} → HTTP ${RESP_STATUS}"
  fi
done

# SSE endpoint (open briefly — 200 on connection is sufficient)
info "Testing SSE endpoint (3s timeout) …"
sse_raw=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 3 \
  -H "Accept: text/event-stream" \
  "${PROD_URL}/demo-api/hearst/live-run" 2>/dev/null || true)
sse_status=$(echo "$sse_raw" | grep -o '^[0-9]\{3\}' || echo "000")
if [[ "$sse_status" == "200" ]]; then
  ok "SSE OK: GET /demo-api/hearst/live-run → 200 (stream open)"
else
  warn "SSE: HTTP ${sse_status} — stream may need a client to stay open (OK if not 5xx)"
fi

# =============================================================================
hdr "Summary"
# =============================================================================
echo ""
if [[ "$ERRORS" -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✓ All checks passed. Hearst NBA demo ready at:${NC}"
  echo -e "  ${BLUE}${PROD_URL}/demo/hearst${NC}"
else
  echo -e "  ${RED}${BOLD}✗ ${ERRORS} error(s) found. See output above.${NC}"
  echo ""
  echo -e "  ${BOLD}Common fixes:${NC}"
  echo -e "    • Agents missing → restart server (triggers ensureHearstAgents at startup)"
  echo -e "    • MCP servers missing → re-run this script (creates them)"
  echo -e "    • Links missing → re-run this script (adds them)"
  echo -e "    • Wrong MCP URLs → re-run this script (patches them)"
fi
echo ""
exit $ERRORS
