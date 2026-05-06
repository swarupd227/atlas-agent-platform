#!/usr/bin/env bash
# =============================================================================
# provision_mcg_kb_dev.sh
# Provisions the MCG Health Knowledge Base Onboarding demo (SCN-MCG-1)
# in the LOCAL DEV environment.
#
# Creates:
#   - 2 mock MCP servers (MCG Knowledge Base MCP, Atlas Bundle Store MCP)
#   - 1 agent (MCG-KB-INGEST-001) with tools bound
#   - 1 deployment record
#
# Run from project root:
#   bash provision_mcg_kb_dev.sh
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
echo ""
echo "================================================================"
echo " MCG Health — KB Onboarding Demo Provisioner (SCN-MCG-1)"
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
      \"maxToolIterations\": 12,
      \"riskTier\": \"MEDIUM\",
      \"department\": \"Knowledge Management\",
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

# ── Step 1: MCG Knowledge Base MCP ───────────────────────────────────────────
echo ""
echo "── Step 1: MCG Knowledge Base MCP server ────────────────────────"
KB_MCP_ID=$(create_or_find_mcp_server \
  "MCG Knowledge Base MCP" \
  "${BASE_URL}/api/mock/mcg-knowledge-base" \
  "MCG source document access — structured extraction of brand policy, language rules, segment profiles, naming aliases, dictionary index, theme tokens, and QA rules." \
  "MCG Health / Knowledge Management")

echo "  Registering 7 extraction tools for ${KB_MCP_ID}…"

create_tool "$KB_MCP_ID" "extract_brand_policy" \
  "Extract structured brand naming rules, capitalization requirements, forbidden terms, formatting standards, and tone guidelines from the MCG Brand Style Guide." \
  "extract-brand-policy" "GET" '{"type":"object","properties":{}}'

create_tool "$KB_MCP_ID" "extract_language_policy" \
  "Extract language and editorial policy: tense, POV, grammatical preferences, prohibited phrases, and readability targets." \
  "extract-language-policy" "GET" '{"type":"object","properties":{}}'

create_tool "$KB_MCP_ID" "extract_segment_lexicon" \
  "Extract segment-specific terminology, value drivers, messaging frames, and pain points for health plan, hospital system, and employer segments." \
  "extract-segment-lexicon" "GET" '{"type":"object","properties":{}}'

create_tool "$KB_MCP_ID" "extract_naming_aliases" \
  "Extract the complete naming alias map: canonical names, approved shortforms, and prohibited legacy names (Milliman variants)." \
  "extract-naming-aliases" "GET" '{"type":"object","properties":{}}'

create_tool "$KB_MCP_ID" "extract_dictionary_index" \
  "Extract the structured index of the MCG Clinical Dictionary: 2,847 entries across 5 categories." \
  "extract-dictionary-index" "GET" '{"type":"object","properties":{}}'

create_tool "$KB_MCP_ID" "extract_theme_tokens" \
  "Extract visual and content theme tokens: color palette, typography specifications, and proposal layout rules." \
  "extract-theme-tokens" "GET" '{"type":"object","properties":{}}'

create_tool "$KB_MCP_ID" "derive_qa_rules" \
  "Derive QA validation rules from extracted content: hard-block rules (prohibited terms), soft warning rules (missing hashes), score weights, and passing threshold." \
  "derive-qa-rules" "GET" '{"type":"object","properties":{}}'

# ── Step 2: Atlas Bundle Store MCP ───────────────────────────────────────────
echo ""
echo "── Step 2: Atlas Bundle Store MCP server ────────────────────────"
BS_MCP_ID=$(create_or_find_mcp_server \
  "Atlas Bundle Store MCP" \
  "${BASE_URL}/api/mock/mcg-bundle-store" \
  "Governed KB bundle creation, semantic versioning, QA validation, and human promotion workflow." \
  "Atlas Platform / Bundle Store")

echo "  Registering 3 bundle tools for ${BS_MCP_ID}…"

create_tool "$BS_MCP_ID" "produce_bundle" \
  "Create a typed JSON knowledge bundle in DRAFT status with all 12 required artifacts." \
  "produce-bundle" "POST" \
  '{"type":"object","required":["name","artifacts"],"properties":{"name":{"type":"string"},"artifacts":{"type":"object"},"schema_version":{"type":"string"},"source_agent":{"type":"string"}}}'

create_tool "$BS_MCP_ID" "run_qa_check" \
  "Run full QA validation on a DRAFT bundle. Returns qa_score (0-100), passed_qa, hard_violations, and soft_warnings." \
  "run-qa-check" "POST" \
  '{"type":"object","required":["bundle_id"],"properties":{"bundle_id":{"type":"string"}}}'

create_tool "$BS_MCP_ID" "promote_bundle" \
  "Promote a QA-passed bundle from DRAFT to ACTIVE status. Requires human action recorded in immutable audit trail." \
  "promote-bundle" "POST" \
  '{"type":"object","required":["bundle_id","promoted_by"],"properties":{"bundle_id":{"type":"string"},"promoted_by":{"type":"string"},"acknowledgement":{"type":"string"}}}'

# ── Step 3: Agent ─────────────────────────────────────────────────────────────
echo ""
echo "── Step 3: MCG-KB-INGEST-001 agent ──────────────────────────────"
AGENT_ID=$(create_or_find_agent \
  "MCG-KB-INGEST-001 Knowledge Base Ingestion Agent" \
  "Ingests MCG Brand Style Guide and Clinical Dictionary into a governed, versioned knowledge bundle via 7 extraction nodes, produces 12-artifact bundle, validates via QA check, and surfaces result for human promotion." \
  "You are MCG-KB-INGEST-001, the Knowledge Base Ingestion Agent. When asked to ingest MCG source documents, call the 7 extraction tools in sequence, then produce_bundle, then run_qa_check. End with a JSON block: {bundle_id, qa_score, passed_qa, hard_violations_count, soft_warnings_count, status, promotable, summary}.")

# ── Step 4: Bind MCP servers ──────────────────────────────────────────────────
echo ""
echo "── Step 4: Bind MCP servers to agent ────────────────────────────"
bind_mcp_to_agent "$AGENT_ID" "$KB_MCP_ID"    "MCG Knowledge Base MCP"
bind_mcp_to_agent "$AGENT_ID" "$BS_MCP_ID"    "Atlas Bundle Store MCP"

# ── Step 5: Deployment record ─────────────────────────────────────────────────
echo ""
echo "── Step 5: Deployment record ────────────────────────────────────"
create_deployment "$AGENT_ID" "MCG-KB-INGEST-001 Knowledge Base Ingestion Agent"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo " ✓ MCG-KB demo provisioned!"
echo ""
echo "   Agent ID : ${AGENT_ID}"
echo "   KB MCP   : ${KB_MCP_ID}"
echo "   Store MCP: ${BS_MCP_ID}"
echo ""
echo "   Demo URL : ${BASE_URL}/demo/mcg-kb"
echo "   Next     : open the demo URL and click 'Run Demo'"
echo "================================================================"
echo ""
