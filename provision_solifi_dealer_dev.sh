#!/usr/bin/env bash
# =============================================================================
# provision_solifi_dealer_dev.sh
# Provisions the Solifi Dealer Experience Hub demo (SCN-SOLIFI-DEH-1)
# in the LOCAL DEV environment via API only — no direct DB writes.
#
# Creates:
#   - 1 mock MCP server (Solifi Experience Hub MCP) with 8 tools
#   - 1 agent (DEH-CONV-001) with system prompt and tools bound
#   - 1 deployment record
#
# Run from project root:
#   bash provision_solifi_dealer_dev.sh
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
echo ""
echo "================================================================"
echo " Solifi — Dealer Experience Hub Demo Provisioner (SCN-SOLIFI-DEH-1)"
echo " Target: ${BASE_URL}"
echo "================================================================"
echo ""

# ── Helpers ──────────────────────────────────────────────────────────────────

check_health() {
  echo "▸ Checking server health…"
  local tries=0
  until curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1 || [ $tries -ge 15 ]; do
    tries=$((tries+1))
    echo "  Server not ready, retry ${tries}/15…"
    sleep 2
  done
  if ! curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
    echo "✗ Server did not become ready. Start 'npm run dev' first."
    exit 1
  fi
  echo "✓ Server is healthy."
}

# Writes ID to stdout; all status to stderr
create_or_find_mcp_server() {
  local name="$1"
  local url="$2"
  local description="$3"
  local vendor="$4"

  echo "▸ MCP server: ${name}" >&2

  local existing
  existing=$(curl -sf "${BASE_URL}/api/mcp-servers" 2>/dev/null || echo "[]")
  local existing_id
  existing_id=$(echo "$existing" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data:
    if s.get('name') == sys.argv[1]:
        print(s.get('id', ''))
        break
" "$name" 2>/dev/null || echo "")

  if [ -n "$existing_id" ]; then
    echo "  ✓ Already exists: ${existing_id}" >&2
    echo "$existing_id"
    return
  fi

  local result
  result=$(curl -sf -X POST "${BASE_URL}/api/mcp-servers" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${name}\",
      \"url\": \"${url}\",
      \"description\": \"${description}\",
      \"vendor\": \"${vendor}\",
      \"status\": \"active\",
      \"transportType\": \"http\"
    }" 2>/dev/null || echo "{}")

  local id
  id=$(echo "$result" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -z "$id" ]; then
    echo "  ✗ Failed to create MCP server '${name}'." >&2
    echo "  Response: $result" >&2
    exit 1
  fi
  echo "  ✓ Created: ${id}" >&2
  echo "$id"
}

create_tool() {
  local mcp_server_id="$1"
  local name="$2"
  local description="$3"
  local endpoint="$4"
  local method="$5"
  local input_schema="$6"

  local existing
  existing=$(curl -sf "${BASE_URL}/api/mcp-servers/${mcp_server_id}/tools" 2>/dev/null || echo "[]")
  local existing_id
  existing_id=$(echo "$existing" | python3 -c "
import sys, json
data = json.load(sys.stdin)
lst = data if isinstance(data, list) else data.get('tools', [])
for t in lst:
    if t.get('name') == sys.argv[1]:
        print(t.get('id',''))
        break
" "$name" 2>/dev/null || echo "")

  if [ -n "$existing_id" ]; then
    echo "    ✓ Tool exists: ${name}"
    return
  fi

  local result
  result=$(curl -sf -X POST "${BASE_URL}/api/mcp-servers/${mcp_server_id}/tools" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${name}\",
      \"description\": \"${description}\",
      \"inputSchema\": ${input_schema},
      \"annotations\": {
        \"endpoint\": \"${endpoint}\",
        \"method\": \"${method}\"
      }
    }" 2>/dev/null || echo "{}")

  local id
  id=$(echo "$result" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -z "$id" ]; then
    echo "    ✗ Failed to create tool '${name}'. Response: ${result}"
  else
    echo "    ✓ Tool: ${name} (${id})"
  fi
}

# Writes ID to stdout; all status to stderr
create_or_find_agent() {
  local name="$1"
  local description="$2"
  local system_prompt="$3"

  echo "▸ Agent: ${name}" >&2

  local existing
  existing=$(curl -sf "${BASE_URL}/api/agents" 2>/dev/null || echo "[]")
  local existing_id
  existing_id=$(echo "$existing" | python3 -c "
import sys, json
data = json.load(sys.stdin)
lst = data if isinstance(data, list) else data.get('agents', [])
for a in lst:
    if a.get('name') == sys.argv[1]:
        print(a.get('id',''))
        break
" "$name" 2>/dev/null || echo "")

  if [ -n "$existing_id" ]; then
    echo "  ✓ Already exists: ${existing_id}" >&2
    echo "$existing_id"
    return
  fi

  local result
  result=$(curl -sf -X POST "${BASE_URL}/api/agents" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${name}\",
      \"description\": \"${description}\",
      \"systemPrompt\": \"${system_prompt}\",
      \"modelProvider\": \"anthropic\",
      \"modelName\": \"claude-haiku-4-5\",
      \"maxTokens\": 4096,
      \"temperature\": 0.3,
      \"maxToolIterations\": 10,
      \"riskTier\": \"MEDIUM\",
      \"department\": \"Dealer Finance Operations\",
      \"status\": \"active\"
    }" 2>/dev/null || echo "{}")

  local id
  id=$(echo "$result" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -z "$id" ]; then
    echo "  ✗ Failed to create agent '${name}'." >&2
    echo "  Response: $result" >&2
    exit 1
  fi
  echo "  ✓ Created: ${id}" >&2
  echo "$id"
}

bind_mcp_to_agent() {
  local agent_id="$1"
  local mcp_server_id="$2"
  local mcp_name="$3"
  echo "  ▸ Binding '${mcp_name}'…"
  local result
  result=$(curl -sf -X POST "${BASE_URL}/api/agents/${agent_id}/mcp-servers" \
    -H "Content-Type: application/json" \
    -d "{\"serverId\": \"${mcp_server_id}\"}" 2>/dev/null || echo "{}")
  echo "    result: $result"
  echo "    ✓ Bound."
}

create_deployment() {
  local agent_id="$1"
  local agent_name="$2"
  echo "▸ Ensuring deployment for ${agent_name}…"
  local result
  result=$(curl -sf -X POST "${BASE_URL}/api/deployments" \
    -H "Content-Type: application/json" \
    -d "{
      \"agentId\": \"${agent_id}\",
      \"agentName\": \"${agent_name}\",
      \"environment\": \"production\",
      \"status\": \"pending\",
      \"version\": \"1.0.0\",
      \"rolloutStrategy\": \"canary\",
      \"canaryPercent\": 100,
      \"pipelineComplete\": true
    }" 2>/dev/null || echo "{}")
  local dep_id
  dep_id=$(echo "$result" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$dep_id" ]; then
    echo "  ✓ Deployment: ${dep_id}"
  else
    echo "  ⚠ Deployment may already exist — continuing."
  fi
}

# ── Main flow ─────────────────────────────────────────────────────────────────

check_health

# ── Step 1: Solifi Experience Hub MCP server ──────────────────────────────────
echo ""
echo "── Step 1: Solifi Experience Hub MCP server ──────────────────────"
DEH_MCP_ID=$(create_or_find_mcp_server \
  "Solifi Experience Hub MCP" \
  "${BASE_URL}/api/mock/solifi-deh" \
  "Solifi Experience Hub — real-time floorplan status, payoff quotes, audit scheduling, credit application pipeline, payment history, and dealer policy knowledge base." \
  "Solifi / Dealer Finance Platform")

echo "  Registering 8 tools for ${DEH_MCP_ID}…"

create_tool "$DEH_MCP_ID" "get_floorplan_status" \
  "Retrieve full floorplan inventory status for a dealership. Returns all financed units with VIN, make/model/year, days on floor, curtailment dates, outstanding balances, overdue flags, and next audit window." \
  "get-floorplan-status" "GET" \
  '{"type":"object","required":["dealer_id"],"properties":{"dealer_id":{"type":"string","description":"Solifi dealer ID"}}}'

create_tool "$DEH_MCP_ID" "get_unit_details" \
  "Retrieve detailed finance terms for a specific unit by VIN. Returns original advance, current balance, interest rate, curtailment schedule, days on floor, next curtailment amount and date." \
  "get-unit-details" "GET" \
  '{"type":"object","required":["vin"],"properties":{"vin":{"type":"string","description":"17-character VIN"},"dealer_id":{"type":"string"}}}'

create_tool "$DEH_MCP_ID" "get_payoff_quote" \
  "Generate a precise payoff quote for a financed unit. Returns per-diem interest, accrued interest to payoff date, total payoff amount, quote expiry date, and wire instructions." \
  "get-payoff-quote" "POST" \
  '{"type":"object","required":["vin","dealer_id","payoff_date"],"properties":{"vin":{"type":"string"},"dealer_id":{"type":"string"},"payoff_date":{"type":"string","description":"Target payoff date YYYY-MM-DD"}}}'

create_tool "$DEH_MCP_ID" "send_payoff_email" \
  "Send the payoff quote by email to the dealer finance contact. Triggers human approval gate — confirms recipient, amount, and wire instructions before sending." \
  "send-payoff-email" "POST" \
  '{"type":"object","required":["vin","dealer_id","quote_id","recipient_email"],"properties":{"vin":{"type":"string"},"dealer_id":{"type":"string"},"quote_id":{"type":"string"},"recipient_email":{"type":"string"}}}'

create_tool "$DEH_MCP_ID" "get_audit_schedule" \
  "Retrieve the upcoming physical audit schedule for a dealership. Returns next audit date, audit type, required documentation checklist, and cycle rules." \
  "get-audit-schedule" "GET" \
  '{"type":"object","required":["dealer_id"],"properties":{"dealer_id":{"type":"string"}}}'

create_tool "$DEH_MCP_ID" "get_credit_application_status" \
  "Check the status of credit applications in the Solifi pipeline. Returns application ID, stage, LTV ratio, requested advance, and next required action." \
  "get-credit-application-status" "GET" \
  '{"type":"object","required":["dealer_id"],"properties":{"dealer_id":{"type":"string"},"application_id":{"type":"string"}}}'

create_tool "$DEH_MCP_ID" "get_payment_history" \
  "Retrieve recent payment history for a dealership floorplan account. Returns payment date, amount, payment type, unit VIN, and running balance." \
  "get-payment-history" "GET" \
  '{"type":"object","required":["dealer_id"],"properties":{"dealer_id":{"type":"string"},"days":{"type":"number","description":"Days of history (default 30)"}}}'

create_tool "$DEH_MCP_ID" "search_dealer_policy_kb" \
  "Search the Solifi dealer policy and product knowledge base. Answers questions about curtailment rules, audit procedures, payoff policies, rate structures, and programme eligibility." \
  "search-dealer-policy-kb" "GET" \
  '{"type":"object","required":["query"],"properties":{"query":{"type":"string"},"category":{"type":"string","description":"floorplan | payoff | audit | credit | rates"}}}'

# ── Step 2: DEH-CONV-001 agent ────────────────────────────────────────────────
echo ""
echo "── Step 2: DEH-CONV-001 agent ───────────────────────────────────"
SYSTEM_PROMPT="You are DEH-CONV-001, the Solifi Dealer Experience Agent — a knowledgeable, professional AI assistant for dealerships financed through the Solifi platform. You assist dealer principals, finance managers, and general managers with floorplan inventory status and overdue unit alerts, per-unit payoff quote generation, audit schedule enquiries and required documentation, credit application pipeline status, payment history and account reconciliation, and policy and product knowledge base search. Guidelines: Always look up live data via your tools before stating any balances, dates, or quotes — never fabricate numbers. When generating payoff quotes, always call get_unit_details first, then get_payoff_quote with a specific payoff date. Email delivery of quotes requires explicit human confirmation (send_payoff_email triggers a human approval gate). Be concise and dealer-friendly."

AGENT_ID=$(create_or_find_agent \
  "DEH-CONV-001 Solifi Dealer Experience Agent" \
  "Conversational AI agent for Solifi-financed dealerships. Handles natural-language queries about floorplan status, payoff quotes, audit scheduling, credit applications, payment history, and dealer policy — with a human approval gate for email-based transactional actions." \
  "${SYSTEM_PROMPT}")

# ── Step 3: Bind MCP server ───────────────────────────────────────────────────
echo ""
echo "── Step 3: Bind MCP server to agent ────────────────────────────"
bind_mcp_to_agent "$AGENT_ID" "$DEH_MCP_ID" "Solifi Experience Hub MCP"

# ── Step 4: Deployment record ─────────────────────────────────────────────────
echo ""
echo "── Step 4: Deployment record ────────────────────────────────────"
create_deployment "$AGENT_ID" "DEH-CONV-001 Solifi Dealer Experience Agent"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo " ✓ Solifi Dealer Experience Hub demo provisioned!"
echo ""
echo "   Agent ID  : ${AGENT_ID}"
echo "   MCP Server: ${DEH_MCP_ID}"
echo ""
echo "   Demo URL  : ${BASE_URL}/demo/solifi-dealer"
echo "   Next      : open the demo URL and click 'Run Demo'"
echo "   Prod copy : bash scripts/migrate_solifi_dealer_to_prod.sh"
echo "================================================================"
echo ""
