#!/usr/bin/env bash
# ============================================================
# OTC Cash Application — Dev → Production Migration Script
# Demo 4: AI-Powered Cash Application
# Agents: OTC-AGT-009 (Cash Application) + OTC-AGT-006 (Billing & Collections)
#
# Usage:
#   chmod +x scripts/migrate-otc-cash-to-prod.sh
#   ./scripts/migrate-otc-cash-to-prod.sh
#
# Prerequisites:
#   - jq installed (brew install jq / apt install jq)
#   - Prod environment accessible at $PROD_URL
#   - Production org ID set in $PROD_ORG_ID
#
# What this migrates:
#   ✓ 3 Knowledge Bases
#   ✓ 2 MCP Servers (Payment Matching Engine + AR & Billing Engine)
#   ✓ 15 MCP Server Tools (9 + 6)
#   ✓ 6 Skills (3 per agent)
#   ✓ 3 Governance Policies
#   ✓ 3 Blueprints
#   ✓ OTC-AGT-009: Cash Application & Reconciliation Agent
#   ✓ OTC-AGT-006: Billing & Collections Agent
#   ✓ 2 Deployments (prod, active)
#   ✓ Writes otc-cash-prod-ids.json
# ============================================================
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required. Install: brew install jq"; exit 1; }
command -v base64 >/dev/null 2>&1 || { echo "ERROR: base64 is required"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "ERROR: curl is required"; exit 1; }

PROD_URL="${PROD_URL:-https://agent-lifecycle-management-platform.replit.app}"
PROD_ORG_ID="${PROD_ORG_ID:-}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  OTC Cash Application — Dev → Production Migration"
echo "  Target: $PROD_URL"
if [ -n "$PROD_ORG_ID" ]; then
  echo "  Org:    $PROD_ORG_ID"
fi
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── Auth header helper ───────────────────────────────────────────────────────
ORG_HEADER=""
if [ -n "$PROD_ORG_ID" ]; then
  ORG_HEADER="-H 'x-organization-id: $PROD_ORG_ID'"
fi

post_api() {
  local path="$1"
  local payload_b64="$2"
  local payload
  payload=$(echo "$payload_b64" | base64 --decode)
  curl -fsS -X POST "${PROD_URL}${path}" \
    -H "Content-Type: application/json" \
    ${PROD_ORG_ID:+-H "x-organization-id: $PROD_ORG_ID"} \
    -d "$payload"
}

# ─── Phase 1: Knowledge Bases ─────────────────────────────────────────────────
echo "== Phase 1: Knowledge Bases =="

echo "  Creating: Cash Application & Deduction Policy Handbook"
KB1_PAYLOAD=$(cat <<'EOPAYLOAD' | base64 -w0
{"name":"Cash Application & Deduction Policy Handbook","description":"NovaTech cash application operating procedures, deduction code library, exception escalation matrix, month-end close checklist.","industry":"manufacturing","status":"active","embeddingModel":"text-embedding-3-small","embeddingDimensions":1536,"chunkSize":512,"chunkOverlap":50}
EOPAYLOAD
)
KB1_RESP=$(post_api "/api/knowledge-bases" "$KB1_PAYLOAD")
KB1_ID=$(echo "$KB1_RESP" | jq -r '.id')
echo "  KB1_ID: $KB1_ID"

echo "  Creating: Customer Remittance & Billing Reference"
KB2_PAYLOAD=$(cat <<'EOPAYLOAD' | base64 -w0
{"name":"Customer Remittance & Billing Reference","description":"EDI 820 parsing rules, customer-specific remittance formats, early pay discount terms, freight claim authority matrix.","industry":"manufacturing","status":"active","embeddingModel":"text-embedding-3-small","embeddingDimensions":1536,"chunkSize":512,"chunkOverlap":50}
EOPAYLOAD
)
KB2_RESP=$(post_api "/api/knowledge-bases" "$KB2_PAYLOAD")
KB2_ID=$(echo "$KB2_RESP" | jq -r '.id')
echo "  KB2_ID: $KB2_ID"

echo "  Creating: Bank Reconciliation & AR Closing Standards"
KB3_PAYLOAD=$(cat <<'EOPAYLOAD' | base64 -w0
{"name":"Bank Reconciliation & AR Closing Standards","description":"Month-end AR closing procedures, bank reconciliation methodology, GL posting rules, credit memo approval authority.","industry":"manufacturing","status":"active","embeddingModel":"text-embedding-3-small","embeddingDimensions":1536,"chunkSize":512,"chunkOverlap":50}
EOPAYLOAD
)
KB3_RESP=$(post_api "/api/knowledge-bases" "$KB3_PAYLOAD")
KB3_ID=$(echo "$KB3_RESP" | jq -r '.id')
echo "  KB3_ID: $KB3_ID"

# ─── Phase 2: MCP Servers ────────────────────────────────────────────────────
echo ""
echo "== Phase 2: MCP Servers =="

echo "  Creating: OTC Cash — Payment Matching Engine"
MCP1_PAYLOAD=$(cat <<EOPAYLOAD | base64 -w0
{"name":"OTC Cash -- Payment Matching Engine","description":"NovaTech Cash Application core: payment ingestion, auto-matching, exception identification, EDI 820 parsing, deduction analysis and validation, payment resolution.","url":"${PROD_URL}/api/mock/otc-cash-payment-engine","transportType":"streamable-http","status":"registered","riskTier":"MEDIUM","allowlisted":true,"addedBy":"otc-cash-migration-script","capabilities":{"tools":true,"resources":false,"prompts":false,"sampling":false},"serverInfo":{"vendor":"NovaTech Industries / ATLAS Demo","version":"1.0.0"}}
EOPAYLOAD
)
MCP1_RESP=$(post_api "/api/mcp-servers" "$MCP1_PAYLOAD")
MCP1_ID=$(echo "$MCP1_RESP" | jq -r '.id')
echo "  MCP1_ID (Payment Engine): $MCP1_ID"

echo "  Creating tools for Payment Matching Engine..."
for TOOL_DATA in \
  '{"name":"ingest_daily_payment_batch","description":"Ingests all month-end payments: 387 transactions totalling $42.3M","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"ingest-payment-batch","method":"GET"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"run_auto_matching","description":"Runs intelligent auto-matching achieving 94.1% match rate","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"run-auto-matching","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"identify_exceptions","description":"Returns prioritised exception queue sorted by value and complexity","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"identify-exceptions","method":"GET"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"get_bank_reconciliation","description":"Returns month-end bank reconciliation status","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"bank-reconciliation","method":"GET"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"parse_edi_remittance","description":"Parses GlobalTech EDI 820: 47 invoices, 3 deductions, overpayment","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"parse-edi-remittance","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"match_payment_to_invoices","description":"Matches GlobalTech payment to 47 invoices at 99.2% confidence","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"match-invoices","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"analyze_deductions","description":"Analyses 3 deductions: freight, early pay, quantity short","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"analyze-deductions","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"validate_deduction_details","description":"Issues VALID/INVESTIGATE rulings with evidence for each deduction","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"validate-deductions","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"apply_payment_resolution","description":"Prepares complete GlobalTech resolution package for controller","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"apply-resolution","method":"POST"},"enabled":true,"riskClassification":"low"}' \
; do
  TOOL_B64=$(echo "$TOOL_DATA" | base64 -w0)
  post_api "/api/mcp-servers/${MCP1_ID}/tools" "$TOOL_B64" > /dev/null
done
echo "  ✓  9 tools created for Payment Matching Engine"

echo "  Creating: OTC Cash — AR & Billing Engine"
MCP2_PAYLOAD=$(cat <<EOPAYLOAD | base64 -w0
{"name":"OTC Cash -- AR & Billing Engine","description":"NovaTech AR and Billing management: deduction policy validation, AR journal entries, credit memos, invoice closure, AR aging, customer AR summaries.","url":"${PROD_URL}/api/mock/otc-cash-ar-posting","transportType":"streamable-http","status":"registered","riskTier":"MEDIUM","allowlisted":true,"addedBy":"otc-cash-migration-script","capabilities":{"tools":true,"resources":false,"prompts":false,"sampling":false},"serverInfo":{"vendor":"NovaTech Industries / ATLAS Demo","version":"1.0.0"}}
EOPAYLOAD
)
MCP2_RESP=$(post_api "/api/mcp-servers" "$MCP2_PAYLOAD")
MCP2_ID=$(echo "$MCP2_RESP" | jq -r '.id')
echo "  MCP2_ID (AR Engine): $MCP2_ID"

echo "  Creating tools for AR & Billing Engine..."
for TOOL_DATA in \
  '{"name":"validate_deduction_against_policy","description":"Cross-references deduction against NovaTech policy matrix","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"validate-policy","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"post_ar_entries","description":"Posts cash receipt journal entries to AR sub-ledger","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"post-ar-entries","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"generate_credit_memo","description":"Generates credit memo for $38,100 overpayment","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"generate-credit-memo","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"close_invoice_batch","description":"Marks 47 GlobalTech invoices CLOSED-PAID, updates AR balance","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"close-invoices","method":"POST"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"get_ar_aging_impact","description":"Calculates AR aging impact: GlobalTech $3.1M to $0.73M","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"ar-aging-impact","method":"GET"},"enabled":true,"riskClassification":"low"}' \
  '{"name":"get_customer_ar_summary","description":"Returns GlobalTech Corp full AR summary post-payment","inputSchema":{"type":"object","properties":{},"required":[]},"annotations":{"endpoint":"customer-ar-summary","method":"GET"},"enabled":true,"riskClassification":"low"}' \
; do
  TOOL_B64=$(echo "$TOOL_DATA" | base64 -w0)
  post_api "/api/mcp-servers/${MCP2_ID}/tools" "$TOOL_B64" > /dev/null
done
echo "  ✓  6 tools created for AR & Billing Engine"

# ─── Phase 3: Skills ──────────────────────────────────────────────────────────
echo ""
echo "== Phase 3: Skills =="

declare -A SKILL_IDS

for SKILL_DATA in \
  '{"name":"Intelligent Payment Matching","domain":"cash_application","industry":"manufacturing","version":"1.0.0","trustTier":"platform-provided","status":"active","tags":["auto_matching","payment_processing","invoice_matching","remittance"],"description":"Applies multi-signal matching algorithm to achieve 94%+ auto-match rates.","markdownBody":"## Intelligent Payment Matching\nApplies NovaTech multi-signal matching: exact invoice ref, fuzzy name, amount tolerance, historical patterns.","contextMode":"summary","allowedTools":[]}' \
  '{"name":"Remittance Parsing & Extraction","domain":"cash_application","industry":"manufacturing","version":"1.0.0","trustTier":"platform-provided","status":"active","tags":["edi_820","remittance_parsing","extraction","deduction_codes"],"description":"Parses EDI 820, PDF, and email remittances extracting invoice refs and deduction codes.","markdownBody":"## Remittance Parsing & Extraction\nParses multi-format remittance advice including EDI 820 transaction sets and PDF stubs.","contextMode":"summary","allowedTools":[]}' \
  '{"name":"Deduction Classification & Validity Assessment","domain":"cash_application","industry":"manufacturing","version":"1.0.0","trustTier":"platform-provided","status":"active","tags":["deduction_management","validity_assessment","freight_claims","early_pay_discount"],"description":"Classifies deductions and validates against policy matrix issuing VALID/INVESTIGATE rulings.","markdownBody":"## Deduction Classification & Validity Assessment\nIssues validity rulings backed by carrier PODs, delivery receipts, and payment terms.","contextMode":"summary","allowedTools":[]}' \
  '{"name":"AR Posting & Invoice Closure","domain":"accounts_receivable","industry":"manufacturing","version":"1.0.0","trustTier":"platform-provided","status":"active","tags":["ar_posting","journal_entries","invoice_closure","asc_606"],"description":"Executes journal entry posting and closes paid invoice batches with ERP status updates.","markdownBody":"## AR Posting & Invoice Closure\nPosts cash receipt JEs, closes invoices in ERP, confirms ASC 606 revenue recognition.","contextMode":"summary","allowedTools":[]}' \
  '{"name":"Collections Dunning Management","domain":"accounts_receivable","industry":"manufacturing","version":"1.0.0","trustTier":"platform-provided","status":"active","tags":["collections","dunning","ar_aging","overdue_management"],"description":"Manages AR aging and automated dunning sequences for overdue accounts.","markdownBody":"## Collections Dunning Management\nIdentifies overdue accounts, selects dunning templates by tier, executes multi-channel outreach.","contextMode":"summary","allowedTools":[]}' \
  '{"name":"Invoice Generation & Tax Application","domain":"billing_operations","industry":"manufacturing","version":"1.0.0","trustTier":"platform-provided","status":"active","tags":["invoice_generation","tax_calculation","edi_810","billing"],"description":"Generates invoices with pricing, tax, and transmits via customer-preferred channel.","markdownBody":"## Invoice Generation & Tax Application\nGenerates invoices with contract pricing, tax by jurisdiction, and EPD terms.","contextMode":"summary","allowedTools":[]}' \
; do
  SKILL_B64=$(echo "$SKILL_DATA" | base64 -w0)
  SKILL_NAME=$(echo "$SKILL_DATA" | jq -r '.name')
  echo "  Creating skill: $SKILL_NAME"
  SKILL_RESP=$(post_api "/api/skills" "$SKILL_B64")
  SKILL_ID=$(echo "$SKILL_RESP" | jq -r '.id')
  SKILL_IDS["$SKILL_NAME"]="$SKILL_ID"
  echo "  SKILL_ID: $SKILL_ID"
done

# ─── Phase 4: Governance Policies ────────────────────────────────────────────
echo ""
echo "== Phase 4: Governance Policies =="

for POLICY_DATA in \
  '{"name":"Cash Application Authority Matrix","domain":"treasury_governance","status":"active","version":1,"scopeType":"org","description":"Defines automated cash application authority and posting thresholds.","policyJson":{"enforcement":"hard","rules":[{"name":"Auto-Match Posting Authority","description":"95%+ confidence auto-post; 80-95% one-click confirm; below 80% exception queue"},{"name":"Deduction Auto-Approve Threshold","description":"Valid deductions up to $50K auto-approved; above requires controller sign-off"}]}}' \
  '{"name":"Deduction Validity Protocol","domain":"treasury_governance","status":"active","version":1,"scopeType":"org","description":"Governs deduction claim validation requirements.","policyJson":{"enforcement":"hard","rules":[{"name":"Freight Claim Evidence","description":"Carrier POD damage notation required for VALID ruling"},{"name":"Early Pay Verification","description":"Payment must be within discount window AND qualify under contract terms"}]}}' \
  '{"name":"Month-End Close SOX Controls","domain":"financial_compliance","status":"active","version":1,"scopeType":"org","description":"SOX-compliant month-end AR close requirements.","policyJson":{"enforcement":"hard","rules":[{"name":"48-Hour Posting Deadline","description":"All payments must be matched and posted within 2 business days"},{"name":"Bank Reconciliation Standard","description":"Month-end bank rec must reach 99%+ by close of business day 3"}]}}' \
; do
  POL_B64=$(echo "$POLICY_DATA" | base64 -w0)
  POL_NAME=$(echo "$POLICY_DATA" | jq -r '.name')
  echo "  Creating policy: $POL_NAME"
  post_api "/api/policies" "$POL_B64" > /dev/null
  echo "  ✓  $POL_NAME"
done

# ─── Phase 5: Blueprints ──────────────────────────────────────────────────────
echo ""
echo "== Phase 5: Blueprints =="

for BP_DATA in \
  '{"name":"OTC Cash -- Payment Ingestion & Auto-Match Blueprint","description":"Ingests payment batch, runs auto-matching to 94%+ rate, identifies exception queue, reports bank rec.","status":"active","version":1,"patternType":"pipeline","blueprintJson":{"industry":"manufacturing","workflowSteps":["Ingest Payment Batch","Run Auto-Matching","Identify Exceptions","Check Bank Reconciliation"],"outputFormat":"JSON cash application summary"}}' \
  '{"name":"OTC Cash -- Complex Payment Resolution Blueprint","description":"Resolves GlobalTech $2.3M: parses EDI 820, matches 47 invoices, validates 3 deductions.","status":"active","version":1,"patternType":"pipeline","blueprintJson":{"industry":"manufacturing","workflowSteps":["Parse EDI 820","Match 47 Invoices","Analyse Deductions","Validate Deductions","Prepare Resolution"],"outputFormat":"JSON resolution package"}}' \
  '{"name":"OTC Cash -- AR Posting & Invoice Closure Blueprint","description":"Posts GlobalTech payment to AR: validates policy, posts JEs, generates credit memo, closes invoices.","status":"active","version":1,"patternType":"pipeline","blueprintJson":{"industry":"manufacturing","workflowSteps":["Policy Validation","Post AR Entries","Generate Credit Memo","Close Invoice Batch","AR Aging Impact"],"outputFormat":"JSON AR posting confirmation"}}' \
; do
  BP_B64=$(echo "$BP_DATA" | base64 -w0)
  BP_NAME=$(echo "$BP_DATA" | jq -r '.name')
  echo "  Creating blueprint: $BP_NAME"
  BP_RESP=$(post_api "/api/blueprints" "$BP_B64")
  BP_ID=$(echo "$BP_RESP" | jq -r '.id')
  echo "  BP_ID: $BP_ID"
done

# ─── Phase 6: Agents ─────────────────────────────────────────────────────────
echo ""
echo "== Phase 6: Agents =="

echo "  Creating OTC-AGT-009: Cash Application & Reconciliation Agent"
AGT009_PAYLOAD=$(cat <<'EOPAYLOAD' | base64 -w0
{"name":"Cash Application & Reconciliation Agent","description":"Automates NovaTech's month-end cash application cycle: ingests $42M+ payments, achieves 94%+ auto-match rates, resolves complex cross-invoice remittances like GlobalTech's 47-invoice EDI 820.","industry":"manufacturing","department":"Treasury & Cash Management","systemPrompt":"You are the Cash Application & Reconciliation Agent (OTC-AGT-009) for NovaTech Industries. You run NovaTech's month-end Cash Application Command Center. Use your tools to ingest payments, run auto-matching, identify exceptions, parse remittances, validate deductions, and prepare resolution packages.","status":"active","autonomyMode":"assisted","riskTier":"HIGH","model":"claude-opus-4-5","temperature":0.2,"maxTokens":4096,"complianceTags":["CASH-APP-AUTHORITY","DEDUCTION-VALIDATION-PROTOCOL","MONTH-END-CLOSE-SOX"],"ontologyTags":["Payment Batch","Invoice Matching","Deduction Code","Remittance Advice"],"tags":["otc","cash_application","month_end","financial","otc-agt-009"]}
EOPAYLOAD
)
AGT009_RESP=$(post_api "/api/agents" "$AGT009_PAYLOAD")
AGT009_ID=$(echo "$AGT009_RESP" | jq -r '.id')
echo "  OTC-AGT-009 ID: $AGT009_ID"

echo "  Creating OTC-AGT-006: Billing & Collections Agent"
AGT006_PAYLOAD=$(cat <<'EOPAYLOAD' | base64 -w0
{"name":"Billing & Collections Agent","description":"Manages NovaTech's AR sub-ledger post-cash-application: validates deductions against policy, posts cash receipt journal entries, generates credit memos, closes invoice batches, monitors AR aging.","industry":"manufacturing","department":"Accounts Receivable & Billing","systemPrompt":"You are the Billing & Collections Agent (OTC-AGT-006) for NovaTech Industries. Validate deductions against policy, post journal entries, generate credit memos, close invoice batches, and maintain AR aging accuracy. Be exact with amounts, GL account codes, journal entry references, and invoice numbers.","status":"active","autonomyMode":"assisted","riskTier":"HIGH","model":"claude-opus-4-5","temperature":0.2,"maxTokens":4096,"complianceTags":["AR-POSTING-AUTHORITY","CREDIT-MEMO-APPROVAL","SOX-FINANCIAL-CONTROLS"],"ontologyTags":["AR Journal Entry","Invoice Closure","Credit Memo","AR Aging"],"tags":["otc","cash_application","month_end","financial","otc-agt-006"]}
EOPAYLOAD
)
AGT006_RESP=$(post_api "/api/agents" "$AGT006_PAYLOAD")
AGT006_ID=$(echo "$AGT006_RESP" | jq -r '.id')
echo "  OTC-AGT-006 ID: $AGT006_ID"

# ─── Phase 7: Link KBs ───────────────────────────────────────────────────────
echo ""
echo "== Phase 7: KB Links =="

KB009_LINK=$(echo "{\"knowledgeBaseId\":\"$KB1_ID\",\"priority\":1,\"retrievalConfig\":{\"topK\":5,\"scoreThreshold\":0.7}}" | base64 -w0)
post_api "/api/agents/$AGT009_ID/knowledge-bases" "$KB009_LINK" > /dev/null
echo "  ✓  OTC-AGT-009 → Cash Application KB"

KB006_LINK=$(echo "{\"knowledgeBaseId\":\"$KB3_ID\",\"priority\":1,\"retrievalConfig\":{\"topK\":5,\"scoreThreshold\":0.7}}" | base64 -w0)
post_api "/api/agents/$AGT006_ID/knowledge-bases" "$KB006_LINK" > /dev/null
echo "  ✓  OTC-AGT-006 → Bank Reconciliation KB"

# ─── Phase 8: Deployments ────────────────────────────────────────────────────
echo ""
echo "== Phase 8: Deployments =="

DEPLOY009=$(echo "{\"agentId\":\"$AGT009_ID\",\"status\":\"active\",\"environment\":\"production\",\"config\":{\"mcpServerId\":\"$MCP1_ID\"}}" | base64 -w0)
DEPLOY009_RESP=$(post_api "/api/deployments" "$DEPLOY009")
DEPLOY009_ID=$(echo "$DEPLOY009_RESP" | jq -r '.id')
echo "  OTC-AGT-009 deployment: $DEPLOY009_ID"

DEPLOY006=$(echo "{\"agentId\":\"$AGT006_ID\",\"status\":\"active\",\"environment\":\"production\",\"config\":{\"mcpServerId\":\"$MCP2_ID\"}}" | base64 -w0)
DEPLOY006_RESP=$(post_api "/api/deployments" "$DEPLOY006")
DEPLOY006_ID=$(echo "$DEPLOY006_RESP" | jq -r '.id')
echo "  OTC-AGT-006 deployment: $DEPLOY006_ID"

# ─── Write output ────────────────────────────────────────────────────────────
echo ""
echo "== Writing otc-cash-prod-ids.json =="

cat > scripts/otc-cash-prod-ids.json <<EOIDS
{
  "kbs": {
    "Cash Application & Deduction Policy Handbook": "$KB1_ID",
    "Customer Remittance & Billing Reference": "$KB2_ID",
    "Bank Reconciliation & AR Closing Standards": "$KB3_ID"
  },
  "mcpServers": {
    "OTC Cash -- Payment Matching Engine": "$MCP1_ID",
    "OTC Cash -- AR & Billing Engine": "$MCP2_ID"
  },
  "agents": {
    "OTC-AGT-009": "$AGT009_ID",
    "OTC-AGT-006": "$AGT006_ID"
  },
  "deployments": {
    "OTC-AGT-009": "$DEPLOY009_ID",
    "OTC-AGT-006": "$DEPLOY006_ID"
  },
  "targetUrl": "$PROD_URL",
  "migratedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOIDS

echo "  ✓  IDs written to scripts/otc-cash-prod-ids.json"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Migration complete!"
echo "  OTC-AGT-009: $AGT009_ID"
echo "  OTC-AGT-006: $AGT006_ID"
echo "  MCP-1 (Payment Engine): $MCP1_ID"
echo "  MCP-2 (AR Engine): $MCP2_ID"
echo "  Target: $PROD_URL"
echo "═══════════════════════════════════════════════════════════"
echo ""
