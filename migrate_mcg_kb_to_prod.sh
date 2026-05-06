#!/usr/bin/env bash
# =============================================================================
# migrate_mcg_kb_to_prod.sh
# Provisions the MCG Health Knowledge Base Onboarding demo (SCN-MCG-1)
# in the PRODUCTION environment (atlas-agent-platform.replit.app).
#
# Usage:
#   PROD_URL=https://atlas-agent-platform.replit.app bash migrate_mcg_kb_to_prod.sh
#   # or just:
#   bash migrate_mcg_kb_to_prod.sh
# =============================================================================

set -euo pipefail

BASE_URL="${PROD_URL:-https://atlas-agent-platform.replit.app}"
echo ""
echo "================================================================"
echo " MCG Health — KB Onboarding Demo PRODUCTION Migration (SCN-MCG-1)"
echo " Target: ${BASE_URL}"
echo "================================================================"
echo ""
echo " WARNING: This will create resources in PRODUCTION."
echo " Press Ctrl-C within 5 seconds to abort."
sleep 5

# ── Helpers ──────────────────────────────────────────────────────────────────

check_health() {
  echo "▸ Checking server health…"
  local tries=0
  until curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1 || [ $tries -ge 20 ]; do
    tries=$((tries+1))
    echo "  Not ready, retry ${tries}/20…"
    sleep 3
  done
  if ! curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
    echo "✗ Server did not become ready."
    exit 1
  fi
  echo "✓ Server is healthy."
}

create_or_find_mcp_server() {
  local name="$1"; local url="$2"; local description="$3"; local vendor="$4"
  echo "▸ MCP server: ${name}" >&2
  local existing; existing=$(curl -sf "${BASE_URL}/api/mcp-servers" 2>/dev/null || echo "[]")
  local existing_id; existing_id=$(echo "$existing" | python3 -c "
import sys, json
for s in json.load(sys.stdin):
    if s.get('name') == sys.argv[1]: print(s.get('id','')); break
" "$name" 2>/dev/null || echo "")
  if [ -n "$existing_id" ]; then echo "  ✓ Already exists: ${existing_id}" >&2; echo "$existing_id"; return; fi
  local result; result=$(curl -sf -X POST "${BASE_URL}/api/mcp-servers" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"url\":\"${url}\",\"description\":\"${description}\",\"vendor\":\"${vendor}\",\"status\":\"active\",\"transportType\":\"http\"}" 2>/dev/null || echo "{}")
  local id; id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -z "$id" ]; then echo "  ✗ Failed: $result" >&2; exit 1; fi
  echo "  ✓ Created: ${id}" >&2; echo "$id"
}

create_tool() {
  local sid="$1"; local name="$2"; local desc="$3"; local ep="$4"; local method="$5"; local schema="$6"
  local existing; existing=$(curl -sf "${BASE_URL}/api/mcp-servers/${sid}/tools" 2>/dev/null || echo "[]")
  local eid; eid=$(echo "$existing" | python3 -c "
import sys,json
lst=json.load(sys.stdin); lst=lst if isinstance(lst,list) else lst.get('tools',[])
for t in lst:
    if t.get('name')==sys.argv[1]: print(t.get('id','')); break
" "$name" 2>/dev/null || echo "")
  if [ -n "$eid" ]; then echo "    ✓ exists: ${name}"; return; fi
  local r; r=$(curl -sf -X POST "${BASE_URL}/api/mcp-servers/${sid}/tools" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"description\":\"${desc}\",\"inputSchema\":${schema},\"annotations\":{\"endpoint\":\"${ep}\",\"method\":\"${method}\"}}" 2>/dev/null || echo "{}")
  local id; id=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  [ -n "$id" ] && echo "    ✓ ${name} (${id})" || echo "    ✗ failed: $r"
}

create_or_find_agent() {
  local name="$1"; local desc="$2"; local sp="$3"
  echo "▸ Agent: ${name}" >&2
  local existing; existing=$(curl -sf "${BASE_URL}/api/agents" 2>/dev/null || echo "[]")
  local eid; eid=$(echo "$existing" | python3 -c "
import sys,json
lst=json.load(sys.stdin); lst=lst if isinstance(lst,list) else lst.get('agents',[])
for a in lst:
    if a.get('name')==sys.argv[1]: print(a.get('id','')); break
" "$name" 2>/dev/null || echo "")
  if [ -n "$eid" ]; then echo "  ✓ Already exists: ${eid}" >&2; echo "$eid"; return; fi
  local r; r=$(curl -sf -X POST "${BASE_URL}/api/agents" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"description\":\"${desc}\",\"systemPrompt\":\"${sp}\",\"modelProvider\":\"anthropic\",\"modelName\":\"claude-haiku-4-5\",\"maxTokens\":4096,\"temperature\":0.3,\"maxToolIterations\":12,\"riskTier\":\"MEDIUM\",\"department\":\"Knowledge Management\",\"status\":\"active\"}" 2>/dev/null || echo "{}")
  local id; id=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -z "$id" ]; then echo "  ✗ Failed: $r" >&2; exit 1; fi
  echo "  ✓ Created: ${id}" >&2; echo "$id"
}

bind_mcp() {
  local agent_id="$1"; local server_id="$2"; local name="$3"
  echo "  ▸ Binding '${name}'…"
  curl -sf -X POST "${BASE_URL}/api/agents/${agent_id}/mcp-servers" \
    -H "Content-Type: application/json" \
    -d "{\"serverId\":\"${server_id}\"}" > /dev/null 2>&1 || true
  echo "    ✓ Bound."
}

create_deployment() {
  local aid="$1"; local aname="$2"
  echo "▸ Deployment for ${aname}…"
  local r; r=$(curl -sf -X POST "${BASE_URL}/api/deployments" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"${aid}\",\"agentName\":\"${aname}\",\"environment\":\"production\",\"status\":\"pending\",\"version\":\"1.0.0\",\"rolloutStrategy\":\"canary\",\"canaryPercent\":100,\"pipelineComplete\":true}" 2>/dev/null || echo "{}")
  local id; id=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  [ -n "$id" ] && echo "  ✓ ${id}" || echo "  ⚠ may already exist"
}

# ── Main ──────────────────────────────────────────────────────────────────────

check_health

echo ""
echo "── Step 1: MCG Knowledge Base MCP ──────────────────────────────"
KB_MCP_ID=$(create_or_find_mcp_server \
  "MCG Knowledge Base MCP" \
  "${BASE_URL}/api/mock/mcg-knowledge-base" \
  "MCG source document access — structured extraction of brand policy, language rules, segment profiles, naming aliases, dictionary index, theme tokens, and QA rules." \
  "MCG Health / Knowledge Management")

echo "  Tools…"
create_tool "$KB_MCP_ID" "extract_brand_policy" "Extract brand naming rules, capitalization, forbidden terms, formatting from MCG Brand Style Guide." "extract-brand-policy" "GET" '{"type":"object","properties":{}}'
create_tool "$KB_MCP_ID" "extract_language_policy" "Extract language/editorial policy: tense, POV, grammatical preferences, prohibited phrases." "extract-language-policy" "GET" '{"type":"object","properties":{}}'
create_tool "$KB_MCP_ID" "extract_segment_lexicon" "Extract segment terminology, value drivers, messaging frames for health plan, hospital, employer." "extract-segment-lexicon" "GET" '{"type":"object","properties":{}}'
create_tool "$KB_MCP_ID" "extract_naming_aliases" "Extract naming alias map: canonical names, shortforms, prohibited legacy names (Milliman)." "extract-naming-aliases" "GET" '{"type":"object","properties":{}}'
create_tool "$KB_MCP_ID" "extract_dictionary_index" "Extract MCG Clinical Dictionary index: 2,847 entries across 5 categories." "extract-dictionary-index" "GET" '{"type":"object","properties":{}}'
create_tool "$KB_MCP_ID" "extract_theme_tokens" "Extract visual theme tokens: color palette, typography, proposal layout rules." "extract-theme-tokens" "GET" '{"type":"object","properties":{}}'
create_tool "$KB_MCP_ID" "derive_qa_rules" "Derive QA validation rules: hard-block (prohibited terms), soft warnings (missing hashes), score weights." "derive-qa-rules" "GET" '{"type":"object","properties":{}}'

echo ""
echo "── Step 2: Atlas Bundle Store MCP ──────────────────────────────"
BS_MCP_ID=$(create_or_find_mcp_server \
  "Atlas Bundle Store MCP" \
  "${BASE_URL}/api/mock/mcg-bundle-store" \
  "Governed KB bundle creation, semantic versioning, QA validation, and human promotion workflow." \
  "Atlas Platform / Bundle Store")

echo "  Tools…"
create_tool "$BS_MCP_ID" "produce_bundle" "Create typed JSON knowledge bundle in DRAFT status with all 12 required artifacts." "produce-bundle" "POST" '{"type":"object","required":["name","artifacts"],"properties":{"name":{"type":"string"},"artifacts":{"type":"object"},"schema_version":{"type":"string"},"source_agent":{"type":"string"}}}'
create_tool "$BS_MCP_ID" "run_qa_check" "Run full QA validation on a DRAFT bundle. Returns qa_score (0-100), passed_qa, hard_violations, soft_warnings." "run-qa-check" "POST" '{"type":"object","required":["bundle_id"],"properties":{"bundle_id":{"type":"string"}}}'
create_tool "$BS_MCP_ID" "promote_bundle" "Promote QA-passed bundle DRAFT→ACTIVE. Requires human action, recorded in immutable audit trail." "promote-bundle" "POST" '{"type":"object","required":["bundle_id","promoted_by"],"properties":{"bundle_id":{"type":"string"},"promoted_by":{"type":"string"},"acknowledgement":{"type":"string"}}}'

echo ""
echo "── Step 3: Agent ────────────────────────────────────────────────"
AGENT_ID=$(create_or_find_agent \
  "MCG-KB-INGEST-001 Knowledge Base Ingestion Agent" \
  "Ingests MCG Brand Style Guide and Clinical Dictionary into a governed, versioned knowledge bundle via 7 extraction nodes, produces 12-artifact bundle, validates via QA check, and surfaces result for human promotion." \
  "You are MCG-KB-INGEST-001. Call 7 extraction tools in sequence, then produce_bundle, then run_qa_check. End with JSON: {bundle_id, qa_score, passed_qa, hard_violations_count, soft_warnings_count, status, promotable, summary}.")

echo ""
echo "── Step 4: Bind MCPs ────────────────────────────────────────────"
bind_mcp "$AGENT_ID" "$KB_MCP_ID" "MCG Knowledge Base MCP"
bind_mcp "$AGENT_ID" "$BS_MCP_ID" "Atlas Bundle Store MCP"

echo ""
echo "── Step 5: Deployment ───────────────────────────────────────────"
create_deployment "$AGENT_ID" "MCG-KB-INGEST-001 Knowledge Base Ingestion Agent"

echo ""
echo "================================================================"
echo " ✓ MCG-KB PRODUCTION migration complete!"
echo ""
echo "   Agent ID : ${AGENT_ID}"
echo "   KB MCP   : ${KB_MCP_ID}"
echo "   Store MCP: ${BS_MCP_ID}"
echo ""
echo "   Demo URL: ${BASE_URL}/demo/mcg-kb"
echo ""
echo "   IMPORTANT: If MCP binding didn't take, run psql on prod:"
echo "   INSERT INTO agent_mcp_servers (agent_id, server_id)"
echo "   VALUES ('${AGENT_ID}', '${KB_MCP_ID}'),"
echo "          ('${AGENT_ID}', '${BS_MCP_ID}')"
echo "   ON CONFLICT DO NOTHING;"
echo "================================================================"
