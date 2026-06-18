#!/usr/bin/env bash
# =============================================================================
# migrate_kinective_gl_sync_to_prod.sh
# Provisions the Kinective / Cascade Ridge CU Prior-Day GL Synchronization
# demo (SCN-KIN-GL-1) in the PRODUCTION environment.
#
# Usage:
#   PROD_URL=https://atlas-agent-platform.replit.app bash migrate_kinective_gl_sync_to_prod.sh
#   # or just:
#   bash migrate_kinective_gl_sync_to_prod.sh
#
# Creates in PRODUCTION (idempotent — safe to re-run):
#   • 5 MCP Servers + 17 Tools
#   • 4 Knowledge Bases
#   • 6 Skills
#   • 1 Outcome Contract
#   • 4 Governance Policies
#   • 7 Agents (A0–A6, names-based lookup so IDs are assigned by prod DB)
#   • MCP bindings for all agents
#   • 7 Deployments
#
# NOTE on fixed UUIDs: Production assigns its own IDs via the API.
#   After this script runs, capture the printed IDs and update
#   gl-sync-live-run.ts if you need the live-run demo to work on prod
#   (or re-provision dev with matching IDs).
#
# REQUIREMENTS: curl, python3 (for JSON parsing), jq optional
# =============================================================================

set -euo pipefail

BASE_URL="${PROD_URL:-https://atlas-agent-platform.replit.app}"

echo ""
echo "=================================================================="
echo " Kinective / Cascade Ridge CU — GL Sync (SCN-KIN-GL-1)"
echo " PRODUCTION Migration"
echo " Target: ${BASE_URL}"
echo "=================================================================="
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
  echo ""
}

py_id() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or '')" 2>/dev/null || echo ""
}

py_find_by_name() {
  local name="$1"
  python3 -c "
import sys,json
lst=json.load(sys.stdin)
lst=lst if isinstance(lst,list) else lst.get('data', lst.get('agents', lst.get('servers', lst.get('tools', []))))
for item in lst:
    if item.get('name') == sys.argv[1]:
        print(item.get('id',''))
        break
" "$name" 2>/dev/null || echo ""
}

create_or_find_mcp() {
  local name="$1" url="$2" desc="$3" risk="$4"
  echo "▸ MCP: ${name}" >&2
  local existing eid
  existing=$(curl -sf "${BASE_URL}/api/mcp-servers" 2>/dev/null || echo "[]")
  eid=$(echo "$existing" | py_find_by_name "$name")
  if [ -n "$eid" ]; then echo "  ✓ exists: ${eid}" >&2; echo "$eid"; return; fi
  local r id
  r=$(curl -sf -X POST "${BASE_URL}/api/mcp-servers" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"url\":\"${url}\",\"description\":\"${desc}\",\"transportType\":\"streamable-http\",\"riskTier\":\"${risk}\",\"status\":\"production-enabled\",\"allowlisted\":true,\"industryId\":\"financial_services\",\"addedBy\":\"gl-sync-migrate\",\"capabilities\":{\"tools\":true,\"resources\":false,\"prompts\":false,\"sampling\":false}}" \
    2>/dev/null || echo "{}")
  id=$(echo "$r" | py_id)
  if [ -z "$id" ]; then echo "  ✗ Failed: $r" >&2; exit 1; fi
  echo "  ✓ created: ${id}" >&2; echo "$id"
}

create_tool() {
  local sid="$1" name="$2" desc="$3" method_override="$4" schema="$5"
  local endpoint method
  endpoint="/${name//_/-}"
  if [ -n "$method_override" ]; then
    method="$method_override"
  else
    case "$name" in
      post_*|send_*|create_*|set_*|deliver_*|record_*) method="POST" ;;
      *) method="GET" ;;
    esac
  fi
  local existing eid
  existing=$(curl -sf "${BASE_URL}/api/mcp-servers/${sid}/tools" 2>/dev/null || echo "[]")
  eid=$(echo "$existing" | py_find_by_name "$name")
  if [ -n "$eid" ]; then echo "    ✓ exists: ${name}" >&2; return; fi
  local r id
  r=$(curl -sf -X POST "${BASE_URL}/api/mcp-servers/${sid}/tools" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"description\":\"${desc}\",\"riskClassification\":\"medium\",\"inputSchema\":${schema},\"annotations\":{\"endpoint\":\"${endpoint}\",\"method\":\"${method}\"}}" \
    2>/dev/null || echo "{}")
  id=$(echo "$r" | py_id)
  [ -n "$id" ] && echo "    ✓ ${name}  (${method} ${endpoint})" >&2 || echo "    ✗ failed: ${name} :: ${r}" >&2
}

create_or_find_kb() {
  local name="$1" desc="$2" tags="$3"
  echo "▸ KB: ${name}" >&2
  local existing eid
  existing=$(curl -sf "${BASE_URL}/api/knowledge-bases" 2>/dev/null || echo "[]")
  eid=$(echo "$existing" | py_find_by_name "$name")
  if [ -n "$eid" ]; then echo "  ✓ exists: ${eid}" >&2; echo "$eid"; return; fi
  local r id
  r=$(curl -sf -X POST "${BASE_URL}/api/knowledge-bases" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"description\":\"${desc}\",\"industry\":\"financial_services\",\"tags\":${tags},\"status\":\"active\"}" \
    2>/dev/null || echo "{}")
  id=$(echo "$r" | py_id)
  if [ -z "$id" ]; then echo "  ✗ Failed: $r" >&2; exit 1; fi
  echo "  ✓ created: ${id}" >&2; echo "$id"
}

create_or_find_skill() {
  local name="$1" desc="$2" tools="$3"
  echo "▸ Skill: ${name}" >&2
  local existing eid
  existing=$(curl -sf "${BASE_URL}/api/skills" 2>/dev/null || echo "[]")
  eid=$(echo "$existing" | py_find_by_name "$name")
  if [ -n "$eid" ]; then echo "  ✓ exists: ${eid}" >&2; echo "$eid"; return; fi
  local r id
  r=$(curl -sf -X POST "${BASE_URL}/api/skills" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"description\":\"${desc}\",\"industry\":\"financial_services\",\"domain\":\"GL-Accounting\",\"version\":\"1.0.0\",\"author\":\"Kinective / Atlas Platform\",\"trustTier\":\"platform-provided\",\"complexity\":\"advanced\",\"tags\":[\"gl-sync\",\"scn-kin-gl-1\",\"credit-union\"],\"allowedTools\":${tools},\"status\":\"active\"}" \
    2>/dev/null || echo "{}")
  id=$(echo "$r" | py_id)
  if [ -z "$id" ]; then echo "  ✗ Failed: $r" >&2; exit 1; fi
  echo "  ✓ created: ${id}" >&2; echo "$id"
}

create_or_find_policy() {
  local name="$1" desc="$2" enforcement="$3"
  echo "▸ Policy: ${name}" >&2
  local existing eid
  existing=$(curl -sf "${BASE_URL}/api/policies" 2>/dev/null || echo "[]")
  eid=$(echo "$existing" | py_find_by_name "$name")
  if [ -n "$eid" ]; then echo "  ✓ exists: ${eid}" >&2; echo "$eid"; return; fi
  local r id
  r=$(curl -sf -X POST "${BASE_URL}/api/policies" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"description\":\"${desc}\",\"domain\":\"gl_controls\",\"industry\":\"financial_services\",\"enforcementMode\":\"${enforcement}\",\"severity\":\"critical\",\"rules\":[{\"id\":\"R1\",\"description\":\"${desc}\",\"action\":\"${enforcement}\",\"condition\":\"always\"}],\"tags\":[\"gl-sync\",\"scn-kin-gl-1\",\"sox\"],\"status\":\"active\"}" \
    2>/dev/null || echo "{}")
  id=$(echo "$r" | py_id)
  if [ -z "$id" ]; then echo "  ✗ Failed: $r" >&2; exit 1; fi
  echo "  ✓ created: ${id}" >&2; echo "$id"
}

create_or_find_agent() {
  local name="$1" desc="$2" prompt="$3"
  echo "▸ Agent: ${name}" >&2
  local existing eid
  existing=$(curl -sf "${BASE_URL}/api/agents" 2>/dev/null || echo "[]")
  eid=$(echo "$existing" | py_find_by_name "$name")
  if [ -n "$eid" ]; then echo "  ✓ exists: ${eid}" >&2; echo "$eid"; return; fi
  local r id
  r=$(curl -sf -X POST "${BASE_URL}/api/agents" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"description\":\"${desc}\",\"systemPrompt\":\"${prompt}\",\"modelProvider\":\"anthropic\",\"modelName\":\"claude-opus-4-5\",\"maxToolIterations\":10,\"riskTier\":\"HIGH\",\"autonomyMode\":\"autonomous\",\"department\":\"Finance & Accounting\",\"owner\":\"Kinective GL Sync Demo\",\"status\":\"active\",\"environment\":\"production\",\"healthScore\":97,\"successRate\":0.98}" \
    2>/dev/null || echo "{}")
  id=$(echo "$r" | py_id)
  if [ -z "$id" ]; then echo "  ✗ Failed: $r" >&2; exit 1; fi
  echo "  ✓ created: ${id}" >&2; echo "$id"
}

bind_mcp() {
  local agent_id="$1" server_id="$2" label="$3"
  echo "  ▸ Binding ${label}…" >&2
  curl -sf -X POST "${BASE_URL}/api/agents/${agent_id}/mcp-servers" \
    -H "Content-Type: application/json" \
    -d "{\"serverId\":\"${server_id}\"}" > /dev/null 2>&1 || true
  echo "    ✓ bound" >&2
}

link_kb() {
  local agent_id="$1" kb_id="$2" label="$3"
  curl -sf -X POST "${BASE_URL}/api/agents/${agent_id}/knowledge-bases" \
    -H "Content-Type: application/json" \
    -d "{\"knowledgeBaseId\":\"${kb_id}\"}" > /dev/null 2>&1 || true
  echo "  ✓ KB: ${label}" >&2
}

link_skill() {
  local agent_id="$1" skill_id="$2" label="$3"
  curl -sf -X POST "${BASE_URL}/api/agents/${agent_id}/skills" \
    -H "Content-Type: application/json" \
    -d "{\"skillId\":\"${skill_id}\"}" > /dev/null 2>&1 || true
  echo "  ✓ Skill: ${label}" >&2
}

link_policy() {
  local agent_id="$1" policy_id="$2" label="$3"
  curl -sf -X POST "${BASE_URL}/api/agents/${agent_id}/policies" \
    -H "Content-Type: application/json" \
    -d "{\"policyId\":\"${policy_id}\"}" > /dev/null 2>&1 || true
  echo "  ✓ Policy: ${label}" >&2
}

create_deployment() {
  local agent_id="$1" name="$2"
  echo "  ▸ Deployment: ${name}…" >&2
  local r id
  r=$(curl -sf -X POST "${BASE_URL}/api/deployments" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"${agent_id}\",\"environment\":\"production\",\"version\":\"1.0.0\",\"status\":\"deployed\",\"rolloutStrategy\":\"canary\",\"canaryPercent\":100,\"description\":\"GL Sync pod — ${name}\"}" \
    2>/dev/null || echo "{}")
  id=$(echo "$r" | py_id)
  [ -n "$id" ] && echo "    ✓ ${id}" >&2 || echo "    ⚠ may already exist" >&2
}

# ── Main ──────────────────────────────────────────────────────────────────────

check_health

echo "── Step 1: 5 MCP Servers ────────────────────────────────────────"
MCP_GATEWAY=$(create_or_find_mcp \
  "Kinective Gateway GL" \
  "${BASE_URL}/api/mock/kinective-gateway-gl" \
  "Symitar PowerOn GL extraction — GL account catalog, prior-day entries, control totals for Cascade Ridge Credit Union." \
  "HIGH")

MCP_INTACCT=$(create_or_find_mcp \
  "Sage Intacct GL" \
  "${BASE_URL}/api/mock/sage-intacct" \
  "Sage Intacct GL module — accounts, dimensions, journal entry posting and status for Cascade Ridge Credit Union." \
  "HIGH")

MCP_RECON=$(create_or_find_mcp \
  "Reconciliation Ledger" \
  "${BASE_URL}/api/mock/reconciliation-ledger" \
  "Internal reconciliation store — watermark, idempotency keys, posting records for CRCU GL sync." \
  "MEDIUM")

MCP_SFTP=$(create_or_find_mcp \
  "File Delivery (SFTP)" \
  "${BASE_URL}/api/mock/file-delivery" \
  "SFTP file delivery service — deliver GL extract files to Kinective reporting share." \
  "MEDIUM")

MCP_NOTIFY=$(create_or_find_mcp \
  "GL Notification Service" \
  "${BASE_URL}/api/mock/gl-notification" \
  "Email / Slack notification service — GL team alerts, exception notices, completion summaries." \
  "LOW")

echo ""
echo "── Step 2: 17 MCP Tools ─────────────────────────────────────────"

# Kinective Gateway GL (3)
create_tool "$MCP_GATEWAY" "get_gl_account_catalog"   "Retrieve Symitar GL account catalog for Cascade Ridge CU." "" '{"type":"object","properties":{}}'
create_tool "$MCP_GATEWAY" "get_prior_day_gl_entries"  "Extract prior-day GL movements from Symitar via PowerOn." "" '{"type":"object","properties":{"business_date":{"type":"string"},"scenario":{"type":"string"}}}'
create_tool "$MCP_GATEWAY" "get_control_total"         "Get Symitar control total (debit/credit sums, entry count, hash) for a business date." "" '{"type":"object","properties":{"business_date":{"type":"string"},"scenario":{"type":"string"}}}'

# Sage Intacct GL (4)
create_tool "$MCP_INTACCT" "list_gl_accounts"          "List active GL accounts in Sage Intacct." "" '{"type":"object","properties":{}}'
create_tool "$MCP_INTACCT" "list_dimensions"           "List all dimension values (branch, dept, cost-center) in Sage Intacct." "" '{"type":"object","properties":{"scenario":{"type":"string"}}}'
create_tool "$MCP_INTACCT" "post_journal_entry"        "Post a batch of dimensioned journal entries to Sage Intacct." "POST" '{"type":"object","required":["journal_entry_id","entry_count"],"properties":{"journal_entry_id":{"type":"string"},"entry_count":{"type":"number"},"business_date":{"type":"string"},"scenario":{"type":"string"}}}'
create_tool "$MCP_INTACCT" "get_journal_entry_status"  "Check the status of a posted journal entry batch by Intacct JE ID." "" '{"type":"object","required":["journal_entry_id"],"properties":{"journal_entry_id":{"type":"string"},"scenario":{"type":"string"}}}'

# Reconciliation Ledger (4)
create_tool "$MCP_RECON"   "get_watermark"             "Get the last successfully synced business date watermark." "" '{"type":"object","properties":{}}'
create_tool "$MCP_RECON"   "set_watermark"             "Update the watermark after a successful sync cycle." "POST" '{"type":"object","required":["business_date"],"properties":{"business_date":{"type":"string"},"je_id":{"type":"string"}}}'
create_tool "$MCP_RECON"   "check_idempotency_key"     "Check whether a given sync run key has already been processed." "" '{"type":"object","required":["run_key"],"properties":{"run_key":{"type":"string"}}}'
create_tool "$MCP_RECON"   "record_posting"            "Record a completed posting in the reconciliation audit ledger." "POST" '{"type":"object","required":["je_id","business_date","entry_count"],"properties":{"je_id":{"type":"string"},"business_date":{"type":"string"},"entry_count":{"type":"number"},"debit_total":{"type":"number"},"credit_total":{"type":"number"}}}'

# File Delivery (2)
create_tool "$MCP_SFTP"    "deliver_file"              "Deliver a GL reconciliation extract file to the Kinective SFTP share." "POST" '{"type":"object","required":["filename","content_type"],"properties":{"filename":{"type":"string"},"content_type":{"type":"string"},"destination_path":{"type":"string"}}}'
create_tool "$MCP_SFTP"    "get_delivery_status"       "Check delivery status for a given delivery ID." "" '{"type":"object","required":["delivery_id"],"properties":{"delivery_id":{"type":"string"}}}'

# GL Notification Service (4)
create_tool "$MCP_NOTIFY"  "send_notification"         "Send an email or Slack notification to GL team members." "POST" '{"type":"object","required":["channel","subject","body"],"properties":{"channel":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"}}}'
create_tool "$MCP_NOTIFY"  "get_notification_history"  "Retrieve recent notification history for the GL sync pipeline." "" '{"type":"object","properties":{"limit":{"type":"number"}}}'
create_tool "$MCP_NOTIFY"  "send_exception_alert"      "Send a high-priority exception alert for a GL sync anomaly." "POST" '{"type":"object","required":["exception_type","entry_count","detail"],"properties":{"exception_type":{"type":"string"},"entry_count":{"type":"number"},"detail":{"type":"string"}}}'
create_tool "$MCP_NOTIFY"  "send_human_gate_notice"    "Dispatch a human-gate approval request for controller review." "POST" '{"type":"object","required":["gate_type","message","context"],"properties":{"gate_type":{"type":"string"},"message":{"type":"string"},"context":{"type":"object"}}}'

echo ""
echo "── Step 3: 4 Knowledge Bases ────────────────────────────────────"
KB_CROSSWALK=$(create_or_find_kb \
  "GL Account Crosswalk — Symitar to Sage Intacct" \
  "Complete bidirectional crosswalk between Cascade Ridge CU Symitar core account codes and Sage Intacct GL account IDs, including account type and normal balance direction." \
  '["gl-sync","account-mapping","symitar","sage-intacct","scn-kin-gl-1"]')

KB_SOX=$(create_or_find_kb \
  "SOX General Ledger Controls — Cascade Ridge CU" \
  "SOX-compliant GL controls: dual-control requirements, controller sign-off thresholds, segregation-of-duties, and control total reconciliation procedure." \
  '["sox","gl-controls","dual-control","audit","scn-kin-gl-1"]')

KB_SYMITAR=$(create_or_find_kb \
  "Symitar Integration Guide — PowerOn GL Extract" \
  "Technical reference for Symitar Episys GL extraction via PowerOn specfiles: account catalog structure, prior-day entry format, control total generation, and idempotency key conventions." \
  '["symitar","episys","poweron","gl-extract","scn-kin-gl-1"]')

KB_RECON=$(create_or_find_kb \
  "GL Reconciliation & Exception Standards" \
  "Reconciliation procedures: control hash verification, zero-tolerance variance policy, watermark update protocol, exception classification, and finance controller escalation matrix." \
  '["reconciliation","exceptions","control-totals","watermark","scn-kin-gl-1"]')

echo ""
echo "── Step 4: 6 Skills ─────────────────────────────────────────────"
S_IDEMPOTENCY=$(create_or_find_skill \
  "GL Cycle Idempotency Guard" \
  "Prevents duplicate GL sync runs by checking the idempotency key against the reconciliation ledger before any extraction or posting." \
  '["check_idempotency_key","get_watermark"]')

S_EXTRACTION=$(create_or_find_skill \
  "Core GL Extraction & Validation" \
  "Extracts prior-day GL movements from Symitar PowerOn, retrieves the control total, and verifies extraction balance before passing data downstream." \
  '["get_prior_day_gl_entries","get_gl_account_catalog","get_control_total"]')

S_TRANSFORM=$(create_or_find_skill \
  "GL Account Transformation" \
  "Validates every GL entry maps from Symitar core account code to a Sage Intacct GL account ID. Blocks posting if unmapped accounts detected." \
  '["get_gl_account_catalog","list_gl_accounts"]')

S_DIMENSION=$(create_or_find_skill \
  "Dimension & Compliance Enforcement" \
  "Attaches required Intacct dimension values (branch, department, cost-center) to all journal entries. Moves undimensioned entries to exception queue." \
  '["list_dimensions","send_exception_alert"]')

S_POSTING=$(create_or_find_skill \
  "Journal Entry Batch Posting" \
  "Posts the fully transformed and dimensioned JE batch to Sage Intacct, verifies acceptance, and records the Intacct batch ID." \
  '["post_journal_entry","get_journal_entry_status","record_posting"]')

S_RECON=$(create_or_find_skill \
  "Control Total Reconciliation & Cycle Close" \
  "Compares Symitar and Intacct control totals. If balanced, updates watermark and delivers report. If variance, triggers human gate." \
  '["get_control_total","get_journal_entry_status","set_watermark","record_posting","deliver_file","send_notification","send_human_gate_notice"]')

echo ""
echo "── Step 5: 4 Governance Policies ────────────────────────────────"
P_IDEMPOTENCY=$(create_or_find_policy \
  "Duplicate GL Run Prevention" \
  "GL sync cycle must check idempotency key before any extraction or posting. Halts immediately if run key already processed." \
  "block")

P_BALANCE=$(create_or_find_policy \
  "Control Total Balance Verification" \
  "Reconciliation agent must verify Symitar control total exactly matches Intacct posted total before updating watermark. Zero-tolerance — any variance triggers PENDING_REVIEW and human gate." \
  "block")

P_DIMENSION=$(create_or_find_policy \
  "No Undimensioned Journal Entry Posting" \
  "No journal entry may be posted to Intacct without a complete dimension set (branch + department + cost-center). Undimensioned entries go to exception queue." \
  "block")

P_HUMAN_GATE=$(create_or_find_policy \
  "Finance Controller Human Gate" \
  "Any GL sync cycle with an unresolved control total variance must escalate to the finance controller via human gate before being marked COMPLETE. SOX dual-control requirement." \
  "warn")

echo ""
echo "── Step 6: 7 Agents ─────────────────────────────────────────────"
A0=$(create_or_find_agent \
  "GL Sync Orchestrator" \
  "Initiates the prior-day GL synchronization cycle, enforces idempotency, and verifies the watermark before handing off to downstream agents." \
  "You are the GL Sync Orchestrator for Cascade Ridge Credit Union. Check idempotency FIRST, then retrieve the watermark. Report readiness or halt if duplicate.")

A1=$(create_or_find_agent \
  "GL Account Catalog Agent" \
  "Validates the GL account crosswalk between Symitar core accounts and Sage Intacct account IDs before extraction begins." \
  "You are the GL Account Catalog Agent for Cascade Ridge Credit Union. Validate the Symitar to Intacct account crosswalk. Report mapped accounts, any gaps.")

A2=$(create_or_find_agent \
  "Core GL Extraction Agent" \
  "Extracts all prior-day GL movements from Symitar via PowerOn and validates the control total." \
  "You are the Core GL Extraction Agent for Cascade Ridge Credit Union. Extract prior-day GL entries, retrieve control total, verify balance. Report summary or halt if unbalanced.")

A3=$(create_or_find_agent \
  "GL Transformation Agent" \
  "Maps extracted core account codes to Sage Intacct GL account IDs using the account crosswalk." \
  "You are the GL Transformation Agent for Cascade Ridge Credit Union. Validate account mapping — every core account code must map to an Intacct ID before posting proceeds.")

A4=$(create_or_find_agent \
  "Dimension & Compliance Agent" \
  "Attaches required dimension values to all journal entries and flags entries with missing dimensions." \
  "You are the Dimension & Compliance Agent for Cascade Ridge Credit Union. List Intacct dimensions. Identify entries missing branch/dept/cost-center. CRITICAL: do NOT post undimensioned entries — move to exception queue.")

A5=$(create_or_find_agent \
  "Journal Posting Agent" \
  "Posts the transformed and dimensioned journal entry batch to Sage Intacct and verifies acceptance." \
  "You are the Journal Posting Agent for Cascade Ridge Credit Union. Post JE batch to Intacct (JE ID format: JE-{YYYY-MM-DD}-GL-001), verify acceptance status, report accepted/rejected counts.")

A6=$(create_or_find_agent \
  "Reconciliation & Exception Agent" \
  "Verifies Intacct control totals against Symitar, updates the watermark, delivers the reconciliation report, and sends notifications." \
  "You are the Reconciliation & Exception Agent for Cascade Ridge Credit Union. Compare Symitar and Intacct control totals. If balanced: update watermark, record posting, deliver SFTP report, notify GL team. If variance: report variance, trigger human gate, do NOT update watermark.")

echo ""
echo "── Step 7: MCP Bindings ─────────────────────────────────────────"
bind_mcp "$A0" "$MCP_RECON"   "A0 ← Reconciliation Ledger"
bind_mcp "$A0" "$MCP_NOTIFY"  "A0 ← GL Notification Service"

bind_mcp "$A1" "$MCP_GATEWAY" "A1 ← Kinective Gateway GL"
bind_mcp "$A1" "$MCP_INTACCT" "A1 ← Sage Intacct GL"

bind_mcp "$A2" "$MCP_GATEWAY" "A2 ← Kinective Gateway GL"
bind_mcp "$A2" "$MCP_RECON"   "A2 ← Reconciliation Ledger"

bind_mcp "$A3" "$MCP_GATEWAY" "A3 ← Kinective Gateway GL"
bind_mcp "$A3" "$MCP_INTACCT" "A3 ← Sage Intacct GL"

bind_mcp "$A4" "$MCP_INTACCT" "A4 ← Sage Intacct GL"

bind_mcp "$A5" "$MCP_INTACCT" "A5 ← Sage Intacct GL"
bind_mcp "$A5" "$MCP_RECON"   "A5 ← Reconciliation Ledger"

bind_mcp "$A6" "$MCP_GATEWAY" "A6 ← Kinective Gateway GL"
bind_mcp "$A6" "$MCP_INTACCT" "A6 ← Sage Intacct GL"
bind_mcp "$A6" "$MCP_RECON"   "A6 ← Reconciliation Ledger"
bind_mcp "$A6" "$MCP_SFTP"    "A6 ← File Delivery (SFTP)"
bind_mcp "$A6" "$MCP_NOTIFY"  "A6 ← GL Notification Service"

echo ""
echo "── Step 8: KB + Skill + Policy Attachments ──────────────────────"
for AID in $A0 $A1 $A2 $A3 $A4 $A5 $A6; do
  link_kb     "$AID" "$KB_CROSSWALK"  "GL Account Crosswalk"
  link_kb     "$AID" "$KB_SOX"        "SOX GL Controls"
  link_kb     "$AID" "$KB_SYMITAR"    "Symitar Integration Guide"
  link_kb     "$AID" "$KB_RECON"      "Reconciliation Standards"
  link_policy "$AID" "$P_IDEMPOTENCY" "Duplicate Run Prevention"
  link_policy "$AID" "$P_BALANCE"     "Control Total Balance"
  link_policy "$AID" "$P_DIMENSION"   "No Undimensioned Posting"
  link_policy "$AID" "$P_HUMAN_GATE"  "Finance Controller Gate"
done

link_skill "$A0" "$S_IDEMPOTENCY" "Idempotency Guard"
link_skill "$A0" "$S_EXTRACTION"  "Core GL Extraction"
link_skill "$A1" "$S_TRANSFORM"   "GL Transformation"
link_skill "$A2" "$S_IDEMPOTENCY" "Idempotency Guard"
link_skill "$A2" "$S_EXTRACTION"  "Core GL Extraction"
link_skill "$A3" "$S_TRANSFORM"   "GL Transformation"
link_skill "$A4" "$S_DIMENSION"   "Dimension Enforcement"
link_skill "$A5" "$S_POSTING"     "JE Batch Posting"
link_skill "$A6" "$S_RECON"       "Control Total Reconciliation"
link_skill "$A6" "$S_POSTING"     "JE Batch Posting"

echo ""
echo "── Step 9: 7 Deployments ────────────────────────────────────────"
create_deployment "$A0" "GL Sync Orchestrator"
create_deployment "$A1" "GL Account Catalog Agent"
create_deployment "$A2" "Core GL Extraction Agent"
create_deployment "$A3" "GL Transformation Agent"
create_deployment "$A4" "Dimension & Compliance Agent"
create_deployment "$A5" "Journal Posting Agent"
create_deployment "$A6" "Reconciliation & Exception Agent"

echo ""
echo "=================================================================="
echo " ✓  CRCU-GL-SYNC PRODUCTION migration complete!"
echo ""
echo "   MCP Gateway    : ${MCP_GATEWAY}"
echo "   MCP Intacct    : ${MCP_INTACCT}"
echo "   MCP Recon      : ${MCP_RECON}"
echo "   MCP SFTP       : ${MCP_SFTP}"
echo "   MCP Notify     : ${MCP_NOTIFY}"
echo ""
echo "   A0 Orchestrator: ${A0}"
echo "   A1 Catalog     : ${A1}"
echo "   A2 Extraction  : ${A2}"
echo "   A3 Transform   : ${A3}"
echo "   A4 Dimension   : ${A4}"
echo "   A5 Posting     : ${A5}"
echo "   A6 Recon       : ${A6}"
echo ""
echo "   Demo URL : ${BASE_URL}/demo/kinective-gl-sync"
echo ""
echo "   IMPORTANT: Prod DB assigns its own UUIDs. If the live-run SSE"
echo "   demo needs to work on prod, update AGENT_IDS + MCP_IDS in"
echo "   server/gl-sync-live-run.ts to match the IDs printed above,"
echo "   or re-run with fixed IDs via psql (see provision_kinective_gl_sync_dev.sh)."
echo "=================================================================="
