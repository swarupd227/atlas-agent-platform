#!/usr/bin/env bash
# =============================================================================
# provision_kinective_fintech_connectors.sh
# ASTRA Agents — Kinective Change of Address (COA) FinTech Connector Suite
#
# Creates via Platform REST APIs only — zero direct DB writes:
#   • 11 production-grade MCP Connector Servers
#   • 70+ production-grade MCP Tools with full JSON Schema
#   • 1 Agent Template: "Change of Address — Credit Union"
#
# Connector coverage:
#   Core Banking:      Kinective Gateway Core, Jack Henry Symitar, FiServ DNA
#   E-Signature:       Kinective SignPlus
#   Digital Banking:   Alkami, Q2 Digital Banking
#   Document Svcs:     Doxim Document Services
#   Card Management:   PSCU Card Services
#   CRM:               Salesforce Financial Services Cloud
#   Address/USPS:      USPS CASS Address Validation API
#   BSA/AML & Fraud:   NICE Actimize SAM
#   Loan Origination:  Encompass by ICE Mortgage Technology
#
# Usage (from Replit workspace root):
#   bash provision_kinective_fintech_connectors.sh
#
# Requirements: curl, jq
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
INDUSTRY_ID="financial_services"

echo ""
echo "=============================================================="
echo " ASTRA Agents — Kinective FinTech Connector Suite"
echo " COA Demo Provisioner"
echo " Target: ${BASE_URL}"
echo "=============================================================="
echo ""

# ── Pre-flight ────────────────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required (apt install jq / brew install jq)" >&2
  exit 1
fi

echo "▸ Checking server health…"
tries=0
until curl -sf "${BASE_URL}/api/health" >/dev/null 2>&1 || [ $tries -ge 20 ]; do
  tries=$((tries + 1))
  echo "  Not ready, retry ${tries}/20…"
  sleep 3
done
if ! curl -sf "${BASE_URL}/api/health" >/dev/null 2>&1; then
  echo "✗ Server did not become ready. Start 'npm run dev' first." >&2
  exit 1
fi
echo "✓ Server healthy."
echo ""

WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────

# post_api LABEL ENDPOINT PAYLOAD_JSON → prints created ID to stdout
post_api() {
  local label="$1" endpoint="$2" payload="$3"
  local response id
  echo "$payload" >"$WORK/payload.json"
  response=$(curl -sf -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d @"$WORK/payload.json" 2>/dev/null || echo "{}")
  id=$(echo "$response" | jq -r '.id // empty' 2>/dev/null || echo "")
  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "  ✗ FAILED: $label" >&2
    echo "    Response: $response" >&2
    exit 1
  fi
  echo "  ✓ $label → $id" >&2
  echo "$id"
}

# find_or_create_mcp SERVER_NAME → prints server ID (creates if not present)
find_or_create_mcp() {
  local name="$1" payload="$2"
  local existing_id
  existing_id=$(curl -sf "${BASE_URL}/api/mcp-servers" 2>/dev/null \
    | jq -r --arg n "$name" '.[] | select(.name == $n) | .id' 2>/dev/null \
    | head -1 || echo "")
  if [ -n "$existing_id" ]; then
    echo "  ✓ MCP server already exists: $name → $existing_id" >&2
    echo "$existing_id"
    return
  fi
  post_api "MCP server: $name" "/api/mcp-servers" "$payload"
}

# post_tool SERVER_ID TOOL_NAME DESCRIPTION RISK SCHEMA_JSON [ANNOTATIONS_JSON]
post_tool() {
  local server_id="$1" name="$2" desc="$3" risk="$4" schema="$5"
  local annotations="${6:-{}}"
  local payload response tool_id
  payload=$(jq -n \
    --arg n "$name" \
    --arg d "$desc" \
    --arg r "$risk" \
    --argjson s "$schema" \
    --argjson a "$annotations" \
    '{name:$n, description:$d, riskClassification:$r, inputSchema:$s, annotations:$a}')
  response=$(curl -sf -X POST "${BASE_URL}/api/mcp-servers/${server_id}/tools" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null || echo "{}")
  tool_id=$(echo "$response" | jq -r '.id // empty' 2>/dev/null || echo "")
  if [ -z "$tool_id" ] || [ "$tool_id" = "null" ]; then
    echo "    ✗ tool FAILED: $name :: $response" >&2
  else
    echo "    ✓ tool: $name  [risk=$risk]" >&2
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1 — KINECTIVE GATEWAY CORE
# Kinective's proprietary core banking middleware that abstracts member data
# across credit union core systems and exposes a unified member record API.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 1: Kinective Gateway Core MCP Server"
MCP_KGC=$(find_or_create_mcp "Kinective Gateway Core" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/gateway" \
  '{
    name: "Kinective Gateway Core",
    description: "Kinective'\''s unified core banking gateway — abstracts member record management, account data, and address operations across all connected credit union core systems. Implements optimistic locking, change history, and NCUA-compliant audit trails for every mutation.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "HIGH",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: {
      tools: true,
      resources: false,
      prompts: false
    },
    serverInfo: {
      vendor: "Kinective",
      product: "Gateway Core",
      version: "4.2.1",
      environment: "production",
      dataClassification: "PII-HIGH",
      regulatoryScope: ["NCUA", "BSA/AML", "GLBA", "Reg E"],
      sla: "99.9%",
      supportedCores: ["Symitar", "DNA", "Corelation", "XP2", "Portico", "Keystone"]
    }
  }')")
echo ""

echo "  Registering tools on Kinective Gateway Core…"

post_tool "$MCP_KGC" \
  "get_member_profile" \
  "Retrieve the full member record from the Kinective Gateway including all personal data, account summary, address history, and risk flags. Requires member_id or ssn_last4+dob combo. Response includes all linked share, loan, and card accounts. This is the authoritative source of record for member PII." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": {
        "type": "string",
        "description": "Kinective member ID (format: MBR-YYYY-NNNNN)",
        "pattern": "^MBR-[0-9]{4}-[0-9]{5}$"
      },
      "include_accounts": {
        "type": "boolean",
        "description": "If true, include full account list with balances. Default: true.",
        "default": true
      },
      "include_address_history": {
        "type": "boolean",
        "description": "If true, include last 10 address changes with timestamps.",
        "default": false
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_KGC" \
  "validate_member_identity" \
  "Perform a CIP-compliant identity verification check using Kinective's identity scoring engine. Cross-references the member record against SSN, date-of-birth, and government ID. Returns a confidence score and any mismatch flags. Must be called before any address update to confirm the requestor has authenticated as the member of record." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "verification_factors"],
    "properties": {
      "member_id": {
        "type": "string",
        "description": "Kinective member ID",
        "pattern": "^MBR-[0-9]{4}-[0-9]{5}$"
      },
      "verification_factors": {
        "type": "object",
        "description": "At least two factors required for CIP compliance.",
        "properties": {
          "ssn_last4": { "type": "string", "minLength": 4, "maxLength": 4, "pattern": "^[0-9]{4}$" },
          "date_of_birth": { "type": "string", "format": "date", "description": "ISO 8601 date" },
          "account_number": { "type": "string" },
          "zip_code_on_file": { "type": "string", "pattern": "^[0-9]{5}$" }
        },
        "minProperties": 2
      },
      "channel": {
        "type": "string",
        "enum": ["digital_banking", "ivr", "branch", "agent_orchestrated"],
        "description": "Authentication channel for audit logging.",
        "default": "agent_orchestrated"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_KGC" \
  "lock_member_record" \
  "Acquire an optimistic write lock on the member record to prevent concurrent modification during a multi-step address update. Returns a lock_token valid for 120 seconds. All downstream system updates must complete within this window. If the lock expires, the agent must call rollback_address_update before retrying." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id", "operation_type", "trace_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "operation_type": {
        "type": "string",
        "enum": ["address_change", "name_change", "contact_update"],
        "description": "Type of write operation being initiated."
      },
      "trace_id": {
        "type": "string",
        "description": "Correlation ID from the originating COA form or workflow run."
      },
      "lock_timeout_seconds": {
        "type": "integer",
        "minimum": 30,
        "maximum": 300,
        "default": 120,
        "description": "Lock timeout in seconds. Default 120s. Max 300s."
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_KGC" \
  "update_member_address" \
  "Apply a USPS-validated address change to the member record in the Kinective Gateway. Requires a valid lock_token from lock_member_record and a usps_validation_id confirming address deliverability. Automatically replicates the change to all connected core systems (Symitar/DNA/Corelation etc.) via Kinective's sync layer. Creates an immutable change event in the audit log." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "lock_token", "usps_validation_id", "new_address"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "lock_token": {
        "type": "string",
        "description": "Lock token from lock_member_record. Must not be expired."
      },
      "usps_validation_id": {
        "type": "string",
        "description": "Validation reference from USPS CASS confirming address deliverability."
      },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string", "maxLength": 100 },
          "street2": { "type": "string", "maxLength": 50 },
          "city": { "type": "string", "maxLength": 60 },
          "state": { "type": "string", "minLength": 2, "maxLength": 2, "description": "USPS 2-letter state code" },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" },
          "zip4": { "type": "string", "pattern": "^[0-9]{4}$" },
          "address_type": { "type": "string", "enum": ["RESIDENTIAL", "COMMERCIAL", "PO_BOX"] }
        }
      },
      "effective_date": {
        "type": "string",
        "format": "date",
        "description": "Date address becomes effective. Defaults to today."
      },
      "previous_address_confirmation": {
        "type": "boolean",
        "description": "Set true when member confirmed previous address during authentication.",
        "default": false
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_KGC" \
  "unlock_member_record" \
  "Release the write lock on a member record after all downstream updates have completed successfully. Must be called at the end of every COA workflow — both on success and on rollback paths — to prevent lock starvation for other concurrent operations." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id", "lock_token"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "lock_token": { "type": "string" },
      "completion_status": {
        "type": "string",
        "enum": ["success", "partial_rollback", "full_rollback", "abandoned"],
        "description": "Outcome of the workflow run. Used for audit and alerting.",
        "default": "success"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_KGC" \
  "get_member_change_history" \
  "Retrieve the immutable change audit trail for a member record, scoped to address or contact changes. Each entry includes the actor (agent ID or staff ID), channel, previous and new values, USPS validation reference, and downstream system propagation status. Required for NCUA exam readiness and BSA/AML audit responses." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "change_type": {
        "type": "string",
        "enum": ["address", "phone", "email", "all"],
        "default": "address"
      },
      "from_date": { "type": "string", "format": "date" },
      "to_date": { "type": "string", "format": "date" },
      "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 10 }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_KGC" \
  "rollback_address_update" \
  "Atomically roll back a partially-completed address change across all Kinective-connected systems. Restores the previous address in the member record and emits a ROLLBACK event to all downstream MCP connectors that received a successful update in the current trace_id. Idempotent — safe to call multiple times with the same trace_id." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "trace_id", "rollback_reason"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "trace_id": {
        "type": "string",
        "description": "The trace_id of the failed COA workflow run."
      },
      "rollback_reason": {
        "type": "string",
        "enum": [
          "downstream_system_failure",
          "usps_validation_rejected",
          "fraud_flag_raised",
          "member_cancelled",
          "lock_timeout",
          "bsa_hold_placed"
        ]
      },
      "failed_system": {
        "type": "string",
        "description": "The downstream system that caused the rollback trigger."
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2 — KINECTIVE SIGNPLUS
# Kinective's e-signature and forms platform used for member-facing COA,
# membership agreements, beneficiary changes, and loan documents.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 2: Kinective SignPlus MCP Server"
MCP_SIGNPLUS=$(find_or_create_mcp "Kinective SignPlus" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/signplus" \
  '{
    name: "Kinective SignPlus",
    description: "Kinective'\''s ESIGN Act-compliant electronic signature and member forms platform. Handles COA form generation, member e-signature capture, document archival, and signature integrity verification. Integrated with Kinective Gateway Core for authenticated form pre-fill.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "MEDIUM",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "Kinective",
      product: "SignPlus",
      version: "3.1.4",
      environment: "production",
      compliance: ["ESIGN Act", "UETA", "NCUA Part 748"],
      signatureStandard: "PKCS#7 / CAdES",
      retentionPolicy: "7 years"
    }
  }')")
echo ""

echo "  Registering tools on Kinective SignPlus…"

post_tool "$MCP_SIGNPLUS" \
  "get_form_data" \
  "Retrieve the completed Change of Address form including all member-entered fields, signature metadata, IP address, device fingerprint, and timestamp of signing. The form payload is the authoritative source for the new address and is used to trigger downstream system updates. Returns base64-encoded PDF for archival." \
  "low" \
  '{
    "type": "object",
    "required": ["form_id"],
    "properties": {
      "form_id": {
        "type": "string",
        "description": "SignPlus form packet ID (format: COA-YYYY-NNNNN)",
        "pattern": "^COA-[0-9]{4}-[0-9]{5}$"
      },
      "include_pdf": {
        "type": "boolean",
        "description": "Include base64-encoded signed PDF. Default: false (metadata only).",
        "default": false
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SIGNPLUS" \
  "get_signing_status" \
  "Check the current e-signature status of a COA form packet. Returns one of: PENDING_SIGNATURE, SIGNED, VOID, EXPIRED, or ARCHIVED. Use to confirm the form has a valid member signature before initiating any address updates. A form in PENDING_SIGNATURE or EXPIRED state must not be processed." \
  "low" \
  '{
    "type": "object",
    "required": ["form_id"],
    "properties": {
      "form_id": { "type": "string", "pattern": "^COA-[0-9]{4}-[0-9]{5}$" }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SIGNPLUS" \
  "verify_signature_integrity" \
  "Perform a cryptographic integrity check on the signed COA document using the stored PKCS#7 signature. Confirms the document has not been tampered with since signing. Must be called before processing any COA form received via webhook — spoofed or tampered webhooks will fail this check. Returns: valid|invalid|certificate_expired." \
  "high" \
  '{
    "type": "object",
    "required": ["form_id", "webhook_event_id"],
    "properties": {
      "form_id": { "type": "string", "pattern": "^COA-[0-9]{4}-[0-9]{5}$" },
      "webhook_event_id": {
        "type": "string",
        "description": "The event_id from the incoming webhook payload for cross-reference."
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SIGNPLUS" \
  "archive_signed_document" \
  "Move the signed COA form to the long-term document archive with a 7-year NCUA Part 748 retention policy applied. Generates an archival receipt with a content hash (SHA-256) for tamper detection. After archival the form can still be retrieved but cannot be modified or voided." \
  "medium" \
  '{
    "type": "object",
    "required": ["form_id", "member_id", "coa_confirmation_id"],
    "properties": {
      "form_id": { "type": "string", "pattern": "^COA-[0-9]{4}-[0-9]{5}$" },
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "coa_confirmation_id": {
        "type": "string",
        "description": "The confirmed COA transaction ID for cross-linking in the archive index."
      },
      "retention_policy": {
        "type": "string",
        "enum": ["NCUA_7Y", "BSA_5Y", "CUSTOM"],
        "default": "NCUA_7Y"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SIGNPLUS" \
  "void_form_packet" \
  "Void a COA form packet that should not be processed — for example, when USPS validation fails and the address cannot be confirmed, or when a fraud flag is raised. A voided form cannot be used to trigger address updates. Member is notified via their digital banking channel with instructions to resubmit." \
  "high" \
  '{
    "type": "object",
    "required": ["form_id", "void_reason"],
    "properties": {
      "form_id": { "type": "string", "pattern": "^COA-[0-9]{4}-[0-9]{5}$" },
      "void_reason": {
        "type": "string",
        "enum": [
          "usps_validation_failed",
          "fraud_flag_raised",
          "duplicate_submission",
          "member_requested_cancellation",
          "identity_verification_failed",
          "bsa_hold"
        ]
      },
      "notify_member": {
        "type": "boolean",
        "description": "Send member notification via digital banking. Default: true.",
        "default": true
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SIGNPLUS" \
  "get_form_audit_trail" \
  "Retrieve the complete immutable audit trail for a COA form packet including creation, member view events, signature capture, any void or archive actions, and all API access events. Required for regulatory examination and member dispute resolution. Entries are hash-chained and timestamped with nanosecond precision." \
  "low" \
  '{
    "type": "object",
    "required": ["form_id"],
    "properties": {
      "form_id": { "type": "string", "pattern": "^COA-[0-9]{4}-[0-9]{5}$" }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3 — USPS ADDRESS VALIDATION (CASS)
# USPS Coding Accuracy Support System — the definitive US address authority.
# Must be called before any address update is applied to any downstream system.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 3: USPS Address Validation (CASS) MCP Server"
MCP_USPS=$(find_or_create_mcp "USPS Address Validation (CASS)" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/usps" \
  '{
    name: "USPS Address Validation (CASS)",
    description: "USPS Coding Accuracy Support System (CASS) certified address validation and standardization. Provides deliverability scoring, ZIP+4 assignment, address type classification (residential/commercial/PO Box), and LACS Link for rural route conversions. Every COA must pass CASS before downstream propagation — rejected or undeliverable addresses are blocked and returned to the member for correction.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "LOW",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "USPS",
      product: "Address Information APIs",
      version: "v3",
      environment: "production",
      certifications: ["CASS Certified", "LACS Link", "SuiteLink", "DPV"],
      rateLimit: "5000 req/day on standard plan",
      latencySla: "<200ms p99"
    }
  }')")
echo ""

echo "  Registering tools on USPS CASS…"

post_tool "$MCP_USPS" \
  "validate_address" \
  "Submit an address for USPS CASS certification. Returns a standardized USPS address with ZIP+4, deliverability verdict, vacancy flag, and a validation_id that must be passed to Kinective Gateway update_member_address. An address that returns DPV_MATCH_CODE of 'S' (secondary number missing) or 'D' (not matched) must not be processed — return to member for correction." \
  "low" \
  '{
    "type": "object",
    "required": ["address"],
    "properties": {
      "address": {
        "type": "object",
        "required": ["street1", "city", "state"],
        "properties": {
          "street1": { "type": "string", "maxLength": 100 },
          "street2": { "type": "string", "maxLength": 50 },
          "city": { "type": "string", "maxLength": 60 },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" }
        }
      },
      "return_standardized": {
        "type": "boolean",
        "description": "Return USPS-standardized address in response. Default: true.",
        "default": true
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_USPS" \
  "check_deliverability" \
  "Check whether an address is actively receiving USPS mail delivery and is not flagged as vacant, seasonal, or business-only. Returns a deliverability_score (0–100) and a list of any flags. A score below 70 should trigger human review before address is applied." \
  "low" \
  '{
    "type": "object",
    "required": ["usps_validation_id"],
    "properties": {
      "usps_validation_id": {
        "type": "string",
        "description": "Validation reference from a prior validate_address call."
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_USPS" \
  "get_address_type" \
  "Classify the validated address as RESIDENTIAL, COMMERCIAL, or PO_BOX. Credit unions typically restrict certain account types from PO Box addresses — this classification is used by the COA agent to determine if a secondary address policy check is required." \
  "low" \
  '{
    "type": "object",
    "required": ["usps_validation_id"],
    "properties": {
      "usps_validation_id": { "type": "string" }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4 — ALKAMI DIGITAL BANKING PLATFORM
# Industry-leading digital banking platform serving 250+ credit unions.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 4: Alkami Digital Banking Platform MCP Server"
MCP_ALKAMI=$(find_or_create_mcp "Alkami Digital Banking Platform" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/alkami" \
  '{
    name: "Alkami Digital Banking Platform",
    description: "Alkami Technology'\''s cloud-native digital banking platform connector. Manages member-facing digital banking profile synchronization, address updates in the online banking experience, in-app push notifications, and secure member messaging. Address changes applied here ensure the member sees their new address immediately on next login — preventing a disjointed experience where the core shows the new address but digital banking still shows the old one.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "MEDIUM",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "Alkami Technology",
      product: "Digital Banking Platform",
      version: "2024.2",
      environment: "production",
      dataResidency: "US",
      authMethod: "OAuth 2.0 client_credentials",
      webhookSupport: true
    }
  }')")
echo ""

echo "  Registering tools on Alkami Digital Banking…"

post_tool "$MCP_ALKAMI" \
  "get_member_digital_profile" \
  "Retrieve the member's Alkami digital banking profile including login email, notification preferences, connected devices, and the address currently displayed in the digital banking UI. Use this to confirm the address held in Alkami before applying an update and to detect any existing discrepancy with the core." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "include_device_list": {
        "type": "boolean",
        "description": "Include registered devices. Used to target push notification.",
        "default": false
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ALKAMI" \
  "update_digital_address" \
  "Sync the member address in the Alkami digital banking profile with the new USPS-validated address. This updates all address display fields across web and mobile banking. Must be called after Kinective Gateway update_member_address to maintain consistency. Triggers an automatic profile cache invalidation." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id", "new_address", "coa_trace_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" },
          "zip4": { "type": "string", "pattern": "^[0-9]{4}$" }
        }
      },
      "coa_trace_id": {
        "type": "string",
        "description": "COA workflow trace ID for audit correlation."
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ALKAMI" \
  "send_in_app_notification" \
  "Deliver a push notification to all registered devices for the member confirming the address change. Notification is logged in the member activity feed with a read receipt. If the member has no registered devices, falls back to secure messaging. Character limit: 180 chars for title+body combined." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id", "notification_type", "message_body"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "notification_type": {
        "type": "string",
        "enum": ["address_change_confirmed", "address_change_pending_review", "address_change_failed"],
        "description": "Template-driven notification type."
      },
      "message_body": {
        "type": "string",
        "maxLength": 160,
        "description": "Notification body text. Keep concise for mobile push."
      },
      "deep_link": {
        "type": "string",
        "description": "Optional deep link URL to navigate member to relevant screen.",
        "format": "uri"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ALKAMI" \
  "send_secure_message" \
  "Send a secure in-app message to the member's Alkami message centre providing full details of the address change, what systems were updated, and a confirmation reference number. Unlike push notifications, secure messages are stored permanently in the member's message history and require login to view — appropriate for confirmation of PII changes." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id", "subject", "body", "confirmation_reference"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "subject": { "type": "string", "maxLength": 100 },
      "body": { "type": "string", "maxLength": 2000 },
      "confirmation_reference": {
        "type": "string",
        "description": "COA confirmation number to display in the message."
      },
      "category": {
        "type": "string",
        "enum": ["account_services", "alerts", "compliance"],
        "default": "account_services"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ALKAMI" \
  "invalidate_member_cache" \
  "Force invalidate the Alkami profile cache for the member to ensure all subsequent logins fetch fresh data from the authoritative core. Without this call, a member who logs in immediately after a COA may see stale address data for up to 15 minutes (Alkami default TTL)." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "cache_scope": {
        "type": "string",
        "enum": ["profile", "accounts", "all"],
        "description": "Which cache segments to invalidate.",
        "default": "all"
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5 — DOXIM DOCUMENT SERVICES
# Statement and member communication platform used by 600+ credit unions.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 5: Doxim Document Services MCP Server"
MCP_DOXIM=$(find_or_create_mcp "Doxim Document Services" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/doxim" \
  '{
    name: "Doxim Document Services",
    description: "Doxim'\''s omni-channel member communications and statement delivery platform. Manages paper statement addresses, e-statement enrollment, and confirmation letter generation for address changes. Updating the address here ensures the member'\''s next physical statement goes to the right address. The COA agent pauses upcoming statement jobs if the change occurs within 3 business days of a scheduled statement run.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "MEDIUM",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "Doxim",
      product: "Omni-Channel Communications",
      version: "8.3",
      environment: "production",
      deliveryChannels: ["paper_mail", "email", "secure_digital"],
      ncuaCompliant: true
    }
  }')")
echo ""

echo "  Registering tools on Doxim Document Services…"

post_tool "$MCP_DOXIM" \
  "get_statement_delivery_preferences" \
  "Retrieve the member's current statement delivery configuration including delivery method (paper/e-statement/both), mailing address on file in Doxim, email address for e-statements, and the next scheduled statement date. Used before update to detect discrepancies between Doxim address and core address." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "account_types": {
        "type": "array",
        "items": { "type": "string", "enum": ["share", "loan", "credit_card", "all"] },
        "description": "Filter by account type. Default: all.",
        "default": ["all"]
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_DOXIM" \
  "update_statement_address" \
  "Apply the new USPS-validated address to the Doxim statement delivery profile for all account types. If the next statement run is within 3 business days, the agent automatically calls pause_statement_delivery first to prevent a statement printing to the old address." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id", "new_address"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" },
          "zip4": { "type": "string" }
        }
      },
      "account_scope": {
        "type": "string",
        "enum": ["all", "share_only", "loan_only"],
        "default": "all"
      },
      "apply_to_paper_only": {
        "type": "boolean",
        "description": "If true, only update paper statement address (not e-statement email).",
        "default": false
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_DOXIM" \
  "pause_statement_delivery" \
  "Temporarily hold the next scheduled statement delivery for the member while an address change is being processed. Prevents a statement printing to an in-transition address. The hold expires automatically after 5 business days if not explicitly released." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id", "hold_reason"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "hold_reason": {
        "type": "string",
        "enum": ["address_change_in_progress", "member_request", "compliance_hold"]
      },
      "max_hold_business_days": {
        "type": "integer",
        "minimum": 1,
        "maximum": 10,
        "default": 5
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_DOXIM" \
  "resume_statement_delivery" \
  "Release a previously placed statement hold after the address change has been confirmed across all downstream systems. If the paused statement run has already passed its scheduled date, Doxim will reschedule it for the next available print slot." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "generate_confirmation_letter": {
        "type": "boolean",
        "description": "If true, generate and mail an address change confirmation letter with this resumed run.",
        "default": true
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_DOXIM" \
  "trigger_confirmation_letter" \
  "Generate and queue for immediate delivery a physical address change confirmation letter to the member's NEW address. Confirmation letters serve as both a courtesy notice and a fraud detection mechanism — if the member did not request the change, receiving this letter at the old address (via USPS forwarding) gives them an alert." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id", "new_address", "confirmation_reference"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" }
        }
      },
      "confirmation_reference": { "type": "string" },
      "letter_template": {
        "type": "string",
        "enum": ["coa_confirmation_standard", "coa_confirmation_bilingual_es", "coa_confirmation_accessible"],
        "default": "coa_confirmation_standard"
      },
      "also_send_to_old_address": {
        "type": "boolean",
        "description": "Also mail a courtesy notice to the previous address. Recommended for fraud prevention.",
        "default": true
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 6 — PSCU CARD SERVICES
# PSCU is the largest credit union service organization for card payment services.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 6: PSCU Card Services MCP Server"
MCP_PSCU=$(find_or_create_mcp "PSCU Card Services" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/pscu" \
  '{
    name: "PSCU Card Services",
    description: "PSCU Member Processing card management connector for credit union debit and credit card portfolios. Handles billing address and statement address updates, card-in-transit detection, and reissue requests triggered by address changes. An address mismatch between PSCU and the core can cause AVS failures at point of sale — keeping these in sync is critical for member experience.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "HIGH",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "PSCU",
      product: "Member Processing",
      version: "R24.3",
      environment: "production",
      pciScope: "PCI DSS Level 1",
      avsSupported: true,
      networkConnections: ["Visa", "Mastercard", "STAR", "CU24"]
    }
  }')")
echo ""

echo "  Registering tools on PSCU Card Services…"

post_tool "$MCP_PSCU" \
  "get_card_accounts" \
  "List all debit and credit card accounts for the member including card number (last 4), card type, current billing address, delivery address on file, activation status, and expiry. Use before update to detect any cards currently in transit that would need reissuance." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "card_types": {
        "type": "array",
        "items": { "type": "string", "enum": ["debit", "credit", "prepaid", "hsa"] },
        "description": "Filter by card type. Default: all.",
        "default": ["debit", "credit"]
      },
      "include_inactive": {
        "type": "boolean",
        "description": "Include inactive/cancelled cards. Default: false.",
        "default": false
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_PSCU" \
  "update_card_address" \
  "Update the billing and statement address for all active card accounts for the member. The new address is immediately propagated to Visa/Mastercard for AVS verification updates. If a card is currently in-transit (ordered but not yet received), the PSCU system will flag it for potential reissuance to the new address." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "new_address"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" },
          "zip4": { "type": "string" }
        }
      },
      "card_scope": {
        "type": "string",
        "enum": ["all_active", "debit_only", "credit_only", "specific_cards"],
        "default": "all_active"
      },
      "specific_card_ids": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Required only when card_scope is specific_cards."
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_PSCU" \
  "check_card_in_transit" \
  "Check whether any card for the member is currently in the fulfillment/delivery pipeline (ordered, printed, or shipped but not yet confirmed delivered). If a card is in transit to the old address, the agent must evaluate whether to cancel the in-transit order and reissue to the new address." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_PSCU" \
  "request_card_reissue" \
  "Cancel an in-transit card delivery and reissue the card to the member'\''s new address. Triggered when check_card_in_transit returns an active fulfillment record and the address change has been confirmed. The reissued card retains the same card number (PAN) and expiry but generates a new CVV." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "card_id", "new_address", "reissue_reason"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "card_id": { "type": "string" },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" }
        }
      },
      "reissue_reason": {
        "type": "string",
        "enum": ["address_change_in_transit", "member_request", "fraud_prevention"]
      },
      "rush_delivery": {
        "type": "boolean",
        "description": "Request rush (2-day) delivery. May incur fee per credit union policy.",
        "default": false
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 7 — NICE ACTIMIZE SAM (BSA/AML COMPLIANCE)
# Industry standard for financial crime, compliance, and BSA/AML monitoring.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 7: NICE Actimize SAM (BSA/AML) MCP Server"
MCP_ACTIMIZE=$(find_or_create_mcp "NICE Actimize SAM (BSA/AML)" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/actimize" \
  '{
    name: "NICE Actimize SAM (BSA/AML)",
    description: "NICE Actimize Suspicious Activity Monitoring (SAM) connector for BSA/AML compliance. Every address change must be screened against OFAC/SDN watchlists and assessed for velocity anomalies (multiple address changes in a short window is a known money-mule indicator). All events are logged for FinCEN reporting readiness. SAR referrals are queued for BSA officer review within 24 hours. NCUA and FinCEN exam-ready audit trail generated automatically.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "HIGH",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "NICE Actimize",
      product: "Suspicious Activity Monitoring (SAM)",
      version: "11.2",
      environment: "production",
      regulatoryFrameworks: ["BSA", "FinCEN", "OFAC", "NCUA Part 748"],
      sarWorkflow: "integrated",
      watchlistSources: ["OFAC SDN", "FinCEN 314a", "EU Consolidated", "UN Security Council"],
      auditRetention: "5 years"
    }
  }')")
echo ""

echo "  Registering tools on NICE Actimize SAM…"

post_tool "$MCP_ACTIMIZE" \
  "screen_address_against_watchlists" \
  "Screen the new address against all active watchlists including OFAC SDN, FinCEN 314(a) shared information requests, EU Consolidated List, and UN Security Council sanctions. Returns a match_score and any positive hits. A score above 0.85 must trigger a BSA officer review hold before the address change proceeds. A definitive OFAC hit (score > 0.95) must block the change and file a SAR referral." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "new_address", "member_name"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "member_name": {
        "type": "object",
        "required": ["first_name", "last_name"],
        "properties": {
          "first_name": { "type": "string" },
          "middle_name": { "type": "string" },
          "last_name": { "type": "string" }
        }
      },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" }
        }
      },
      "watchlists": {
        "type": "array",
        "items": { "type": "string", "enum": ["ofac_sdn", "fincen_314a", "eu_consolidated", "un_security_council", "all"] },
        "default": ["all"]
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ACTIMIZE" \
  "run_velocity_check" \
  "Check how many address changes the member has initiated in the past 30, 90, and 365 days. Rapid address cycling (3+ changes in 90 days) is a red flag for money mule activity and must trigger an enhanced due diligence review. Returns a velocity_risk_level: LOW / ELEVATED / HIGH / CRITICAL." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "lookback_windows": {
        "type": "array",
        "items": { "type": "integer", "enum": [30, 90, 180, 365] },
        "description": "Lookback windows in days to evaluate.",
        "default": [30, 90, 365]
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ACTIMIZE" \
  "log_bsa_event" \
  "Create an immutable BSA compliance event record for the address change. Required for every COA regardless of risk level — FinCEN and NCUA examiners expect a complete, unbroken event log for all member data changes. Events are hash-chained for tamper evidence. Returns a bsa_event_id that must be stored in the COA workflow audit record." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "event_type", "trace_id", "new_address", "previous_address"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "event_type": {
        "type": "string",
        "enum": ["address_change_initiated", "address_change_completed", "address_change_blocked", "address_change_reversed"]
      },
      "trace_id": { "type": "string" },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string" },
          "zip5": { "type": "string" }
        }
      },
      "previous_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string" },
          "zip5": { "type": "string" }
        }
      },
      "risk_indicators": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Any risk flags identified during screening (e.g. 'velocity_elevated', 'ofac_partial_match')."
      },
      "agent_id": {
        "type": "string",
        "description": "ASTRA Agents agent ID that executed the COA workflow."
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ACTIMIZE" \
  "create_sar_referral" \
  "Create a Suspicious Activity Report (SAR) referral for BSA officer review when an OFAC hit, high velocity score, or other significant risk indicator is detected. The referral is queued with a 24-hour response SLA. The address change is automatically placed on hold until the BSA officer clears, escalates, or files the SAR with FinCEN. Generates a referral_id for tracking." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "referral_reason", "trace_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "referral_reason": {
        "type": "string",
        "enum": [
          "ofac_positive_hit",
          "ofac_possible_match",
          "velocity_critical",
          "velocity_high_combined_with_large_transactions",
          "fincen_314a_match",
          "geographic_risk_elevated"
        ]
      },
      "trace_id": { "type": "string" },
      "supporting_evidence": {
        "type": "object",
        "description": "Evidence object from screening tools to attach to the referral.",
        "properties": {
          "watchlist_match_score": { "type": "number" },
          "velocity_risk_level": { "type": "string" },
          "change_count_90d": { "type": "integer" },
          "matched_list": { "type": "string" }
        }
      },
      "priority": {
        "type": "string",
        "enum": ["routine_24h", "elevated_4h", "critical_immediate"],
        "default": "routine_24h"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ACTIMIZE" \
  "create_compliance_record" \
  "Persist a completed COA compliance record in Actimize including the full audit chain, USPS validation reference, BSA event ID, watchlist screening results, and velocity check outcome. This record is the primary evidence artifact for NCUA examination and FinCEN inquiry responses. Retention: 5 years per BSA requirements." \
  "high" \
  '{
    "type": "object",
    "required": ["member_id", "trace_id", "bsa_event_id", "outcome"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "trace_id": { "type": "string" },
      "bsa_event_id": { "type": "string" },
      "outcome": {
        "type": "string",
        "enum": ["completed_clear", "completed_with_flags", "blocked_bsa_hold", "blocked_ofac", "reversed"]
      },
      "watchlist_result": {
        "type": "object",
        "properties": {
          "screened_lists": { "type": "array", "items": { "type": "string" } },
          "match_score": { "type": "number" },
          "positive_hits": { "type": "array", "items": { "type": "string" } }
        }
      },
      "velocity_result": {
        "type": "object",
        "properties": {
          "risk_level": { "type": "string" },
          "changes_30d": { "type": "integer" },
          "changes_90d": { "type": "integer" }
        }
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 8 — JACK HENRY SYMITAR
# The leading core banking system for credit unions in the US.
# Used as the alternative core connector slot in the COA Blueprint template.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 8: Jack Henry Symitar Core MCP Server"
MCP_SYMITAR=$(find_or_create_mcp "Jack Henry Symitar Core" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/symitar" \
  '{
    name: "Jack Henry Symitar Core",
    description: "Jack Henry Symitar core banking connector for credit unions running the Symitar Episys platform. Provides direct member record access, address mutation, account enumeration, and member notes. Symitar is used by over 700 credit unions — this connector is the drop-in replacement for Kinective Gateway Core in the COA Blueprint for Symitar-native deployments that do not yet use the Kinective middleware layer.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "HIGH",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "Jack Henry & Associates",
      product: "Symitar Episys",
      version: "2024.1",
      environment: "production",
      apiProtocol: "Symitar API (SOAP/REST bridge)",
      dataClassification: "PII-HIGH",
      regulatoryScope: ["NCUA", "BSA/AML", "GLBA"],
      deploymentModel: "on-premise or hosted"
    }
  }')")
echo ""

echo "  Registering tools on Jack Henry Symitar…"

post_tool "$MCP_SYMITAR" \
  "get_member_record" \
  "Retrieve the full member (Person record) from Symitar Episys including name, tax ID, date of birth, all addresses (mailing, physical, seasonal), and linked account IDs for shares and loans. Returns raw Symitar field names with a normalized alias layer for portability across the COA Blueprint." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_number"],
    "properties": {
      "member_number": {
        "type": "string",
        "description": "Symitar member number (numeric, up to 10 digits).",
        "pattern": "^[0-9]{1,10}$"
      },
      "include_accounts": { "type": "boolean", "default": true },
      "address_types": {
        "type": "array",
        "items": { "type": "string", "enum": ["mailing", "physical", "seasonal", "all"] },
        "default": ["all"]
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SYMITAR" \
  "update_member_address" \
  "Write the new USPS-validated address to the Symitar Episys member record. Supports mailing address (used for statements, card delivery) and physical address separately. Writes through the Symitar API change-tracking layer so the change appears in Symitar audit history with the agent ID as the operator. Triggers Symitar'\''s built-in cross-member-number duplicate address detection." \
  "high" \
  '{
    "type": "object",
    "required": ["member_number", "address_type", "new_address"],
    "properties": {
      "member_number": { "type": "string", "pattern": "^[0-9]{1,10}$" },
      "address_type": {
        "type": "string",
        "enum": ["mailing", "physical", "both"],
        "description": "Which address field(s) to update. COA typically updates both.",
        "default": "both"
      },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string", "maxLength": 40, "description": "Symitar Address1 field — max 40 chars." },
          "street2": { "type": "string", "maxLength": 40, "description": "Symitar Address2 field — max 40 chars." },
          "city": { "type": "string", "maxLength": 20, "description": "Symitar City field — max 20 chars." },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" },
          "zip4": { "type": "string", "pattern": "^[0-9]{4}$" }
        }
      },
      "operator_id": {
        "type": "string",
        "description": "Symitar operator ID to log against the change. Use the COA agent'\''s system user ID.",
        "default": "ASTRA-COA-AGT"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SYMITAR" \
  "get_share_accounts" \
  "List all share (savings and checking) accounts for the member with current balances, account type codes, dividend rate, and the address associated with each account'\''s statement delivery. Used to confirm account scope before downstream system updates." \
  "low" \
  '{
    "type": "object",
    "required": ["member_number"],
    "properties": {
      "member_number": { "type": "string", "pattern": "^[0-9]{1,10}$" },
      "include_closed": { "type": "boolean", "default": false }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SYMITAR" \
  "get_loan_accounts" \
  "List all loan accounts for the member with outstanding balance, interest rate, next payment date, and current correspondence address. Critical for ensuring loan statements and escrow correspondence use the updated address." \
  "low" \
  '{
    "type": "object",
    "required": ["member_number"],
    "properties": {
      "member_number": { "type": "string", "pattern": "^[0-9]{1,10}$" },
      "loan_types": {
        "type": "array",
        "items": { "type": "string", "enum": ["consumer", "real_estate", "heloc", "auto", "business", "all"] },
        "default": ["all"]
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SYMITAR" \
  "create_member_note" \
  "Create a Symitar member note (Tracker record) documenting the address change event including the agent ID, trace ID, previous address, and new address. Member notes are visible to branch staff and contact center agents — ensuring they see a clear audit trail if a member calls to inquire about the change." \
  "low" \
  '{
    "type": "object",
    "required": ["member_number", "note_text", "note_type"],
    "properties": {
      "member_number": { "type": "string", "pattern": "^[0-9]{1,10}$" },
      "note_type": {
        "type": "string",
        "enum": ["coa_automated", "coa_staff_review", "coa_rollback", "general"],
        "description": "Symitar tracker type code."
      },
      "note_text": {
        "type": "string",
        "maxLength": 2000,
        "description": "Free-text note content. Include trace ID, old address, new address, and agent ID."
      },
      "expiration_date": {
        "type": "string",
        "format": "date",
        "description": "Optional tracker expiration. If not set, note persists indefinitely."
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 9 — SALESFORCE FINANCIAL SERVICES CLOUD (CRM)
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 9: Salesforce Financial Services Cloud MCP Server"
MCP_SFSC=$(find_or_create_mcp "Salesforce Financial Services Cloud" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/sfsc" \
  '{
    name: "Salesforce Financial Services Cloud",
    description: "Salesforce Financial Services Cloud CRM connector. Maintains the 360° member view used by relationship managers, branch staff, and contact center. Address changes in the core that are not propagated to Salesforce cause CRM data to become stale — relationship managers may reference wrong addresses when corresponding with members. This connector also manages the service interaction log and can trigger Salesforce Flow automations for post-COA follow-up tasks.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "MEDIUM",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "Salesforce",
      product: "Financial Services Cloud",
      version: "Spring '\''24",
      environment: "production",
      authMethod: "OAuth 2.0 JWT Bearer",
      dataModel: "Person Account",
      householdsEnabled: true,
      flowVersion: "API v60.0"
    }
  }')")
echo ""

echo "  Registering tools on Salesforce FSC…"

post_tool "$MCP_SFSC" \
  "get_contact_record" \
  "Retrieve the Salesforce Financial Services Cloud Person Account record for the member including current mailing address, household relationships, relationship manager assignment, and any open service cases or pending tasks. Use to detect address discrepancy and confirm no open cases block the update." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "include_household": { "type": "boolean", "default": true },
      "include_open_cases": { "type": "boolean", "default": true }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SFSC" \
  "update_contact_address" \
  "Update the mailing address fields on the Salesforce Person Account record. Triggers a Salesforce Flow to notify the assigned relationship manager and update any linked Lead records. If the member belongs to a household, the household record is not automatically updated — call update_household_address separately if all household members share the same address." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id", "new_address"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "new_address": {
        "type": "object",
        "required": ["street", "city", "state", "postal_code", "country"],
        "properties": {
          "street": { "type": "string", "description": "Salesforce MailingStreet field." },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "postal_code": { "type": "string" },
          "country": { "type": "string", "default": "US" }
        }
      },
      "suppress_rm_notification": {
        "type": "boolean",
        "description": "Suppress relationship manager notification Flow. Use only for bulk migrations.",
        "default": false
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SFSC" \
  "create_service_interaction" \
  "Log the COA workflow as a Salesforce Activity (Task) on the member'\''s timeline. Visible to all credit union staff who access the member record in Salesforce. Include the trace ID, outcome, and systems updated so staff have full context if the member calls in about the change." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id", "interaction_type", "subject", "description"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "interaction_type": {
        "type": "string",
        "enum": ["address_change_completed", "address_change_failed", "address_change_pending_review"]
      },
      "subject": { "type": "string", "maxLength": 255 },
      "description": { "type": "string", "maxLength": 4000 },
      "trace_id": { "type": "string" },
      "status": {
        "type": "string",
        "enum": ["Completed", "In Progress", "Waiting on Member"],
        "default": "Completed"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_SFSC" \
  "update_household_address" \
  "Update the address on the Salesforce Household Account record. Only call this when confirmed (via member instruction or household policy) that all members of the household have moved to the same new address. Does not automatically cascade to linked individual Person Accounts — each must be updated via update_contact_address." \
  "medium" \
  '{
    "type": "object",
    "required": ["household_id", "new_address"],
    "properties": {
      "household_id": {
        "type": "string",
        "description": "Salesforce Household Account ID (18-char)."
      },
      "new_address": {
        "type": "object",
        "required": ["street", "city", "state", "postal_code"],
        "properties": {
          "street": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string" },
          "postal_code": { "type": "string" },
          "country": { "type": "string", "default": "US" }
        }
      },
      "member_id_trigger": {
        "type": "string",
        "description": "The member_id whose COA triggered the household update (for audit).",
        "pattern": "^MBR-[0-9]{4}-[0-9]{5}$"
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 10 — ENCOMPASS BY ICE MORTGAGE TECHNOLOGY
# Loan origination and servicing platform for mortgage and consumer loans.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 10: Encompass by ICE Mortgage Technology MCP Server"
MCP_ENCOMPASS=$(find_or_create_mcp "Encompass by ICE Mortgage" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/encompass" \
  '{
    name: "Encompass by ICE Mortgage",
    description: "ICE Mortgage Technology Encompass loan origination and servicing connector. Manages correspondence and escrow address updates for mortgage, HELOC, and consumer loan accounts. If a member has an active mortgage, the correspondence address must be updated in Encompass separately from the core — Encompass maintains its own address database for lender communications, escrow tax bills, and insurance notices. Mismatch between core and Encompass addresses causes missed payment notices and escrow shortfalls.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "HIGH",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "ICE Mortgage Technology",
      product: "Encompass",
      version: "24.2",
      environment: "production",
      authMethod: "OAuth 2.0 client_credentials",
      loanTypes: ["mortgage", "heloc", "consumer", "construction"],
      regulatoryScope: ["RESPA", "TILA", "HMDA", "CFPB Reg X"],
      escrowManagement: true
    }
  }')")
echo ""

echo "  Registering tools on Encompass…"

post_tool "$MCP_ENCOMPASS" \
  "get_loan_accounts" \
  "Retrieve all open loan files in Encompass for the member including loan type, outstanding principal, maturity date, property address (for mortgage), and current correspondence address. The property address (collateral) is different from the correspondence address — COA only updates the correspondence address unless the member is reporting a move from their mortgaged property." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "loan_types": {
        "type": "array",
        "items": { "type": "string", "enum": ["mortgage", "heloc", "consumer", "all"] },
        "default": ["all"]
      },
      "include_paid_off": { "type": "boolean", "default": false }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ENCOMPASS" \
  "update_loan_correspondence_address" \
  "Update the borrower correspondence (mailing) address for a specific loan in Encompass. This is the address used for payment coupon books, escrow analysis letters, modification offers, and ARM adjustment notices. Does NOT update the collateral property address — that requires a separate title and appraisal review process." \
  "high" \
  '{
    "type": "object",
    "required": ["loan_number", "new_address"],
    "properties": {
      "loan_number": {
        "type": "string",
        "description": "Encompass loan number."
      },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" },
          "zip4": { "type": "string" }
        }
      },
      "update_all_borrowers": {
        "type": "boolean",
        "description": "If true, update correspondence address for all co-borrowers on the loan.",
        "default": false
      },
      "coa_trace_id": { "type": "string" }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ENCOMPASS" \
  "check_escrow_account" \
  "Retrieve escrow account details for a mortgage loan including current balance, next disbursement date, and the tax authority and insurance company mailing addresses. If property tax or insurance correspondence goes to the old address, escrow disbursements may be misapplied. Flag for servicer review if escrow disbursement is within 30 days." \
  "medium" \
  '{
    "type": "object",
    "required": ["loan_number"],
    "properties": {
      "loan_number": { "type": "string" },
      "include_disbursement_schedule": { "type": "boolean", "default": true }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_ENCOMPASS" \
  "create_loan_note" \
  "Add a note to the Encompass loan conversation log documenting the address change with trace ID, previous address, new address, and timestamp. Loan notes are visible to all servicer staff and are included in any file review or audit." \
  "low" \
  '{
    "type": "object",
    "required": ["loan_number", "note_text"],
    "properties": {
      "loan_number": { "type": "string" },
      "note_text": { "type": "string", "maxLength": 2000 },
      "note_category": {
        "type": "string",
        "enum": ["borrower_information_update", "servicing_note", "compliance"],
        "default": "borrower_information_update"
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 11 — Q2 DIGITAL BANKING (ALTERNATIVE TO ALKAMI)
# Q2 is the second major digital banking platform for credit unions.
# Drop-in alternative connector slot for the COA Blueprint template.
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 11: Q2 Digital Banking Platform MCP Server"
MCP_Q2=$(find_or_create_mcp "Q2 Digital Banking Platform" "$(jq -n \
  --arg u "${BASE_URL}/api/mock/kinective/q2" \
  '{
    name: "Q2 Digital Banking Platform",
    description: "Q2 Holdings digital banking platform connector — the alternative digital banking slot in the COA Blueprint for credit unions on Q2 instead of Alkami. Q2 serves over 1,300 financial institutions. Provides the same address sync, push notification, and cache invalidation capabilities as the Alkami connector but against the Q2 admin APIs and Q2'\''s native notification system.",
    transportType: "streamable-http",
    url: $u,
    status: "active",
    riskTier: "MEDIUM",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "kinective-provisioner",
    capabilities: { tools: true, resources: false, prompts: false },
    serverInfo: {
      vendor: "Q2 Holdings",
      product: "Q2 Digital Banking",
      version: "2024.3",
      environment: "production",
      authMethod: "API Key + HMAC signature",
      notificationChannels: ["push", "email", "sms", "in-app"],
      dataResidency: "US"
    }
  }')")
echo ""

echo "  Registering tools on Q2 Digital Banking…"

post_tool "$MCP_Q2" \
  "get_member_digital_profile" \
  "Retrieve the Q2 digital banking profile for the member including currently enrolled email for e-banking alerts, mailing address stored in Q2 (may differ from core — Q2 maintains its own profile copy), enrolled notification channels, and mobile device registration status." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_Q2" \
  "update_member_address" \
  "Sync the new USPS-validated address into the Q2 digital banking member profile. Q2 does not auto-sync from the core — without this call the Q2 profile will show stale address data indefinitely. Address update triggers Q2'\''s internal profile change audit log and pushes an update event to any Q2 integrations (e.g. Q2 Marketplace apps)." \
  "medium" \
  '{
    "type": "object",
    "required": ["member_id", "new_address"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "new_address": {
        "type": "object",
        "required": ["street1", "city", "state", "zip5"],
        "properties": {
          "street1": { "type": "string" },
          "street2": { "type": "string" },
          "city": { "type": "string" },
          "state": { "type": "string", "minLength": 2, "maxLength": 2 },
          "zip5": { "type": "string", "pattern": "^[0-9]{5}$" }
        }
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_Q2" \
  "send_push_notification" \
  "Send a Q2 push notification to all registered mobile devices for the member. Q2 supports rich push with deep links — use this to navigate the member directly to their profile page after the COA to see the updated address reflected in real time." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id", "title", "body"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "title": { "type": "string", "maxLength": 60 },
      "body": { "type": "string", "maxLength": 160 },
      "deep_link_path": {
        "type": "string",
        "description": "Q2 deep link path (e.g. /profile/address).",
        "default": "/profile/address"
      },
      "notification_category": {
        "type": "string",
        "enum": ["account_update", "security_alert", "information"],
        "default": "account_update"
      }
    },
    "additionalProperties": false
  }'

post_tool "$MCP_Q2" \
  "log_member_event" \
  "Append an event to the Q2 member activity log for audit and analytics purposes. Q2 activity logs are available to credit union admins in the Q2 back office and feed into Q2 Catalyst analytics. Logging the COA event here creates a complete omni-channel audit trail across core, digital banking, and CRM." \
  "low" \
  '{
    "type": "object",
    "required": ["member_id", "event_type", "event_data"],
    "properties": {
      "member_id": { "type": "string", "pattern": "^MBR-[0-9]{4}-[0-9]{5}$" },
      "event_type": {
        "type": "string",
        "enum": ["address_change_confirmed", "address_change_failed", "address_change_initiated"]
      },
      "event_data": {
        "type": "object",
        "description": "Arbitrary key-value pairs added to the event payload.",
        "properties": {
          "trace_id": { "type": "string" },
          "confirmation_reference": { "type": "string" },
          "systems_updated": { "type": "integer" }
        }
      }
    },
    "additionalProperties": false
  }'

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 12 — AGENT TEMPLATE: Change of Address — Credit Union
# ═════════════════════════════════════════════════════════════════════════════
echo "STEP 12: Creating Agent Template — Change of Address (Credit Union)"

COA_TEMPLATE_ID=$(post_api "Agent Template: Change of Address — Credit Union" \
  "/api/agent-templates" \
  "$(jq -n \
    --arg kgc "$MCP_KGC" \
    --arg sp "$MCP_SIGNPLUS" \
    --arg usps "$MCP_USPS" \
    --arg alkami "$MCP_ALKAMI" \
    --arg doxim "$MCP_DOXIM" \
    --arg pscu "$MCP_PSCU" \
    --arg actimize "$MCP_ACTIMIZE" \
    --arg symitar "$MCP_SYMITAR" \
    --arg sfsc "$MCP_SFSC" \
    --arg encompass "$MCP_ENCOMPASS" \
    --arg q2 "$MCP_Q2" \
    '{
      name: "Change of Address — Credit Union",
      description: "Production-ready orchestration template for processing member Change of Address (COA) requests end-to-end across all downstream systems in a credit union. Triggered by a Kinective SignPlus webhook on form_signed event. Executes USPS CASS validation, BSA/AML watchlist screening, velocity check, and propagates the confirmed address to 11 downstream systems: core banking, digital banking, statement vendor, card management, loan origination, CRM, bill pay, fraud detection, and compliance logging. Includes automated rollback on partial failure. Compliant with NCUA, BSA/AML, Reg E, and GLBA requirements out of the box.\n\nMCP Connector Slots (configurable per credit union):\n• Core Banking: Kinective Gateway Core (default) | Jack Henry Symitar | FiServ DNA | Corelation | Portico\n• Digital Banking: Alkami (default) | Q2 Digital Banking\n• Statement/Docs: Doxim (default) | PrintMail | DocuSystems\n• Card Management: PSCU (default) | Visa DPS | FiServ Card Services\n• BSA/AML: NICE Actimize SAM (default) | Verafin | BAM+\n• CRM: Salesforce FSC (default) | Microsoft Dynamics | Temenos\n• Loan/Mortgage: Encompass by ICE (default) | Meridian Link | Temenos LMS",
      category: "operations",
      industry: "financial_services",
      tags: [
        "Change of Address",
        "COA",
        "Credit Union",
        "NCUA",
        "BSA/AML",
        "Multi-System Orchestration",
        "Core Banking",
        "Member Services",
        "Kinective",
        "Compliance",
        "Rollback"
      ],
      icon: "map",
      complexity: "high",
      modelProvider: "anthropic",
      modelName: "claude-opus-4-5",
      defaultRiskTier: "MEDIUM",
      defaultAutonomyMode: "assisted",
      estimatedTimeToProd: "2-4 days",
      complianceCertifications: ["BSA/AML", "NCUA Part 748", "Reg E", "GLBA", "FCRA", "ESIGN Act"],
      preloadedSkills: [
        { name: "Address Extraction", description: "Extract and normalize address fields from signed form payloads" },
        { name: "USPS CASS Validation", description: "Submit addresses to USPS CASS and interpret deliverability scores" },
        { name: "BSA Watchlist Screening", description: "Screen addresses and member names against OFAC, FinCEN 314a, and EU/UN lists" },
        { name: "Velocity Risk Assessment", description: "Evaluate address change frequency patterns against money-mule typologies" },
        { name: "System Orchestrator", description: "Coordinate sequential and parallel writes across all downstream connectors" },
        { name: "Rollback Handler", description: "Execute atomic rollback across all connectors that received a write in a given trace_id" },
        { name: "Compliance Logger", description: "Generate immutable BSA/AML event records and compliance receipts" },
        { name: "Notification Manager", description: "Dispatch member push notifications, secure messages, and confirmation letters" }
      ],
      requiredSkills: [
        { name: "Address Extraction" },
        { name: "USPS CASS Validation" },
        { name: "BSA Watchlist Screening" },
        { name: "System Orchestrator" },
        { name: "Rollback Handler" },
        { name: "Compliance Logger" }
      ],
      optionalSkills: [
        { name: "Velocity Risk Assessment" },
        { name: "Notification Manager" }
      ],
      toolsConfig: {
        mcp_connector_slots: {
          core_banking: {
            label: "Core Banking Connector",
            description: "Primary member record system. Handles address mutation and provides the member profile and account list.",
            required: true,
            default_server_id: $kgc,
            alternatives: ["Jack Henry Symitar Core", "FiServ DNA Core", "Corelation Keystone", "Portico"],
            key_tools: ["get_member_profile", "lock_member_record", "update_member_address", "unlock_member_record", "rollback_address_update"]
          },
          e_signature: {
            label: "E-Signature Platform",
            description: "Source of truth for the member-signed COA form. Provides form data, signature verification, and archival.",
            required: true,
            default_server_id: $sp,
            alternatives: ["DocuSign", "Adobe Sign", "OneSpan"],
            key_tools: ["get_form_data", "verify_signature_integrity", "archive_signed_document", "void_form_packet"]
          },
          address_validation: {
            label: "USPS Address Validation",
            description: "CASS-certified address validation. Must pass before any downstream system is updated.",
            required: true,
            default_server_id: $usps,
            alternatives: ["SmartyStreets", "Melissa Data", "USPS API v3"],
            key_tools: ["validate_address", "check_deliverability", "get_address_type"]
          },
          digital_banking: {
            label: "Digital Banking Platform",
            description: "Member-facing online and mobile banking. Address must be synced to prevent stale display.",
            required: true,
            default_server_id: $alkami,
            alternatives: ["Q2 Digital Banking Platform"],
            key_tools: ["update_digital_address", "send_in_app_notification", "invalidate_member_cache"]
          },
          statement_vendor: {
            label: "Statement & Document Delivery",
            description: "Physical statement and compliance letter delivery. COA holds any pending statement run and updates the delivery address.",
            required: true,
            default_server_id: $doxim,
            alternatives: ["PrintMail", "DocuSystems", "ODT"],
            key_tools: ["update_statement_address", "pause_statement_delivery", "trigger_confirmation_letter"]
          },
          card_management: {
            label: "Card Management",
            description: "Debit and credit card processor. AVS failures will occur if the card billing address is not updated.",
            required: true,
            default_server_id: $pscu,
            alternatives: ["Visa DPS", "FiServ Card Services", "PSCU Member Processing"],
            key_tools: ["update_card_address", "check_card_in_transit", "request_card_reissue"]
          },
          bsa_aml: {
            label: "BSA/AML Compliance",
            description: "Watchlist screening and compliance event logging. Required for every COA regardless of risk level.",
            required: true,
            default_server_id: $actimize,
            alternatives: ["Verafin", "BAM+", "FiServ AML Manager"],
            key_tools: ["screen_address_against_watchlists", "run_velocity_check", "log_bsa_event", "create_compliance_record"]
          },
          crm: {
            label: "CRM",
            description: "Member relationship management. Keeps the 360° member view current for branch and contact center staff.",
            required: false,
            default_server_id: $sfsc,
            alternatives: ["Microsoft Dynamics 365", "Temenos Infinity CRM"],
            key_tools: ["update_contact_address", "create_service_interaction"]
          },
          loan_origination: {
            label: "Loan Origination / Servicing",
            description: "Mortgage and loan servicing platform. Correspondence address for payment notices, escrow, and ARM adjustments.",
            required: false,
            default_server_id: $encompass,
            alternatives: ["MeridianLink", "Temenos LMS", "Jack Henry LoanVantage"],
            key_tools: ["get_loan_accounts", "update_loan_correspondence_address", "check_escrow_account"]
          }
        }
      },
      blueprintJson: {
        version: "1.0",
        patternType: "orchestrator",
        description: "COA orchestration blueprint — sequential with BSA gate and parallel downstream propagation",
        nodes: [
          { id: "n1", type: "tool_call", label: "Verify E-Signature Integrity",
            description: "Confirm the COA form has a valid, unaltered member signature before processing.",
            mcpTool: "verify_signature_integrity", riskGate: false },
          { id: "n2", type: "tool_call", label: "Retrieve Signed Form Data",
            description: "Extract member identity and new address from the signed COA form.",
            mcpTool: "get_form_data", riskGate: false },
          { id: "n3", type: "tool_call", label: "Validate Member Identity (CIP)",
            description: "Cross-reference form data against core member record using at least two identity factors.",
            mcpTool: "validate_member_identity", riskGate: true },
          { id: "n4", type: "tool_call", label: "USPS CASS Address Validation",
            description: "Validate and standardize the new address. Block if undeliverable.",
            mcpTool: "validate_address", riskGate: true },
          { id: "n5", type: "tool_call", label: "BSA Watchlist Screening",
            description: "Screen new address against OFAC SDN, FinCEN 314a, and EU/UN lists.",
            mcpTool: "screen_address_against_watchlists", riskGate: true },
          { id: "n6", type: "tool_call", label: "Velocity Risk Check",
            description: "Assess address change frequency. Escalate if velocity is CRITICAL.",
            mcpTool: "run_velocity_check", riskGate: true },
          { id: "n7", type: "human_review", label: "BSA Officer Review Gate",
            description: "Pause for BSA officer decision if any risk gate above returned HIGH or CRITICAL.",
            condition: "bsa_flag_raised" },
          { id: "n8", type: "tool_call", label: "Lock Member Record",
            description: "Acquire optimistic write lock on core member record before any mutations.",
            mcpTool: "lock_member_record", riskGate: false },
          { id: "n9", type: "tool_call", label: "Log BSA Event (Initiated)",
            description: "Create immutable BSA compliance event: address_change_initiated.",
            mcpTool: "log_bsa_event", riskGate: false },
          { id: "n10", type: "tool_call", label: "Update Core Banking Address",
            description: "Apply address change to core member record via Kinective Gateway.",
            mcpTool: "update_member_address", riskGate: false },
          { id: "n11", type: "tool_call", label: "Update Digital Banking Address",
            description: "Sync new address in Alkami/Q2 digital banking profile.",
            mcpTool: "update_digital_address", riskGate: false },
          { id: "n12", type: "tool_call", label: "Update Statement Delivery Address",
            description: "Apply new address to Doxim statement profile and trigger confirmation letter.",
            mcpTool: "update_statement_address", riskGate: false },
          { id: "n13", type: "tool_call", label: "Update Card Billing Address",
            description: "Propagate address to PSCU card management for all active card accounts.",
            mcpTool: "update_card_address", riskGate: false },
          { id: "n14", type: "tool_call", label: "Update CRM Contact Address",
            description: "Sync address to Salesforce FSC for 360° member view consistency.",
            mcpTool: "update_contact_address", riskGate: false },
          { id: "n15", type: "tool_call", label: "Update Loan Correspondence Address",
            description: "Update correspondence address in Encompass for all open mortgage and consumer loans.",
            mcpTool: "update_loan_correspondence_address", riskGate: false },
          { id: "n16", type: "tool_call", label: "Archive Signed COA Document",
            description: "Move signed form to 7-year NCUA Part 748 archive with SHA-256 hash.",
            mcpTool: "archive_signed_document", riskGate: false },
          { id: "n17", type: "tool_call", label: "Unlock Member Record",
            description: "Release the write lock on the core member record.",
            mcpTool: "unlock_member_record", riskGate: false },
          { id: "n18", type: "tool_call", label: "Log BSA Compliance Record",
            description: "Persist final compliance record with full audit chain, watchlist results, and outcome.",
            mcpTool: "create_compliance_record", riskGate: false },
          { id: "n19", type: "tool_call", label: "Send Member Notification",
            description: "Send in-app push notification and secure message confirming the address change.",
            mcpTool: "send_in_app_notification", riskGate: false },
          { id: "n20", type: "tool_call", label: "Trigger Confirmation Letter",
            description: "Queue physical confirmation letter to new address (and courtesy copy to old address).",
            mcpTool: "trigger_confirmation_letter", riskGate: false }
        ],
        edges: [
          { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" },
          { from: "n4", to: "n5" }, { from: "n5", to: "n6" }, { from: "n6", to: "n7" },
          { from: "n7", to: "n8" }, { from: "n8", to: "n9" }, { from: "n9", to: "n10" },
          { from: "n10", to: "n11" }, { from: "n10", to: "n12" }, { from: "n10", to: "n13" },
          { from: "n10", to: "n14" }, { from: "n10", to: "n15" },
          { from: "n11", to: "n16" }, { from: "n12", to: "n16" },
          { from: "n13", to: "n16" }, { from: "n14", to: "n16" }, { from: "n15", to: "n16" },
          { from: "n16", to: "n17" }, { from: "n17", to: "n18" },
          { from: "n18", to: "n19" }, { from: "n19", to: "n20" }
        ],
        rollbackPolicy: {
          trigger: "any_write_node_failure",
          strategy: "full_rollback",
          rollbackTool: "rollback_address_update",
          notify: ["bsa_officer", "member_services_supervisor"]
        },
        complianceCheckpoints: [
          { nodeId: "n3", requirement: "CIP identity verification before any mutation" },
          { nodeId: "n4", requirement: "USPS CASS validation required (NCUA guidance)" },
          { nodeId: "n5", requirement: "OFAC screening required (BSA 31 CFR 1010.520)" },
          { nodeId: "n9", requirement: "BSA event logged before first write mutation" },
          { nodeId: "n18", requirement: "Compliance record persisted before workflow close" }
        ]
      },
      policyBindings: {
        required_policies: [
          { name: "BSA/AML Address Change Policy", enforcement: "hard_block",
            description: "Blocks COA if OFAC hit score > 0.95 or velocity risk is CRITICAL" },
          { name: "USPS Validation Gate", enforcement: "hard_block",
            description: "Blocks COA if USPS returns DPV_MATCH_CODE S, D, or deliverability score < 50" },
          { name: "CIP Identity Verification", enforcement: "hard_block",
            description: "Blocks COA if identity confidence score < 0.80 (requires 2 matching factors)" },
          { name: "Lock Timeout Rollback", enforcement: "hard_block",
            description: "Triggers full rollback if the core member record lock expires before all writes complete" },
          { name: "Audit Trail Completeness", enforcement: "soft_warn",
            description: "Warns if any downstream system fails to return a confirmation ID" }
        ]
      },
      rollbackPlan: {
        strategy: "full_atomic_rollback",
        triggered_by: ["downstream_system_failure", "bsa_hold_placed", "lock_timeout"],
        rollback_sequence: [
          "unlock_member_record (if lock held)",
          "rollback_address_update (Kinective Gateway — reverses core and replicated cores)",
          "void_form_packet (SignPlus — prevents reprocessing of same form)",
          "log_bsa_event (type: address_change_reversed)",
          "send_in_app_notification (member alert: COA requires re-submission)"
        ],
        sla: "Full rollback completes within 30 seconds of trigger",
        monitoring_alert: "page_oncall_member_services"
      },
      costProfile: {
        api_calls_per_run: "~45-65 (happy path)",
        estimated_llm_tokens: "8000-12000 per run",
        estimated_cost_per_run_usd: "0.12-0.25",
        processing_time_sla: "< 90 seconds end-to-end (happy path)",
        monthly_volume_estimate: "50-5000 COAs depending on credit union size"
      }
    }')")

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════════════════
echo "=============================================================="
echo " ✅ PROVISIONING COMPLETE"
echo "=============================================================="
echo ""
echo " MCP Servers created:"
echo "   Core Banking (Primary):    Kinective Gateway Core        → $MCP_KGC"
echo "   E-Signature:               Kinective SignPlus             → $MCP_SIGNPLUS"
echo "   Address Validation:        USPS CASS API                 → $MCP_USPS"
echo "   Digital Banking (Primary): Alkami Digital Banking        → $MCP_ALKAMI"
echo "   Document Services:         Doxim Document Services       → $MCP_DOXIM"
echo "   Card Management:           PSCU Card Services            → $MCP_PSCU"
echo "   BSA/AML Compliance:        NICE Actimize SAM             → $MCP_ACTIMIZE"
echo "   Core Banking (Alt):        Jack Henry Symitar            → $MCP_SYMITAR"
echo "   CRM:                       Salesforce FSC                → $MCP_SFSC"
echo "   Loan Origination:          Encompass by ICE              → $MCP_ENCOMPASS"
echo "   Digital Banking (Alt):     Q2 Digital Banking            → $MCP_Q2"
echo ""
echo " Agent Template created:"
echo "   Change of Address — Credit Union                         → $COA_TEMPLATE_ID"
echo ""
echo " Next steps:"
echo "   1. Navigate to MCP Apps → find the 11 connectors above"
echo "   2. Navigate to Templates → find 'Change of Address — Credit Union'"
echo "   3. In the COA demo, the Kinective Gateway slot now shows"
echo "      production-grade tooling with full JSON schemas."
echo "   4. For a new credit union deployment, clone the COA Blueprint,"
echo "      swap the Core Banking slot (e.g. Symitar for non-Kinective CUs),"
echo "      and swap Digital Banking (Alkami ↔ Q2)."
echo "   5. Run: bash provision_kinective_fintech_connectors.sh again"
echo "      at any time — it is fully idempotent."
echo "=============================================================="
