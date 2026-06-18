#!/usr/bin/env bash
# =============================================================================
# ATLAS — Kinective / Cascade Ridge Credit Union
# Demo 1: Prior-Day GL Synchronization (End-to-End)
# Scenario: SCN-KIN-GL-1
# Pipeline: CRCU-GL-SYNC (7-agent pod, A0–A6)
#
# SINGLE COMMAND TO RUN (from Replit workspace):
#   bash provision_kinective_gl_sync_dev.sh
#
# Creates via Platform APIs only (no direct DB writes):
#   • 5 MCP Servers + 17 Tools  (Kinective Gateway GL, Sage Intacct, Reconciliation
#                                 Ledger, File Delivery, GL Notification)
#   • 4 Knowledge Bases
#   • 6 Skills
#   • 1 Outcome Contract
#   • 4 Governance Policies
#   • 6 Ontology Concepts  (Cascade Ridge CU entities, branches, core systems)
#   • 7 Agents  (A0–A6 with fixed UUIDs, system prompts, MCP bindings, skills, policies)
#   • 1 Eval Suite (3 test cases: happy, dimension_mismatch, control_total_variance)
#   • 1 Blueprint (CRCU-GL-SYNC-BLUEPRINT)
#   • 7 Deployments (live-run runtime attaches immediately)
#
# AGENT FIXED UUIDs:
#   A0  a0000000-0000-4000-8000-000000000000  GL Sync Orchestrator
#   A1  a1000000-0000-4000-8000-000000000001  GL Account Catalog Agent
#   A2  a2000000-0000-4000-8000-000000000002  Core GL Extraction Agent
#   A3  a3000000-0000-4000-8000-000000000003  GL Transformation Agent
#   A4  a4000000-0000-4000-8000-000000000004  Dimension & Compliance Agent
#   A5  a5000000-0000-4000-8000-000000000005  Journal Posting Agent
#   A6  a6000000-0000-4000-8000-000000000006  Reconciliation & Exception Agent
#
# MCP FIXED UUIDs:
#   c1000000-0000-4000-8000-000000000001  Kinective Gateway GL
#   c2000000-0000-4000-8000-000000000002  Sage Intacct GL
#   c3000000-0000-4000-8000-000000000003  Reconciliation Ledger
#   c4000000-0000-4000-8000-000000000004  File Delivery (SFTP)
#   c5000000-0000-4000-8000-000000000005  GL Notification Service
#
# REQUIREMENTS: curl, jq, psql (for fixed-UUID inserts)
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"

echo ""
echo "=================================================================="
echo " ATLAS — Kinective / Cascade Ridge Credit Union"
echo " Pipeline: CRCU-GL-SYNC — Prior-Day GL Synchronization"
echo " Pod:      7 Agents (A0–A6)"
echo " Target:   $BASE_URL  (dev)"
echo "=================================================================="
echo ""

if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required. Install with: nix-env -iA nixpkgs.jq"
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
  local f="$WORK/$(echo -n "$label" | tr ' /&' '___').json"
  echo "$payload" > "$f"
  post_api "$label" "$endpoint" "$f"
}

patch_api() {
  local label="$1" endpoint="$2" payload="$3"
  local response
  response=$(curl -s -X PATCH "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d "$payload")
  echo "  ✓ PATCH $label" >&2
}

link_api() {
  local label="$1" endpoint="$2" payload="$3"
  local response
  response=$(curl -s -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d "$payload")
  echo "  ✓ LINK $label" >&2
}

post_tool() {
  local server_id="$1" name="$2" desc="$3" risk="$4" schema="$5" method_override="${6:-}"
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
  local body
  body=$(jq -n \
    --arg n "$name" --arg d "$desc" --arg r "$risk" \
    --argjson s "$schema" --arg ep "$endpoint" --arg m "$method" \
    '{name: $n, description: $d, riskClassification: $r,
      inputSchema: $s, annotations: { endpoint: $ep, method: $m }}')
  local response id
  response=$(curl -s -X POST "${BASE_URL}/api/mcp-servers/${server_id}/tools" \
    -H "Content-Type: application/json" -d "$body")
  id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$id" ]; then
    echo "    ✗ tool FAILED: $name :: $response" >&2
    exit 1
  fi
  echo "    ✓ tool $name  ($method $endpoint)" >&2
}

# Fixed agent/MCP UUIDs (must match gl-sync-live-run.ts)
A0="a0000000-0000-4000-8000-000000000000"
A1="a1000000-0000-4000-8000-000000000001"
A2="a2000000-0000-4000-8000-000000000002"
A3="a3000000-0000-4000-8000-000000000003"
A4="a4000000-0000-4000-8000-000000000004"
A5="a5000000-0000-4000-8000-000000000005"
A6="a6000000-0000-4000-8000-000000000006"

MCP_GATEWAY="c1000000-0000-4000-8000-000000000001"
MCP_INTACCT="c2000000-0000-4000-8000-000000000002"
MCP_RECON="c3000000-0000-4000-8000-000000000003"
MCP_SFTP="c4000000-0000-4000-8000-000000000004"
MCP_NOTIFY="c5000000-0000-4000-8000-000000000005"

# ─── STEP 1: Create 5 MCP Servers ────────────────────────────────────────────
echo "STEP 1: Creating 5 MCP Servers with fixed UUIDs..." >&2

# MCP servers need fixed IDs so the live-run handler can find them.
# We use psql for the inserts to guarantee the UUIDs; the API is used for tools.

DB_URL="${DATABASE_URL:-}"

upsert_mcp_psql() {
  local id="$1" name="$2" desc="$3" path="$4"
  local url="${BASE_URL}/api/mock/${path}"
  psql "$DB_URL" -q <<SQL
INSERT INTO mcp_servers (
  id, name, description, transport_type, url, status, risk_tier,
  allowlisted, industry_id, added_by,
  capabilities, server_info,
  created_at, updated_at
) VALUES (
  '$id',
  '$name',
  '$desc',
  'streamable-http',
  '$url',
  'production-enabled',
  'HIGH',
  true,
  'financial_services',
  'gl-sync-provision',
  '{"tools":true,"resources":false,"prompts":false,"sampling":false}'::jsonb,
  '{"vendor":"Kinective / Cascade Ridge","version":"1.0.0","environment":"dev"}'::jsonb,
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE
  SET url = EXCLUDED.url, updated_at = NOW();
SQL
  echo "  ✓ MCP upserted: $name ($id)" >&2
}

upsert_mcp_psql "$MCP_GATEWAY" "Kinective Gateway GL"     "Symitar PowerOn GL extraction — GL account catalog, prior-day entries, control totals."        "kinective-gateway-gl"
upsert_mcp_psql "$MCP_INTACCT" "Sage Intacct GL"          "Sage Intacct GL module — accounts, dimensions, journal entry posting and status."              "sage-intacct"
upsert_mcp_psql "$MCP_RECON"   "Reconciliation Ledger"    "Internal reconciliation store — watermark, idempotency keys, posting records."                  "reconciliation-ledger"
upsert_mcp_psql "$MCP_SFTP"    "File Delivery (SFTP)"     "SFTP file delivery service — deliver GL extract files to Kinective reporting share."            "file-delivery"
upsert_mcp_psql "$MCP_NOTIFY"  "GL Notification Service"  "Email / Slack notification service — GL team alerts, exception notices, completion summaries."   "gl-notification"

echo "" >&2

# ─── STEP 2: Register tools on each MCP server ───────────────────────────────
echo "STEP 2: Registering 17 tools across 5 MCP servers..." >&2

# Kinective Gateway GL (3 tools)
post_tool "$MCP_GATEWAY" "get_gl_account_catalog"   "Retrieve the Symitar GL account catalog for Cascade Ridge Credit Union — account codes, descriptions, normal balance direction." "low"    '{"type":"object","properties":{}}'
post_tool "$MCP_GATEWAY" "get_prior_day_gl_entries"  "Extract all prior-day GL movements from Symitar via PowerOn. Returns entries with core account code, amount, debit/credit indicator, branch code, and transaction description." "medium" '{"type":"object","properties":{"business_date":{"type":"string"},"scenario":{"type":"string"}}}'
post_tool "$MCP_GATEWAY" "get_control_total"         "Retrieve the Symitar control total (debit sum, credit sum, entry count, control hash) for a given business date." "low"    '{"type":"object","properties":{"business_date":{"type":"string"},"scenario":{"type":"string"}}}'

# Sage Intacct GL (4 tools)
post_tool "$MCP_INTACCT" "list_gl_accounts"          "List all active GL accounts in Sage Intacct with type, normal balance, and mapped core account code." "low"    '{"type":"object","properties":{}}'
post_tool "$MCP_INTACCT" "list_dimensions"           "List all dimension values (branch, department, cost-center) currently registered in Sage Intacct." "low"    '{"type":"object","properties":{"scenario":{"type":"string"}}}'
post_tool "$MCP_INTACCT" "post_journal_entry"        "Post a batch of dimensioned journal entries to Sage Intacct. Returns JE batch ID and initial status." "high"   '{"type":"object","required":["journal_entry_id","entry_count"],"properties":{"journal_entry_id":{"type":"string"},"entry_count":{"type":"number"},"business_date":{"type":"string"},"scenario":{"type":"string"}}}' "POST"
post_tool "$MCP_INTACCT" "get_journal_entry_status"  "Check the current status of a posted journal entry batch by its Intacct JE ID." "low"    '{"type":"object","required":["journal_entry_id"],"properties":{"journal_entry_id":{"type":"string"},"scenario":{"type":"string"}}}'

# Reconciliation Ledger (4 tools)
post_tool "$MCP_RECON"   "get_watermark"             "Retrieve the last successfully synced business date watermark for the GL sync cycle." "low"    '{"type":"object","properties":{}}'
post_tool "$MCP_RECON"   "set_watermark"             "Update the watermark after a successful sync cycle to the new business date." "medium" '{"type":"object","required":["business_date"],"properties":{"business_date":{"type":"string"},"je_id":{"type":"string"}}}' "POST"
post_tool "$MCP_RECON"   "check_idempotency_key"     "Check whether a given sync run key has already been processed to prevent duplicate runs." "low"    '{"type":"object","required":["run_key"],"properties":{"run_key":{"type":"string"}}}'
post_tool "$MCP_RECON"   "record_posting"            "Record a completed posting event in the reconciliation audit ledger." "medium" '{"type":"object","required":["je_id","business_date","entry_count"],"properties":{"je_id":{"type":"string"},"business_date":{"type":"string"},"entry_count":{"type":"number"},"debit_total":{"type":"number"},"credit_total":{"type":"number"}}}' "POST"

# File Delivery SFTP (2 tools)
post_tool "$MCP_SFTP"    "deliver_file"              "Deliver a GL reconciliation extract file to the Kinective SFTP reporting share." "medium" '{"type":"object","required":["filename","content_type"],"properties":{"filename":{"type":"string"},"content_type":{"type":"string"},"destination_path":{"type":"string"}}}' "POST"
post_tool "$MCP_SFTP"    "get_delivery_status"       "Check the delivery status for a given delivery ID." "low"    '{"type":"object","required":["delivery_id"],"properties":{"delivery_id":{"type":"string"}}}'

# GL Notification Service (4 tools)
post_tool "$MCP_NOTIFY"  "send_notification"         "Send an email or Slack notification to GL team members." "low"    '{"type":"object","required":["channel","subject","body"],"properties":{"channel":{"type":"string"},"recipients":{"type":"array","items":{"type":"string"}},"subject":{"type":"string"},"body":{"type":"string"},"priority":{"type":"string"}}}' "POST"
post_tool "$MCP_NOTIFY"  "get_notification_history"  "Retrieve the recent notification history for the GL sync pipeline." "low"    '{"type":"object","properties":{"limit":{"type":"number"}}}'
post_tool "$MCP_NOTIFY"  "send_exception_alert"      "Send a high-priority exception alert for a GL sync anomaly (dimension mismatch, control total variance)." "medium" '{"type":"object","required":["exception_type","entry_count","detail"],"properties":{"exception_type":{"type":"string"},"entry_count":{"type":"number"},"detail":{"type":"string"},"affected_accounts":{"type":"array","items":{"type":"string"}}}}' "POST"
post_tool "$MCP_NOTIFY"  "send_human_gate_notice"    "Dispatch a human-gate approval request when a GL sync step requires controller review." "high"   '{"type":"object","required":["gate_type","message","context"],"properties":{"gate_type":{"type":"string"},"message":{"type":"string"},"context":{"type":"object"},"urgency":{"type":"string"}}}' "POST"

echo "" >&2

# ─── STEP 3: Create 4 Knowledge Bases ────────────────────────────────────────
echo "STEP 3: Creating 4 Knowledge Bases..." >&2

KB_CROSSWALK=$(post_inline "KB: GL Account Crosswalk" "/api/knowledge-bases" '{
  "name": "GL Account Crosswalk — Symitar to Sage Intacct",
  "description": "Complete bidirectional crosswalk between Cascade Ridge Credit Union Symitar core account codes and Sage Intacct GL account IDs. Includes account type (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), normal balance direction, and mapping status (active/deprecated). Used by the GL Transformation Agent to validate every account before posting.",
  "industry": "financial_services",
  "tags": ["gl-sync", "account-mapping", "symitar", "sage-intacct", "crosswalk", "scn-kin-gl-1"],
  "status": "active"
}')

KB_SOX=$(post_inline "KB: SOX GL Controls" "/api/knowledge-bases" '{
  "name": "SOX General Ledger Controls — Cascade Ridge CU",
  "description": "Sarbanes-Oxley compliant GL controls for credit union operations: dual-control requirements for JE posting, controller sign-off thresholds, segregation-of-duties matrix, and the control total reconciliation procedure. Defines when the human gate (controller review) must trigger.",
  "industry": "financial_services",
  "tags": ["sox", "gl-controls", "dual-control", "audit", "governance", "scn-kin-gl-1"],
  "status": "active"
}')

KB_SYMITAR=$(post_inline "KB: Symitar Integration Guide" "/api/knowledge-bases" '{
  "name": "Symitar Episys Integration Guide — PowerOn GL Extract",
  "description": "Technical reference for extracting GL data from the Symitar Episys core banking system via PowerOn specfiles. Covers GL account catalog structure, prior-day entry format, control total generation, idempotency key conventions (CRCU-GL-{YYYYMMDD}), and common extraction failure modes.",
  "industry": "financial_services",
  "tags": ["symitar", "episys", "poweron", "gl-extract", "core-banking", "scn-kin-gl-1"],
  "status": "active"
}')

KB_RECON=$(post_inline "KB: Reconciliation & Exception Standards" "/api/knowledge-bases" '{
  "name": "GL Reconciliation & Exception Handling Standards",
  "description": "Reconciliation procedures for the daily prior-day GL sync: control hash verification, acceptable variance thresholds (zero tolerance for control total), watermark update protocol, exception classification (dimension_mismatch vs control_total_variance vs extraction_error), and escalation matrix for the finance controller.",
  "industry": "financial_services",
  "tags": ["reconciliation", "exceptions", "control-totals", "watermark", "finance", "scn-kin-gl-1"],
  "status": "active"
}')

echo "" >&2

# ─── STEP 4: Create 6 Skills ─────────────────────────────────────────────────
echo "STEP 4: Creating 6 Skills..." >&2

mk_skill() {
  local name="$1" desc="$2" tools="$3"
  jq -n --arg n "$name" --arg d "$desc" --argjson tl "$tools" '{
    name: $n, description: $d,
    industry: "financial_services", domain: "GL-Accounting",
    version: "1.0.0", author: "Kinective / Atlas Platform Team",
    trustTier: "platform-provided", complexity: "advanced",
    dependencies: ["symitar-episys", "sage-intacct", "kinective-gateway"],
    tags: ["gl-sync", "credit-union", "scn-kin-gl-1", "prior-day-sync"],
    agentTypeCompatibility: ["single", "team"],
    allowedTools: $tl,
    markdownBody: ("# " + $n + "\n\n## Purpose\n" + $d + "\n\n## Compliance Notes\n- All GL postings are governed by SOX dual-control and zero-variance control total requirements.\n- Human gate triggers on control_total_variance and unresolvable dimension_mismatch exceptions."),
    status: "active"
  }'
}

S_IDEMPOTENCY=$(post_inline "Skill: GL Cycle Idempotency" "/api/skills" "$(mk_skill \
  "GL Cycle Idempotency Guard" \
  "Prevents duplicate GL sync runs by checking the idempotency key (CRCU-GL-{YYYYMMDD}) against the reconciliation ledger before initiating any extraction or posting. If the key is present, the cycle halts immediately with a DUPLICATE_RUN status." \
  '["check_idempotency_key","get_watermark"]')")

S_EXTRACTION=$(post_inline "Skill: Core GL Extraction" "/api/skills" "$(mk_skill \
  "Core GL Extraction & Validation" \
  "Extracts all prior-day GL movements from the Symitar Episys core via PowerOn, retrieves the control total, and verifies the extraction is balanced (debit total = credit total) before passing data downstream. Reports PowerOn job ID, entry count, and control hash." \
  '["get_prior_day_gl_entries","get_gl_account_catalog","get_control_total"]')")

S_TRANSFORM=$(post_inline "Skill: GL Account Transformation" "/api/skills" "$(mk_skill \
  "GL Account Transformation" \
  "Validates every extracted GL entry maps cleanly from Symitar core account code to a Sage Intacct GL account ID using the account crosswalk KB. Blocks the posting step if any unmapped accounts are detected. Reports transformation readiness count and any gaps." \
  '["get_gl_account_catalog","list_gl_accounts"]')")

S_DIMENSION=$(post_inline "Skill: Dimension & Compliance Enforcement" "/api/skills" "$(mk_skill \
  "Dimension & Compliance Enforcement" \
  "Attaches all required Sage Intacct dimension values (branch, department, cost-center) to journal entries before posting. Detects missing branch dimension codes for newly opened branches and moves affected entries to the exception queue. Zero undimensioned entries may proceed to posting." \
  '["list_dimensions","send_exception_alert"]')")

S_POSTING=$(post_inline "Skill: Journal Entry Posting" "/api/skills" "$(mk_skill \
  "Journal Entry Batch Posting" \
  "Posts the fully transformed and dimensioned journal entry batch to Sage Intacct, verifies acceptance status, and records the Intacct batch ID. Captures any posting rejections and triggers exception handling. JE ID format: JE-{YYYY-MM-DD}-GL-001." \
  '["post_journal_entry","get_journal_entry_status","record_posting"]')")

S_RECON=$(post_inline "Skill: Control Total Reconciliation" "/api/skills" "$(mk_skill \
  "Control Total Reconciliation & Cycle Close" \
  "Compares Symitar control total (debit/credit) against the Sage Intacct posted journal entry total. If balanced, updates the watermark and delivers the reconciliation report via SFTP. If a variance is detected, classifies it, triggers the human gate, and withholds the watermark update." \
  '["get_control_total","get_journal_entry_status","set_watermark","record_posting","deliver_file","send_notification","send_human_gate_notice"]')")

echo "" >&2

# ─── STEP 5: Create Outcome Contract ─────────────────────────────────────────
echo "STEP 5: Creating Outcome Contract..." >&2

OUTCOME=$(post_inline "Outcome: Prior-Day GL Sync" "/api/outcomes" '{
  "name": "Prior-Day GL Synchronization — Cascade Ridge Credit Union",
  "description": "Outcome contract governing the CRCU-GL-SYNC 7-agent pipeline. Replaces the manual nightly GL reconciliation process (4 hours, 2 FTE) with an autonomous 7-agent pod that extracts, transforms, dimensions, posts, and reconciles prior-day GL movements from Symitar to Sage Intacct — completing in under 8 minutes with full audit trail.",
  "industry": "financial_services",
  "domain": "GL-Accounting",
  "riskTier": "high",
  "businessOutcome": "Reduce nightly GL close from 4 hours (2 FTE) to <8 minutes autonomous execution with zero manual posting errors",
  "successCriteria": "Control totals balanced on >=99% of runs; dimension exceptions resolved within 1 business day; watermark updated every cycle; reconciliation report delivered to SFTP by 7:00 AM",
  "tags": ["scn-kin-gl-1", "gl-sync", "prior-day", "cascade-ridge", "credit-union", "kinective"],
  "status": "active"
}')

echo "" >&2

# ─── STEP 6: Create 4 Governance Policies ────────────────────────────────────
echo "STEP 6: Creating 4 Governance Policies..." >&2

mk_policy() {
  local name="$1" domain="$2" desc="$3" enforcement="$4"
  jq -n --arg n "$name" --arg dm "$domain" --arg d "$desc" --arg e "$enforcement" '{
    name: $n, description: $d, domain: $dm,
    industry: "financial_services",
    enforcementMode: $e,
    severity: "critical",
    rules: [{ id: "R1", description: $d, action: $e, condition: "always" }],
    tags: ["scn-kin-gl-1", "gl-sync", "sox", "audit"],
    status: "active"
  }'
}

P_IDEMPOTENCY=$(post_inline "Policy: Duplicate Run Prevention" "/api/policies" "$(mk_policy \
  "Duplicate GL Run Prevention" \
  "idempotency" \
  "The GL sync cycle must check the idempotency key before initiating any extraction or posting. If the run key has already been processed, the cycle halts immediately. Prevents double-posting of journal entries to Sage Intacct." \
  "block")")

P_BALANCE=$(post_inline "Policy: Control Total Balance Verification" "/api/policies" "$(mk_policy \
  "Control Total Balance Verification" \
  "financial_controls" \
  "The reconciliation agent must verify that the Symitar control total (debit sum) exactly equals the Intacct posted total before updating the watermark. Any variance — no matter how small — triggers the PENDING_REVIEW state and the human gate. Zero-tolerance policy." \
  "block")")

P_DIMENSION=$(post_inline "Policy: No Undimensioned Entries" "/api/policies" "$(mk_policy \
  "No Undimensioned Journal Entry Posting" \
  "gl_compliance" \
  "No journal entry may be posted to Sage Intacct without a complete dimension set (branch + department + cost-center). Entries with missing dimensions are moved to the exception queue and never submitted to the posting agent. Prevents dimension orphans in the Intacct ledger." \
  "block")")

P_HUMAN_GATE=$(post_inline "Policy: Controller Human Gate" "/api/policies" "$(mk_policy \
  "Finance Controller Human Gate" \
  "dual_control" \
  "Any GL sync cycle that cannot achieve a balanced control total (control_total_variance scenario) must escalate to the finance controller via the human gate before the cycle can be marked COMPLETE. The agent cannot autonomously resolve a material variance. SOX dual-control requirement." \
  "warn")")

echo "" >&2

# ─── STEP 7: Create Ontology Concepts ────────────────────────────────────────
echo "STEP 7: Creating 6 Ontology Concepts (Cascade Ridge CU entities)..." >&2

cat > "$WORK/ontology.json" <<'ENDJSON'
{
  "concepts": [
    {
      "id": "crcu-entity-cascade-ridge-cu",
      "industryId": "financial_services",
      "ontologyName": "Cascade Ridge Credit Union Entities",
      "label": "Cascade Ridge Credit Union",
      "category": "financial_institution",
      "description": "State-chartered credit union headquartered in Maple Valley, WA. Operates 14 branches across King, Pierce, and Snohomish counties. Core banking system: Symitar Episys. Financial reporting: Sage Intacct. Regulated by NCUA and WA DFI.",
      "synonyms": ["CRCU", "Cascade Ridge", "CascadeRidge"],
      "tags": ["scn-kin-gl-1", "credit-union", "washington"],
      "source": "gl-sync-provisioning"
    },
    {
      "id": "crcu-system-symitar-episys",
      "industryId": "financial_services",
      "ontologyName": "Cascade Ridge Credit Union Entities",
      "label": "Symitar Episys Core Banking",
      "category": "core_banking_system",
      "description": "Jack Henry Symitar Episys — primary core banking system for CRCU. GL account structure uses 4-digit codes (1010=Cash, 1100=Investments, 1310=Loans, 2010=Deposits, etc.). Prior-day GL movements extracted via PowerOn specfile. Control total available same-day by 11 PM.",
      "synonyms": ["Symitar", "Episys", "PowerOn", "core-banking"],
      "tags": ["scn-kin-gl-1", "symitar", "gl-source"],
      "source": "gl-sync-provisioning"
    },
    {
      "id": "crcu-system-sage-intacct",
      "industryId": "financial_services",
      "ontologyName": "Cascade Ridge Credit Union Entities",
      "label": "Sage Intacct GL System",
      "category": "financial_reporting_system",
      "description": "Sage Intacct general ledger and financial reporting system for CRCU. Receives daily journal entry batches from Symitar via the GL sync pipeline. Dimension model: Branch (14 active), Department (8), Cost-Center (24). JE ID convention: JE-{YYYY-MM-DD}-GL-001.",
      "synonyms": ["Intacct", "Sage", "GL-reporting"],
      "tags": ["scn-kin-gl-1", "sage-intacct", "gl-target"],
      "source": "gl-sync-provisioning"
    },
    {
      "id": "crcu-branch-maple-valley-main",
      "industryId": "financial_services",
      "ontologyName": "Cascade Ridge Credit Union Entities",
      "label": "Maple Valley Main Branch (BR-01)",
      "category": "branch_office",
      "description": "CRCU headquarters branch in Maple Valley, WA. Intacct branch dimension ID: BR-01. Highest transaction volume branch. GL movements include member deposits, loan disbursements, and wire transfers processed through this branch.",
      "synonyms": ["BR-01", "Maple Valley", "main branch"],
      "tags": ["scn-kin-gl-1", "branch", "maple-valley"],
      "source": "gl-sync-provisioning"
    },
    {
      "id": "crcu-branch-kirkland-br14",
      "industryId": "financial_services",
      "ontologyName": "Cascade Ridge Credit Union Entities",
      "label": "Kirkland Branch (BR-14) — New",
      "category": "branch_office",
      "description": "Newly opened CRCU branch in Kirkland, WA. Branch dimension BR-14 has NOT yet propagated to Sage Intacct. GL entries tagged with BR-14 will fail dimension validation and must be routed to the exception queue until the dimension is registered. This is the dimension_mismatch scenario trigger.",
      "synonyms": ["BR-14", "Kirkland", "new branch"],
      "tags": ["scn-kin-gl-1", "branch", "kirkland", "dimension-mismatch", "exception"],
      "source": "gl-sync-provisioning"
    },
    {
      "id": "crcu-control-sync-watermark",
      "industryId": "financial_services",
      "ontologyName": "Cascade Ridge Credit Union Entities",
      "label": "GL Sync Watermark",
      "category": "control_mechanism",
      "description": "Idempotency and lineage record for the CRCU daily GL sync pipeline. Stores the last successfully synced business date, the Intacct JE batch ID, and the Symitar control hash. Updated by the Reconciliation Agent only when control totals balance. Key format: CRCU-GL-{YYYYMMDD}.",
      "synonyms": ["watermark", "sync-marker", "idempotency-key"],
      "tags": ["scn-kin-gl-1", "watermark", "idempotency", "audit"],
      "source": "gl-sync-provisioning"
    }
  ]
}
ENDJSON

ONTOLOGY_RESP=$(curl -s -X POST "${BASE_URL}/api/ontology/batch" \
  -H "Content-Type: application/json" \
  -d @"$WORK/ontology.json")
echo "  ✓ Ontology batch → $(echo "$ONTOLOGY_RESP" | jq -r '.created // .count // "ok"')" >&2
echo "" >&2

# ─── STEP 8: Create 7 Agents with fixed UUIDs ────────────────────────────────
echo "STEP 8: Creating 7 Agents with fixed UUIDs via psql..." >&2

upsert_agent_psql() {
  local id="$1" name="$2" desc="$3" prompt="$4" dept="$5"
  psql "$DB_URL" -q <<SQL
INSERT INTO agents (
  id, name, description, system_prompt, runtime_config,
  agent_type, status, environment,
  model_provider, model_name,
  risk_tier, autonomy_mode, current_version,
  max_tool_iterations, tool_access_class,
  department, owner,
  health_score, success_rate, maturity_factors,
  created_at, updated_at
) VALUES (
  '$id', '$name', '$desc', '$prompt',
  '{"scheduleIntervalMinutes":0}'::jsonb,
  'single', 'active', 'production',
  'anthropic', 'claude-opus-4-5',
  'HIGH', 'autonomous', '1.0.0',
  10, 'standard',
  '$dept', 'Kinective GL Sync Demo',
  97, 0.98, '{}'::jsonb,
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      system_prompt = EXCLUDED.system_prompt,
      updated_at = NOW();
SQL
  echo "  ✓ Agent upserted: $name ($id)" >&2
}

# A0 — Sync Orchestrator
upsert_agent_psql "$A0" \
  "GL Sync Orchestrator" \
  "Initiates the prior-day GL synchronization cycle, enforces idempotency, and verifies the watermark before handing off to downstream agents." \
  "You are the GL Sync Orchestrator for Cascade Ridge Credit Union. Your role is to safely initiate the daily prior-day GL synchronization cycle.\n\nResponsibilities:\n1. Check idempotency to prevent duplicate runs — verify the run key has not already been processed\n2. Retrieve the watermark to confirm the last successful sync date\n3. Confirm the cycle is safe to proceed and report readiness to the pipeline\n\nAlways check idempotency FIRST before any other action. If the key has already been processed, report the duplicate and halt. Do not proceed if the watermark date indicates the sync has already run today." \
  "Finance & Accounting"

# A1 — GL Account Catalog Agent
upsert_agent_psql "$A1" \
  "GL Account Catalog Agent" \
  "Validates the GL account crosswalk between Symitar core accounts and Sage Intacct account IDs before extraction begins." \
  "You are the GL Account Catalog Agent for Cascade Ridge Credit Union. Your role is to validate the account crosswalk before any GL data is processed.\n\nResponsibilities:\n1. Retrieve the GL account catalog from Symitar (core account codes + descriptions)\n2. Retrieve the list of GL accounts from Sage Intacct\n3. Verify every core account maps to an Intacct account ID\n4. Report any unmapped accounts — these would block the transformation step\n\nReport the total mapped accounts, any gaps, and confirm the catalog is ready for extraction." \
  "Finance & Accounting"

# A2 — Core GL Extraction Agent
upsert_agent_psql "$A2" \
  "Core GL Extraction Agent" \
  "Extracts all prior-day GL movements from Symitar via PowerOn and validates the control total." \
  "You are the Core GL Extraction Agent for Cascade Ridge Credit Union. Your role is to extract all prior-day GL movements from the Symitar core system.\n\nResponsibilities:\n1. Extract all prior-day GL entries for the business date\n2. Retrieve the control total (debit + credit + entry count + control hash)\n3. Verify the extraction is balanced (debit total = credit total)\n4. Report the extraction summary: total entries, debit total, credit total, control hash, and PowerOn job ID\n\nIf the extraction is unbalanced, report the discrepancy immediately and do not proceed." \
  "Finance & Accounting"

# A3 — GL Transformation Agent
upsert_agent_psql "$A3" \
  "GL Transformation Agent" \
  "Maps extracted core account codes to Sage Intacct GL account IDs using the account crosswalk." \
  "You are the GL Transformation Agent for Cascade Ridge Credit Union. Your role is to validate the account mapping for all extracted GL entries.\n\nResponsibilities:\n1. Retrieve the Symitar GL account catalog to review all source account codes\n2. Retrieve the Sage Intacct account list to verify all target mappings\n3. Confirm each core account code (1010, 1310, 1320, etc.) maps cleanly to the corresponding Intacct ID\n4. Report transformation readiness: total entries ready for posting, any transformation failures\n\nThe transformation is a core control: every entry must have a valid Intacct account ID before posting proceeds." \
  "Finance & Accounting"

# A4 — Dimension & Compliance Agent
upsert_agent_psql "$A4" \
  "Dimension & Compliance Agent" \
  "Attaches required dimension values (branch, department, cost-center) to all journal entries and flags entries with missing dimensions." \
  "You are the Dimension & Compliance Agent for Cascade Ridge Credit Union. Your role is to ensure all journal entries carry complete dimension assignments before posting.\n\nResponsibilities:\n1. List all dimension values from Sage Intacct: branches, departments, cost-centers\n2. Verify all active branches are registered in Intacct — pay attention to recently opened branches\n3. Identify any journal entries that cannot be dimensioned due to missing branch codes\n4. Flag exceptions for human review when dimensions are incomplete\n\nCRITICAL: If any branch dimension is missing from the Intacct dimension table (e.g., a newly opened branch whose dimension has not yet propagated), the affected entries MUST be moved to the exception queue. Do NOT post undimensioned entries." \
  "Finance & Accounting"

# A5 — Journal Posting Agent
upsert_agent_psql "$A5" \
  "Journal Posting Agent" \
  "Posts the transformed and dimensioned journal entry batch to Sage Intacct and verifies acceptance." \
  "You are the Journal Posting Agent for Cascade Ridge Credit Union. Your role is to post the prepared journal entry batch to Sage Intacct.\n\nResponsibilities:\n1. Post the journal entry batch to Sage Intacct (include entry count and journal_entry_id)\n2. Check the journal entry status to confirm acceptance\n3. Report: entries accepted, entries rejected, Intacct batch ID, posting timestamp\n4. If any entries are rejected, capture the rejection detail and exception count\n\nUse journal_entry_id format: JE-{YYYY-MM-DD}-GL-001. Always verify the posting status after submitting." \
  "Finance & Accounting"

# A6 — Reconciliation & Exception Agent
upsert_agent_psql "$A6" \
  "Reconciliation & Exception Agent" \
  "Verifies Intacct control totals against Symitar, updates the watermark, delivers the reconciliation report, and sends notifications." \
  "You are the Reconciliation & Exception Agent for Cascade Ridge Credit Union. Your role is to close out the GL sync cycle with full reconciliation.\n\nResponsibilities:\n1. Get the Symitar control total for the business date\n2. Check the posted journal entry status to get the Intacct total\n3. Compare totals — if they match, the cycle is BALANCED; if they diverge, report the variance and classify it\n4. Update the sync watermark to the current business date\n5. Record the posting in the reconciliation ledger\n6. Deliver the reconciliation report file via SFTP\n7. Send a completion notification to the GL team\n\nIf a control total variance is detected: report the exact variance amount, identify the source entry, and mark the cycle as PENDING_REVIEW. Do not update the watermark if there is an unresolved variance." \
  "Finance & Accounting"

echo "" >&2

# ─── STEP 9: Bind MCP servers to agents via psql ─────────────────────────────
echo "STEP 9: Binding MCP servers to agents..." >&2

bind_mcp() {
  local agent_id="$1" server_id="$2" label="$3"
  psql "$DB_URL" -q <<SQL
INSERT INTO agent_mcp_servers (agent_id, server_id, created_at)
VALUES ('$agent_id', '$server_id', NOW())
ON CONFLICT (agent_id, server_id) DO NOTHING;
SQL
  echo "  ✓ MCP bind: $label" >&2
}

# A0: Reconciliation + Notification
bind_mcp "$A0" "$MCP_RECON"   "A0 ← Reconciliation Ledger"
bind_mcp "$A0" "$MCP_NOTIFY"  "A0 ← GL Notification Service"

# A1: Gateway GL + Sage Intacct
bind_mcp "$A1" "$MCP_GATEWAY" "A1 ← Kinective Gateway GL"
bind_mcp "$A1" "$MCP_INTACCT" "A1 ← Sage Intacct GL"

# A2: Gateway GL + Reconciliation
bind_mcp "$A2" "$MCP_GATEWAY" "A2 ← Kinective Gateway GL"
bind_mcp "$A2" "$MCP_RECON"   "A2 ← Reconciliation Ledger"

# A3: Gateway GL + Sage Intacct
bind_mcp "$A3" "$MCP_GATEWAY" "A3 ← Kinective Gateway GL"
bind_mcp "$A3" "$MCP_INTACCT" "A3 ← Sage Intacct GL"

# A4: Sage Intacct only
bind_mcp "$A4" "$MCP_INTACCT" "A4 ← Sage Intacct GL"

# A5: Sage Intacct + Reconciliation
bind_mcp "$A5" "$MCP_INTACCT" "A5 ← Sage Intacct GL"
bind_mcp "$A5" "$MCP_RECON"   "A5 ← Reconciliation Ledger"

# A6: All 5 MCPs
bind_mcp "$A6" "$MCP_GATEWAY" "A6 ← Kinective Gateway GL"
bind_mcp "$A6" "$MCP_INTACCT" "A6 ← Sage Intacct GL"
bind_mcp "$A6" "$MCP_RECON"   "A6 ← Reconciliation Ledger"
bind_mcp "$A6" "$MCP_SFTP"    "A6 ← File Delivery (SFTP)"
bind_mcp "$A6" "$MCP_NOTIFY"  "A6 ← GL Notification Service"

echo "" >&2

# ─── STEP 10: Attach KBs to all 7 agents ─────────────────────────────────────
echo "STEP 10: Attaching Knowledge Bases to agents..." >&2

for AID in $A0 $A1 $A2 $A3 $A4 $A5 $A6; do
  link_api "KB Crosswalk → $AID" "/api/agents/${AID}/knowledge-bases" "{\"knowledgeBaseId\":\"$KB_CROSSWALK\"}"
  link_api "KB SOX → $AID"       "/api/agents/${AID}/knowledge-bases" "{\"knowledgeBaseId\":\"$KB_SOX\"}"
  link_api "KB Symitar → $AID"   "/api/agents/${AID}/knowledge-bases" "{\"knowledgeBaseId\":\"$KB_SYMITAR\"}"
  link_api "KB Recon → $AID"     "/api/agents/${AID}/knowledge-bases" "{\"knowledgeBaseId\":\"$KB_RECON\"}"
done

echo "" >&2

# ─── STEP 11: Attach Skills to agents ────────────────────────────────────────
echo "STEP 11: Attaching Skills to agents..." >&2

link_api "Skill Idempotency → A0" "/api/agents/${A0}/skills" "{\"skillId\":\"$S_IDEMPOTENCY\"}"
link_api "Skill Extraction → A0"  "/api/agents/${A0}/skills" "{\"skillId\":\"$S_EXTRACTION\"}"

link_api "Skill Transform → A1"   "/api/agents/${A1}/skills" "{\"skillId\":\"$S_TRANSFORM\"}"

link_api "Skill Idempotency → A2" "/api/agents/${A2}/skills" "{\"skillId\":\"$S_IDEMPOTENCY\"}"
link_api "Skill Extraction → A2"  "/api/agents/${A2}/skills" "{\"skillId\":\"$S_EXTRACTION\"}"

link_api "Skill Transform → A3"   "/api/agents/${A3}/skills" "{\"skillId\":\"$S_TRANSFORM\"}"

link_api "Skill Dimension → A4"   "/api/agents/${A4}/skills" "{\"skillId\":\"$S_DIMENSION\"}"

link_api "Skill Posting → A5"     "/api/agents/${A5}/skills" "{\"skillId\":\"$S_POSTING\"}"

link_api "Skill Recon → A6"       "/api/agents/${A6}/skills" "{\"skillId\":\"$S_RECON\"}"
link_api "Skill Posting → A6"     "/api/agents/${A6}/skills" "{\"skillId\":\"$S_POSTING\"}"

echo "" >&2

# ─── STEP 12: Attach Policies to all 7 agents ────────────────────────────────
echo "STEP 12: Attaching Governance Policies to agents..." >&2

for AID in $A0 $A1 $A2 $A3 $A4 $A5 $A6; do
  link_api "Policy Idempotency → $AID" "/api/agents/${AID}/policies" "{\"policyId\":\"$P_IDEMPOTENCY\"}"
  link_api "Policy Balance → $AID"     "/api/agents/${AID}/policies" "{\"policyId\":\"$P_BALANCE\"}"
  link_api "Policy Dimension → $AID"   "/api/agents/${AID}/policies" "{\"policyId\":\"$P_DIMENSION\"}"
  link_api "Policy HumanGate → $AID"   "/api/agents/${AID}/policies" "{\"policyId\":\"$P_HUMAN_GATE\"}"
done

echo "" >&2

# ─── STEP 13: Create Eval Suite ──────────────────────────────────────────────
echo "STEP 13: Creating Eval Suite (3 test cases)..." >&2

EVAL_SUITE=$(post_inline "Eval Suite: CRCU-GL-SYNC" "/api/eval-suites" "$(jq -n \
  --arg a0 "$A0" --arg a6 "$A6" \
  '{
    name: "CRCU GL Sync — Prior-Day Reconciliation Eval Suite",
    description: "End-to-end eval suite for the CRCU-GL-SYNC 7-agent pipeline. Covers three scenarios: (1) Happy path — 1,742 balanced entries posted cleanly; (2) Dimension mismatch — 47 entries excepted for Kirkland BR-14; (3) Control total variance — $1,000 FX rate divergence triggers human gate.",
    agentId: $a0,
    industry: "financial_services",
    tags: ["scn-kin-gl-1", "gl-sync", "credit-union", "e2e"],
    status: "active",
    cases: [
      {
        name: "Happy Path — Balanced Sync",
        input: "Run the prior-day GL sync for business date 2026-06-17. All 1,742 entries should post cleanly with balanced control totals.",
        expectedOutput: "GL sync cycle COMPLETE. 1,742 entries extracted and posted. Control totals balanced. Watermark updated to 2026-06-17. Reconciliation report delivered.",
        tags: ["happy", "balanced", "e2e"]
      },
      {
        name: "Dimension Mismatch — Kirkland BR-14",
        input: "Run the prior-day GL sync for business date 2026-06-17 with the dimension_mismatch scenario. Kirkland branch (BR-14) opened yesterday but dimension not yet in Intacct.",
        expectedOutput: "GL sync cycle COMPLETE WITH EXCEPTIONS. 47 entries moved to exception queue (branch dimension BR-14 missing from Intacct). Remaining entries posted. Exception alert sent to GL team.",
        tags: ["dimension_mismatch", "exception", "e2e"]
      },
      {
        name: "Control Total Variance — FX Rate Divergence",
        input: "Run the prior-day GL sync for business date 2026-06-17 with the control_total_variance scenario. FX rate rounding difference of $1,000 between Symitar and Intacct.",
        expectedOutput: "GL sync cycle PENDING_REVIEW. Control total variance of $1,000 detected (FX rate divergence). Human gate triggered. Watermark NOT updated. Finance controller notified.",
        tags: ["control_total_variance", "human_gate", "e2e"]
      }
    ]
  }')")

echo "" >&2

# ─── STEP 14: Create Blueprint ───────────────────────────────────────────────
echo "STEP 14: Creating Pipeline Blueprint..." >&2

BLUEPRINT=$(post_inline "Blueprint: CRCU-GL-SYNC" "/api/blueprints" "$(jq -n \
  --arg a0 "$A0" --arg a1 "$A1" --arg a2 "$A2" --arg a3 "$A3" \
  --arg a4 "$A4" --arg a5 "$A5" --arg a6 "$A6" \
  --arg oc "$OUTCOME" \
  '{
    name: "CRCU-GL-SYNC — Prior-Day GL Synchronization Blueprint",
    description: "7-agent sequential pipeline blueprint for Cascade Ridge Credit Union prior-day GL synchronization. Extracts GL movements from Symitar, transforms and dimensions each entry, posts to Sage Intacct, and reconciles control totals — autonomous end-to-end with three scenario variants.",
    industry: "financial_services",
    domain: "GL-Accounting",
    agentType: "team",
    version: "1.0.0",
    author: "Kinective / Atlas Platform Team",
    tags: ["scn-kin-gl-1", "gl-sync", "credit-union", "prior-day", "7-agent-pod"],
    outcomeId: $oc,
    steps: [
      { order: 0, agentId: $a0, name: "Cycle Initiation & Idempotency Check",    description: "Check idempotency key and watermark. Gate: proceed or halt if duplicate." },
      { order: 1, agentId: $a1, name: "GL Account Catalog Validation",           description: "Validate Symitar ↔ Intacct account crosswalk." },
      { order: 2, agentId: $a2, name: "Prior-Day GL Extraction",                 description: "Extract GL movements from Symitar PowerOn. Verify control total balance." },
      { order: 3, agentId: $a3, name: "GL Transformation",                       description: "Map core account codes to Intacct GL account IDs." },
      { order: 4, agentId: $a4, name: "Dimension & Compliance",                  description: "Attach branch/dept/cost-center dimensions. Flag missing dimensions." },
      { order: 5, agentId: $a5, name: "Journal Entry Posting",                   description: "Post JE batch to Sage Intacct. Verify acceptance." },
      { order: 6, agentId: $a6, name: "Reconciliation & Cycle Close",            description: "Compare control totals. Update watermark if balanced. Deliver report. Notify GL team." }
    ],
    status: "published"
  }')")

echo "" >&2

# ─── STEP 15: Create 7 Deployments ───────────────────────────────────────────
echo "STEP 15: Creating 7 Deployments (live-run runtime attach)..." >&2

mk_deployment() {
  local agent_id="$1" agent_name="$2" idx="$3"
  post_inline "Deployment: $agent_name" "/api/deployments" "$(jq -n \
    --arg aid "$agent_id" --arg an "$agent_name" --arg idx "$idx" \
    '{
      agentId: $aid,
      environment: "production",
      version: "1.0.0",
      status: "deployed",
      description: ("Prior-day GL sync pod — " + $an + " (A" + $idx + ")"),
      config: {
        rateLimit: 60,
        timeout: 300,
        retries: 2,
        authRequired: false
      }
    }')"
}

mk_deployment "$A0" "GL Sync Orchestrator"          "0"
mk_deployment "$A1" "GL Account Catalog Agent"       "1"
mk_deployment "$A2" "Core GL Extraction Agent"       "2"
mk_deployment "$A3" "GL Transformation Agent"        "3"
mk_deployment "$A4" "Dimension & Compliance Agent"   "4"
mk_deployment "$A5" "Journal Posting Agent"          "5"
mk_deployment "$A6" "Reconciliation & Exception Agent" "6"

echo "" >&2

# ─── DONE ─────────────────────────────────────────────────────────────────────
echo "=================================================================="
echo " ✓  CRCU-GL-SYNC provisioning complete!"
echo ""
echo "   MCP Servers:  5  (Gateway GL, Sage Intacct, Reconciliation,"
echo "                     File Delivery, GL Notification)"
echo "   Tools:        17"
echo "   KBs:          4"
echo "   Skills:       6"
echo "   Outcome:      1  → $OUTCOME"
echo "   Policies:     4"
echo "   Ontology:     6 concepts"
echo "   Agents:       7  (A0–A6)"
echo "   Eval Suite:   1  (3 test cases)"
echo "   Blueprint:    1  → $BLUEPRINT"
echo "   Deployments:  7"
echo ""
echo "   Navigate to: /demo/kinective-gl-sync"
echo "=================================================================="
